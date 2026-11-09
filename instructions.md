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

**Arquivo de código:** `automacaomobfacil.user.js` — único arquivo JavaScript, ~8.300 linhas, sem transpilador ou bundler.

**Versão atual:** 13.22 (campo `@version` no cabeçalho do script — única fonte da versão)

**Repositório:** `git@github.com:arthursoaress7/Mobfacil-Automator.git`  
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

- **Não dividir `automacaomobfacil.user.js` em múltiplos arquivos**
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

- Criar branch → implementar → commitar → push → abrir Pull Request

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
- Criar tags de release manualmente
- Ignorar conflitos sem investigar a origem

### Obrigatório sempre

- Verificar o estado do Git antes de iniciar (`git status`, `git log --oneline -5`)
- Verificar os arquivos alterados antes do commit (`git diff --stat`)
- Trabalhar em branches temporárias
- Resolver conflitos compreendendo a causa antes de aceitar qualquer lado

### Sobre autenticação

As IAs usam a autenticação pessoal do responsável pelo desenvolvimento. O GitHub não distingue automaticamente ações de IA de ações humanas. Toda operação Git feita por uma IA é registrada como ação do usuário autenticado.

---

## 7. Padrão de branches (GitHub Flow)

```
main  ←  única branch permanente, sempre estável
  └── tipo/descricao-curta  (temporária, por tarefa)
```

**Prefixos obrigatórios:**

| Prefixo | Uso |
|---|---|
| `feature/` | Nova funcionalidade |
| `fix/` | Correção de erro |
| `docs/` | Documentação |
| `refactor/` | Refatoração autorizada |
| `chore/` | Manutenção e configurações |
| `hotfix/` | Correção urgente |

**Regras:**
- Criar sempre a partir da `main` atualizada: `git checkout main && git pull`
- Uma branch por tarefa — não acumular múltiplas tarefas na mesma branch
- Remover após o merge

