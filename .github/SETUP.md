# Configuração do repositório — Ações necessárias pelo proprietário

> Este documento é exclusivo para **arthursoaress7** (proprietário do repositório).
> As configurações abaixo exigem permissão de administrador e não podem ser feitas pelos colaboradores.

---

## ⚡ Ação imediata — Merge manual do PR dos workflows

O PR **`feature/auto-merge-workflow`** foi bloqueado pelo próprio `validate-pr.yml` porque altera
arquivos em `.github/workflows/` — o que é classificado como Categoria B (alteração crítica).

Esse comportamento é **correto e intencional**: nenhuma IA pode alterar os workflows sem autorização.

Porém, este é o PR que *cria* os workflows pela primeira vez. Ele precisa ser mergeado **manualmente**
pelo proprietário, uma única vez.

**Como fazer:**
1. Abrir o PR `feature/auto-merge-workflow` no GitHub
2. Clicar em **"Merge pull request"** → **"Squash and merge"**
3. Confirmar o merge

Após este merge, todos os PRs futuros rodarão os workflows automaticamente. Esta exceção manual
não se repetirá.

---

## Por que isso é necessário

Os workflows de auto-merge e release estão prontos no código, mas precisam de configurações
no painel do GitHub para funcionar. Sem elas, os workflows rodam mas não conseguem fazer o merge
ou criar releases automaticamente.

---

## Passo 1 — Habilitar Auto-merge no repositório

**Onde:** `Settings > General > Pull Requests`

**O que fazer:** Marcar a opção **"Allow auto-merge"**

**Por que:** O workflow `auto-merge.yml` usa a API do GitHub para ativar o auto-merge em PRs
rotineiros. Sem essa opção habilitada, a chamada à API retorna erro.

---

## Passo 2 — Proteger a branch `main`

**Onde:** `Settings > Branches > Add branch protection rule`

**Branch name pattern:** `main`

**Opções a marcar:**

| Opção | Valor | Motivo |
|---|---|---|
| Require a pull request before merging | ✅ Ativo | Impede push direto na main |
| Require approvals | ❌ Desativo | IAs usam autenticação pessoal — aprovar o próprio PR não funciona |
| Require status checks to pass before merging | ✅ Ativo | Garante que o `validate-pr.yml` passou |
| Status check obrigatório | `Validar alterações` | Nome exato do job no `validate-pr.yml` |
| Require branches to be up to date | ✅ Ativo | PR deve estar sincronizado com a main |
| Do not allow bypassing the above settings | ✅ Ativo | Nem o proprietário pode dar bypass sem PR |
| Allow force pushes | ❌ Desativo | Nunca |
| Allow deletions | ❌ Desativo | Nunca |

> **Importante:** sem "Require status checks", o auto-merge é ativado mas o PR é mergeado
> imediatamente sem aguardar validação, o que anula a segurança do fluxo.

---

## Passo 3 — Permissões do GITHUB_TOKEN para Actions

**Onde:** `Settings > Actions > General > Workflow permissions`

**O que fazer:** Selecionar **"Read and write permissions"**

**Marcar também:** "Allow GitHub Actions to create and approve pull requests"

**Por que:** O workflow `auto-merge.yml` precisa de `pull-requests: write` para chamar
a mutation GraphQL `enablePullRequestAutoMerge`. O workflow `release.yml` precisa de
`contents: write` para criar tags e releases.

> **Alternativa mais segura (opcional):** criar um PAT (Personal Access Token) com escopos
> `repo` e `workflow`, salvar como secret `RELEASE_TOKEN` e substituir
> `${{ secrets.GITHUB_TOKEN }}` por `${{ secrets.RELEASE_TOKEN }}` nos workflows.
> Isso isola as permissões e permite revogar sem afetar outras operações.

---

## Passo 4 — Habilitar Squash Merge como padrão (recomendado)

**Onde:** `Settings > General > Pull Requests`

**O que fazer:**
- Desmarcar "Allow merge commits"
- Desmarcar "Allow rebase merging"
- Manter apenas **"Allow squash merging"**
- Squash commit message: **"Pull request title and description"**

**Por que:** Mantém o histórico da `main` limpo — um commit por feature/fix,
com mensagem no formato Conventional Commits.

---

## Passo 5 — Definir o destino da branch `development`

A branch `development` existe no repositório mas o fluxo adotado é GitHub Flow
(branches temporárias → `main`). Decida:

- **Manter como arquivo:** não deletar, mas não usar para novos PRs
- **Remover:** `git push origin --delete development` (só se não houver trabalho em andamento)

---

## Verificação após configuração

Após aplicar as configurações, abra um PR de uma branch `docs/` ou `fix/` qualquer.
O fluxo esperado é:

1. PR aberto
2. Workflow `Validate PR` executa automaticamente
3. Se todas as verificações passarem, workflow `Auto Merge` ativa o auto-merge
4. GitHub aguarda o status check obrigatório ser satisfeito
5. Merge automático (Squash) é executado
6. Workflow `Release` avalia se há necessidade de nova versão

Se o merge ocorrer sem erros, o fluxo está funcionando.

---

## Dúvidas frequentes

**O GITHUB_TOKEN consegue fazer merge do próprio PR que criou?**
Sim — em repositórios pessoais, o `GITHUB_TOKEN` tem permissão para isso quando
"Allow GitHub Actions to create and approve pull requests" está habilitado.

**O auto-merge funciona sem branch protection?**
Não — sem branch protection, o PR pode ser mergeado imediatamente e o auto-merge
nem é necessário. O workflow tenta fazer o merge direto nesse caso, mas o fluxo
ideal requer a proteção configurada.

**O que acontece se o workflow de validação falhar?**
O auto-merge não é ativado. O PR fica aberto aguardando correção. O merge automático
não ocorre enquanto houver verificações com falha.
