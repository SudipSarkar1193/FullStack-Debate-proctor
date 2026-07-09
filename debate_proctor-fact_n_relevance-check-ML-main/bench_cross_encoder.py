import time
from sentence_transformers import CrossEncoder

print("Loading model...")
model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

query = "A 2021 study estimated that U.S. data centers directly consume 1.7 billion liters of water daily."
docs = [f"Sample evidence chunk number {i} about AI data centers and water consumption in cooling systems." for i in range(20)]
pairs = [[query, d] for d in docs]

# Warm-up run (first call always includes JIT/cache overhead — don't count it)
model.predict(pairs)

times = []
for _ in range(10):
    start = time.perf_counter()
    model.predict(pairs)
    times.append((time.perf_counter() - start) * 1000)

print(f"20-pair rerank — min: {min(times):.1f}ms  avg: {sum(times)/len(times):.1f}ms  max: {max(times):.1f}ms")