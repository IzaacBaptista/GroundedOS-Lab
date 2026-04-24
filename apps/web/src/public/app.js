const elements = {
  answerTabButton: document.getElementById("answerTabButton"),
  answerText: document.getElementById("answerText"),
  apiHealth: document.getElementById("apiHealth"),
  chunkCount: document.getElementById("chunkCount"),
  chunksList: document.getElementById("chunksList"),
  citationCount: document.getElementById("citationCount"),
  citationsList: document.getElementById("citationsList"),
  clearButton: document.getElementById("clearButton"),
  compareMessage: document.getElementById("compareMessage"),
  compareProviderAAnswer: document.getElementById("compareProviderAAnswer"),
  compareProviderAChunks: document.getElementById("compareProviderAChunks"),
  compareProviderAMeta: document.getElementById("compareProviderAMeta"),
  compareProviderASelect: document.getElementById("compareProviderASelect"),
  compareProviderATitle: document.getElementById("compareProviderATitle"),
  compareProviderBAnswer: document.getElementById("compareProviderBAnswer"),
  compareProviderBChunks: document.getElementById("compareProviderBChunks"),
  compareProviderBMeta: document.getElementById("compareProviderBMeta"),
  compareProviderBSelect: document.getElementById("compareProviderBSelect"),
  compareProviderBTitle: document.getElementById("compareProviderBTitle"),
  compareTabButton: document.getElementById("compareTabButton"),
  compareView: document.getElementById("compareView"),
  copyDevModeButton: document.getElementById("copyDevModeButton"),
  devModeJson: document.getElementById("devModeJson"),
  devModeRawToggle: document.getElementById("devModeRawToggle"),
  devModeTree: document.getElementById("devModeTree"),
  emptyState: document.getElementById("emptyState"),
  embeddingProviderSelect: document.getElementById("embeddingProviderSelect"),
  fileInput: document.getElementById("fileInput"),
  fileTitle: document.getElementById("fileTitle"),
  fileType: document.getElementById("fileType"),
  form: document.getElementById("ragForm"),
  formMessage: document.getElementById("formMessage"),
  indexButton: document.getElementById("indexButton"),
  indexSelect: document.getElementById("indexSelect"),
  indexStatus: document.getElementById("indexStatus"),
  deleteIndexButton: document.getElementById("deleteIndexButton"),
  modeInputs: Array.from(document.querySelectorAll("input[name='sourceMode']")),
  modePanels: Array.from(document.querySelectorAll("[data-mode-panel]")),
  queryInput: document.getElementById("queryInput"),
  refreshIndexesButton: document.getElementById("refreshIndexesButton"),
  resultMeta: document.getElementById("resultMeta"),
  resultHint: document.getElementById("resultHint"),
  resultView: document.getElementById("resultView"),
  submitButton: document.getElementById("submitButton"),
  textContent: document.getElementById("textContent"),
  textTitle: document.getElementById("textTitle"),
  topKInput: document.getElementById("topKInput"),
};

const AppState = {
  IDLE: "idle",
  INDEXING: "indexing",
  INDEXED: "indexed",
  ASKING: "asking",
  ANSWERED: "answered",
  ERROR: "error",
};

let activeIndex = undefined;
let persistedIndexes = [];
let currentState = AppState.IDLE;
let outputTab = "answer";
let healthPollingId = null;

elements.form.addEventListener("submit", handleSubmit);
elements.answerTabButton.addEventListener("click", () => setOutputTab("answer"));
elements.compareTabButton.addEventListener("click", () => setOutputTab("compare"));
elements.clearButton.addEventListener("click", clearForm);
elements.copyDevModeButton.addEventListener("click", copyDevModeJson);
elements.devModeRawToggle.addEventListener("click", toggleDevModeRaw);
elements.indexButton.addEventListener("click", handleIndex);
elements.indexSelect.addEventListener("change", handleIndexSelection);
elements.refreshIndexesButton.addEventListener("click", loadIndexes);
elements.deleteIndexButton.addEventListener("click", handleDeleteIndex);
elements.fileInput.addEventListener("change", () => {
  syncFileFields();
  clearActiveIndex();
});
elements.fileType.addEventListener("change", clearActiveIndex);
elements.fileTitle.addEventListener("input", clearActiveIndex);
elements.embeddingProviderSelect.addEventListener("change", clearActiveIndex);
elements.textContent.addEventListener("input", clearActiveIndex);
elements.textTitle.addEventListener("input", clearActiveIndex);

