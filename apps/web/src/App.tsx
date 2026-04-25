import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  askWithFile,
  askWithPersisted,
  askWithText,
  getEmbeddingMap,
  getModelBenchmark,
  getModelBenchmarkPrecheck,
  runModelBenchmark,
  getTradeoffMetrics,
  indexFile,
  indexText,
} from "./api/client";
import type {
  ActiveIndex,
  EmbeddingMapResponse,
  EmbeddingProviderId,
  FileType,
  ModelBenchmarkPrecheckResponse,
  ModelBenchmarkProviderRun,
  ModelBenchmarkResponse,
  PersistedRagIndexListItem,
  RagAskResponse,
  SourceMode,
  TradeoffMetricsResponse,
} from "./api/types";
import { useApiHealth } from "./hooks/useApiHealth";
import { useIndexList } from "./hooks/useIndexList";
import { AnswerPanel } from "./components/AnswerPanel";
import { ChunksList } from "./components/ResultParts";
import { ExplainBox } from "./components/shared/ExplainBox";
import { Pill } from "./components/shared/Pill";
import { ScoreBar } from "./components/shared/ScoreBar";

type AppState =
  | "idle"
  | "indexing"
  | "indexed"
  | "asking"
  | "answered"
  | "error";

const STATE_LABELS: Record<AppState, string> = {
  idle: "Idle — no indexed document.",
  indexing: "Indexing document…",
  indexed: "Indexed and ready to ask.",
  asking: "Asking question…",
  answered: "Answered. Review citations and chunks.",
  error: "Action failed.",
};

const PROVIDER_OPTIONS: EmbeddingProviderId[] = [
  "api-lexical",
  "local-hash",
  "ollama",
];

type ResultMode = "answer" | "compare" | "embeddings" | "models";

interface CompareState {
  providerA: EmbeddingProviderId;
  providerB: EmbeddingProviderId;
  outputA?: RagAskResponse;
  outputB?: RagAskResponse;
}

function indexToActive(item: PersistedRagIndexListItem): ActiveIndex {
  return {
    documentId: item.document.documentId,
    title: item.document.title,
    chunkCount: item.index.chunkCount,
    embeddingProvider: item.index.embeddingProvider,
    embeddingModel: item.index.embeddingModel,
    indexPath: item.storage.indexPath,
  };
}

