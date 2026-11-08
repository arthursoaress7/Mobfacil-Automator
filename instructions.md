# instructions.md — Guia central de desenvolvimento do PaymobiFin - Assistente

> **Este documento é a fonte única de verdade para qualquer desenvolvimento, manutenção ou extensão do projeto.**
> Toda IA ou desenvolvedor deve ler este arquivo antes de escrever ou alterar qualquer linha de código.

---

## A. Identidade e objetivo do projeto

### O que é

O **PaymobiFin - Assistente** é um userscript Tampermonkey (arquivo `.user.js`) que adiciona um painel flutuante ao sistema ER da Paymobi (`paymobi.ercard.com.br`). Ele também roda no motor de análise de crédito (`enviamotor.mobfacil.com.br`).

### Qual problema resolve

A equipe de cobrança e crédito precisa coletar dados de análise, registrar acordos, gerar textos padronizados para grupos de WhatsApp e copiar linhas formatadas para planilhas do Excel. Sem o script, tudo isso exige navegação manual repetitiva e cópia manual de dados dispersos em várias telas do sistema.

### Ambiente de execução

| Item | Valor |
|---|---|
| Extensão | Tampermonkey (Chrome/Edge/Firefox) |
| Sites alvo | `paymobi.ercard.com.br` e `enviamotor.mobfacil.com.br` |
| Momento de execução | `document-idle` (após carregamento completo da página) |
| Contexto JS | IIFE (função imediatamente invocada), `'use strict'` |
| Acesso ao site | Via `unsafeWindow` (alias `PAGINA` no código) |

### Tecnologias utilizadas

- JavaScript puro (ES2020+), sem transpilador ou bundler
- Tampermonkey APIs: `GM_setValue/getValue/deleteValue`, `GM_setClipboard`, `GM_xmlhttpRequest`, `unsafeWindow`
- Pusher Channels 8.4.0 (biblioteca externa via `@require`)
- Web Crypto API (AES-GCM 256 + PBKDF2 + HMAC-SHA256)
- Web Workers (para `sleep` não bloqueante em abas em segundo plano)

### Princípios que orientam o desenvolvimento

1. **Não sobrescrever dados bons** — uma leitura posterior nunca substitui um campo já preenchido (`salvar()` implementa isso explicitamente)
2. **Tolerância a falhas silenciosa** — blocos `catch (_) {}` são intencionais onde o site pode mudar sem quebrar o script
3. **Autossuficiência** — o script não depende de servidor próprio; tudo roda no navegador do usuário
4. **Compatibilidade retroativa** — estruturas de armazenamento são versionadas (`LB_VERSAO`, `AC_VERSAO`) e migradas automaticamente
5. **A versão fica em um lugar só** — o número de versão existe apenas no `@version` do cabeçalho; o código lê via `GM_info.script.version`

---

## B. Arquitetura e organização

### Estrutura de arquivos atual

