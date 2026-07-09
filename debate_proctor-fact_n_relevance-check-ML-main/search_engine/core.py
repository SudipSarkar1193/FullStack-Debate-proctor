import sys
import os
import pickle
import numpy as np
import faiss
import json
from sentence_transformers import SentenceTransformer
from google import genai
from google.genai import types

# For retry:
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# For path resolution
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv
from config import TOPIC_REGISTRY

# Import the new Relevance Module
from search_engine import relevance

# --- 2. CONFIGURATION ---
load_dotenv()
GEMINI_API_KEY = os.getenv("API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("❌ API_KEY not found in .env file!")
else:
    print(f"🔑 Using API Key for Verifier: {GEMINI_API_KEY[:5]}...")

# 1. Modern Gemini Client
client = genai.Client(api_key=GEMINI_API_KEY)

# 2. Local BAAI Embedding Model
print("📥 Loading BAAI/bge-small-en-v1.5 locally...")
embedding_model = SentenceTransformer("BAAI/bge-small-en-v1.5")

VERIFIER_MODEL = "gemini-3.1-flash-lite"

# --- SCORING THRESHOLDS (tunable) ---
DECISIVE_MASS_FLOOR = 0.3
VERDICT_THRESHOLD = 0.3


# --- 3. BRAIN MANAGER (Multi-Tenant) ---
ACTIVE_BRAINS = {}

def get_brain_paths(topic):
    """Returns file paths for a specific topic."""
    base_path = os.path.dirname(os.path.abspath(__file__))
    root_path = os.path.join(base_path, '..')
    data_dir = os.path.join(root_path, 'data', topic)
    
    return {
        "index": os.path.join(data_dir, 'vector_store.index'),
        "meta": os.path.join(data_dir, 'metadata.pkl')
    }

def load_brain(topic):
    """Loads a specific topic's brain into memory."""
    if topic in ACTIVE_BRAINS:
        return ACTIVE_BRAINS[topic]
    
    print(f"🧠 Loading Brain for topic: [{topic.upper()}]...")
    paths = get_brain_paths(topic)
    
    if not os.path.exists(paths['index']) or not os.path.exists(paths['meta']):
        raise FileNotFoundError(f"❌ Brain files not found for '{topic}'. Run build_index.py first.")
        
    try:
        index = faiss.read_index(paths['index'])
        with open(paths['meta'], 'rb') as f:
            metadata = pickle.load(f)
            
        ACTIVE_BRAINS[topic] = {"index": index, "metadata": metadata}
        print(f"✅ Brain Loaded! ({len(metadata)} memories)")
        return ACTIVE_BRAINS[topic]
        
    except Exception as e:
        raise RuntimeError(f"Failed to load brain for {topic}: {e}")

def search(topic, query, k=5):
    """Topic-aware search."""
    brain = load_brain(topic)
    index = brain["index"]
    metadata = brain["metadata"]
    
    print(f"🔍 Searching [{topic.upper()}]: '{query[:50]}...'")
    
    # Generate query embedding locally using BAAI
    query_vec = embedding_model.encode([query], normalize_embeddings=True).astype('float32')
    
    distances, indices = index.search(query_vec, k)
    
    results = []
    for i, idx in enumerate(indices[0]):
        if idx == -1 or idx >= len(metadata): continue 
        
        meta = metadata[idx]
        l2_distance = float(distances[0][i])
        similarity = max(0.0, min(1.0, 1 - (l2_distance / 2)))
        
        results.append({
            "text": meta['text'],
            "source": meta['title'],
            "url": meta['url'],
            "similarity": similarity
        })

    print(f"\n📚 TOP {len(results)} SIMILAR STATEMENTS RETRIEVED:")
    for rank, r in enumerate(results, start=1):
        print(f"\n   {rank}. [{r['source']}] (sim={r['similarity']:.2f}): {r['text']}")
            
        
    return results

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception) # Retries on any exception, including 503s
)
def verify_claim_with_llm(claim, facts):
    """Per-chunk verdict classification using the new google-genai SDK."""
    if not facts:
        return {
            "per_chunk": [],
            "global_explanation": "No evidence retrieved."
        }
    
    evidence_text = ""
    for i, f in enumerate(facts):
        evidence_text += f"EVIDENCE #{i} (Source: {f['source']}, Sim: {f['similarity']:.2f}):\n{f['text']}\n\n"
        
    prompt = f"""SYSTEM: You are a strict fact-checker. For each piece of evidence,
decide how it relates to the claim using ONE of these four labels:

- SUPPORT: the evidence explicitly states the claim's specific figures/facts, or directly entails them.
- CONTRADICT: the evidence explicitly conflicts with the claim's figures or direction.
- CONSISTENT: the evidence discusses the same underlying phenomenon and the claim's
  specific figure is plausible given what the evidence describes, but the evidence does NOT
  state that exact figure or study. Use this for claims that sound reasonable and on-topic
  but can't be confirmed at that level of specificity from this evidence alone.
- NEUTRAL: the evidence is off-topic or unrelated to the claim.

Be strict about the difference between SUPPORT and CONSISTENT: only use SUPPORT when the
evidence actually contains the specific number, study, or fact being claimed.

CLAIM: "{claim}"

{evidence_text}

OUTPUT JSON ONLY in this exact schema:
{{
  "per_chunk": [
    {{"index": 0, "label": "SUPPORT|CONTRADICT|CONSISTENT|NEUTRAL", "confidence": 0.0-1.0, "reason": "<one short sentence>"}},
    ...
  ],
  "global_explanation": "<one sentence summarizing the overall picture>"
}}
"""
    
    try:
        response = client.models.generate_content(
            model=VERIFIER_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                ]
            )
        )
        data = json.loads(response.text)
        per_chunk = data.get("per_chunk", [])
        normalized = []
        for i in range(len(facts)):
            if i < len(per_chunk) and isinstance(per_chunk[i], dict):
                
                entry = per_chunk[i]

                label = entry.get("label", "NEUTRAL").upper()
                if label not in ("SUPPORT", "CONTRADICT", "CONSISTENT", "NEUTRAL"):
                    label = "NEUTRAL"

                conf = float(entry.get("confidence", 0.5))
                conf = max(0.0, min(1.0, conf))
                normalized.append({
                    "index": i,
                    "label": label,
                    "confidence": conf,
                    "reason": entry.get("reason", "")
                })
            else:
                normalized.append({
                    "index": i, "label": "NEUTRAL", "confidence": 0.0,
                    "reason": "missing from LLM output"
                })
        return {
            "per_chunk": normalized,
            "global_explanation": data.get("global_explanation", "")
        }
    except Exception as e:
        print(f"LLM Error: {e}")
        return {
            "per_chunk": [{"index": i, "label": "NEUTRAL", "confidence": 0.0,
                           "reason": "LLM failure"} for i in range(len(facts))],
            "global_explanation": "LLM Failure"
        }


