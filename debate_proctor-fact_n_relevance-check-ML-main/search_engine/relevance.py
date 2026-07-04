import os
import numpy as np
import json
import sys
from sentence_transformers import SentenceTransformer
from google import genai
from google.genai import types

# Add parent directory to path to find config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()
GEMINI_API_KEY = os.getenv("API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("❌ API_KEY not found in .env file!")

# 1. Initialize Modern Gemini Client
client = genai.Client(api_key=GEMINI_API_KEY)
VERIFIER_MODEL = "gemini-3.1-flash-lite"

# 2. Initialize BAAI Local Embedding Model
print("📥 Loading BAAI/bge-small-en-v1.5 in Relevance Module...")
embedding_model = SentenceTransformer("BAAI/bge-small-en-v1.5")

def get_embedding(text):
    """Generates a single vector using the local BAAI model."""
    if not text:
        return np.zeros(384) # Updated from 768 to 384
        
    try:
        # Encode locally, returning a 384-dimensional array
        result = embedding_model.encode([text], normalize_embeddings=True)
        return result[0]
    except Exception as e:
        print(f"⚠️ Embedding Error in Relevance: {e}")
        return np.zeros(384)

def cosine_similarity(vec_a, vec_b):
    """Math helper for vector similarity."""
    dot_product = np.dot(vec_a, vec_b)
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)

def check_discourse_logic(current_text, previous_text):
    """
    Uses LLM to classify the logical relationship between two arguments.
    (Updated to the new google.genai SDK)
    """
    if not previous_text:
        return "OPENING_STATEMENT", 1.0, "This is the first statement in the context."

    prompt = f"""
    TASK: Analyze the debate logic between the PREVIOUS_ARGUMENT and the CURRENT_RESPONSE.

    PREVIOUS_ARGUMENT: "{previous_text}"
    CURRENT_RESPONSE: "{current_text}"

    INSTRUCTIONS:
    Classify the CURRENT_RESPONSE into exactly one category:
    1. DIRECT_COUNTER (Score 1.0): Directly refutes, challenges, or offers a counter-point.
    2. ELABORATION (Score 0.7): Agrees, expands, adds examples, or asks a relevant question.
    3. TANGENTIAL (Score 0.2): Mentions related keywords but ignores the specific point.
    4. IRRELEVANT (Score 0.0): Completely unrelated topic.

    OUTPUT JSON ONLY:
    {{
        "category": "DIRECT_COUNTER" | "ELABORATION" | "TANGENTIAL" | "IRRELEVANT",
        "reason": "<short explanation>"
    }}
    """

    try:
        response = client.models.generate_content(
            model=VERIFIER_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        data = json.loads(response.text)
        category = data.get("category", "TANGENTIAL")
        reason = data.get("reason", "No reason provided")
        
        weights = {
            "DIRECT_COUNTER": 1.0,
            "ELABORATION": 0.7,
            "TANGENTIAL": 0.2,
            "IRRELEVANT": 0.0
        }
        score = weights.get(category, 0.0)
        
        return category, score, reason

    except Exception as e:
        print(f"⚠️ Discourse Logic Error: {e}")
        return "ERROR", 0.0, "LLM failed to analyze logic."

def compute_relevance_score(current_text, previous_text, topic):
    """
    Main entry point for Relevance Engine.
    Combines Global Topic Similarity (30%) + Local Discourse Logic (70%).
    """
    print(f"🔗 RELEVANCE ENGINE: Analyzing '{current_text[:20]}...' against Topic '{topic}'")

    # 1. Global Topic Relevance (Vector Sim)
    vec_topic = get_embedding(topic)
    vec_current = get_embedding(current_text)
    topic_sim = cosine_similarity(vec_topic, vec_current)
    
    # 2. Local Discourse Logic (LLM Classifier)
    category, logic_score, reason = check_discourse_logic(current_text, previous_text)
    
    # 3. Topic-similarity floor
    TOPIC_SIM_FLOOR = 0.35
    if topic_sim < TOPIC_SIM_FLOOR and category in ("DIRECT_COUNTER", "ELABORATION"):
        attenuation = topic_sim / TOPIC_SIM_FLOOR
        logic_score = logic_score * attenuation
        reason = f"[topic floor applied; sim={topic_sim:.2f}<{TOPIC_SIM_FLOOR}] " + reason
    
    # 4. Weighted Aggregation
    final_score = (topic_sim * 0.3) + (logic_score * 0.7)
    
    return {
        "final_score": round(final_score * 100, 2), # 0-100
        "topic_similarity": round(topic_sim, 2),
        "discourse_category": category,
        "discourse_reason": reason
    }