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
  indexFile,
  indexText,
} from "./api/client";
import type {
  ActiveIndex,
  EmbeddingProviderId,
  FileType,
  PersistedRagIndexListItem,
  RagAskResponse,
  SourceMode,
} from "./api/types";
import { useApiHealth } from "./hooks/useApiHealth";
import { useIndexList } from "./hooks/useIndexList";
import {
  ChunksList,
  CitationsList,
  DevModeBlock,
} from "./components/ResultParts";

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

type ResultMode = "answer" | "compare";

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

  // Output state
  const [outputTab, setOutputTab] = useState<ResultMode>("answer");
  const [result, setResult] = useState<RagAskResponse | undefined>(undefined);
  const [compare, setCompare] = useState<CompareState>({
    providerA: "api-lexical",
    providerB: "local-hash",
  });

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
    setResult(undefined);
    setCompare((state) => ({
      ...state,
      outputA: undefined,
      outputB: undefined,
    }));
    clearActiveIndex();
    reportMessage("");
    reportCompareMessage(
      "Run Ask while Compare tab is active to compare providers side by side."
    );
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
          <p className="eyebrow">Phase 1</p>
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
          result={result}
          compare={compare}
          setCompare={setCompare}
          compareMessage={compareMessage}
          compareMessageIsError={compareMessageIsError}
        />
      </section>
    </main>
  );
}

interface ResultPanelProps {
  outputTab: ResultMode;
  setOutputTab: (tab: ResultMode) => void;
  result: RagAskResponse | undefined;
  compare: CompareState;
  setCompare: React.Dispatch<React.SetStateAction<CompareState>>;
  compareMessage: string;
  compareMessageIsError: boolean;
}

function ResultPanel({
  outputTab,
  setOutputTab,
  result,
  compare,
  setCompare,
  compareMessage,
  compareMessageIsError,
}: ResultPanelProps) {
  const citations = result?.answer?.citations ?? [];
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
      : "No result";

  const showHint =
    outputTab === "answer" &&
    hasResult &&
    (!result?.answer?.grounded ||
      results.length === 0 ||
      results.every((item) => !(item.score > 0)));

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
      </div>

      {outputTab === "answer" && !hasResult && (
        <div className="empty-state">
          <div className="empty-state__mark" aria-hidden="true" />
          <p className="empty-state__message">
            Index a document on the left, then ask a question to see the
            grounded answer and Dev Mode output here.
          </p>
        </div>
      )}

      {outputTab === "answer" && hasResult && result && (
        <div className="result-view">
          <section className="answer-block">
            <p>{result.answer?.text ?? "No answer returned."}</p>
          </section>

          {showHint && (
            <p className="result-hint">
              No relevant chunks found. Try rephrasing your query.
            </p>
          )}

          <section className="output-section">
            <div className="section-title">
              <h3>Citations</h3>
              <span className="count">{citations.length}</span>
            </div>
            <div className="result-list">
              <CitationsList citations={citations} />
            </div>
          </section>

          <section className="output-section">
            <div className="section-title">
              <h3>Retrieved Chunks</h3>
              <span className="count">{results.length}</span>
            </div>
            <div className="result-list">
              <ChunksList results={results} />
            </div>
          </section>

          <DevModeBlock payload={result} />
        </div>
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
    </section>
  );
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
