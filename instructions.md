# instructions.md — Manual operacional do PaymobiFin

> **Fonte única de verdade para qualquer IA ou desenvolvedor que trabalhe neste projeto.**
> Leia este arquivo completamente antes de iniciar qualquer tarefa.

---

## 1. Identidade e contexto do projeto

O **PaymobiFin - Assistente** é um userscript Tampermonkey que roda em dois sites:

| Site | Função |
|---|---|
| `paymobi.ercard.com.br` | Painel principal com todas as funcionalidades |
| `enviamotor.mobfacil.com.br` | Motor de coleta de dados de crédito (iframe) |

**Arquivo de código:** `paymobifin-assistente.user.js` — único arquivo JavaScript, ~8.300 linhas, sem transpilador ou bundler.

**Arquivo-ponte:** `automacaomobfacil.user.js` é o nome antigo do script. Ficou congelado na v13.27.2 (cópia idêntica, já com `@downloadURL`/`@updateURL` apontando para o arquivo novo) só para migrar as instalações antigas: o Tampermonkey de quem instalou pelo endereço antigo baixa a 13.27.2 e passa a seguir o arquivo novo. **Não editar** — toda alteração vai em `paymobifin-assistente.user.js`. Remoção prevista em `PRIORIDADES.md` (P3.8).

**Versão atual:** 13.22 (campo `@version` no cabeçalho do script — única fonte da versão)

**Repositório:** `git@github.com:arthursoaress7/PaymobiFin-Assistente.git`  
**Proprietário do repositório:** arthursoaress7 (pode ter permissões administrativas que o usuário atual não tem)

---

## 2. Prioridades atuais

1. **Manter o sistema funcionando** — preservar toda funcionalidade existente
2. **Estabelecer padrões de desenvolvimento** — governança, versionamento, documentação
3. **Não refatorar** — a divisão do monólito não está no escopo atual

Qualquer solicitação que contrarie estas prioridades requer autorização explícita.

---

## 3. Regras de preservação do monólito

Até autorização formal para refatoração:

- **Não dividir `paymobifin-assistente.user.js` em múltiplos arquivos**
- **Não reorganizar diretórios do projeto**
- **Não alterar a arquitetura ou a ordem de execução**
- **Não remover funções** sem investigar todos os pontos de uso
- **Não alterar variáveis globais** por conveniência
- **Não substituir implementações existentes** por alternativas sem justificativa técnica aprovada
- **Não fazer melhorias** fora do escopo explicitamente solicitado

---

## 4. Hierarquia das instruções

Em caso de conflito entre documentos, esta é a ordem de precedência:

1. Instruções diretas do responsável (chat/sessão atual)
2. Este arquivo (`instructions.md`)
3. `README.md`
4. `docs/script/<módulo>.md`
5. Comentários no código-fonte

O código-fonte é sempre a fonte de verdade sobre **como o sistema funciona hoje**.

---

## 5. Política de autonomia das IAs

### Categoria A — Alterações rotineiras (autonomia total)

A IA pode executar o ciclo completo sem aguardar aprovação:

- Criar branch → implementar → commitar → push → abrir Pull Request → merge automático

**Exemplos:**
- Atualização de documentação
- Correções pontuais de bug
- Novas funcionalidades isoladas (sem impacto em módulos compartilhados)
- Ajustes visuais no painel
- Testes e manutenção de baixo risco

**Limite:** a autonomia não autoriza ultrapassar o escopo solicitado.

### Categoria B — Alterações críticas (exigem autorização explícita)

A IA pode fazer diagnóstico e preparar proposta, mas **deve aguardar aprovação antes de executar**:

