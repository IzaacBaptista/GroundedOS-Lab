import { useCallback, useEffect, useState } from "react";
import { deleteIndex, listIndexes } from "../api/client";
import type { PersistedRagIndexListItem } from "../api/types";

export function useIndexList(): {
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
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load indexes."
      );
    }
  }, []);

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
