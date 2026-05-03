import { describe, it, expect } from "vitest";
import { CONCEPTS, LEARNING_PATHS } from "./concepts-data";
import { getUniqueCategories } from ".";

describe("Concepts Data Layer", () => {
  describe("CONCEPTS array", () => {
    it("should have at least 30 concepts", () => {
      expect(CONCEPTS.length).toBeGreaterThanOrEqual(30);
    });

    it("should have all required fields for each concept", () => {
      CONCEPTS.forEach((concept) => {
        expect(concept).toHaveProperty("id");
        expect(concept).toHaveProperty("title");
        expect(concept).toHaveProperty("category");
        expect(concept).toHaveProperty("status");
        expect(concept).toHaveProperty("shortDefinition");
        expect(concept).toHaveProperty("explanation");
        expect(concept).toHaveProperty("whyItMatters");
        expect(concept).toHaveProperty("howToStudy");
        expect(concept).toHaveProperty("howToPracticeInProject");
        expect(concept).toHaveProperty("appliedInGroundedOS");
        expect(concept).toHaveProperty("visibleInCurrentData");
        expect(concept).toHaveProperty("whereToSeeInUI");
        expect(concept).toHaveProperty("suggestedExperiments");
        expect(concept).toHaveProperty("tradeoffsAndLimitations");
        expect(concept).toHaveProperty("relatedFiles");
      });
    });

    it("should have valid status values", () => {
      CONCEPTS.forEach((concept) => {
        expect(["implemented", "partial", "planned", "stub"]).toContain(
          concept.status
        );
      });
    });

    it("should have unique concept IDs", () => {
      const ids = CONCEPTS.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have all required implementation concepts", () => {
      const requiredConcepts = [
        "rag",
        "chunking",
        "embeddings",
        "vector-database",
        "grounding",
        "guardrails",
        "cost-analysis",
        "observability",
        "tool-calling",
        "fine-tuning",
        "lora",
        "quantization",
        "distillation",
        "etl",
        "uniform-document-schema",
      ];

      const conceptIds = CONCEPTS.map((c) => c.id);
      requiredConcepts.forEach((id) => {
        expect(conceptIds).toContain(id);
      });
    });

    it("should have testingSteps for implemented and partial concepts", () => {
      const implementedOrPartial = CONCEPTS.filter(
        (c) => c.status === "implemented" || c.status === "partial"
      );

      implementedOrPartial.forEach((concept) => {
        if (concept.testingSteps) {
          expect(concept.testingSteps.length).toBeGreaterThan(0);
          expect(concept.testingSteps[0]).toMatch(/^\d\./);
        }
      });
    });

    it("should have all categories with at least one concept", () => {
      const categories = getUniqueCategories();

      categories.forEach((category) => {
        const hasConceptInCategory = CONCEPTS.some(
          (c) => c.category === category
        );
        expect(hasConceptInCategory).toBe(true);
      });
    });
  });

  describe("LEARNING_PATHS array", () => {
    it("should have at least 6 learning paths", () => {
      expect(LEARNING_PATHS.length).toBeGreaterThanOrEqual(6);
    });

    it("should have 'Comece por aqui' path", () => {
      const starterPath = LEARNING_PATHS.find((p) => p.id === "comece-por-aqui");
      expect(starterPath).toBeDefined();
      expect(starterPath?.difficulty).toBe("beginner");
      expect(starterPath?.conceptIds.length).toBeGreaterThan(0);
    });

    it("should have valid path structures", () => {
      LEARNING_PATHS.forEach((path) => {
        expect(path).toHaveProperty("id");
        expect(path).toHaveProperty("title");
        expect(path).toHaveProperty("description");
        expect(path).toHaveProperty("conceptIds");
        expect(path).toHaveProperty("difficulty");
        expect(["beginner", "intermediate", "advanced"]).toContain(
          path.difficulty
        );
      });
    });

    it("should reference only valid concept IDs", () => {
      const validConceptIds = new Set(CONCEPTS.map((c) => c.id));

      LEARNING_PATHS.forEach((path) => {
        const invalidForPath = path.conceptIds.filter(id => !validConceptIds.has(id));
        expect(invalidForPath).toEqual([]);
      });
    });
  });

  describe("New concepts from missing categories", () => {
    it("should have Data Engineering concepts", () => {
      const deConceptIds = ["etl", "uniform-document-schema"];
      deConceptIds.forEach((id) => {
        const concept = CONCEPTS.find((c) => c.id === id);
        expect(concept?.category).toBe("Data Engineering");
      });
    });

    it("should have Agents & Execution concepts", () => {
      const agentConceptIds = ["tool-calling"];
      agentConceptIds.forEach((id) => {
        const concept = CONCEPTS.find((c) => c.id === id);
        expect(concept?.category).toBe("Agents & Execution");
      });
    });

    it("should have Optimization concepts", () => {
      const optConceptIds = ["fine-tuning", "lora", "quantization", "distillation"];
      optConceptIds.forEach((id) => {
        const concept = CONCEPTS.find((c) => c.id === id);
        expect(concept?.category).toBe("Optimization");
      });
    });

    it("should have Evaluation & Observability concepts", () => {
      const evalConceptIds = ["cost-analysis", "observability"];
      evalConceptIds.forEach((id) => {
        const concept = CONCEPTS.find((c) => c.id === id);
        expect(concept?.category).toBe("Evaluation & Observability");
      });
    });

    it("should have Safety & Reliability concepts", () => {
      const safetyConceptIds = ["guardrails"];
      safetyConceptIds.forEach((id) => {
        const concept = CONCEPTS.find((c) => c.id === id);
        expect(concept?.category).toBe("Safety & Reliability");
      });
    });

    it("should have Generation Control concepts", () => {
      const genConceptIds = ["temperature-top-p-top-k"];
      genConceptIds.forEach((id) => {
        const concept = CONCEPTS.find((c) => c.id === id);
        expect(concept?.category).toBe("Generation Control");
      });
    });
  });

  describe("Concept relationships", () => {
    it("should reference only valid concepts in dependsOn", () => {
      const validConceptIds = new Set(CONCEPTS.map((c) => c.id));

      const invalidDeps: string[] = [];
      CONCEPTS.forEach((concept) => {
        if (concept.dependsOn) {
          concept.dependsOn.forEach((depId) => {
            if (!validConceptIds.has(depId)) {
              invalidDeps.push(`Concept '${concept.id}' depends on invalid: ${depId}`);
            }
          });
        }
      });

      expect(invalidDeps).toEqual([]);
    });

    it("should reference only valid concepts in nextConcepts", () => {
      const validConceptIds = new Set(CONCEPTS.map((c) => c.id));

      const invalidNext: string[] = [];
      CONCEPTS.forEach((concept) => {
        if (concept.nextConcepts) {
          concept.nextConcepts.forEach((nextId) => {
            if (!validConceptIds.has(nextId)) {
              invalidNext.push(`Concept '${concept.id}' has invalid next: ${nextId}`);
            }
          });
        }
      });

      expect(invalidNext).toEqual([]);
    });
  });

  describe("Implementation visibility", () => {
    it("should have implemented concepts with visible data", () => {
      const implemented = CONCEPTS.filter((c) => c.status === "implemented");

      implemented.forEach((concept) => {
        expect(concept.whereToSeeInUI.length).toBeGreaterThan(0);
        expect(concept.whereToSeeInUI.some((location) => !location.includes("future"))).toBe(
          true,
          `Implemented concept '${concept.id}' has no visible UI locations`
        );
      });
    });

    it("should have partial concepts with some visible data", () => {
      const partial = CONCEPTS.filter((c) => c.status === "partial");

      partial.forEach((concept) => {
        expect(concept.visibleInCurrentData.length).toBeGreaterThan(0);
      });
    });
  });
});
