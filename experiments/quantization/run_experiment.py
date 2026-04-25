#!/usr/bin/env python3
"""Run a local quantization experiment over the Phase 0 golden dataset.

This is intentionally dependency-free. It quantizes lexical retrieval vectors
from float32-style normalized counts to signed int8 values, then compares
quality, latency and storage footprint across unquantized, dequantized INT8 and
direct INT8 search paths.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import re
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GOLDEN = REPO_ROOT / "datasets" / "golden" / "phase-5-retrieval.json"
DEFAULT_REGISTRY = REPO_ROOT / "datasets" / "registry.json"
DEFAULT_OUTPUT = (
    REPO_ROOT
    / "datasets"
    / "experiments"
    / "phase-5"
    / "quantization"
    / "scaffold-result.json"
)
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
BENCHMARK_ITERATIONS = 2_000


def tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_dataset_text(registry_path: Path, dataset_id: str) -> tuple[str, dict[str, Any]]:
    registry = load_json(registry_path)
    datasets = registry.get("datasets", [])
    dataset = next((item for item in datasets if item.get("id") == dataset_id), None)

    if not dataset:
        raise ValueError(f"Dataset not found in registry: {dataset_id}")

    sample_path = REPO_ROOT / "datasets" / dataset["path"]
    return sample_path.read_text(encoding="utf-8"), dataset


def build_chunks(text: str, document_id: str) -> list[dict[str, str]]:
    sections = [section.strip() for section in re.split(r"\n\s*\n", text) if section.strip()]
    return [
        {
            "id": f"{document_id}:section-{index}:chunk-1",
            "sectionId": f"section-{index}",
            "text": section,
        }
        for index, section in enumerate(sections, start=1)
    ]


def build_vocabulary(chunks: Iterable[dict[str, str]], questions: Iterable[str]) -> list[str]:
    terms = set()
    for chunk in chunks:
        terms.update(tokenize(chunk["text"]))
    for question in questions:
        terms.update(tokenize(question))
    return sorted(terms)


def vectorize(text: str, vocabulary: list[str]) -> list[float]:
    token_counts: dict[str, int] = {}
    for token in tokenize(text):
        token_counts[token] = token_counts.get(token, 0) + 1

    vector = [float(token_counts.get(term, 0)) for term in vocabulary]
    norm = math.sqrt(sum(value * value for value in vector))

    if norm == 0:
        return vector

    return [value / norm for value in vector]


def quantize_int8(vector: list[float]) -> tuple[list[int], float]:
    max_abs = max((abs(value) for value in vector), default=0.0)
    scale = max_abs / 127.0 if max_abs > 0 else 1.0
    return [max(-127, min(127, round(value / scale))) for value in vector], scale


def dequantize_int8(vector: list[int], scale: float) -> list[float]:
    return [value * scale for value in vector]


def cosine(left: list[float], right: list[float]) -> float:
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))

    if left_norm == 0 or right_norm == 0:
        return 0.0

    dot = sum(l * r for l, r in zip(left, right))
    return dot / (left_norm * right_norm)


def search(query_vector: list[float], chunk_vectors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = [
        {
            "chunkId": item["chunkId"],
            "score": cosine(query_vector, item["vector"]),
        }
        for item in chunk_vectors
    ]
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked


def int8_cosine(left: list[int], right: list[int]) -> float:
    left_norm_sq = sum(value * value for value in left)
    right_norm_sq = sum(value * value for value in right)

    if left_norm_sq == 0 or right_norm_sq == 0:
        return 0.0

    dot = sum(l * r for l, r in zip(left, right))
    return dot / math.sqrt(left_norm_sq * right_norm_sq)


def search_int8(
    query_vector: list[int],
    chunk_vectors: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ranked = [
        {
            "chunkId": item["chunkId"],
            "score": int8_cosine(query_vector, item["quantizedVector"]),
        }
        for item in chunk_vectors
    ]
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked


def p95(values: list[float]) -> float:
    if len(values) < 2:
        return values[0] if values else 0.0
    return statistics.quantiles(values, n=20)[18]


def benchmark_search(
    query_vectors: list[list[float]],
    chunk_vectors: list[dict[str, Any]],
    iterations: int,
) -> dict[str, float]:
    latencies_ms: list[float] = []

    for index in range(iterations):
        query_vector = query_vectors[index % len(query_vectors)]
        started = time.perf_counter_ns()
        search(query_vector, chunk_vectors)
        finished = time.perf_counter_ns()
        latencies_ms.append((finished - started) / 1_000_000)

    return {
        "avgLatencyMs": round(statistics.fmean(latencies_ms), 6),
        "p95LatencyMs": round(p95(latencies_ms), 6),
    }


def benchmark_int8_search(
    query_vectors: list[list[int]],
    chunk_vectors: list[dict[str, Any]],
    iterations: int,
) -> dict[str, float]:
    latencies_ms: list[float] = []

    for index in range(iterations):
        query_vector = query_vectors[index % len(query_vectors)]
        started = time.perf_counter_ns()
        search_int8(query_vector, chunk_vectors)
        finished = time.perf_counter_ns()
        latencies_ms.append((finished - started) / 1_000_000)

    return {
        "avgLatencyMs": round(statistics.fmean(latencies_ms), 6),
        "p95LatencyMs": round(p95(latencies_ms), 6),
    }


def evaluate(
    golden_entries: list[dict[str, Any]],
    query_vectors: dict[str, list[float]],
    chunk_vectors: list[dict[str, Any]],
) -> dict[str, Any]:
    per_query = []
    hits = 0

    for entry in golden_entries:
        ranked = search(query_vectors[entry["id"]], chunk_vectors)
        top = ranked[0] if ranked else {"chunkId": "", "score": 0.0}
        expected = set(entry["expected_chunk_ids"])
        hit = top["chunkId"] in expected
        hits += 1 if hit else 0
        per_query.append(
            {
                "id": entry["id"],
                "question": entry["question"],
                "topChunkId": top["chunkId"],
                "topScore": round(top["score"], 6),
                "expectedChunkIds": entry["expected_chunk_ids"],
                "hit": hit,
            }
        )

    recall_at_1 = hits / len(golden_entries) if golden_entries else 0.0
    return {"recallAt1": recall_at_1, "perQuery": per_query}


def evaluate_int8(
    golden_entries: list[dict[str, Any]],
    query_vectors: dict[str, list[int]],
    chunk_vectors: list[dict[str, Any]],
) -> dict[str, Any]:
    per_query = []
    hits = 0

    for entry in golden_entries:
        ranked = search_int8(query_vectors[entry["id"]], chunk_vectors)
        top = ranked[0] if ranked else {"chunkId": "", "score": 0.0}
        expected = set(entry["expected_chunk_ids"])
        hit = top["chunkId"] in expected
        hits += 1 if hit else 0
        per_query.append(
            {
                "id": entry["id"],
                "question": entry["question"],
                "topChunkId": top["chunkId"],
                "topScore": round(top["score"], 6),
                "expectedChunkIds": entry["expected_chunk_ids"],
                "hit": hit,
            }
        )

    recall_at_1 = hits / len(golden_entries) if golden_entries else 0.0
    return {"recallAt1": recall_at_1, "perQuery": per_query}


def build_artifact(args: argparse.Namespace) -> dict[str, Any]:
    golden = load_json(args.golden)
    entries = golden.get("entries", [])
    if not entries:
        raise ValueError(f"Golden dataset has no entries: {args.golden}")

    dataset_id = entries[0]["document_ref"]
    text, dataset = load_dataset_text(args.registry, dataset_id)
    document_id = dataset["metadata"]["documentId"]
    chunks = build_chunks(text, document_id)
    questions = [entry["question"] for entry in entries]
    vocabulary = build_vocabulary(chunks, questions)

    fp32_chunk_vectors = [
        {"chunkId": chunk["id"], "vector": vectorize(chunk["text"], vocabulary)}
        for chunk in chunks
    ]
    fp32_query_vectors = {
        entry["id"]: vectorize(entry["question"], vocabulary)
        for entry in entries
    }

    quantized_chunks = []
    for item in fp32_chunk_vectors:
        quantized, scale = quantize_int8(item["vector"])
        quantized_chunks.append(
            {
                "chunkId": item["chunkId"],
                "vector": dequantize_int8(quantized, scale),
                "quantizedVector": quantized,
                "scale": scale,
            }
        )

    int8_chunk_vectors = [
        {"chunkId": item["chunkId"], "vector": item["vector"]}
        for item in quantized_chunks
    ]

    quantized_queries = {}
    int8_query_vectors = {}
    for entry_id, vector in fp32_query_vectors.items():
        quantized, scale = quantize_int8(vector)
        quantized_queries[entry_id] = dequantize_int8(quantized, scale)
        int8_query_vectors[entry_id] = quantized

    fp32_eval = evaluate(entries, fp32_query_vectors, fp32_chunk_vectors)
    int8_eval = evaluate(entries, quantized_queries, int8_chunk_vectors)
    int8_direct_eval = evaluate_int8(entries, int8_query_vectors, quantized_chunks)
    fp32_latency = benchmark_search(
        list(fp32_query_vectors.values()),
        fp32_chunk_vectors,
        args.iterations,
    )
    int8_latency = benchmark_search(
        list(quantized_queries.values()),
        int8_chunk_vectors,
        args.iterations,
    )
    int8_direct_latency = benchmark_int8_search(
        list(int8_query_vectors.values()),
        quantized_chunks,
        args.iterations,
    )

    dimensions = len(vocabulary)
    fp32_memory_bytes = len(chunks) * dimensions * 4
    int8_memory_bytes = len(chunks) * dimensions + len(chunks) * 8
    memory_reduction = (
        1 - (int8_memory_bytes / fp32_memory_bytes)
        if fp32_memory_bytes > 0
        else 0.0
    )

    return {
        "version": 3,
        "phase": "phase-5",
        "track": "quantization",
        "mode": "local-lexical-vector-quantization",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "dependencies": "stdlib-only",
        },
        "inputDataset": {
            "path": str(args.golden.relative_to(REPO_ROOT)),
            "entryCount": len(entries),
            "entryIds": [entry["id"] for entry in entries],
            "documentRef": dataset_id,
            "documentPath": dataset["path"],
        },
        "method": {
            "baseline": "normalized lexical vectors stored as fp32",
            "candidate": "per-vector symmetric int8 quantization",
            "searchPaths": [
                "fp32 cosine",
                "int8 dequantized cosine",
                "int8 direct normalized dot product",
            ],
            "dimensions": dimensions,
            "chunkCount": len(chunks),
            "benchmarkIterations": args.iterations,
        },
        "variants": [
            {
                "name": "lexical-fp32",
                "role": "baseline",
                "metrics": {
                    "recallAt1": fp32_eval["recallAt1"],
                    "avgLatencyMs": fp32_latency["avgLatencyMs"],
                    "p95LatencyMs": fp32_latency["p95LatencyMs"],
                    "memoryBytes": fp32_memory_bytes,
                },
                "hyperparameters": {
                    "precision": "fp32",
                    "normalization": "l2",
                },
                "perQuery": fp32_eval["perQuery"],
            },
            {
                "name": "lexical-int8-symmetric-dequantized",
                "role": "candidate",
                "metrics": {
                    "recallAt1": int8_eval["recallAt1"],
                    "avgLatencyMs": int8_latency["avgLatencyMs"],
                    "p95LatencyMs": int8_latency["p95LatencyMs"],
                    "memoryBytes": int8_memory_bytes,
                    "memoryReductionRate": round(memory_reduction, 6),
                },
                "hyperparameters": {
                    "precision": "int8",
                    "method": "per-vector-symmetric",
                    "dequantizeForSearch": True,
                },
                "perQuery": int8_eval["perQuery"],
            },
            {
                "name": "lexical-int8-symmetric-direct",
                "role": "candidate",
                "metrics": {
                    "recallAt1": int8_direct_eval["recallAt1"],
                    "avgLatencyMs": int8_direct_latency["avgLatencyMs"],
                    "p95LatencyMs": int8_direct_latency["p95LatencyMs"],
                    "memoryBytes": int8_memory_bytes,
                    "memoryReductionRate": round(memory_reduction, 6),
                },
                "hyperparameters": {
                    "precision": "int8",
                    "method": "per-vector-symmetric",
                    "dequantizeForSearch": False,
                    "similarity": "normalized-int8-dot-product",
                },
                "perQuery": int8_direct_eval["perQuery"],
            },
        ],
        "comparison": {
            "dequantizedCandidateVsBaseline": {
                "recallAt1": round(int8_eval["recallAt1"] - fp32_eval["recallAt1"], 6),
                "avgLatencyMs": round(
                    int8_latency["avgLatencyMs"] - fp32_latency["avgLatencyMs"], 6
                ),
                "p95LatencyMs": round(
                    int8_latency["p95LatencyMs"] - fp32_latency["p95LatencyMs"], 6
                ),
                "memoryBytes": int8_memory_bytes - fp32_memory_bytes,
                "memoryReductionRate": round(memory_reduction, 6),
            },
            "directCandidateVsBaseline": {
                "recallAt1": round(
                    int8_direct_eval["recallAt1"] - fp32_eval["recallAt1"], 6
                ),
                "avgLatencyMs": round(
                    int8_direct_latency["avgLatencyMs"] - fp32_latency["avgLatencyMs"], 6
                ),
                "p95LatencyMs": round(
                    int8_direct_latency["p95LatencyMs"] - fp32_latency["p95LatencyMs"], 6
                ),
                "memoryBytes": int8_memory_bytes - fp32_memory_bytes,
                "memoryReductionRate": round(memory_reduction, 6),
            },
            "passed": (
                int8_eval["recallAt1"] >= fp32_eval["recallAt1"]
                and int8_direct_eval["recallAt1"] >= fp32_eval["recallAt1"]
            ),
            "notes": (
                "This is a local vector-quantization experiment for the current "
                "RAG dataset. Direct INT8 search avoids dequantizing before "
                "similarity scoring and keeps the Phase 5 path dependency-free."
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--iterations", type=int, default=BENCHMARK_ITERATIONS)
    args = parser.parse_args()

    if args.iterations <= 0:
        raise ValueError("--iterations must be positive")

    args.golden = args.golden.resolve()
    args.registry = args.registry.resolve()
    args.output = args.output.resolve()

    artifact = build_artifact(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)
        handle.write("\n")

    try:
        display_path = args.output.relative_to(REPO_ROOT)
    except ValueError:
        display_path = args.output

    print(f"Wrote {display_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
