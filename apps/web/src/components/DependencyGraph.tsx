import { useEffect, useMemo, useRef, useState } from "react";
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

interface ConceptCostProfile {
  level: "low" | "medium" | "high";
  cpuIntensive: boolean;
  gpuRecommended: boolean;
  memoryUsage: string;
  inferenceLatency: string;
}

interface ConceptLearningProfile {
  whenToUse: string[];
  commonProblems: string[];
  popularLibraries: string[];
  ragWhyItMatters: string;
  cost: ConceptCostProfile;
}

const DEFAULT_PROFILE: ConceptLearningProfile = {
  whenToUse: [
    "Quando voce precisa conectar este conceito com o fluxo principal de retrieval.",
    "Quando quer comparar qualidade de resposta e impacto operacional no pipeline.",
  ],
  commonProblems: [
    "Configuracao inconsistente entre ambientes locais e testes.",
    "Dependencias indiretas mal definidas no fluxo de execucao.",
    "Interpretacao ambigua de metricas sem contexto do dataset.",
  ],
  popularLibraries: ["Ollama", "FAISS", "Chroma", "pgvector"],
  ragWhyItMatters:
    "Este conceito afeta diretamente a qualidade, confiabilidade e custo de um sistema RAG em producao.",
  cost: {
    level: "medium",
    cpuIntensive: true,
    gpuRecommended: false,
    memoryUsage: "Moderado",
    inferenceLatency: "Media",
  },
};

