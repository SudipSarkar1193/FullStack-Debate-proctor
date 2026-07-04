import sys
import os
import argparse 
import time
import re
import pickle
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

# Ensure parent directory is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from database import operations as db
from config import TOPIC_REGISTRY 

# --- CONFIGURATION ---
load_dotenv()

print("📥 Loading BAAI/bge-small-en-v1.5 locally...")
embedding_model = SentenceTransformer("BAAI/bge-small-en-v1.5")

VECTOR_DIMENSION = 384  # <-- Crucial change: BAAI uses 384 dimensions

# Chunking Settings
CHUNK_SIZE = 800
OVERLAP = 100
CHECKPOINT_INTERVAL = 50  # Auto-save every 50 articles

# --- Sentence boundary detection (Kept exactly as you wrote it) ---
_ABBREVIATIONS = {
    'Mr', 'Mrs', 'Ms', 'Dr', 'Jr', 'Sr', 'St', 'Prof', 'Hon',
    'vs', 'etc', 'eg', 'ie', 'cf',
    'U.S', 'U.K', 'U.N', 'E.U',
    'e.g', 'i.e', 'a.m', 'p.m',
    'Inc', 'Ltd', 'Co', 'Corp', 'Capt', 'Gen', 'Lt', 'Sgt',
    'No', 'vol', 'pp', 'p',
}

_SPLIT_RE = re.compile(r'([.!?])\s+(?=[A-Z"\'(])')

def _split_sentences(text):
    if not text:
        return []
    parts = _SPLIT_RE.split(text)
    if len(parts) == 1:
        return [text.strip()] if text.strip() else []

    candidates = []
    i = 0
    while i < len(parts):
        if i + 1 < len(parts):
            candidates.append(parts[i] + parts[i + 1])
            i += 2
        else:
            candidates.append(parts[i])
            i += 1

    merged = []
    for cand in candidates:
        if merged:
            prev = merged[-1].rstrip()
            stripped = prev.rstrip('.!?')
            last_token = stripped.split()[-1] if stripped.split() else ''
            if last_token in _ABBREVIATIONS:
                merged[-1] = prev + ' ' + cand.lstrip()
                continue
        merged.append(cand)

    return [s.strip() for s in merged if s.strip()]

def _hard_split(text, chunk_size):
    chunks = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            ws = text.rfind(' ', max(start, end - 100), end)
            if ws > start:
                end = ws
        chunks.append(text[start:end].strip())
        start = end
    return [c for c in chunks if c]

def paragraph_aware_chunker(text, chunk_size=CHUNK_SIZE, sentence_overlap=2):
    if not text:
        return []

    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)

    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    chunks = []

    for para in paragraphs:
        if len(para) <= chunk_size:
            chunks.append(para)
            continue

        sentences = _split_sentences(para)
        if not sentences:
            sentences = [para]

        current = []
        current_len = 0
        for sent in sentences:
            if len(sent) > chunk_size:
                if current:
                    chunks.append(' '.join(current))
                    current, current_len = [], 0
                chunks.extend(_hard_split(sent, chunk_size))
                continue

            projected = current_len + len(sent) + (1 if current else 0)
            if projected > chunk_size and current:
                chunks.append(' '.join(current))
                tail = current[-sentence_overlap:] if sentence_overlap > 0 else []
                current = list(tail)
                current_len = sum(len(s) for s in current) + max(0, len(current) - 1)

            current.append(sent)
            current_len += len(sent) + (1 if len(current) > 1 else 0)

        if current:
            chunks.append(' '.join(current))

    return [c for c in chunks if c and len(c.strip()) > 10]

def get_batch_embeddings(text_chunks):
    """
    Simplified embedding function. BAAI runs locally, so no API limits!
    """
    if not text_chunks:
        return [], []
    
    try:
        # Encode locally! normalize_embeddings is crucial for cosine similarity
        vectors = embedding_model.encode(text_chunks, normalize_embeddings=True)
        return text_chunks, vectors.tolist()
    except Exception as e:
        print(f"⚠️ Local Embedding Error: {e}")
        return [], []

def save_checkpoint(index, metadata_list, output_dir):
    index_path = os.path.join(output_dir, "vector_store.index")
    meta_path = os.path.join(output_dir, "metadata.pkl")
    
    faiss.write_index(index, index_path)
    
    with open(meta_path, "wb") as f:
        pickle.dump(metadata_list, f)
    print(f"   💾 Checkpoint saved! ({len(metadata_list)} total memories)")

