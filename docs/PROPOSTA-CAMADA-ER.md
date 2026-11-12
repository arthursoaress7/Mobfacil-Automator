# Proposta P0.2 — Camada de acesso ao ER (`er`)

> **Status:** **aprovada pelo responsável em 12/11/2026** (todas as decisões da seção 12). Implementação: P0.3 (ver "Ajustes na implementação", no fim).
> Base: código v13.29.0 e mapeamento em [`docs/script/13-api-er.md`](./script/13-api-er.md). Plano geral em [`docs/PLANO-API-ER.md`](./PLANO-API-ER.md).
> Esta proposta não altera código. A implementação é a P0.3, só depois da aprovação.

---

## 1. Objetivo

Uma entrada única para ler dados do ER e do motor MobFacil. O módulo pede um dado pelo nome e recebe um objeto pronto ou um motivo de falha padronizado:

```js
const r = await erBuscar('pendencias');
if (!r.ok) return avisar(r.motivo);          // 'sessao', 'conta', 'estrutura'...
r.dados.forEach(...);                         // [{ aut, pend, nome, data }]
```

O módulo não sabe se veio de HTML, JSON ou, no futuro, da API oficial.

---

## 2. Onde a camada fica

O script roda em três contextos (`iniciarMotor`, `iniciarPainel`, `iniciarRD`), cada um num site. Hoje cada contexto tem seu jeito de chamar o ER (`cacReq`/`fetch` no painel, `erReq`/`GM_xmlhttpRequest` no RD, `fetch` próprio no motor).

**Proposta:** uma seção nova no **nível de cima** do arquivo, logo depois de `erSemSessao`/`SESSAO_EXPIRADA` (que já são de nível de cima), visível para os três contextos:

```
/* ================= ACESSO AO ER (camada er) ================= */
```

Continua dentro da IIFE e do monólito. Nenhum arquivo novo.

---

## 3. Contrato

### `erBuscar(nome, params = {}, opcoes = {})` → `Promise<Resultado>`

```js
// sucesso
{ ok: true,  dados: <objeto ou lista>, rota: 'pendencias' }
// falha
{ ok: false, motivo: 'sessao' | 'conta' | 'tempo' | 'rede' | 'http' | 'estrutura' | 'sem_base' | 'bloqueada',
  rota: 'pendencias', status: 0, precisa: 'master' /* só em 'conta' */, detalhe: 'texto curto para o aviso' }
```

| Motivo | Quando | O que o módulo faz (como hoje) |
|---|---|---|
| `sessao` | `erSemSessao(texto)` | "Sessão do ER expirada" / login automático |
| `conta` | "Aprovador … não cadastrado", "Usuário sem direito …" | Troca para a conta indicada em `precisa` (se configurado) ou avisa |
| `tempo` | Passou de `CONFIG.TIMEOUT_REDE` | "O ER não respondeu (tempo esgotado)" |
| `rede` | Falha de conexão | "Erro de rede" |
| `http` | Status fora de 2xx | "O ER respondeu com erro (HTTP N)" |
| `estrutura` | O leitor não achou o que esperava | Aviso "o ER mudou a rota X"; usa o caminho antigo enquanto houver |
| `sem_base` | No RD, sem `erBase` gravado | "Abra o ER uma vez neste navegador" |
| `bloqueada` | Rota marcada como proibida (seção 6) | Nunca deveria acontecer: erro de programação |

`opcoes`: `{ sinal }` (AbortSignal externo, para cancelar lotes) e `{ semAviso: true }` (não mostrar aviso; o módulo trata).

**Lista vazia é sucesso:** "não foi localizada nenhuma pendência/proposta" vira `{ ok: true, dados: [] }`.

---

## 4. Registro de rotas (`ER_ROTAS`)

Um objeto com uma entrada por rota. É o único lugar com caminhos, parâmetros e seletores.

