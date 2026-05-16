import { useState, useCallback, useEffect } from "react";
import { getConceptsByCategory, getUniqueCategories, getConceptById, searchConcepts } from "../concepts";
import type { Concept, LearningPath, ConceptCategory } from "../concepts/types";
import { LEARNING_PATHS, CONCEPTS } from "../concepts/concepts-data";

export interface ConceptProgress {
  viewed: boolean;
  learned: boolean;
  viewedAt?: number;
  learnedAt?: number;
}

export function useLearningProgress() {
  const [progress, setProgress] = useState<Record<string, ConceptProgress>>(
    () => {
      // Try to restore from localStorage
      try {
        const saved = localStorage.getItem("learningProgress");
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {
        // Ignore parsing errors
      }
      return {};
    }
  );

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("learningProgress", JSON.stringify(progress));
  }, [progress]);

  // Mark a concept as viewed
  const markViewed = useCallback((conceptId: string) => {
    setProgress((prev) => ({
      ...prev,
      [conceptId]: {
        ...prev[conceptId],
        viewed: true,
        viewedAt: Date.now(),
      },
    }));
  }, []);

  // Mark a concept as learned
  const markLearned = useCallback((conceptId: string) => {
    setProgress((prev) => ({
      ...prev,
      [conceptId]: {
        ...prev[conceptId],
        learned: true,
        learnedAt: Date.now(),
      },
    }));
  }, []);

  // Get progress for a specific learning path
  const getPathProgress = useCallback(
    (pathId: string) => {
      const path = LEARNING_PATHS.find((p: LearningPath) => p.id === pathId);
      if (!path) return { completed: 0, total: 0, percentage: 0 };

      const completed = path.conceptIds.filter(
        (id: string) => progress[id]?.learned
      ).length;
      const viewed = path.conceptIds.filter((id: string) => progress[id]?.viewed).length;

      return {
        completed,
        viewed,
        total: path.conceptIds.length,
        percentage: Math.round((completed / path.conceptIds.length) * 100),
        viewPercentage: Math.round((viewed / path.conceptIds.length) * 100),
      };
    },
    [progress]
  );

  // Get all learning paths with progress
  const getPathsWithProgress = useCallback(() => {
    return LEARNING_PATHS.map((path: LearningPath) => ({
      ...path,
      progress: getPathProgress(path.id),
    }));
  }, [getPathProgress]);

  // Get recommended next learning path
  const getRecommendedPath = useCallback((): {
    path: LearningPath;
    reason: string;
  } | null => {
    const paths = getPathsWithProgress();
    const allConcepts = CONCEPTS;

    // Find paths that are not completed but started
    const inProgress = paths.filter(
      (p: any) => p.progress.percentage > 0 && p.progress.percentage < 100
    );
    if (inProgress.length > 0) {
      return {
        path: inProgress[0],
        reason: "Continue your current path",
      };
    }

    // Find beginner paths to start
    const beginnerPaths = paths.filter((p: any) => p.difficulty === "beginner");
    const unstarted = beginnerPaths.filter((p: any) => p.progress.percentage === 0);
    if (unstarted.length > 0) {
      return {
        path: unstarted[0],
        reason: "Start with beginner fundamentals",
      };
    }

    // Find intermediate paths if beginner is done
    const intermediatePaths = paths.filter(
      (p: any) => p.difficulty === "intermediate"
    );
    const completedBeginner = paths.find(
      (p: any) => p.difficulty === "beginner" && p.progress.percentage === 100
    );
    if (completedBeginner && intermediatePaths.length > 0) {
      return {
        path: intermediatePaths[0],
        reason: "You've mastered the fundamentals!",
      };
    }

    // Find advanced paths
    const advancedPaths = paths.filter((p: any) => p.difficulty === "advanced");
    if (advancedPaths.length > 0) {
      const completedIntermediate = paths.find(
        (p: any) => p.difficulty === "intermediate" && p.progress.percentage === 100
      );
      if (completedIntermediate) {
        return {
          path: advancedPaths[0],
          reason: "Ready for advanced topics",
        };
      }
    }

    return null;
  }, [getPathsWithProgress]);

  // Get missing prerequisites for a learning path
  const getMissingPrerequisites = useCallback(
    (pathId: string): Concept[] => {
      const path = LEARNING_PATHS.find((p: LearningPath) => p.id === pathId);
      if (!path) return [];

      const allConcepts = CONCEPTS;
      const missing: Concept[] = [];

      path.conceptIds.forEach((conceptId: string) => {
        const concept = allConcepts.find((c: Concept) => c.id === conceptId);
        if (concept?.dependsOn) {
          concept.dependsOn.forEach((depId: string) => {
            if (!progress[depId]?.learned) {
              const depConcept = allConcepts.find((c: Concept) => c.id === depId);
              if (depConcept && !missing.find((c: Concept) => c.id === depId)) {
                missing.push(depConcept);
              }
            }
          });
        }
      });

      return missing;
    },
    [progress]
  );

  // Get streak (days of consecutive concept views)
  const getStreak = useCallback((): number => {
    const viewedDates = Object.values(progress)
      .filter((p) => p.viewedAt)
      .map((p) => new Date(p.viewedAt!).toDateString())
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (viewedDates.length === 0) return 0;

    let streak = 1;
    let currentDate = new Date(viewedDates[0]);

    for (let i = 1; i < viewedDates.length; i++) {
      const prevDate = new Date(viewedDates[i]);
      const diffDays = Math.floor(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 1) {
        streak++;
        currentDate = prevDate;
      } else {
        break;
      }
    }

    return streak;
  }, [progress]);

  // Reset all progress (for testing/reset)
  const resetProgress = useCallback(() => {
    setProgress({});
  }, []);

  return {
    progress,
    markViewed,
    markLearned,
    getPathProgress,
    getPathsWithProgress,
    getRecommendedPath,
    getMissingPrerequisites,
    getStreak,
    resetProgress,
    totalViewed: Object.values(progress).filter((p) => p.viewed).length,
    totalLearned: Object.values(progress).filter((p) => p.learned).length,
  };
}
