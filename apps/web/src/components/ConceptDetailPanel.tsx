import { getConceptById, getRelatedConcepts, toDisplayStatus } from "../concepts";
import { ConceptBadgeGroup } from "./ConceptBadge";

interface ConceptDetailPanelProps {
  conceptId: string | null;
  onSelectConcept: (id: string) => void;
}

interface DetailListProps {
  title: string;
  values: string[];
}

function DetailList({ title, values }: DetailListProps) {
  if (!values.length) {
    return null;
  }

  return (
    <section className="concept-detail-section">
      <h4>{title}</h4>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

export function ConceptDetailPanel({ conceptId, onSelectConcept }: ConceptDetailPanelProps) {
  const concept = conceptId ? getConceptById(conceptId) : undefined;

  if (!concept) {
    return (
      <section className="concept-detail-panel" aria-label="Concept details">
        <h3>Concept Detail</h3>
        <p className="concept-detail-empty">Select a concept to explore where it appears, how to test it, and what trade-offs it introduces.</p>
      </section>
    );
  }

  const related = getRelatedConcepts(concept.id);

  return (
    <section className="concept-detail-panel" aria-label="Concept details">
      <div className="concept-detail-header">
        <div>
          <h3>{concept.title}</h3>
          <p>{concept.shortDefinition}</p>
        </div>
        <span className="tag">{toDisplayStatus(concept.status)}</span>
      </div>

      <section className="concept-detail-section">
        <h4>Why it matters</h4>
        <p>{concept.whyItMatters}</p>
      </section>

      <section className="concept-detail-section">
        <h4>How it works</h4>
        <p>{concept.explanation}</p>
      </section>

      <DetailList title="How to study" values={concept.howToStudy} />
      <DetailList title="How to practice in GroundedOS" values={concept.howToPracticeInProject} />
      <DetailList title="Applied in project" values={concept.appliedInGroundedOS} />
      <DetailList title="Visible in current data" values={concept.visibleInCurrentData} />
      <DetailList title="Where to see in UI" values={concept.whereToSeeInUI} />
      <DetailList title="Suggested experiments" values={concept.suggestedExperiments} />
      <DetailList title="Trade-offs and limitations" values={concept.tradeoffsAndLimitations} />
      <DetailList title="Related files" values={concept.relatedFiles} />

      {related.length > 0 && (
        <section className="concept-detail-section">
          <h4>Related concepts</h4>
          <ConceptBadgeGroup conceptIds={related.map((item) => item.id)} onClick={onSelectConcept} small />
        </section>
      )}
    </section>
  );
}
