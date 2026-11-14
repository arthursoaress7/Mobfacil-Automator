# Plano — P0: Consolidação do acesso aos dados do ER

> Plano de execução da prioridade P0 do [`PRIORIDADES.md`](../PRIORIDADES.md). Regras em [`instructions.md`](../instructions.md) (item 23).
> Criado em 11/11/2026 sobre a v13.29.0. Todo o trabalho acontece na branch `feature/api-er`.

---

## 1. Como a coleta funciona hoje

O script obtém dados do ER de três formas.

### A. Tela ao vivo (mais frágil)

O script lê o que está desenhado na página ou na memória do front e, às vezes, clica para fazer a informação aparecer.

- **Motor MobFacil** (`iniciarMotor`, iframe `enviamotor.mobfacil.com.br`): lê a árvore da análise de crédito na memória do React (`treeData`, via `arvoreReact`/`listaReact`). Quando não consegue, abre os nós com cliques (`rodarCaminho`, `clicar`, `aguardarMovimento`) e, como plano B, usa a pesquisa da árvore.
- **CCBs:** `PAGINA.eval('... DetalhePropostaDocumentos ...')` lê uma variável JavaScript da página do ER.
- **Login, troca de conta, navegação automática e "Ler da tela".**

Quebra quando o ER muda o layout, o componente ou a animação.

### B. Requisição + leitura do HTML (a maioria)

O script faz a mesma requisição que a tela do ER faria, com o cookie de sessão do usuário, recebe o pedaço de HTML que o ER usaria para desenhar a tela e procura os dados nesse HTML com `DOMParser`.

Exemplo (`dadosCliente`): `GET /MesaCredito/MesaAnaliseCliente?lngProposta=N` → HTML com `<td><small>Telefone 1</small><br><b>(11) 9...</b></td>` → o script acha o rótulo "Telefone 1" e lê o `<b>` da mesma célula.

Não depende da tela aberta nem do visual (CSS), mas quebra se o ER mudar a estrutura desse HTML (rótulo, tabela, id).

### C. Requisição + JSON (só uma rota)

`/CentralAtendimento/BuscaCartao` (CAC) devolve JSON. O script usa os campos direto (`strResultado`, `strValidarDadosCliente`...). É a forma mais estável.

### O problema real

Hoje cada módulo faz as três etapas sozinho e de um jeito diferente: **buscar** (seis formas de requisição: `cacReq`, `erReq`, `bsFila`, `dadosCliente`, `buscarDetalhe`, coleta do Diário), **interpretar** (seletores espalhados pelo código) e **usar**. Quando o ER muda algo, o conserto pode estar em vários lugares e a quebra nem sempre é detectada.

---

## 2. Como fica

A camada `er` vira a "API" do PayMobi. O módulo só pede o dado e recebe um objeto pronto:

```
módulo (pd, cac, bs, at...)
   │  erBuscar('cliente', { proposta: 5017 })
   ▼
camada er
   ├─ registro de rotas   → qual URL, método e parâmetros (um lugar só)
   ├─ requisição única    → cookie da sessão, tempo limite, sessão expirada, erro padronizados
   ├─ leitor da rota      → HTML ou JSON  →  { nome, cpf, telefone, email }
   └─ validação           → faltou campo? avisa "ER mudou a rota X" em vez de devolver dado errado
   ▼
{ ok: true, dados: { nome, cpf, telefone, email } }   ou   { ok: false, motivo: 'sessão expirada' }
```

Hoje e depois, lado a lado:

```js
// HOJE (dentro do módulo): buscar + interpretar + usar
const resp = await fetch(base + '/MesaCredito/MesaAnaliseCliente?lngProposta=' + id, { credentials: 'include', ... });
const html = await resp.text();
if (erSemSessao(html)) ...
const doc = new DOMParser().parseFromString(html, 'text/html');
// ... procurar "Telefone 1" na tabela ...

// DEPOIS (no módulo): só usar
const r = await erBuscar('cliente', { proposta: id });
if (!r.ok) return avisar(r.motivo);
usar(r.dados.telefone);
```

