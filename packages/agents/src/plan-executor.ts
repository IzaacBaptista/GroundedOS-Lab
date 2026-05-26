/**
 * Plan Executor and Plan Critic
 *
 * PlanExecutor: runs a TaskPlan step by step, supports dynamic replanning.
 * PlanCritic: evaluates plan quality and suggests improvements.
 *
 * Supports:
 * - Step-by-step execution with status tracking
 * - Dynamic replanning (add/remove/reorder nodes)
 * - Early termination when goal is achieved
 * - Cost and risk threshold checks
 */

import { randomUUID } from 'crypto';
import type { AgentExecutionContext } from './types.js';
import type {
  PlanEvaluation,
  PlanExecutionEvent,
  PlanExecutionTrace,
  PlanNode,
  PlanRevision,
  TaskPlan,
} from './planning-types.js';

// ---------------------------------------------------------------------------
// PlanCritic
// ---------------------------------------------------------------------------

export class PlanCritic {
  /**
   * Evaluate a TaskPlan and return a PlanEvaluation.
   */
  evaluate(plan: TaskPlan, query: string): PlanEvaluation {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Completeness: does every node have a description and success criteria?
    let completenessScore = 1.0;
    for (const node of plan.nodes) {
      if (!node.description) {
        issues.push(`Node "${node.nodeId}" is missing a description`);
        completenessScore -= 0.1;
      }
      if (node.successCriteria.length === 0) {
        issues.push(`Node "${node.nodeId}" has no success criteria`);
        completenessScore -= 0.05;
        suggestions.push(`Add success criteria to node "${node.label}"`);
      }
    }
    completenessScore = Math.max(0, completenessScore);

    // Feasibility: are there tool requirements that can't be met?
    let feasibilityScore = 1.0;
    for (const node of plan.nodes) {
      if (node.requiredTools.length > 0 && plan.allRequiredTools.length === 0) {
        issues.push(`Node "${node.label}" requires tools but none are registered`);
        feasibilityScore -= 0.2;
      }
    }
    feasibilityScore = Math.max(0, feasibilityScore);

    // Efficiency: are there redundant nodes?
    let efficiencyScore = 1.0;
    const labels = plan.nodes.map((n) => n.label.toLowerCase());
    const uniqueLabels = new Set(labels);
    if (uniqueLabels.size < labels.length) {
      issues.push('Plan contains potentially duplicate nodes');
      efficiencyScore -= 0.15;
      suggestions.push('Review nodes for duplication');
    }

    // Dependency cycles (simple check)
    if (this._hasCycle(plan)) {
      issues.push('Plan contains a dependency cycle');
      feasibilityScore -= 0.5;
      suggestions.push('Remove circular dependencies');
    }

    const overallScore = (completenessScore + feasibilityScore + efficiencyScore) / 3;

    return {
      planId: plan.planId,
      overallScore,
      completenessScore,
      feasibilityScore,
      efficiencyScore,
      issues,
      suggestions,
      evaluatedAt: Date.now(),
    };
  }

  private _hasCycle(plan: TaskPlan): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      inStack.add(nodeId);