```js
const ER_ROTAS = {
  pendencias: {
    caminho: '/FilaPendencias/FilaPendenciasLista', metodo: 'GET', formato: 'html', conta: 'master',
    params: () => ({ strPendencia: '', strTipoRepasse: 'R', strTipoPendencia: 'T', /* ...como pdLista hoje... */ }),
    vazio: /n[ãa]o foi localizada nenhuma pend[êe]ncia/i,
    ler: doc => { /* o mesmo parsing de pdLista: thead → colunas → linhas */ },   // devolve [{ aut, pend, nome, data }]
  },
  cacCartao: {
    caminho: '/CentralAtendimento/BuscaCartao', metodo: 'GET', formato: 'json', conta: 'qualquer',
    abreProtocolo: true,                       // ver P4.12
    ler: json => json[0],                       // erEstrutura se não vier lista com objeto
  },
  // ...
};
```

| Campo | Uso |
|---|---|
| `caminho`, `metodo` | Rota relativa à base do ER (`cacBase()` no painel, `erBase` no RD) |
| `formato` | `html` (texto → `DOMParser`), `json` (`JSON.parse`) ou `arquivo` |
| `conta` | `mesa`, `master` ou `qualquer` (ver `13-api-er.md`, "Contas e permissões") |
| `params(p)` | Monta os parâmetros a partir do que o módulo passou |
| `vazio` | Expressão que identifica "nenhum resultado" (vira lista vazia) |
| `ler(doc ou json, p)` | Transforma a resposta em dados. Lança `erEstrutura('motivo')` se faltar o essencial |
| `abreProtocolo` | Marca rotas que abrem protocolo de atendimento no CAC |

### Rotas iniciais (a partir do inventário)

| Nome | Rota | Conta | Formato | Hoje em |
|---|---|---|---|---|
| `pendencias` | `/FilaPendencias/FilaPendenciasLista` | master | html | `pdLista` |
| `pendenciaDetalhe` | `/FilaPendencias/DetalheCompra` | master | html | `pdDetalhe` |
| `mesaLista` | `/MesaCredito/MesaCreditoLista` | mesa | html | `bsMesa`, `erMesa`, `erConferir` |
| `analiseCliente` | `/MesaCredito/MesaAnaliseCliente` | mesa | html | `dadosCliente`, `buscarDetalhe`, `erCadastro` |
| `analiseProposta` | `/MesaCredito/MesaAnaliseProposta` | mesa | html | `telExtrair`, `erVendedor` |
| `detalheProposta` | `/MesaCredito/DetalheProposta` | mesa | html | `telExtrair`, `erVendedor` |
| `motorLink` | `/MesaCredito/MesaAnaliseMobFacil` | mesa | html | `coletarEtapas` (token do iframe) |
| `mesasUsuario` | `/MesaCredito/PreencheMesasUsuario` (POST) | qualquer | json | novo: identifica a conta |
| `cacPesquisa` | `/CentralAtendimento/CentralPesquisaCliente` | qualquer* | html | `cacConsultar` |
| `cacCartao` | `/CentralAtendimento/BuscaCartao` | qualquer | json | `cacAbrir` (**abre protocolo**) |
| `cacInicio` | `/CentralAtendimento/CentralInicio` (POST) | qualquer | html | `cacAbrir` |
| `cacCompras` | `/CentralAtendimento/CentralCompras` | qualquer | html | `cacAbrir` |
| `cacCompra` | `/CentralAtendimento/DetalheCompra` | qualquer | html | `cacAbrir` |
| `filaLista` | `/FilaPropostas/FilaPropostasLista` | qualquer | html | CCBs, `bsFila` |
| `motor` | `enviamotor…/api/visualizador` (POST JSON) | — | json | `iniciarMotor` (árvore) |

\* Pesquisa por nome só na master.

---

## 5. Transporte

