import { useEffect } from "react";
import { getConceptById, toDisplayStatus } from "../concepts";
import { ConceptDetailTabs } from "./ConceptDetailTabs";
import "./ConceptModal.css";

interface ConceptModalProps {
  conceptId: string | null;
  onClose: () => void;
  onSelectConcept: (id: string) => void;
  onRunExperiment?: (conceptId: string) => void;
}

export function ConceptModal({ conceptId, onClose, onSelectConcept, onRunExperiment }: ConceptModalProps) {
  const concept = conceptId ? getConceptById(conceptId) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!concept) return null;

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
            {onRunExperiment && (
              <button
                type="button"
                className="concept-btn-experiment"
                onClick={() => onRunExperiment(concept.id)}
                title="Preenche automaticamente os campos para você testar este conceito"
              >
                ▶ Executar
              </button>
            )}
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
          <div className="concept-modal__tabs">
            <ConceptDetailTabs conceptId={concept.id} onSelectConcept={onSelectConcept} />
          </div>
        </div>
      </div>
    </div>
  );
}
