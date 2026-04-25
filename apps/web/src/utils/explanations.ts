import {
  CACHE_THRESHOLDS,
  INTENT_CONFIDENCE,
  LATENCY_THRESHOLDS,
  SCORE_THRESHOLDS,
} from "./thresholds";

export type QueryLanguage = "pt" | "en" | "unknown";

function safeRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return value / max;
}

export function detectQueryLanguage(query: string | undefined): QueryLanguage {
  const normalized = ` ${query?.toLowerCase() ?? ""} `;
  const ptMarkers = [" como ", " onde ", " qual ", " quando ", " o que ", " de ", " para "];

  if (ptMarkers.some((marker) => normalized.includes(marker))) {
    return "pt";
  }

  return normalized.trim().length > 0 ? "en" : "unknown";
}

export function explainScore(score: number, maxScore: number, provider: string): string {
  const pct = Math.round(safeRatio(score, maxScore) * 100);
  const isLexical = provider === "api-lexical" || provider === "local-hash";

  if (score === SCORE_THRESHOLDS.zero) {
    return `Score zero — nenhum token da query aparece neste chunk. ${
      provider === "ollama"
        ? "Com ollama, score zero é raro e indica ausência semântica forte."
        : `Com ${provider}, isso é comum para chunks sem palavras em comum com a query.`
    }`;
  }

  if (score >= SCORE_THRESHOLDS.high || pct >= 90) {
    return `Score alto (${pct}% do máximo) — este chunk tem forte sobreposição com a query. É provável que produza a resposta correta, principalmente se aparecer no rank 1.`;
  }

  if (score >= SCORE_THRESHOLDS.medium || pct >= 60) {
    return `Score intermediário (${pct}% do máximo) — há algum sinal útil, mas outros chunks podem estar mais próximos da pergunta. Compare rank, citação e texto antes de confiar.`;
  }

  return `Score baixo (${pct}% do máximo) — sobreposição fraca. ${
    isLexical
      ? "Tente reformular a query com palavras que aparecem literalmente no documento."
      : "O modelo não encontrou relação semântica forte; tente ser mais específico ou usar termos técnicos do domínio."
  }`;
}

export function explainQueryReformulation(score: number, provider: string): string {
  if (score >= SCORE_THRESHOLDS.medium) {
    return "";
  }

  if (provider === "api-lexical" || provider === "local-hash") {
    return "Score baixo com provider lexical — tente usar palavras que aparecem literalmente no documento. Exemplo: se a query é 'como ver requisições', tente 'Network tab' ou 'XHR'.";
  }

  return "Score baixo com provider semântico — o modelo não encontrou relação semântica forte. Tente ser mais específico ou usar termos técnicos do domínio.";
}

export function explainCacheHit(
  similarity: number,
  provider: string,
  estimatedLatencyMs: number
): string {
  const saved =
    estimatedLatencyMs > 1000
      ? `~${Math.round(estimatedLatencyMs / 1000)}s de ${provider}`
      : `~${Math.round(estimatedLatencyMs)}ms de ${provider}`;

  return `Cache hit com similarity ${similarity.toFixed(4)} — retrieval completamente ignorado. Economizou ${saved} de embedding, busca vetorial e re-ranking. O threshold padrão é ~${CACHE_THRESHOLDS.similarity}.`;
}

export function explainCacheMiss(hitCount: number, missCount: number): string {
  const total = hitCount + missCount;
  const rate = total > 0 ? Math.round((hitCount / total) * 100) : 0;

  return `Cache miss — pipeline completo executado. ${
    total > 1
      ? `Taxa de acerto até agora: ${rate}% (${hitCount} de ${total} queries).`
      : "Primeira query — ainda não há histórico para comparar."
  }`;
}

export function explainCacheSavings(provider: string, estimatedLatencyMs: number): string {
  const saved =
    estimatedLatencyMs > 1000
      ? `~${Math.round(estimatedLatencyMs / 1000)} segundos`
      : `~${Math.round(estimatedLatencyMs)}ms`;

  return `Um cache hit evita embedding da query, comparação contra os chunks do índice e re-ranking. Para ${provider}, isso economiza cerca de ${saved} nesta sessão.`;
}