```
Mobfacil-Automator/
├── automacaomobfacil.user.js   ← ÚNICO arquivo de código (monólito, ~6.300 linhas)
├── README.md                   ← Documentação funcional e histórico de versões
├── instructions.md             ← Este arquivo (guia central de desenvolvimento)
├── CLAUDE.md                   ← Entrada para o Claude Code
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

> ⚠️ **Arquitetura monolítica:** todo o código está em `automacaomobfacil.user.js`. Não existe separação de módulos em arquivos diferentes. A refatoração em módulos **não faz parte do escopo atual** — qualquer alteração deve respeitar essa estrutura.

### Organização interna do script (por seção)

O script é uma IIFE única. Internamente está organizado por blocos delimitados com comentários `/* ===== NOME ===== */`:

| Bloco | Linhas aprox. | Responsabilidade |
|---|---|---|
| Cabeçalho Tampermonkey | 1–23 | Metadados, permissões, URLs alvo, dependências |
| Constantes globais | 24–113 | `VERSAO`, `TITULO`, `CONFIG`, `PAGINA`, `PADRAO`, `cfg`, `sleep` |
| Leitura da árvore | 114–374 | Funções de coleta de dados do motor MobFacil (DOM + React) |
| Motor (`iniciarMotor`) | 375–836 | Navegação automática na árvore do iframe |
| Painel (`iniciarPainel`) | 837–6293 | Todo o painel: interface, coleta, relatórios e módulos |
| → CCBs | 2881–3068 | Download de CCBs em lote |
| → Contas | 3069–3273 | Troca rápida de conta |
| → Gerador de Negociações | 3274–3767 | Formulário de negociação + textos |
| → Lembretes | 3768–4160 | Pagamentos parciais (v2) |
| → Consulta CAC | 4161–4480 | Leitura da CAC |
| → Atendimento | 4546–4834 | Negociação e Renegociação |
| → Timers | 4835–5171 | Agendamentos de expediente |
| → Navegação/Aparência | 5172–5272 | Nova UI / UI Antiga |
| → Equipe (Pusher) | 5273–5739 | Compartilhamento criptografado |
| → Histórico | 5740–5968 | Acordos registrados |
| → Busca de cliente | 5969–6273 | Central de busca somente leitura |
| → Navegação automática | 6274–6293 | Troca de tela automática |
| Inicialização | 6294–6297 | Ponto de entrada: `iniciarMotor()` ou `iniciarPainel()` |

### Ponto de entrada (inicialização)

```javascript
// Linha 6294–6297 — ÚNICO ponto de entrada
if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
else if (window.top === window) iniciarPainel();
```

- `enviamotor.mobfacil.com.br` → roda `iniciarMotor()` (coleta dados da árvore)
- `paymobi.ercard.com.br` → roda `iniciarPainel()` **apenas na janela principal** (`window.top === window`), não em iframes

### Variáveis e constantes compartilhadas (escopo da IIFE)

Estas variáveis são acessíveis por todos os módulos internos. Modificá-las tem impacto global:

| Nome | Tipo | Descrição | Linha |
|---|---|---|---|
| `VERSAO` | string | Versão lida do `@version` via `GM_info` | 29 |
| `TITULO` | string | Nome do painel | 30 |
| `CONFIG` | objeto | Todos os timeouts e limites de comportamento | 31 |
| `PAGINA` | objeto | `unsafeWindow` — acesso ao JS do site | 63 |
| `PADRAO` | objeto | Valores padrão das preferências do usuário | 66 |
| `cfg` | função | Lê preferência: `cfg('chave')` → `GM_getValue` com fallback | 82 |
| `sleep` | função | Aguarda N ms via Web Worker (não bloqueia) | 86 |
| `NOMES` | objeto | Nomes legíveis dos campos de crédito | 102 |
| `campos` | função | Retorna quais campos devem ser coletados (depende do modo) | 104 |
| `completo` | função | Verifica se todos os campos do modo atual estão preenchidos | 111 |
| `react` | objeto | Estado da leitura da árvore React (mutável durante coleta) | 144 |
| `RAIZES` | RegExp | Nós raiz do SPC usados na navegação | 282 |

### Integração com o sistema ER

O script interage com o site de três formas:

1. **DOM direto** — `document.querySelector`, `querySelectorAll` com seletores CSS do antd (ex.: `.ant-tree-treenode`)
2. **Objetos internos via `PAGINA`** — acessa funções e objetos do próprio site:
   - `PAGINA.MostraConsulta('MesaCredito')` — troca de tela
   - `PAGINA.objFilaPropostas.FilaPropostas('X')` — pesquisa na fila
   - `PAGINA.jQuery` — biblioteca jQuery do site (usada para eventos AJAX)
   - `PAGINA.eval(...)` — usado apenas para acessar `DetalhePropostaDocumentos` quando não está exposto globalmente
3. **Fibra React** — acessa `treeData` via `__reactFiber$` para ler nós fechados da árvore

### Armazenamento (`GM_setValue`/`GM_getValue`)

Todas as chaves usadas no script. Modificar uma chave sem migração quebra dados existentes:

| Chave | Conteúdo | Módulo |
|---|---|---|
| `dados` | `{ [id]: { qtd, val, score, consultas, cpf, reprov } }` | Motor/Coleta |
| `debug` | Snapshots de diagnóstico por proposta | Motor |
| `fila` | `[id, id, ...]` — propostas a coletar | Painel |
| `feitas` | `[id, id, ...]` — propostas já coletadas | Painel |
| `ignoradas` | `{ id: 'teste' \| 'cancelada' }` | Painel |
| `verificadas` | `[id, ...]` — conferidas na tabela | Painel |
| `rodando` | boolean — coleta ativa | Painel |
| `batida` | timestamp — heartbeat da aba ativa | Painel |
| `atualId` | string — ID da proposta sendo coletada | Painel |
| `fim` | string — sinaliza que o motor terminou | Motor→Painel |
| `modo` | `'coleta' \| 'aprovadas' \| 'reprovadas'` | Painel |
| `mfLembretes` | `{ versao: 2, itens: [...], invalidos: [...] }` | Lembretes |
| `mfLembretesAviso` | Estado do pop-up de lembretes | Lembretes |
| `mfAcordos` | `{ versao: 1, itens: [...] }` | Histórico |
| `equipeNome/Secret/Chave/Ativa/Id` | Config da equipe | Equipe |
| `equipeOnline/Versao/Avisos/AvisosVistos` | Estado da equipe | Equipe |
| `senhasContas` | Senhas das contas (criptografadas localmente) | Contas |
| `contaAnterior` | Usuário da conta de onde se saiu na última troca (pré-seleção em "Trocar de conta") | Contas |
| `negModelos` | Modelos de texto personalizados | Negociação |
| `negModalidade/negModeloAtual/negPagamento` | Últimas escolhas | Negociação |
| `atModelo` | Modelo ativo no Atendimento | Atendimento |
| `abaPainel` | Aba ativa no painel | Interface |
| `posPainel/tamPainel/tamAmpliado/min` | Posição e tamanho do painel | Interface |
| `navAuto` | Navegação automática ligada/desligada | Navegação |
| `tmExpediente/tmVolume` | Config de timers | Timers |
| `geminiChave/geminiModelo` | Chave e modelo do Gemini (só neste navegador) | RD Atendimento |
| `rdAnalises/rdLinhas` | Análises e linhas da planilha de encerramento do dia | RD Atendimento |
| `gruposCfg` | Estado aberto/fechado dos grupos de config | Config |

---

## C. Padrões obrigatórios de desenvolvimento

### Padrões confirmados no código (existentes)

#### 1. Estrutura do arquivo

- Todo o código está dentro de uma IIFE: `(function () { 'use strict'; ... })();`
- Indentação: **2 espaços**
- Seções delimitadas com: `/* ================= NOME ================= */`
- Subsistemas dentro do painel usados por uma só seção são declarados dentro da função correspondente (escopo local)

#### 2. Nomenclatura

| Tipo | Convenção | Exemplos reais |
|---|---|---|
| Constantes globais | MAIÚSCULAS | `CONFIG`, `PAGINA`, `PADRAO`, `VERSAO`, `RAIZES` |
| Funções de módulo | prefixo de 2–3 letras + camelCase | `ngValor()`, `atDesenhar()`, `lbCarregar()`, `cacReq()`, `eqCifrar()`, `tmCriar()` |
| Variáveis locais | camelCase | `dadosAtuais`, `ultimoClique`, `buscaOk` |
| Chaves de armazenamento | camelCase string literal | `'mfLembretes'`, `'negModelos'`, `'equipeAtiva'` |
| IDs de elementos HTML | prefixo `mf-` + kebab-case | `#mf-p`, `#mf-ini`, `#mf-bs-termo` |
| Classes CSS | prefixo `mf-` + kebab-case | `.mf-sec`, `.mf-tit`, `.mf-grade` |

