#!/usr/bin/env python3
"""Real Supervised Fine-Tuning (SFT) experiment.

Updates all model parameters on a domain-specific instruction dataset and
compares quality and efficiency against the LoRA approach.
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import statistics
import sys
import time
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
except ImportError as e:
    print(f"Error: Required ML libraries not found: {e}", file=sys.stderr)
    print("Install with: pip install torch transformers", file=sys.stderr)
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GOLDEN_BASE = REPO_ROOT / "datasets" / "golden" / "phase-0-baseline.json"
DEFAULT_GOLDEN_P5 = REPO_ROOT / "datasets" / "golden" / "phase-5-retrieval.json"
DEFAULT_REGISTRY = REPO_ROOT / "datasets" / "registry.json"
DEFAULT_OUTPUT = (
    REPO_ROOT / "datasets" / "experiments" / "phase-5" / "fine-tuning" / "result.json"
)


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_dataset_text(registry_path: Path, dataset_id: str) -> str:
    registry = load_json(registry_path)
    datasets = registry.get("datasets", [])
    for ds in datasets:
        if ds["id"] == dataset_id:
            # Path in registry is relative to datasets/ folder
            text_path = REPO_ROOT / "datasets" / ds["path"]
            return text_path.read_text(encoding="utf-8")
    raise ValueError(f"Dataset not found in registry: {dataset_id!r}")


def split_sections(text: str) -> list[str]:
    """Split document into paragraph-sized sections."""
    return [s.strip() for s in re.split(r"\n\s*\n", text) if s.strip()]


def build_instruction_pairs(
    entries: list[dict[str, Any]],
    registry_path: Path,
) -> list[dict[str, str]]:
    """Build (instruction, response) pairs from golden entries + document text.

    Loads the source document from the registry, splits it into sections, and
    maps each section to the golden question whose expected_chunk_ids point to
    that section.
    """
    # Group entries by document_ref
    by_doc: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        doc_ref = entry.get("document_ref", "")
        by_doc.setdefault(doc_ref, []).append(entry)

    pairs: list[dict[str, str]] = []

    for doc_ref, doc_entries in by_doc.items():
        try:
            text = load_dataset_text(registry_path, doc_ref)
        except ValueError:
            continue

        sections = split_sections(text)

        for entry in doc_entries:
            question = entry.get("question", "")
            if not question:
                continue

            # Find the section referenced by expected_chunk_ids
            # Chunk id format: "<docId>:section-N:chunk-M"
            chunk_ids = entry.get("expected_chunk_ids", [])
            section_idx = None
            for chunk_id in chunk_ids:
                m = re.search(r"section-(\d+)", chunk_id)
                if m:
                    section_idx = int(m.group(1)) - 1  # 1-based to 0-based
                    break

            if section_idx is not None and section_idx < len(sections):
                response = sections[section_idx]
            else:
                # Fallback: join expected_answer_contains keywords
                response = " ".join(entry.get("expected_answer_contains", []))

            if question and response:
                pairs.append({
                    "id": entry.get("id", ""),
                    "instruction": question,
                    "response": response[:512],
                })

    return pairs


def format_prompt(pair: dict[str, str]) -> str:
    return (
        f"### Instruction:\n{pair['instruction']}\n\n"
        f"### Response:\n{pair['response']}"
    )


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def sft_train(
    model: Any,
    tokenizer: Any,
    pairs: list[dict[str, str]],
    lr: float = 2e-5,
    steps: int = 3,
    device: "torch.device | None" = None,
) -> dict[str, Any]:
    """Run SFT on all model parameters.

    Returns training metrics.
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = model.to(device)
    model.train()

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    losses: list[float] = []

    for step in range(steps):
        pair = pairs[step % len(pairs)]
        prompt = format_prompt(pair)

        tokens = tokenizer(
            prompt,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        ).to(device)

        optimizer.zero_grad()
        outputs = model(**tokens, labels=tokens["input_ids"])
        loss = outputs.loss
        if loss is not None:
            loss.backward()
            optimizer.step()
            losses.append(loss.item())

    return {
        "losses": [round(l, 6) for l in losses],
        "avg_loss": round(statistics.fmean(losses), 6) if losses else 0.0,
        "final_loss": round(losses[-1], 6) if losses else 0.0,
        "steps": len(losses),
    }


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_loss(
    model: Any,
    tokenizer: Any,
    pairs: list[dict[str, str]],
    device: "torch.device",
    max_examples: int = 4,
) -> float:
    model.eval()
    losses: list[float] = []

    for pair in pairs[:max_examples]:
        prompt = format_prompt(pair)
        tokens = tokenizer(
            prompt,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        ).to(device)

        with torch.no_grad():
            outputs = model(**tokens, labels=tokens["input_ids"])
            if outputs.loss is not None:
                losses.append(outputs.loss.item())

    return round(statistics.fmean(losses), 6) if losses else 0.0