def build_index():
    parser = argparse.ArgumentParser(description="Build Vector Index for a specific topic.")
    parser.add_argument("--topic", type=str, required=True, help="The topic key (e.g., 'ai', 'aadhaar')")
    args = parser.parse_args()
    topic = args.topic.lower()

    if topic not in TOPIC_REGISTRY:
        print(f"❌ Error: Topic '{topic}' not found in config.")
        return

    print(f"🚀 Starting Phase 2: Building Brain for [{topic.upper()}]...")
    
    output_dir = os.path.join("data", topic)
    os.makedirs(output_dir, exist_ok=True)
    index_path = os.path.join(output_dir, "vector_store.index")
    meta_path = os.path.join(output_dir, "metadata.pkl")

    metadata_list = []
    existing_titles = set()
    
    # --- IMPORTANT ---
    # Since you changed from 3072/768 to 384 dimensions, you cannot load an old index.
    # If an old index exists, you should delete the `data/ai/` folder first, 
    # but the script will handle fresh creation if it fails to load.
    
    if os.path.exists(index_path) and os.path.exists(meta_path):
        print("🧠 Found existing brain. Loading for incremental update...")
        try:
            index = faiss.read_index(index_path)
            # Failsafe: check dimension match
            if index.d != VECTOR_DIMENSION:
                print(f"⚠️ Dimension mismatch! Index is {index.d} but model is {VECTOR_DIMENSION}. Creating fresh index.")
                index = faiss.IndexFlatL2(VECTOR_DIMENSION)
            else:
                with open(meta_path, "rb") as f:
                    metadata_list = pickle.load(f)
                existing_titles = {item['title'] for item in metadata_list}
                print(f"   ✅ Loaded {len(metadata_list)} existing memories ({len(existing_titles)} unique articles).")
        except Exception as e:
            print(f"   ⚠️ Error loading existing index: {e}. Starting fresh.")
            index = faiss.IndexFlatL2(VECTOR_DIMENSION)
    else:
        print("🆕 No existing brain found. Creating fresh index.")
        index = faiss.IndexFlatL2(VECTOR_DIMENSION)

    print(f"📥 Fetching data from {TOPIC_REGISTRY[topic]['db_config']['dbname']}...")
    conn = db.get_connection(topic)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT pageid, title, content, url FROM raw_facts")
        rows = cursor.fetchall()
    finally:
        conn.close()
    
    new_rows = [r for r in rows if r[1] not in existing_titles]
    
    if not new_rows:
        print("✨ Brain is already up to date! No new articles to embed.")
        return

    print(f"   Found {len(rows)} total articles. {len(new_rows)} are NEW. Processing...")

    global_faiss_id = len(metadata_list)
    new_vectors_buffer = [] 
    
    for idx, row in enumerate(new_rows):
        page_id, title, content, url = row
        
        chunks = paragraph_aware_chunker(content)
        if not chunks: continue

        surviving_chunks, vectors = get_batch_embeddings(chunks)

        if not vectors:
            continue
            
        for i, vector in enumerate(vectors):
            new_vectors_buffer.append(vector)
            metadata_list.append({
                "faiss_id": global_faiss_id,
                "title": title,
                "text": surviving_chunks[i],
                "url": url
            })
            global_faiss_id += 1
            
        print(f"   [{idx+1}/{len(new_rows)}] Processed: {title} ({len(surviving_chunks)}/{len(chunks)} chunks embedded)")
        
        if (idx + 1) % CHECKPOINT_INTERVAL == 0 and new_vectors_buffer:
            print(f"\n⚡ Auto-Saving batch of {len(new_vectors_buffer)} vectors...")
            batch_matrix = np.array(new_vectors_buffer).astype('float32')
            index.add(batch_matrix)
            save_checkpoint(index, metadata_list, output_dir)
            new_vectors_buffer = []
            
    if new_vectors_buffer:
        print(f"\n⚡ Saving final batch of {len(new_vectors_buffer)} vectors...")
        batch_matrix = np.array(new_vectors_buffer).astype('float32')
        index.add(batch_matrix)
        save_checkpoint(index, metadata_list, output_dir)
            
    print(f"✅ DONE! Brain updated. Total memories: {index.ntotal}")

if __name__ == "__main__":
    build_index()