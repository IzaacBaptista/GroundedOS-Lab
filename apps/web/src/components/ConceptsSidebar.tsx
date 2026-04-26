import { useMemo, useState } from "react";
import { getConceptsByCategory, getUniqueCategories } from "../concepts";
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

interface ConceptsSidebarProps {
  onConceptClick: (conceptId: string) => void;
}

export function ConceptsSidebar({ onConceptClick }: ConceptsSidebarProps) {
  const categories = useMemo(() => getUniqueCategories(), []);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(categories.slice(0, 2))
  );

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

  return (
    <aside className="concepts-sidebar" aria-label="Laboratório de conceitos">
      <div className="concepts-sidebar__header">
        <span>Lab de Conceitos</span>
      </div>

      <nav className="concepts-sidebar__nav" aria-label="Categorias">
        {categories.map((category) => {
          const concepts = getConceptsByCategory(category);
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
                <span className="sidebar-category__chevron" aria-hidden="true">
                  {isOpen ? "▾" : "›"}
                </span>
              </button>

              {isOpen && (
                <ul className="sidebar-category__items" role="list">
                  {concepts.map((concept) => (
                    <li key={concept.id}>
                      <button
                        type="button"
                        className="sidebar-concept-btn"
                        onClick={() => onConceptClick(concept.id)}
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
        })}
      </nav>
    </aside>
  );
}