for (const input of elements.modeInputs) {
  input.addEventListener("change", () => {
    syncMode();
    clearActiveIndex();
  });
}

syncMode();
renderIndexStatus();
setOutputTab("answer");
setAppState(AppState.IDLE);
checkApiHealth();
loadIndexes();
startHealthPolling();

async function checkApiHealth() {
  setHealth("checking", "API checking");

  try {
    const response = await fetch("/api/health");

    if (!response.ok) {
      throw new Error("Health check failed.");
    }

    setHealth("online", "API online");
  } catch {
    setHealth("offline", "API offline");
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  setMessage("");
  setCompareMessage("");

  if (!elements.queryInput || !elements.topKInput) {
    setMessage("Form is not ready. Please refresh the page.", true);
    setAppState(AppState.ERROR, "Form is not ready.");
    return;
  }

  const mode = getSourceMode();
  const query = elements.queryInput.value.trim();
  const topK = Number(elements.topKInput.value);

  if (!query) {
    setMessage("Question is required.", true);
    elements.queryInput.focus();
    setAppState(AppState.ERROR, "Question is required.");
    return;
  }

  if (!Number.isInteger(topK) || topK <= 0) {
    setMessage("Top K must be a positive integer.", true);
    elements.topKInput.focus();
    setAppState(AppState.ERROR, "Top K must be a positive integer.");
    return;
  }

  setAppState(AppState.ASKING);
  elements.submitButton.disabled = true;
  elements.indexButton.disabled = true;
  elements.submitButton.textContent = "Asking";

  try {
    if (outputTab === "compare") {
      if (activeIndex) {
        throw new Error("Compare mode requires file/text source, not a persisted index selection.");
      }

      const providerA = elements.compareProviderASelect.value;
      const providerB = elements.compareProviderBSelect.value;
      const compareOutputs = await runCompare(mode, query, topK, providerA, providerB);
      renderCompare(compareOutputs, providerA, providerB);
      setCompareMessage("Compare completed.");
    } else {
      const output = activeIndex
        ? await askWithPersistedIndex(query, topK)
        : mode === "file"
          ? await askWithFile(query, topK)
          : await askWithText(query, topK);

      renderResult(output);
      setMessage(activeIndex ? "Answered from persisted index." : "Done.");
    }

    setAppState(AppState.ANSWERED);
    await checkApiHealth();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed.", true);
    setCompareMessage(error instanceof Error ? error.message : "Compare failed.", true);
    setAppState(AppState.ERROR, "Ask failed.");
    await checkApiHealth();
  } finally {
    elements.submitButton.disabled = false;
    elements.indexButton.disabled = false;
    elements.submitButton.textContent = "Ask";
  }
}

async function handleIndex() {
  setMessage("");
  setCompareMessage("");

  const mode = getSourceMode();
  setAppState(AppState.INDEXING);
  elements.indexButton.disabled = true;
  elements.submitButton.disabled = true;
  elements.indexButton.textContent = "Indexing";

  try {
    const output = mode === "file"
      ? await indexFile()
      : await indexText();

    activeIndex = {
      documentId: output.document.documentId,
      title: output.document.title,
      chunkCount: output.index.chunkCount,
      embeddingProvider: output.index.embeddingProvider,
      embeddingModel: output.index.embeddingModel,
      indexPath: output.storage.indexPath,
    };
    renderIndexStatus();
    await loadIndexes(output.document.documentId);
    setMessage(`Indexed ${output.index.chunkCount} chunks.`);
    setAppState(AppState.INDEXED, `Indexed ${output.index.chunkCount} chunks.`);
    await checkApiHealth();
  } catch (error) {
    clearActiveIndex();
    setMessage(error instanceof Error ? error.message : "Indexing failed.", true);
    setAppState(AppState.ERROR, "Indexing failed.");
    await checkApiHealth();
  } finally {
    elements.indexButton.disabled = false;
    elements.submitButton.disabled = false;
    elements.indexButton.textContent = "Index";
  }
}

async function loadIndexes(selectedDocumentId) {
  try {
    const response = await fetch("/api/rag/indexes");
    const body = await response.json().catch(() => undefined);

    if (!response.ok) {
      const message = body && body.error && body.error.message
        ? body.error.message
        : `Index list failed with status ${response.status}.`;
      throw new Error(message);
    }

    persistedIndexes = Array.isArray(body.indexes) ? body.indexes : [];
    renderIndexSelect(selectedDocumentId);
    await checkApiHealth();
  } catch (error) {
    persistedIndexes = [];
    renderIndexSelect();
    setMessage(error instanceof Error ? error.message : "Failed to load indexes.", true);
    await checkApiHealth();
  }
}

function handleIndexSelection() {
  const documentId = elements.indexSelect.value;

  if (!documentId) {
    clearActiveIndex();
    return;
  }

  const selected = persistedIndexes.find((item) => item.document.documentId === documentId);

  if (!selected) {
    clearActiveIndex();
    return;
  }

  setActiveIndexFromListItem(selected);
  setMessage(`Selected ${selected.document.title}.`);
}

async function handleDeleteIndex() {
  if (!activeIndex) {
    return;
  }

  const documentId = activeIndex.documentId;

  elements.deleteIndexButton.disabled = true;
  elements.indexButton.disabled = true;
  elements.submitButton.disabled = true;
  setMessage("");

  try {
    await deleteIndex(documentId);
    clearActiveIndex();
    await loadIndexes();
    setMessage(`Deleted index ${documentId}.`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Delete failed.", true);
    await checkApiHealth();
  } finally {
    elements.indexButton.disabled = false;
    elements.submitButton.disabled = false;
    renderIndexStatus();
  }
}

async function deleteIndex(documentId) {
  const response = await fetch(`/api/rag/indexes/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = body && body.error && body.error.message
      ? body.error.message
      : `Delete failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body;
}

async function askWithFile(query, topK) {
  return askWithFileProvider(query, topK, getEmbeddingProvider());
}

async function askWithFileProvider(query, topK, embeddingProvider) {
  const file = elements.fileInput.files && elements.fileInput.files[0];

  if (!file) {
    throw new Error("File is required.");
  }

  if (file.size === 0) {
    throw new Error("Document is empty.");
  }

  const form = new FormData();
  const title = elements.fileTitle.value.trim();

  form.append("file", file);
  form.append("type", elements.fileType.value);
  form.append("query", query);
  form.append("topK", String(topK));
  form.append("embeddingProvider", embeddingProvider);

  if (title) {
    form.append("title", title);
  }

  return await postRagRequest("/api/rag/ask", {
    body: form,
  });
}

async function askWithText(query, topK) {
  return askWithTextProvider(query, topK, getEmbeddingProvider());
}

async function askWithTextProvider(query, topK, embeddingProvider) {
  const content = elements.textContent.value.trim();
  const title = elements.textTitle.value.trim();

  if (!content) {
    throw new Error("Document is empty.");
  }

  return await postRagRequest("/api/rag/ask", {
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "text",
      content,
      query,
      topK,
      embeddingProvider,
      title: title || undefined,
    }),
  });
}

async function askWithPersistedIndex(query, topK) {
  return await postRagRequest("/api/rag/ask", {
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      documentId: activeIndex.documentId,
      query,
      topK,
    }),
  });
}