export function explainIntent(
  intent: string,
  confidence: number,
  queryLanguage: QueryLanguage
): string {
  if (intent === "unknown" || confidence <= INTENT_CONFIDENCE.low) {
    return `Intent não reconhecido (confiança ${Math.round(confidence * 100)}%). ${
      queryLanguage === "pt"
        ? "Queries em português têm menor precisão porque os padrões do detector são mais fortes em inglês."
        : "A query não encaixa bem nos padrões factual, comparativo, procedural ou exploratório."
    } Isso não bloqueia o retrieval, mas reduz a qualidade do diagnóstico pedagógico.`;
  }

  const intents: Record<string, string> = {
    factual:
      "Pergunta factual — busca uma informação específica. Query expansion tende a adicionar sinônimos do termo principal.",
    procedural:
      "Pergunta procedural — procura passos ou instruções. Chunks com verbos de ação e sequência operacional tendem a ganhar relevância.",
    comparative:
      "Pergunta comparativa — o sistema tenta recuperar chunks que mencionem múltiplos conceitos para permitir comparação.",
    exploratory:
      "Pergunta exploratória — retrieval mais amplo; aumentar top-K pode melhorar cobertura e reduzir perda de contexto.",
  };

  return intents[intent] ?? `Intent detectado: ${intent} (confiança ${Math.round(confidence * 100)}%).`;
}

export function explainProviderLatency(
  provider: string,
  avgMs: number,
  baselineMs: number
): string {
  const baseline = Math.max(baselineMs, 1);
  const ratio = Math.max(1, Math.round(avgMs / baseline));

  if (avgMs < LATENCY_THRESHOLDS.fast || ratio <= 1) {
    return `${provider} — ${avgMs.toFixed(1)}ms avg. É o provider mais rápido da sessão; cache ainda ajuda, mas o ganho absoluto é pequeno.`;
  }

  return `${provider} — ${avgMs.toFixed(1)}ms avg, ${ratio}× mais lento que o baseline. Maior latência aumenta o valor do cache: cada query repetida evita cerca de ${Math.round(avgMs)}ms.`;
}

export function explainReranking(
  preRankChunkId: string,
  postRankChunkId: string,
  hybridScore: number,
  finalScore: number
): string {
  if (preRankChunkId === postRankChunkId) {
    return `Re-ranking manteve a ordem. Score final: ${finalScore.toFixed(4)} (hybrid: ${hybridScore.toFixed(4)}). A sobreposição direta com a query confirmou o ranking inicial.`;
  }

  return `Re-ranking alterou a ordem. Chunk ${postRankChunkId} subiu para rank 1 após considerar sobreposição direta com a query. Isso acontece quando hybrid search e re-ranking discordam sobre relevância.`;
}

export function explainHybridScores(dense: number, sparse: number, combined: number): string {
  const dominant = dense > sparse ? "dense" : "sparse";

  if (sparse === 0) {
    return `Sinal apenas semântico (dense: ${dense.toFixed(3)}, sparse: 0) — nenhum token da query aparece literalmente neste chunk; o match veio do embedding.`;
  }

  if (dense < 0.1) {
    return `Sinal apenas lexical (sparse: ${sparse.toFixed(3)}, dense: ${dense.toFixed(3)}) — há tokens em comum, mas relação semântica fraca. Isso pode gerar falso positivo lexical.`;
  }

  return `Sinal ${dominant === "dense" ? "semântico dominante" : "lexical dominante"} — dense: ${dense.toFixed(3)}, sparse: ${sparse.toFixed(3)}, combined: ${combined.toFixed(3)}. Hybrid search combina os dois para reduzir falsos positivos de cada abordagem.`;
}

