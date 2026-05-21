import { Concept, LearningPath } from "./types";

export const CONCEPTS: Concept[] = [
  // Core AI
  {
    id: "llm",
    title: "LLM",
    category: "Core AI",
    status: "planned",
    shortDefinition:
      "Large Language Models are neural networks trained on massive text corpora to predict and generate text.",
    explanation:
      "LLMs learn patterns in language through transformer architectures. They generate text token-by-token based on context. Understanding LLM behavior is foundational to all advanced AI system design.",
    whyItMatters:
      "All text generation in GroundedOS Lab relies on LLM capabilities. Performance, safety, and cost are directly tied to LLM choice.",
    howToStudy: [
      "Read about transformer architectures and attention mechanisms.",
      "Understand token prediction and probability distributions.",
      "Study temperature, top-p, and top-k sampling.",
      "Compare responses from different model families.",
    ],
    howToPracticeInProject: [
      "In future phases: toggle between local and cloud LLMs.",
      "Compare response quality and latency.",
      "Observe token count and cost differences.",
    ],
    appliedInGroundedOS: [
      "GroundedOS Lab integrates with multiple LLM providers (local, Ollama, Groq).",
      "Future versions will expose temperature, top-p, and sampling controls.",
    ],
    visibleInCurrentData: [
      "Not yet. Will be visible in provider selection and model comparison.",
    ],
    whereToSeeInUI: ["Provider selector (future)", "Model comparison tab (future)"],
    suggestedExperiments: [
      "Compare response consistency across runs.",
      "Test with different sampling parameters.",
      "Measure latency and token efficiency.",
    ],
    testingSteps: [
      "1. Faça upload de um documento.",
      "2. Clique em Index.",
      "3. Faça uma pergunta no campo de entrada.",
      "4. Observe a resposta na aba Answer.",
      "5. Abra Citations para verificar as fontes da resposta.",
      "6. Abra Chunks para ver todos os trechos recuperados.",
    ],
    tradeoffsAndLimitations: [
      "Larger models = better quality but higher latency and cost.",
      "Local models = privacy but may be slower or lower quality.",
      "Cloud models = speed but introduce external dependencies.",
    ],
    relatedFiles: ["docs/concepts/llm.md", "docs/concepts/inference.md"],
    dependsOn: [],
    nextConcepts: ["transformer", "inference", "context-window"],
  },

  {
    id: "transformer",
    title: "Transformer",
    category: "Core AI",
    status: "planned",
    shortDefinition:
      "The transformer architecture uses self-attention mechanisms to process sequences efficiently.",
    explanation:
      "Transformers replaced RNNs because attention allows parallel processing and captures long-range dependencies. The architecture has an encoder, decoder, and attention layers that score how much focus each token should pay to others.",
    whyItMatters:
      "Transformers power all modern LLMs, embedding models, and retrieval systems. Understanding attention is key to understanding system behavior and design choices.",
    howToStudy: [
      "Study the 'Attention is All You Need' paper.",
      "Understand query, key, and value projections.",
      "Learn about multi-head attention.",
      "Explore positional encoding.",
    ],
    howToPracticeInProject: [
      "Future: visualize attention weights on retrieved chunks.",
      "Observe which parts of the document the model focuses on.",
    ],
    appliedInGroundedOS: [
      "All embeddings and LLM responses use transformer-based models.",
      "Chunk ordering affects attention distribution.",
    ],
    visibleInCurrentData: [
      "Not yet. Future visualization will show attention patterns.",
    ],
    whereToSeeInUI: ["Attention visualization (planned)", "Model details (future)"],
    suggestedExperiments: [
      "Compare attention patterns with different chunk orders.",
      "Test multi-head focus behavior.",
    ],
    tradeoffsAndLimitations: [
      "Transformers have quadratic memory complexity with sequence length.",
      "Long documents may exceed context windows.",
      "Attention over very long sequences can be computationally expensive.",
    ],
    relatedFiles: ["docs/concepts/llm.md"],
    dependsOn: ["llm"],
    nextConcepts: ["context-window", "weights"],
  },

  {
    id: "weights",
    title: "Weights",
    category: "Core AI",
    status: "planned",
    shortDefinition:
      "Weights are the learned parameters that determine model behavior after training.",
    explanation:
      "During training, a model learns millions to billions of weights (parameters). These weights encode patterns in the training data. Different weight initializations, training objectives, and fine-tuning approaches produce different behaviors.",
    whyItMatters:
      "Model behavior and quality depend entirely on learned weights. LoRA, fine-tuning, and quantization all manipulate or optimize weights.",
    howToStudy: [
      "Understand parameter counts and their relationship to model size.",
      "Learn about weight initialization strategies.",
      "Study how training updates weights.",
      "Explore LoRA and adapter architectures.",
    ],
    howToPracticeInProject: [
      "Future: compare parameter counts of different models.",
      "Observe quality trade-offs with quantization.",
      "Test fine-tuned vs base model weights.",
    ],
    appliedInGroundedOS: [
      "GroundedOS Lab compares fine-tuned, LoRA, and quantized weight profiles in Phase 5.",
    ],
    visibleInCurrentData: [
      "In Phase 5 experiments: trainable parameter count is visible in results.",
    ],
    whereToSeeInUI: ["Model benchmarks", "Phase 5 experiment reports"],
    suggestedExperiments: [
      "Run Phase 5 fine-tuning experiments.",
      "Compare LoRA adapter sizes vs full fine-tuning.",
      "Test quantization impact on weight precision.",
    ],
    tradeoffsAndLimitations: [
      "More weights = more capacity but slower inference and higher memory.",
      "Weight compression reduces accuracy.",
      "Fine-tuning on limited data can overfit.",
    ],
    relatedFiles: ["docs/concepts/fine-tuning.md", "experiments/fine-tuning/"],
    dependsOn: ["transformer"],
    nextConcepts: ["fine-tuning", "lora", "quantization"],
  },

  {
    id: "context-window",
    title: "Context Window",
    category: "Core AI",
    status: "planned",
    shortDefinition:
      "The context window is the maximum number of tokens a model can process in a single request.",
    explanation:
      "Each LLM has a fixed context window (e.g., 4K, 8K, 32K, 128K tokens). Input and generated output both consume tokens. Exceeding the window truncates context. Choosing the right window and managing token usage is critical for RAG systems.",
    whyItMatters:
      "Context window limits how many retrieved chunks can fit in the prompt. Window mismanagement causes grounding failures and incomplete answers.",
    howToStudy: [
      "Understand token counting (1 token ≈ 4 characters).",
      "Learn about context window constraints of different models.",
      "Study strategies for fitting documents into limited windows.",
    ],
    howToPracticeInProject: [
      "Test with different Top K values.",
      "Observe token counts in the Trade-offs tab.",
      "Note answers that fail due to context overflow.",
    ],
    appliedInGroundedOS: [
      "Context window is tracked in observability metrics.",
      "Top K selection implicitly respects context window limits.",
    ],
    visibleInCurrentData: [
      "Token count appears in trade-offs if implementation tracks it.",
      "Number of retrieved chunks indirectly reflects context management.",
    ],
    whereToSeeInUI: ["Trade-offs tab", "Model benchmarks"],
    suggestedExperiments: [
      "Vary Top K and measure token overflow.",
      "Compare response quality as context fills up.",
      "Test with long vs short documents.",
    ],
    tradeoffsAndLimitations: [
      "Longer context windows cost more and are slower.",
      "Shorter windows force aggressive content pruning.",
      "Middle content in long contexts can be overlooked (lost in the middle).",
    ],
    relatedFiles: ["docs/concepts/context-window.md", "packages/rag/"],
    dependsOn: ["llm", "inference"],
    nextConcepts: ["context-pruning", "adaptive-rag"],
  },

  {
    id: "inference",
    title: "Inference",
    category: "Core AI",
    status: "planned",
    shortDefinition:
      "Inference is the process of running a trained model on new input to generate predictions or text.",
    explanation:
      "During inference, the model processes an input through the network and produces output token-by-token. Inference speed, cost, and resource usage vary by model type and infrastructure.",
    whyItMatters:
      "RAG systems are constrained by inference latency. User experience depends on fast inference. Cost is proportional to inference calls.",
    howToStudy: [
      "Understand the difference between training and inference.",
      "Learn about batching and parallel inference.",
      "Study inference optimization techniques (quantization, distillation, caching).",
    ],
    howToPracticeInProject: [
      "Compare latency across different embedding providers.",
      "Observe inference time in Trade-offs tab.",
      "Test local vs cloud inference performance.",
    ],
    appliedInGroundedOS: [
      "Every RAG ask trigger performs embedding inference and LLM inference.",
      "Local models run inference on user hardware; cloud models on external servers.",
    ],
    visibleInCurrentData: [
      "Latency metrics in Trade-offs tab show inference speed.",
      "Provider selector determines inference backend.",
    ],
    whereToSeeInUI: ["Trade-offs tab", "Provider selector", "Latency badges"],
    suggestedExperiments: [
      "Ask the same question 10 times and measure variance.",
      "Compare local vs Ollama vs cloud latency.",
      "Measure cost per inference call.",
    ],
    tradeoffsAndLimitations: [
      "Fast inference requires optimization overhead.",
      "Batch inference is faster but increases latency for individual requests.",
      "Network latency dominates cloud inference time.",
    ],
    relatedFiles: ["docs/concepts/inference.md", "packages/observability/"],
    dependsOn: ["llm", "transformer"],
    nextConcepts: ["observability", "context-engineering"],
  },

  // Retrieval & Data
  {
    id: "rag",
    title: "RAG",
    category: "Retrieval & Data",
    status: "implemented",
    shortDefinition:
      "Retrieval-Augmented Generation combines document retrieval with LLM generation to ground answers in external knowledge.",
    explanation:
      "RAG is the core pattern in GroundedOS Lab. Instead of relying solely on LLM weights, RAG retrieves relevant document excerpts, embeds them in the prompt, and generates grounded answers. This improves accuracy, currency, and explainability.",
    whyItMatters:
      "RAG is what makes GroundedOS Lab useful. It answers questions about local documents, prevents hallucinations, and provides citations.",
    howToStudy: [
      "Understand the retrieval → ranking → generation pipeline.",
      "Learn about embedding-based similarity search.",
      "Study prompt engineering for RAG.",
      "Analyze citation extraction.",
    ],
    howToPracticeInProject: [
      "Upload a document.",
      "Ask a question about its content.",
      "Observe the retrieved chunks and citations.",
      "Check Dev Mode to see the full workflow.",
    ],
    appliedInGroundedOS: [
      "RAG is the primary interaction pattern.",
      "Every ask call triggers chunking, embedding, retrieval, ranking, and generation.",
      "The workflow tab visualizes this end-to-end process.",
    ],
    visibleInCurrentData: [
      "Retrieved chunks appear in the Chunks tab with scores.",
      "Citations show which chunks were used.",
      "Workflow shows the retrieval → generation steps.",
      "Trade-offs shows latency breakdown by stage.",
    ],
    whereToSeeInUI: [
      "Chunks tab",
      "Citations tab",
      "Workflow tab",
      "Trade-offs tab",
      "Cache hit tab",
    ],
    suggestedExperiments: [
      "Index the same document and ask different questions.",
      "Change the embedding provider and observe ranking changes.",
      "Vary Top K and see how many chunks are retrieved.",
      "Ask questions the document does not answer.",
    ],
    testingSteps: [
      "1. Faça upload de um documento.",
      "2. Clique em Index.",
      "3. Faça uma pergunta no campo de entrada.",
      "4. Observe a resposta na aba Answer.",
      "5. Abra Citations para verificar as fontes.",
      "6. Abra Chunks para ver todos os trechos recuperados.",
    ],
    tradeoffsAndLimitations: [
      "RAG is only as good as the retrieved chunks.",
      "Retrieval can fail silently (no chunks retrieved).",
      "Over-reliance on retrieval can limit generalization.",
      "Multi-document RAG introduces complexity.",
    ],
    relatedFiles: [
      "packages/rag/",
      "apps/api/src/rag-service.ts",
      "docs/phase-1-rag-internals.md",
    ],
    dependsOn: [],
    nextConcepts: ["embeddings", "chunking", "grounding"],
  },

  {
    id: "embeddings",
    title: "Embeddings",
    category: "Retrieval & Data",
    status: "implemented",
    shortDefinition:
      "Embeddings are dense vector representations of text that enable semantic similarity search.",
    explanation:
      "Embeddings convert text into high-dimensional vectors where semantically similar texts are close together. Different providers produce different vector spaces. Embedding quality directly affects retrieval quality.",
    whyItMatters:
      "Without embeddings, RAG cannot rank relevant chunks. Choosing the right embedding model is critical for RAG accuracy.",
    howToStudy: [
      "Understand dense vs sparse embeddings.",
      "Learn about embedding models (BERT, contrastive learning, etc.).",
      "Study cosine similarity and vector distance metrics.",
      "Compare embedding providers.",
    ],
    howToPracticeInProject: [
      "Upload a document.",
      "Select different embedding providers in the UI.",
      "Ask questions and compare chunk rankings.",
      "Observe latency differences.",
    ],
    appliedInGroundedOS: [
      "GroundedOS Lab supports multiple embedding providers: local-hash, api-lexical, ollama.",
      "Each chunk is embedded and stored in the local vector store.",
      "Query embeddings are compared to chunk embeddings to find relevant documents.",
    ],
    visibleInCurrentData: [
      "Provider selector shows which embedding model is active.",
      "Chunk scores in the Retrieved Chunks tab reflect embedding similarity.",
      "Latency varies by provider (local < Ollama < API).",
    ],
    whereToSeeInUI: [
      "Provider selector dropdown",
      "Chunk scores and ranking",
      "Latency metrics",
      "Model comparison tab",
    ],
    suggestedExperiments: [
      "Ask the same question with different embedding providers.",
      "Compare chunk ranking across providers.",
      "Measure latency for each provider.",
      "Look for semantic vs syntactic search differences.",
    ],
    testingSteps: [
      "1. Escolha um embedding provider no dropdown (local, ollama, api).",
      "2. Faça uma pergunta.",
      "3. Observe os scores de relevância no painel Chunks.",
      "4. Mude para outro provider e compare os rankings.",
      "5. Observe a diferença de latência.",
    ],
    tradeoffsAndLimitations: [
      "Better embeddings cost more (API) or are slower (local).",
      "Embeddings are opaque; you cannot easily understand why a chunk ranked high.",
      "Different embeddings are not directly comparable.",
      "Specialized domains may need fine-tuned embeddings.",
    ],
    relatedFiles: [
      "packages/rag/src/embeddings.ts",
      "docs/concepts/embeddings.md",
      "scripts/benchmark-model-providers.ts",
    ],
    dependsOn: ["rag"],
    nextConcepts: ["vector-database", "hybrid-search", "chunking"],
  },

  {
    id: "vector-database",
    title: "Vector Database",
    category: "Retrieval & Data",
    status: "implemented",
    shortDefinition:
      "A vector database stores and retrieves embeddings using efficient similarity search algorithms.",
    explanation:
      "Vector databases use indexes (HNSW, quantization, etc.) to perform fast nearest-neighbor searches. GroundedOS Lab uses an in-memory vector store for local development. Production systems use specialized databases (Pinecone, Weaviate, Milvus).",
    whyItMatters:
      "Vector databases enable fast similarity search at scale. Scalability depends on index choice and database implementation.",
    howToStudy: [
      "Learn about approximate nearest neighbor (ANN) algorithms.",
      "Understand HNSW (Hierarchical Navigable Small World).",
      "Study indexing strategies (flat, hierarchical, quantized).",
    ],
    howToPracticeInProject: [
      "Upload multiple documents.",
      "Observe retrieval speed.",
      "Compare latency with different document sizes.",
      "Monitor memory usage.",
    ],
    appliedInGroundedOS: [
      "GroundedOS Lab uses an in-memory vector store for development.",
      "Embeddings are persisted in .groundedos/indexes/",
      "Indexes can be deleted and recreated.",
    ],
    visibleInCurrentData: [
      "Index status shows persisted document count.",
      "Latency reflects in-memory lookup performance.",
    ],
    whereToSeeInUI: ["Index list", "Index status", "Latency metrics"],
    suggestedExperiments: [
      "Create indexes of different sizes.",
      "Measure latency growth with more documents.",
      "Delete and recreate an index.",
    ],
    testingSteps: [
      "1. Faça upload de um documento e clique Index.",
      "2. Abra a aba Embeddings para ver o índice criado.",
      "3. Faça perguntas e observe a latência de recuperação.",
      "4. Adicione mais documentos e observe o crescimento de latência.",
      "5. Delete o índice e recrie-o.",
    ],
    tradeoffsAndLimitations: [
      "In-memory vectors are lost on app restart without persistence.",
      "Memory scales linearly with embedding dimension and document count.",
      "Local vector stores do not scale beyond single-machine memory.",
      "No native support for distributed search.",
    ],
    relatedFiles: [
      "packages/rag/src/vector-store.ts",
      "docs/concepts/embeddings.md",
    ],
    dependsOn: ["embeddings"],
    nextConcepts: ["hybrid-search", "chunking"],
  },

  {
    id: "chunking",
    title: "Chunking",
    category: "Retrieval & Data",
    status: "implemented",
    shortDefinition:
      "Chunking splits large documents into smaller pieces that can be embedded, retrieved and cited.",
    explanation:
      "LLMs and retrieval systems cannot efficiently compare an entire long document at once. Chunking breaks text into smaller units (paragraphs, sentences, sliding windows). The quality of chunk boundaries affects retrieval quality, citation accuracy and answer grounding.",
    whyItMatters:
      "Chunk boundaries determine what information can be retrieved together. Bad chunks lead to incomplete answers or missing context.",
    howToStudy: [
      "Understand fixed-size, semantic, and sliding-window chunking.",
      "Learn about chunk overlap to preserve context.",
      "Study how chunk boundaries affect ranking.",
    ],
    howToPracticeInProject: [
      "Upload a structured text document.",
      "Ask a question that spans multiple chunks.",
      "Open the Citations or Chunks tab.",
      "Observe section IDs, chunk IDs, offsets and character lengths.",
    ],
    appliedInGroundedOS: [
      "GroundedOS Lab chunks NormalizedDocument sections before generating embeddings.",
      "Each chunk receives a stable ID based on document, section and chunk number.",
      "Chunks are later embedded and inserted into the vector store.",
    ],
    visibleInCurrentData: [
      "The current result shows retrieved chunks with rank, score, section and offsets.",
      "If a document has 96 chunks, the chunk count appears next to the indexed document and in response metadata.",
    ],
    whereToSeeInUI: [
      "Chunks tab",
      "Citations tab",
      "Answer metadata badges",
      "Dev Mode JSON",
    ],
    suggestedExperiments: [
      "Ask a question that targets the beginning of the document.",
      "Ask a question that targets the end of the document.",
      "Compare how chunk rank changes with different queries.",
      "Change Top K and observe how many chunks are returned.",
    ],
    testingSteps: [
      "1. Faça upload de um PDF ou TXT.",
      "2. Clique em Index.",
      "3. Abra a aba Citações ou Chunks.",
      "4. Observe chunkId, offsets e tamanho do chunk.",
    ],
    tradeoffsAndLimitations: [
      "Small chunks improve precision but may lose context.",
      "Large chunks preserve context but can reduce retrieval precision.",
      "Bad chunk boundaries can produce incomplete answers.",
      "Overlapping chunks can introduce redundancy.",
    ],
    relatedFiles: [
      "packages/rag/src/chunking.ts",
      "packages/rag/src/retrieval.ts",
      "docs/phase-1-rag-internals.md",
    ],
    dependsOn: ["rag"],
    nextConcepts: ["embeddings", "grounding", "data-lineage"],
  },

  {
    id: "hybrid-search",
    title: "Hybrid Search",
    category: "Retrieval & Data",
    status: "partial",
    shortDefinition:
      "Hybrid search combines dense (semantic) and sparse (keyword) retrieval to capture both meaning and exact matches.",
    explanation:
      "Dense embeddings excel at semantic meaning but may miss rare keywords. Sparse methods (BM25) excel at exact keywords but ignore meaning. Hybrid search balances both by blending scores from both methods.",
    whyItMatters:
      "Queries with rare technical terms, product names, or acronyms benefit from hybrid search. It improves recall compared to dense-only retrieval.",
    howToStudy: [
      "Understand BM25 and sparse retrieval algorithms.",
      "Learn about dense + sparse fusion strategies.",
      "Study score normalization and weighting.",
    ],
    howToPracticeInProject: [
      "Run a query with technical jargon.",
      "Check if rare terms are correctly retrieved.",
      "Compare density-only vs hybrid results.",
    ],
    appliedInGroundedOS: [
      "GroundedOS Lab supports hybrid search in the benchmark suite.",
      "The benchmark tool compares dense, sparse, and hybrid retrieval.",
      "Production integration is in roadmap.",
    ],
    visibleInCurrentData: [
      "Hybrid Search tab in benchmarks shows dense and sparse scores.",
      "Combined scores reflect both semantic and keyword relevance.",
    ],
    whereToSeeInUI: [
      "Model benchmarks",
      "Compare mode (partial visualization)",
    ],
    suggestedExperiments: [
      "Run npm run benchmark:hybrid",
      "Query with rare keywords and compare strategies.",
      "Adjust sparse/dense weighting and observe ranking changes.",
    ],
    tradeoffsAndLimitations: [
      "Hybrid search is slower than dense-only retrieval.",
      "Tuning the weight between dense and sparse requires experimentation.",
      "Sparse methods require preprocessing (tokenization, stemming).",
      "Not all products support both dense and sparse search equally.",
    ],
    relatedFiles: [
      "packages/rag/src/retrieval.ts",
      "scripts/benchmark-hybrid-retrieval.ts",
      "docs/concepts/hybrid-search.md",
    ],
    dependsOn: ["embeddings", "chunking"],
    nextConcepts: ["reranking", "adaptive-rag"],
  },

  {
    id: "reranking",
    title: "Re-ranking",
    category: "Retrieval & Data",
    status: "partial",
    shortDefinition:
      "Re-ranking improves retrieval quality by using a second, more sophisticated model to reorder retrieved documents.",
    explanation:
      "Initial retrieval produces a candidate set (e.g., top 20 chunks). A re-ranker then scores these candidates using a more expensive model (e.g., cross-encoder). Top chunks after re-ranking are best suited for context.",
    whyItMatters:
      "Re-ranking can dramatically improve answer quality, especially when initial retrieval includes borderline candidates.",
    howToStudy: [
      "Learn about cross-encoders vs bi-encoders.",
      "Understand precision@k metrics.",
      "Study re-ranking architectures.",
    ],
    howToPracticeInProject: [
      "Compare retrieved chunks with and without re-ranking.",
      "Observe ranking changes in the Chunks tab.",
    ],
    appliedInGroundedOS: [
      "Re-ranking is implemented in the benchmarks.",
      "Production integration is planned for Phase 7+.",
    ],
    visibleInCurrentData: [
      "Chunk rank and scores in the Chunks tab reflect initial retrieval.",
      "Re-ranked results are visible in benchmarks.",
    ],
    whereToSeeInUI: [
      "Chunks tab (initial ranking)",
      "Benchmarks (re-ranked results)",
    ],
    suggestedExperiments: [
      "Run benchmarks with re-ranking enabled.",
      "Compare top chunks before/after re-ranking.",
    ],
    tradeoffsAndLimitations: [
      "Re-ranking adds latency (second inference pass).",
      "Re-rankers require additional compute resources.",
      "Re-ranking quality depends on re-ranker model.",
      "Re-ranking can re-order incorrect chunks as correct.",
    ],
    relatedFiles: [
      "packages/rag/src/retrieval.ts",
      "packages/benchmarks/",
      "docs/concepts/hybrid-search.md",
    ],
    dependsOn: ["embeddings", "hybrid-search"],
    nextConcepts: ["temperature-top-p-top-k", "adaptive-rag"],
  },

  {
    id: "knowledge-graphs",
    title: "Knowledge Graphs / GraphRAG",
    category: "Retrieval & Data",
    status: "partial",
    shortDefinition:
      "Knowledge graphs structure documents as entity relationships, enabling more sophisticated retrieval patterns.",
    explanation:
      "Instead of flat chunks, knowledge graphs build an explicit graph of entities and relationships. GraphRAG traverses this graph to answer questions. This is more complex but enables richer reasoning.",
    whyItMatters:
      "Knowledge graphs are ideal for highly structured domains (wikis, databases, knowledge bases). They enable multi-hop reasoning.",
    howToStudy: [
      "Learn about knowledge graph construction.",
      "Understand entity extraction.",
      "Study graph traversal algorithms.",
    ],
    howToPracticeInProject: [
      "Faça perguntas relacionais e observe os entity hits no Dev Mode.",
      "Verifique os traversal steps usados para chegar aos chunks recuperados.",
    ],
    appliedInGroundedOS: [
      "packages/graphrag constrói um grafo leve de entidades a partir dos chunks indexados.",
      "packages/rag funde traversal do grafo com hybrid retrieval.",
    ],
    visibleInCurrentData: [
      "Dev Mode mostra entity hits, traversal steps e chunks recuperados via grafo.",
    ],
    whereToSeeInUI: ["Chunks tab", "Dev Mode JSON"],
    suggestedExperiments: [
      "Pergunte como um subsistema depende de outro e observe o caminho percorrido.",
    ],
    tradeoffsAndLimitations: [
      "Knowledge graph construction is complex and error-prone.",
      "Graphs can explode in complexity for large documents.",
      "Not all documents benefit from graph structure.",
    ],
    relatedFiles: ["packages/graphrag/src/index.ts", "packages/rag/src/retrieval.ts"],
    dependsOn: ["chunking"],
    nextConcepts: ["adaptive-rag"],
  },

  {
    id: "data-lineage",
    title: "Data Lineage",
    category: "Retrieval & Data",
    status: "implemented",
    shortDefinition:
      "Data lineage tracks where each piece of output originated from, enabling full traceability.",
    explanation:
      "Every retrieved chunk, citation, and answer can be traced back to its source document, section and offset. This is critical for grounding and auditability.",
    whyItMatters:
      "Users need to verify that answers are grounded. Data lineage provides this proof.",
    howToStudy: [
      "Understand document metadata (ID, source, version).",
      "Learn about offset tracking.",
      "Study citation extraction.",
    ],
    howToPracticeInProject: [
      "Ask a question.",
      "Open the Citations tab.",
      "Click on a citation to see its source and offsets.",
    ],
    appliedInGroundedOS: [
      "Every result includes document ID, section, chunk ID, and character offsets.",
      "Citations link back to source material.",
      "Workflow shows data flow from document to answer.",
    ],
    visibleInCurrentData: [
      "Citations tab shows source material with exact offsets.",
      "Chunks tab shows section IDs and character positions.",
      "Answer includes grounding metadata.",
    ],
    whereToSeeInUI: [
      "Citations tab",
      "Chunks tab",
      "Dev Mode JSON",
      "Answer metadata",
    ],
    suggestedExperiments: [
      "Ask a multi-sentence question and trace each sentence to its source.",
      "Verify full citations by checking offsets in the source document.",
    ],
    tradeoffsAndLimitations: [
      "Maintaining complete lineage adds metadata overhead",
      "Lineage can be lost if data is not preserved correctly.",
    ],
    relatedFiles: [
      "packages/core/src/data-contracts.ts",
      "packages/observe/src/lineage-tracker.ts",
    ],
    dependsOn: ["chunking", "grounding"],
    nextConcepts: ["grounding"],
  },

  // Context & Reasoning (continuing...)
  {
    id: "prompt-engineering",
    title: "Prompt Engineering",
    category: "Context & Reasoning",
    status: "planned",
    shortDefinition:
      "Prompt engineering crafts instructions and examples to guide LLM behavior without retraining.",
    explanation:
      "The quality of prompts significantly affects LLM output. Better prompts elicit more accurate, relevant, and safe responses. Prompt engineering is an art and science.",
    whyItMatters:
      "Prompts are the primary control mechanism for LLM behavior. Mastering prompt engineering improves all downstream system quality.",
    howToStudy: [
      "Learn prompt structure and best practices.",
      "Study few-shot and zero-shot prompting.",
      "Understand chain-of-thought and reasoning prompts.",
    ],
    howToPracticeInProject: [
      "Future: expose prompt template in UI.",
      "Experiment with different prompt formulations.",
    ],
    appliedInGroundedOS: [
      "RAG prompts are carefully crafted to ground answers in retrieved chunks.",
      "Future phases will expose prompt templates for customization.",
    ],
    visibleInCurrentData: ["Not yet visible in current UI."],
    whereToSeeInUI: ["Dev Mode (future)"],
    suggestedExperiments: ["Planned for future iterations."],
    tradeoffsAndLimitations: [
      "Prompt engineering is labor-intensive.",
      "Prompts are model-specific and may not generalize.",
      "Good prompts are hard to discover.",
    ],
    relatedFiles: ["docs/concepts/prompt-engineering.md"],
    dependsOn: ["llm"],
    nextConcepts: ["context-engineering", "system-prompt"],
  },

  {
    id: "context-engineering",
    title: "Context Engineering",
    category: "Context & Reasoning",
    status: "partial",
    shortDefinition:
      "Context engineering carefully selects and orders the most relevant information to include in LLM prompts.",
    explanation:
      "Not all information is equally valuable. Effective context engineering prioritizes the most relevant and recent information, removes redundancy, and orders content to maximize LLM attention.",
    whyItMatters:
      "Context engineering directly impacts answer quality. Better context = better answers.",
    howToStudy: [
      "Study context prioritization strategies.",
      "Learn about information density.",
      "Understand token budget allocation.",
    ],
    howToPracticeInProject: [
      "Change Top K values and observe answer quality.",
      "Reorder chunks mentally and predict ranking impact.",
      "Test with questions targeting different document sections.",
    ],
    appliedInGroundedOS: [
      "RAG inherently does context engineering by selecting top-ranked chunks.",
      "Top K parameter directly controls context scope.",
    ],
    visibleInCurrentData: [
      "Retrieved chunks are already context-engineered by rank.",
      "Different Top K values show different context engineering outcomes.",
    ],
    whereToSeeInUI: ["Top K input", "Retrieved Chunks with rank", "Trade-offs"],
    suggestedExperiments: [
      "Compare answers with Top K=1, 3, 5, 10.",
      "Observe how answer quality changes with context size.",
      "Find optimal Top K for your documents.",
    ],
    tradeoffsAndLimitations: [
      "Too little context = incomplete answers.",
      "Too much context = slower inference and potential noise.",
      "Context relevance is model-dependent.",
    ],
    relatedFiles: ["packages/rag/src/retrieval.ts"],
    dependsOn: ["chunking", "rag"],
    nextConcepts: ["context-pruning", "grounding"],
  },

  {
    id: "system-prompt",
    title: "System Prompt",
    category: "Context & Reasoning",
    status: "planned",
    shortDefinition:
      "The system prompt provides initial instructions and constraints that shape the entire conversation.",
    explanation:
      "System prompts set tone, role, capabilities, and boundaries for the LLM. They are persistent across turns in multi-turn conversations.",
    whyItMatters:
      "System prompts are the primary mechanism for role-based LLM behavior (assistant, expert, narrator, etc.).",
    howToStudy: [
      "Learn about system prompt design.",
      "Understand role-playing and persona design.",
      "Study instruction clarity and constraint expression.",
    ],
    howToPracticeInProject: [
      "Future: customize system prompt in UI.",
      "Test different system prompts and compare behavior.",
    ],
    appliedInGroundedOS: [
      "Grounded system prompt instructs the model to cite sources and admit uncertainty.",
    ],
    visibleInCurrentData: ["Not yet visible."],
    whereToSeeInUI: ["Dev Mode (future)"],
    suggestedExperiments: ["Planned for future."],
    tradeoffsAndLimitations: [
      "System prompts can conflict with user instructions.",
      "Overly constrained system prompts can limit capabilities.",
    ],
    relatedFiles: ["docs/concepts/prompt-engineering.md"],
    dependsOn: ["prompt-engineering"],
    nextConcepts: ["context-engineering"],
  },

  {
    id: "grounding",
    title: "Grounding",
    category: "Context & Reasoning",
    status: "implemented",
    shortDefinition:
      "Grounding anchors LLM answers to specific, retrievable facts from documents.",
    explanation:
      "An answer is grounded when every claim can be traced back to source material. Grounding prevents hallucinations and provides auditability.",
    whyItMatters:
      "Grounding is what makes RAG trustworthy. Without grounding, RAG is just a faster hallucination engine.",
    howToStudy: [
      "Learn what makes a good ground truth.",
      "Understand grounding metrics (precision, recall).",
      "Study citation extraction.",
    ],
    howToPracticeInProject: [
      "Open the Citations tab.",
      "Verify that every claim has a source.",
      "Look for answers mentioning facts not in retrieved chunks.",
    ],
    appliedInGroundedOS: [
      "RAG enforces grounding by constraining generation to retrieved chunks.",
      "System prompt instructs the model to cite sources.",
      "Dev Mode shows which chunks support each claim.",
    ],
    visibleInCurrentData: [
      "Citations tab shows the grounding sources.",
      "Chunks tab shows what was available for grounding.",
      "Answers explicitly cite sources.",
    ],
    whereToSeeInUI: [
      "Citations tab",
      "Answer text (citations in blue)",
      "Dev Mode",
    ],
    suggestedExperiments: [
      "Ask a question the document does not answer.",
      "Look for citations that do not match the answer.",
      "Read the full source text from citations.",
    ],
    testingSteps: [
      "1. Faça uma pergunta que exija múltiplas fontes.",
      "2. Abra a aba Citations na resposta.",
      "3. Clique em cada citação para ver o documento original.",
      "4. Verifique se a resposta foi baseada no documento.",
      "5. Teste o Guardrails Playground para defesa contra alucinações.",
    ],
    tradeoffsAndLimitations: [
      "Grounding can limit model expressiveness.",
      "Poor retrieval breaks grounding.",
      "Citation extraction is error-prone.",
      "Some questions require synthesis beyond documents.",
    ],
    relatedFiles: [
      "packages/rag/src/retrieval.ts",
      "apps/api/src/rag-service.ts",
      "docs/concepts/grounding.md",
    ],
    dependsOn: ["rag", "chunking", "data-lineage"],
    nextConcepts: ["context-pruning", "adaptive-rag"],
  },

  {
    id: "context-pruning",
    title: "Context Pruning / Context Trimming",
    category: "Context & Reasoning",
    status: "planned",
    shortDefinition:
      "Context pruning removes less relevant information to fit within token budgets.",
    explanation:
      "Every prompt has a token limit. Pruning strategies rank and drop lower-value content to stay within limits without losing critical information.",
    whyItMatters:
      "Pruning balances context richness with inferencelatency and cost.",
    howToStudy: [
      "Learn about context prioritization metrics.",
      "Study pruning algorithms.",
      "Understand lost-in-the-middle effects.",
    ],
    howToPracticeInProject: [
      "Future: observe automatic context pruning in Trade-offs.",
      "Compare answers with vs without pruning.",
    ],
    appliedInGroundedOS: [
      "Context pruning is implicit in Top K selection.",
      "Future phases will expose explicit pruning strategies.",
    ],
    visibleInCurrentData: ["Not yet visible."],
    whereToSeeInUI: ["Trade-offs (future)", "Dev Mode (future)"],
    suggestedExperiments: ["Planned for future."],
    tradeoffsAndLimitations: [
      "Pruning can drop important context.",
      "Over-aggressive pruning hurts accuracy.",
      "Pruning strategy depends on question type.",
    ],
    relatedFiles: ["docs/concepts/context-window.md", "packages/rag/"],
    dependsOn: ["context-engineering", "context-window"],
    nextConcepts: ["adaptive-rag"],
  },

  {
    id: "adaptive-rag",
    title: "Adaptive RAG",
    category: "Context & Reasoning",
    status: "partial",
    shortDefinition:
      "Adaptive RAG dynamically adjusts retrieval strategy based on query characteristics and data availability.",
    explanation:
      "Instead of always using the same retrieval parameters, adaptive RAG analyzes the query to decide: Should I retrieve? How many chunks? Which embedding provider? Should I use sparse search? This improves both speed and accuracy.",
    whyItMatters:
      "One-size-fits-all RAG is suboptimal. Adaptive strategies can improve quality while reducing latency for simple queries.",
    howToStudy: [
      "Learn query classification.",
      "Study adaptive retrieval strategies.",
      "Understand query complexity metrics.",
    ],
    howToPracticeInProject: [
      "Test simple vs complex queries and observe latency.",
      "Check if simple queries are answered without retrieval.",
    ],
    appliedInGroundedOS: [
      "packages/adaptive-rag classifica a query e escolhe o pipeline.",
      "packages/rag expõe adaptiveRoutingTrace no Dev Mode.",
    ],
    visibleInCurrentData: [
      "Dev Mode mostra selectedPipeline, executedPipeline e fallbackReason.",
    ],
    whereToSeeInUI: ["Chunks tab", "Dev Mode JSON"],
    suggestedExperiments: [
      "Compare perguntas conversacionais vs relacionais e observe a rota escolhida.",
    ],
    tradeoffsAndLimitations: [
      "Adaptive logic adds complexity.",
      "Misclassification can hurt accuracy.",
      "Overhead may not justify savings on small queries.",
    ],
    relatedFiles: [
      "packages/adaptive-rag/src/index.ts",
      "packages/rag/src/retrieval.ts",
      "docs/concepts/adaptive-rag.md",
    ],
    dependsOn: ["context-engineering", "rag"],
    nextConcepts: [],
  },

  // Data Engineering
  {
    id: "etl",
    title: "etl",
    category: "Data Engineering",
    status: "implemented",
    shortDefinition:
      "ETL (Extract, Transform, Load) ingests raw files into a standardized schema for downstream processing.",
    explanation:
      "ETL pipelines convert diverse document formats (PDF, TXT, images) into `NormalizedDocument` with sections, offsets and lineage metadata. This standardization enables consistent retrieval and evaluation.",
    whyItMatters:
      "Poor data standardization leads to retrieval failures and missing lineage. ETL is the foundation of data quality.",
    howToStudy: [
      "Understand document normalization schemas.",
      "Learn about lineage tracking and metadata extraction.",
      "Study error handling in multimodal ingestion.",
    ],
    howToPracticeInProject: [
      "Run npm run ingest:smoke to process sample files.",
      "Upload a PDF and a TXT file separately.",
      "Observe the Uniform Document Schema in Dev Mode.",
    ],
    appliedInGroundedOS: [
      "packages/etl implements the ETL pipeline for Phase 0.",
      "Supports text and PDF files with automatic section detection.",
      "Image and audio extractors are registered stubs.",
    ],
    visibleInCurrentData: [
      "Document sections are visible in the Index list with chunk counts.",
      "Lineage metadata appears in citations (document ID, section, offset).",
    ],
    whereToSeeInUI: ["Index list", "Citations tab", "Dev Mode output"],
    suggestedExperiments: [
      "Upload different file formats and compare schema output.",
      "Compare section detection for structured vs unstructured documents.",
      "Measure ETL processing time for documents of varying sizes.",
    ],
    testingSteps: [
      "1. Abra a aplicação web.",
      "2. Clique em 'Upload' e escolha um PDF e um TXT.",
      "3. Clique em 'Index' para processar através do pipeline ETL.",
      "4. Abra Dev Mode para ver a estrutura NormalizedDocument.",
      "5. Compare os IDs de seção e offsets entre os dois archivos.",
    ],
    tradeoffsAndLimitations: [
      "Text extraction from PDFs can be error-prone.",
      "Complex layouts may produce incorrect section boundaries.",
      "Image and audio extraction are not yet implemented.",
      "Large documents take longer to process.",
    ],
    relatedFiles: [
      "packages/etl/README.md",
      "packages/core/src/types/index.ts",
      "docs/concepts/uniform-document-schema.md",
    ],
    dependsOn: [],
    nextConcepts: ["chunking", "data-lineage"],
  },

  {
    id: "uniform-document-schema",
    title: "Uniform Document Schema",
    category: "Data Engineering",
    status: "implemented",
    shortDefinition:
      "A standardized structure for documents that enables consistent processing across ingestion, retrieval and evaluation.",
    explanation:
      "The Uniform Document Schema defines `SourceDocument` (raw input metadata) and `NormalizedDocument` (processed, queryable form) with sections, offsets, embeddings and lineage. This standardization is the backbone of GroundedOS Lab.",
    whyItMatters:
      "Without a uniform schema, each component (ETL, retrieval, eval) would need its own document representation. This creates bugs and inconsistencies.",
    howToStudy: [
      "Read packages/core/src/types/index.ts to see the schema definition.",
      "Understand section hierarchies and offset semantics.",
      "Learn how lineage is tracked through the pipeline.",
    ],
    howToPracticeInProject: [
      "Upload a document and inspect its NormalizedDocument in Dev Mode.",
      "Extract a citation and verify it can be traced back to offsets.",
      "Compare schemas for different input file types.",
    ],
    appliedInGroundedOS: [
      "All documents are converted to NormalizedDocument in the ETL pipeline.",
      "RAG retrieval operates on standardized NormalizedDocument chunks.",
      "Citations always reference section IDs, offsets and document IDs from the schema.",
    ],
    visibleInCurrentData: [
      "Document structure in Index list shows section and chunk counts.",
      "Dev Mode output includes the full NormalizedDocument structure.",
    ],
    whereToSeeInUI: ["Dev Mode", "Index list", "Citations"],
    suggestedExperiments: [
      "Upload a multi-section PDF and trace chunks to sections.",
      "Verify offset accuracy by comparing displayed text to source.",
      "Test retrieval consistency with different section boundaries.",
    ],
    testingSteps: [
      "1. Abra Dev Mode clicando no checkbox no canto superior direito.",
      "2. Faça upload de um documento.",
      "3. Clique em Index.",
      "4. Role para baixo até encontrar a chave 'document' no JSON.",
      "5. Observe a estrutura NormalizedDocument com seções e offsets.",
    ],
    tradeoffsAndLimitations: [
      "Storing full schema for large documents increases memory usage.",
      "Complex document hierarchies can be hard to represent.",
      "Schema changes require migration of persisted indexes.",
    ],
    relatedFiles: [
      "packages/core/src/types/index.ts",
      "packages/etl/README.md",
      "docs/concepts/data-lineage.md",
    ],
    dependsOn: [],
    nextConcepts: ["etl", "data-lineage"],
  },

  // Agents & Execution
  {
    id: "tool-calling",
    title: "Tool Calling",
    category: "Agents & Execution",
    status: "partial",
    shortDefinition:
      "Tool calling enables an LLM to invoke functions or APIs as part of a reasoning loop, extending its capabilities beyond text generation.",
    explanation:
      "Instead of only generating text, tool-calling LLMs can request external function execution. The LLM reasons about which tool to use, the agent executes it, and the result is fed back to continue reasoning.",
    whyItMatters:
      "Tool calling is how agents accomplish multi-step tasks. Without it, LLMs are limited to text generation.",
    howToStudy: [
      "Understand function definition schemas (OpenAI format, Anthropic format).",
      "Learn about tool choice strategies (auto, required, none).",
      "Study execution safety and error handling.",
    ],
    howToPracticeInProject: [
      "Open the Guardrails Playground in Lab mode.",
      "Observe tool calling in the DocumentQAAgent (internal tools: retrieval, citation).",
      "Review packages/agents/src/tools.ts for the tool registry.",
    ],
    appliedInGroundedOS: [
      "DocumentQAAgent uses tool calling to invoke retrieval and formatting.",
      "Guardrails chain uses tools for PII detection and injection defense.",
      "Tool registry in packages/agents manages available functions.",
    ],
    visibleInCurrentData: [
      "Dev Mode shows tool calls in the workflow steps.",
      "Guardrails Playground shows executed checks as tool invocations.",
    ],
    whereToSeeInUI: ["Lab mode", "Guardrails tab", "Dev Mode"],
    suggestedExperiments: [
      "Ask a question that requires both retrieval and synthesis.",
      "Observe which tools were invoked in Dev Mode.",
      "Try to trigger multiple tool calls in sequence.",
    ],
    testingSteps: [
      "1. Clique na aba 'Lab' para abrir o Guardrails Playground.",
      "2. Selecione um exemplo (ex: 'Prompt injection').",
      "3. Clique em 'Run Safety Check'.",
      "4. Abra Dev Mode e procure por 'toolCalls' ou 'workflow'.",
      "5. Observe as ferramentas executadas pelo agente.",
    ],
    tradeoffsAndLimitations: [
      "LLMs sometimes misuse tools or choose wrong functions.",
      "Tool execution adds latency to the response.",
      "Tool definitions must be precise to avoid errors.",
      "Not all LLMs have equally good tool-calling capabilities.",
    ],
    relatedFiles: [
      "packages/agents/src/tools.ts",
      "packages/safety/src/guardrail-chain.ts",
      "apps/api/src/agents-service.ts",
    ],
    dependsOn: ["llm"],
    nextConcepts: ["tool-calling", "temperature-top-p-top-k"],
  },

  // Optimization
  {
    id: "fine-tuning",
    title: "Fine-tuning",
    category: "Optimization",
    status: "implemented",
    shortDefinition:
      "Fine-tuning adapts a pre-trained model to a specific task by training on task-specific examples.",
    explanation:
      "Fine-tuning updates all (or most) model parameters on a small dataset, causing the model to specialize. It's more expensive than LoRA but can achieve greater adaptation.",
    whyItMatters:
      "Fine-tuning is the most effective way to adapt models to specialized tasks, but it's also the most resource-intensive.",
    howToStudy: [
      "Understand supervised fine-tuning (SFT).",
      "Learn about instruction-following and alignment.",
      "Study overfitting prevention strategies.",
    ],
    howToPracticeInProject: [
      "Run npm run experiment:fine-tuning if configured.",
      "Review results in datasets/experiments/phase-5/",
      "Compare fine-tuned vs base model outputs on domain tasks.",
    ],
    appliedInGroundedOS: [
      "Phase 5 includes real fine-tuning experiments on GPT-2.",
      "Results logged in datasets/experiments/phase-5/ with loss curves.",
      "Integration with LoRA and quantization tracks.",
    ],
    visibleInCurrentData: [
      "Experiment artifacts show training loss progression.",
      "Comparison metrics include parameter count and inference latency.",
    ],
    whereToSeeInUI: ["Lab experiments (future)", "Datasets folder"],
    suggestedExperiments: [
      "Run fine-tuning on a custom instruction dataset.",
      "Compare quality before/after on held-out test set.",
      "Experiment with different learning rates and epochs.",
    ],
    testingSteps: [
      "1. Abra o terminal na raiz do projeto.",
      "2. Execute: npm run experiment:fine-tuning",
      "3. Aguarde a conclusão (pode levar alguns minutos).",
      "4. Abra datasets/experiments/phase-5/ para ver os resultados.",
      "5. Compara a métrica 'comparison.passed' com o baseline.",
    ],
    tradeoffsAndLimitations: [
      "High computational cost (GPU/TPU required).",
      "Risk of overfitting on small datasets.",
      "All parameters updated = longer training time.",
      "Model size doesn't change, inference latency unchanged.",
    ],
    relatedFiles: [
      "experiments/fine-tuning/README.md",
      "scripts/sft-experiment.test.ts",
      "docs/concepts/fine-tuning.md",
    ],
    dependsOn: ["weights", "llm"],
    nextConcepts: ["lora", "distillation"],
  },

  {
    id: "lora",
    title: "LoRA",
    category: "Optimization",
    status: "implemented",
    shortDefinition:
      "Low-Rank Adaptation (LoRA) adds small trainable layers to a frozen pre-trained model, dramatically reducing parameters.",
    explanation:
      "LoRA freezes the original model and adds low-rank decomposition matrices. Training only these adapters (0.01-1% of original params) while keeping the base model frozen.",
    whyItMatters:
      "LoRA enables efficient fine-tuning: orders of magnitude fewer parameters, lower memory cost, and faster training while maintaining quality.",
    howToStudy: [
      "Understand low-rank decomposition mathematics.",
      "Learn how adapters combine with base model weights.",
      "Study when LoRA is sufficient vs full fine-tuning.",
    ],
    howToPracticeInProject: [
      "Run npm run experiment:lora if configured.",
      "Review results in datasets/experiments/phase-5/",
      "Compare trainable params: LoRA vs full fine-tuning.",
    ],
    appliedInGroundedOS: [
      "Phase 5 includes real LoRA experiments using PEFT library.",
      "Results show 99.76% parameter reduction (294k vs 124M params).",
      "Integration with model routing for efficient serving.",
    ],
    visibleInCurrentData: [
      "Experiment artifacts show parameter ratio (LoRA / baseline).",
      "Comparison includes trainable params and inference latency.",
    ],
    whereToSeeInUI: ["Lab experiments (future)", "Datasets folder"],
    suggestedExperiments: [
      "Train LoRA adapter on domain-specific corpus.",
      "Vary LoRA rank and observe quality vs size trade-off.",
      "Stack multiple LoRA adapters for multi-task adaptation.",
    ],
    testingSteps: [
      "1. Abra o terminal na raiz.",
      "2. Execute: npm run experiment:lora",
      "3. Aguarde a conclusão.",
      "4. Abra datasets/experiments/phase-5/ para ver resultados.",
      "5. Veja 'trainableParamsRatio' para confirmar redução de 99%.",
    ],
    tradeoffsAndLimitations: [
      "Lower rank = less expressiveness but smaller size.",
      "LoRA layer addition adds minor inference latency.",
      "Not all architectures support LoRA equally well.",
      "Quality ceiling may be lower than full fine-tuning.",
    ],
    relatedFiles: [
      "experiments/lora/README.md",
      "scripts/lora-experiment.test.ts",
      "docs/concepts/lora.md",
    ],
    dependsOn: ["fine-tuning", "weights"],
    nextConcepts: ["quantization", "distillation"],
  },

  {
    id: "quantization",
    title: "Quantization",
    category: "Optimization",
    status: "implemented",
    shortDefinition:
      "Quantization reduces model size by using lower-precision numbers (INT8, INT4) instead of FP32.",
    explanation:
      "Quantization converts 32-bit floats to 8-bit or 4-bit integers, reducing memory by 4-8x. This trades off precision for size and speed.",
    whyItMatters:
      "Quantization is essential for deploying large models on edge devices or resource-constrained environments.",
    howToStudy: [
      "Understand fixed-point and floating-point representation.",
      "Learn about symmetric and asymmetric quantization.",
      "Study post-training vs quantization-aware training.",
    ],
    howToPracticeInProject: [
      "Run npm run experiment:quantization if configured.",
      "Review results in datasets/experiments/phase-5/",
      "Compare memory usage: INT8/INT4 vs FP32.",
    ],
    appliedInGroundedOS: [
      "Phase 5 includes symmetric vector quantization experiments.",
      "Results show 85.8% memory reduction with Recall@1=1.0.",
      "Integration with model routing for serving.",
    ],
    visibleInCurrentData: [
      "Experiment artifacts show memory reduction percentage.",
      "Comparison includes Recall@1 to verify quality maintenance.",
    ],
    whereToSeeInUI: ["Lab experiments (future)", "Datasets folder"],
    suggestedExperiments: [
      "Quantize embeddings to INT4 and measure retrieval degradation.",
      "Compare inference latency: FP32 vs quantized.",
      "Test with different quantization strategies (symmetric, asymmetric).",
    ],
    testingSteps: [
      "1. Execute: npm run experiment:quantization",
      "2. Aguarde a conclusão.",
      "3. Abra datasets/experiments/phase-5/ para ver resultados.",
      "4. Procure por 'memoryReduction' (deve estar ~85%).",
      "5. Verifique que 'recall@1' mantém-se em 1.0.",
    ],
    tradeoffsAndLimitations: [
      "Lower bit-width reduces precision and can hurt quality.",
      "Some operations don't support quantization well.",
      "Inference may not be faster without specialized hardware.",
      "Re-quantizing requires re-running the pipeline.",
    ],
    relatedFiles: [
      "experiments/quantization/README.md",
      "docs/concepts/quantization.md",
      "packages/benchmarks/",
    ],
    dependsOn: ["weights"],
    nextConcepts: ["lora", "distillation"],
  },

  {
    id: "distillation",
    title: "Distillation",
    category: "Optimization",
    status: "implemented",
    shortDefinition:
      "Distillation trains a smaller 'student' model to mimic a larger 'teacher' model, achieving compression with minimal quality loss.",
    explanation:
      "Distillation transfers knowledge from an expensive teacher model to a cheaper student. The student learns from teacher soft targets (probabilities) rather than hard labels.",
    whyItMatters:
      "Distillation enables deployment of compact models with near-teacher performance, drastically reducing latency and cost.",
    howToStudy: [
      "Understand soft targets and temperature scaling.",
      "Learn about knowledge transfer mechanisms.",
      "Study student architecture choices.",
    ],
    howToPracticeInProject: [
      "Run npm run experiment:distillation if configured.",
      "Review results in datasets/experiments/phase-5/",
      "Compare student vs teacher on quality and speed.",
    ],
    appliedInGroundedOS: [
      "Phase 5 includes real distillation experiment (GPT-2 → DistilGPT-2).",
      "Results show 34.17% compression with quality gate passing.",
      "Integration with model routing for serving.",
    ],
    visibleInCurrentData: [
      "Experiment artifacts show compression rate.",
      "Comparison includes quality metrics (e.g., loss) and size.",
    ],
    whereToSeeInUI: ["Lab experiments (future)", "Datasets folder"],
    suggestedExperiments: [
      "Distill a retrieval embedding model to a smaller version.",
      "Compare teacher vs student latency on large batches.",
      "Experiment with different temperature and loss weights.",
    ],
    testingSteps: [
      "1. Execute: npm run experiment:distillation",
      "2. Aguarde a conclusão.",
      "3. Abra datasets/experiments/phase-5/",
      "4. Procure por 'compressionRatio' (deve estar ~34%).",
      "5. Verifique que 'qualityGatePassed' é true.",
    ],
    tradeoffsAndLimitations: [
      "Requires access to teacher model (not always possible).",
      "Student quality is bounded by teacher.",
      "Knowledge transfer is not always successful.",
      "Best results need careful hyperparameter tuning.",
    ],
    relatedFiles: [
      "experiments/distillation/README.md",
      "scripts/distillation-experiment.test.ts",
      "docs/concepts/distillation.md",
    ],
    dependsOn: ["fine-tuning"],
    nextConcepts: ["quantization"],
  },

  // Evaluation & Observability
  {
    id: "cost-analysis",
    title: "Cost Analysis",
    category: "Evaluation & Observability",
    status: "implemented",
    shortDefinition:
      "Cost analysis tracks and aggregates the financial cost of API calls, model inference and other services.",
    explanation:
      "Each request has an associated cost (tokens × price). GroundedOS Lab breaks down cost by provider, model, and stage (retrieval, generation) so users understand where money is spent.",
    whyItMatters:
      "Without cost visibility, RAG systems can become expensive without users realizing it. Cost tracking enables budget-conscious optimization.",
    howToStudy: [
      "Understand token pricing models (e.g., $0.001 per 1K tokens).",
      "Learn about request-level vs aggregated cost tracking.",
      "Study cost allocation across pipeline stages.",
    ],
    howToPracticeInProject: [
      "Make a RAG ask with Groq or OpenAI provider.",
      "Open Dev Mode and look for 'cost' object.",
      "Check the Trade-offs tab for cost aggregates.",
    ],
    appliedInGroundedOS: [
      "Per-request cost tracking in packages/observability.",
      "Cost breakdown by stage: embedding, retrieval, generation.",
      "Rolling aggregates in trade-off metrics dashboard.",
    ],
    visibleInCurrentData: [
      "Dev Mode shows cost.breakdown with cost per stage.",
      "Trade-offs tab shows total cost, cost per provider.",
    ],
    whereToSeeInUI: ["Dev Mode", "Trade-offs tab", "Latency badges"],
    suggestedExperiments: [
      "Compare cost: local vs Ollama vs Groq.",
      "Ask 10 questions and sum total cost.",
      "Calculate cost per retrieval vs generation.",
    ],
    testingSteps: [
      "1. Faça upload de um documento.",
      "2. Clique em Index com um provider (ex: Groq).",
      "3. Faça uma pergunta.",
      "4. Abra Dev Mode e procure por 'cost'.",
      "5. Abra a aba 'Trade-offs' e veja o custo agregado.",
    ],
    tradeoffsAndLimitations: [
      "Cost tracking is approximate (real invoice may differ).",
      "Requires accurate token counting.",
      "Price lists change over time.",
      "Local models may not report accurate cost.",
    ],
    relatedFiles: [
      "packages/observability/src/cost-tracker.ts",
      "apps/api/src/rag-service.ts",
      "docs/concepts/cost-analysis.md",
    ],
    dependsOn: ["inference"],
    nextConcepts: ["observability"],
  },

  {
    id: "observability",
    title: "Observability",
    category: "Evaluation & Observability",
    status: "implemented",
    shortDefinition:
      "Observability instruments the system to provide visibility into latency, errors, resource usage and correctness.",
    explanation:
      "Beyond metrics (latency, cost), observability includes distributed tracing, structured logging, and error tracking. GroundedOS Lab exposes per-request observability in Dev Mode.",
    whyItMatters:
      "Without observability, debugging production issues is nearly impossible. Observability enables rapid diagnosis of failures.",
    howToStudy: [
      "Learn the three pillars: metrics, logs, traces.",
      "Understand structured logging and trace spans.",
      "Study sampling strategies for high-volume systems.",
    ],
    howToPracticeInProject: [
      "Navigate to a result.",
      "Click the Dev Mode checkbox.",
      "Expand the JSON to see traces and timings.",
    ],
    appliedInGroundedOS: [
      "Dev Mode output is a structured trace of the request.",
      "packages/observability provides tracing infrastructure.",
      "Spans for each pipeline stage (chunking, embedding, retrieval, generation).",
    ],
    visibleInCurrentData: [
      "Dev Mode shows duration of each stage in milliseconds.",
      "Traces include chunk count, scores, providers used.",
    ],
    whereToSeeInUI: ["Dev Mode", "Latency badges", "Trade-offs tab"],
    suggestedExperiments: [
      "Compare latency across different document sizes.",
      "Measure latency breakdown: retrieval vs generation.",
      "Identify the slowest stage in the pipeline.",
    ],
    testingSteps: [
      "1. Faça uma pergunta em uma sessão normal.",
      "2. Clique no checkbox 'Dev Mode' no canto superior direito.",
      "3. Localize a chave 'workflow' no JSON.",
      "4. Expanda cada etapa para ver duration em ms.",
      "5. Compare com uma pergunta diferente.",
    ],
    tradeoffsAndLimitations: [
      "Tracing overhead can impact performance.",
      "Storing full traces for every request is expensive.",
      "Sampling can miss rare issues.",
      "Privacy concerns with logging full content.",
    ],
    relatedFiles: [
      "packages/observability/src/tracer.ts",
      "apps/api/src/logging.ts",
      "docs/phase-1-dev-mode-output.md",
    ],
    dependsOn: [],
    nextConcepts: ["cost-analysis"],
  },

  // Safety & Reliability
  {
    id: "guardrails",
    title: "Guardrails",
    category: "Safety & Reliability",
    status: "implemented",
    shortDefinition:
      "Guardrails are safety layers that detect and block harmful inputs, outputs or patterns before they reach the user.",
    explanation:
      "Guardrails chain together multiple checks (prompt injection, PII, jailbreak, hallucination) and decide whether to block, sanitize or allow each request.",
    whyItMatters:
      "Without guardrails, any LLM can be manipulated to generate harmful content or leak sensitive data. Guardrails are non-negotiable for production systems.",
    howToStudy: [
      "Understand prompt injection attack patterns.",
      "Learn about PII detection and sanitization.",
      "Study jailbreak and indirect injection vectors.",
    ],
    howToPracticeInProject: [
      "Click the 'Lab' tab to open Guardrails Playground.",
      "Try each guardrail example (prompt injection, PII, jailbreak).",
      "Observe which guardrails trigger for each input.",
    ],
    appliedInGroundedOS: [
      "packages/safety implements GuardrailChain with 6 checks.",
      "Integrated in API and web: guardrails run before retrieval.",
      "Lab mode Guardrails Playground for red-teaming.",
    ],
    visibleInCurrentData: [
      "Guardrails Playground shows which checks triggered.",
      "Dev Mode shows guardrail results ('pass', 'block', 'sanitize').",
    ],
    whereToSeeInUI: ["Lab tab", "Guardrails Playground", "Dev Mode"],
    suggestedExperiments: [
      "Try classic prompt injection: 'Ignore previous instructions'.",
      "Test PII detection with real email and phone numbers.",
      "Attempt jailbreak patterns and observe blocking.",
    ],
    testingSteps: [
      "1. Clique na aba 'Lab' para abrir Guardrails Playground.",
      "2. Selecione o exemplo 'Prompt injection'.",
      "3. Clique 'Run Safety Check'.",
      "4. Observe o resultado (deve ser 'blocked').",
      "5. Experimente com seus próprios inputs.",
    ],
    tradeoffsAndLimitations: [
      "Guardrails can be overly conservative and false-positive.",
      "Determined attackers can find bypass patterns.",
      "Regular updates needed as attack patterns evolve.",
      "Overhead adds latency to requests.",
    ],
    relatedFiles: [
      "packages/safety/src/guardrail-chain.ts",
      "experiments/jailbreak-defense/README.md",
      "docs/concepts/guardrails.md",
    ],
    dependsOn: [],
    nextConcepts: ["grounding"],
  },

  // Generation Control
  {
    id: "temperature-top-p-top-k",
    title: "Temperature / Top-P / Top-K",
    category: "Generation Control",
    status: "planned",
    shortDefinition:
      "Generation parameters control the randomness and diversity of LLM outputs: temperature adjusts probability distribution, top-P filters by cumulative probability, top-K limits to top-K tokens.",
    explanation:
      "Temperature scales logits (lower = more deterministic, higher = more creative). Top-P (nucleus sampling) and top-K limit token choices. Together they control output diversity and quality.",
    whyItMatters:
      "Generation parameters directly affect response quality and user experience. RAG often wants low temperature (precise); creative tasks want high temperature.",
    howToStudy: [
      "Understand logits and softmax distributions.",
      "Learn nucleus sampling (Top-P).",
      "Study the effects of each parameter on output.",
    ],
    howToPracticeInProject: [
      "Future: web UI will expose generation parameter controls.",
      "Compare outputs with temperature=0 vs 0.9.",
      "Observe diversity changes with top-p and top-k.",
    ],
    appliedInGroundedOS: [
      "API accepts temperature parameter (planned).",
      "Model providers (Groq, OpenAI) support these controls.",
      "Future: benchmarks will test temperature effects on RAG quality.",
    ],
    visibleInCurrentData: [
      "Not yet. Will appear in provider settings (future).",
    ],
    whereToSeeInUI: ["Model settings (future)", "Benchmarks (future)"],
    suggestedExperiments: [
      "Ask the same question 10 times with temperature=0.",
      "Repeat with temperature=0.9 and compare consistency.",
      "Test top-p=[0.9, 0.5] on the same query.",
    ],
    testingSteps: [
      "1. Na versão futura, haverá um painel de 'Generation Settings'.",
      "2. Configure temperature entre 0 e 1.",
      "3. Configure top_p entre 0 e 1.",
      "4. Configure top_k entre 1 e 100.",
      "5. Compare respostas com diferentes configurações.",
    ],
    tradeoffsAndLimitations: [
      "Higher temperature = more creative but less consistent.",
      "Lower temperature = more deterministic but can be repetitive.",
      "Not all providers support all parameters equally.",
      "Parameters interact: top-p + top-k requires care.",
    ],
    relatedFiles: [
      "packages/model-routing/src/generation-config.ts",
      "docs/concepts/temperature-top-p-top-k.md",
    ],
    dependsOn: ["llm", "inference"],
    nextConcepts: ["temperature-top-p-top-k", "llm"],
  },
];

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: "comece-por-aqui",
    title: "Comece por Aqui",
    description: "Uma trilha curta e prática para começar. Domine os conceitos fundamentais de RAG em poucos passos.",
    conceptIds: [
      "chunking",
      "embeddings",
      "vector-database",
      "rag",
      "grounding",
    ],
    difficulty: "beginner",
  },
  {
    id: "rag-foundations",
    title: "Fundamentos de RAG",
    description: "Construa entendimento de ponta a ponta: da ingestão até respostas ancoradas.",
    conceptIds: [
      "chunking",
      "embeddings",
      "vector-database",
      "rag",
      "grounding",
      "data-lineage",
    ],
    difficulty: "beginner",
  },
  {
    id: "retrieval-quality",
    title: "Qualidade de Recuperação",
    description: "Melhore a qualidade de ranking para consultas difíceis e com muito jargão.",
    conceptIds: [
      "embeddings",
      "hybrid-search",
      "reranking",
      "context-engineering",
      "adaptive-rag",
    ],
    difficulty: "intermediate",
  },
  {
    id: "performance",
    title: "Observabilidade e Performance",
    description: "Meça e reduza latência, custos e gargalos.",
     conceptIds: [
       "observability",
       "cost-analysis",
       "inference",
     ],
    difficulty: "intermediate",
  },
  {
    id: "safety",
    title: "Segurança e Confiabilidade",
    description: "Pratique guardrails e tratamento de modos de falha.",
    conceptIds: ["guardrails", "grounding"],
    difficulty: "intermediate",
  },
  {
    id: "optimization",
    title: "Otimização de Modelos",
    description: "Estude técnicas de adaptação de modelos e otimização de serving.",
    conceptIds: ["quantization", "lora", "distillation", "fine-tuning", "inference"],
    difficulty: "advanced",
  },
];