- Mudança de arquitetura ou divisão do monólito
- Refatoração estrutural
- Alteração da estrutura de diretórios
- Exclusão de funcionalidades existentes
- Alterações em mecanismos de autenticação
- Alterações na estrutura de armazenamento (`GM_setValue/getValue`)
- Modificações em mecanismos de segurança (criptografia, Pusher)
- Alterações no `@downloadURL` ou `@updateURL` (impacta todos os usuários)
- Mudanças em permissões ou configurações administrativas do GitHub
- Alterações em arquivos de workflows (`.github/workflows/`)
- Qualquer alteração que afete todos os usuários do script imediatamente

**A criação de uma tarefa por uma IA não constitui autorização para execução de alterações críticas.**

---

## 6. Regras de Git

### Proibido em qualquer circunstância

- Commitar diretamente na `main`
- Fazer push direto na `main`
- Executar `force push` sem autorização explícita
- Sobrescrever alterações de outras pessoas ou IAs
- Apagar branches ou histórico sem autorização
- Executar `git reset --hard` sem autorização
- Modificar permissões do repositório
- Criar tags de release manualmente (o workflow `release.yml` faz isso)
- Ignorar conflitos sem investigar a origem

### Obrigatório sempre

- Verificar o estado do Git antes de iniciar (`git status`, `git log --oneline -5`)
- Verificar os arquivos alterados antes do commit (`git diff --stat`)
- Trabalhar em branches temporárias
- Resolver conflitos compreendendo a causa antes de aceitar qualquer lado
- Criar branch a partir da `development` atualizada: `git checkout development && git pull`

### Sobre autenticação

As IAs usam a autenticação pessoal do responsável pelo desenvolvimento. O GitHub não distingue automaticamente ações de IA de ações humanas. Toda operação Git feita por uma IA é registrada como ação do usuário autenticado.

---

## 7. Padrão de branches

O projeto adota um fluxo com **duas branches permanentes** e branches temporárias por tarefa.

```
main         ←  produção — código estável, distribuído aos usuários via @updateURL
  ↑ PR aprovado e testado
development  ←  integração — todo trabalho passa por aqui antes de ir à main
  ↑ PR de branch temporária
  └── tipo/descricao-curta  (temporária, uma por tarefa)
```

### Branches permanentes

| Branch | Papel |
|---|---|
| `main` | Produção. Recebe apenas de `development`, via PR. Nunca diretamente. |
| `development` | Integração e testes. Toda implementação é mergeada aqui primeiro. |

### Branches temporárias

Criadas a partir de `development`, mergeadas de volta em `development` via PR.

**Prefixos obrigatórios:**

| Prefixo | Uso |
|---|---|
| `feature/` | Nova funcionalidade |
| `fix/` | Correção de erro |
| `docs/` | Documentação |
| `refactor/` | Refatoração autorizada |
| `chore/` | Manutenção e configurações |
| `hotfix/` | Correção urgente em produção (parte direto para `main`) |

### Regras

- **Criar sempre a partir de `development` atualizada:** `git checkout development && git pull`
- Uma branch por tarefa — não acumular múltiplas tarefas na mesma branch
- **Nunca commitar diretamente em `main` nem em `development`**
- Branches temporárias são removidas após o merge
- `hotfix/` é exceção: parte da `main` e é mergeado em `main` e `development`

---

## 8. Conventional Commits

Formato obrigatório:

```
tipo: descrição objetiva em minúsculas
```

**Tipos permitidos:**

| Tipo | Impacto SemVer | Quando usar |
|---|---|---|
| `feat` | MINOR | Nova funcionalidade |
| `fix` | PATCH | Correção de bug |
| `perf` | PATCH | Melhoria de desempenho |
| `docs` | — | Apenas documentação |
| `refactor` | — (ou MINOR/PATCH se funcional) | Refatoração |
| `chore` | — | Versão, configs, manutenção |
| `test` | — | Testes |
| `build` | — | Dependências, build |
| `ci` | — | GitHub Actions, automação |

**Mudança incompatível:** usar `BREAKING CHANGE:` no rodapé ou `!` após o tipo:
```
feat!: remover suporte ao formato antigo de exportação
```