def calculate_mathematical_score(llm_result, facts):
    """Principled aggregation across per-chunk verdicts."""
    per_chunk = llm_result.get("per_chunk", [])
    
    support_mass = 0.0
    refute_mass = 0.0
    neutral_mass = 0.0

    CONSISTENT_WEIGHT = 0.6 
    
    print("\n🧮 MATH ENGINE:")
    for f, verdict in zip(facts, per_chunk):
        sim = f['similarity']
        conf = verdict['confidence']
        weight = sim * conf  
        label = verdict['label']
        
        if label == "SUPPORT":
            weight = sim * conf
            support_mass += weight
        elif label == "CONTRADICT":
            weight = sim * conf
            refute_mass += weight
        elif label == "CONSISTENT":
            weight = sim * conf * CONSISTENT_WEIGHT
            support_mass += weight   # counts toward decisive mass, but discounted
        else:
            weight = sim * conf
            neutral_mass += weight
        
        print(f"   - '{f['source']}': sim={sim:.2f} conf={conf:.2f} → {label} (w={weight:.2f})")
    
    decisive_mass = support_mass + refute_mass
    
    if decisive_mass < DECISIVE_MASS_FLOOR:
        final_verdict = "NOT_VERIFIABLE"
        final_score = 50.0
        raw_score = 0.0
        print(f"   ⚠️  Decisive mass {decisive_mass:.2f} < floor {DECISIVE_MASS_FLOOR}. Abstaining.")
    else:
        raw_score = (support_mass - refute_mass) / decisive_mass  
        final_score = round((raw_score + 1) / 2 * 100, 2)         
        if raw_score > VERDICT_THRESHOLD:
            final_verdict = "SUPPORTED"
        elif raw_score < -VERDICT_THRESHOLD:
            final_verdict = "CONTRADICTED"
        else:
            final_verdict = "MIXED"
        print(f"   raw_score={raw_score:+.2f} → {final_verdict} ({final_score:.1f}%)")
    
    return {
        "support_mass": round(support_mass, 4),
        "refute_mass": round(refute_mass, 4),
        "neutral_mass": round(neutral_mass, 4),
        "decisive_mass": round(decisive_mass, 4),
        "raw_score": round(raw_score, 4),
        "final_verdict": final_verdict,
        "final_accuracy_score": final_score,
    }


def orchestrate_analysis(text, previous_text=None, topic="ai", debater_name = None):
    """Combines Fact Checking + Relevance Evaluation."""
    print(f"\n📢 ORCHESTRATOR: Analyzing for Topic [{topic.upper()}]...")

    print(f"🗣️  Statement from {debater_name or 'Unknown User'}: \"{text}\"")
    
    facts = search(topic, text, k=5)
    llm_fact = verify_claim_with_llm(text, facts)
    math_fact = calculate_mathematical_score(llm_fact, facts)
    
    relevance_res = relevance.compute_relevance_score(text, previous_text, topic)
    
    return {
        "fact_verdict": math_fact['final_verdict'],
        "fact_confidence": int(round(
            sum(c['confidence'] for c in llm_fact['per_chunk']) /
            max(1, len(llm_fact['per_chunk'])) * 100
        )),
        "fact_explanation": llm_fact.get("global_explanation", ""),
        "fact_score": math_fact['final_accuracy_score'],
        "support_mass": math_fact['support_mass'],
        "refute_mass": math_fact['refute_mass'],
        "neutral_mass": math_fact['neutral_mass'],
        "per_chunk_verdicts": llm_fact['per_chunk'],
        "relevance_score": relevance_res['final_score'],
        "relevance_category": relevance_res['discourse_category'],
        "relevance_reason": relevance_res['discourse_reason'],
        "topic_similarity": relevance_res.get('topic_similarity', 0.0),
        "evidence": facts
    }


if __name__ == "__main__":

    # For TESTING
    topic = "ai"
    prev_arg = "Artificial intelligence poses no threat to job security."
    curr_resp = "AI tools will automate repetitive tasks and eliminate positions."
    
    result = orchestrate_analysis(curr_resp, prev_arg, topic)
    
    print("\n" + "="*30)
    print("🎯 FINAL REPORT:")
    print(f"Fact Score: {result['fact_score']}% ({result['fact_verdict']})")
    print(f"Relevance:  {result['relevance_score']}% ({result['relevance_category']})")
    print("="*30)