const CONCEPT_PROFILES: Record<string, ConceptLearningProfile> = {
  embeddings: {
    whenToUse: [
      "Busca semantica em bases de conhecimento e FAQ corporativo.",
      "Recomendacao de conteudo por similaridade de significado.",
      "Recuperacao semantica em pipelines de RAG.",
      "Agrupamento de documentos por tema (clustering).",
    ],
    commonProblems: [
      "Embeddings inconsistentes entre modelos/provedores diferentes.",
      "Chunk size ruim reduzindo qualidade da recuperacao.",
      "Dimensionalidade incompatível com o vetor/index configurado.",
      "Cosine similarity enganosa em textos muito curtos.",
      "Degradacao em cenarios multilíngues sem modelo adequado.",
    ],
    popularLibraries: [
      "sentence-transformers",
      "OpenAI embeddings",
      "Cohere",
      "Ollama",
      "FAISS",
      "Chroma",
      "pgvector",
    ],
    ragWhyItMatters:
      "Sem embeddings, a recuperacao semantica deixa de existir, porque o sistema nao consegue representar significado numericamente.",
    cost: {
      level: "medium",
      cpuIntensive: true,
      gpuRecommended: true,
      memoryUsage: "Moderado a alto",
      inferenceLatency: "Media",
    },
  },
  chunking: {
    whenToUse: [
      "Quebrar documentos longos antes da indexacao vetorial.",
      "Melhorar granularidade de citacoes em respostas RAG.",
      "Controlar janela de contexto e custo por consulta.",
    ],
    commonProblems: [
      "Chunks longos demais perdem foco semantico.",
      "Chunks curtos demais quebram contexto essencial.",
      "Overlap mal configurado gera redundancia de resultados.",
      "Quebra em limites ruins reduz precisao de citacoes.",
    ],
    popularLibraries: ["LangChain text splitters", "LlamaIndex", "Haystack"],
    ragWhyItMatters:
      "Chunking define o que o retriever consegue encontrar. Se os cortes forem ruins, a resposta sera incompleta ou pouco confiavel.",
    cost: {
      level: "low",
      cpuIntensive: false,
      gpuRecommended: false,
      memoryUsage: "Baixo",
      inferenceLatency: "Baixa",
    },
  },
  rag: {
    whenToUse: [
      "Responder perguntas com base em documentos internos atualizados.",
      "Reduzir alucinacao em assistentes corporativos.",
      "Exigir rastreabilidade por citacoes e evidencias.",
    ],
    commonProblems: [
      "Recuperacao ruim derruba qualidade da resposta final.",
      "Prompt sem instrucao de grounding aumenta alucinacao.",
      "Top-K inadequado causa ruido ou falta de contexto.",
      "Latencia alta quando o pipeline nao esta balanceado.",
    ],
    popularLibraries: ["LangChain", "LlamaIndex", "Haystack", "Milvus", "Weaviate"],
    ragWhyItMatters:
      "RAG e a ponte entre conhecimento externo e resposta gerada. Sem isso, o sistema depende apenas do que o modelo memoriza nos pesos.",
    cost: {
      level: "high",
      cpuIntensive: true,
      gpuRecommended: true,
      memoryUsage: "Alto",
      inferenceLatency: "Media a alta",
    },
  },
  "vector-database": {
    whenToUse: [
      "Armazenar e consultar embeddings em escala com baixa latencia.",
      "Suportar retrieval semantico com filtros por metadata.",
      "Projetos que precisam de indexacao incremental e atualizacao frequente.",
    ],
    commonProblems: [
      "Escolha incorreta de indice ANN reduz recall.",
      "Falta de estrategia de particionamento aumenta custo e latencia.",
      "Mistura de embeddings de modelos diferentes no mesmo indice.",
      "Filtros de metadata mal modelados geram resultados inconsistentes.",
    ],
    popularLibraries: ["FAISS", "Chroma", "pgvector", "Qdrant", "Milvus", "Weaviate"],
    ragWhyItMatters:
      "Vector database e o nucleo de retrieval semantico do RAG. Ele define se o contexto certo sera recuperado com velocidade e estabilidade.",
    cost: {
      level: "high",
      cpuIntensive: true,
      gpuRecommended: false,
      memoryUsage: "Alto",
      inferenceLatency: "Baixa a media",
    },
  },
  "hybrid-search": {
    whenToUse: [
      "Combinar busca lexical e semantica para consultas ambiguas.",
      "Dominios com termos tecnicos, siglas e variacoes de escrita.",
      "Casos em que somente dense retrieval perde palavras-chave criticas.",
    ],
    commonProblems: [
      "Peso mal calibrado entre sparse e dense piora ranking final.",
      "Duplicacao de candidatos na etapa de merge sem deduplicacao robusta.",
      "Ruido lexical elevando documentos superficiais no top-k.",
      "Avaliar so por latencia e ignorar ganho de relevancia.",
    ],
    popularLibraries: ["Elasticsearch", "OpenSearch", "BM25", "FAISS", "Qdrant", "LlamaIndex"],
    ragWhyItMatters:
      "Hybrid search melhora cobertura e precisao no retrieval, reduzindo falhas em consultas mistas onde semantica e termo exato importam ao mesmo tempo.",
    cost: {
      level: "high",
      cpuIntensive: true,
      gpuRecommended: true,
      memoryUsage: "Moderado a alto",
      inferenceLatency: "Media",
    },
  },
  reranking: {
    whenToUse: [
      "Refinar top-k inicial para aumentar precisao antes da geracao.",
      "Cenarios com base grande e muito documento semanticamente parecido.",
      "Fluxos onde qualidade final importa mais que minima latencia.",
    ],
    commonProblems: [
      "Aplicar reranking em candidatos fracos demais nao recupera contexto perdido.",
      "k inicial muito pequeno limita ganho do reranker.",
      "Modelo de reranking inadequado para dominio especifico.",
      "Custo e latencia subestimados em horario de pico.",
    ],
    popularLibraries: ["Cohere Rerank", "cross-encoder", "sentence-transformers", "Jina AI reranker"],
    ragWhyItMatters:
      "Reranking melhora a qualidade do contexto enviado ao LLM e reduz respostas parcialmente corretas causadas por ordem ruim de documentos.",
    cost: {
      level: "high",
      cpuIntensive: true,
      gpuRecommended: true,
      memoryUsage: "Moderado",
      inferenceLatency: "Media a alta",
    },
  },
  guardrails: {
    whenToUse: [
      "Proteger o sistema contra prompt injection e vazamento de dados.",
      "Aplicacoes com requisitos de conformidade e politicas de uso.",
      "Cenarios com risco de conteudo inseguro ou nao autorizado.",
    ],
    commonProblems: [
      "Excesso de bloqueio gerando falso positivo e piorando UX.",
      "Regras vagas que deixam passar bypass simples.",
      "Ausencia de telemetria para entender por que uma resposta foi bloqueada.",
      "Guardrail desconectado do contexto recuperado no RAG.",
    ],
    popularLibraries: ["Guardrails AI", "Llama Guard", "NeMo Guardrails", "OpenAI moderation", "Presidio"],
    ragWhyItMatters:
      "Guardrails reduzem risco operacional e juridico no RAG, filtrando entradas e saidas sem perder controle de rastreabilidade.",
    cost: {
      level: "medium",
      cpuIntensive: true,
      gpuRecommended: false,
      memoryUsage: "Baixo a moderado",
      inferenceLatency: "Baixa a media",
    },
  },
  observability: {
    whenToUse: [
      "Monitorar qualidade, custo e latencia ponta a ponta do pipeline.",
      "Diagnosticar regressao de retrieval ou queda de groundedness.",
      "Comparar provedores, prompts e configuracoes com evidencia.",
    ],
    commonProblems: [
      "Coletar metrica demais sem perguntas de negocio claras.",
      "Nao versionar experimentos e perder comparabilidade historica.",
      "Focar apenas em latencia e ignorar faithfulness/recall.",
      "Tracing incompleto que dificulta localizar gargalos.",
    ],
    popularLibraries: ["OpenTelemetry", "Prometheus", "Grafana", "Langfuse", "Phoenix", "Weights & Biases"],
    ragWhyItMatters:
      "Observability torna o RAG operavel: sem telemetria e tracing, erros de retrieval e custo excessivo passam despercebidos em producao.",
    cost: {
      level: "medium",
      cpuIntensive: false,
      gpuRecommended: false,
      memoryUsage: "Moderado",
      inferenceLatency: "Baixa",
    },
  },
};

