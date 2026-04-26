export type ConceptStatus = "implemented" | "partial" | "planned" | "stub";

export type ConceptCategory =
  | "Core AI"
  | "Retrieval & Data"
  | "Context & Reasoning"
  | "Agents & Execution"
  | "Optimization"
  | "Generation Control"
  | "Data Engineering"
  | "Performance"
  | "Evaluation & Observability"
  | "Safety & Reliability"
  | "Multimodality"
  | "Structured Systems"
  | "Laboratory Modules"
  | "Security"
  | "Unique Features";

export interface Concept {
  id: string;
  title: string;
  category: ConceptCategory;
  status: ConceptStatus;

  shortDefinition: string;
  explanation: string;
  whyItMatters: string;

  howToStudy: string[];
  howToPracticeInProject: string[];
  appliedInGroundedOS: string[];
  visibleInCurrentData: string[];
  whereToSeeInUI: string[];
  suggestedExperiments: string[];
  tradeoffsAndLimitations: string[];
  relatedFiles: string[];

  dependsOn?: string[];
  nextConcepts?: string[];
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  conceptIds: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}
