import { useCallback, useEffect, useState } from "react";
import { deleteIndex, listIndexes } from "../api/client";
import { ApiHttpError } from "../api/types";
import type { PersistedRagIndexListItem } from "../api/types";

export function useIndexList(onAuthError?: (error: ApiHttpError) => void): {
  indexes: PersistedRagIndexListItem[];
  refresh: () => Promise<void>;
  remove: (documentId: string) => Promise<void>;
  error: string | undefined;
} {
  const [indexes, setIndexes] = useState<PersistedRagIndexListItem[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const response = await listIndexes();
      setIndexes(Array.isArray(response.indexes) ? response.indexes : []);
      setError(undefined);
    } catch (caughtError) {
      setIndexes([]);
      if (
        caughtError instanceof ApiHttpError &&
        (caughtError.status === 401 || caughtError.status === 403)
      ) {
        onAuthError?.(caughtError);
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load indexes."
      );
    }
  }, [onAuthError]);

  const remove = useCallback(
    async (documentId: string) => {
      await deleteIndex(documentId);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { indexes, refresh, remove, error };
}