**O título do Pull Request deve seguir o mesmo formato.**

---

## 9. Pull Requests e integração

### Alterações rotineiras (Categoria A)

```
1. Criar branch a partir de development atualizada
   git checkout development && git pull
   git checkout -b tipo/descricao-curta

2. Implementar dentro do escopo solicitado

3. Revisar o diff antes de commitar
   git diff --stat

4. Commit no formato Conventional Commits

5. Push e abrir PR → development (não main)

6. Workflows executam automaticamente:
   - validate-pr.yml → valida o PR
   - auto-merge.yml → ativa auto-merge (Squash)

7. Merge automático em development após todas as verificações passarem

8. Quando development estiver testado e estável:
   Abrir PR development → main para ir à produção
```

### Alterações críticas (Categoria B)

```
1. Preparar diagnóstico e proposta detalhada
2. Apresentar ao responsável e aguardar autorização explícita
3. Executar somente após aprovação — branch a partir de development
4. Abrir PR → development
5. Aguardar aprovação manual do responsável para o merge em development
6. Só vai para main após nova confirmação
```

**Squash Merge é o padrão** — um commit por PR.

---

## 10. Verificações obrigatórias (checklist pré-commit)

- [ ] O diff contém apenas alterações do escopo solicitado?
- [ ] Nenhuma funcionalidade existente foi removida sem autorização?
- [ ] Nenhuma variável global (`CONFIG`, `PADRAO`, `PAGINA`) foi alterada sem necessidade?
- [ ] Novas chaves de armazenamento foram adicionadas à tabela do item 15?
- [ ] O HTML do painel usa `$('#id')` (não `document.querySelector`)?
- [ ] Novos timeouts usam `CONFIG` (não valores hard-coded)?
- [ ] Novas funções de módulo usam o prefixo correto?
- [ ] O arquivo `docs/script/` correspondente foi atualizado se necessário?
- [ ] `@downloadURL` e `@updateURL` não foram alterados?
- [ ] `'use strict'` não foi removido?
- [ ] Arquivos de workflows (`.github/workflows/`) não foram alterados? (Categoria B)

---

## 11. Tratamento de falhas

**Política: bloqueio por padrão.**

Quando uma verificação ou teste falhar:

1. Identificar qual verificação falhou
2. Investigar a causa
3. Determinar se é relacionada à alteração realizada
4. **Se relacionada:** corrigir antes de prosseguir
5. **Se não relacionada:** documentar a evidência de que não é relacionada
6. Avaliar o risco — falhas desconhecidas ou inconclusivas não podem ser ignoradas
7. Permitir exceção somente com justificativa técnica defensável

**Nunca:**
- Ignorar falhas para facilitar o merge
- Desabilitar verificações sem autorização
- Assumir que uma falha pré-existente justifica deixar outra passar

---

## 12. Versionamento SemVer

O campo `@version` no cabeçalho do script é a única fonte da versão. Não duplicar em nenhum outro lugar.

**Regras de incremento (aplicadas automaticamente pelo `release.yml`):**

| Tipo de commit | Incremento |
|---|---|
| `feat` | MINOR (ex.: 13.22 → 13.23.0) |
| `fix`, `perf` | PATCH (ex.: 13.22 → 13.22.1) |
| `BREAKING CHANGE` | MAJOR (ex.: 13.22 → 14.0.0) |
| `docs`, `chore`, `test`, `ci`, `refactor` sem impacto funcional | nenhum |

Atualizar o `@version` manualmente acompanhado de `chore: versão X.Y.Z` a cada release.

> **Pendência:** sincronização automática do `@version` com o SemVer calculado pelo workflow ainda não implementada.

---

## 13. GitHub Actions e fluxo automatizado

### Workflows disponíveis

