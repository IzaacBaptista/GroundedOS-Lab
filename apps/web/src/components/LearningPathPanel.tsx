import { getConceptById } from "../concepts";
import { useLearningProgress } from "../hooks/useLearningProgress";
import "./LearningPathPanel.css";

interface LearningPathPanelProps {
  onSelectConcept: (conceptId: string) => void;
}

const DIFFICULTY_LABEL: Record<"beginner" | "intermediate" | "advanced", string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

export function LearningPathPanel({ onSelectConcept }: LearningPathPanelProps) {
  const {
    progress,
    markViewed,
    markLearned,
    getPathsWithProgress,
    getRecommendedPath,
    getMissingPrerequisites,
    totalViewed,
    totalLearned,
    getStreak,
  } = useLearningProgress();

  const recommended = getRecommendedPath();
  const paths = getPathsWithProgress();

  const handleConceptOpen = (conceptId: string) => {
    markViewed(conceptId);
    onSelectConcept(conceptId);
  };

  return (
    <section className="learning-path-panel" aria-label="Trilhas de aprendizado">
      <h3>Trilhas de Aprendizado</h3>
      <div className="learning-path-stats" aria-label="Resumo do seu progresso">
        <span>{totalViewed} vistos</span>
        <span>{totalLearned} aprendidos</span>
        <span>streak {getStreak()} dia(s)</span>
      </div>

      {recommended && (
        <div className="learning-path-recommendation" role="note" aria-label="Recomendacao de trilha">
          <strong>Proxima trilha sugerida: {recommended.path.title}</strong>
          <p>{recommended.reason}</p>
        </div>
      )}

      <div className="learning-path-list">
        {paths.map((path) => {
          const missingPrerequisites = getMissingPrerequisites(path.id);

          return (
            <article key={path.id} className="learning-path-item">
              <div className="learning-path-head">
                <h4>{path.title}</h4>
                <span className={`learning-path-difficulty difficulty-${path.difficulty}`}>
                  {DIFFICULTY_LABEL[path.difficulty]}
                </span>
              </div>

              <div className="learning-path-progress" aria-label={`Progresso da trilha ${path.title}`}>
                <div className="learning-path-progress__meta">
                  <span>{path.progress.completed}/{path.progress.total} aprendidos</span>
                  <span>{path.progress.percentage}%</span>
                </div>
                <div className="learning-path-progress__track" role="progressbar" aria-valuenow={path.progress.percentage} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className="learning-path-progress__fill"
                    style={{ width: `${path.progress.percentage}%` }}
                  />
                </div>
              </div>

              <p>{path.description}</p>

              {missingPrerequisites.length > 0 && (
                <div className="learning-path-prerequisites">
                  <span>Pre-requisitos faltando:</span>
                  <div className="learning-path-prerequisites__list">
                    {missingPrerequisites.slice(0, 4).map((concept) => (
                      <button
                        key={`${path.id}-prereq-${concept.id}`}
                        type="button"
                        className="learning-path-prerequisite"
                        onClick={() => handleConceptOpen(concept.id)}
                      >
                        {concept.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="learning-path-concepts">
                {path.conceptIds.map((conceptId) => {
                  const concept = getConceptById(conceptId);
                  if (!concept) {
                    return null;
                  }

                  const isLearned = Boolean(progress[conceptId]?.learned);

                  return (
                    <div key={`${path.id}-${conceptId}`} className="learning-path-concept-item">
                      <button
                        type="button"
                        className="learning-path-concept"
                        onClick={() => handleConceptOpen(conceptId)}
                      >
                        {concept.title}
                      </button>
                      <button
                        type="button"
                        className={`learning-path-mark-btn${isLearned ? " learning-path-mark-btn--done" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          markLearned(conceptId);
                        }}
                        aria-pressed={isLearned}
                      >
                        {isLearned ? "Aprendido" : "Marcar aprendido"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
