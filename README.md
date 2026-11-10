# PaymobiFin — Assistente

Userscript Tampermonkey que adiciona um painel flutuante ao sistema ER da Paymobi, automatizando tarefas operacionais da equipe de cobrança e crédito.

**Versão atual:** 13.27.2

---

## O que faz

- Coleta automática de dados de análise de crédito (score, restritivos, consultas, CPF, motivo de reprovação)
- Registro e compartilhamento de acordos entre a equipe
- Geração de textos formatados para WhatsApp e linhas para planilhas Excel
- Gerenciamento de lembretes de pagamentos parciais
- Consulta CAC, download de CCBs, troca rápida de conta
- Relatório das propostas com pendência em aberto (Fila de Pendências da conta master)
- Análise de atendimentos com IA (Gemini) no painel do RD Station

---

## Tecnologias

| Item | Detalhe |
|---|---|
| Tipo | Tampermonkey Userscript (JavaScript, sem build) |
| Sites alvo | `paymobi.ercard.com.br` · `enviamotor.mobfacil.com.br` |
| Arquivo principal | `paymobifin-assistente.user.js` (~8.300 linhas, monólito) |
| Dependências externas | Pusher Channels 8.4.0 (via `@require`) |
| APIs do browser | Web Crypto (AES-GCM 256), Web Workers, Web Locks |
| APIs Tampermonkey | `GM_setValue/getValue/deleteValue`, `GM_setClipboard`, `GM_xmlhttpRequest`, `unsafeWindow` |

---

## Instalação

1. Instale a extensão **Tampermonkey** no seu navegador (Chrome, Edge ou Firefox)
2. Nas configurações do Tampermonkey, habilite a execução de userscripts
3. Acesse a URL de instalação direta:
   ```
   https://github.com/arthursoaress7/PaymobiFin-Assistente/raw/refs/heads/main/paymobifin-assistente.user.js
   ```
4. O Tampermonkey detecta o arquivo `.user.js` e exibe a tela de instalação — confirme
5. O script estará ativo na próxima vez que abrir o ER ou o motor

**Atualização automática:** o Tampermonkey verifica atualizações periodicamente via `@updateURL`, que aponta para a branch `main`. Toda alteração integrada na `main` será distribuída automaticamente aos usuários.

**Quem instalou pelo endereço antigo** (`.../automacaomobfacil.user.js`) não precisa fazer nada: na próxima verificação o Tampermonkey baixa a 13.27.2 e passa a buscar as atualizações no arquivo novo, sem perder contas nem configurações.

---

## Estrutura do projeto

```
PaymobiFin-Assistente/
├── paymobifin-assistente.user.js   ← código-fonte (monólito)
├── automacaomobfacil.user.js       ← nome antigo, congelado: só migra instalações antigas (não editar)
├── README.md                       ← este arquivo
├── instructions.md                 ← manual operacional para IAs e desenvolvedores
├── CLAUDE.md                       ← entrada rápida para o Claude Code
├── .github/
│   ├── SETUP.md                    ← configurações necessárias pelo proprietário
│   └── workflows/
│       ├── validate-pr.yml         ← valida todo PR antes do merge
│       ├── auto-merge.yml          ← merge automático para alterações rotineiras
│       └── release.yml             ← cria versão e CHANGELOG automaticamente
└── docs/
    └── script/
        ├── 01-visao-geral.md
        ├── 02-motor-coleta.md
        ├── 03-painel-interface.md
        ├── 04-atendimento.md
        ├── 05-historico.md
        ├── 06-lembretes-timers.md
        ├── 07-cac.md
        ├── 08-ccbs-contas.md
        ├── 09-equipe.md
        ├── 10-navegacao-busca.md
        └── 11-rd-encerramento.md
```

Documentação técnica de cada módulo em [`docs/script/`](./docs/script/).

---

## Desenvolvimento

### Fluxo de trabalho

O projeto usa duas branches permanentes:

