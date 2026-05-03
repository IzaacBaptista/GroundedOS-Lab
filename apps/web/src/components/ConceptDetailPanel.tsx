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
      <section className="concept-detail-panel" aria-label="Detalhes do conceito">
        <h3>Detalhes do Conceito</h3>
        <p className="concept-detail-empty">Selecione um conceito para ver onde ele aparece, como testar e quais trade-offs ele introduz.</p>
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
        <h4>Por que importa</h4>
        <p>{concept.whyItMatters}</p>
      </section>

      <section className="concept-detail-section">
        <h4>Como funciona</h4>
        <p>{concept.explanation}</p>
      </section>

      <DetailList title="Como estudar" values={concept.howToStudy} />
      <DetailList title="Como praticar no GroundedOS" values={concept.howToPracticeInProject} />
      <DetailList title="Aplicado no projeto" values={concept.appliedInGroundedOS} />
      <DetailList title="Visível nos dados atuais" values={concept.visibleInCurrentData} />
      <DetailList title="Onde ver na UI" values={concept.whereToSeeInUI} />
      <DetailList title="Experimentos sugeridos" values={concept.suggestedExperiments} />
      <DetailList title="Trade-offs e limitações" values={concept.tradeoffsAndLimitations} />
      <DetailList title="Arquivos relacionados" values={concept.relatedFiles} />

      {related.length > 0 && (
        <section className="concept-detail-section">
          <h4>Conceitos relacionados</h4>
          <ConceptBadgeGroup conceptIds={related.map((item) => item.id)} onClick={onSelectConcept} small />
        </section>
      )}
    </section>
  );
}