export function explainCompareRankDivergence(
  providerA: string,
  rankAChunk: string,
  rankAScore: number,
  providerB: string,
  rankBChunk: string,
  rankBScore: number
): string {
  if (rankAChunk === rankBChunk) {
    return `Ambos os providers concordaram no rank 1, mas com scores diferentes (${rankAScore.toFixed(4)} vs ${rankBScore.toFixed(4)}). Mesma resposta provável, diferente grau de certeza.`;
  }

  return `Rankings divergiram — ${providerA} e ${providerB} recuperaram chunks diferentes no rank 1. Isso demonstra o gap semântico vs lexical: cada provider tem um conceito diferente de "similar" para esta query.`;
}

export function explainCompareTip(providerA: string, providerB: string): string {
  const semantic = (provider: string) => provider === "ollama";
  const lexical = (provider: string) => provider === "api-lexical" || provider === "local-hash";

  if (semantic(providerA) && semantic(providerB)) {
    return "Ambos são providers semânticos — divergência indica diferença entre modelos de embedding, não lexical vs semântico.";
  }

  if (
    (semantic(providerA) && lexical(providerB)) ||
    (lexical(providerA) && semantic(providerB))
  ) {
    return `Provider lexical e semântico ativos — qualquer divergência de ranking demonstra diretamente o gap semântico vs lexical.`;
  }

  return "Ambos os providers são lexicais — divergências tendem a vir de tokenização, hashing ou normalização, não de compreensão semântica.";
}

export function explainGuardrailBlock(rule: string, category: string): string {
  const explanations: Record<string, string> = {
    "prompt-injection-detector":
      "O sistema detectou tentativa de substituir instruções originais. A request deve parar antes de retrieval para impedir que o ataque vire contexto.",
    "pii-leakage-sanitizer":
      "PII detectado. O dado é removido antes de seguir para etapas posteriores; em um sistema de produção, isso evita vazamento em embeddings, logs e respostas.",
    "indirect-injection-detector":
      "Instrução maliciosa detectada em conteúdo de documento. Isso é indirect injection: o atacante embute comandos esperando que sejam executados quando o chunk for recuperado.",
    "hallucination-detector":
      "A afirmação tem pouco suporte no contexto recuperado. Em produção, respostas sem grounding devem ser revisadas ou bloqueadas para prevenir alucinação.",
    "jailbreak-detector":
      "O input tenta redefinir identidade, permissões ou comportamento do sistema. O guardrail impede que a cadeia principal receba essa instrução.",
    "prompt-leakage-detector":
      "O input tenta extrair system prompt ou instruções internas. O bloqueio protege detalhes operacionais que não devem entrar na resposta.",
  };

  return (
    explanations[rule] ??
    `Guardrail "${rule}" disparou na categoria ${category}. A consequência é impedir que esse sinal avance sem marcação explícita de risco.`
  );
}

export function explainGuardrailInternalOutcome(blocked: boolean): string {
  if (blocked) {
    return "O GuardrailChain executa 6 verificadores em sequência. O primeiro que detecta violação interrompe a cadeia: os seguintes não são executados, nenhum chunk é recuperado e nenhuma resposta é gerada.";
  }

  return "Nenhum dos 6 guardrails detectou violação. O input seguiria para retrieval normalmente. Em laboratório, vale testar variações mais sutis para observar limites e falsos negativos.";
}

export function explainGuardrailPass(): string {
  return "Nenhum bloqueio foi acionado. O input seguiria para retrieval normalmente, mas falsos negativos ainda são possíveis em guardrails determinísticos.";
}

export function explainGuardrailCategory(category: string): string {
  const descriptions: Record<string, string> = {
    "Prompt injection":
      "Tenta sobrescrever o system prompt. O guardrail procura padrões como 'ignore previous', 'reveal your instructions' e comandos para trocar o papel do modelo.",
    "PII leakage":
      "Detecta email, telefone, CPF, SSN e cartão antes de qualquer processamento. O dado deve ser removido antes de embedding, retrieval ou logging.",
    "Document injection":
      "Ataque embutido em documentos indexados. O atacante coloca instruções no conteúdo esperando que sejam executadas quando o chunk virar contexto.",
    "Grounding review":
      "Verifica se uma resposta candidata tem suporte no contexto recuperado. Afirmações sem evidência nos chunks devem ser bloqueadas ou revisadas.",
  };

  return descriptions[category] ?? "Categoria de segurança executada pela cadeia de guardrails.";
}