```
main         ←  produção — distribuída aos usuários via @updateURL
  ↑ PR após testes aprovados
development  ←  integração — todo trabalho é testado aqui primeiro
  ↑ PR de branch temporária
  └── tipo/descricao-curta  (temporária, uma por tarefa)
```

**Todo desenvolvimento começa em `development`.** Só vai para `main` depois de testado.

### Iniciando o trabalho

```bash
# 1. Atualizar development
git checkout development
git pull

# 2. Criar branch para a tarefa
git checkout -b tipo/descricao-curta

# 3. Desenvolver e commitar
git add arquivo
git commit -m "tipo: descrição objetiva"

# 4. Enviar a branch
git push -u origin tipo/descricao-curta

# 5. Abrir PR → development (não main)
```

### Subindo para produção

Quando o trabalho em `development` estiver testado e estável:

```bash
# Abrir PR: development → main
# Título: tipo: descrição (Conventional Commits)
# O merge é manual — requer validação final
```

---

## Padrão de branches

| Branch/Prefixo | Tipo | Base | Destino |
|---|---|---|---|
| `main` | Permanente | — | Produção |
| `development` | Permanente | — | Integração/testes |
| `feature/` | Temporária | `development` | `development` |
| `fix/` | Temporária | `development` | `development` |
| `docs/` | Temporária | `development` | `development` |
| `refactor/` | Temporária | `development` | `development` |
| `chore/` | Temporária | `development` | `development` |
| `hotfix/` | Temporária | `main` | `main` + `development` |

Regras:
- Nunca commitar diretamente em `main` ou `development`
- Uma branch por tarefa
- Branches temporárias são removidas após o merge

---

## Conventional Commits

Todo commit deve seguir o formato:

```
tipo: descrição objetiva em minúsculas
```

| Tipo | Impacto SemVer | Quando usar |
|---|---|---|
| `feat` | MINOR | Nova funcionalidade |
| `fix` | PATCH | Correção de bug |
| `docs` | — | Apenas documentação |
| `refactor` | — | Refatoração |
| `chore` | — | Versão, configs, manutenção |
| `perf` | PATCH | Melhoria de desempenho |
| `test` | — | Testes |
| `ci` | — | GitHub Actions |

Mudança incompatível: `feat!:` ou `BREAKING CHANGE:` no rodapé.

**O título do PR deve seguir o mesmo formato.**

---

## Pull Requests

- PR de branch temporária → `development` (rotina, pode ter auto-merge)
- PR de `development` → `main` (produção, requer validação manual)
- Usar **Squash Merge** para manter histórico limpo

---

## Versionamento (SemVer)

O campo `@version` no cabeçalho do script é a única fonte da versão.

O workflow `release.yml` calcula e cria a release automaticamente a cada merge na `main`:
- `feat` → MINOR · `fix`/`perf` → PATCH · `BREAKING CHANGE` → MAJOR

Acompanha um commit manual `chore: versão X.Y.Z` para atualizar o `@version` no script.

---

## GitHub Actions

| Workflow | Quando executa | O que faz |
|---|---|---|
| `validate-pr.yml` | Todo PR aberto | Valida título, detecta alterações críticas (Categoria B), verifica integridade do script |
| `auto-merge.yml` | Após validação passar | Ativa Squash Merge automático para PRs rotineiros |
| `release.yml` | Push na `main` | Calcula SemVer, atualiza CHANGELOG, cria tag e GitHub Release |

> **Configuração necessária:** ver [`.github/SETUP.md`](./.github/SETUP.md) para as configurações que o proprietário do repositório precisa aplicar.

---

## Referência ao manual operacional

Para desenvolver ou manter o projeto — especialmente com o apoio de uma IA — leia o [`instructions.md`](./instructions.md).

Ele contém a arquitetura interna, padrões de código, política de autonomia para IAs, fluxo Git completo e checklists obrigatórios.