async function indexFile() {
  const file = elements.fileInput.files && elements.fileInput.files[0];

  if (!file) {
    throw new Error("File is required.");
  }

  const form = new FormData();
  const title = elements.fileTitle.value.trim();

  form.append("file", file);
  form.append("type", elements.fileType.value);
  form.append("embeddingProvider", getEmbeddingProvider());

  if (title) {
    form.append("title", title);
  }

  return await postRagRequest("/api/rag/index", {
    body: form,
  });
}

async function indexText() {
  const content = elements.textContent.value.trim();
  const title = elements.textTitle.value.trim();

  if (!content) {
    throw new Error("Text is required.");
  }

  return await postRagRequest("/api/rag/index", {
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "text",
      content,
      embeddingProvider: getEmbeddingProvider(),
      title: title || undefined,
    }),
  });
}

async function postRagRequest(path, init) {
  const response = await fetch(path, {
    method: "POST",
    ...init,
  });
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = body && body.error && body.error.message
      ? body.error.message
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body;
}

function renderResult(output) {
  const citations = output.answer && Array.isArray(output.answer.citations)
    ? output.answer.citations
    : [];
  const results = output.devMode && Array.isArray(output.devMode.results)
    ? output.devMode.results
    : [];
  const index = output.index || {};

  elements.emptyState.hidden = true;
  elements.compareView.hidden = true;
  elements.resultView.hidden = false;
  elements.answerText.textContent =
    output.answer && output.answer.text ? output.answer.text : "No answer returned.";
  elements.resultMeta.textContent = `${index.chunkCount ?? 0} chunks | ${
    index.embeddingProvider ?? "unknown provider"
  }${index.embeddingModel && index.embeddingModel.model ? ` | ${index.embeddingModel.model}` : ""}`;
  elements.citationCount.textContent = String(citations.length);
  elements.chunkCount.textContent = String(results.length);
  
  // Render JSON tree and store raw JSON
  elements.devModeJson.textContent = JSON.stringify(output, null, 2);
  elements.devModeTree.replaceChildren(renderJsonTree(output));
  elements.devModeRawToggle.textContent = "Raw JSON";

  renderResultHint(output, results);

  renderList(elements.citationsList, citations, renderCitation);
  renderChunkList(elements.chunksList, results);
}

