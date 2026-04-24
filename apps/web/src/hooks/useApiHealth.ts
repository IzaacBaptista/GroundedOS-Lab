import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth } from "../api/client";

export type HealthStatus = "checking" | "online" | "offline";

const POLL_INTERVAL_MS = 10_000;

/**
 * Periodically polls the backend `/health` endpoint and exposes a
 * user-friendly status enum. Mirrors the behaviour of `checkApiHealth` +
 * `startHealthPolling` in the pre-React `app.js`.
 */
export function useApiHealth(): {
  status: HealthStatus;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<HealthStatus>("checking");
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) {
      return;
    }

    setStatus("checking");

    try {
      await checkHealth();
      if (mountedRef.current) {
        setStatus("online");
      }
    } catch {
      if (mountedRef.current) {
        setStatus("offline");
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const handle = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(handle);
    };
  }, [refresh]);

  return { status, refresh };
}
