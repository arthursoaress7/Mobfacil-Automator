# CLAUDE.md — Instruções de entrada para o Claude Code

> Este arquivo direciona o Claude Code ao contexto correto do projeto.
> As diretrizes completas estão em `instructions.md` — não estão duplicadas aqui.

---

## Leia antes de qualquer trabalho

1. **`instructions.md`** — fonte central de todas as diretrizes do projeto
2. **`docs/script/<módulo>.md`** — documentação do módulo que será alterado
3. **Bloco correspondente em `automacaomobfacil.user.js`** — o código é a fonte de verdade

---

## Contexto rápido

| Item | Valor |
|---|---|
| Arquivo principal | `automacaomobfacil.user.js` (~6.300 linhas) |
| Tipo | Tampermonkey userscript (monólito, sem build) |
| Sites alvo | `paymobi.ercard.com.br` e `enviamotor.mobfacil.com.br` |
| Arquitetura | **Monolítica** — não divida em arquivos nesta etapa |
| Branch de trabalho | `development` → `main` (via PR) |

---

## Regras inegociáveis

- **Não divida o arquivo em módulos** — a refatoração não está no escopo atual
- **Não altere `@downloadURL` / `@updateURL`** — qualquer push na `main` atualiza todos os usuários automaticamente
- **Não sobrescreva dados existentes no armazenamento** — siga o padrão da função `salvar()`
- **Use o prefixo correto** para novas funções (ex.: `ng`, `at`, `lb`, `tm`, `cac`, `eq` — ver tabela em `instructions.md`)
- **Dentro do painel, use `$()` em vez de `document.querySelector()`** — o `$` é um atalho local para o painel
- **Todos os timeouts ficam em `CONFIG`** — nunca valores hard-coded fora dele

---

## Como usar sem o Claude Code (chat normal)

Se estiver usando o Claude via chat (não Claude Code), cole manualmente o conteúdo relevante:

1. Cole `instructions.md` completo no início da conversa
2. Cole `docs/script/<módulo>.md` do módulo que será trabalhado
3. Cole o trecho do código (`automacaomobfacil.user.js`) relacionado à alteração
4. Descreva o que precisa

---

## Arquivos de documentação disponíveis

```
instructions.md                     ← LEIA PRIMEIRO
docs/script/01-visao-geral.md       ← mapa do script
docs/script/02-motor-coleta.md      ← coleta de dados MobFacil
docs/script/03-painel-interface.md  ← painel e auditoria
docs/script/04-atendimento.md       ← negociação/renegociação
docs/script/05-historico.md         ← histórico de acordos
docs/script/06-lembretes-timers.md  ← lembretes e timers
docs/script/07-cac.md               ← consulta CAC
docs/script/08-ccbs-contas.md       ← CCBs e contas
docs/script/09-equipe.md            ← compartilhamento Pusher
docs/script/10-navegacao-busca.md   ← navegação e busca
docs/script/11-rd-encerramento.md   ← RD Atendimento: encerramento com IA
README.md                           ← referência funcional (usuário)
```