function renderCitation(citation) {
  const row = createElement("article", "result-row");
  const source = citation.source || {};

  const metaContainer = createElement("div", "result-row__pills");

  // ChunkId pill
  const chunkIdPill = createElement("span", "pill pill--id");
  chunkIdPill.textContent = truncateChunkId(citation.chunkId, 24);
  chunkIdPill.title = citation.chunkId;
  metaContainer.appendChild(chunkIdPill);

  // Score badge
  const scoreBadge = createElement("span", "pill pill--score");
  const scoreValue = formatScore(citation.score);
  scoreBadge.textContent = `↑ ${scoreValue}`;
  scoreBadge.className = `pill pill--score ${getScoreBadgeClass(citation.score)}`;
  metaContainer.appendChild(scoreBadge);

  // Source pill
  const sourcePill = createElement("span", "pill pill--source");
  sourcePill.textContent = source.originalFilename || source.sourceType || "source";
  metaContainer.appendChild(sourcePill);

  // Offsets pill
  const offsetsPill = createElement("span", "pill pill--offsets");
  offsetsPill.textContent = formatOffsets(citation.offsets);
  metaContainer.appendChild(offsetsPill);

  row.appendChild(metaContainer);
  return row;
}

function getScoreBadgeClass(score) {
  if (score >= 0.5) return "pill--score-high";
  if (score >= 0.2) return "pill--score-medium";
  return "pill--score-low";
}

function renderChunk(chunk) {
  return renderChunkWithMax(chunk, 0);
}

function renderChunkWithMax(chunk, maxScore) {
  const row = createElement("article", "result-row");
  const meta = createMetaRow([
    `rank ${chunk.rank}`,
    truncateChunkId(chunk.chunkId, 24),
    `section ${chunk.sectionId}`,
    `${(chunk.text || "").length} chars`,
  ]);
  
  const scoreContainer = createElement("div", "chunk-score-container");
  const scoreBar = createElement("div", "score-bar");
  const scoreFill = document.createElement("span");
  scoreFill.style.setProperty("--score-width", `${scoreToPercent(chunk.score)}%`);
  scoreBar.appendChild(scoreFill);

  const scoreLabel = createElement("div", "score-label");
  const normalizedPercent = toNormalizedPercent(chunk.score, maxScore);
  scoreLabel.textContent = `Relevance: ${formatScore(chunk.score)} (${normalizedPercent}% max)`;
  
  scoreContainer.appendChild(scoreBar);
  scoreContainer.appendChild(scoreLabel);

  const text = createElement("p", "chunk-text");
  text.textContent = chunk.text || "";

  const offsetsInfo = createElement("div", "chunk-offsets");
  const offsetDetails = document.createElement("details");
  offsetDetails.className = "chunk-offsets-details";
  const offsetSummary = document.createElement("summary");
  offsetSummary.textContent = "Chunk metadata";
  offsetDetails.appendChild(offsetSummary);

  const offsetList = document.createElement("div");
  offsetList.className = "chunk-offsets-list";
  offsetList.appendChild(createKeyValueLine("Offsets", formatOffsets(chunk.offsets) || "n/a"));
  offsetList.appendChild(createKeyValueLine("Document", chunk.documentId || "n/a"));
  offsetList.appendChild(createKeyValueLine("Chunk", chunk.chunkId || "n/a"));
  offsetDetails.appendChild(offsetList);
  offsetsInfo.appendChild(offsetDetails);

  row.append(meta, scoreContainer, text, offsetsInfo);
  return row;
}