export default function App() {
  // Form state
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [embeddingProvider, setEmbeddingProvider] =
    useState<EmbeddingProviderId>("api-lexical");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>("text");
  const [fileTitle, setFileTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(3);
  const [sessionId, setSessionId] = useState("");

  // Output state
  const [outputTab, setOutputTab] = useState<ResultMode>("answer");
  const [result, setResult] = useState<RagAskResponse | undefined>(undefined);
  const [compare, setCompare] = useState<CompareState>({
    providerA: "api-lexical",
    providerB: "local-hash",
  });
  const [tradeoffMetrics, setTradeoffMetrics] = useState<TradeoffMetricsResponse | undefined>(
    undefined
  );
  const [tradeoffMetricsLoading, setTradeoffMetricsLoading] = useState(false);
  const [tradeoffMessage, setTradeoffMessage] = useState("");
  const [tradeoffMessageIsError, setTradeoffMessageIsError] = useState(false);
  const [embeddingMap, setEmbeddingMap] = useState<EmbeddingMapResponse | undefined>(
    undefined
  );
  const [embeddingMapLoading, setEmbeddingMapLoading] = useState(false);
  const [embeddingMapMessage, setEmbeddingMapMessage] = useState("");
  const [embeddingMapMessageIsError, setEmbeddingMapMessageIsError] = useState(false);
  const [modelBenchmark, setModelBenchmark] = useState<ModelBenchmarkResponse | undefined>(
    undefined
  );
  const [modelBenchmarkPrecheck, setModelBenchmarkPrecheck] = useState<
    ModelBenchmarkPrecheckResponse | undefined
  >(undefined);
  const [modelBenchmarkLoading, setModelBenchmarkLoading] = useState(false);
  const [modelBenchmarkPrecheckLoading, setModelBenchmarkPrecheckLoading] = useState(false);
  const [modelBenchmarkRunLoading, setModelBenchmarkRunLoading] = useState(false);
  const [modelBenchmarkMessage, setModelBenchmarkMessage] = useState("");
  const [modelBenchmarkMessageIsError, setModelBenchmarkMessageIsError] = useState(false);
  const [modelBenchmarkPrecheckMessage, setModelBenchmarkPrecheckMessage] = useState("");
  const [modelBenchmarkPrecheckMessageIsError, setModelBenchmarkPrecheckMessageIsError] =
    useState(false);

  // App state
  const [appState, setAppState] = useState<AppState>("idle");
  const [stateDetail, setStateDetail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [compareMessage, setCompareMessage] = useState<string>(
    "Run Ask while Compare tab is active to compare providers side by side."
  );
  const [compareMessageIsError, setCompareMessageIsError] = useState(false);

  // Indexes
  const [activeIndex, setActiveIndex] = useState<ActiveIndex | undefined>(
    undefined
  );
  const { indexes, refresh: refreshIndexes, remove: removeIndex } =
    useIndexList();
  const { status: healthStatus, refresh: refreshHealth } = useApiHealth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reportMessage = useCallback((text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  }, []);

  const reportCompareMessage = useCallback((text: string, isError = false) => {
    setCompareMessage(text);
    setCompareMessageIsError(isError);
  }, []);

  const reportTradeoffMessage = useCallback((text: string, isError = false) => {
    setTradeoffMessage(text);
    setTradeoffMessageIsError(isError);
  }, []);

  const reportEmbeddingMapMessage = useCallback((text: string, isError = false) => {
    setEmbeddingMapMessage(text);
    setEmbeddingMapMessageIsError(isError);
  }, []);

  const reportModelBenchmarkMessage = useCallback((text: string, isError = false) => {
    setModelBenchmarkMessage(text);
    setModelBenchmarkMessageIsError(isError);
  }, []);

  const reportModelBenchmarkPrecheckMessage = useCallback(
    (text: string, isError = false) => {
      setModelBenchmarkPrecheckMessage(text);
      setModelBenchmarkPrecheckMessageIsError(isError);
    },
    []
  );

  const setState = useCallback((next: AppState, detail = "") => {
    setAppState(next);
    setStateDetail(detail);
  }, []);

  const clearActiveIndex = useCallback(() => {
    setActiveIndex(undefined);
  }, []);

  // Any source-content change invalidates the persisted-index selection
  // so "Ask" re-uses the fresh inputs rather than the stale index reference.
  const invalidateIndexOnChange = clearActiveIndex;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);

    if (next) {
      setFileType(next.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text");

      if (!fileTitle.trim()) {
        setFileTitle(next.name);
      }
    }

    invalidateIndexOnChange();
  };

  const handleIndexSelectionChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const documentId = event.target.value;

    if (!documentId) {
      clearActiveIndex();
      return;
    }

    const selected = indexes.find(
      (item) => item.document.documentId === documentId
    );

    if (!selected) {
      clearActiveIndex();
      return;
    }

    setActiveIndex(indexToActive(selected));
    reportMessage(`Selected ${selected.document.title}.`);
  };

  const handleDeleteIndex = async () => {
    if (!activeIndex) {
      return;
    }

    try {
      await removeIndex(activeIndex.documentId);
      reportMessage(`Deleted index ${activeIndex.documentId}.`);
      clearActiveIndex();
    } catch (error) {
      reportMessage(
        error instanceof Error ? error.message : "Delete failed.",
        true
      );
    } finally {
      await refreshHealth();
    }
  };

  const handleIndex = async () => {
    reportMessage("");
    reportCompareMessage("");

    setState("indexing");

    try {
      const response =
        sourceMode === "file"
          ? await runIndexFile()
          : await runIndexText();

      setActiveIndex({
        documentId: response.document.documentId,
        title: response.document.title,
        chunkCount: response.index.chunkCount,
        embeddingProvider: response.index.embeddingProvider,
        embeddingModel: response.index.embeddingModel,
        indexPath: response.storage.indexPath,
      });
      await refreshIndexes();
      reportMessage(`Indexed ${response.index.chunkCount} chunks.`);
      setState("indexed", `Indexed ${response.index.chunkCount} chunks.`);
    } catch (error) {
      clearActiveIndex();
      reportMessage(
        error instanceof Error ? error.message : "Indexing failed.",
        true
      );
      setState("error", "Indexing failed.");
    } finally {
      await refreshHealth();
    }
  };

  const runIndexFile = async () => {
    if (!file) {
      throw new Error("File is required.");
    }

    return await indexFile({
      file,
      fileType,
      embeddingProvider,
      title: fileTitle.trim() || undefined,
    });
  };

  const runIndexText = async () => {
    const content = textContent.trim();

    if (!content) {
      throw new Error("Text is required.");
    }

    return await indexText({
      content,
      embeddingProvider,
      title: textTitle.trim() || undefined,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    reportMessage("");
    reportCompareMessage("");

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      reportMessage("Question is required.", true);
      setState("error", "Question is required.");
      return;
    }

    if (!Number.isInteger(topK) || topK <= 0) {
      reportMessage("Top K must be a positive integer.", true);
      setState("error", "Top K must be a positive integer.");
      return;
    }

    setState("asking");

    try {
      if (outputTab === "compare") {
        if (activeIndex) {
          throw new Error(
            "Compare mode requires file/text source, not a persisted index selection."
          );
        }

        await runCompare(trimmedQuery, topK);
        reportCompareMessage("Compare completed.");
      } else {
        const response = activeIndex
          ? await askWithPersisted({
              documentId: activeIndex.documentId,
              query: trimmedQuery,
              topK,
              sessionId: sessionId.trim() || undefined,
            })
          : sourceMode === "file"
            ? await runAskFile(trimmedQuery, topK, embeddingProvider)
            : await runAskText(trimmedQuery, topK, embeddingProvider);

        setResult(response);
        reportMessage(
          activeIndex ? "Answered from persisted index." : "Done."
        );
      }

      setState("answered");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Request failed.";
      reportMessage(text, true);
      reportCompareMessage(text, true);
      setState("error", "Ask failed.");
    } finally {
      await refreshHealth();
    }
  };

  const runAskFile = async (
    currentQuery: string,
    currentTopK: number,
    provider: EmbeddingProviderId
  ) => {
    if (!file) {
      throw new Error("File is required.");
    }

    if (file.size === 0) {
      throw new Error("Document is empty.");
    }

    return await askWithFile({
      file,
      fileType,
      query: currentQuery,
      topK: currentTopK,
      embeddingProvider: provider,
      sessionId: sessionId.trim() || undefined,
      title: fileTitle.trim() || undefined,
    });
  };

  const runAskText = async (
    currentQuery: string,
    currentTopK: number,
    provider: EmbeddingProviderId
  ) => {
    const content = textContent.trim();

    if (!content) {
      throw new Error("Document is empty.");
    }

    return await askWithText({
      content,
      query: currentQuery,
      topK: currentTopK,
      embeddingProvider: provider,
      sessionId: sessionId.trim() || undefined,
      title: textTitle.trim() || undefined,
    });
  };

  const runCompare = async (currentQuery: string, currentTopK: number) => {
    const askOne = async (provider: EmbeddingProviderId) =>
      sourceMode === "file"
        ? await runAskFile(currentQuery, currentTopK, provider)
        : await runAskText(currentQuery, currentTopK, provider);

    const [outputA, outputB] = await Promise.all([
      askOne(compare.providerA),
      askOne(compare.providerB),
    ]);

    setCompare((state) => ({ ...state, outputA, outputB }));
  };

  const handleClear = () => {
    setFile(null);
    setFileTitle("");
    setFileType("text");
    setTextContent("");
    setTextTitle("");
    setQuery("");
    setTopK(3);
    setSessionId("");
    setResult(undefined);
    setCompare((state) => ({
      ...state,
      outputA: undefined,
      outputB: undefined,
    }));
    setEmbeddingMap(undefined);
    setModelBenchmark(undefined);
    setModelBenchmarkPrecheck(undefined);
    clearActiveIndex();
    reportMessage("");
    reportCompareMessage(
      "Run Ask while Compare tab is active to compare providers side by side."
    );
    reportTradeoffMessage("");
    reportEmbeddingMapMessage("");
    reportModelBenchmarkMessage("");
    reportModelBenchmarkPrecheckMessage("");
    setState("idle");
    setOutputTab("answer");
    setSourceMode("file");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Keep the index <select> synced with the active index selection.
  useEffect(() => {
    if (activeIndex && !indexes.find((item) => item.document.documentId === activeIndex.documentId)) {
      clearActiveIndex();
    }
  }, [indexes, activeIndex, clearActiveIndex]);

  const loadTradeoffs = useCallback(async () => {
    setTradeoffMetricsLoading(true);

    try {
      const metrics = await getTradeoffMetrics();
      setTradeoffMetrics(metrics);
      reportTradeoffMessage("");
    } catch (error) {
      reportTradeoffMessage(
        error instanceof Error ? error.message : "Failed to load trade-off metrics.",
        true
      );
    } finally {
      setTradeoffMetricsLoading(false);
    }
  }, [reportTradeoffMessage]);

  const loadEmbeddingMap = useCallback(async () => {
    if (!activeIndex) {
      setEmbeddingMap(undefined);
      reportEmbeddingMapMessage("Select an indexed document to visualize embeddings.");
      return;
    }

    setEmbeddingMapLoading(true);

    try {
      const map = await getEmbeddingMap(activeIndex.documentId);
      setEmbeddingMap(map);
      reportEmbeddingMapMessage("");
    } catch (error) {
      reportEmbeddingMapMessage(
        error instanceof Error ? error.message : "Failed to load embedding map.",
        true
      );
    } finally {
      setEmbeddingMapLoading(false);
    }
  }, [activeIndex, reportEmbeddingMapMessage]);

  const loadModelBenchmark = useCallback(async () => {
    setModelBenchmarkLoading(true);

    try {
      const benchmark = await getModelBenchmark();
      setModelBenchmark(benchmark);
      reportModelBenchmarkMessage("");
    } catch (error) {
      reportModelBenchmarkMessage(
        error instanceof Error ? error.message : "Failed to load model benchmark.",
        true
      );
    } finally {
      setModelBenchmarkLoading(false);
    }
  }, [reportModelBenchmarkMessage]);

  const loadModelBenchmarkPrecheck = useCallback(async () => {
    setModelBenchmarkPrecheckLoading(true);

    try {
      const precheck = await getModelBenchmarkPrecheck();
      setModelBenchmarkPrecheck(precheck);
      reportModelBenchmarkPrecheckMessage(
        precheck.phase4Ready
          ? "Precheck passed. Phase 4 benchmark target is ready."
          : "Precheck found blockers for Phase 4 benchmark target."
      );
    } catch (error) {
      reportModelBenchmarkPrecheckMessage(
        error instanceof Error ? error.message : "Failed to run benchmark precheck.",
        true
      );
    } finally {
      setModelBenchmarkPrecheckLoading(false);
    }
  }, [reportModelBenchmarkPrecheckMessage]);

  const executeModelBenchmarkRun = useCallback(async () => {
    setModelBenchmarkRunLoading(true);

    try {
      const response = await runModelBenchmark();
      reportModelBenchmarkMessage(
        response.success
          ? "Benchmark run completed. Artifact updated."
          : "Benchmark run finished with errors. Check provider output."
      );
      await loadModelBenchmark();
      await loadModelBenchmarkPrecheck();
    } catch (error) {
      reportModelBenchmarkMessage(
        error instanceof Error ? error.message : "Failed to run model benchmark.",
        true
      );
    } finally {
      setModelBenchmarkRunLoading(false);
    }
  }, [loadModelBenchmark, loadModelBenchmarkPrecheck, reportModelBenchmarkMessage]);

  useEffect(() => {
    if (outputTab !== "embeddings") {
      return;
    }

    void loadEmbeddingMap();
  }, [outputTab, loadEmbeddingMap]);

  useEffect(() => {
    if (outputTab !== "models") {
      return;
    }

    void loadModelBenchmark();
    void loadModelBenchmarkPrecheck();
  }, [outputTab, loadModelBenchmark, loadModelBenchmarkPrecheck]);

  const indexStatus = useMemo(() => {
    if (activeIndex) {
      return {
        text: `Indexed: ${activeIndex.title} | ${activeIndex.chunkCount} chunks | ${activeIndex.embeddingProvider} | ${activeIndex.documentId}`,
        className: "index-status index-status--indexed",
      };
    }

    const detail = stateDetail || STATE_LABELS[appState];
    return {
      text: detail,
      className: `index-status index-status--${appState}`,
    };
  }, [activeIndex, appState, stateDetail]);

  const busy = appState === "indexing" || appState === "asking";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Phase 4 Lab</p>
          <h1>Local RAG Console</h1>
        </div>
        <div className="topbar__meta">
          <span className={`health health--${healthStatus}`}>
            {healthStatus === "checking"
              ? "API checking"
              : healthStatus === "online"
                ? "API online"
                : "API offline"}
          </span>
          <span className="tag">Local retrieval</span>
        </div>
      </header>

      <section className="workspace" aria-label="Local RAG workspace">
        <form className="panel input-panel" onSubmit={handleSubmit}>
          <div className="panel__header">
            <h2>Source</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>

          <div className="segmented" aria-label="Source mode">
            <label>
              <input
                type="radio"
                name="sourceMode"
                value="file"
                checked={sourceMode === "file"}
                onChange={() => {
                  setSourceMode("file");
                  clearActiveIndex();
                }}
              />
              <span>File</span>
            </label>
            <label>
              <input
                type="radio"
                name="sourceMode"
                value="text"
                checked={sourceMode === "text"}
                onChange={() => {
                  setSourceMode("text");
                  clearActiveIndex();
                }}
              />
              <span>Text</span>
            </label>
          </div>

          <div className="index-tools">
            <label className="field">
              <span>Indexed documents</span>
              <select
                value={activeIndex?.documentId ?? ""}
                onChange={handleIndexSelectionChange}
                disabled={indexes.length === 0}
              >
                {indexes.length === 0 ? (
                  <option value="">No indexed documents</option>
                ) : (
                  <>
                    <option value="">Select an index</option>
                    {indexes.map((item) => (
                      <option
                        key={item.document.documentId}
                        value={item.document.documentId}
                      >
                        {`${item.document.title} | ${item.index.chunkCount} chunks | ${item.index.embeddingProvider}`}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
            <div className="index-tools__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void refreshIndexes()}
              >
                Refresh
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={!activeIndex}
                onClick={() => void handleDeleteIndex()}
              >
                Delete
              </button>
            </div>
          </div>

          <label className="field">
            <span>Embedding provider</span>
            <select
              value={embeddingProvider}
              onChange={(event) => {
                setEmbeddingProvider(event.target.value as EmbeddingProviderId);
                clearActiveIndex();
              }}
            >
              {PROVIDER_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <div className="mode-panel" data-mode-panel="file" hidden={sourceMode !== "file"}>
            <label className="field">
              <span>File</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                onChange={handleFileChange}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Type</span>
                <select
                  value={fileType}
                  onChange={(event) => {
                    setFileType(event.target.value as FileType);
                    clearActiveIndex();
                  }}
                >
                  <option value="text">Text</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>

              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Optional"
                  value={fileTitle}
                  onChange={(event) => {
                    setFileTitle(event.target.value);
                    clearActiveIndex();
                  }}
                />
              </label>
            </div>
          </div>

          <div className="mode-panel" data-mode-panel="text" hidden={sourceMode !== "text"}>
            <label className="field">
              <span>Text</span>
              <textarea
                rows={11}
                placeholder="Document content"
                value={textContent}
                onChange={(event) => {
                  setTextContent(event.target.value);
                  clearActiveIndex();
                }}
              />
            </label>

            <label className="field">
              <span>Title</span>
              <input
                type="text"
                autoComplete="off"
                placeholder="Inline text"
                value={textTitle}
                onChange={(event) => {
                  setTextTitle(event.target.value);
                  clearActiveIndex();
                }}
              />
            </label>
          </div>

          <label className="field">
            <span>Question</span>
            <textarea
              rows={4}
              required
              placeholder="Ask a question about the indexed document..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <details className="advanced-options" open>
            <summary>Advanced options</summary>
            <label className="field">
              <span>Session ID (memory)</span>
              <input
                type="text"
                autoComplete="off"
                placeholder="Optional"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Top K</span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={topK}
                onChange={(event) => setTopK(Number(event.target.value))}
              />
            </label>
          </details>

          <div className="run-row">
            <div className="action-buttons">
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => void handleIndex()}
              >
                {appState === "indexing" ? "Indexing" : "Index"}
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={busy}
              >
                {appState === "asking" ? "Asking" : "Ask"}
              </button>
            </div>
          </div>

          <p className={indexStatus.className}>{indexStatus.text}</p>
          <p
            className={`form-message${messageIsError ? " is-error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </form>

        <ResultPanel
          outputTab={outputTab}
          setOutputTab={setOutputTab}
          activeIndex={activeIndex}
          result={result}
          compare={compare}
          setCompare={setCompare}
          compareMessage={compareMessage}
          compareMessageIsError={compareMessageIsError}
          tradeoffMetrics={tradeoffMetrics}
          tradeoffMetricsLoading={tradeoffMetricsLoading}
          onRefreshTradeoffs={() => void loadTradeoffs()}
          tradeoffMessage={tradeoffMessage}
          tradeoffMessageIsError={tradeoffMessageIsError}
          embeddingMap={embeddingMap}
          embeddingMapLoading={embeddingMapLoading}
          onRefreshEmbeddingMap={() => void loadEmbeddingMap()}
          embeddingMapMessage={embeddingMapMessage}
          embeddingMapMessageIsError={embeddingMapMessageIsError}
          modelBenchmark={modelBenchmark}
          modelBenchmarkPrecheck={modelBenchmarkPrecheck}
          modelBenchmarkLoading={modelBenchmarkLoading}
          modelBenchmarkPrecheckLoading={modelBenchmarkPrecheckLoading}
          modelBenchmarkRunLoading={modelBenchmarkRunLoading}
          onRefreshModelBenchmark={() => void loadModelBenchmark()}
          onRunModelBenchmarkPrecheck={() => void loadModelBenchmarkPrecheck()}
          onRunModelBenchmark={() => void executeModelBenchmarkRun()}
          modelBenchmarkMessage={modelBenchmarkMessage}
          modelBenchmarkMessageIsError={modelBenchmarkMessageIsError}
          modelBenchmarkPrecheckMessage={modelBenchmarkPrecheckMessage}
          modelBenchmarkPrecheckMessageIsError={modelBenchmarkPrecheckMessageIsError}
        />
      </section>
    </main>
  );
}

interface ResultPanelProps {
  outputTab: ResultMode;
  setOutputTab: (tab: ResultMode) => void;
  activeIndex: ActiveIndex | undefined;
  result: RagAskResponse | undefined;
  compare: CompareState;
  setCompare: React.Dispatch<React.SetStateAction<CompareState>>;
  compareMessage: string;
  compareMessageIsError: boolean;
  tradeoffMetrics: TradeoffMetricsResponse | undefined;
  tradeoffMetricsLoading: boolean;
  onRefreshTradeoffs: () => void;
  tradeoffMessage: string;
  tradeoffMessageIsError: boolean;
  embeddingMap: EmbeddingMapResponse | undefined;
  embeddingMapLoading: boolean;
  onRefreshEmbeddingMap: () => void;
  embeddingMapMessage: string;
  embeddingMapMessageIsError: boolean;
  modelBenchmark: ModelBenchmarkResponse | undefined;
  modelBenchmarkPrecheck: ModelBenchmarkPrecheckResponse | undefined;
  modelBenchmarkLoading: boolean;
  modelBenchmarkPrecheckLoading: boolean;
  modelBenchmarkRunLoading: boolean;
  onRefreshModelBenchmark: () => void;
  onRunModelBenchmarkPrecheck: () => void;
  onRunModelBenchmark: () => void;
  modelBenchmarkMessage: string;
  modelBenchmarkMessageIsError: boolean;
  modelBenchmarkPrecheckMessage: string;
  modelBenchmarkPrecheckMessageIsError: boolean;
}

function ResultPanel({
  outputTab,
  setOutputTab,
  activeIndex,
  result,
  compare,
  setCompare,
  compareMessage,
  compareMessageIsError,
  tradeoffMetrics,
  tradeoffMetricsLoading,
  onRefreshTradeoffs,
  tradeoffMessage,
  tradeoffMessageIsError,
  embeddingMap,
  embeddingMapLoading,
  onRefreshEmbeddingMap,
  embeddingMapMessage,
  embeddingMapMessageIsError,
  modelBenchmark,
  modelBenchmarkPrecheck,
  modelBenchmarkLoading,
  modelBenchmarkPrecheckLoading,
  modelBenchmarkRunLoading,
  onRefreshModelBenchmark,
  onRunModelBenchmarkPrecheck,
  onRunModelBenchmark,
  modelBenchmarkMessage,
  modelBenchmarkMessageIsError,
  modelBenchmarkPrecheckMessage,
  modelBenchmarkPrecheckMessageIsError,
}: ResultPanelProps) {
  const results = result?.devMode?.results ?? [];
  const hasResult = Boolean(result);
  const resultMeta = result
    ? `${result.index.chunkCount ?? 0} chunks | ${
        result.index.embeddingProvider ?? "unknown provider"
      }${
        result.index.embeddingModel?.model
          ? ` | ${result.index.embeddingModel.model}`
          : ""
      }`
    : outputTab === "compare"
      ? "Compare mode"
      : outputTab === "embeddings"
        ? activeIndex
          ? `${activeIndex.chunkCount} chunks | ${activeIndex.embeddingProvider}`
          : "No index selected"
      : outputTab === "models"
        ? modelBenchmark
          ? `${modelBenchmark.providers.length} providers | ${modelBenchmark.dataset}`
          : "No benchmark loaded"
        : "No result";

  return (
    <section className="panel output-panel" aria-label="RAG output">
      <div className="panel__header">
        <h2>Answer</h2>
        <span className="tag">{resultMeta}</span>
      </div>

      <div className="result-tabs" role="tablist" aria-label="Output modes">
        <button
          className={`result-tab${outputTab === "answer" ? " result-tab--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={outputTab === "answer"}
          onClick={() => setOutputTab("answer")}
        >
          Answer
        </button>
        <button
          className={`result-tab${outputTab === "compare" ? " result-tab--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={outputTab === "compare"}
          onClick={() => setOutputTab("compare")}
        >
          Compare
        </button>
        <button
          className={`result-tab${outputTab === "embeddings" ? " result-tab--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={outputTab === "embeddings"}
          onClick={() => setOutputTab("embeddings")}
        >
          Embeddings
        </button>
        <button
          className={`result-tab${outputTab === "models" ? " result-tab--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={outputTab === "models"}
          onClick={() => setOutputTab("models")}
        >
          Models
        </button>
      </div>

      {outputTab === "answer" && (
        <AnswerPanel
          response={result ?? null}
          tradeoffs={tradeoffMetrics ?? null}
          tradeoffsLoading={tradeoffMetricsLoading}
          onRefreshTradeoffs={onRefreshTradeoffs}
        />
      )}

      {outputTab === "compare" && (
        <div className="compare-view">
          <section className="compare-controls">
            <label className="field field--compact">
              <span>Provider A</span>
              <select
                value={compare.providerA}
                onChange={(event) =>
                  setCompare((state) => ({
                    ...state,
                    providerA: event.target.value as EmbeddingProviderId,
                  }))
                }
              >
                {PROVIDER_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--compact">
              <span>Provider B</span>
              <select
                value={compare.providerB}
                onChange={(event) =>
                  setCompare((state) => ({
                    ...state,
                    providerB: event.target.value as EmbeddingProviderId,
                  }))
                }
              >
                {PROVIDER_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <p
            className={`form-message${compareMessageIsError ? " is-error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {compareMessage}
          </p>

          <p
            className="compare-tip"
            title="api-lexical and local-hash are lexical strategies. Ollama embeddings usually produce stronger semantic differences."
          >
            Tip: Try <strong>ollama</strong> as Provider B to see semantic vs
            lexical retrieval differences.
          </p>

          <div className="compare-grid">
            <CompareColumn
              provider={compare.providerA}
              output={compare.outputA}
            />
            <CompareColumn
              provider={compare.providerB}
              output={compare.outputB}
            />
          </div>
        </div>
      )}

      {outputTab === "embeddings" && (
        <div className="embedding-view">
          <div className="panel__header">
            <h3>Embedding Map</h3>
            <button
              type="button"
              className="secondary-button"
              onClick={onRefreshEmbeddingMap}
              disabled={embeddingMapLoading || !activeIndex}
            >
              {embeddingMapLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>

          <p
            className={`form-message${embeddingMapMessageIsError ? " is-error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {embeddingMapMessage}
          </p>

          {!activeIndex && (
            <p className="chunk-text">Select a persisted index to inspect its chunks.</p>
          )}

          {activeIndex && !embeddingMap && !embeddingMapLoading && (
            <p className="chunk-text">No embedding map loaded yet.</p>
          )}

          {embeddingMap && <EmbeddingMapView map={embeddingMap} />}
        </div>
      )}

      {outputTab === "models" && (
        <ModelBenchmarkView
          benchmark={modelBenchmark}
          precheck={modelBenchmarkPrecheck}
          loading={modelBenchmarkLoading}
          precheckLoading={modelBenchmarkPrecheckLoading}
          runLoading={modelBenchmarkRunLoading}
          onRefresh={onRefreshModelBenchmark}
          onRunPrecheck={onRunModelBenchmarkPrecheck}
          onRunBenchmark={onRunModelBenchmark}
          message={modelBenchmarkMessage}
          messageIsError={modelBenchmarkMessageIsError}
          precheckMessage={modelBenchmarkPrecheckMessage}
          precheckMessageIsError={modelBenchmarkPrecheckMessageIsError}
        />
      )}
    </section>
  );
}

function ModelBenchmarkView({
  benchmark,
  precheck,
  loading,
  precheckLoading,
  runLoading,
  onRefresh,
  onRunPrecheck,
  onRunBenchmark,
  message,
  messageIsError,
  precheckMessage,
  precheckMessageIsError,
}: {
  benchmark: ModelBenchmarkResponse | undefined;
  precheck: ModelBenchmarkPrecheckResponse | undefined;
  loading: boolean;
  precheckLoading: boolean;
  runLoading: boolean;
  onRefresh: () => void;
  onRunPrecheck: () => void;
  onRunBenchmark: () => void;
  message: string;
  messageIsError: boolean;
  precheckMessage: string;
  precheckMessageIsError: boolean;
}) {
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const selected =
    benchmark?.providers.find((provider) => provider.provider === selectedProvider) ??
    benchmark?.providers[0];

  useEffect(() => {
    if (!benchmark || benchmark.providers.some((provider) => provider.provider === selectedProvider)) {
      return;
    }

    setSelectedProvider(benchmark.providers[0]?.provider ?? "openai");
  }, [benchmark, selectedProvider]);

  return (
    <div className="models-view">
      <div className="panel__header">
        <h3>Model Benchmark</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="secondary-button"
            onClick={onRunBenchmark}
            disabled={runLoading}
          >
            {runLoading ? "Running" : "Run Benchmark"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onRunPrecheck}
            disabled={precheckLoading}
          >
            {precheckLoading ? "Checking" : "Precheck"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <p
        className={`form-message${messageIsError ? " is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      <p
        className={`form-message${precheckMessageIsError ? " is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {precheckMessage}
      </p>

      {precheck && (
        <section className="output-section" style={{ marginTop: 10, paddingTop: 10 }}>
          <div className="section-title">
            <h3>Precheck</h3>
            <Pill variant={precheck.phase4Ready ? "green" : "amber"}>
              {precheck.phase4Ready ? "Ready" : "Blocked"}
            </Pill>
          </div>
          <div className="result-list">
            {precheck.results.map((provider) => (
              <article key={provider.provider} className="result-row">
                <div className="result-row__meta">
                  <Pill variant="gray">{provider.provider}</Pill>
                  <Pill variant={provider.ready ? "green" : "amber"}>
                    {provider.ready ? "ready" : "blocked"}
                  </Pill>
                </div>
                {provider.checks.map((check) => (
                  <p key={`${provider.provider}-${check.name}`} className="chunk-text">
                    {check.name}: {check.detail}
                  </p>
                ))}
                {provider.blocker && (
                  <ExplainBox variant="warning">{provider.blocker}</ExplainBox>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {!benchmark && !loading && (
        <p className="chunk-text">No model benchmark available yet.</p>
      )}

      {benchmark && (
        <>
          <div className="benchmark-summary">
            <MetricCard
              label="Phase 4"
              value={benchmark.successCriteria.phase4ModelBenchmarkPassed ? "Passed" : "Pending"}
            />
            <MetricCard label="Dataset" value={benchmark.dataset} />
            <MetricCard label="Golden rows" value={String(benchmark.goldenSize)} />
          </div>

          <ModelBenchmarkComparison providers={benchmark.providers} />

          <label className="field field--benchmark-provider">
            <span>Model provider</span>
            <select
              value={selected?.provider ?? ""}
              onChange={(event) => setSelectedProvider(event.target.value)}
            >
              {benchmark.providers.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {provider.provider}
                </option>
              ))}
            </select>
          </label>

          {selected && <ModelProviderDetails provider={selected} />}
        </>
      )}
    </div>
  );
}

function ModelBenchmarkComparison({
  providers,
}: {
  providers: ModelBenchmarkResponse["providers"];
}) {
  if (providers.length === 0) {
    return null;
  }

  const maxLatencyMs = Math.max(...providers.map((provider) => provider.metrics.avgLatencyMs), 1);

  return (
    <section className="output-section model-compare-section">
      <div className="section-title">
        <h3>Provider Comparison</h3>
        <span className="count">{providers.length}</span>
      </div>
      <div className="model-compare-grid">
        {providers.map((provider) => {
          const quality = Math.max(0, Math.min(1, provider.metrics.avgQuality));
          const expectedHit = Math.max(
            0,
            Math.min(1, provider.metrics.containsExpectedAnswerRate)
          );
          const latencyRatio =
            maxLatencyMs > 0 ? provider.metrics.avgLatencyMs / maxLatencyMs : 0;

          return (
            <article key={provider.provider} className="model-compare-card">
              <div className="result-row__meta">
                <Pill variant="gray">{provider.provider}</Pill>
                <Pill variant={provider.status === "completed" ? "green" : "amber"}>
                  {provider.status}
                </Pill>
              </div>

              <MetricLine
                label="Quality"
                value={provider.metrics.avgQuality.toFixed(3)}
                ratio={quality}
              />
              <MetricLine
                label="Expected hit"
                value={formatRate(provider.metrics.containsExpectedAnswerRate)}
                ratio={expectedHit}
              />
              <MetricLine
                label="Avg latency"
                value={`${provider.metrics.avgLatencyMs.toFixed(1)} ms`}
                ratio={latencyRatio}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MetricLine({
  label,
  value,
  ratio,
}: {
  label: string;
  value: string;
  ratio: number;
}) {
  const safeRatio = Math.max(0.02, Math.min(1, ratio));

  return (
    <div className="model-metric-line">
      <div className="model-metric-line__header">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="model-metric-line__bar" aria-hidden="true">
        <span style={{ width: `${Math.round(safeRatio * 100)}%` }} />
      </div>
    </div>
  );
}

function ModelProviderDetails({ provider }: { provider: ModelBenchmarkProviderRun }) {
  const firstQuery = provider.perQuery[0];
  const statusVariant =
    provider.status === "completed"
      ? "green"
      : provider.status === "error"
        ? "amber"
        : "gray";
  const providerNote =
    provider.provider === "openai"
      ? "OpenAI is the cloud baseline for Phase 4. When quota is available, this row shows real latency, answer quality and estimated cost for the cloud run."
      : provider.provider === "ollama"
        ? "Ollama is the local model baseline. It usually costs $0.00 locally but can be slower than lexical extraction."
        : "The local extractive baseline builds an answer from retrieved text without calling an external model.";

  return (
    <>
      <div className="provider-status-row">
        <Pill variant={statusVariant}>{provider.status}</Pill>
        <Pill variant="blue">{provider.kind}</Pill>
        <Pill variant="gray">{provider.model}</Pill>
      </div>

      <ExplainBox>{providerNote}</ExplainBox>

      <div className="tradeoffs-grid">
        <MetricCard label="Requests" value={String(provider.metrics.requestCount)} />
        <MetricCard label="Avg latency" value={`${provider.metrics.avgLatencyMs.toFixed(2)} ms`} />
        <MetricCard label="P95 latency" value={`${provider.metrics.p95LatencyMs.toFixed(2)} ms`} />
        <MetricCard label="Avg quality" value={provider.metrics.avgQuality.toFixed(3)} />
        <MetricCard label="Expected hit" value={formatRate(provider.metrics.containsExpectedAnswerRate)} />
        <MetricCard label="Total cost" value={`$${provider.metrics.totalCostUsd.toFixed(6)}`} />
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <ScoreBar
          score={provider.metrics.avgQuality}
          maxScore={1}
          color={provider.metrics.avgQuality > 0.7 ? "#1D9E75" : "#378ADD"}
        />
        <ExplainBox>
          Avg quality combines faithfulness and relevance. A higher score means the provider answered with text that stayed close to the retrieved evidence.
        </ExplainBox>
      </div>

      {provider.skippedReason && (
        <ExplainBox variant="warning">{provider.skippedReason}</ExplainBox>
      )}

      {firstQuery?.error && (
        <section className="output-section">
          <div className="section-title">
            <h3>Provider Error</h3>
          </div>
          <pre className="provider-error">{firstQuery.error}</pre>
          <ExplainBox variant="warning">
            This is provider-specific output. For OpenAI, `insufficient_quota` means the key was loaded and the API was reached, but billing or quota blocked generation.
          </ExplainBox>
        </section>
      )}

      <section className="output-section">
        <div className="section-title">
          <h3>Queries</h3>
          <span className="count">{provider.perQuery.length}</span>
        </div>
        <div className="result-list">
          {provider.perQuery.map((query) => (
            <article key={query.id} className="result-row">
              <div className="result-row__meta">
                <Pill variant="gray">{query.id}</Pill>
                <Pill variant={query.status === "completed" ? "green" : "amber"}>
                  {query.status}
                </Pill>
                <Pill variant={query.latencyMs > 500 ? "amber" : "blue"}>
                  {query.latencyMs.toFixed(2)} ms
                </Pill>
                <Pill variant={query.costUsd > 0 ? "amber" : "green"}>
                  ${query.costUsd.toFixed(6)}
                </Pill>
              </div>
              <p className="chunk-text">{query.question}</p>
              <p className="chunk-text">{query.answer ?? query.error ?? "No output."}</p>
              {query.evals && (
                <div style={{ display: "grid", gap: 8 }}>
                  <ScoreBar score={query.evals.quality} maxScore={1} color="#1D9E75" />
                  <ExplainBox>
                    This per-query score explains how well the model answer matched the expected grounded answer for this benchmark row.
                  </ExplainBox>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function EmbeddingMapView({ map }: { map: EmbeddingMapResponse }) {
  const palette = ["#007c72", "#b45f06", "#3b6ea8", "#8f4e8b", "#5f7f2a", "#a33f3f"];
  const colorFor = (label: string) => {
    const index = map.clusters.findIndex((cluster) => cluster.label === label);
    return palette[Math.max(0, index) % palette.length];
  };

  return (
    <>
      <div className="embedding-layout">
        <div className="embedding-map" role="img" aria-label="Embedding projection">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect className="embedding-map__plot" x="0" y="0" width="100" height="100" />
            {map.clusters.map((cluster) => (
              <text
                key={cluster.label}
                className="embedding-map__label"
                x={cluster.centroid.x}
                y={100 - cluster.centroid.y}
              >
                {cluster.label}
              </text>
            ))}
            {map.points.map((point) => (
              <circle
                key={point.chunkId}
                cx={point.x}
                cy={100 - point.y}
                r="2.2"
                fill={colorFor(point.clusterLabel)}
              >
                <title>{`${point.chunkId}: ${point.textPreview}`}</title>
              </circle>
            ))}
          </svg>
        </div>

        <section className="embedding-card" aria-label="Embedding clusters">
          <div className="section-title">
            <h3>Clusters</h3>
            <span className="count">{map.clusters.length}</span>
          </div>
          <div className="cluster-list">
            {map.clusters.map((cluster) => (
              <span key={cluster.label} className="cluster-chip">
                <span
                  className="cluster-chip__swatch"
                  style={{ backgroundColor: colorFor(cluster.label) }}
                />
                {cluster.label} · {cluster.count}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="output-section embedding-chunks-section">
        <div className="section-title">
          <h3>Chunks</h3>
          <span className="count">{map.points.length}</span>
        </div>
        <div className="result-list embedding-chunks-list">
          {map.points.map((point) => (
            <article key={point.chunkId} className="result-row">
              <div className="result-row__meta">
                <span>{point.chunkId}</span>
                <span>{point.clusterLabel}</span>
                <span>
                  x {point.x.toFixed(2)} · y {point.y.toFixed(2)}
                </span>
              </div>
              <p className="chunk-text">{point.textPreview}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </article>
  );
}

function formatRate(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

function CompareColumn({
  provider,
  output,
}: {
  provider: EmbeddingProviderId;
  output?: RagAskResponse;
}) {
  const results = output?.devMode?.results ?? [];

  return (
    <article className="compare-column">
      <header className="compare-column__header">
        <h3>{provider}</h3>
        <span className="tag">
          {output ? `${output.index.chunkCount ?? 0} chunks` : "No result"}
        </span>
      </header>
      <p className="chunk-text">{output?.answer?.text ?? "No result yet."}</p>
      <div className="result-list">
        <ChunksList results={results} />
      </div>
    </article>
  );
}
