from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any


LOGGER = logging.getLogger("groundedos.worker.queue")


def log_queue_event(event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": "worker",
        "event": event,
        **fields,
    }

    level = logging.ERROR if event == "job_failed" else logging.INFO
    LOGGER.log(level, json.dumps(payload, default=str))
