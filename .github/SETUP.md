# Configuração do repositório — Ações necessárias pelo proprietário

> Exclusivo para **arthursoaress7** (proprietário do repositório). Estas configurações exigem permissão de administrador.
> Fluxo descrito no item 13 do [`instructions.md`](../instructions.md).

---

## Como o fluxo funciona

```
branch de tarefa → PR → development     validação + merge automático (Categoria A)
development → PR de release → main       aberto/atualizado sozinho; merge manual (um clique)
main → tag + release                     automático; depois a main volta para a development sozinha
```

Os passos abaixo fazem esse fluxo funcionar de ponta a ponta.

---

## Passo 1 — Criar o token `RELEASE_TOKEN`

PRs e merges feitos com o token padrão do GitHub Actions (`GITHUB_TOKEN`) **não disparam outros workflows**. Sem um token pessoal:
- o merge automático na `development` não abre o PR de release;
- o PR de release e o PR de sincronização ficam sem a verificação "Validar alterações".

**Criar o token:**
1. GitHub → foto do perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. **Repository access:** *Only select repositories* → `PaymobiFin-Assistente`
3. **Permissions → Repository permissions:**
   - Contents: **Read and write**
   - Pull requests: **Read and write**
   - Workflows: **Read and write** (permite que o PR de release contenha mudanças de workflows vindas da `development`)
4. **Expiration:** até 1 ano (anote a data para renovar)
5. Copie o token gerado

**Salvar como secret:**
1. Repositório → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `RELEASE_TOKEN` · Secret: o token copiado

> As ações feitas com esse token aparecem no GitHub como feitas pela sua conta.

---

## Passo 2 — Permissões do GitHub Actions

**Onde:** `Settings > Actions > General > Workflow permissions`

- Selecionar **"Read and write permissions"**
- Marcar **"Allow GitHub Actions to create and approve pull requests"**

---

## Passo 3 — Merge automático e métodos de merge

**Onde:** `Settings > General > Pull Requests`

| Opção | Valor | Motivo |
|---|---|---|
| Allow merge commits | ✅ | A sincronização `main` → `development` usa merge commit |
| Allow squash merging | ✅ | PRs de tarefa entram com um commit cada |
| Allow auto-merge | ✅ | O merge automático espera as verificações em vez de integrar direto |
| Automatically delete head branches | ✅ (recomendado) | Remove as branches de tarefa depois do merge. **Não** apaga `main` nem `development` |

---

## Passo 4 — Proteger a `main` e a `development`

**Onde:** `Settings > Branches > Add branch protection rule` (uma regra para cada)

| Opção | `main` | `development` | Motivo |
|---|---|---|---|
| Require a pull request before merging | ✅ | ✅ | Ninguém faz push direto |
| Require approvals | ❌ | ❌ | A sua conta não pode aprovar o próprio PR |
| Require status checks to pass before merging | ✅ | ✅ | Nada entra sem validação |
| Status check obrigatório | `Validar alterações` | `Validar alterações` | Nome do job no `validate-pr.yml` |
| Require branches to be up to date | ❌ | ❌ | Evita travar o merge automático e o PR de release |
| Do not allow bypassing the above settings | ✅ | ✅ | Nem merges manuais passam com a validação reprovada |
| Allow force pushes | ❌ | ❌ | Nunca |
| Allow deletions | ❌ | ❌ | Nunca |

> Sem esta proteção, um merge manual com a validação reprovada ainda passa (aconteceu nos PRs #43 e #44).
> Não proteja `release/proxima`: o workflow "Preparar release" atualiza essa branch com push forçado.

---

## Verificação depois de configurar

1. Abra um PR de documentação qualquer para a `development` (ex.: `docs/teste-fluxo`).
2. **Validate PR** roda; o job **Merge automático** integra o PR.
3. **Preparar release** roda e abre o PR **"chore: integrar development na main"** (ou "chore: release vX.Y.Z" se houver `feat`/`fix`), já com a verificação "Validar alterações".
4. Integre o PR de release na `main`.
5. **Release** roda: cria a tag (se a versão mudou) e abre **"chore: sincroniza main na development"**, que é integrado sozinho.

---

## Dúvidas frequentes

**Um PR não foi integrado sozinho. Por quê?**
Veja o resumo do workflow **Validate PR**. Causas comuns: título fora do padrão `tipo: descrição`; Categoria B (workflows, `.github/scripts`, `package.json`, arquivo-ponte); rótulo `sem-auto-merge`; PR em rascunho.

**Como impedir o merge automático de um PR?**
Coloque o rótulo `sem-auto-merge` no PR.

**Posso integrar o PR de release com "Squash and merge"?**
Pode. "Create a merge commit" deixa o histórico mais claro, mas os dois funcionam: a sincronização traz a `main` de volta para a `development`.

**O token expirou. O que acontece?**
Os workflows que usam `RELEASE_TOKEN` falham com erro de autenticação. Gere um token novo (Passo 1) e atualize o secret.
