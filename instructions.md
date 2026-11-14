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

**Arquivo-ponte:** `automacaomobfacil.user.js` é o nome antigo do script. Ficou congelado na v13.27.2 (cópia idêntica, já com `@downloadURL`/`@updateURL` apontando para o arquivo novo) só para migrar as instalações antigas: o Tampermonkey de quem instalou pelo endereço antigo baixa a 13.27.2 e passa a seguir o arquivo novo. **Não editar** — toda alteração vai em `paymobifin-assistente.user.js`. Remoção prevista em `PRIORIDADES.md` (P4.8).

**Versão atual:** 13.29.2 (fonte de verdade: campo `@version` no cabeçalho do script — ver item 12)

**Repositório:** `git@github.com:arthursoaress7/PaymobiFin-Assistente.git`  
**Proprietário do repositório:** arthursoaress7 (pode ter permissões administrativas que o usuário atual não tem)

---

## 2. Prioridades atuais

1. **Manter o sistema funcionando** — preservar toda funcionalidade existente
2. **Consolidar o acesso aos dados do ER** — uma camada única (`er`) que funcione como API para o resto do script e elimine a dependência da tela ao vivo (P0 do `PRIORIDADES.md`, decisão de 11/11/2026; regras no item 23)
3. **Estabelecer padrões de desenvolvimento** — governança, versionamento, documentação
4. **Não refatorar** — a divisão do monólito não está no escopo atual; a camada `er` fica dentro do monólito, numa seção própria

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
- Desenho e implementação da camada base de acesso ao ER (P0.2, P0.3) e leitura do motor MobFacil por outra via (P0.6)
- Qualquer requisição ao ER que altere dados (a camada `er` é somente leitura)
- Alterações em `@connect`, `@grant` ou `@match` no cabeçalho do script
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

6. validate-pr.yml valida o PR e, se for Categoria A, faz o merge automático (Squash)

7. A cada merge na development, o workflow "Preparar release" abre ou atualiza
   o PR de release (release/proxima → main) com @version, documentação e CHANGELOG

8. Quando development estiver testada e estável:
   o responsável integra o PR de release (um clique). Não abrir PR development → main à mão
```

### Alterações críticas (Categoria B)

```
1. Preparar diagnóstico e proposta detalhada
2. Apresentar ao responsável e aguardar autorização explícita
3. Executar somente após aprovação — branch a partir de development
4. Abrir PR → development (a validação classifica como Categoria B quando altera
   workflows, .github/scripts, package.json ou o arquivo-ponte: sem merge automático)
5. Aguardar aprovação manual do responsável para o merge em development
6. Só vai para main após nova confirmação (pelo PR de release)
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
- [ ] Se o `@version` mudou, a versão atual foi atualizada nos locais listados no item 12?
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

O campo `@version` no cabeçalho de `paymobifin-assistente.user.js` é a fonte de verdade da versão.

**Versão na documentação:**

- A documentação só pode exibir a versão atual nestes locais:

  | Arquivo | Local |
  |---|---|
  | `README.md` | Linha `**Versão atual:**` no topo |
  | `instructions.md` | Linha `**Versão atual:**` do item 1 |
  | `CLAUDE.md` | Linha `Versão atual` da tabela "Contexto rápido" |
  | `docs/script/01-visao-geral.md` | Linha `**Versão atual:**` no cabeçalho |
  | `docs/script/03-painel-interface.md` | Barra de título no desenho "Estrutura do painel" (`vX.Y.Z`) |

- Sempre que o `@version` mudar, a IA ou o desenvolvedor atualiza todos esses locais no mesmo commit/PR.
- A versão da documentação nunca pode divergir do `@version`.
- Não acrescentar a versão atual em outros lugares; se for preciso, incluir o novo local nesta tabela no mesmo PR.
- Referências históricas (ex.: "Concluído (v13.27.0)", "congelado na v13.27.2"), os exemplos de incremento abaixo e o `CHANGELOG.md` não são "versão atual" e não seguem esta regra.

**Regras de incremento (aplicadas automaticamente pelo `release.yml`):**

