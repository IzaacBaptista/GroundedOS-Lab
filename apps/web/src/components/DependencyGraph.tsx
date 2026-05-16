import { useMemo, useState } from "react";
import { getConceptById } from "../concepts";
import { CONCEPTS } from "../concepts/concepts-data";
import type { Concept } from "../concepts/types";
import "./DependencyGraph.css";

interface Node {
  id: string;
  title: string;
  type: "prerequisite" | "current" | "dependent";
  x: number;
  y: number;
  depth: number;
}

interface Edge {
  from: string;
  to: string;
}

interface DependencyGraphProps {
  conceptId: string;
}

export function DependencyGraph({ conceptId }: DependencyGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null);

  const concept = getConceptById(conceptId);
  if (!concept) {
    return <div className="dependency-graph__error">Conceito não encontrado</div>;
  }

  // Build graph of prerequisites and dependents
  const { nodes, edges } = useMemo(() => {
    const allConcepts = CONCEPTS;
    const visited = new Set<string>();
    const nodeMap = new Map<string, Node>();
    const edgeSet = new Set<string>();

    const getPrerequisites = (
      id: string,
      depth: number,
      maxDepth: number = 3
    ): Concept[] => {
      if (depth > maxDepth) return [];
      const c = allConcepts.find((x: Concept) => x.id === id);
      if (!c?.dependsOn) return [];
      return c.dependsOn
        .map((depId: string) => allConcepts.find((x: Concept) => x.id === depId))
        .filter((x: Concept | undefined): x is Concept => x !== undefined);
    };

    const getDependents = (
      id: string,
      depth: number,
      maxDepth: number = 3
    ): Concept[] => {
      if (depth > maxDepth) return [];
      return allConcepts.filter(
        (c: Concept) => c.dependsOn?.includes(id) || c.nextConcepts?.includes(id)
      );
    };

    // Add current concept
    nodeMap.set(conceptId, {
      id: conceptId,
      title: concept.title,
      type: "current",
      x: 0,
      y: 0,
      depth: 0,
    });
    visited.add(conceptId);

    // Add prerequisites (going up the chain)
    const addPrerequisites = (id: string, depth: number) => {
      if (depth > 3 || visited.has(id)) return;
      const prereqs = getPrerequisites(id, 0);
      prereqs.forEach((prereq: Concept, index: number) => {
        if (!visited.has(prereq.id)) {
          visited.add(prereq.id);
          const angle = (index / Math.max(prereqs.length, 1)) * Math.PI - Math.PI / 2;
          const radius = 150 + depth * 100;
          nodeMap.set(prereq.id, {
            id: prereq.id,
            title: prereq.title,
            type: "prerequisite",
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            depth,
          });
          edgeSet.add(`${prereq.id}-${id}`);
          addPrerequisites(prereq.id, depth + 1);
        }
      });
    };

    // Add dependents (going down the chain)
    const addDependents = (id: string, depth: number) => {
      if (depth > 2 || visited.has(id)) return;
      const deps = getDependents(id, 0);
      deps.forEach((dep: Concept, index: number) => {
        if (!visited.has(dep.id)) {
          visited.add(dep.id);
          const angle = (index / Math.max(deps.length, 1)) * Math.PI + Math.PI / 2;
          const radius = 150 + depth * 100;
          nodeMap.set(dep.id, {
            id: dep.id,
            title: dep.title,
            type: "dependent",
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            depth,
          });
          edgeSet.add(`${id}-${dep.id}`);
          addDependents(dep.id, depth + 1);
        }
      });
    };

    addPrerequisites(conceptId, 1);
    addDependents(conceptId, 1);

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeSet).map((e: string) => {
        const [from, to] = e.split("-");
        return { from, to };
      }),
    };
  }, [conceptId, concept]);

  // Calculate viewport bounds
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 80;
    const maxX = Math.max(...xs) + 80;
    const minY = Math.min(...ys) - 80;
    const maxY = Math.max(...ys) + 80;
    return { minX, maxX, minY, maxY };
  }, [nodes]);

  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;

  return (
    <div className="dependency-graph">
      <div className="dependency-graph__controls">
        <button
          className="dependency-graph__reset-btn"
          onClick={() => setSelectedPath(null)}
          disabled={!selectedPath}
        >
          ✕ Limpar caminho
        </button>
      </div>

      <svg
        className="dependency-graph__svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edges/lines */}
        <g className="dependency-graph__edges">
          {edges.map((edge, idx) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const isHighlighted = selectedPath
              ? selectedPath.includes(edge.from) && selectedPath.includes(edge.to)
              : false;

            return (
              <line
                key={idx}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                className={`dependency-graph__edge ${isHighlighted ? "dependency-graph__edge--highlighted" : ""}`}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="dependency-graph__nodes">
          {nodes.map((node) => {
            const isHovered = hoveredNode === node.id;
            const isInPath = selectedPath?.includes(node.id);

            return (
              <g
                key={node.id}
                className={`dependency-graph__node dependency-graph__node--${node.type} ${isHovered ? "dependency-graph__node--hovered" : ""} ${isInPath ? "dependency-graph__node--in-path" : ""}`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle cx={node.x} cy={node.y} r={24} />
                <text
                  x={node.x}
                  y={node.y}
                  className="dependency-graph__node-text"
                  dy="0.3em"
                >
                  {node.title.substring(0, 3).toUpperCase()}
                </text>
                {isHovered && (
                  <foreignObject x={node.x - 60} y={node.y + 35} width="120" height="40">
                    <div className="dependency-graph__tooltip">
                      {node.title}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="dependency-graph__legend">
        <div className="dependency-graph__legend-item">
          <div className="dependency-graph__legend-dot dependency-graph__legend-dot--prerequisite" />
          <span>Pré-requisito</span>
        </div>
        <div className="dependency-graph__legend-item">
          <div className="dependency-graph__legend-dot dependency-graph__legend-dot--current" />
          <span>Este conceito</span>
        </div>
        <div className="dependency-graph__legend-item">
          <div className="dependency-graph__legend-dot dependency-graph__legend-dot--dependent" />
          <span>Dependente</span>
        </div>
      </div>
    </div>
  );
}
