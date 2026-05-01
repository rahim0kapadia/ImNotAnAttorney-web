"""
Multi_Legal_Pile_Commercial probe — answers granularity + source_url + license questions
for INAA Phase 3/4 statute-ingest decision.
"""
import sys
import json

try:
    from datasets import load_dataset
except ImportError as e:
    print(f"FATAL: datasets lib import failed: {e}")
    sys.exit(2)

configs_to_try = [
    "en_legislation",
    "en-legislation",
    "us_legislation",
    "en_state_codes",
]

result = {
    "loaded_config": None,
    "fields": None,
    "first_row_summary": None,
    "text_len": None,
    "source_url_present": False,
    "source_url_sample": None,
    "jurisdiction_present": False,
    "title_present": False,
    "errors": [],
}

ds = None
for cfg in configs_to_try:
    try:
        print(f"trying config: {cfg}")
        ds = load_dataset(
            "joelniklaus/Multi_Legal_Pile_Commercial",
            cfg,
            split="train",
            streaming=True,
            trust_remote_code=True,
        )
        result["loaded_config"] = cfg
        break
    except Exception as e:
        result["errors"].append(f"{cfg}: {type(e).__name__}: {str(e)[:200]}")
        continue

if ds is None:
    print("RESULT:", json.dumps(result, indent=2))
    sys.exit(1)

try:
    sample = next(iter(ds))
    result["fields"] = list(sample.keys())
    result["text_len"] = len(sample.get("text", "")) if "text" in sample else None
    result["source_url_present"] = "source_url" in sample or "url" in sample
    if result["source_url_present"]:
        result["source_url_sample"] = sample.get("source_url") or sample.get("url")
    result["jurisdiction_present"] = "jurisdiction" in sample
    result["title_present"] = "title" in sample
    result["first_row_summary"] = {
        k: (str(v)[:200] if isinstance(v, str) and len(str(v)) > 200 else v)
        for k, v in sample.items()
    }
except Exception as e:
    result["errors"].append(f"sample: {type(e).__name__}: {str(e)[:200]}")

print("RESULT:", json.dumps(result, indent=2, default=str))