| Arquivo | Trigger | Responsabilidade |
|---|---|---|
| `.github/workflows/validate-pr.yml` | `pull_request` → `main` | Valida título, arquivos protegidos, integridade do script, conflitos. Bloqueia Categoria B. |
| `.github/workflows/auto-merge.yml` | Após `Validate PR` ter sucesso | Ativa auto-merge Squash via API. |
| `.github/workflows/release.yml` | `push` → `main` | Calcula SemVer, atualiza `CHANGELOG.md`, cria tag e GitHub Release. |

### Fluxo completo

```
branch → commit → push → PR aberto
  ↓
validate-pr.yml:
  ✅ título Conventional Commits
  ✅ nenhum arquivo de infraestrutura alterado
  ✅ @downloadURL/@updateURL intactos
  ✅ 'use strict' e IIFE presentes
  ✅ sem conflitos
  ↓
auto-merge.yml ativa Squash Merge
  ↓ (após branch protection)
Squash Merge na main
  ↓
release.yml: feat→MINOR | fix/perf→PATCH | BREAKING→MAJOR
  → CHANGELOG.md atualizado
  → tag vX.Y.Z criada
  → GitHub Release publicada
```

### O que os workflows NÃO fazem

- Não modificam o `@version` do script automaticamente
- Não publicam em serviços externos
- Não geram release para `docs`, `chore`, `test`, `ci`, `refactor`

### Configurações necessárias pelo proprietário

Ver `.github/SETUP.md` para o passo a passo. Resumo:

| Configuração | Status |
|---|---|
| "Allow auto-merge" em Settings > General | ⏳ Pendente |
| Branch protection da `main` com status check `Validar alterações` | ⏳ Pendente |
| "Read and write permissions" para o GITHUB_TOKEN | ⏳ Pendente |
| "Allow GitHub Actions to create and approve pull requests" | ⏳ Pendente |
| Squash Merge como único método | ⏳ Pendente |

---

## 14. Segurança e proteção de dados

- **`senhasContas`** — armazena senhas no Tampermonkey, que não é criptografado. Nunca expor em logs.
- **`equipeSecret` e `equipeChave`** — idem. Nunca exibir valores.
- **`@updateURL` aponta para `main`** — qualquer merge na `main` distribui para todos os usuários.
- **`PAGINA.eval()`** — usado no módulo CCBs. Frágil se o site adicionar CSP restritivo.
- **Diagnósticos (`debug`)** — nunca incluem valores pessoais.

---

## 15. Arquitetura interna do script

### Ponto de entrada

```javascript
if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
else if (window.top === window) iniciarPainel();
```

### Mapa de seções internas

| Bloco | Responsabilidade |
|---|---|
| Cabeçalho (linhas 1–23) | Metadados Tampermonkey, permissões, dependências |
| Constantes globais | `VERSAO`, `CONFIG`, `PAGINA`, `PADRAO`, `cfg`, `sleep` |
| Leitura da árvore | Funções de coleta React/DOM do motor MobFacil |
| `iniciarMotor()` | Navegação automática na árvore do iframe |
| `iniciarPainel()` | Painel completo — contém todos os módulos abaixo |
| → CCBs | Download de CCBs em lote |
| → Contas | Troca rápida de conta, `contaAtiva()` |
| → Gerador de Negociações (`ng`) | Formulário + geração de textos |
| → Lembretes (`lb`) | Pagamentos parciais v2 |
| → Consulta CAC (`cac`) | Leitura da Central de Atendimento |
| → Atendimento (`at`) | Negociação e Renegociação |
| → Timers (`tm`) | Agendamentos de expediente |
| → Navegação/Aparência | Nova UI / UI Antiga |
| → Equipe (`eq`) | Pusher, criptografia AES-GCM |
| → Histórico (`hs`) | Acordos registrados |
| → Busca de cliente (`bs`) | Central de busca (somente leitura) |
| → Navegação automática | Troca de tela automática no ER |
| → Relatório de Pendências (`pd`) | Fila de Pendências da conta master (somente leitura) |
| → RD Atendimento (`rd`) | Análise com Gemini e encerramento do dia |

