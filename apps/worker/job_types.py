"""
Job payload types for GroundedOS worker.

Mirrors the TypeScript definitions in apps/api/src/jobs/job-queue.ts.
Any change to the TypeScript types must be reflected here.
"""
from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, Field


class Phase5ExperimentPayload(BaseModel):
    type: Literal["phase5-experiment"]
    track: Literal["quantization", "lora", "fine-tuning", "distillation"]
    _otel_context: str | None = Field(default=None, alias="_otel_context")

    model_config = {"populate_by_name": True}


class ModelBenchmarkPayload(BaseModel):
    type: Literal["model-benchmark"]
    providers: list[str]
    _otel_context: str | None = Field(default=None, alias="_otel_context")

    model_config = {"populate_by_name": True}


JobPayload = Union[Phase5ExperimentPayload, ModelBenchmarkPayload]


def parse_payload(raw: dict) -> JobPayload:
    """Discriminate and validate a raw BullMQ job data dict."""
    job_type = raw.get("type")
    if job_type == "phase5-experiment":
        return Phase5ExperimentPayload.model_validate(raw)
    if job_type == "model-benchmark":
        return ModelBenchmarkPayload.model_validate(raw)
    raise ValueError(f"Unknown job type: {job_type!r}")