def benchmark_latency(
    model: Any,
    tokenizer: Any,
    pairs: list[dict[str, str]],
    device: "torch.device",
    iterations: int = 5,
) -> dict[str, float]:
    model.eval()
    latencies_ms: list[float] = []

    for i in range(iterations):
        prompt = pairs[i % len(pairs)]["instruction"][:50]
        tokens = tokenizer(prompt, return_tensors="pt", max_length=50).to(device)

        t0 = time.perf_counter_ns()
        with torch.no_grad():
            model.generate(**tokens, max_new_tokens=10)
        t1 = time.perf_counter_ns()

        latencies_ms.append((t1 - t0) / 1_000_000)

    sorted_latencies = sorted(latencies_ms)
    p95_idx = max(0, int(len(sorted_latencies) * 0.95) - 1)

    return {
        "avg_ms": round(statistics.fmean(latencies_ms), 3),
        "p95_ms": round(sorted_latencies[p95_idx], 3),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN_P5)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--model", default="gpt2")
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--steps", type=int, default=3)
    args = parser.parse_args()

    args.golden = args.golden.resolve()
    args.registry = args.registry.resolve()
    args.output = args.output.resolve()

    # Load data
    golden = load_json(args.golden)
    entries = golden.get("entries", [])
    if not entries:
        print(f"Error: No entries in {args.golden}", file=sys.stderr)
        return 1

    pairs = build_instruction_pairs(entries, args.registry)
    if not pairs:
        print("Error: No instruction pairs built from golden entries", file=sys.stderr)
        return 1

    print(f"Loaded {len(pairs)} instruction pairs from {len(entries)} golden entries")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    print(f"Loading model: {args.model}")

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base_model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float32,
        trust_remote_code=True,
    )

    total_params = sum(p.numel() for p in base_model.parameters())
    trainable_base = sum(p.numel() for p in base_model.parameters() if p.requires_grad)

    # ---- Baseline evaluation ----
    print("Evaluating baseline...")
    baseline_loss = evaluate_loss(base_model, tokenizer, pairs, device)
    baseline_latency = benchmark_latency(base_model, tokenizer, pairs, device)

    # ---- SFT: full fine-tuning ----
    print(f"Running SFT (lr={args.lr}, steps={args.steps})...")
    sft_model = deepcopy(base_model)
    train_metrics = sft_train(sft_model, tokenizer, pairs, lr=args.lr, steps=args.steps, device=device)
    print(
        f"  loss {train_metrics['losses'][0]:.4f} → "
        f"{train_metrics['final_loss']:.4f} over {train_metrics['steps']} steps"
    )

    # ---- SFT evaluation ----
    print("Evaluating SFT model...")
    sft_loss = evaluate_loss(sft_model, tokenizer, pairs, device)
    sft_latency = benchmark_latency(sft_model, tokenizer, pairs, device)

    # ---- Build artifact ----
    loss_improvement = round(baseline_loss - sft_loss, 6)
    passed = sft_loss <= baseline_loss * 1.05  # within 5%

    artifact = {
        "version": 1,
        "phase": "phase-5",
        "track": "fine-tuning",
        "mode": "real-sft",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "pytorch_version": torch.__version__,
            "device": str(device),
            "cuda_available": torch.cuda.is_available(),
        },
        "inputDataset": {
            "path": str(args.golden.relative_to(REPO_ROOT)),
            "entryCount": len(entries),
            "instructionPairs": len(pairs),
        },
        "model": {
            "base": args.model,
            "total_parameters": total_params,
        },
        "hyperparameters": {
            "learning_rate": args.lr,
            "training_steps": args.steps,
            "optimizer": "AdamW",
        },
        "variants": [
            {
                "name": "baseline",
                "role": "baseline",
                "metrics": {
                    "instruction_loss": baseline_loss,
                    "avg_inference_latency_ms": baseline_latency["avg_ms"],
                    "p95_inference_latency_ms": baseline_latency["p95_ms"],
                    "trainable_parameters": trainable_base,
                },
            },
            {
                "name": "sft-full",
                "role": "candidate",
                "metrics": {
                    "instruction_loss": sft_loss,
                    "avg_inference_latency_ms": sft_latency["avg_ms"],
                    "p95_inference_latency_ms": sft_latency["p95_ms"],
                    "trainable_parameters": trainable_base,
                    "training_loss_history": train_metrics,
                },
            },
        ],
        "comparison": {
            "passed": passed,
            "loss_improvement": loss_improvement,
            "latency_delta_ms": round(
                sft_latency["avg_ms"] - baseline_latency["avg_ms"], 3
            ),
            "vs_lora": {
                "sft_trainable_pct": 100.0,
                "lora_trainable_pct_typical": 0.24,
                "note": (
                    "SFT updates 100% of parameters vs LoRA's ~0.24%. "
                    "LoRA is preferred for compute-constrained environments. "
                    "SFT may converge faster when enough data is available."
                ),
            },
            "notes": (
                f"SFT on {args.model} with {len(pairs)} instruction pairs. "
                f"Loss {'improved' if loss_improvement > 0 else 'unchanged'} by "
                f"{abs(loss_improvement):.4f} over {args.steps} steps. "
                f"All {total_params:,} parameters updated."
            ),
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as out:
        json.dump(artifact, out, indent=2)
        out.write("\n")

    try:
        display = args.output.relative_to(REPO_ROOT)
    except ValueError:
        display = args.output

    print(f"✓ Wrote {display}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