| Tipo de commit | Incremento |
|---|---|
| `feat` | MINOR (ex.: 13.22 → 13.23.0) |
| `fix`, `perf` | PATCH (ex.: 13.22 → 13.22.1) |
| `BREAKING CHANGE` | MAJOR (ex.: 13.22 → 14.0.0) |
| `docs`, `chore`, `test`, `ci`, `refactor` sem impacto funcional | nenhum |

O incremento é calculado no **PR de release** (workflow "Preparar release", script `.github/scripts/preparar_release.py`), que atualiza o `@version`, os locais da tabela acima e o `CHANGELOG.md` antes do merge na `main`. **Não** fazer mais commits manuais `chore: versão X.Y.Z`: as branches de tarefa não mudam o `@version`.

---

## 13. GitHub Actions e fluxo automatizado

### Workflows disponíveis

| Arquivo | Trigger | Responsabilidade |
|---|---|---|
| `.github/workflows/validate-pr.yml` | PR para `main`, `development` ou `feature/**` | Valida título, origem (PR para a `main` só de `development`, `release/proxima` ou `hotfix/*`), conflitos, integridade e sintaxe do script (`node --check`) e versão da documentação. Classifica Categoria A/B. Job **Merge automático**: Categoria A para `development`/`feature/**` é integrada sozinha (Squash; sincronização `main` → `development` por merge commit). |
| `.github/workflows/release-pr.yml` ("Preparar release") | `push` → `development` | Abre ou atualiza o PR de release `release/proxima` → `main` com a próxima versão, documentação e `CHANGELOG.md` (`.github/scripts/preparar_release.py`). Fecha o PR se não houver nada novo. |
| `.github/workflows/release.yml` | `push` → `main` | Cria a tag `vX.Y.Z` (do `@version`) e a GitHub Release com as notas do `CHANGELOG.md`. Abre o PR "chore: sincroniza main na development" quando a `main` tem commits que a `development` não tem. Não faz commits na `main`. |

### Fluxo completo

```
branch de tarefa → PR → development
  ↓ validate-pr.yml (Validar alterações)
  ↓ Categoria A → Merge automático (Squash)          Categoria B → merge manual
development
  ↓ release-pr.yml (Preparar release)
PR release/proxima → main   (versão, documentação e CHANGELOG já calculados)
  ↓ merge manual pelo responsável (um clique)
main → Tampermonkey de todos os usuários
  ↓ release.yml: tag vX.Y.Z + GitHub Release
  ↓ PR "chore: sincroniza main na development" → merge automático
```

- **A `main` nunca tem merge automático.** Cada merge nela chega na hora a toda a equipe.
- **Rótulo `sem-auto-merge`:** impede o merge automático de um PR específico.
- **Incremento:** `feat` → MINOR · `fix`/`perf` → PATCH · `!`/`BREAKING CHANGE` → MAJOR · demais → nenhum (o PR de release se chama "chore: integrar development na main").

### Token `RELEASE_TOKEN`

PRs e merges feitos com o `GITHUB_TOKEN` padrão não disparam outros workflows. Por isso o merge automático, o PR de release e o PR de sincronização usam o secret `RELEASE_TOKEN` (token pessoal do proprietário). Sem ele, os workflows funcionam com o `GITHUB_TOKEN`, mas: o merge na `development` não abre o PR de release, e os PRs de release e de sincronização ficam sem a verificação "Validar alterações".

### Configurações necessárias pelo proprietário

Ver `.github/SETUP.md`.

---

## 14. Segurança e proteção de dados