export function explainWorkflowStepConsequence(step: string): string {
  const consequences: Record<string, string> = {
    "normalize-request":
      "Se um campo obrigatório estiver faltando, o pipeline para aqui com erro 400 antes de qualquer computação.",
    "load-memory":
      "Se sessionId foi fornecido, memória de sessões anteriores é injetada no contexto antes do retrieval.",
    "ingest-document":
      "Falha aqui indica PDF malformado ou tipo não suportado; lineage e checksum preservam rastreabilidade.",
    "build-index":
      "É o passo mais custoso para documentos grandes; com ollama, cada chunk pode gerar chamada de embedding ao servidor local.",
    "process-query":
      "Query expansion adiciona tokens que podem aumentar sparse score; intent ajuda a explicar o tipo de busca executada.",
    "semantic-cache":
      "Hit aqui ignora retrieval e reranking. Miss aqui significa que o pipeline continua normalmente.",
    "cache-lookup":
      "Hit aqui ignora retrieval e reranking. Miss aqui significa que o pipeline continua normalmente.",
    "retrieve-chunks":
      "Este passo determina a resposta. Se o rank 1 estiver errado, a resposta extractiva também estará errada.",
    rerank:
      "Pode alterar o rank 1 quando hybrid score e overlap lexical discordam sobre relevância.",
    "rerank-chunks":
      "Pode alterar o rank 1 quando hybrid score e overlap lexical discordam sobre relevância.",
    "build-answer":
      "Sem LLM, a resposta é o texto literal do chunk rank 1; mudar top-K ou reranking muda o trecho final.",
  };

  return consequences[step] ?? `Consequência não catalogada para "${step}", mas a duração e status ainda ajudam a localizar gargalos.`;
}

export function explainTotalDuration(totalMs: number): string {
  if (totalMs < 10) {
    return "Pipeline local rápido — api-lexical sem servidor externo ou cache evitando etapas caras.";
  }

  if (totalMs > 1000) {
    return "Latência alta — provavelmente por chamada externa/local de embedding. Um cache hit eliminaria quase todo esse tempo.";
  }

  return "Latência normal para retrieval local. Se variar muito entre requests, compare provider e cache hit.";
}

export function explainCitationGrounding(chunkId: string, source: string, start: number, end: number): string {
  return `Grounding significa origem rastreável. Esta citação mapeia a resposta para o chunk ${chunkId}, arquivo ${source}, posição ${start}-${end}. Se a resposta estiver errada, o problema está no retrieval ou no chunk escolhido.`;
}

export function explainCitationPosition(start: number, total: number): string {
  const pct = total > 0 ? start / total : 0;

  if (pct >= 0.9) {
    return "Chunk no final do documento — conteúdo conclusivo, apêndices ou detalhes operacionais costumam aparecer nessa região.";
  }

  if (pct <= 0.1) {
    return "Chunk no início do documento — provavelmente introdução, título, sumário ou definição inicial do tema.";
  }

  return "Chunk no meio do documento — normalmente corpo principal, onde ficam explicações e evidências centrais.";
}

export function explainExtractiveAnswer(): string {
  return "A resposta é extractiva — copiada literalmente do chunk rank 1, sem paráfrase e sem geração por LLM. Isso elimina alucinação por construção: a resposta só pode conter o que está no documento. Quando a inferência com LLM entrar (Phase 3+), esse comportamento muda.";
}

export function explainNoChunks(chunkCount: number): string {
  return `Nenhum chunk foi recuperado. Isso normalmente significa que a query não teve sinal suficiente no índice de ${chunkCount} chunks.`;
}

export function explainNoCitations(): string {
  return "Esta resposta não trouxe citações. Para uma resposta grounded, cada afirmação importante deve apontar para um trecho recuperado.";
}

export function explainNoWorkflowTrace(): string {
  return "Workflow tracing não está disponível para esta request. Ative o tracing na API para visualizar os passos internos.";
}

