import { useMemo, useState } from "react";
import { getConceptsByCategory, getUniqueCategories } from "../concepts";
import { CONCEPTS } from "../concepts/concepts-data";
import { useConceptsFilter } from "../hooks/useConceptsFilter";
import type { ConceptCategory, ConceptStatus, Concept } from "../concepts/types";
import "./ConceptsSidebar.css";

const CATEGORY_ICONS: Record<string, string> = {
  "Core AI": "🧠",
  "Retrieval & Data": "🔍",
  "Context & Reasoning": "💭",
  "Agents & Execution": "⚡",
  "Optimization": "⚙️",
  "Generation Control": "🎛",
  "Data Engineering": "📦",
  "Performance": "📈",
  "Evaluation & Observability": "📊",
  "Safety & Reliability": "🛡",
  "Multimodality": "🎞",
  "Structured Systems": "🏗",
  "Laboratory Modules": "🧪",
  "Security": "🔒",
  "Unique Features": "✨",
};

const STATUS_DOT: Record<string, string> = {
  implemented: "var(--accent)",
  partial: "var(--amber)",
  planned: "var(--line-strong)",
  stub: "var(--line)",
};

const STATUS_LABELS: Record<ConceptStatus, string> = {
  implemented: "Implementado",
  partial: "Parcial",
  planned: "Planejado",
  stub: "Esboço",
};

interface ConceptsSidebarProps {
  onConceptClick: (conceptId: string) => void;
}

export function ConceptsSidebar({ onConceptClick }: ConceptsSidebarProps) {
  const allCategories = useMemo(() => getUniqueCategories(), []);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allCategories.slice(0, 2))
  );
  const [showFilters, setShowFilters] = useState(false);

  const {
    filter,
    filteredConcepts,
    setSearch,
    setCategory,
    setStatus,
    clearFilters,
    isFiltered,
    total,
  } = useConceptsFilter();

  const toggle = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // Group filtered concepts by category
  const groupedConcepts = useMemo(() => {
    const groups: Record<string, typeof filteredConcepts> = {};
    filteredConcepts.forEach((concept: Concept) => {
      if (!groups[concept.category]) {
        groups[concept.category] = [];
      }
      groups[concept.category].push(concept);
    });
    return groups;
  }, [filteredConcepts]);

  // Get categories that have at least one filtered concept
  const visibleCategories = useMemo(() => {
    return allCategories.filter((cat) => groupedConcepts[cat]?.length > 0);
  }, [allCategories, groupedConcepts]);

  return (
    <aside className="concepts-sidebar" aria-label="Laboratório de conceitos">
      <div className="concepts-sidebar__header">
        <span>Lab de Conceitos</span>
        <button
          className="concepts-sidebar__filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
          title={showFilters ? "Fechar filtros" : "Abrir filtros"}
          aria-label="Toggle filters"
        >
          {isFiltered ? "🔽" : "🔻"}
        </button>
      </div>

      {showFilters && (
        <div className="concepts-sidebar__filters">
          {/* Search */}
          <div className="filter-group">
            <label htmlFor="concept-search" className="filter-group__label">
              Buscar
            </label>
            <input
              id="concept-search"
              type="text"
              className="filter-group__input"
              placeholder="Título ou descrição..."
              value={filter.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="filter-group">
            <label htmlFor="concept-category" className="filter-group__label">
              Categoria
            </label>
            <select
              id="concept-category"
              className="filter-group__select"
              value={filter.category || ""}
              onChange={(e) =>
                setCategory((e.target.value as ConceptCategory) || null)
              }
            >
              <option value="">Todas</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="filter-group">
            <label htmlFor="concept-status" className="filter-group__label">
              Status
            </label>
            <select
              id="concept-status"
              className="filter-group__select"
              value={filter.status || ""}
              onChange={(e) =>
                setStatus((e.target.value as ConceptStatus) || null)
              }
            >
              <option value="">Todos</option>
              {(
                [
                  "implemented",
                  "partial",
                  "planned",
                  "stub",
                ] as const
              ).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          {/* Clear */}
          {isFiltered && (
            <button
              className="concepts-sidebar__clear-btn"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          )}

          <div className="concepts-sidebar__filter-count">
            Mostrando {total} de {allCategories.length} categorias
          </div>
        </div>
      )}

      <nav className="concepts-sidebar__nav" aria-label="Categorias">
        {visibleCategories.length === 0 ? (
          <div className="concepts-sidebar__empty">
            Nenhum conceito encontrado
          </div>
        ) : (
          visibleCategories.map((category) => {
            const concepts = groupedConcepts[category] || [];
            const isOpen = expanded.has(category);
            const icon = CATEGORY_ICONS[category] ?? "●";

            return (
              <div key={category} className="sidebar-category">
                <button
                  type="button"
                  className={`sidebar-category__btn${isOpen ? " sidebar-category__btn--open" : ""}`}
                  onClick={() => toggle(category)}
                  aria-expanded={isOpen}
                >
                  <span className="sidebar-category__icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="sidebar-category__name">{category}</span>
                  <span className="sidebar-category__count">
                    ({concepts.length})
                  </span>
                  <span
                    className="sidebar-category__chevron"
                    aria-hidden="true"
                  >
                    {isOpen ? "▾" : "›"}
                  </span>
                </button>

                {isOpen && (
                  <ul className="sidebar-category__items" role="list">
                    {concepts.map((concept: Concept) => (
                      <li key={concept.id}>
                        <button
                          type="button"
                          className="sidebar-concept-btn"
                          onClick={() => onConceptClick(concept.id)}
                          title={concept.shortDefinition}
                        >
                          <span
                            className="sidebar-concept-btn__dot"
                            style={{ background: STATUS_DOT[concept.status] }}
                            aria-hidden="true"
                          />
                          {concept.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}
