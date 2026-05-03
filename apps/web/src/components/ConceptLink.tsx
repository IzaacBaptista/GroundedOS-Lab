import { getConceptById } from "../concepts";
import "./ConceptLink.css";

interface ConceptLinkProps {
  conceptId: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function ConceptLink({ conceptId, onClick, children }: ConceptLinkProps) {
  const concept = getConceptById(conceptId);
  
  if (!concept) return <span>{children || conceptId}</span>;

  return (
    <button
      className="concept-link"
      onClick={onClick}
      title={concept.shortDefinition}
      type="button"
    >
      {children || concept.title}
    </button>
  );
}