**Prefixos de funções confirmados no código:**

| Prefixo | Módulo |
|---|---|
| `ng` | Gerador de Negociações |
| `at` | Atendimento (Negociação/Renegociação) |
| `lb` | Lembretes |
| `tm` | Timers |
| `cac` | Consulta CAC |
| `ccb` | CCBs |
| `eq` | Equipe (Pusher) |
| `hs` | Histórico |
| `bs` | Busca de cliente |

#### 3. Seletor interno do painel

Dentro de `iniciarPainel`, o acesso ao DOM usa um atalho local:

```javascript
const $ = s => painel.querySelector(s);  // linha 1532
```

Isso significa que `$('#mf-ini')` busca **dentro do painel**, não no documento inteiro. Usar `document.querySelector` dentro do painel é incorreto e pode capturar elementos do próprio site.

#### 4. Tratamento de erros

Padrão dominante: `catch (_) {}` — silencioso, sem log, quando o erro é esperado ou irrelevante:

```javascript
try { raizes = [...PAGINA.document.querySelectorAll('.ant-tree')]; } catch (_) { return null; }
```

Para erros em sistemas críticos com informação útil: captura com log:

```javascript
} catch (e) { react.bruta = react.lista = []; }
```

Para o módulo de Timers (loop infinito), usa `console.warn` com prefixo:

