#!/usr/bin/env python3
"""Deterministic Phase 5 experiment scaffold.

This does not train models. It creates reproducible baseline artifacts so each
Phase 5 track has an executable contract before heavier ML dependencies are
introduced.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GOLDEN = REPO_ROOT / "datasets" / "golden" / "phase-0-baseline.json"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "datasets" / "experiments" / "phase-5"


@dataclass(frozen=True)
class Variant:
    name: str
    role: str
    metrics: dict[str, float]
    hyperparameters: dict[str, Any]


def _load_golden(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    entries = data.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"Golden dataset has no entries: {path}")

    return data


def _variants(track: str) -> list[Variant]:
    if track == "fine-tuning":
        return [
            Variant(
                "base-instruct",
                "baseline",
                {"faithfulness": 0.87, "relevance": 0.92, "exact_keyword_hit_rate": 1.0},
                {"training": False},
            ),
            Variant(
                "sft-candidate-dry-run",
                "candidate",
                {"faithfulness": 0.90, "relevance": 0.94, "exact_keyword_hit_rate": 1.0},
                {"epochs": 1, "learning_rate": 2e-5, "batch_size": 1},
            ),
        ]

    if track == "lora":
        return [
            Variant(
                "base-instruct",
                "baseline",
                {"faithfulness": 0.87, "relevance": 0.92, "trainable_parameter_ratio": 1.0},
                {"training": False},
            ),
            Variant(
                "lora-r8-alpha16-dry-run",
                "candidate",
                {"faithfulness": 0.89, "relevance": 0.93, "trainable_parameter_ratio": 0.012},
                {"rank": 8, "alpha": 16, "dropout": 0.05},
            ),
        ]

    if track == "quantization":
        return [
            Variant(
                "base-fp16",
                "baseline",
                {"quality": 0.708, "latency_ms": 533.0, "memory_mb": 1600.0},
                {"precision": "fp16"},
            ),
            Variant(
                "int8-dynamic-dry-run",
                "candidate",
                {"quality": 0.700, "latency_ms": 405.0, "memory_mb": 920.0},
                {"precision": "int8", "method": "dynamic"},
            ),
        ]

    if track == "distillation":
        return [
            Variant(
                "teacher-large",
                "baseline",
                {"quality": 0.92, "latency_ms": 820.0, "parameter_ratio": 1.0},
                {"teacher": True},
            ),
            Variant(
                "student-small-dry-run",
                "candidate",
                {"quality": 0.84, "latency_ms": 260.0, "parameter_ratio": 0.25},
                {"temperature": 2.0, "alpha": 0.5, "student": True},
            ),
        ]

    raise ValueError(f"Unknown Phase 5 track: {track}")


def _metric_deltas(variants: list[Variant]) -> dict[str, float]:
    baseline = next(item for item in variants if item.role == "baseline")
    candidate = next(item for item in variants if item.role == "candidate")
    shared = baseline.metrics.keys() & candidate.metrics.keys()
    return {
        metric: round(candidate.metrics[metric] - baseline.metrics[metric], 6)
        for metric in sorted(shared)
    }


def build_artifact(track: str, golden_path: Path) -> dict[str, Any]:
    golden = _load_golden(golden_path)
    variants = _variants(track)

    return {
        "version": 1,
        "phase": "phase-5",
        "track": track,
        "mode": "deterministic-scaffold",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "dependencies": "stdlib-only",
        },
        "inputDataset": {
            "path": str(golden_path.relative_to(REPO_ROOT)),
            "entryCount": len(golden["entries"]),
            "entryIds": [entry["id"] for entry in golden["entries"]],
        },
        "variants": [
            {
                "name": variant.name,
                "role": variant.role,
                "metrics": variant.metrics,
                "hyperparameters": variant.hyperparameters,
            }
            for variant in variants
        ],
        "comparison": {
            "candidateVsBaseline": _metric_deltas(variants),
            "notes": (
                "Dry-run metrics prove the artifact contract and result logging "
                "path. Replace with real training/evaluation metrics when the "
                "track gains ML dependencies."
            ),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("track", choices=["fine-tuning", "lora", "quantization", "distillation"])
    parser.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args(argv)

    artifact = build_artifact(args.track, args.golden.resolve())
    output_dir = args.output_root.resolve() / args.track
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "scaffold-result.json"

    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)
        handle.write("\n")

    print(f"Wrote {output_path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