function resolveConceptProfile(concept: Concept): ConceptLearningProfile {
  const profile = CONCEPT_PROFILES[concept.id];
  if (profile) {
    return profile;
  }

  return {
    ...DEFAULT_PROFILE,
    ragWhyItMatters: `${concept.title} influencia diretamente a capacidade do RAG de recuperar contexto certo e responder com evidencia.`,
  };
}

function toCostLevelLabel(level: ConceptCostProfile["level"]): string {
  if (level === "low") {
    return "Baixo";
  }
  if (level === "high") {
    return "Alto";
  }
  return "Medio";
}

export function DependencyGraph({ conceptId }: DependencyGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(conceptId);
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null);
  const [focusDirectRelations, setFocusDirectRelations] = useState(false);
  const [shouldScrollSummary, setShouldScrollSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const concept = getConceptById(conceptId);
  if (!concept) {
    return <div className="dependency-graph__error">Conceito não encontrado</div>;
  }

  useEffect(() => {
    setSelectedNodeId(conceptId);
    setSelectedPath(null);
  }, [conceptId]);

  useEffect(() => {
    if (!shouldScrollSummary) {
      return;
    }

    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShouldScrollSummary(false);
  }, [shouldScrollSummary]);

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

  const selectedConceptSummaryPt = useMemo(() => {
    const prerequisitesCount = selectedConcept.dependsOn?.length ?? 0;
    const dependentsCount = CONCEPTS.filter(
      (item: Concept) =>
        item.dependsOn?.includes(selectedConcept.id) ||
        item.nextConcepts?.includes(selectedConcept.id)
    ).length;

    const nodeRole =
      selectedNode?.type === "prerequisite"
        ? "pré-requisito"
        : selectedNode?.type === "dependent"
          ? "conceito dependente"
          : "conceito central";

    const statusLabel: Record<Concept["status"], string> = {
      implemented: "implementado",
      partial: "parcial",
      planned: "planejado",
      stub: "rascunho",
    };

    return {
      oQueE: `${selectedConcept.title} é um ${nodeRole} na categoria ${selectedConcept.category}. No lab, o status atual é ${statusLabel[selectedConcept.status]}.`,
      comoFunciona: `Neste mapa, ele se relaciona com ${prerequisitesCount} pré-requisito(s) e ${dependentsCount} conceito(s) dependente(s). Siga o fluxo azul -> verde -> laranja para navegar da base para os próximos tópicos.`,
    };
  }, [selectedConcept, selectedNode]);

  const selectedConceptProfile = useMemo(() => {
    return resolveConceptProfile(selectedConcept);
  }, [selectedConcept]);

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
    setShouldScrollSummary(true);

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

      <div
        ref={summaryRef}
        className="dependency-graph__summary"
        aria-label="Resumo do conceito selecionado"
      >
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
        <p>{selectedConceptSummaryPt.oQueE}</p>
        <p>{selectedConceptSummaryPt.comoFunciona}</p>

        <div className="dependency-graph__summary-grid">
          <section className="dependency-graph__summary-section">
            <h5>Definicao</h5>
            <p>{selectedConceptSummaryPt.oQueE}</p>
          </section>

          <section className="dependency-graph__summary-section">
            <h5>Quando usar</h5>
            <ul>
              {selectedConceptProfile.whenToUse.map((item) => (
                <li key={`use-${item}`}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="dependency-graph__summary-section">
            <h5>Problemas comuns</h5>
            <ul>
              {selectedConceptProfile.commonProblems.map((item) => (
                <li key={`problem-${item}`}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="dependency-graph__summary-section">
            <h5>Custo computacional</h5>
            <div className="dependency-graph__cost-badges">
              <span
                className={`dependency-graph__cost-level dependency-graph__cost-level--${selectedConceptProfile.cost.level}`}
              >
                {selectedConceptProfile.cost.level === "low"
                  ? "🟢"
                  : selectedConceptProfile.cost.level === "medium"
                    ? "🟡"
                    : "🔴"}{" "}
                {toCostLevelLabel(selectedConceptProfile.cost.level)}
              </span>
              <span className="dependency-graph__cost-chip">
                CPU: {selectedConceptProfile.cost.cpuIntensive ? "intensivo" : "leve"}
              </span>
              <span className="dependency-graph__cost-chip">
                GPU: {selectedConceptProfile.cost.gpuRecommended ? "recomendada" : "opcional"}
              </span>
              <span className="dependency-graph__cost-chip">
                Memoria: {selectedConceptProfile.cost.memoryUsage}
              </span>
              <span className="dependency-graph__cost-chip">
                Latencia: {selectedConceptProfile.cost.inferenceLatency}
              </span>
            </div>
          </section>

          <section className="dependency-graph__summary-section">
            <h5>Bibliotecas populares</h5>
            <ul>
              {selectedConceptProfile.popularLibraries.map((lib) => (
                <li key={`lib-${lib}`}>{lib}</li>
              ))}
            </ul>
          </section>

          <section className="dependency-graph__summary-section">
            <h5>Por que isso importa no RAG</h5>
            <p>{selectedConceptProfile.ragWhyItMatters}</p>
          </section>
        </div>
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
