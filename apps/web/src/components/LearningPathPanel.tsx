import { LEARNING_PATHS } from "../concepts/concepts-data";
import { getConceptById } from "../concepts";

interface LearningPathPanelProps {
  onSelectConcept: (conceptId: string) => void;
}

const DIFFICULTY_LABEL: Record<"beginner" | "intermediate" | "advanced", string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

export function LearningPathPanel({ onSelectConcept }: LearningPathPanelProps) {
  return (
    <section className="learning-path-panel" aria-label="Trilhas de aprendizado">
      <h3>Trilhas de Aprendizado</h3>
      <div className="learning-path-list">
        {LEARNING_PATHS.map((path) => (
          <article key={path.id} className="learning-path-item">
            <div className="learning-path-head">
              <h4>{path.title}</h4>
              <span className={`learning-path-difficulty difficulty-${path.difficulty}`}>
                {DIFFICULTY_LABEL[path.difficulty]}
              </span>
            </div>
            <p>{path.description}</p>
            <div className="learning-path-concepts">
              {path.conceptIds.map((conceptId) => {
                const concept = getConceptById(conceptId);
                if (!concept) {
                  return null;
                }

                return (
                  <button
                    key={`${path.id}-${conceptId}`}
                    type="button"
                    className="learning-path-concept"
                    onClick={() => onSelectConcept(conceptId)}
                  >
                    {concept.title}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