```javascript
} catch (e) { console.warn('[PaymobiFin] timers', e && e.message); }
```

Para erros no módulo de CCBs, usa classe própria:

```javascript
class ErroCCB extends Error { constructor(m, parar) { super(m); this.parar = !!parar; } }
```

**⚠️ Recomendação nova:** O módulo CAC e o módulo de Equipe deveriam ter tratamento de erros com log similar a `[PaymobiFin] cac` / `[PaymobiFin] equipe`. Hoje esses erros são silenciosos, dificultando diagnóstico.

#### 5. Logs de depuração

Apenas dois usos de `console.log/warn` em todo o script:

```javascript
console.log('[PaymobiFin]', r.id, atual);          // linha 372 — confirma dado salvo
console.warn('[PaymobiFin] timers', e && e.message); // linha 5169 — erro no timer
```

Prefixo padrão: `[PaymobiFin]`. Todo novo log deve usar este prefixo.

#### 6. Funções assíncronas

Funções longas e com espera usam `async/await` com `sleep()`:

```javascript
async function rodarCaminho(passos, maxSeg) {
  while (Date.now() < limite) {
    await sleep(CONFIG.ESPERA_CLIQUE);
    ...
  }
}
```

Nunca usar `setTimeout` direto para esperas em loops — usar `sleep()` que resolve o problema de abas em segundo plano.

#### 7. Timeouts e limites

Todos os timeouts e limites de tempo ficam em `CONFIG` (linha 31). Nunca colocar valores de tempo hard-coded em outro lugar do código.

#### 8. Interação com o site via `PAGINA`

Sempre envolver em `try/catch` — o site pode ser atualizado e quebrar o acesso:

```javascript
try {
  if (typeof PAGINA.MostraConsulta === 'function') PAGINA.MostraConsulta(tela.menu);
} catch (_) {}
```

#### 9. Armazenamento: leitura imutável

A função `salvar()` implementa a regra "nunca sobrescrever dado bom":

```javascript
// só preenche campos ainda vazios: uma leitura posterior nunca sobrescreve dado bom
function salvar(r) {
  ...
  if (r[k] != null && (atual[k] == null || ...)) { atual[k] = r[k]; mudou = true; }
  ...
}
```

Qualquer nova função que grave dados de proposta deve seguir a mesma lógica.

#### 10. Prevenção de execução duplicada

O painel só inicia se `window.top === window` (linha 6296). Evita instâncias dentro de iframes.

Durante a coleta, o mecanismo de "batida" (`batida`) impede que outra aba tome o controle enquanto a atual está ativa.