### Variáveis globais compartilhadas

| Nome | Tipo | Descrição |
|---|---|---|
| `VERSAO` | string | Versão lida via `GM_info` |
| `CONFIG` | objeto | Todos os timeouts e limites |
| `PAGINA` | objeto | `unsafeWindow` — acesso ao JS do site |
| `PADRAO` | objeto | Valores padrão das preferências |
| `cfg(k)` | função | Lê preferência com fallback para `PADRAO` |
| `sleep(ms)` | função | Aguarda N ms via Web Worker |

### Prefixos de funções por módulo

| Prefixo | Módulo |
|---|---|
| `ng` | Gerador de Negociações |
| `at` | Atendimento |
| `lb` | Lembretes |
| `tm` | Timers |
| `cac` | Consulta CAC |
| `ccb` | CCBs |
| `eq` | Equipe (Pusher) |
| `hs` | Histórico |
| `bs` | Busca de cliente |
| `pd` | Relatório de Pendências |
| `rd` | RD Atendimento |

### Seletor interno do painel

```javascript
const $ = s => painel.querySelector(s);  // dentro de iniciarPainel()
```

**Nunca usar `document.querySelector` dentro do painel.**

### Chaves de armazenamento

Documentar novas chaves aqui antes de usar. Renomear sem migração quebra dados de usuários reais.

| Chave | Conteúdo | Módulo |
|---|---|---|
| `dados` | `{ [id]: { qtd, val, score, consultas, cpf, reprov } }` | Motor/Coleta |
| `debug` | Snapshots de diagnóstico | Motor |
| `fila` / `feitas` / `ignoradas` / `verificadas` | Controle da fila | Coleta |
| `rodando` / `batida` / `atualId` / `fim` | Estado da coleta | Coleta |
| `modo` | `'coleta' \| 'aprovadas' \| 'reprovadas'` | Coleta |
| `mfLembretes` | `{ versao: 2, itens: [...] }` | Lembretes |
| `mfLembretesAviso` | Estado do pop-up | Lembretes |
| `mfAcordos` | `{ versao: 1, itens: [...] }` | Histórico |
| `equipeNome/Secret/Chave/Ativa/Id` | Config da equipe | Equipe |
| `equipeOnline/Versao/Avisos/AvisosVistos` | Estado da equipe | Equipe |
| `senhasContas` | Senhas das contas | Contas |
| `negModelos/negModalidade/negModeloAtual/negPagamento` | Negociação | Negociação |
| `atModelo` | Modelo ativo | Atendimento |
| `abaPainel/posPainel/tamPainel/tamAmpliado/min` | Interface | Interface |
| `navAuto` | Navegação automática | Navegação |
| `tmExpediente/tmVolume` | Config de timers | Timers |
| `geminiChave/geminiModelo` | Chave e modelo Gemini | RD |
| `rdAnalises/rdLinhas/erBase` | Dados do RD | RD |
| `gruposCfg/buscaAberta/buscaComCac` | Config e busca | Config/Busca |
| `pdRecolhido` | Seção Pendências recolhida (padrão: sim) | Relatório de Pendências |

---

## 16. Padrões de código obrigatórios

- IIFE única: `(function () { 'use strict'; ... })();`
- Indentação: 2 espaços
- Seções: `/* ================= NOME ================= */`
- Logs: prefixo `[PaymobiFin]` em todos
- Erros esperados: `catch (_) {}` (silencioso)
- Erros críticos: `catch (e) { console.warn('[PaymobiFin] módulo', e && e.message); }`
- Esperas em loops: `sleep(ms)` (nunca `setTimeout` direto)
- Timeouts: sempre em `CONFIG`
- Acessos ao site: sempre em `try/catch`
- Seletor do painel: `$()` (não `document.querySelector`)

