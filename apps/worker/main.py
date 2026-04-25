import os
import time
from datetime import datetime


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    postgres_url = os.getenv("POSTGRES_URL", "postgresql://localhost:5432/groundedos")

    print("[worker] GroundedOS worker started")
    print(f"[worker] REDIS_URL: {redis_url}")
    print(f"[worker] POSTGRES_URL: {postgres_url}")

    while True:
        print(f"[worker] heartbeat {datetime.utcnow().isoformat()}Z")
        time.sleep(30)


if __name__ == "__main__":
    main()