### Padrões que precisam ser formalizados (oportunidades de melhoria)

> Os itens abaixo **não são padrões atuais** — são recomendações para futuras sessões de desenvolvimento.

1. **Logs de módulos específicos:** adicionar `console.warn('[PaymobiFin] <módulo>', ...)` nos blocos catch do CAC e Equipe
2. **Comentários de parâmetros nas funções complexas:** algumas funções como `cacAbrir(row, termo, extra, dentro)` não têm JSDoc; adicionar ao criar ou alterar
3. **Constantes de seletores CSS:** seletores como `.ant-tree-treenode` estão espalhados; centralizar em um objeto seria mais seguro para manutenção futura

---

## D. Regras para desenvolvimento com IA

> Estas regras se aplicam ao Claude, ao Kiro e a qualquer outra IA que trabalhe neste projeto.

### Antes de qualquer trabalho

1. **Leia este arquivo (`instructions.md`) completamente**
2. Leia o arquivo `docs/script/` correspondente ao módulo que será alterado
3. Leia as seções relevantes do `README.md`
4. **Leia o código-fonte** da seção que será alterada — nunca assuma o que o código faz
5. Identifique quais chaves de `GM_setValue/getValue` a alteração pode afetar
6. Identifique se a alteração impacta o módulo de Equipe (dados compartilhados)

### Durante o desenvolvimento

7. **Reutilize funções existentes** — verifique se já existe antes de criar. Exemplos de funções reutilizáveis: `cfg()`, `sleep()`, `salvar()`, `num()`, `limpa()`
8. **Não crie funcionalidades duplicadas** — se existir `lbCarregar()`, não crie `carregarLembretes()`
9. **Preserve o comportamento existente** — não remova parâmetros de funções, não mude assinaturas sem mapear todos os usos
10. **Não altere `CONFIG`** sem entender o impacto em todas as esperas e loops que o usam
11. **Não altere `PADRAO`** sem verificar se a chave já tem dados salvos em usuários reais
12. **Use o prefixo correto** para novas funções de módulo (veja tabela de prefixos na seção C)
13. **Use `$()` dentro do painel**, não `document.querySelector()`
14. **Implemente apenas o que foi solicitado** — não adicione features extras, não refatore código fora do escopo

### Verificações obrigatórias

15. Ao adicionar nova chave de armazenamento: verificar se o nome já está em uso (ver tabela da seção B)
16. Ao alterar lógica de coleta (`extrair`, `extrairDeLista`, `salvar`): testar que dados válidos não são sobrescritos
17. Ao alterar o HTML do painel: verificar que o seletor `$('#id')` correspondente existe
18. Ao alterar um módulo compartilhado com a Equipe (`mfLembretes`, `mfAcordos`): verificar compatibilidade com a versão serializada

### Proibições absolutas

19. **Não divida o arquivo em múltiplos arquivos** — a refatoração em módulos não está no escopo atual
20. **Não altere o cabeçalho `@downloadURL` e `@updateURL`** — o Tampermonkey usa para atualização automática
21. **Não remova `'use strict'`**
22. **Não altere a lógica de inicialização** (linhas 6294–6297) sem entender o impacto nos dois sites
23. **Não invente nomes de funções** que não existem — se não encontrar, pergunte
24. **Não assuma que uma funcionalidade existe** sem verificar no código
25. Se tiver dúvida sobre o funcionamento de uma parte, **diga explicitamente** antes de prosseguir

---

## E. Fluxo de trabalho para alterações

### Antes de desenvolver

```
1. Ler instructions.md (este arquivo)
2. Identificar o módulo afetado (ver tabela de seções em B)
3. Ler docs/script/<arquivo do módulo>.md
4. Ler o bloco correspondente no código-fonte
5. Mapear:
   - Quais funções serão criadas/alteradas
   - Quais chaves de GM_setValue/getValue serão afetadas
   - Quais outros módulos chamam as funções que serão alteradas
   - Se a alteração impacta dados compartilhados com a Equipe
6. Apresentar o plano antes de implementar (em alterações não triviais)
```

