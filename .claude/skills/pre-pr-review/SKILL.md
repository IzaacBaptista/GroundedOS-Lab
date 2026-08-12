---
name: pre-pr-review
description: Auto-revisão antes de criar branch/PR no GroundedOS-Lab. Use SEMPRE ao terminar de implementar uma task, antes de propor branch ou abrir PR. Confronta o próprio diff contra a documentation governance, a regra de ADR, tipagem estrita e as convenções de PR já documentadas no repo, corrigindo o óbvio.
---

# Pre-PR Review (GroundedOS-Lab)

Você acabou de implementar uma task. **Antes** de criar a branch ou abrir a
PR, rode esta auto-revisão — do mesmo jeito que já roda typecheck e testes.
Aplica em toda entrega o scrutiny que o "Pull request checklist" do
`README.md` já pede, sem depender de alguém lembrar de checar manualmente.

## Quem roda isto

Você (a IA). O dev não roda nada na mão — é etapa do seu fluxo de
conclusão de task, antes de propor branch/PR.

## Passo 1 — Descobrir o diff

Revise **todas** as mudanças da task: commitadas na branch atual (desde que
divergiu de `main`) + não commitadas.

```bash
git fetch -q origin main 2>/dev/null || true
BASE="$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD)"
git --no-pager diff "$BASE"...HEAD --stat
git --no-pager diff "$BASE"...HEAD     # committed
git --no-pager diff                    # unstaged
git --no-pager diff --staged           # staged
```

Se não houver `origin/main` acessível, revise apenas o working tree
(`git diff` + `git diff --staged`) e os commits da branch atual
(`git log main..HEAD` se `main` local existir).

## Passo 2 — Carregar as regras

Este repo não tem `docs/rules/*.md` — as regras vivem espalhadas nos
arquivos abaixo. Leia **todos**, sempre, um a um. "Esse domínio não tem
superfície nesse diff" só vale **depois** de abrir o arquivo e confrontar.

| Domínio | Fonte canônica |
|---|---|
| Documentação obrigatória por tipo de mudança | `docs/documentation-governance.md` |
| Quando uma decisão precisa de ADR | `docs/adr/README.md` (seção "When to write an ADR" + template) |
| Tipagem estrita / contratos de API | `tsconfig.json` (`strict: true`) — toda mudança de assinatura exportada exige checar callers |
| Testes | `README.md` seção "Code standards" ("Every package must have at least one test before being merged") |
| Convenções de PR e status de fase | `README.md` seção "🤝 Contributing" → "Pull request checklist" |
| Segurança / guardrails | mudança em `packages/safety`, `packages/agents`, ou qualquer endpoint `apps/api/src/**` não pode reduzir cobertura de guardrail existente nem introduzir segredo/log de debug |

## Passo 3 — Rodar os gates do projeto

```bash
npm run typecheck
npx vitest run <caminhos dos pacotes/arquivos tocados no diff>
```

Gate real de CI é `npm run typecheck` (roda `tsc -p tsconfig.json --noEmit`
na raiz) — não o `tsc -p` isolado de cada `packages/<nome>/tsconfig.json`,
que tem restrição de `rootDir` e falha para qualquer import cross-package
mesmo em código já existente no repo (confirmado: `packages/evals` já
falha isolado, sem relação com o diff atual — não é regressão sua se só
o build isolado por pacote falhar e o `npm run typecheck` da raiz passar).

## Passo 4 — Revisar o diff domínio a domínio

Para cada domínio do Passo 2, confronte o diff com a fonte. Para cada
achado:

- **Local**: `arquivo:linha`
- **Severidade**:
  - 🔴 **Bloqueia** — quebra caller de assinatura mudada, falta teste em
    lógica nova não-trivial, remove/ignora guardrail existente, expõe
    segredo, deixa `console.log`/debug esquecido, contradiz um ADR
    `Accepted` sem novo ADR superseding.
  - 🟡 **Corrigir** — falta atualizar README/módulo/doc exigido pela
    governance, falta entrada de índice ADR, convenção de PR não seguida.
  - 🔵 **Sugestão** — melhoria opcional, não bloqueia.
- **Regra**: qual domínio, qual arquivo-fonte.
- **Por quê**: o impacto concreto.
- **Correção sugerida**.

## Passo 5 — Corrigir o óbvio

Corrija sozinho o que for seguro e mecânico (doc esquecida, entrada de
índice faltando, `console.log` de debug). NÃO altere decisão de design ou
escopo sem confirmar com o dev — isso vira item 🔴/🟡 no relatório pra ele
decidir.

## Passo 6 — Relatório consolidado

```
## Pre-PR Review — <branch/task>

Diff: N arquivos, +X/-Y linhas. Base: main (ou working tree)

### 🔴 Bloqueia (N)
- [testes] packages/agents/src/foo.ts:12
  Lógica nova sem teste. → adicionar caso em foo.test.ts.

### 🟡 Corrigir (N)
- [documentation-governance] packages/agents/README.md
  Endpoint novo não documentado em "Current implementation".

### 🔵 Sugestão (N)

### ✅ Corrigido automaticamente (N)

### Veredito
🔴 N bloqueios pendentes — resolver antes de abrir PR.
(ou) ✅ Sem bloqueios — pode propor branch/PR.
```

Enquanto houver 🔴 pendente que você não pôde corrigir com segurança,
**não** proponha abrir a PR — apresente ao dev primeiro.

## Passo 7 — Liberar o `gh pr create`

Só quando o veredito for ✅ (sem 🔴), grave o marcador que o hook
`PreToolUse` (`/home/multiplier/Projects/.claude/settings.local.json`)
checa — senão `gh pr create` fica bloqueado:

```bash
git rev-parse HEAD > "$(git rev-parse --show-toplevel)/.git/pre-pr-reviewed"
```

O marcador guarda o SHA do HEAD atual. Commit novo muda o HEAD e exige
nova revisão. Rode isto **depois** do commit final da task, imediatamente
antes do push/PR — e rode uma vez por branch/HEAD que vai abrir PR, já que
o marcador é por repositório (`.git/` é local ao worktree), não por branch.