function renderList(container, items, renderItem) {
  container.replaceChildren();

  if (!items.length) {
    const empty = createElement("p", "chunk-text");
    empty.textContent = "None.";
    container.append(empty);
    return;
  }

  for (const item of items) {
    container.append(renderItem(item));
  }
}

function createMetaRow(values) {
  const row = createElement("div", "result-row__meta");

  for (const value of values.filter(Boolean)) {
    const item = document.createElement("span");
    item.textContent = String(value);
    row.append(item);
  }

  return row;
}

function createElement(tagName, className) {
  const element = document.createElement(tagName);
  element.className = className;

  return element;
}

function createKeyValueLine(key, value) {
  const line = document.createElement("p");
  line.className = "chunk-meta-line";
  line.textContent = `${key}: ${value}`;
  return line;
}

function syncMode() {
  const mode = getSourceMode();

  for (const panel of elements.modePanels) {
    panel.hidden = panel.dataset.modePanel !== mode;
  }
}

function syncFileFields() {
  const file = elements.fileInput.files && elements.fileInput.files[0];

  if (!file) {
    return;
  }

  elements.fileType.value = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text";

  if (!elements.fileTitle.value.trim()) {
    elements.fileTitle.value = file.name;
  }
}

function getSourceMode() {
  const selected = elements.modeInputs.find((input) => input.checked);

  return selected ? selected.value : "file";
}

function getEmbeddingProvider() {
  return elements.embeddingProviderSelect.value || "api-lexical";
}

function clearForm() {
  elements.form.reset();
  elements.fileTitle.value = "";
  elements.textTitle.value = "";
  elements.emptyState.hidden = false;
  elements.resultView.hidden = true;
  elements.resultMeta.textContent = "No result";
  elements.resultHint.hidden = true;
  elements.compareView.hidden = true;
  clearActiveIndex();
  setMessage("");
  setCompareMessage("");
  setAppState(AppState.IDLE);
  setOutputTab("answer");
  syncMode();
}

function clearActiveIndex() {
  activeIndex = undefined;
  if (elements.indexSelect.value) {
    elements.indexSelect.value = "";
  }
  renderIndexStatus();
}

function renderIndexStatus() {
  if (!activeIndex) {
    if (currentState === AppState.IDLE) {
      elements.indexStatus.textContent = "Idle — no indexed document.";
    }
    elements.indexStatus.className = "index-status index-status--idle";
    elements.deleteIndexButton.disabled = true;
    return;
  }

  elements.indexStatus.textContent =
    `Indexed: ${activeIndex.title} | ${activeIndex.chunkCount} chunks | ${
      activeIndex.embeddingProvider || "unknown provider"
    } | ${activeIndex.documentId}`;
  elements.indexStatus.className = "index-status index-status--indexed";
  elements.deleteIndexButton.disabled = false;
}

function renderIndexSelect(selectedDocumentId) {
  elements.indexSelect.replaceChildren();
  const nextSelectedDocumentId = selectedDocumentId || activeIndex?.documentId;

  if (!persistedIndexes.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No indexed documents";
    elements.indexSelect.append(option);
    elements.indexSelect.disabled = true;
    elements.deleteIndexButton.disabled = true;
    clearActiveIndex();
    return;
  }

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Select an index";
  elements.indexSelect.append(emptyOption);

  for (const item of persistedIndexes) {
    const option = document.createElement("option");
    option.value = item.document.documentId;
    option.textContent =
      `${item.document.title} | ${item.index.chunkCount} chunks | ${item.index.embeddingProvider}`;
    elements.indexSelect.append(option);
  }

  elements.indexSelect.disabled = false;

  if (nextSelectedDocumentId) {
    elements.indexSelect.value = nextSelectedDocumentId;
    const selected = persistedIndexes.find(
      (item) => item.document.documentId === nextSelectedDocumentId
    );

    if (selected) {
      setActiveIndexFromListItem(selected);
    } else if (activeIndex) {
      clearActiveIndex();
    }
  }
}

function setActiveIndexFromListItem(item) {
  activeIndex = {
    documentId: item.document.documentId,
    title: item.document.title,
    chunkCount: item.index.chunkCount,
    embeddingProvider: item.index.embeddingProvider,
    embeddingModel: item.index.embeddingModel,
    indexPath: item.storage.indexPath,
  };
  elements.indexSelect.value = item.document.documentId;
  renderIndexStatus();
}