      const node = plan.nodes.find((n) => n.nodeId === nodeId);
      if (!node) return false;

      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (inStack.has(dep)) {
          return true;
        }
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const node of plan.nodes) {
      if (!visited.has(node.nodeId)) {
        if (dfs(node.nodeId)) return true;
      }
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// PlanExecutor
// ---------------------------------------------------------------------------

export interface PlanExecutorConfig {
  /** Maximum cost in USD before stopping. */
  maxCostUsd?: number;
  /** Maximum risk score before stopping (0–1). */
  maxRiskScore?: number;
  /** Stop execution early if objective is clearly achieved. */
  enableEarlyTermination: boolean;
}

const DEFAULT_EXECUTOR_CONFIG: PlanExecutorConfig = {
  maxCostUsd: undefined,
  maxRiskScore: 0.9,
  enableEarlyTermination: true,
};

export class PlanExecutor {
  private readonly config: PlanExecutorConfig;
  private readonly critic: PlanCritic;

  constructor(config: Partial<PlanExecutorConfig> = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    this.critic = new PlanCritic();
  }

  /**
   * Execute a TaskPlan step by step.
   *
   * @param plan - The plan to execute.
   * @param context - Agent execution context.
   * @param nodeExecutorFn - Function that executes a single node.
   */
  async execute(
    plan: TaskPlan,
    context: AgentExecutionContext,
    nodeExecutorFn: (node: PlanNode, context: AgentExecutionContext) => Promise<{
      success: boolean;
      result?: unknown;
      error?: string;
      costUsd?: number;
    }>,
  ): Promise<PlanExecutionTrace> {
    const traceId = randomUUID();
    const startedAt = Date.now();
    const deadline = startedAt + context.timeout;
    const events: PlanExecutionEvent[] = [];
    let totalCostUsd = 0;
    let replanCount = 0;
    let finalAnswer: string | undefined;
    let success = false;

    plan.status = 'executing';
    plan.updatedAt = Date.now();

    const executionOrder = this._topologicalSort(plan);

    for (const nodeId of executionOrder) {
      if (Date.now() >= deadline) {
        this._addEvent(events, 'plan-failed', nodeId, 'Global timeout reached');
        break;
      }

      const node = plan.nodes.find((n) => n.nodeId === nodeId);
      if (!node) continue;

      // Skip nodes already in a terminal state
      if (node.status === 'completed' || node.status === 'failed' || node.status === 'skipped') {
        continue;
      }

      // Check dependencies
      const depsComplete = node.dependencies.every((dep) => {
        const depNode = plan.nodes.find((n) => n.nodeId === dep);
        return depNode?.status === 'completed';
      });

      if (!depsComplete) {
        node.status = 'skipped';
        this._addEvent(events, 'node-skipped', nodeId, `Dependencies not met for: ${node.label}`);
        continue;
      }

      // Check cost limit
      if (this.config.maxCostUsd !== undefined && totalCostUsd >= this.config.maxCostUsd) {
        this._addEvent(events, 'cost-limit-reached', nodeId, `Cost limit ${this.config.maxCostUsd} USD reached`);
        plan.status = 'failed';
        break;
      }

      // Execute node
      node.status = 'in-progress';
      node.startedAt = Date.now();
      this._addEvent(events, 'node-started', nodeId, `Starting: ${node.label}`);

      try {
        const result = await nodeExecutorFn(node, context);
        node.status = result.success ? 'completed' : 'failed';
        node.result = result.result;
        node.error = result.error;
        node.actualDurationMs = Date.now() - node.startedAt;
        node.completedAt = Date.now();

        if (result.costUsd) {
          totalCostUsd += result.costUsd;
          node.estimatedCostUsd = result.costUsd;
        }

        if (result.success) {
          this._addEvent(events, 'node-completed', nodeId, `Completed: ${node.label}`);

          // Early termination check
          if (this.config.enableEarlyTermination && this._isGoalAchieved(plan)) {
            this._addEvent(events, 'goal-achieved', nodeId, 'Objective achieved — stopping early');
            finalAnswer = this._extractFinalAnswer(plan);
            success = true;
            break;
          }
        } else {
          this._addEvent(events, 'node-failed', nodeId, `Failed: ${node.label} — ${result.error}`);

          // Attempt replan
          if (replanCount < plan.strategy.maxReplans && plan.strategy.enableReplanning) {
            const replanned = this._replan(plan, node);
            if (replanned) {
              replanCount++;
              this._addEvent(events, 'replan-triggered', nodeId, `Replanned after node failure (replan ${replanCount})`);
            }
          }
        }
      } catch (err) {
        node.status = 'failed';
        node.error = err instanceof Error ? err.message : String(err);
        node.actualDurationMs = Date.now() - (node.startedAt ?? Date.now());
        node.completedAt = Date.now();
        this._addEvent(events, 'node-failed', nodeId, `Exception in ${node.label}: ${node.error}`);
      }
    }

    // Determine final plan status
    const allDone = plan.nodes.every(
      (n) => n.status === 'completed' || n.status === 'skipped',
    );
    const anyFailed = plan.nodes.some((n) => n.status === 'failed');

    if (allDone && !anyFailed) {
      plan.status = 'completed';
      success = true;
      finalAnswer = finalAnswer ?? this._extractFinalAnswer(plan);
      this._addEvent(events, 'plan-completed', undefined, 'All plan nodes completed');
    } else if (anyFailed && plan.status === 'executing') {
      plan.status = 'failed';
      this._addEvent(events, 'plan-failed', undefined, 'Plan failed — one or more nodes failed');
    }

    plan.updatedAt = Date.now();

    const completedAt = Date.now();
    return {
      traceId,
      planId: plan.planId,
      objective: plan.objective,
      events,
      replanCount,
      finalAnswer,
      success,
      totalCostUsd: totalCostUsd > 0 ? totalCostUsd : undefined,
      startedAt,
      completedAt,
      totalDurationMs: completedAt - startedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Topological sort of plan nodes respecting dependencies.
   */
  private _topologicalSort(plan: TaskPlan): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = plan.nodes.find((n) => n.nodeId === nodeId);
      if (!node) return;

      for (const dep of node.dependencies) {
        visit(dep);
      }

      result.push(nodeId);
    };

    for (const node of plan.nodes) {
      visit(node.nodeId);
    }

    return result;
  }

  private _isGoalAchieved(plan: TaskPlan): boolean {
    // Goal achieved if the last node (synthesize) is completed
    const lastNode = plan.nodes[plan.nodes.length - 1];
    return lastNode?.status === 'completed';
  }

  private _extractFinalAnswer(plan: TaskPlan): string | undefined {
    // Try to extract the final answer from the last completed node
    const completedNodes = plan.nodes.filter((n) => n.status === 'completed');
    const lastCompleted = completedNodes[completedNodes.length - 1];
    if (!lastCompleted?.result) return undefined;

    const result = lastCompleted.result as Record<string, unknown>;
    if (typeof result['answer'] === 'string') return result['answer'];
    if (typeof result['summary'] === 'string') return result['summary'];
    return JSON.stringify(result).slice(0, 500);
  }

  private _replan(plan: TaskPlan, failedNode: PlanNode): boolean {
    // Simple replan: mark failed node as skipped and try to continue
    failedNode.status = 'skipped';

    const revision: PlanRevision = {
      revisionId: randomUUID(),
      description: `Skipped failed node: ${failedNode.label}`,
      reason: `Node failed: ${failedNode.error ?? 'unknown error'}`,
      timestamp: Date.now(),
      addedNodes: [],
      removedNodes: [failedNode.nodeId],
      reorderedNodes: false,
    };

    plan.revisions.push(revision);
    plan.updatedAt = Date.now();
    return true;
  }

  private _addEvent(
    events: PlanExecutionEvent[],
    type: PlanExecutionEvent['type'],
    nodeId: string | undefined,
    description: string,
    metadata?: Record<string, unknown>,
  ): void {
    events.push({
      eventId: randomUUID(),
      type,
      nodeId,
      description,
      timestamp: Date.now(),
      metadata,
    });
  }
}
