# PaymobiFin — Assistente

v13.26.3

---

## O que faz

- Coleta automática de dados de análise de crédito (score, restritivos, consultas, CPF, motivo de reprovação)
- Registro e compartilhamento de acordos entre a equipe
- Geração de textos formatados para WhatsApp e linhas para planilhas Excel
- Gerenciamento de lembretes de pagamentos parciais
- Consulta CAC, download de CCBs, troca rápida de conta
- Análise de atendimentos com IA (Gemini) no painel do RD Station

---

## Tecnologias

| Item | Detalhe |
|---|---|
| Tipo | Tampermonkey Userscript (JavaScript, sem build) |
| Sites alvo | `paymobi.ercard.com.br` · `enviamotor.mobfacil.com.br` |
| Arquivo principal | `automacaomobfacil.user.js` (~8.300 linhas, monólito) |
| Dependências externas | Pusher Channels 8.4.0 (via `@require`) |
| APIs do browser | Web Crypto (AES-GCM 256), Web Workers, Web Locks |
| APIs Tampermonkey | `GM_setValue/getValue/deleteValue`, `GM_setClipboard`, `GM_xmlhttpRequest`, `unsafeWindow` |

---

## Instalação

1. Instale a extensão **Tampermonkey** no seu navegador (Chrome, Edge ou Firefox)
2. Nas configurações do Tampermonkey, habilite a execução de userscripts
3. Acesse a URL de instalação direta:
   ```
   https://github.com/arthursoaress7/Mobfacil-Automator/raw/refs/heads/main/automacaomobfacil.user.js
   ```
4. O Tampermonkey detecta o arquivo `.user.js` e exibe a tela de instalação — confirme
5. O script estará ativo na próxima vez que abrir o ER ou o motor

**Atualização automática:** o Tampermonkey verifica atualizações periodicamente via `@updateURL`, que aponta para a branch `main`. Toda alteração integrada na `main` será distribuída automaticamente aos usuários.

---

## Estrutura do projeto

```
Mobfacil-Automator/
├── automacaomobfacil.user.js   ← código-fonte (monólito)
├── README.md                   ← este arquivo
├── instructions.md             ← manual operacional para IAs e desenvolvedores
├── CLAUDE.md                   ← entrada rápida para o Claude Code
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

### Pré-requisitos

- Git
- Acesso ao repositório no GitHub
- Navegador com Tampermonkey instalado (para testar)

### Iniciando o trabalho

```bash
# 1. Garanta que está com a main atualizada
git checkout main
git pull

# 2. Crie uma branch para a sua tarefa
git checkout -b tipo/descricao-curta

# 3. Desenvolva e faça commits seguindo o padrão
git add arquivo
git commit -m "tipo: descrição objetiva"

# 4. Envie a branch
git push -u origin tipo/descricao-curta

# 5. Abra um Pull Request para a main no GitHub
```

---

## Padrão de branches

Adotamos **GitHub Flow** — a `main` é sempre estável e toda alteração chega por Pull Request.

| Prefixo | Uso |
|---|---|
| `feature/` | Nova funcionalidade |
| `fix/` | Correção de erro |
| `docs/` | Documentação |
| `refactor/` | Refatoração autorizada |
| `chore/` | Manutenção e configurações |
| `hotfix/` | Correção urgente em produção |

**Exemplos:**
```
feature/exportar-relatorios
fix/erro-na-coleta-de-score
docs/atualizar-instrucoes
hotfix/falha-critica-ccb
```

Regras:
- Cada branch representa uma tarefa específica
- **Nunca commitar diretamente na `main`**
- Branches são temporárias: criadas para a tarefa e removidas após o merge

---

## Conventional Commits

Todo commit deve seguir o formato:

```
tipo: descrição objetiva em minúsculas
```

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade para o usuário |
| `fix` | Correção de bug |
| `docs` | Apenas documentação |
| `refactor` | Refatoração sem mudança de comportamento |
| `chore` | Atualização de versão, configs, manutenção |
| `perf` | Melhoria de desempenho |
| `test` | Testes |
| `build` | Build, dependências |
| `ci` | GitHub Actions, automação |

**Mudança incompatível:** adicionar `BREAKING CHANGE:` no rodapé ou `!` após o tipo:
```
feat!: remover campo legado do módulo de contas
```

**Exemplos reais do projeto:**
```
feat: RD analisa a conversa aberta para encerrar antes das 24h
fix: RD encerra conversas escolhidas antes das 24h
chore: versão 13.13
docs: adicionar instructions.md e CLAUDE.md
```

---

## Pull Requests

- O título do PR deve seguir o padrão de Conventional Commits
- Descreva o que muda, o que foi testado e se há impacto em outros módulos
- Use **Squash Merge** para manter o histórico da `main` organizado
- **Nunca fazer merge sem revisar o diff**

---

## Versionamento (SemVer)

O projeto usa `MAJOR.MINOR.PATCH` no campo `@version` do cabeçalho do script.

| Situação | Incremento |
|---|---|
| `feat` | MINOR |
| `fix`, `perf` | PATCH |
| `BREAKING CHANGE` | MAJOR |
| `docs`, `chore`, `test`, `ci` | nenhum (por padrão) |
| `refactor` com impacto funcional | MINOR ou PATCH, conforme o caso |

A versão é atualizada manualmente no `@version` do cabeçalho do script a cada release. Um commit de `chore: versão X.Y.Z` acompanha essa atualização.

> **Automação futura:** há plano de avaliar `semantic-release` com GitHub Actions para calcular e aplicar o SemVer automaticamente. Enquanto isso não estiver implementado, a versão é gerenciada manualmente.

---

## Releases

Não há processo automatizado de release ainda. Cada integração na `main` com incremento de versão constitui um release implícito, distribuído aos usuários pelo mecanismo de atualização automática do Tampermonkey.

> **Atenção:** qualquer push na `main` atualiza o script para todos os usuários com atualização automática habilitada. Teste antes de integrar.

---

## Referência ao manual operacional

Para desenvolver ou manter o projeto — especialmente com o apoio de uma IA — leia o [`instructions.md`](./instructions.md).

Ele contém a arquitetura interna, padrões de código, regras de autonomia para IAs, política de versionamento detalhada e checklists obrigatórios.