function setHealth(status, label) {
  elements.apiHealth.textContent = label;
  elements.apiHealth.className = `health health--${status}`;
}

function startHealthPolling() {
  if (healthPollingId) {
    clearInterval(healthPollingId);
  }

  healthPollingId = setInterval(() => {
    checkApiHealth();
  }, 10000);
}

function setAppState(state, detailMessage = "") {
  currentState = state;

  const stateConfig = {
    [AppState.IDLE]: {
      text: detailMessage || "Idle — no indexed document.",
      className: "index-status index-status--idle",
    },
    [AppState.INDEXING]: {
      text: detailMessage || "Indexing document…",
      className: "index-status index-status--indexing",
    },
    [AppState.INDEXED]: {
      text: detailMessage || "Indexed and ready to ask.",
      className: "index-status index-status--indexed",
    },
    [AppState.ASKING]: {
      text: detailMessage || "Asking question…",
      className: "index-status index-status--asking",
    },
    [AppState.ANSWERED]: {
      text: detailMessage || "Answered. Review citations and chunks.",
      className: "index-status index-status--answered",
    },
    [AppState.ERROR]: {
      text: detailMessage || "Action failed.",
      className: "index-status index-status--error",
    },
  };

  const config = stateConfig[state] ?? stateConfig[AppState.IDLE];
  elements.indexStatus.textContent = config.text;
  elements.indexStatus.className = config.className;
}

function setMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("is-error", isError);
}

function setCompareMessage(message, isError = false) {
  if (!elements.compareMessage) {
    return;
  }

  elements.compareMessage.textContent = message;
  elements.compareMessage.classList.toggle("is-error", isError);
}

function formatScore(score) {
  return typeof score === "number" ? score.toFixed(4) : "0.0000";
}

