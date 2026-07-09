import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from search_engine import core
from config import TOPIC_REGISTRY

# --- DATA MODELS ---
class AnalyzeRequest(BaseModel):
    text: str
    previous_text: Optional[str] = None  # User's previous message (for logic check)
    topic: str = "ai"  # Topic key from TOPIC_REGISTRY (e.g. "ai", "aadhaar")
    debater_name: Optional[str] = None

class EvidenceItem(BaseModel):
    text: str
    source: str
    url: str
    similarity: float  

class AnalyzeResponse(BaseModel):
    # Factual Results
    verdict: str
    factual_score: float
    explanation: str
    
    # Relevance Results
    relevance_score: float
    discourse_category: str
    discourse_reason: str
    
    # Debug/Math Details
    support_mass: float
    refute_mass: float
    neutral_mass: float
    topic_similarity: float
    
    evidence: List[EvidenceItem]

# --- LIFECYCLE ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 API Starting...")
    
    # 1. Force PyTorch to compile the execution graphs
    core.warmup_models()
    
    # 2. Pre-warm FAISS brains for all configured topics. 
    for topic in TOPIC_REGISTRY.keys():
        try:
            core.load_brain(topic)
            print(f"✅ Brain ready for [{topic}]")
        except Exception as e:
            print(f"⚠️ Brain pre-warm failed for [{topic}]: {e} (will lazy-load on first request)")
            
    yield
    print("💤 API Stopping...")

app = FastAPI(title="Debate Analyzer AI", lifespan=lifespan)

@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_claim(request: AnalyzeRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    # Normalize the topic key — accept any case, validate against registry
    topic_key = request.topic.lower().strip()
    if topic_key not in TOPIC_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown topic '{request.topic}'. Available: {list(TOPIC_REGISTRY.keys())}"
        )

    try:
        # Call the Orchestrator in core.py
        result = core.orchestrate_analysis(
            text=request.text,
            previous_text=request.previous_text,
            topic=topic_key,
            debater_name=request.debater_name,
        )

        # print();
        # print("===========================");
        # print("result ->>", result);
        
        # Map Dict to Pydantic Model
        return AnalyzeResponse(
            verdict=result['fact_verdict'],
            factual_score=result['fact_score'],
            explanation=result['fact_explanation'],
            
            relevance_score=result['relevance_score'],
            discourse_category=result['relevance_category'],
            discourse_reason=result['relevance_reason'],
            
            support_mass=result['support_mass'],
            refute_mass=result['refute_mass'],
            neutral_mass=result['neutral_mass'],
            topic_similarity=result['topic_similarity'],
            
            evidence=[
                EvidenceItem(
                    text=f['text'],
                    source=f['source'],
                    url=f['url'],
                    similarity=f['similarity']
                ) for f in result['evidence']
            ]
        )
        
    except FileNotFoundError as e:
        # Brain not built yet for this topic
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"❌ API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
