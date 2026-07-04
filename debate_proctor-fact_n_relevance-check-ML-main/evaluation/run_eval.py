"""
Evaluation runner for the debate fact-and-relevance checker.

Usage:
    # Full eval (both topics, fact + relevance)
    python evaluation/run_eval.py

    # Only one topic
    python evaluation/run_eval.py --topic ai

    # Only relevance examples
    python evaluation/run_eval.py --mode relevance

    # Limit how many examples to run (smoke test)
    python evaluation/run_eval.py --limit 5

Outputs:
    - Console summary (accuracy, per-class precision/recall, confusion matrix)
    - evaluation/results_<timestamp>.json (per-example diagnostics)
"""
import argparse
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

# Make project root importable
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from search_engine import core
from search_engine import relevance


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------

def confusion_matrix(pairs, labels):
    """Build a confusion matrix from (gold, pred) pairs."""
    matrix = {g: {p: 0 for p in labels} for g in labels}
    for gold, pred in pairs:
        if gold in matrix and pred in matrix[gold]:
            matrix[gold][pred] += 1
    return matrix


def per_class_metrics(pairs, labels):
    """Returns precision, recall, f1, and support for each label."""
    out = {}
    for label in labels:
        tp = sum(1 for g, p in pairs if g == label and p == label)
        fp = sum(1 for g, p in pairs if g != label and p == label)
        fn = sum(1 for g, p in pairs if g == label and p != label)
        support = sum(1 for g, _ in pairs if g == label)
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        out[label] = {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
            "support": support,
        }
    return out


def print_confusion_matrix(matrix, labels):
    """Pretty-print the confusion matrix."""
    col_w = max(14, max(len(l) for l in labels) + 2)
    header = "GOLD \\ PRED".ljust(col_w) + "".join(l.ljust(col_w) for l in labels)
    print(header)
    print("-" * len(header))
    for gold in labels:
        row = gold.ljust(col_w) + "".join(str(matrix[gold][p]).ljust(col_w) for p in labels)
        print(row)


# ---------------------------------------------------------------------------
# Fact-check eval
# ---------------------------------------------------------------------------

# How we map the system's verdict labels to the gold labels in the dataset.
# The system can output: SUPPORTED, CONTRADICTED, MIXED, NOT_VERIFIABLE.
# Gold labels: SUPPORTED, CONTRADICTED, NOT_VERIFIABLE.
# Mapping rule: MIXED counts as NOT_VERIFIABLE for grading (the system is
# saying "evidence is split"), which is closer to abstention than to a
# confident SUPPORTED/CONTRADICTED.
def normalize_predicted_verdict(pred):
    if pred == "MIXED":
        return "NOT_VERIFIABLE"
    return pred


def run_fact_eval(examples, topic_filter=None, limit=None):
    """Run fact-check evaluation. Returns (per_example_results, summary)."""
    results = []
    pairs = []  # (gold, pred) for metric computation
    score_diffs = []  # |predicted_score - expected_score| for MAE
    
    # Expected score per gold label for MAE: SUPPORTED→100, CONTRADICTED→0,
    # NOT_VERIFIABLE→50.
    EXPECTED_SCORE = {"SUPPORTED": 100.0, "CONTRADICTED": 0.0, "NOT_VERIFIABLE": 50.0}
    
    filtered = [
        ex for ex in examples
        if topic_filter is None or ex["topic"] == topic_filter
    ]
    if limit:
        filtered = filtered[:limit]
    
    print(f"\n{'='*60}")
    print(f"FACT-CHECK EVAL: {len(filtered)} examples")
    print(f"{'='*60}")
    
    for i, ex in enumerate(filtered, 1):
        print(f"\n[{i}/{len(filtered)}] {ex['id']} ({ex['topic']}): {ex['claim'][:60]}...")
        gold = ex["expected_verdict"]
        
        try:
            t0 = time.time()
            result = core.orchestrate_analysis(
                text=ex["claim"],
                previous_text=None,
                topic=ex["topic"],
            )
            elapsed = time.time() - t0
            
            pred_raw = result["fact_verdict"]
            pred = normalize_predicted_verdict(pred_raw)
            score = result["fact_score"]
            
            correct = (pred == gold)
            score_diff = abs(score - EXPECTED_SCORE[gold])
            
            pairs.append((gold, pred))
            score_diffs.append(score_diff)
            
            results.append({
                "id": ex["id"],
                "topic": ex["topic"],
                "claim": ex["claim"],
                "gold_verdict": gold,
                "pred_verdict_raw": pred_raw,
                "pred_verdict": pred,
                "correct": correct,
                "score": score,
                "expected_score": EXPECTED_SCORE[gold],
                "score_abs_error": round(score_diff, 2),
                "explanation": result["fact_explanation"],
                "support_mass": result["support_mass"],
                "refute_mass": result["refute_mass"],
                "neutral_mass": result["neutral_mass"],
                "elapsed_sec": round(elapsed, 2),
            })
            
            mark = "✅" if correct else "❌"
            print(f"   {mark} gold={gold} pred={pred_raw} score={score:.1f} (Δ={score_diff:.1f}) [{elapsed:.1f}s]")
            
            # Be polite to the API
            time.sleep(0.5)
        
        except FileNotFoundError as e:
            print(f"   ⚠️  Brain not built for topic '{ex['topic']}'. Skipping. ({e})")
            continue
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            results.append({
                "id": ex["id"], "topic": ex["topic"], "claim": ex["claim"],
                "gold_verdict": gold, "error": str(e),
            })
            continue
    
    # Compute summary metrics
    if not pairs:
        return results, {"note": "no successful runs"}
    
    labels = ["SUPPORTED", "CONTRADICTED", "NOT_VERIFIABLE"]
    accuracy = sum(1 for g, p in pairs if g == p) / len(pairs)
    metrics = per_class_metrics(pairs, labels)
    matrix = confusion_matrix(pairs, labels)
    mae = sum(score_diffs) / len(score_diffs)
    
    summary = {
        "n_examples": len(pairs),
        "accuracy": round(accuracy, 3),
        "score_mae": round(mae, 2),
        "per_class": metrics,
        "confusion_matrix": matrix,
    }
    
    print(f"\n{'='*60}")
    print(f"FACT-CHECK SUMMARY ({len(pairs)} examples)")
    print(f"{'='*60}")
    print(f"Accuracy: {accuracy:.1%}")
    print(f"Score MAE: {mae:.1f} (lower is better, scale 0-100)")
    print(f"\nPer-class metrics:")
    for label, m in metrics.items():
        print(f"  {label.ljust(15)} P={m['precision']:.2f}  R={m['recall']:.2f}  F1={m['f1']:.2f}  (n={m['support']})")
    print(f"\nConfusion Matrix:")
    print_confusion_matrix(matrix, labels)
    
    return results, summary


