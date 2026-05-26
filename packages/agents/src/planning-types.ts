/**
 * Long-Horizon Planning Types
 *
 * Defines the type system for multi-step planning:
 * - Plan-and-Execute strategy
 * - Tree-of-Plans (extensible to MCTS-like planners)
 *
 * Architecture is open for extension but starts with a simple
 * DAG-based plan structure.
 */

// ---------------------------------------------------------------------------
// Planning strategy
// ---------------------------------------------------------------------------

export type PlanningStrategyType =
  | 'plan-and-execute'
  | 'tree-of-plans'
  | 'mcts-experimental';

export interface PlanningStrategy {
  type: PlanningStrategyType;
  /** Maximum plan depth (tree-of-plans / mcts). */
  maxDepth?: number;
  /** Branching factor (tree-of-plans). */
  branchingFactor?: number;
  /** Number of simulations (mcts-experimental). */
  simulations?: number;
  /** Enable dynamic re-planning during execution. */
  enableReplanning: boolean;
  /** Maximum number of re-plan cycles. */
  maxReplans: number;
}

export const DEFAULT_PLANNING_STRATEGY: PlanningStrategy = {
  type: 'plan-and-execute',
  enableReplanning: true,
  maxReplans: 3,
};

// ---------------------------------------------------------------------------
// Plan structure (DAG of nodes connected by edges)
// ---------------------------------------------------------------------------

export type PlanNodeStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface PlanNode {
  /** Unique node identifier. */
  nodeId: string;
  /** Human-readable label. */
  label: string;
  /** Detailed description of what must be done. */
  description: string;
  /** IDs of nodes that must complete before this node can start. */
  dependencies: string[];
  /** Current execution status. */
  status: PlanNodeStatus;
  /** Agent responsible for executing this node. */
  assignedAgentId?: string;
  /** Tools needed for this node. */
  requiredTools: string[];
  /** Criteria for considering this node successfully completed. */
  successCriteria: string[];
  /** Identified risks for this node. */
  risks: string[];
  /** Expected output description. */
  expectedOutput: string;
  /** Estimated cost (USD). */
  estimatedCostUsd?: number;
  /** Estimated duration (ms). */
  estimatedDurationMs?: number;
  /** Actual duration after execution. */
  actualDurationMs?: number;
  /** Result produced by this node. */
  result?: unknown;
  /** Error if the node failed. */
  error?: string;
  /** Timestamp when execution started. */
  startedAt?: number;
  /** Timestamp when execution completed. */
  completedAt?: number;
}

export interface PlanEdge {
  /** Unique edge identifier. */
  edgeId: string;
  /** Source node ID. */
  from: string;
  /** Target node ID. */
  to: string;
  /** Whether this edge represents a dependency. */
  isDependency: boolean;
  /** Optional condition that must be true for this edge to be traversed. */
  condition?: string;
  /** Human-readable label for the edge. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Task plan
// ---------------------------------------------------------------------------

export interface TaskPlan {
  /** Unique plan identifier. */
  planId: string;
  /** High-level objective. */
  objective: string;
  /** Ordered list of subtask nodes. */
  nodes: PlanNode[];
  /** Edges describing dependencies and flow. */
  edges: PlanEdge[];
  /** Overall success criteria for the entire plan. */
  successCriteria: string[];
  /** Identified risks at the plan level. */
  risks: string[];
  /** All tools needed across all nodes. */
  allRequiredTools: string[];
  /** Agent IDs responsible for executing nodes. */
  responsibleAgents: string[];
  /** Current overall plan status. */
  status: 'draft' | 'ready' | 'executing' | 'completed' | 'failed' | 'abandoned';
  /** Strategy used to generate and execute this plan. */
  strategy: PlanningStrategy;
  /** Total estimated cost. */
  totalEstimatedCostUsd?: number;
  /** Total estimated duration. */
  totalEstimatedDurationMs?: number;
  /** Plan creation timestamp. */
  createdAt: number;
  /** Last updated timestamp. */
  updatedAt: number;
  /** Score assigned by PlanCritic (0–1). */
  score?: number;
  /** Revision history. */
  revisions: PlanRevision[];
}

export interface PlanRevision {
  revisionId: string;
  description: string;
  reason: string;
  timestamp: number;
  addedNodes: string[];
  removedNodes: string[];
  reorderedNodes: boolean;
}

// ---------------------------------------------------------------------------
// Plan evaluation
// ---------------------------------------------------------------------------

export interface PlanEvaluation {
  planId: string;
  /** 0–1 overall plan quality score. */
  overallScore: number;
  /** 0–1 completeness score (does the plan cover the objective?). */
  completenessScore: number;
  /** 0–1 feasibility score (can the plan realistically be executed?). */
  feasibilityScore: number;
  /** 0–1 efficiency score (is the plan minimal/non-redundant?). */
  efficiencyScore: number;
  /** Identified issues or gaps. */
  issues: string[];
  /** Suggested improvements. */
  suggestions: string[];
  /** Timestamp of evaluation. */
  evaluatedAt: number;
}

// ---------------------------------------------------------------------------
// Tree of plans (for tree-of-plans strategy)
// ---------------------------------------------------------------------------

export interface PlanTreeNode {
  /** Unique tree-node identifier. */
  treeNodeId: string;
  /** The plan at this tree node. */
  plan: TaskPlan;
  /** Evaluation of this plan variant. */
  evaluation?: PlanEvaluation;
  /** Child plan variants. */
  children: PlanTreeNode[];
  /** Whether this node was selected for execution. */
  selected: boolean;
  /** Depth in the tree. */
  depth: number;
}

// ---------------------------------------------------------------------------
// Plan execution trace
// ---------------------------------------------------------------------------

export interface PlanExecutionTrace {
  /** Unique trace identifier. */
  traceId: string;
  /** The plan being executed. */
  planId: string;
  /** Objective. */
  objective: string;
  /** Execution events. */
  events: PlanExecutionEvent[];
  /** Number of re-plans performed. */
  replanCount: number;
  /** Final result. */
  finalAnswer?: string;
  /** Whether execution succeeded. */
  success: boolean;
  /** Total cost incurred. */
  totalCostUsd?: number;
  /** Start and end timestamps. */
  startedAt: number;
  completedAt: number;
  totalDurationMs: number;
}

export type PlanExecutionEventType =
  | 'node-started'
  | 'node-completed'
  | 'node-failed'
  | 'node-skipped'
  | 'replan-triggered'
  | 'plan-completed'
  | 'plan-failed'
  | 'goal-achieved'
  | 'cost-limit-reached'
  | 'risk-threshold-reached';

export interface PlanExecutionEvent {
  eventId: string;
  type: PlanExecutionEventType;
  nodeId?: string;
  description: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
