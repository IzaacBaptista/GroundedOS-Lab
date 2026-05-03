import { getConceptById } from "../concepts";
import "./ConceptBadge.css";

interface ConceptBadgeProps {
  conceptId: string;
  onClick?: () => void;
  small?: boolean;
}

export function ConceptBadge({ conceptId, onClick, small = false }: ConceptBadgeProps) {
  const concept = getConceptById(conceptId);
  
  if (!concept) return null;

  const statusClass = `badge-${concept.status}`;
  const sizeClass = small ? "concept-badge--small" : "";

  return (
    <button
      className={`concept-badge ${statusClass} ${sizeClass}`}
      onClick={onClick}
      title={concept.shortDefinition}
      type="button"
      aria-label={`Aprender sobre ${concept.title}`}
    >
      <span className="badge-dot" />
      <span className="badge-text">{concept.title}</span>
    </button>
  );
}

export function ConceptBadgeGroup({
  conceptIds,
  onClick,
  small = false,
}: {
  conceptIds: string[];
  onClick?: (id: string) => void;
  small?: boolean;
}) {
  return (
    <div className="concept-badge-group">
      {conceptIds.map((id) => (
        <ConceptBadge
          key={id}
          conceptId={id}
          onClick={() => onClick?.(id)}
          small={small}
        />
      ))}
    </div>
  );
}
