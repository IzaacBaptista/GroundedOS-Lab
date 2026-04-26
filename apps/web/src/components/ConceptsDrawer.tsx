import { useMemo, useState } from "react";
import {
  getUniqueCategories,
  searchConcepts,
  toDisplayStatus,
} from "../concepts";
import { CONCEPTS } from "../concepts/concepts-data";
import type { ConceptStatus } from "../concepts/types";
import { ConceptDetailPanel } from "./ConceptDetailPanel";
import { LearningPathPanel } from "./LearningPathPanel";
import "./ConceptsDrawer.css";

interface ConceptsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedConceptId: string | null;
  onSelectConcept: (id: string) => void;
}

const STATUS_FILTERS: Array<{ label: string; value: "all" | ConceptStatus }> = [
  { label: "All", value: "all" },
  { label: "Implemented", value: "implemented" },
  { label: "Partial", value: "partial" },
  { label: "Planned", value: "planned" },
  { label: "Stub", value: "stub" },
];

export function ConceptsDrawer({
  isOpen,
  onClose,
  selectedConceptId,
  onSelectConcept,
}: ConceptsDrawerProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ConceptStatus>("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = useMemo(() => getUniqueCategories(), []);

  const filtered = useMemo(() => {
    const byText = query.trim() ? searchConcepts(query.trim()) : CONCEPTS;

    return byText.filter((concept) => {
      const categoryMatch = activeCategory === "all" || concept.category === activeCategory;
      const statusMatch = status === "all" || concept.status === status;
      return categoryMatch && statusMatch;
    });
  }, [activeCategory, query, status]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="concepts-drawer" aria-label="Concepts lab">
      <div className="concepts-drawer__backdrop" onClick={onClose} aria-hidden="true" />

      <div className="concepts-drawer__panel">
        <header className="concepts-drawer__header">
          <div>
            <h2>Concepts Lab</h2>
            <p>From term definitions to hands-on checks in this app.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="concepts-drawer__content">
          <section className="concepts-drawer__left" aria-label="Concept list and filters">
            <label className="field field--compact">
              <span>Search concepts</span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try: RAG, embeddings, guardrails"
              />
            </label>

            <div className="concept-filter-row" role="radiogroup" aria-label="Status filter">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`result-tab${status === item.value ? " result-tab--active" : ""}`}
                  onClick={() => setStatus(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="concept-category-list" role="listbox" aria-label="Categories">
              <button
                type="button"
                className={`concept-category-item${activeCategory === "all" ? " concept-category-item--active" : ""}`}
                onClick={() => setActiveCategory("all")}
              >
                All categories
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`concept-category-item${activeCategory === category ? " concept-category-item--active" : ""}`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="concept-search-results" aria-label="Matching concepts">
              <p className="chunk-text">{filtered.length} concept(s) found.</p>
              {filtered.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className={`concept-list-item${selectedConceptId === concept.id ? " concept-list-item--active" : ""}`}
                  onClick={() => onSelectConcept(concept.id)}
                >
                  <div>
                    <strong>{concept.title}</strong>
                    <p>{concept.shortDefinition}</p>
                  </div>
                  <span className="tag">{toDisplayStatus(concept.status)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="concepts-drawer__right" aria-label="Concept details">
            <ConceptDetailPanel conceptId={selectedConceptId} onSelectConcept={onSelectConcept} />
            <LearningPathPanel onSelectConcept={onSelectConcept} />
          </section>
        </div>
      </div>
    </aside>
  );
}
