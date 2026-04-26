import { Concept, ConceptCategory } from "./types";
import { CONCEPTS, LEARNING_PATHS } from "./concepts-data";

export function getConceptById(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id);
}

export function getConceptsByCategory(category: ConceptCategory): Concept[] {
  return CONCEPTS.filter((c) => c.category === category);
}

export function getImplementedConcepts(): Concept[] {
  return CONCEPTS.filter((c) => c.status === "implemented");
}

export function searchConcepts(query: string): Concept[] {
  const q = query.toLowerCase();
  return CONCEPTS.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.shortDefinition.toLowerCase().includes(q) ||
      c.explanation.toLowerCase().includes(q)
  );
}

export function getUniqueCategories(): ConceptCategory[] {
  const categories = new Set(CONCEPTS.map((c) => c.category));
  return Array.from(categories) as ConceptCategory[];
}

export function getConceptsByStatus(status: "implemented" | "partial" | "planned" | "stub"): Concept[] {
  return CONCEPTS.filter((c) => c.status === status);
}

export function getRelatedConcepts(conceptId: string): Concept[] {
  const concept = getConceptById(conceptId);
  if (!concept) return [];

  const next = concept.nextConcepts?.map(getConceptById).filter(Boolean) as Concept[];
  const deps = concept.dependsOn?.map(getConceptById).filter(Boolean) as Concept[];
  return [...(deps || []), ...(next || [])];
}

export function getLearningPath(pathId: string) {
  return LEARNING_PATHS.find((p) => p.id === pathId);
}

export function toDisplayStatus(status: string): string {
  const map: Record<string, string> = {
    implemented: "✅ Implemented",
    partial: "🟡 Partial",
    planned: "🔲 Planned",
    stub: "⚪ Stub",
  };
  return map[status] || status;
}
