# Phase 7: Conceitos Lab UX/Frontend Enhancements

## 🎯 Objetivo

Melhorar significativamente a experiência do usuário no Laboratório de Conceitos com:
1. **Sidebar Filters** — Filtrar conceitos por categoria, status, busca
2. **Dependencies Panel** — Visualizar e navegar dependências entre conceitos
3. **Learning Path Suggestions** — Sugerir caminhos de aprendizado personalizados
4. **Enhanced Concept Detail** — Melhor visualização de relacionamentos

## 📊 Estrutura de Conceitos

Atualmente temos:
- **36 conceitos** categorizados em 15 categorias
- **Dependências explícitas** (dependsOn, nextConcepts)
- **Learning paths** (3 paths: fundamentals, optimization, advanced)
- **Status tracking** (implemented, partial, planned, stub)

## 📋 Tasks de Phase 7

### Task 1: Sidebar Filter + Search ⏱️ 1-2 dias

**Objetivo:** Implementar filtros e busca no sidebar de conceitos

**Requerimentos:**
- [ ] Search box com busca full-text (título + shortDefinition)
- [ ] Filter by category (dropdown ou tabs)
- [ ] Filter by status (implemented, partial, planned, stub)
- [ ] Filter by difficulty level (inferred de learning paths)
- [ ] Clear filters button
- [ ] Show count of matching concepts
- [ ] Persist filter state in URL/localStorage

**Files:**
- `apps/web/src/components/ConceptsSidebar.tsx` — Add filter UI
- `apps/web/src/hooks/useConceptsFilter.ts` — Filter logic (NEW)
- `apps/web/src/components/ConceptsSidebar.css` — Filter styling

**Success Criteria:**
- ✅ Search filters 36 concepts in <100ms
- ✅ All 4 filter types work independently and combined
- ✅ Filter state persists on page reload
- ✅ Mobile-friendly (filter panel collapses on small screens)

**Example UI:**
```
┌─────────────────────────────────┐
│ Lab de Conceitos                │
│ ┌─────────────────────────────┐ │
│ │ Search... [🔍]              │ │
│ ├─────────────────────────────┤ │
│ │ Category: [All ▼]           │ │
│ │ Status:   [All ▼]           │ │
│ │ Difficulty: [All ▼]         │ │
│ └─────────────────────────────┘ │
│                                 │
│ Showing 12 of 36 concepts       │
│                                 │
│ ✓ Core AI (4)                  │
│   • Transformer                 │
│   • Attention Mechanism         │
│   ...                           │
└─────────────────────────────────┘
```

---

### Task 2: Dependencies Panel 📈 ⏱️ 2-3 dias

**Objetivo:** Visualizar dependências entre conceitos como um grafo interativo

**Requerimentos:**
- [ ] Render concept dependency graph (usar react-force-graph ou similar)
- [ ] Show node types: prerequisite (azul), current (verde), dependent (amarelo)
- [ ] Click to navigate to concept
- [ ] Highlight path from A to B (A → ... → B)
- [ ] Show shortest path between concepts
- [ ] Optional: Export dependency graph (PNG/SVG)
- [ ] Responsive (scale based on screen size)

**Files:**
- `apps/web/src/components/DependencyGraph.tsx` — Graph visualization (NEW)
- `apps/web/src/hooks/useDependencyGraph.ts` — Graph logic (NEW)
- `apps/web/src/utils/graph.ts` — Graph algorithms (NEW)
- `apps/web/src/components/tabs/ConceptGraphTab.tsx` — Tab wrapper (NEW)

**Success Criteria:**
- ✅ Dependency graph renders for all 36 concepts
- ✅ Path finding works (shortest dependency chain)
- ✅ Performance: <500ms render time even with 36 nodes
- ✅ Mobile: Graph remains interactive on touch devices

**Example interactions:**
```
User clicks "Show prerequisites" for concept X
→ Graph highlights: [Foundation] → [intermediate] → [X]

User hovers over node
→ Tooltip shows: "Title | Status | 3 dependents"

User clicks "See reverse" 
→ Shows all concepts that depend on this concept
```

**Visualization (conceptual):**
```
              LLM ⭕
               ↑
        ┌──────┼──────┐
        │      │      │
   Transformer Attention Embeddings
        ↓      ↓      ↓
    ┌───┴──────┴──────┴───┐
    │                     │
  RAG              Fine-tuning
    │                │
    └────────┬────────┘
             ↓
     Optimization Techniques
```

---

### Task 3: Learning Path Suggestions 🎓 ⏱️ 1-2 dias

**Objetivo:** Recomendar learning paths baseado em conceitos já estudados

**Requerimentos:**
- [ ] Track "viewed" concepts (localStorage)
- [ ] Suggest next learning path based on progress
- [ ] Show completion % for each path
- [ ] Show prerequisites missing for a path
- [ ] "Start path" button with step-by-step guide
- [ ] Difficulty-based suggestions (beginner → intermediate → advanced)

**Files:**
- `apps/web/src/components/LearningPathPanel.tsx` — Enhance existing (MODIFY)
- `apps/web/src/hooks/useLearningProgress.ts` — Progress tracking (NEW)
- `apps/web/src/utils/pathRecommendation.ts` — Recommendation algorithm (NEW)