export function explainWorkflowObservability(): string {
  return "Cada linha é um passo rastreável do pipeline. Status, duração e explicação ajudam a diferenciar um sistema observável de uma caixa-preta.";
}

export function explainTradeoffsLoading(): string {
  return "Métricas de trade-off ainda não disponíveis. Execute algumas perguntas para preencher latência, cache e custo por provider.";
}

export function explainNoProviderRows(): string {
  return "Ainda não há linhas por provider. Execute perguntas para registrar amostras de latência, cache e groundedness.";
}

export function explainTradeoffInsight(tradeoffHasSlowOllama: boolean, ratio?: number): string {
  if (tradeoffHasSlowOllama && ratio && ratio > 10) {
    return `Ollama está ~${ratio}× mais lento que api-lexical, mas cada cache hit economiza exatamente essa etapa cara. Todos os providers locais têm custo $0.00; providers cloud exibirão custo real quando configurados.`;
  }

  return "Todos os providers locais têm custo $0.00. Quando providers cloud (OpenAI, Anthropic etc.) forem configurados, custo por request e impacto de cache aparecerão aqui.";
}

export function explainGuardrailPlaygroundIntro(): string {
  return "Execute entradas adversariais na mesma cadeia de segurança do pacote: prompt injection, PII, jailbreak, prompt leakage, indirect injection e grounding review.";
}

export function explainTradeoffMetric(metric: string): string {
  const explanations: Record<string, string> = {
    "Total requests":
      "Quantidade de requests observadas na janela de métricas. Amostra pequena pode distorcer médias e percentuais.",
    "Avg latency":
      "Média de todas as requests, incluindo cache hits quase instantâneos. Cache alto pode deixar este número artificialmente baixo.",
    "Cache hit rate":
      "Percentual de queries servidas pelo cache semântico. Acima de 30% já indica reuso relevante de embedding, retrieval e reranking.",
    "Grounded rate":
      "Percentual de respostas com citação. Com respostas extractivas, tende a 100%; com LLM inference pode cair se o modelo gerar texto sem suporte.",
    "Avg cost":
      "Custo médio por request. Providers locais ficam em zero; providers cloud devem aparecer aqui quando configurados.",
    "P95 latency":
      "95% das requests foram mais rápidas que este valor. Ajuda a detectar outliers, geralmente cache miss em provider lento.",
  };

  return explanations[metric] ?? "Métrica operacional usada para comparar qualidade, custo e desempenho.";
}

export function explainZeroCacheRate(provider: string, requests: number): string {
  return `0% de cache em ${provider} com ${requests} requests — as queries foram todas diferentes. Repetir a mesma pergunta ativaria o cache semântico.`;
}

export function explainOllamaCacheParadox(provider: string): string {
  return `${provider} é muito mais lento que o baseline, mas exatamente por isso cada cache hit vale mais: uma query repetida evita a etapa cara de embedding e busca semântica.`;
}

export function explainRerankPenalty(): string {
  return "Re-ranking penalizou este chunk apesar do alto dense score — sobreposição direta com a query foi baixa.";
}

export function explainCompareDenseSparseAnomaly(
  provider: string,
  dense: number,
  sparse: number
): string {
  if (provider !== "ollama" || sparse <= dense) {
    return "";
  }

  return "Incomum para ollama — este chunk foi encontrado mais por tokens em comum do que por semântica. Pode indicar que o modelo de embedding não está capturando bem este domínio.";
}

export function explainLatencyCurve(recentLatencies: number[]): string {
  if (recentLatencies.length < 2) {
    return "Ainda não há pontos suficientes para interpretar a curva. Execute pelo menos duas requests.";
  }

  const max = Math.max(...recentLatencies);
  const min = Math.min(...recentLatencies);

  if (max > Math.max(min * 3, LATENCY_THRESHOLDS.slow)) {
    return "Pico visível — provavelmente uma request sem cache em provider lento. Repetir a mesma query tenderia a cair para perto de 0ms por cache hit.";
  }

  return "Curva relativamente plana — as requests usaram providers parecidos ou cache hit reduziu a variação de latência.";
}
