const elements = {
  answerText: document.getElementById("answerText"),
  apiHealth: document.getElementById("apiHealth"),
  chunkCount: document.getElementById("chunkCount"),
  chunksList: document.getElementById("chunksList"),
  citationCount: document.getElementById("citationCount"),
  citationsList: document.getElementById("citationsList"),
  clearButton: document.getElementById("clearButton"),
  devModeJson: document.getElementById("devModeJson"),
  emptyState: document.getElementById("emptyState"),
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
  resultView: document.getElementById("resultView"),
  submitButton: document.getElementById("submitButton"),
  textContent: document.getElementById("textContent"),
  textTitle: document.getElementById("textTitle"),
  topKInput: document.getElementById("topKInput"),
};

let activeIndex = undefined;
let persistedIndexes = [];

elements.form.addEventListener("submit", handleSubmit);
elements.clearButton.addEventListener("click", clearForm);
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
checkApiHealth();
loadIndexes();

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

  const mode = getSourceMode();
  const query = elements.queryInput.value.trim();
  const topK = Number(elements.topKInput.value);

  if (!query) {
    setMessage("Question is required.", true);
    elements.queryInput.focus();
    return;
  }

  if (!Number.isInteger(topK) || topK <= 0) {
    setMessage("Top K must be a positive integer.", true);
    elements.topKInput.focus();
    return;
  }

  elements.submitButton.disabled = true;
  elements.indexButton.disabled = true;
  elements.submitButton.textContent = "Asking";

  try {
    const output = activeIndex
      ? await askWithPersistedIndex(query, topK)
      : mode === "file"
        ? await askWithFile(query, topK)
        : await askWithText(query, topK);

    renderResult(output);
    setMessage(activeIndex ? "Answered from persisted index." : "Done.");
    await checkApiHealth();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed.", true);
    await checkApiHealth();
  } finally {
    elements.submitButton.disabled = false;
    elements.indexButton.disabled = false;
    elements.submitButton.textContent = "Ask";
  }
}

async function handleIndex() {
  setMessage("");

  const mode = getSourceMode();
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
      indexPath: output.storage.indexPath,
    };
    renderIndexStatus();
    await loadIndexes(output.document.documentId);
    setMessage(`Indexed ${output.index.chunkCount} chunks.`);
    await checkApiHealth();
  } catch (error) {
    clearActiveIndex();
    setMessage(error instanceof Error ? error.message : "Indexing failed.", true);
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
  const file = elements.fileInput.files && elements.fileInput.files[0];

  if (!file) {
    throw new Error("File is required.");
  }

  const form = new FormData();
  const title = elements.fileTitle.value.trim();

  form.append("file", file);
  form.append("type", elements.fileType.value);
  form.append("query", query);
  form.append("topK", String(topK));

  if (title) {
    form.append("title", title);
  }

  return await postRagRequest("/api/rag/ask", {
    body: form,
  });
}

async function askWithText(query, topK) {
  const content = elements.textContent.value.trim();
  const title = elements.textTitle.value.trim();

  if (!content) {
    throw new Error("Text is required.");
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
  elements.resultView.hidden = false;
  elements.answerText.textContent =
    output.answer && output.answer.text ? output.answer.text : "No answer returned.";
  elements.resultMeta.textContent = `${index.chunkCount ?? 0} chunks | ${
    index.embeddingProvider ?? "unknown provider"
  }`;
  elements.citationCount.textContent = String(citations.length);
  elements.chunkCount.textContent = String(results.length);
  elements.devModeJson.textContent = JSON.stringify(output, null, 2);

  renderList(elements.citationsList, citations, renderCitation);
  renderList(elements.chunksList, results, renderChunk);
}

function renderCitation(citation) {
  const row = createElement("article", "result-row");
  const source = citation.source || {};

  row.append(
    createMetaRow([
      citation.chunkId,
      `score ${formatScore(citation.score)}`,
      source.originalFilename || source.sourceType || "source",
      formatOffsets(citation.offsets),
    ])
  );

  return row;
}

function renderChunk(chunk) {
  const row = createElement("article", "result-row");
  const meta = createMetaRow([
    `rank ${chunk.rank}`,
    chunk.chunkId,
    `section ${chunk.sectionId}`,
    formatOffsets(chunk.offsets),
  ]);
  const scoreBar = createElement("div", "score-bar");
  const scoreFill = document.createElement("span");
  const text = createElement("p", "chunk-text");

  scoreFill.style.setProperty("--score-width", `${scoreToPercent(chunk.score)}%`);
  scoreBar.append(scoreFill);
  text.textContent = chunk.text || "";

  row.append(meta, scoreBar, text);
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

function clearForm() {
  elements.form.reset();
  elements.fileTitle.value = "";
  elements.textTitle.value = "";
  elements.emptyState.hidden = false;
  elements.resultView.hidden = true;
  elements.resultMeta.textContent = "No result";
  clearActiveIndex();
  setMessage("");
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
    elements.indexStatus.textContent = "No indexed document.";
    elements.indexStatus.classList.remove("index-status--active");
    elements.deleteIndexButton.disabled = true;
    return;
  }

  elements.indexStatus.textContent =
    `Indexed: ${activeIndex.title} | ${activeIndex.chunkCount} chunks | ${activeIndex.documentId}`;
  elements.indexStatus.classList.add("index-status--active");
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
      `${item.document.title} | ${item.index.chunkCount} chunks`;
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
    indexPath: item.storage.indexPath,
  };
  elements.indexSelect.value = item.document.documentId;
  renderIndexStatus();
}

function setHealth(status, label) {
  elements.apiHealth.textContent = label;
  elements.apiHealth.className = `health health--${status}`;
}

function setMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("is-error", isError);
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

function formatOffsets(offsets) {
  if (!offsets) {
    return undefined;
  }

  return `${offsets.offsetBasis}:${offsets.startOffset}-${offsets.endOffset}`;
}
