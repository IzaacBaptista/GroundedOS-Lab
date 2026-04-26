import { useEffect } from "react";
import { getConceptById, getRelatedConcepts, toDisplayStatus } from "../concepts";
import { ConceptBadgeGroup } from "./ConceptBadge";
import "./ConceptModal.css";

interface ConceptModalProps {
  conceptId: string | null;
  onClose: () => void;
  onSelectConcept: (id: string) => void;
}

interface SectionListProps {
  title: string;
  values: string[];
}

function SectionList({ title, values }: SectionListProps) {
  if (!values.length) return null;

  return (
    <div className="concept-modal__section">
      <h4>{title}</h4>
      <ul>
        {values.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    </div>
  );
}

export function ConceptModal({ conceptId, onClose, onSelectConcept }: ConceptModalProps) {
  const concept = conceptId ? getConceptById(conceptId) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!concept) return null;

  const related = getRelatedConcepts(concept.id);

  return (
    <div
      className="concept-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={concept.title}
    >
      <div
        className="concept-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="concept-modal__header">
          <div className="concept-modal__title-group">
            <h2>{concept.title}</h2>
            <p>{concept.shortDefinition}</p>
          </div>
          <div className="concept-modal__header-actions">
            <span className="tag">{toDisplayStatus(concept.status)}</span>
            <button
              type="button"
              className="concept-modal__close"
              onClick={onClose}
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="concept-modal__body">
          <div className="concept-modal__col concept-modal__col--left">
            <div className="concept-modal__section">
              <h4>Por que importa</h4>
              <p>{concept.whyItMatters}</p>
            </div>

            <div className="concept-modal__section">
              <h4>Como funciona</h4>
              <p>{concept.explanation}</p>
            </div>

            <SectionList title="Como estudar" values={concept.howToStudy} />
            <SectionList title="Como praticar no GroundedOS" values={concept.howToPracticeInProject} />
          </div>

          <div className="concept-modal__col concept-modal__col--right">
            <SectionList title="Aplicado no projeto" values={concept.appliedInGroundedOS} />
            <SectionList title="Visível nos dados atuais" values={concept.visibleInCurrentData} />
            <SectionList title="Onde ver na UI" values={concept.whereToSeeInUI} />
            <SectionList title="Trade-offs e limitações" values={concept.tradeoffsAndLimitations} />
            <SectionList title="Experimentos sugeridos" values={concept.suggestedExperiments} />
            <SectionList title="Arquivos relacionados" values={concept.relatedFiles} />

            {related.length > 0 && (
              <div className="concept-modal__section">
                <h4>Conceitos relacionados</h4>
                <ConceptBadgeGroup
                  conceptIds={related.map((c) => c.id)}
                  onClick={onSelectConcept}
                  small
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
