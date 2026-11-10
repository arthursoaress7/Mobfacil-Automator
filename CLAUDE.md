# CLAUDE.md — Entrada para o Claude Code

> Direciona o Claude Code ao contexto correto. Diretrizes completas em `instructions.md`.

---

## Antes de qualquer trabalho, leia:

1. **`instructions.md`** — regras de desenvolvimento, autonomia, Git e arquitetura
2. **`docs/script/<módulo>.md`** — documentação do módulo que será alterado
3. **Bloco correspondente em `paymobifin-assistente.user.js`** — o código é a fonte de verdade

---

## Contexto rápido

| Item | Valor |
|---|---|
| Arquivo principal | `paymobifin-assistente.user.js` (~8.300 linhas) |
| Tipo | Tampermonkey userscript (monólito, sem build) |
| Versão atual | 13.27.2 |
| Sites alvo | `paymobi.ercard.com.br` e `enviamotor.mobfacil.com.br` |
| Arquitetura | **Monolítica** — não dividir em arquivos |
| Fluxo Git | branch temporária → `development` (testes) → `main` (produção) |

---

## Regras inegociáveis

- **Não divida o arquivo** — refatoração não está no escopo atual
- **Não altere `@downloadURL`/`@updateURL`** — push na `main` atualiza todos os usuários
- **Não edite `automacaomobfacil.user.js`** — é o nome antigo, congelado na 13.27.2 só para migrar instalações antigas; o código vai em `paymobifin-assistente.user.js`
- **Nunca commitar em `main` ou `development` diretamente** — sempre via branch + PR
- **Branch temporária parte de `development`**, não de `main`
- **PR de trabalho vai para `development`** — `development` → `main` é PR separado, após testes
- **Não sobrescreva dados de armazenamento existentes** — siga o padrão de `salvar()`
- **Dentro do painel, use `$()`, não `document.querySelector()`**
- **Timeouts apenas em `CONFIG`** — nunca valores hard-coded fora dele
- **Use o prefixo correto** para novas funções (`ng`, `at`, `lb`, `tm`, `cac`, `eq`, `hs`, `bs`, `rd`)
- **Alterações críticas (arquitetura, armazenamento, segurança, workflows) exigem autorização explícita**

---

## Ciclo de trabalho (Categoria A — rotineiro)

```bash
# Sempre partir de development atualizada
git checkout development && git pull
git checkout -b tipo/descricao-curta

# implementar
git add <arquivos>
git commit -m "tipo: descrição"
git push -u origin tipo/descricao-curta

# abrir PR → development (não main)
# development → main só após testes, por PR manual
```

---

## Como usar via chat (sem Claude Code)

Cole no início da conversa:
1. `instructions.md` completo
2. `docs/script/<módulo>.md` do módulo envolvido
3. O trecho relevante de `paymobifin-assistente.user.js`
4. Descrição do que precisa

---

## Documentação disponível

```
instructions.md                     ← LEIA PRIMEIRO
docs/script/01-visao-geral.md
docs/script/02-motor-coleta.md
docs/script/03-painel-interface.md
docs/script/04-atendimento.md
docs/script/05-historico.md
docs/script/06-lembretes-timers.md
docs/script/07-cac.md
docs/script/08-ccbs-contas.md
docs/script/09-equipe.md
docs/script/10-navegacao-busca.md
docs/script/11-rd-encerramento.md
README.md
.github/SETUP.md                    ← configurações para o proprietário
```