### Durante o desenvolvimento

```
1. Seguir os padrões da seção C
2. Um bloco de mudança de cada vez — não misturar correções não relacionadas
3. Manter comentários explicativos quando a lógica não for óbvia
4. Não alterar código fora do escopo da solicitação
5. Se descobrir um bug fora do escopo, reportar sem corrigir
```

### Depois do desenvolvimento

```
1. Revisar se alguma chave de armazenamento foi adicionada sem documentar
2. Verificar se a seção docs/script correspondente precisa ser atualizada
3. Verificar se o README precisa ser atualizado (mudança de comportamento visível ao usuário)
4. Apresentar resumo: o que foi alterado, por qual motivo, o que pode ter impacto indireto
```

---

## F. Manutenção e evolução

### Correção de bugs

- Leia o snapshot de diagnóstico (`GM_getValue('debug')`) para entender o estado quando o bug ocorreu
- Identifique se o bug é intermitente (depende de timing) → provável relação com `CONFIG` ou `sleep`
- Identifique se o bug só ocorre em abas em segundo plano → possível problema com `requestAnimationFrame`
- Não altere timeouts de `CONFIG` sem entender todos os pontos que os usam

### Criação de novo módulo dentro do painel

1. Escolher um prefixo de 2–3 letras único (verificar que não existe na tabela)
2. Nomear todas as funções com esse prefixo
3. Nomear IDs HTML com `mf-<prefixo>-<elemento>`
4. Adicionar chaves de armazenamento à tabela da seção B deste documento
5. Delimitar o bloco com `/* ================= NOME ================= */`
6. Criar o documento correspondente em `docs/script/`

### Alteração de scripts existentes

- Toda alteração em funções chamadas por mais de um módulo exige verificar todos os pontos de chamada
- Alterações no fluxo de coleta (`rodar`, `coletar`, `coletarEtapas`) impactam a experiência de toda a auditoria
- Alterações no sistema de Equipe impactam dados de todos os computadores conectados

### Remoção de funcionalidades

- Nunca remover sem verificar se está referenciado em: (1) outros módulos, (2) armazenamento salvo, (3) documentação
- Funcionalidades removidas do UI (como campos do CAC na v12.0) devem ser documentadas no README

### Atualização de dependências

- A biblioteca Pusher está fixada em `8.4.0` via `@require`. Não atualizar sem testar
- O número de versão no `@version` é o único lugar — não duplicar em comentários

### Compatibilidade com mudanças no sistema ER

- Os seletores CSS do antd (`.ant-tree-*`) podem mudar em atualizações do ER
- Os objetos internos (`PAGINA.objFilaPropostas`, `PAGINA.MostraConsulta`) podem mudar
- Toda interação com o site deve estar em `try/catch` para degradar graciosamente

### Evolução da arquitetura

A arquitetura monolítica é intencional **no momento atual**. A refatoração em módulos só deve ocorrer quando formalmente planejada com a equipe. Até lá, toda implementação deve respeitar o monólito.

---

## G. Documentação

### Estrutura atual

| Arquivo | Propósito | Atualizar quando |
|---|---|---|
| `instructions.md` | Fonte central para desenvolvimento | Novos padrões, novos módulos, mudanças estruturais |
| `README.md` | Referência funcional para o usuário | Comportamento visível muda, versão muda |
| `docs/script/01-visao-geral.md` | Mapa do script | Novo módulo ou seção adicionada |
| `docs/script/02-motor-coleta.md` | Motor de coleta | Mudança na lógica de coleta ou caminhos |
| `docs/script/03-painel-interface.md` | Interface e coleta | Mudança no painel ou no loop de auditoria |
| `docs/script/04-atendimento.md` | Atendimento | Nova modalidade, novo campo, mudança no plano |
| `docs/script/05-historico.md` | Histórico | Mudança nas regras de registro ou retenção |
| `docs/script/06-lembretes-timers.md` | Lembretes e Timers | Mudança na estrutura v2 ou nos timers |
| `docs/script/07-cac.md` | CAC | Mudança no fluxo da consulta |
| `docs/script/08-ccbs-contas.md` | CCBs e Contas | Mudança no download ou troca de conta |
| `docs/script/09-equipe.md` | Equipe | Mudança na criptografia ou protocolo Pusher |
| `docs/script/10-navegacao-busca.md` | Navegação e Busca | Mudança nas telas gerenciadas |
| `docs/script/11-rd-encerramento.md` | RD Atendimento (encerramento com IA) | Mudança na tela do RD ou nas categorias |

