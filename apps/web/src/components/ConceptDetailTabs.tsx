import { useState } from "react";
import { ConceptDetailPanel } from "./ConceptDetailPanel";
import { DependencyGraph } from "./DependencyGraph";
import { LearningPathPanel } from "./LearningPathPanel";
import "./ConceptDetailTabs.css";

interface ConceptDetailTabsProps {
  conceptId: string | null;
  onSelectConcept: (id: string) => void;
}

type TabId = "details" | "dependencies" | "learning";

export function ConceptDetailTabs({
  conceptId,
  onSelectConcept,
}: ConceptDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("details");

  return (
    <div className="concept-detail-tabs">
      <div className="concept-detail-tabs__header">
        <button
          className={`concept-detail-tabs__tab ${activeTab === "details" ? "concept-detail-tabs__tab--active" : ""}`}
          onClick={() => setActiveTab("details")}
        >
          📋 Detalhes
        </button>
        <button
          className={`concept-detail-tabs__tab ${activeTab === "dependencies" ? "concept-detail-tabs__tab--active" : ""}`}
          onClick={() => setActiveTab("dependencies")}
          disabled={!conceptId}
        >
          🔗 Dependências
        </button>
        <button
          className={`concept-detail-tabs__tab ${activeTab === "learning" ? "concept-detail-tabs__tab--active" : ""}`}
          onClick={() => setActiveTab("learning")}
        >
          🎓 Caminhos
        </button>
      </div>

      <div className="concept-detail-tabs__content">
        {activeTab === "details" && (
          <ConceptDetailPanel
            conceptId={conceptId}
            onSelectConcept={onSelectConcept}
          />
        )}

        {activeTab === "dependencies" && conceptId && (
          <div className="concept-detail-tabs__panel">
            <DependencyGraph conceptId={conceptId} />
          </div>
        )}

        {activeTab === "learning" && (
          <LearningPathPanel />
        )}
      </div>
    </div>
  );
}
