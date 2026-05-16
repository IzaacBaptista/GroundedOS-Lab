import { useEffect, useMemo, useState } from "react";
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(conceptId);
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null);
  const [focusDirectRelations, setFocusDirectRelations] = useState(false);

  const concept = getConceptById(conceptId);
  if (!concept) {
    return <div className="dependency-graph__error">Conceito não encontrado</div>;
  }

  useEffect(() => {
    setSelectedNodeId(conceptId);
    setSelectedPath(null);
  }, [conceptId]);

  // Build graph of prerequisites and dependents
  const { nodes, edges } = useMemo(() => {
    const MAX_PREREQ_DEPTH = 3;
    const MAX_DEPENDENT_DEPTH = 3;
    const HORIZONTAL_SPACING = 220;
    const VERTICAL_SPACING = 120;

    const allConcepts = CONCEPTS;
    const conceptById = new Map<string, Concept>(
      allConcepts.map((item: Concept) => [item.id, item])
    );

    const nodeMap = new Map<string, Node>();
    const edgeSet = new Set<string>();

    const dependentsById = new Map<string, Set<string>>();
    const registerDependent = (sourceId: string, dependentId: string) => {
      const current = dependentsById.get(sourceId);
      if (current) {
        current.add(dependentId);
      } else {
        dependentsById.set(sourceId, new Set([dependentId]));
      }
    };

    allConcepts.forEach((item: Concept) => {
      item.dependsOn?.forEach((depId: string) => registerDependent(depId, item.id));
      item.nextConcepts?.forEach((nextId: string) => registerDependent(nextId, item.id));
    });

    const addNode = (id: string, type: Node["type"], depth: number) => {
      const existing = nodeMap.get(id);
      const title = conceptById.get(id)?.title ?? id;

      if (!existing) {
        nodeMap.set(id, { id, title, type, depth, x: 0, y: 0 });
        return;
      }

      if (existing.type !== "current" && depth < existing.depth) {
        nodeMap.set(id, { ...existing, depth, type });
      }
    };

    const prereqDepthById = new Map<string, number>();
    const dependentDepthById = new Map<string, number>();

    const traversePrerequisites = (targetId: string, depth: number) => {
      if (depth > MAX_PREREQ_DEPTH) {
        return;
      }

      const target = conceptById.get(targetId);
      if (!target?.dependsOn?.length) {
        return;
      }

      target.dependsOn.forEach((prereqId: string) => {
        if (!conceptById.has(prereqId)) {
          return;
        }

        addNode(prereqId, "prerequisite", depth);
        edgeSet.add(`${prereqId}->${targetId}`);

        const previousDepth = prereqDepthById.get(prereqId);
        if (previousDepth === undefined || depth < previousDepth) {
          prereqDepthById.set(prereqId, depth);
          traversePrerequisites(prereqId, depth + 1);
        }
      });
    };

    const traverseDependents = (sourceId: string, depth: number) => {
      if (depth > MAX_DEPENDENT_DEPTH) {
        return;
      }

      const dependentIds = dependentsById.get(sourceId);
      if (!dependentIds?.size) {
        return;
      }

      dependentIds.forEach((dependentId: string) => {
        if (!conceptById.has(dependentId)) {
          return;
        }

        addNode(dependentId, "dependent", depth);
        edgeSet.add(`${sourceId}->${dependentId}`);

        const previousDepth = dependentDepthById.get(dependentId);
        if (previousDepth === undefined || depth < previousDepth) {
          dependentDepthById.set(dependentId, depth);
          traverseDependents(dependentId, depth + 1);
        }
      });
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

    traversePrerequisites(conceptId, 1);
    traverseDependents(conceptId, 1);

    const assignColumn = (columnNodes: Node[], x: number) => {
      const ordered = [...columnNodes].sort((a, b) => a.title.localeCompare(b.title));
      const startY = -((ordered.length - 1) * VERTICAL_SPACING) / 2;

      ordered.forEach((node: Node, index: number) => {
        const existing = nodeMap.get(node.id);
        if (!existing) {
          return;
        }
        nodeMap.set(node.id, {
          ...existing,
          x,
          y: startY + index * VERTICAL_SPACING,
        });
      });
    };

    const prerequisitesByDepth = new Map<number, Node[]>();
    const dependentsByDepth = new Map<number, Node[]>();

    nodeMap.forEach((node: Node) => {
      if (node.type === "prerequisite") {
        const group = prerequisitesByDepth.get(node.depth) ?? [];
        group.push(node);
        prerequisitesByDepth.set(node.depth, group);
      }
      if (node.type === "dependent") {
        const group = dependentsByDepth.get(node.depth) ?? [];
        group.push(node);
        dependentsByDepth.set(node.depth, group);
      }
    });

    prerequisitesByDepth.forEach((columnNodes, depth) => {
      assignColumn(columnNodes, -depth * HORIZONTAL_SPACING);
    });

    dependentsByDepth.forEach((columnNodes, depth) => {
      assignColumn(columnNodes, depth * HORIZONTAL_SPACING);
    });

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeSet).map((e: string) => {
        const [from, to] = e.split("->");
        return { from, to };
      }),
    };
  }, [conceptId, concept]);

  const renderedNodes = useMemo(() => {
    if (!focusDirectRelations) {
      return nodes;
    }

    return nodes.filter((node: Node) => node.type === "current" || node.depth === 1);
  }, [focusDirectRelations, nodes]);

  const renderedNodeIds = useMemo(() => {
    return new Set(renderedNodes.map((node: Node) => node.id));
  }, [renderedNodes]);

  const renderedEdges = useMemo(() => {
    return edges.filter((edge: Edge) => {
      if (!renderedNodeIds.has(edge.from) || !renderedNodeIds.has(edge.to)) {
        return false;
      }

      if (!focusDirectRelations) {
        return true;
      }

      return edge.from === conceptId || edge.to === conceptId;
    });
  }, [conceptId, edges, focusDirectRelations, renderedNodeIds]);

  const nodesById = useMemo(() => {
    return new Map<string, Node>(renderedNodes.map((node: Node) => [node.id, node]));
  }, [renderedNodes]);

  const highlightedEdges = useMemo(() => {
    if (!selectedPath || selectedPath.length < 2) {
      return new Set<string>();
    }

    const result = new Set<string>();
    for (let i = 0; i < selectedPath.length - 1; i += 1) {
      result.add(`${selectedPath[i]}->${selectedPath[i + 1]}`);
    }

    return result;
  }, [selectedPath]);

  const selectedConcept = useMemo(() => {
    if (!selectedNodeId) {
      return concept;
    }
    return getConceptById(selectedNodeId) ?? concept;
  }, [concept, selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return nodes.find((node) => node.id === conceptId) ?? null;
    }
    return nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [conceptId, nodes, selectedNodeId]);

  const adjacency = useMemo(() => {
    const map = new Map<string, string[]>();
    edges.forEach((edge: Edge) => {
      const current = map.get(edge.from);
      if (current) {
        current.push(edge.to);
      } else {
        map.set(edge.from, [edge.to]);
      }
    });
    return map;
  }, [edges]);

  const findShortestPath = (startId: string, endId: string): string[] | null => {
    if (startId === endId) {
      return [startId];
    }

    const queue: string[][] = [[startId]];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const currentPath = queue.shift();
      if (!currentPath) {
        continue;
      }

      const currentNodeId = currentPath[currentPath.length - 1];
      const nextNodes = adjacency.get(currentNodeId) ?? [];

      for (const nextId of nextNodes) {
        if (visited.has(nextId)) {
          continue;
        }

        const nextPath = [...currentPath, nextId];
        if (nextId === endId) {
          return nextPath;
        }

        visited.add(nextId);
        queue.push(nextPath);
      }
    }

    return null;
  };

  const handleNodeClick = (node: Node) => {
    setSelectedNodeId(node.id);

    if (node.id === conceptId) {
      setSelectedPath([conceptId]);
      return;
    }

    const startId = node.type === "dependent" ? conceptId : node.id;
    const endId = node.type === "dependent" ? node.id : conceptId;
    const path = findShortestPath(startId, endId);

    setSelectedPath(path ?? [startId, endId]);
  };

  // Calculate viewport bounds
  const bounds = useMemo(() => {
    if (renderedNodes.length === 0) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    const xs = renderedNodes.map((n) => n.x);
    const ys = renderedNodes.map((n) => n.y);
    const minX = Math.min(...xs) - 80;
    const maxX = Math.max(...xs) + 80;
    const minY = Math.min(...ys) - 80;
    const maxY = Math.max(...ys) + 80;
    return { minX, maxX, minY, maxY };
  }, [renderedNodes]);

  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;

  return (
    <div className="dependency-graph">
      <div className="dependency-graph__controls">
        <button
          className="dependency-graph__control-btn"
          onClick={() => setFocusDirectRelations((current) => !current)}
          aria-pressed={focusDirectRelations}
        >
          {focusDirectRelations ? "Mostrar todos os níveis" : "Focar relações diretas"}
        </button>
        <button
          className="dependency-graph__control-btn"
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
        <defs>
          <marker
            id="dependency-graph-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Edges/lines */}
        <g className="dependency-graph__edges">
          {renderedEdges.map((edge, idx) => {
            const fromNode = nodesById.get(edge.from);
            const toNode = nodesById.get(edge.to);
            if (!fromNode || !toNode) return null;

            const edgeId = `${edge.from}->${edge.to}`;
            const isHighlighted = highlightedEdges.has(edgeId);

            return (
              <line
                key={idx}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                markerEnd="url(#dependency-graph-arrow)"
                className={`dependency-graph__edge ${isHighlighted ? "dependency-graph__edge--highlighted" : ""}`}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="dependency-graph__nodes">
          {renderedNodes.map((node) => {
            const isHovered = hoveredNode === node.id;
            const isInPath = selectedPath?.includes(node.id);
            const isSelected = selectedNodeId === node.id;

            return (
              <g
                key={node.id}
                className={`dependency-graph__node dependency-graph__node--${node.type} ${isHovered ? "dependency-graph__node--hovered" : ""} ${isInPath ? "dependency-graph__node--in-path" : ""} ${isSelected ? "dependency-graph__node--selected" : ""}`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node)}
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

      <div className="dependency-graph__summary" aria-label="Resumo do conceito selecionado">
        <h4>{selectedConcept.title}</h4>
        {selectedNode && (
          <p className="dependency-graph__summary-meta">
            {selectedNode.type === "prerequisite"
              ? "Pre-requisito"
              : selectedNode.type === "dependent"
                ? "Dependente"
                : "Conceito atual"}
          </p>
        )}
        <p>{selectedConcept.shortDefinition}</p>
        <p>{selectedConcept.explanation}</p>
      </div>

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