**Success Criteria:**
- ✅ Track concept views correctly
- ✅ Recommend relevant paths (>70% accuracy)
- ✅ Show missing prerequisites
- ✅ Persist progress across sessions

**Example UI:**
```
📚 LEARNING PATHS

Your Progress:
┌─────────────────────────────────────┐
│ 🔰 Fundamentals (Beginner)          │
│ ████████░░ 80% (4/5 concepts)       │
│ Missing: Embeddings                 │
│ [Start / Continue]                  │
├─────────────────────────────────────┤
│ 🔧 Optimization (Intermediate)      │
│ ░░░░░░░░░░ 0% (0/4 concepts)        │
│ Needs: Fundamentals path first      │
│ [View Requirements]                 │
├─────────────────────────────────────┤
│ 🚀 Advanced ML Ops (Advanced)       │
│ ░░░░░░░░░░ 0% (0/6 concepts)        │
│ [Lock] Complete Optimization first  │
└─────────────────────────────────────┘

Recommended Next:
→ Embeddings (prerequisite for LoRA, Quantization)
→ Then: Fine-tuning path
→ Then: Advanced path
```

---

### Task 4: Enhanced Concept Detail View 🔍 ⏱️ 1 dia

**Objetivo:** Melhorar o painel de detalhes de conceitos com relacionamentos visuais

**Requerimentos:**
- [ ] Show dependency chain: Prerequisites → This Concept → Dependents
- [ ] Quick links to related concepts (dependsOn, nextConcepts)
- [ ] Highlight which learning paths include this concept
- [ ] Show "You've viewed X similar concepts" stats
- [ ] "Mark as learned" button (with visual feedback)
- [ ] "Add to learning plan" button

**Files:**
- `apps/web/src/components/ConceptDetailPanel.tsx` — Enhance existing (MODIFY)
- `apps/web/src/components/ConceptRelationships.tsx` — New relationships view (NEW)

**Success Criteria:**
- ✅ All relationships display correctly
- ✅ Related concept links work
- ✅ Learning plan updates persist
- ✅ Visual hierarchy clear

**Example UI:**
```
┌─ Concept Detail ────────────────────┐
│                                      │
│ EMBEDDINGS                     ✓ Implemented
│ Learn how to represent words/tokens as vectors
│                                      │
│ Prerequisites (2):                   │
│ • Transformer ← (you haven't viewed) │
│ • Tokenization ← (viewed)            │
│                                      │
│ This Concept Is Used In:             │
│ • RAG → Retrieval                    │
│ • Fine-tuning → LoRA                 │
│                                      │
│ Part Of Learning Paths:              │
│ 🔰 Fundamentals (step 3/5)          │
│ 🔧 Optimization (step 2/4)          │
│                                      │
│ [ Mark as Learned ] [ Add to Plan ]  │
└─────────────────────────────────────┘
```

---

### Task 5: Mobile UI Polish ⏱️ 0.5 dias

**Objetivo:** Garantir UX excelente em mobile

**Requerimentos:**
- [ ] Sidebar collapsible (hamburger menu on mobile)
- [ ] Filter panel drawer-style on mobile
- [ ] Graph responsive (zoom/pan on touch)
- [ ] Learning path accordion on mobile
- [ ] Touch-friendly button sizes (44px minimum)

---

## 🗺️ Dependencies

```
Task 1 (Sidebar Filter)
    ↓
Task 2 (Dependencies Panel)  [Can work in parallel with Task 3]
    ↓
Task 3 (Learning Paths) 
    ↓
Task 4 (Detail View Enhancement)
    ↓
Task 5 (Mobile Polish)
```

**Sequential recommendation:**
1. **Day 1** → Task 1 (search + filter)
2. **Day 2-3** → Task 2 (dependencies) + Task 3 (learning paths) in parallel
3. **Day 4** → Task 4 (detail view)
4. **Day 4.5** → Task 5 (mobile polish)

## 📦 Dependencies Externas

Para Task 2 (Dependencies Panel), recomenda-se:
- `react-force-graph` — Força-dirigida graph visualization (leve, performático)
- OU `react-vis-graph-wrapper` — D3-based (mais customizável mas mais pesado)
- OU implementar simples SVG layout (mais controle, menos dependências)

**Recomendação:** Começar com SVG simples → migrar para force-graph se necessário

## ✅ Critérios de Sucesso de Phase 7

- [ ] Sidebar filter funciona para todos os 4 tipos de filtro
- [ ] Search full-text é rápido (<100ms)
- [ ] Dependency graph renderiza sem erros
- [ ] Learning paths recomendam corretamente
- [ ] Todas as features funcionam em mobile
- [ ] TypeScript sem erros
- [ ] Testes passam (se existentes)
- [ ] Performance: Lighthouse score >85 em Conceitos Lab
- [ ] UX: User pode em <2min encontrar um conceito e entender seus relacionamentos

## 📝 Próximas Fases (Phase 8+)

- **Phase 8**: Knowledge Graphs export (Markdown, JSON)
- **Phase 9**: Concept mastery badges + streak tracking
- **Phase 10**: AI-generated concept connections learning guide