> **Nota:** a branch `development` existe no repositório mas não é o fluxo adotado. O `@updateURL` do script aponta para `main`. Novas tarefas devem usar o padrão acima.

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
1. Criar branch a partir da main atualizada
2. Implementar dentro do escopo solicitado
3. Revisar o diff antes de commitar
4. Push da branch
5. Abrir PR com título no formato Conventional Commits
6. Integrar via Squash Merge após verificações
```

### Alterações críticas (Categoria B)

```
1. Preparar diagnóstico e proposta detalhada
2. Apresentar ao responsável e aguardar autorização explícita
3. Executar somente após aprovação
4. Abrir PR
5. Integrar somente após nova confirmação do responsável
```

**Squash Merge é o padrão** — mantém histórico da `main` organizado (um commit por feature/fix).

---

## 10. Verificações obrigatórias antes de commitar

Checklist que a IA deve executar antes de qualquer commit:

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
- Desabilitar verificações temporariamente sem autorização
- Assumir que uma falha pré-existente justifica deixar outra passar

---

## 12. Versionamento SemVer

O campo `@version` no cabeçalho do script é a única fonte da versão. Não duplicar em nenhum outro lugar.

**Regras de incremento:**

| Tipo de commit | Incremento |
|---|---|
| `feat` | MINOR (ex.: 13.22 → 13.23) |
| `fix`, `perf` | PATCH (ex.: 13.22 → 13.22.1) |
| `BREAKING CHANGE` | MAJOR (ex.: 13.22 → 14.0.0) |
| `docs`, `chore`, `test`, `ci`, `refactor` sem impacto funcional | nenhum |

Atualizar o `@version` acompanhado de um commit `chore: versão X.Y.Z`.

---

## 13. GitHub Actions e releases (situação atual e planejada)

**Estado atual:** não há workflows ou Actions configurados. Não há tags de release no repositório.

**Planejado:** avaliar `semantic-release` para:
1. Detectar commits desde a última versão
2. Calcular o incremento SemVer automaticamente
3. Atualizar `CHANGELOG.md`
4. Criar tag Git e GitHub Release
5. Sincronizar o campo `@version` do script sem quebrar o código funcional

**Antes de implementar Actions:**
- Confirmar permissões disponíveis com o proprietário do repositório (arthursoaress7)
- Verificar proteção existente da `main`
- Confirmar se a conta tem permissão para criar releases e tags
- Não presumir acesso administrativo

**Não implementar** publicação automática do script em serviços externos sem autorização.  
**Não presumir** que criar uma GitHub Release atualiza automaticamente os usuários — isso é feito pelo `@updateURL` do Tampermonkey, que aponta para a `main`.

---

## 14. Segurança e proteção de dados

- **`senhasContas`** — armazena senhas no Tampermonkey, que não é criptografado. Quem acessa o perfil do navegador pode ler. Não expor em logs ou diagnósticos.
- **`equipeSecret` e `equipeChave`** — idem. Nunca exibir valores, apenas confirmar existência.
- **`@updateURL` aponta para `main`** — qualquer push na `main` atualiza todos os usuários com auto-update ativo. Testar antes de integrar.
- **`PAGINA.eval()`** — usado no módulo de CCBs para acessar `DetalhePropostaDocumentos`. Frágil se o site adicionar CSP restritivo.
- **Diagnósticos (`debug`)** — nunca incluem valores pessoais; apenas nomes de campos e valores numéricos de interesse.

---

## 15. Arquitetura interna do script

### Ponto de entrada

```javascript
// Últimas linhas do arquivo
if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
else if (window.top === window) iniciarPainel();
```

- `enviamotor.mobfacil.com.br` → `iniciarMotor()` (coleta dados da árvore)
- `paymobi.ercard.com.br` → `iniciarPainel()` apenas na janela principal (não em iframes)

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
| → RD Atendimento (`rd`) | Análise com Gemini e encerramento do dia |

### Variáveis globais compartilhadas (impacto em todo o script)

| Nome | Tipo | Descrição |
|---|---|---|
| `VERSAO` | string | Versão do script lida via `GM_info` |
| `CONFIG` | objeto | Todos os timeouts e limites — nunca hard-code fora daqui |
| `PAGINA` | objeto | `unsafeWindow` — acesso ao JS do site |
| `PADRAO` | objeto | Valores padrão das preferências |
| `cfg(k)` | função | Lê preferência com fallback para `PADRAO` |
| `sleep(ms)` | função | Aguarda N ms via Web Worker — usar sempre em loops |

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
| `rd` | RD Atendimento |

### Seletor interno do painel

```javascript
const $ = s => painel.querySelector(s);  // definido dentro de iniciarPainel()
```

`$('#mf-id')` busca dentro do painel. **Nunca usar `document.querySelector` dentro do painel** — pode capturar elementos do próprio site.

### Chaves de armazenamento (`GM_setValue/getValue`)

Adicionar novas chaves a esta tabela antes de usar. Modificar chaves existentes sem migração quebra dados de usuários reais.

| Chave | Conteúdo | Módulo |
|---|---|---|
| `dados` | `{ [id]: { qtd, val, score, consultas, cpf, reprov } }` | Motor/Coleta |
| `debug` | Snapshots de diagnóstico por proposta | Motor |
| `fila` | `[id, ...]` propostas a coletar | Coleta |
| `feitas` | `[id, ...]` já coletadas | Coleta |
| `ignoradas` | `{ id: 'teste' \| 'cancelada' }` | Coleta |
| `verificadas` | `[id, ...]` conferidas na tabela | Coleta |
| `rodando` | boolean — coleta ativa | Coleta |
| `batida` | timestamp — heartbeat da aba | Coleta |
| `atualId` | ID da proposta em coleta | Coleta |
| `fim` | sinal de fim do motor | Motor→Painel |
| `modo` | `'coleta' \| 'aprovadas' \| 'reprovadas'` | Coleta |
| `mfLembretes` | `{ versao: 2, itens: [...], invalidos: [...] }` | Lembretes |
| `mfLembretesAviso` | estado do pop-up de lembretes | Lembretes |
| `mfAcordos` | `{ versao: 1, itens: [...] }` | Histórico |
| `equipeNome/Secret/Chave/Ativa/Id` | config da equipe | Equipe |
| `equipeOnline/Versao/Avisos/AvisosVistos/Lider/Limpeza` | estado da equipe | Equipe |
| `senhasContas` | senhas das contas (não criptografado) | Contas |
| `negModelos/negModalidade/negModeloAtual/negPagamento` | negociação | Negociação |
| `atModelo` | modelo ativo no Atendimento | Atendimento |
| `abaPainel` | aba ativa no painel | Interface |
| `posPainel/tamPainel/tamAmpliado/min` | posição e tamanho | Interface |
| `navAuto` | navegação automática | Navegação |
| `tmExpediente/tmVolume` | config de timers | Timers |
| `geminiChave/geminiModelo` | chave e modelo Gemini | RD Atendimento |
| `rdAnalises/rdLinhas` | análises e planilha do RD | RD Atendimento |
| `erBase` | endereço do ER (gravado pelo painel) | RD Atendimento |
| `gruposCfg` | grupos abertos/fechados na config | Config |
| `buscaAberta/buscaComCac` | estado da busca de cliente | Busca |

---

## 16. Padrões de código obrigatórios

### Estrutura

- IIFE única: `(function () { 'use strict'; ... })();`
- Indentação: 2 espaços
- Seções delimitadas: `/* ================= NOME ================= */`

### Tratamento de erros

- `catch (_) {}` — silencioso, quando o erro é esperado (site pode mudar)
- `catch (e) { console.warn('[PaymobiFin] módulo', e && e.message); }` — para loops críticos
- `class ErroXXX extends Error` — para módulos com fluxo de erro estruturado (ex.: `ErroCCB`)
- Prefixo obrigatório em todos os logs: `[PaymobiFin]`

### Assincronicidade

- Usar `sleep(ms)` (não `setTimeout`) em todos os loops de espera — resolve problema de abas em segundo plano
- Funções com espera devem ser `async/await`
- Timeouts de rede: usar `AbortController` + `clearTimeout`

### Interação com o site

- Sempre envolver acessos a `PAGINA.*` em `try/catch`
- Verificar existência antes de chamar: `if (typeof PAGINA.MostraConsulta === 'function')`

### Armazenamento

- Nunca sobrescrever dado existente sem verificar — seguir o padrão de `salvar()`
- Estruturas versionadas: incrementar `VERSAO` interno e implementar migração automática

---

## 17. Comportamento diante de conflitos de merge

1. **Nunca aceitar um lado automaticamente** sem entender o que cada versão faz
2. Identificar a origem de cada conflito (qual commit criou cada versão)
3. Resolver mantendo a funcionalidade mais recente e mais completa
4. Se o conflito envolver armazenamento ou criptografia, **interromper e consultar** o responsável
5. Testar o comportamento após a resolução

---

## 18. Documentação — quando e o que atualizar

| Arquivo | Atualizar quando |
|---|---|
| `instructions.md` | Novo módulo, novo prefixo, nova chave de armazenamento, mudança de padrão, nova regra de governança |
| `README.md` | Mudança de comportamento visível ao usuário, nova dependência, mudança no processo de instalação |
| `docs/script/01-visao-geral.md` | Novo módulo adicionado ao script |
| `docs/script/<módulo>.md` | Mudança de comportamento, nova função, nova chave de armazenamento no módulo |

Regras:
- Não duplicar informações — referenciar com link
- Atualizar documentação **na mesma sessão** que a alteração de código
- Usar exemplos reais do código, não exemplos inventados
- O `README.md` é para o usuário/desenvolvedor humano — este arquivo é para IAs e mantenedores técnicos

---

## 19. Checklist obrigatório antes de finalizar uma tarefa

Execute este checklist antes de todo push e antes de abrir todo PR:

**Escopo**
- [ ] A implementação está dentro do escopo solicitado?
- [ ] Nenhuma funcionalidade fora do escopo foi alterada?
- [ ] Nenhum bug fora do escopo foi "corrigido" silenciosamente?

**Código**
- [ ] `'use strict'` está presente?
- [ ] `@downloadURL` e `@updateURL` não foram alterados?
- [ ] Novos timeouts usam `CONFIG`?
- [ ] Novas funções de módulo usam o prefixo correto?
- [ ] `$()` é usado dentro do painel (não `document.querySelector`)?
- [ ] Novos acessos a `PAGINA.*` estão em `try/catch`?
- [ ] `sleep()` é usado em loops de espera (não `setTimeout` direto)?

**Armazenamento**
- [ ] Novas chaves de armazenamento foram documentadas na tabela do item 15?
- [ ] Nenhuma chave existente foi renomeada sem migração?
- [ ] Dados existentes não são sobrescritos pela nova lógica?

**Git**
- [ ] Está em uma branch temporária (não na `main`)?
- [ ] O commit segue o formato Conventional Commits?
- [ ] O diff foi revisado antes do commit?
- [ ] Nenhum arquivo fora do escopo foi incluído no commit?

**Documentação**
- [ ] `docs/script/<módulo>.md` foi atualizado se necessário?
- [ ] `instructions.md` foi atualizado se novo prefixo ou chave foi criado?
- [ ] O `README.md` foi atualizado se o comportamento visível mudou?

**Ao finalizar a tarefa, apresentar:**
1. Arquivos alterados
2. Chaves de armazenamento afetadas
3. Outros módulos que podem ter sido impactados indiretamente
4. Documentação atualizada
5. Pendências identificadas (bugs fora do escopo, riscos, configurações que dependem do proprietário)

---

## 20. Pendências técnicas e configurações que dependem do proprietário

As seguintes configurações **não podem ser feitas sem o proprietário do repositório (arthursoaress7)**:

| Item | Motivo |
|---|---|
| Proteção da branch `main` (exigir PR, bloquear push direto) | Requer permissão de admin no repositório |
| Configuração de GitHub Actions (semantic-release) | Requer permissão para criar workflows e secrets |
| Criação de secrets do repositório (ex.: `GITHUB_TOKEN` para releases) | Requer acesso às configurações do repositório |
| Configuração de Squash Merge como padrão no GitHub | Requer permissão de admin |
| Remover ou arquivar a branch `development` | Decisão do proprietário |

**Riscos identificados:**
1. `@updateURL` aponta para `main` — push direto (acidental ou não) distribui imediatamente para todos os usuários
2. Sem proteção de branch, qualquer colaborador com acesso pode pushar direto na `main`
3. Não há processo de rollback documentado — uma versão com bug distribuída automaticamente exige push corretivo urgente
4. `senhasContas` armazena credenciais sem criptografia adicional no Tampermonkey

**Próximos passos sugeridos:**
1. Solicitar ao proprietário que proteja a branch `main` (exigir PR, impedir push direto)
2. Definir se a branch `development` será mantida ou removida
3. Avaliar implementação de `semantic-release` após proteção da `main`
4. Documentar processo de rollback de emergência
