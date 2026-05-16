import { useMemo, useState, useCallback, useEffect } from "react";
import { CONCEPTS } from "../concepts/concepts-data";
import type { Concept, ConceptCategory, ConceptStatus } from "../concepts/types";

export interface ConceptsFilterState {
  search: string;
  category: ConceptCategory | null;
  status: ConceptStatus | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
}

export function useConceptsFilter() {
  const [filter, setFilter] = useState<ConceptsFilterState>(() => {
    // Try to restore from localStorage
    try {
      const saved = localStorage.getItem("conceptsFilter");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore parsing errors
    }
    return {
      search: "",
      category: null,
      status: null,
      difficulty: null,
    };
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("conceptsFilter", JSON.stringify(filter));
  }, [filter]);

  const filteredConcepts = useMemo(() => {
    const all = CONCEPTS;

    return all.filter((concept: Concept) => {
      // Search filter (title + shortDefinition)
      if (filter.search) {
        const query = filter.search.toLowerCase();
        const matches =
          concept.title.toLowerCase().includes(query) ||
          concept.shortDefinition.toLowerCase().includes(query) ||
          concept.explanation.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // Category filter
      if (filter.category && concept.category !== filter.category) {
        return false;
      }

      // Status filter
      if (filter.status && concept.status !== filter.status) {
        return false;
      }

      // Difficulty filter (inferred from learning paths)
      if (filter.difficulty) {
        // This would require looking up which learning paths include this concept
        // For now, we'll implement a simplified version
        // TODO: Implement difficulty inference from learning paths
      }

      return true;
    });
  }, [filter]);

  const updateFilter = useCallback(
    (updates: Partial<ConceptsFilterState>) => {
      setFilter((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilter({
      search: "",
      category: null,
      status: null,
      difficulty: null,
    });
  }, []);

  const setSearch = useCallback((search: string) => {
    updateFilter({ search });
  }, [updateFilter]);

  const setCategory = useCallback((category: ConceptCategory | null) => {
    updateFilter({ category });
  }, [updateFilter]);

  const setStatus = useCallback((status: ConceptStatus | null) => {
    updateFilter({ status });
  }, [updateFilter]);

  const setDifficulty = useCallback(
    (difficulty: "beginner" | "intermediate" | "advanced" | null) => {
      updateFilter({ difficulty });
    },
    [updateFilter]
  );

  const isFiltered = useMemo(() => {
    return (
      filter.search !== "" ||
      filter.category !== null ||
      filter.status !== null ||
      filter.difficulty !== null
    );
  }, [filter]);

  return {
    filter,
    filteredConcepts,
    updateFilter,
    clearFilters,
    setSearch,
    setCategory,
    setStatus,
    setDifficulty,
    isFiltered,
    total: filteredConcepts.length,
  };
}