**O que muda de verdade:**
- Para o módulo, a origem é invisível. Se uma rota passar a ter JSON, ou vier a API oficial, troca-se só o leitor daquela rota; nenhum módulo muda.
- A estrutura do HTML continua sendo lida onde não houver JSON, mas em **um único lugar por rota**, com detecção de mudança.
- As dependências da tela ao vivo (forma A) saem do caminho principal quando houver rota equivalente.

**O que não muda:** onde o ER só oferece HTML, uma mudança grande nesse HTML ainda exige ajustar o leitor. O ganho é o conserto em um ponto e o aviso imediato, não imunidade.

---

## 3. Inventário preliminar (código v13.29.0)

Levantado no código em 11/11/2026. Função = onde a rota aparece (pode ser uma função interna). Confirmar e completar em P0.1.

| Rota do ER | Resposta | Funções | Módulo |
|---|---|---|---|
| `/MesaCredito/MesaCreditoLista` | HTML | `erGuardarBase`, `erMesa`, busca (`pg`) | Base / RD / Busca |
| `/MesaCredito/MesaAnaliseCliente` | HTML | `buscarDetalhe`, `dadosCliente`, `erCadastro` | Diário / Aba Cliente / RD |
| `/MesaCredito/MesaAnaliseProposta` | HTML | `telExtrair` (`DETALHES`), `erVendedor` | Diário / RD |
| `/MesaCredito/DetalheProposta` | HTML | `telExtrair` (`DETALHES`), `erVendedor` | Diário / RD |
| `/MesaCredito/MesaAnaliseMobFacil` | HTML (iframe do motor) | `coletarEtapas` | Coleta |
| `/FilaPendencias/FilaPendenciasLista` | HTML | `pdLista` | Pendências |
| `/FilaPendencias/DetalheCompra` | HTML | `pdDetalhe` | Pendências |
| `/FilaPropostas/FilaPropostasLista` | HTML | CCBs | CCBs |
| `/FilaPropostas/DetalhePropostaCadastro` | HTML | CCBs | CCBs |
| `/FilaPropostas/DetalhePropostaDocumentos` | HTML | CCBs | CCBs |
| `/Documentos/BaixaDocumento` | Arquivo | CCBs | CCBs |
| `/CentralAtendimento/CentralPesquisaCliente` | HTML | `cacConsultar` | CAC |
| `/CentralAtendimento/BuscaCartao` | **JSON** | `cacAbrir` | CAC |
| `/CentralAtendimento/CentralInicio` | HTML | `cacAbrir` | CAC |
| `/CentralAtendimento/CentralCompras` | HTML | `cacAbrir` | CAC |
| `/CentralAtendimento/DetalheCompra` | HTML | `cacAbrir` | CAC |
| Fila (modelo aprendido, `filaReqModelo`) | HTML | `bsFila` | Busca |

**Dependências da tela ao vivo:** árvore React do motor MobFacil (`arvoreReact`, `listaReact`, cliques), `PAGINA.eval` nos CCBs, login/troca de conta, navegação automática, "Ler da tela".

**Funções `er*` já existentes:** `erSemSessao`, `erGuardarBase`, `erReq`, `erDoc`, `erMesa`, `erCadastro`, `erVendedor`; chave `erBase`. A camada nova consolida essas funções; nomes novos não podem colidir com elas.

**Dois meios de requisição:** no ER, `fetch` com `credentials: 'include'`; no RD (`app.tallos.com.br`), `GM_xmlhttpRequest` usando `erBase`. A camada precisa suportar os dois.

---

## 4. Fases

| Fase | Tarefa | Categoria | Portão para avançar |
|---|---|---|---|
| 1 | P0.1 Inventário + mapeamento | A | `docs/script/13-api-er.md` completo para o piloto |
| 2 | P0.2 Desenho da camada | **B** | Autorização explícita |
| 3 | P0.3 Camada base | **B** | Nenhum comportamento muda; verificações passam |
| 4 | P0.4 Piloto Pendências | A | Texto idêntico ao atual em casos reais |
| 5 | P0.5 Demais rotas HTML | A | Um módulo validado antes do próximo |
| 6 | P0.6 Motor sem cliques | **B** | Coleta idêntica em propostas reais |
| 7 | P0.7 Outras dependências de tela | A/B | Caso a caso |
| 8 | P0.8 Remover caminhos duplicados | A | Uso real sem regressão |
| 9 | P0.9 `feature/api-er` → `development` | — | Tudo acima validado |