---

## 17. Comportamento diante de conflitos de merge

1. Nunca aceitar um lado automaticamente sem entender o contexto
2. Identificar a origem de cada conflito (qual branch, qual commit)
3. Resolver mantendo a funcionalidade mais recente e completa
4. Conflitos envolvendo armazenamento ou criptografia: **interromper e consultar** o responsável

---

## 18. Documentação — quando atualizar

| Arquivo | Atualizar quando |
|---|---|
| `instructions.md` | Novo módulo, novo prefixo, nova chave, nova regra |
| `README.md` | Mudança visível ao usuário, nova dependência |
| `docs/script/<módulo>.md` | Mudança de comportamento, nova função |
| `CHANGELOG.md` | Gerado automaticamente pelo `release.yml` |
| `.github/SETUP.md` | Mudança nos workflows ou requisitos de configuração |

---

## 19. Comportamento diante de falha no auto-merge

Se o auto-merge não funcionar (workflow de validação falhou, branch protection não configurada,
permissões insuficientes):

1. **Não forçar o merge manualmente** — investigar a causa
2. Verificar o log do workflow no GitHub Actions
3. Se for falha de configuração (pendência do proprietário): documentar e aguardar
4. Se for falha no código: corrigir na branch e fazer novo push
5. O merge só acontece quando **todas** as verificações passam

---

## 20. Checklist obrigatório antes de finalizar uma tarefa

**Escopo**
- [ ] Implementação dentro do escopo solicitado?
- [ ] Nenhuma funcionalidade fora do escopo alterada?

**Código**
- [ ] `'use strict'` presente?
- [ ] `@downloadURL` e `@updateURL` não alterados?
- [ ] Novos timeouts em `CONFIG`?
- [ ] Funções com prefixo correto?
- [ ] `$()` usado dentro do painel?
- [ ] Acessos a `PAGINA.*` em `try/catch`?
- [ ] `sleep()` em loops de espera?
- [ ] Nenhum arquivo de workflow alterado sem autorização?

**Armazenamento**
- [ ] Novas chaves documentadas na tabela do item 15?
- [ ] Nenhuma chave renomeada sem migração?
- [ ] Dados existentes não sobrescritos?

**Git**
- [ ] Em branch temporária (não na `main`)?
- [ ] Commit segue Conventional Commits?
- [ ] Diff revisado antes do commit?
- [ ] Nenhum arquivo fora do escopo incluído?

**Documentação**
- [ ] `docs/script/<módulo>.md` atualizado?
- [ ] `instructions.md` atualizado se novo prefixo/chave criado?
- [ ] `README.md` atualizado se comportamento visível mudou?

**Ao finalizar, apresentar:**
1. Arquivos alterados
2. Chaves de armazenamento afetadas
3. Módulos com impacto indireto
4. Documentação atualizada
5. Pendências (bugs fora do escopo, configurações do proprietário)

---

## 21. Configurações pendentes do proprietário (arthursoaress7)

Ver `.github/SETUP.md` para o passo a passo completo.

| Item | Por que é necessário |
|---|---|
| Habilitar "Allow auto-merge" | O `auto-merge.yml` não consegue ativar sem isso |
| Proteção da `main` com status check obrigatório | Garante que o merge só ocorre após validação |
| Permissões do GITHUB_TOKEN (read/write) | `release.yml` precisa criar tags e releases |
| "Allow Actions to create PRs" | `auto-merge.yml` precisa chamar a mutation GraphQL |
| Squash Merge como único método | Mantém histórico limpo |
| Definir destino da branch `development` | Evitar confusão no fluxo |

**Riscos sem essas configurações:**
1. Push direto na `main` distribui para todos os usuários imediatamente (sem validação)
2. Auto-merge não funciona sem "Allow auto-merge" habilitado
3. Releases não são criadas automaticamente sem permissões de escrita
