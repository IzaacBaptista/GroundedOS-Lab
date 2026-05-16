# Phase 7: Conceitos Lab UX/Frontend Enhancements

## Status

Concluida no frontend. Todas as entregas planejadas para UX do Lab de Conceitos
foram implementadas e validadas em build/test.

## Objetivo

Melhorar a experiencia no Lab de Conceitos com descoberta rapida, navegacao por
dependencias, trilhas de aprendizado e explicacoes mais didaticas por conceito.

## Escopo implementado

### 1. Sidebar com filtros e busca

- Busca full-text por titulo, descricao curta e explicacao
- Filtros por categoria e status
- Persistencia em localStorage
- Contadores dinamicos e comportamento responsivo

Arquivos principais:

- `apps/web/src/components/ConceptsSidebar.tsx`
- `apps/web/src/components/ConceptsSidebar.css`
- `apps/web/src/hooks/useConceptsFilter.ts`

### 2. Fluxo de conceito consolidado em modal com abas

- Conceitos abrem em modal (nao drawer)
- Navegacao por abas de Detalhes, Dependencias e Caminhos
- Integracao com acao de executar experimento

Arquivos principais:

- `apps/web/src/App.tsx`
- `apps/web/src/components/ConceptModal.tsx`
- `apps/web/src/components/ConceptModal.css`
- `apps/web/src/components/ConceptDetailTabs.tsx`
- `apps/web/src/components/ConceptDetailTabs.css`

### 3. Grafo de dependencias com hierarquia clara

- Expansao em multiplos niveis
- Layout hierarquico por colunas:
  - pre-requisitos a esquerda
  - conceito atual ao centro
  - dependentes a direita
- Arestas direcionais sempre visiveis
- Toggle para focar apenas relacoes diretas
- Destaque do caminho primario ao clicar em um no
- Resumo do conceito selecionado com auto-scroll

Arquivos principais:

- `apps/web/src/components/DependencyGraph.tsx`
- `apps/web/src/components/DependencyGraph.css`

### 4. Painel didatico estruturado no resumo inferior

Ao selecionar um no do grafo, o painel exibe em portugues (mantendo nomes de
conceitos em ingles quando aplicavel):

- Definicao
- Quando usar
- Problemas comuns
- Custo computacional
- Bibliotecas populares
- Por que isso importa no RAG

Obs.: perfis detalhados existem para conceitos chave, com fallback generico para
conceitos ainda nao mapeados.

### 5. Trilha de aprendizado e progresso

- Rastreamento de viewed/learned
- Progresso por trilha
- Recomendacoes de proximo passo
- Identificacao de pre-requisitos faltantes

Arquivos principais:

- `apps/web/src/components/LearningPathPanel.tsx`
- `apps/web/src/components/LearningPathPanel.css`
- `apps/web/src/hooks/useLearningProgress.ts`

## Validacao

Comando executado:

```bash
npm --workspace @groundedos/web run build && npm --workspace @groundedos/web run test
```

Resultado:

- Build: OK
- Testes: 4 arquivos, 32 passed, 4 skipped

## Criterios de sucesso de Phase 7

- [x] Sidebar filter funcional
- [x] Busca full-text rapida
- [x] Grafo de dependencias renderiza sem erros
- [x] Recomendacoes de trilha funcionando
- [x] UX responsiva e navegacao consistente
- [x] TypeScript sem erros na entrega validada
- [x] Suite de testes do frontend passando

## Pendencias pequenas (nao bloqueantes)

- Expandir `CONCEPT_PROFILES` para cobrir mais IDs sem fallback generico
- Ajustar densidade textual de alguns perfis conforme feedback de uso