function scoreToPercent(score) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function toNormalizedPercent(score, maxScore) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }

  if (!(maxScore > 0)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function formatOffsets(offsets) {
  if (!offsets) {
    return undefined;
  }

  return `${offsets.offsetBasis}:${offsets.startOffset}-${offsets.endOffset}`;
}

function copyDevModeJson() {
  if (!elements.devModeJson.textContent) {
    return;
  }

  navigator.clipboard.writeText(elements.devModeJson.textContent).then(() => {
    const originalText = elements.copyDevModeButton.textContent;
    elements.copyDevModeButton.textContent = "Copied!";
    setTimeout(() => {
      elements.copyDevModeButton.textContent = originalText;
    }, 2000);
  }).catch(() => {
    alert("Failed to copy JSON.");
  });
}

function toggleDevModeRaw() {
  const isHidden = elements.devModeJson.hidden;
  elements.devModeJson.hidden = !isHidden;
  elements.devModeTree.hidden = isHidden;
  elements.devModeRawToggle.textContent = isHidden ? "Raw JSON" : "Tree View";
}

function renderJsonTree(obj, depth = 0) {
  const container = document.createElement("div");
  container.className = `json-tree-level json-tree-level--${depth}`;

  if (obj === null || obj === undefined) {
    return createJsonTreeValue("null");
  }

  if (typeof obj !== "object") {
    return createJsonTreeValue(JSON.stringify(obj), typeof obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return createJsonTreeValue("[]");
    }

    const node = document.createElement("details");
    node.className = "json-tree-node";
    node.open = depth < 2;

    const summary = document.createElement("summary");
    summary.textContent = `[${obj.length} items]`;
    node.appendChild(summary);

    const itemsContainer = document.createElement("div");
    itemsContainer.className = "json-tree-items";

    for (let i = 0; i < obj.length; i++) {
      const item = document.createElement("div");
      item.className = "json-tree-item";

      const label = document.createElement("span");
      label.className = "json-tree-key";
      label.textContent = `[${i}]`;

      const value = document.createElement("div");
      const child = renderJsonTree(obj[i], depth + 1);
      value.appendChild(child);

      item.appendChild(label);
      item.appendChild(value);
      itemsContainer.appendChild(item);
    }

    node.appendChild(itemsContainer);
    return node;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return createJsonTreeValue("{}");
  }

  const node = document.createElement("details");
  node.className = "json-tree-node";
  node.open = depth < 2;

  const summary = document.createElement("summary");
  summary.textContent = `{${keys.length} keys}`;
  node.appendChild(summary);

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "json-tree-items";

  for (const key of keys) {
    const item = document.createElement("div");
    item.className = "json-tree-item";

    const label = document.createElement("span");
    label.className = "json-tree-key";
    label.textContent = `"${key}"`;

    const value = document.createElement("div");
    const child = renderJsonTree(obj[key], depth + 1);
    value.appendChild(child);

    item.appendChild(label);
    item.appendChild(value);
    itemsContainer.appendChild(item);
  }

  node.appendChild(itemsContainer);
  return node;
}

function createJsonTreeValue(text, type = "null") {
  const span = document.createElement("span");
  span.className = `json-tree-value json-tree-value--${type}`;
  span.textContent = text;
  return span;
}

function truncateChunkId(chunkId, maxLength = 20) {
  if (!chunkId || chunkId.length <= maxLength) {
    return chunkId;
  }

  const prefix = "…";
  const truncated = prefix + chunkId.slice(-(maxLength - prefix.length));
  return truncated;
}

function setOutputTab(nextTab) {
  outputTab = nextTab;

  const isAnswerTab = nextTab === "answer";
  elements.answerTabButton.classList.toggle("result-tab--active", isAnswerTab);
  elements.answerTabButton.setAttribute("aria-selected", String(isAnswerTab));

  elements.compareTabButton.classList.toggle("result-tab--active", !isAnswerTab);
  elements.compareTabButton.setAttribute("aria-selected", String(!isAnswerTab));

  if (isAnswerTab) {
    elements.compareView.hidden = true;

    if (!elements.resultView.hidden) {
      return;
    }

    elements.emptyState.hidden = false;
  } else {
    elements.emptyState.hidden = true;
    elements.resultView.hidden = true;
    elements.compareView.hidden = false;
  }
}

async function runCompare(mode, query, topK, providerA, providerB) {
  const askOne = async (provider) => {
    if (mode === "file") {
      return await askWithFileProvider(query, topK, provider);
    }

    return await askWithTextProvider(query, topK, provider);
  };

  const [outputA, outputB] = await Promise.all([
    askOne(providerA),
    askOne(providerB),
  ]);

  return { outputA, outputB };
}

function renderCompare(compareOutputs, providerA, providerB) {
  const { outputA, outputB } = compareOutputs;

  elements.emptyState.hidden = true;
  elements.resultView.hidden = true;
  elements.compareView.hidden = false;
  elements.resultMeta.textContent = "Compare mode";

  renderCompareColumn(
    outputA,
    providerA,
    elements.compareProviderATitle,
    elements.compareProviderAMeta,
    elements.compareProviderAAnswer,
    elements.compareProviderAChunks
  );

  renderCompareColumn(
    outputB,
    providerB,
    elements.compareProviderBTitle,
    elements.compareProviderBMeta,
    elements.compareProviderBAnswer,
    elements.compareProviderBChunks
  );
}

function renderCompareColumn(output, provider, titleEl, metaEl, answerEl, chunksEl) {
  const results = output.devMode && Array.isArray(output.devMode.results)
    ? output.devMode.results
    : [];

  titleEl.textContent = provider;
  metaEl.textContent = `${output.index?.chunkCount ?? 0} chunks`;
  answerEl.textContent = output.answer?.text || "No answer returned.";
  renderChunkList(chunksEl, results);
}

function renderChunkList(container, results) {
  container.replaceChildren();

  if (!Array.isArray(results) || results.length === 0) {
    const empty = createElement("p", "chunk-text");
    empty.textContent = "None.";
    container.append(empty);
    return;
  }

  const maxScore = Math.max(...results.map((item) => item.score || 0), 0);

  for (const chunk of results) {
    container.append(renderChunkWithMax(chunk, maxScore));
  }
}

function renderResultHint(output, results) {
  elements.resultHint.hidden = true;
  elements.resultHint.textContent = "";

  if (!output.answer?.grounded || !results.length) {
    elements.resultHint.hidden = false;
    elements.resultHint.textContent = "No relevant chunks found. Try rephrasing your query.";
    return;
  }

  const allZeroScores = results.every((item) => !(item.score > 0));

  if (allZeroScores) {
    elements.resultHint.hidden = false;
    elements.resultHint.textContent = "No relevant chunks found. Try rephrasing your query.";
  }
}
