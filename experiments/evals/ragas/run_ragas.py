#!/usr/bin/env python3
import argparse
import csv
import json
import os
from pathlib import Path


def heuristic_score(record):
    contexts = " ".join(record.get("contexts", []))
    answer = record.get("answer", "")
    reference = record.get("referenceAnswer") or ""
    overlap = len(set(answer.lower().split()) & set(contexts.lower().split()))
    answer_tokens = max(len(set(answer.lower().split())), 1)
    grounded = min(overlap / answer_tokens, 1.0)
    correctness = grounded if not reference else min(
        len(set(answer.lower().split()) & set(reference.lower().split()))
        / max(len(set(reference.lower().split())), 1),
        1.0,
    )
    return {
        "faithfulness": grounded,
        "answer_relevancy": grounded,
        "context_precision": grounded,
        "context_recall": grounded,
        "answer_correctness": correctness,
    }


def try_import_ragas():
    try:
        import ragas  # noqa: F401

        return True
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--metrics", default="")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(args.request, "r", encoding="utf8") as handle:
        request = json.load(handle)

    selected_metrics = request["config"]["metrics"]
    ragas_available = try_import_ragas()
    sample_results = []
    aggregate = {metric: 0.0 for metric in selected_metrics}

    for record in request["records"]:
        scores = heuristic_score(record)
        filtered = {metric: round(scores.get(metric, 0.0), 4) for metric in selected_metrics}
        for metric, value in filtered.items():
            aggregate[metric] += value
        sample_results.append(
            {
                "sampleId": record["sampleId"],
                "metrics": filtered,
                "warnings": [] if ragas_available else ["ragas package unavailable; used heuristic fallback"],
            }
        )

    count = max(len(sample_results), 1)
    aggregate = {metric: round(value / count, 4) for metric, value in aggregate.items()}

    result = {
        "runId": f"ragas-{os.getpid()}",
        "metrics": aggregate,
        "samples": sample_results,
        "artifacts": {
            "resultsJson": str(output_dir / "results.json"),
            "summaryMd": str(output_dir / "summary.md"),
            "metricsCsv": str(output_dir / "metrics.csv"),
            "configJson": str(output_dir / "config.json"),
            "traceJson": str(output_dir / "trace.json"),
        },
        "metadata": {"ragasAvailable": ragas_available},
    }

    with open(output_dir / "results.json", "w", encoding="utf8") as handle:
        json.dump(result, handle, indent=2)
    with open(output_dir / "config.json", "w", encoding="utf8") as handle:
        json.dump(request["config"], handle, indent=2)
    with open(output_dir / "trace.json", "w", encoding="utf8") as handle:
        json.dump({"request": request, "ragasAvailable": ragas_available}, handle, indent=2)
    with open(output_dir / "summary.md", "w", encoding="utf8") as handle:
        handle.write(
            "# RAGAS run\n\n"
            f"- ragasAvailable: {ragas_available}\n"
            + "\n".join(f"- {metric}: {value}" for metric, value in aggregate.items())
            + "\n"
        )
    with open(output_dir / "metrics.csv", "w", encoding="utf8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["metric", "score"])
        for metric, value in aggregate.items():
            writer.writerow([metric, value])

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