### Regras

- **Não duplicar** informações entre arquivos — referenciar com link
- Atualizar a documentação **na mesma sessão** que a alteração de código
- Usar exemplos reais do código, não exemplos genéricos
- Não criar novos arquivos em `docs/script/` sem adicionar a entrada na tabela acima e em `01-visao-geral.md`
- O `README.md` documenta comportamento para o usuário — `instructions.md` documenta para o desenvolvedor/IA

---

## H. Inconsistências e pontos de atenção

> Identificados durante a auditoria. Não foram corrigidos nesta etapa.

### Divergências entre documentação e código

| Item | README diz | Código diz | Impacto |
|---|---|---|---|
| Versão no título | `v11.39` | `@version 12.1` | Baixo — cosmético, README não foi atualizado |
| Tamanho do script | "~3.000 linhas" (mencionado na tarefa) | 6.297 linhas | Médio — estimativas de esforço estarão erradas |
| `@downloadURL` e `@updateURL` | Aponta para `main` | Aponta para `main` | Branch `development` não é usada pelo Tampermonkey para atualização automática |

### Pontos de atenção para futuras manutenções

1. **`PAGINA.eval()`** — usado no módulo de CCBs (linha 2942) para acessar `DetalhePropostaDocumentos`. É uma prática frágil; se o site adicionar CSP restritivo, quebra.
2. **`senhasContas`** — a chave armazena senhas no Tampermonkey, que não é criptografado. O README avisa, mas o código não tem nenhuma proteção adicional.
3. **`@downloadURL` aponta para `main`** — qualquer push na `main` atualiza o script em todos os usuários do Tampermonkey que têm atualização automática. Cuidado com o que vai para `main`.
4. **Loop infinito no timer** — `(async () => { for (;;) { ... } })()` (linha 5169). Se `tmTick` lançar erro não capturado, o loop para silenciosamente.
5. **Seletores do antd** — `.ant-tree-treenode`, `.ant-tree-switcher_close` etc. dependem da versão do antd usada pelo ER. Uma atualização do ER pode quebrar toda a coleta.

---

## I. Como usar esta documentação ao solicitar trabalho ao Claude ou Kiro

### Ao solicitar um novo script ou funcionalidade

Inclua na sua mensagem:

```
Consulte instructions.md e docs/script/<módulo>.md antes de começar.
Quero <descrição do que precisa>.
O módulo relacionado é <nome do módulo>.
```

### Ao solicitar correção de bug

```
Consulte instructions.md e docs/script/<módulo>.md.
O bug é: <descrição>.
Ele ocorre em: <módulo/função>.
Comportamento esperado: <o que deveria acontecer>.
```

### Ao solicitar alteração de comportamento existente

```
Consulte instructions.md e docs/script/<módulo>.md.
Quero alterar <o quê> para que <novo comportamento>.
Atualmente funciona assim: <comportamento atual>.
```

### O que a IA deve fazer com estas instruções

1. Confirmar que leu `instructions.md` e a documentação do módulo
2. Apresentar o plano antes de implementar (para alterações não triviais)
3. Informar explicitamente se a alteração impactar outros módulos
4. Ao terminar: listar arquivos alterados, chaves de armazenamento afetadas e documentação que precisa ser atualizada