### Fase 1 — Inventário e mapeamento (P0.1)

- **No código (IA):** completar a tabela da seção 3 com parâmetros, campos extraídos e seletores usados por rota.
- **No navegador (responsável, Opera):** `Ctrl+Shift+I` → **Rede** → **Fetch/XHR** → **Preservar log**. Prioridade: abrir uma análise no **motor MobFacil** e procurar uma resposta **JSON** com os dados da árvore (restritivos, score, consultas). Depois, passar pelas telas da tabela acima e anotar qualquer resposta JSON.
- **Antes de compartilhar:** remover `Cookie` e dados pessoais de clientes; usar valores fictícios.

### Fase 2 — Desenho (P0.2) — Categoria B

Proposta inicial, a ajustar com o mapeamento:

| Elemento | Função |
|---|---|
| `ER_ROTAS` | Registro único: nome → caminho, método, parâmetros, leitor |
| `erBuscar(nome, params)` | Entrada única. Monta a requisição, aplica tempo limite (`CONFIG.TIMEOUT_REDE`), detecta sessão expirada (`erSemSessao`) e chama o leitor |
| Meios | `fetch` no ER; `GM_xmlhttpRequest` + `erBase` no RD |
| Leitores | Um por rota: HTML/JSON → objeto. Contêm os seletores hoje espalhados |
| `erConferir(nome, dados, campos)` | Valida campos obrigatórios; se faltar, devolve `{ ok: false, motivo: 'estrutura mudou' }` |
| Aviso | Mensagem no painel identificando a rota, uma vez por sessão |
| Ativação por módulo | Preferência `erModulos` (ver abaixo), desligada por padrão |
| Conta exigida | Cada rota em `ER_ROTAS` declara a conta: `mesa`, `master` ou `qualquer`. A camada reconhece as respostas de conta errada (`Aprovador ... não cadastrado`, `Usuário sem direito ...`) e devolve `{ ok: false, motivo: 'conta', precisa: 'master' }`. A troca continua com o módulo Contas (`trocarPara` + retomada), como `cacRetomar`/`pdRetomar` já fazem; a camada não troca de conta sozinha |

**Armazenamento proposto (aprovar junto):** `erModulos` (módulos ligados na camada nova), `erFalhas` (contagem de falhas por rota e dia, sem dados pessoais). Nenhuma resposta ou dado de sessão é armazenado.

**Retorno padrão:** `{ ok: true, dados }` ou `{ ok: false, motivo }`, com motivos padronizados (sessão expirada, tempo esgotado, erro de rede, HTTP N, estrutura mudou, conta errada).

**Contas:** o ER tem uma conta por sessão. A conta **Mesa** faz as operações de crédito (Mesa de Crédito, motor) e a **master** os atendimentos (Fila de Pendências, CAC completo). Ver `docs/script/13-api-er.md`, "Contas e permissões".

### Fase 3 — Camada base (P0.3) — Categoria B

Implementar a seção `/* ================= ACESSO AO ER ================= */` sem migrar módulos. Aceite: script carrega igual; `node --check` passa; nenhum dado de sessão salvo ou logado; `@downloadURL`/`@updateURL` intactos.

### Fase 4 — Piloto Pendências (P0.4)

`pdLista` e `pdDetalhe` passam a usar `erBuscar('pendencias')` e `erBuscar('pendenciaDetalhe')`. A formatação do texto não muda. Com a opção ligada, um modo comparação gera pelos dois caminhos e mostra divergências. Aceite: texto idêntico para as propostas 5017 e 4959 e para a fila de um dia real; fila vazia, sessão expirada e conta sem acesso com o mesmo aviso de hoje.

### Fase 5 — Demais rotas HTML (P0.5)

Ordem sugerida: aba Cliente (`dadosCliente`/`buscarDetalhe`) → busca de cliente → CAC → RD (`erReq`) → CCBs (listas e documentos). Mesma receita da fase 4. Regra mantida: o número de contato do RD nunca recebe o telefone da proposta.