| Contexto | Como chama | Base |
|---|---|---|
| Painel (`paymobi.ercard.com.br`) | `fetch` com `credentials: 'include'` e `X-Requested-With: XMLHttpRequest` (igual a `cacReq`) | `cacBase()` |
| RD (`app.tallos.com.br`) | `GM_xmlhttpRequest` (igual a `erReq`), já permitido por `@connect paymobi.ercard.com.br` | `GM_getValue('erBase')` |
| Motor (`enviamotor.mobfacil.com.br`) | `fetch` na mesma origem, `POST` JSON `{ token, flagUltimos: false }` | `location.origin` |

- Tempo limite: `CONFIG.TIMEOUT_REDE` (o mesmo de hoje).
- **Sem novas tentativas automáticas** (como hoje). Lotes continuam com as pausas atuais (`sleep`).
- Nenhuma mudança em `@connect`, `@grant` ou `@include`.

---

## 6. Segurança

- **Somente leitura.** O registro só aceita rotas de consulta. Rotas que alteram dados ficam numa lista de bloqueio verificada por `erBuscar` (motivo `bloqueada`):
  `CentralFinalizaProtocolo`, `EfetivaEnvioProtocolo`, `CentralEnvioProtocolo` e as "Operações" do CAC (`/CentralAtendimento/Central<Operação>`), além de login e troca de conta.
- `BuscaCartao` fica com `abreProtocolo: true`. Enquanto o P4.12 não for decidido, a migração do CAC mantém o comportamento atual (não encerra protocolo).
- Nenhuma resposta, cookie ou token é gravado em `GM_setValue`, `debug` ou log. O token do motor é lido de `location.pathname` na hora e descartado.
- Mensagens de aviso não incluem dados de clientes (só nome da rota e motivo).

---

## 7. Conta

- `erConta()` → `'mesa' | 'master' | null`: usa `mesasUsuario` (lista com itens = conta da Mesa; `[]` = não é aprovadora). Resultado guardado só em memória durante a página.
- `erBuscar` **não troca de conta**. Quando a resposta indicar conta errada, devolve `{ motivo: 'conta', precisa }`. A troca continua com o módulo Contas (`trocarPara` + retomada), como `cacRetomar` e `pdRetomar` já fazem.
- `erBuscar` não consulta a conta antes de cada chamada (sem requisição extra): só identifica pela resposta.

---

## 8. Leitor do motor (opção A)

No `iniciarMotor`, antes de abrir a árvore:

1. Token = `location.pathname` (32 caracteres hexadecimais).
2. `erBuscar('motor')` → `POST /api/visualizador`.
3. O leitor monta exatamente o objeto que `extrairDeLista` produz hoje: `{ qtd, val, score, consultas, cpf, reprov, rendaBiro, rendaInf, nome }`, com as regras de `13-api-er.md` (reservas quando `calculaRisco` vem `null`, consultas do P2 ou do P1, `motivoStatus` com `Reprovar:`).
4. Confere `IdProposta` com a proposta da coleta (`atualId`) antes de usar.
5. Falhou ou não confere → segue o caminho atual pela árvore (plano B), sem mudança.

Ganho: sem cliques, sem espera de animação, sem plano B da pesquisa. A página do iframe continua sendo carregada (a opção B, sem iframe, exige `@connect` e fica para depois).

---

## 9. Ativação gradual e acompanhamento

| Chave nova | Conteúdo | Padrão |
|---|---|---|
| `erModulos` | `{ pd: false, motor: false, ... }` — quais módulos usam a camada | tudo desligado |
| `erFalhas` | `{ 'AAAA-MM-DD': { rota: { motivo: contagem } } }`, últimos 14 dias, **sem dados pessoais** | vazio |

- Em Configurações, uma seção "Acesso ao ER (teste)" com uma opção por módulo migrado.
- Módulo desligado = código atual, intacto.
- `erFalhas` alimenta o critério de remoção do caminho antigo (P0.8).
- Nomes não colidem com `erBase` nem com as funções `er*` existentes (`erSemSessao`, `erGuardarBase`, `erReq`, `erDoc`, `erMesa`, `erCadastro`, `erVendedor`, `erConferir`, `erLogin`, `erTxt`, `erProprio`, `erRotulo`).

