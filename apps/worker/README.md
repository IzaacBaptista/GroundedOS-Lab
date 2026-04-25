# worker

Background worker responsible for asynchronous and compute-intensive AI tasks. Runs ML pipelines independently from the API server.

## Responsibilities

- Process document ingestion and ETL jobs
- Run embedding generation and indexing pipelines
- Execute fine-tuning and experiment jobs
- Handle queue-based task consumption (e.g. BullMQ / Redis)

## Status

In progress (Phase 6 scaffold). Docker image, Python entrypoint and dependency
baseline are in place; queue-backed job execution is the next step.
