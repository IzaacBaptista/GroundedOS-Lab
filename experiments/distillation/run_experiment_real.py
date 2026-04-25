#!/usr/bin/env python3
"""Real knowledge distillation experiment (teacher -> student).

Distills a GPT-2 teacher into a DistilGPT-2 student on the Phase 5 retrieval
instruction dataset and reports quality, latency, and compression metrics.
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import torch
    import torch.nn.functional as F
    from transformers import AutoModelForCausalLM, AutoTokenizer
except ImportError as e:
    print(f"Error: Required ML libraries not found: {e}", file=sys.stderr)
    print("Install with: pip install torch transformers", file=sys.stderr)
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GOLDEN = REPO_ROOT / "datasets" / "golden" / "phase-5-retrieval.json"
DEFAULT_REGISTRY = REPO_ROOT / "datasets" / "registry.json"
DEFAULT_OUTPUT = (
    REPO_ROOT / "datasets" / "experiments" / "phase-5" / "distillation" / "result.json"
)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_dataset_text(registry_path: Path, dataset_id: str) -> str:
    registry = load_json(registry_path)
    datasets = registry.get("datasets", [])
    for ds in datasets:
        if ds.get("id") == dataset_id:
            dataset_path = REPO_ROOT / "datasets" / ds["path"]
            return dataset_path.read_text(encoding="utf-8")
    raise ValueError(f"Dataset not found in registry: {dataset_id!r}")


def split_sections(text: str) -> list[str]:
    return [section.strip() for section in re.split(r"\n\s*\n", text) if section.strip()]


def build_instruction_pairs(
    entries: list[dict[str, Any]], registry_path: Path
) -> list[dict[str, str]]:
    by_doc: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        by_doc.setdefault(entry.get("document_ref", ""), []).append(entry)

    pairs: list[dict[str, str]] = []

    for document_ref, doc_entries in by_doc.items():
        if not document_ref:
            continue
        text = load_dataset_text(registry_path, document_ref)
        sections = split_sections(text)

        for entry in doc_entries:
            question = entry.get("question", "")
            if not question:
                continue

            section_idx = None
            for chunk_id in entry.get("expected_chunk_ids", []):
                match = re.search(r"section-(\d+)", chunk_id)
                if match:
                    section_idx = int(match.group(1)) - 1
                    break

            if section_idx is not None and 0 <= section_idx < len(sections):
                response = sections[section_idx]
            else:
                response = " ".join(entry.get("expected_answer_contains", []))

            pairs.append(
                {
                    "id": entry.get("id", ""),
                    "instruction": question,
                    "response": response[:512],
                }
            )

    return pairs


def format_prompt(pair: dict[str, str]) -> str:
    return (
        f"### Instruction:\n{pair['instruction']}\n\n"
        f"### Response:\n{pair['response']}"
    )


def evaluate_instruction_loss(
    model: Any,
    tokenizer: Any,
    pairs: list[dict[str, str]],
    device: torch.device,
    max_examples: int = 4,
) -> float:
    model = model.to(device)
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
    device: torch.device,
    iterations: int = 5,
) -> dict[str, float]:
    model = model.to(device)
    model.eval()

    latencies_ms: list[float] = []
    for i in range(iterations):
        prompt = pairs[i % len(pairs)]["instruction"][:64]
        tokens = tokenizer(prompt, return_tensors="pt", max_length=64).to(device)

        started = time.perf_counter_ns()
        with torch.no_grad():
            model.generate(**tokens, max_new_tokens=10)
        finished = time.perf_counter_ns()

        latencies_ms.append((finished - started) / 1_000_000)

    sorted_latencies = sorted(latencies_ms)
    p95_index = max(0, int(len(sorted_latencies) * 0.95) - 1)

    return {
        "avgLatencyMs": round(statistics.fmean(latencies_ms), 6),
        "p95LatencyMs": round(sorted_latencies[p95_index], 6),
    }


def distill_student(
    teacher: Any,
    student: Any,
    tokenizer: Any,
    pairs: list[dict[str, str]],
    device: torch.device,
    learning_rate: float,
    steps: int,
    alpha: float,
    temperature: float,
) -> dict[str, Any]:
    teacher = teacher.to(device)
    student = student.to(device)

    teacher.eval()
    student.train()

    optimizer = torch.optim.AdamW(student.parameters(), lr=learning_rate)

    loss_history: list[float] = []
    ce_history: list[float] = []
    kl_history: list[float] = []

    for step in range(steps):
        pair = pairs[step % len(pairs)]
        prompt = format_prompt(pair)

        tokens = tokenizer(
            prompt,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        ).to(device)
        labels = tokens["input_ids"]

        with torch.no_grad():
            teacher_outputs = teacher(**tokens)
            teacher_logits = teacher_outputs.logits

        optimizer.zero_grad()
        student_outputs = student(**tokens)
        student_logits = student_outputs.logits

        vocab_size = student_logits.size(-1)
        ce_loss = F.cross_entropy(
            student_logits.view(-1, vocab_size),
            labels.view(-1),
            ignore_index=tokenizer.pad_token_id,
        )

        student_log_probs = F.log_softmax(student_logits / temperature, dim=-1)
        teacher_probs = F.softmax(teacher_logits / temperature, dim=-1)
        kl_loss = F.kl_div(student_log_probs, teacher_probs, reduction="batchmean")

        total_loss = alpha * ce_loss + (1 - alpha) * (temperature**2) * kl_loss
        total_loss.backward()
        optimizer.step()

        loss_history.append(total_loss.item())
        ce_history.append(ce_loss.item())
        kl_history.append(kl_loss.item())

    return {
        "steps": steps,
        "avgTotalLoss": round(statistics.fmean(loss_history), 6),
        "finalTotalLoss": round(loss_history[-1], 6),
        "avgCrossEntropy": round(statistics.fmean(ce_history), 6),
        "avgKLDivergence": round(statistics.fmean(kl_history), 6),
        "lossHistory": [round(value, 6) for value in loss_history],
    }


def count_parameters(model: Any) -> int:
    return sum(p.numel() for p in model.parameters())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--teacher-model", default="gpt2")
    parser.add_argument("--student-model", default="distilgpt2")
    parser.add_argument("--steps", type=int, default=3)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--alpha", type=float, default=0.5)
    parser.add_argument("--temperature", type=float, default=2.0)
    args = parser.parse_args()

    if args.steps <= 0:
        raise ValueError("--steps must be positive")
    if not 0 <= args.alpha <= 1:
        raise ValueError("--alpha must be in [0, 1]")
    if args.temperature <= 0:
        raise ValueError("--temperature must be positive")

    args.golden = args.golden.resolve()
    args.registry = args.registry.resolve()
    args.output = args.output.resolve()

    golden = load_json(args.golden)
    entries = golden.get("entries", [])
    if not entries:
        print(f"Error: No entries in {args.golden}", file=sys.stderr)
        return 1

    pairs = build_instruction_pairs(entries, args.registry)
    if not pairs:
        print("Error: Could not build instruction pairs", file=sys.stderr)
        return 1

    print(f"Loaded {len(pairs)} instruction pairs")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    tokenizer = AutoTokenizer.from_pretrained(args.teacher_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"Loading teacher: {args.teacher_model}")
    teacher = AutoModelForCausalLM.from_pretrained(
        args.teacher_model,
        torch_dtype=torch.float32,
        trust_remote_code=True,
    )

    print(f"Loading student: {args.student_model}")
    student = AutoModelForCausalLM.from_pretrained(
        args.student_model,
        torch_dtype=torch.float32,
        trust_remote_code=True,
    )

    teacher_params = count_parameters(teacher)
    student_params = count_parameters(student)
    parameter_ratio = student_params / teacher_params if teacher_params > 0 else 1.0

    print("Evaluating teacher baseline...")
    teacher_loss = evaluate_instruction_loss(teacher, tokenizer, pairs, device)
    teacher_latency = benchmark_latency(teacher, tokenizer, pairs, device)

    print(
        "Running distillation "
        f"(steps={args.steps}, lr={args.learning_rate}, alpha={args.alpha}, T={args.temperature})..."
    )
    training = distill_student(
        teacher=teacher,
        student=student,
        tokenizer=tokenizer,
        pairs=pairs,
        device=device,
        learning_rate=args.learning_rate,
        steps=args.steps,
        alpha=args.alpha,
        temperature=args.temperature,
    )

    print("Evaluating distilled student...")
    student_loss = evaluate_instruction_loss(student, tokenizer, pairs, device)
    student_latency = benchmark_latency(student, tokenizer, pairs, device)

    compression_rate = 1 - parameter_ratio
    loss_delta = round(student_loss - teacher_loss, 6)

    artifact = {
        "version": 1,
        "phase": "phase-5",
        "track": "distillation",
        "mode": "real-teacher-student-distillation",
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
            "documentRef": entries[0].get("document_ref"),
        },
        "method": {
            "teacherModel": args.teacher_model,
            "studentModel": args.student_model,
            "trainingSteps": args.steps,
            "learningRate": args.learning_rate,
            "alpha": args.alpha,
            "temperature": args.temperature,
        },
        "variants": [
            {
                "name": f"teacher-{args.teacher_model}",
                "role": "baseline",
                "metrics": {
                    "instructionLoss": teacher_loss,
                    "avgLatencyMs": teacher_latency["avgLatencyMs"],
                    "p95LatencyMs": teacher_latency["p95LatencyMs"],
                    "parameterCount": teacher_params,
                },
            },
            {
                "name": f"student-{args.student_model}-distilled",
                "role": "candidate",
                "metrics": {
                    "instructionLoss": student_loss,
                    "avgLatencyMs": student_latency["avgLatencyMs"],
                    "p95LatencyMs": student_latency["p95LatencyMs"],
                    "parameterCount": student_params,
                    "parameterRatio": round(parameter_ratio, 6),
                    "compressionRate": round(compression_rate, 6),
                    "trainingAvgLoss": training["avgTotalLoss"],
                    "trainingFinalLoss": training["finalTotalLoss"],
                },
                "hyperparameters": {
                    "steps": args.steps,
                    "learningRate": args.learning_rate,
                    "alpha": args.alpha,
                    "temperature": args.temperature,
                },
            },
        ],
        "comparison": {
            "candidateVsBaseline": {
                "instructionLoss": loss_delta,
                "avgLatencyMs": round(
                    student_latency["avgLatencyMs"] - teacher_latency["avgLatencyMs"], 6
                ),
                "p95LatencyMs": round(
                    student_latency["p95LatencyMs"] - teacher_latency["p95LatencyMs"], 6
                ),
                "parameterCount": student_params - teacher_params,
                "compressionRate": round(compression_rate, 6),
            },
            "passed": (
                compression_rate >= 0.33
                and student_loss <= teacher_loss * 1.2
            ),
            "notes": (
                "Teacher-student distillation run completed with real logits "
                "matching. Student should be significantly smaller while keeping "
                "instruction loss within acceptable degradation."
            ),
            "training": training,
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)
        handle.write("\n")

    try:
        display_path = args.output.relative_to(REPO_ROOT)
    except ValueError:
        display_path = args.output

    print(f"✓ Wrote {display_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