# ---------------------------------------------------------------------------
# Relevance eval
# ---------------------------------------------------------------------------

def run_relevance_eval(examples, limit=None):
    """Run relevance/discourse classification eval."""
    results = []
    pairs = []
    
    if limit:
        examples = examples[:limit]
    
    print(f"\n{'='*60}")
    print(f"RELEVANCE EVAL: {len(examples)} examples")
    print(f"{'='*60}")
    
    for i, ex in enumerate(examples, 1):
        print(f"\n[{i}/{len(examples)}] {ex['id']}: '{ex['current_text'][:50]}...'")
        gold = ex["expected_category"]
        
        try:
            res = relevance.compute_relevance_score(
                current_text=ex["current_text"],
                previous_text=ex["previous_text"],
                topic=ex["topic"],
            )
            pred = res["discourse_category"]
            correct = (pred == gold)
            pairs.append((gold, pred))
            
            results.append({
                "id": ex["id"],
                "topic": ex["topic"],
                "previous_text": ex["previous_text"],
                "current_text": ex["current_text"],
                "gold_category": gold,
                "pred_category": pred,
                "correct": correct,
                "final_score": res["final_score"],
                "topic_similarity": res["topic_similarity"],
                "reason": res["discourse_reason"],
            })
            
            mark = "✅" if correct else "❌"
            print(f"   {mark} gold={gold} pred={pred} score={res['final_score']:.1f}")
            time.sleep(0.5)
        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            continue
    
    if not pairs:
        return results, {"note": "no successful runs"}
    
    labels = ["DIRECT_COUNTER", "ELABORATION", "TANGENTIAL", "IRRELEVANT"]
    accuracy = sum(1 for g, p in pairs if g == p) / len(pairs)
    metrics = per_class_metrics(pairs, labels)
    matrix = confusion_matrix(pairs, labels)
    
    summary = {
        "n_examples": len(pairs),
        "accuracy": round(accuracy, 3),
        "per_class": metrics,
        "confusion_matrix": matrix,
    }
    
    print(f"\n{'='*60}")
    print(f"RELEVANCE SUMMARY ({len(pairs)} examples)")
    print(f"{'='*60}")
    print(f"Accuracy: {accuracy:.1%}")
    print(f"\nPer-class metrics:")
    for label, m in metrics.items():
        print(f"  {label.ljust(18)} P={m['precision']:.2f}  R={m['recall']:.2f}  F1={m['f1']:.2f}  (n={m['support']})")
    print(f"\nConfusion Matrix:")
    print_confusion_matrix(matrix, labels)
    
    return results, summary


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Run evaluation on the debate proctor.")
    parser.add_argument("--topic", choices=["ai", "aadhaar"], default=None,
                        help="Restrict to one topic (default: all)")
    parser.add_argument("--mode", choices=["fact", "relevance", "both"], default="both",
                        help="Which eval to run (default: both)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Cap number of examples (smoke test)")
    parser.add_argument("--dataset", default=os.path.join(os.path.dirname(__file__), "dataset.json"),
                        help="Path to dataset JSON")
    args = parser.parse_args()
    
    with open(args.dataset, "r", encoding="utf-8") as f:
        dataset = json.load(f)
    
    output = {
        "run_at": datetime.utcnow().isoformat() + "Z",
        "args": vars(args),
    }
    
    if args.mode in ("fact", "both"):
        fact_results, fact_summary = run_fact_eval(
            dataset["examples"], topic_filter=args.topic, limit=args.limit
        )
        output["fact_check"] = {"summary": fact_summary, "examples": fact_results}
    
    if args.mode in ("relevance", "both"):
        rel_results, rel_summary = run_relevance_eval(
            dataset["relevance_examples"], limit=args.limit
        )
        output["relevance"] = {"summary": rel_summary, "examples": rel_results}
    
    # Save full results
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(os.path.dirname(__file__), f"results_{timestamp}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Full results saved to: {out_path}")


if __name__ == "__main__":
    main()