---

## 10. Avisos

- `erAvisar(rota, motivo)`: no painel, mensagem curta na área de status do módulo que chamou, uma vez por sessão por rota e motivo. Ex.: "O ER mudou a Fila de Pendências (estrutura). Usando o método antigo."
- No motor e no RD: `console.warn('[PaymobiFin] er', rota, motivo)`, sem dados.

---

## 11. O que entra na P0.3 (camada base)

- A seção "ACESSO AO ER" com `ER_ROTAS` (rotas da tabela da seção 4, com leitores copiados do código atual), `erBuscar`, transporte, bloqueio, `erConta`, `erAvisar`, `erFalhas`.
- `erModulos` em `PADRAO` e a seção em Configurações.
- **Nenhum módulo passa a usar a camada.** Comportamento do script idêntico.
- Documentação: `instructions.md` (chaves e funções), `13-api-er.md`.

**Testes da P0.3:** `node --check`; script carrega nos três sites; no console do ER, `erBuscar('mesasUsuario')`, `erBuscar('pendencias')` (na master) e uma rota com sessão expirada devolvem o esperado; `erBuscar` numa rota bloqueada devolve `bloqueada`; nenhuma chave nova além de `erModulos`/`erFalhas`.

---

## 12. Decisões para aprovar

| # | Decisão | Proposta |
|---|---|---|
| 1 | Onde a camada fica | Nível de cima do arquivo, depois de `erSemSessao` |
| 2 | Contrato | `erBuscar(nome, params, opcoes)` → `{ ok, dados }` ou `{ ok: false, motivo }` |
| 3 | Somente leitura com lista de bloqueio | Sim |
| 4 | Troca de conta | Fora da camada (continua no módulo Contas) |
| 5 | Motor | Opção A (dentro do iframe), árvore como plano B |
| 6 | Chaves novas | `erModulos` e `erFalhas` |
| 7 | CAC | Migrar mantendo o comportamento atual até a decisão do P4.12 |
| 8 | Ordem | P0.3 camada base → P0.4 piloto Pendências → motor (P0.6) logo depois, por ser o maior ganho |

---

## Ajustes na implementação (P0.3, 12/11/2026)

Dois pontos da seção 11 foram feitos de forma mais incremental, sem mudar as decisões aprovadas:

1. **Rotas entram com a migração de cada módulo.** A P0.3 registra só `mesasUsuario` (identificar a conta) e as duas rotas do piloto (`pendencias`, `pendenciaDetalhe`). As demais rotas da tabela da seção 4 entram no PR que migra o módulo correspondente, com os testes da rota. Motivo: evitar leitores copiados que ninguém usa nem testa, e manter um único lugar de leitura por rota durante a migração.
2. **A seção "Acesso ao ER (teste)" em Configurações entra com o piloto (P0.4).** Sem módulo migrado, ela não teria nenhuma opção. A chave `erModulos` já existe em `PADRAO` (tudo desligado).

Acréscimos:
- Motivos `cancelada` (o módulo cancelou o lote pelo `sinal`) e `rota_desconhecida`.
- `sessao`, `conta` e `cancelada` não entram em `erFalhas` nem geram aviso: são situações normais, tratadas pelo módulo.
- Aviso: `console.warn('[PaymobiFin] er', ...)` e o evento `mf-er-aviso` na janela, que o painel poderá mostrar no piloto.
- Teste manual sem alterar o script: no console do ER, `sessionStorage.setItem('mfErTeste', '1')` e recarregar a página expõe `PaymobiEr.buscar(nome, params)`, `.conta()`, `.rotas()` e `.falhas()` até a aba ser fechada (só leitura).
- `CONFIG.ER_FALHAS_DIAS` (14): dias de histórico de `erFalhas`.