- **`senhasContas`** — armazena senhas no Tampermonkey, que não é criptografado. Nunca expor em logs.
- **`equipeSecret` e `equipeChave`** — idem. Nunca exibir valores.
- **`@updateURL` aponta para `main`** — qualquer merge na `main` distribui para todos os usuários.
- **`PAGINA.eval()`** — usado no módulo CCBs. Frágil se o site adicionar CSP restritivo.
- **Diagnósticos (`debug`)** — nunca incluem valores pessoais.
- **Acesso ao ER (camada `er`)** — a autenticação é o cookie de sessão do ER. Nenhum cookie, cabeçalho de sessão ou resposta do ER é gravado em `GM_setValue`, exibido no painel, enviado pelo Pusher ou registrado em log/diagnóstico. Ao mapear rotas (DevTools, HAR), remover `Cookie` e dados pessoais de clientes antes de registrar ou compartilhar.

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
| `er` | Acesso ao ER (sessão, base, requisições; camada consolidada na P0) |

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
| `docs/script/13-api-er.md` | Rota do ER mapeada, alterada ou migrada para a camada `er` (criado na P0.1) |
| `docs/PLANO-API-ER.md` | Status das fases da P0 |
| `CHANGELOG.md` | Gerado automaticamente no PR de release (`release-pr.yml`) |
| `.github/SETUP.md` | Mudança nos workflows ou requisitos de configuração |
| Locais de versão listados no item 12 | Sempre que o `@version` mudar (mesmo commit/PR) |

---

## 19. Comportamento diante de falha no merge automático

Se o merge automático não acontecer (validação falhou, Categoria B, rótulo `sem-auto-merge`, configuração pendente):

1. **Não forçar o merge manualmente** — investigar a causa no log do workflow (GitHub Actions)
2. Validação falhou por causa do código ou do título: corrigir na branch e fazer novo push (ou editar o título)
3. Categoria B: é intencional — aguardar o responsável
4. Falha de configuração (pendência do proprietário): documentar e aguardar
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
- [ ] Se o `@version` mudou, a versão atual foi atualizada nos locais listados no item 12?

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
| Secret `RELEASE_TOKEN` (token pessoal) | Para os PRs e merges feitos pelos workflows dispararem a validação e o "Preparar release" |
| Habilitar "Allow auto-merge" | Merge automático espera as verificações em vez de integrar direto |
| "Read and write permissions" e "Allow GitHub Actions to create and approve pull requests" | Workflows criam PRs, tags e releases |
| Proteção da `main` e da `development` com status check `Validar alterações` | Garante que nada entra sem validação, nem por merge manual |

**Riscos sem essas configurações:**
1. Sem proteção, um merge manual na `main` com a validação reprovada ainda passa (aconteceu nos PRs #43 e #44)
2. Sem `RELEASE_TOKEN`, o PR de release não é aberto depois do merge automático na `development`

---

## 23. Consolidação do acesso ao ER (P0)

Decisão do responsável em 11/11/2026. Plano em `docs/PLANO-API-ER.md`; tarefas em `PRIORIDADES.md`, P0.

**Contexto:** o ER (ASP.NET MVC) monta o HTML no servidor. O script já busca a maior parte dos dados direto nas rotas do ER com o cookie de sessão e lê o HTML devolvido com `DOMParser`; poucas rotas devolvem JSON. A P0 junta essas requisições em uma camada única e tira do caminho principal o que ainda depende da tela ao vivo.

**Branch:** todo o trabalho da P0 acontece em `feature/api-er` (criada a partir de `development`). Sub-branches partem dela e voltam por PR; a `development` é trazida para ela periodicamente; a integração final é um PR `feature/api-er` → `development`. Os workflows não validam PRs para `feature/api-er`: as verificações do item 10 são feitas manualmente e registradas no PR.

**Regras para a camada e para cada módulo migrado:**

- Somente leitura.
- Novas leituras de dados do ER passam por `erBuscar` e por um leitor da rota; não criar novas requisições soltas nem novos seletores espalhados nos módulos.
- Resultado gerado pelo módulo idêntico ao de antes (comparar com casos reais antes do merge).
- O caminho antigo continua disponível até a remoção formal (P0.8).
- Estrutura inesperada na resposta gera aviso identificando a rota, nunca dado errado gravado.
- Sessão expirada, tempo esgotado e conta sem acesso continuam avisando, nunca erro silencioso.
- Nomes novos não podem colidir com as funções `er*` e com a chave `erBase` já existentes.
- Rotas de outro domínio (motor MobFacil) que exijam `@connect` são Categoria B.