### Fase 6 — Motor sem cliques (P0.6) — Categoria B

**Confirmado em 11/11/2026:** `/api/visualizador` devolve em JSON todos os campos da coleta (ver `docs/script/13-api-er.md`). Ler esse JSON (requisição direta ou escuta da resposta do próprio motor) e alimentar `extrairDeLista` com ele, mantendo a leitura atual como plano B. Pode exigir `@connect` (Categoria B). Maior ganho de estabilidade e velocidade da coleta.

### Fase 7 — Outras dependências de tela (P0.7)

Caso a caso: `PAGINA.eval` nos CCBs (trocar por `/FilaPropostas/DetalhePropostaDocumentos`, se trouxer o mesmo dado), login e troca de conta (Categoria B, `senhasContas` nunca sai do navegador), navegação automática e "Ler da tela".

### Fase 8 — Remover duplicados (P0.8)

Depois de duas semanas em uso real sem falhas, remover as funções de requisição antigas e o modo comparação, um PR por módulo.

### Fase 9 — Integração (P0.9)

Atualizar `feature/api-er` com a `development`, rodar o roteiro completo de testes e abrir o PR `feature/api-er` → `development`.

---

## 5. Fluxo de branches

```
development
  └── feature/api-er                  (branch da funcionalidade, longa)
        ├── docs/plano-api-er          → PR para feature/api-er
        ├── feature/er-camada-base     → PR para feature/api-er
        ├── feature/er-pendencias      → PR para feature/api-er
        └── ...
```

- Sub-branches partem de `feature/api-er` e voltam para ela por PR.
- A `development` é trazida para `feature/api-er` periodicamente (merge), para não acumular conflitos.
- Os workflows só validam PRs para `main`. Nos PRs para `feature/api-er`, as verificações são manuais: `node --check`, revisão do diff e checklist do `instructions.md`.
- `@version` não muda nas sub-branches; a versão sobe só na integração com `development`/`main`.

---

## 6. Estratégia de teste

Não há testes automatizados. Em cada fase com código:

1. `node --check paymobifin-assistente.user.js`.
2. Instalar o script da branch, abrir o ER: painel carrega sem erro no console.
3. Roteiro funcional do módulo com dados reais (sem expor dados no PR).
4. Regressão com a camada ligada e desligada: Agenda, Atendimento, Histórico, Relatórios, Equipe, CAC.
5. Conferir que nenhuma sessão ou dado pessoal foi para `GM_setValue`, `debug` ou log.
6. Registrar no PR o que foi e o que não foi testado.

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| ER muda a estrutura do HTML de uma rota | Leitor único por rota + validação + aviso; conserto em um ponto |
| Divergência entre caminho novo e antigo | Modo comparação antes de ligar por padrão |
| Merge chega a todos os usuários | Branch separada + ativação por módulo desligada por padrão |
| Volume de requisições | Pausas com `sleep()` e limites em `CONFIG`, como hoje |
| Contrato com o fornecedor | Somente leitura; dúvida #9 do `PRIORIDADES.md` |
| Vazamento ao mapear | Limpeza obrigatória antes de compartilhar |
| `feature/api-er` se afastar da `development` | Merge periódico da `development` |

---

## 8. Decisões pendentes do responsável

| # | Decisão | Situação (12/11/2026) |
|---|---|---|
| 1 | Aprovar o desenho da camada e as chaves `erModulos` e `erFalhas` | **Aprovado** |
| 2 | Quem testa a branch no ER real | **O responsável** |
| 3 | Arquitetura com build/módulos | **Depois de mapear todo o projeto**; a camada é feita dentro do monólito |

---

## 9. Status

| Fase | Status |
|---|---|
| 1 — Inventário e mapeamento | Em andamento: inventário preliminar feito; motor MobFacil mapeado (`/api/visualizador`, JSON) em `docs/script/13-api-er.md` |
| 2 — Desenho | **Aprovado** (12/11/2026): `docs/PROPOSTA-CAMADA-ER.md` |
| 3 a 9 | Pendente |
