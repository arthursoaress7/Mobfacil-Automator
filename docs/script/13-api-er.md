# Rotas do ER e do motor MobFacil (mapeamento da P0)

> Mapeamento das rotas usadas pelo script, para a camada `er` (P0 do `PRIORIDADES.md`, plano em `docs/PLANO-API-ER.md`).
> Exemplos com valores fictícios. Nunca registrar aqui cookies, tokens ou dados de clientes reais.

---

## Autenticação

| Sistema | Como autentica | Fonte |
|---|---|---|
| ER (`paymobi.ercard.com.br:9191/ErCardWeb/`) | Cookie `ASP.NET_SessionId`. Cookie anti-falsificação `__RequestVerificationToken_*`, normalmente exigido em POST de formulário | Requisição real em 11/11/2026 (`/Notificacoes/VerificaQtdNotificacoes`) e código |
| Motor MobFacil (`enviamotor.mobfacil.com.br`) | Token de 32 caracteres hexadecimais enviado no **corpo JSON** da requisição (`{ "token": "...", "flagUltimos": false }`); a resposta ecoa `"parametro": "TokenJWT"`. Sem cookie nem cabeçalho de autenticação. O token é o caminho do link do iframe devolvido por `/MesaCredito/MesaAnaliseMobFacil` (`https://enviamotor.mobfacil.com.br/<token>`), e **cada chamada dessa rota gera um token novo** | HAR de 11/11/2026 (6 aberturas do motor) |

### Contas e permissões

O ER tem uma sessão por navegador, de **uma conta por vez**, e cada conta enxerga rotas diferentes. Trocar de conta é sair e entrar de novo (módulo Contas: `trocarPara`, login automático com a senha salva).

| Conta | Uso | Rotas (conhecidas) | Fonte |
|---|---|---|---|
| **Mesa** (aprovadora da Mesa de Crédito) | Operações de crédito | Mesa de Crédito (`MesaCreditoLista`, `MesaAnaliseProposta`, `DetalheProposta`, `MesaAnaliseCliente`, `MesaAnaliseMobFacil`, `MesaAnaliseDocumentos`), motor MobFacil, documentos. CAC **pelo CPF** | `docs/script/07-cac.md`, `10-navegacao-busca.md`, `11-rd-encerramento.md`, HAR de 11/11/2026 |
| **Master** | Atendimentos | Fila de Pendências (`FilaPendenciasLista`, `DetalheCompra`), CAC completo (inclusive pesquisa **por nome**) | `docs/script/03-painel-interface.md`, `07-cac.md` |
| A confirmar | — | Fila de Propostas (CCBs) | — |

Respostas de "conta errada" já tratadas pelo script:
- Mesa de Crédito com a master: `Aprovador CONTA não cadastrado.`
- CAC por nome com a Mesa: `Usuário sem direito de pesquisa por nome de cliente`.

Hoje cada módulo resolve a conta sozinho (`cacTrocaAuto`/`cacRetomar`, `pdRetomar`, aviso do RD). A camada `er` deve saber qual conta cada rota exige e devolver um motivo padronizado (`conta errada: precisa da master`) para o módulo decidir se troca.

Observações:
- O servidor do ER é IIS 10 + ASP.NET MVC 5.2. As rotas devolvem principalmente HTML montado no servidor.
- `access-control-allow-origin: *` em respostas do ER não permite uso a partir de outro domínio com a sessão: o navegador não envia cookies para respostas com `*`.

---

## Motor MobFacil — `/api/visualizador`

**URL:** `https://enviamotor.mobfacil.com.br/api/visualizador`
**Requisição:** `POST`, `content-type: application/json`, corpo `{ "token": "<32 hex>", "flagUltimos": false }`

**Como o motor chega aos dados (confirmado no HAR de 11/11/2026):**

```
1. ER:    GET /MesaCredito/MesaAnaliseMobFacil?lngProposta={id}
          → HTML com <iframe id="iframePost" src="https://enviamotor.mobfacil.com.br/{token}">
2. Motor: página do iframe (enviamotor.mobfacil.com.br/{token})
3. Motor: POST /api/visualizador  { "token": "{token}", "flagUltimos": false }
          → JSON com a análise completa
```

**CORS:** a resposta de `/api/visualizador` **não** tem `access-control-allow-origin`. Um `fetch` feito na página do ER (outro domínio) é bloqueado pelo navegador. Opções:

| Opção | Como | Cabeçalho do script | Ganho |
|---|---|---|---|
| A — Dentro do iframe | O código do motor (`iniciarMotor`, já roda em `enviamotor.mobfacil.com.br`) chama `/api/visualizador` com o token de `location.pathname`, ou escuta a resposta que a página recebe | Sem mudança (`@include` já cobre o domínio) | Fim dos cliques e da navegação na árvore. O iframe continua sendo carregado |
| B — Sem iframe | A página do ER chama `MesaAnaliseMobFacil`, tira o token do `src` e faz o `POST` com `GM_xmlhttpRequest` | Exige `@connect enviamotor.mobfacil.com.br` (Categoria B) | Também elimina o carregamento do iframe: só duas requisições por proposta |

Hoje o cabeçalho tem `@connect` para `api-sa1.pusher.com`, `generativelanguage.googleapis.com` e `paymobi.ercard.com.br`.
**Resposta:** `application/json; charset=utf-8`

`flagUltimos` provavelmente limita a resposta às últimas execuções. Testar com `true` pode resolver a escolha entre várias execuções do mesmo fluxo.

A árvore que a coleta lê hoje (`arvoreReact`/`treeData`, com cliques em `rodarCaminho`) é a exibição desse JSON. Os nós da árvore têm os mesmos nomes das chaves (`Fluxos P1`, `Cpf`, `calculaRisco`, `QuantidadeRestritivos`...). Ler o JSON elimina a navegação, os cliques e a espera de animação.

### Estrutura

```
{
  "data": {
    "Resumo proposta": {
      "statusFinal": "P - Pendente mesa",
      "motivoStatus": [ "(P2) Derivar mesa: ...", "(P1) ...", ... ]
    },
    "Exibir fluxos": {
      "fluxos_P1": [ { ...execução do fluxo 1... } ],
      "fluxos_P2": [ { ...execução do fluxo 2... } ]
    }
  },
  "parametro": "TokenJWT",
  "valor": "<32 caracteres>",
  "codigo_retorno": 0,
  "mensagem_retorno": "Dados localizados",
  "tempo": 0
}
```

Cada execução (`fluxos_Pn[0]`):

| Chave | Conteúdo |
|---|---|
| `Cpf` | CPF, 11 dígitos sem máscara |
| `IdProposta` | Número da proposta no ER |
| `Timestamp` | Data e hora da execução (`dd/mm/aaaa às hh:mm:ss`) |
| `FluxoProcessado` | Número do fluxo |
| `StatusResposta` / `StatusFinalPuro` | Situação do fluxo |
| `MotivoStatus` | Lista de motivos do fluxo |
| `DadosProposta.Submit.Inputs` | Lista `{ Name, Value }`: `PROP_CPF`, `PROP_NOME`, `PROP_RENDA_PESSOAL`, `PROP_DATA_NASCIMENTO`, `PROP_ENTRADA_VALOR`, `PROP_GARANTIA_VALOR`, `PROP_IMEI`, `PROP_LOJA`, `PROP_LOJISTA`... |
| `RegrasDeNegocios` | `calculaRisco`, `validaRendavalores`, `validaEmails`, `validaTelefones`, `validaEnderecos`, `validaAparelho`, `validaBiometria`, `validaFacematch`, `validaDocumentos`, `validaTipoDoc`, `validacaoCadastral` |
| `Biros` | `SPCBrasil`, `PH3A`, `DocValid`, `Facematch`, `TabelaIMEI`, `Tipificacao` (e `Midia100` em algumas execuções) |

Atalho usado abaixo: `SPC` = `Biros.SPCBrasil.result.return_object.resultado`.

### Campos da coleta → caminho no JSON

| Campo (`dados`) | Hoje (árvore, `extrairDeLista`) | No JSON | Exemplo |
|---|---|---|---|
| `qtd` | `QuantidadeRestritivos` dentro de `calculaRisco` (P1); reserva `quantidadeTotal` em `pendenciaFinanceira` | `fluxos_P1[0].RegrasDeNegocios.calculaRisco.QuantidadeRestritivos`; reserva `SPC.pendenciaFinanceira.resumo.quantidadeTotal` | `3` |
| `val` | `ValorRestritivos` dentro de `calculaRisco`; reserva `valorTotal` em `pendenciaFinanceira` | `fluxos_P1[0].RegrasDeNegocios.calculaRisco.ValorRestritivos`; reserva `SPC.pendenciaFinanceira.resumo.valorTotal` | `2063.12` |
| `score` | `valorScore` / `score` / `quantidadeTotal` dentro de `scoreCadastroPositivo`; reserva `(score=N)` na mensagem | `SPC.scoreCadastroPositivo.detalheScoreCadastroPositivo[0].score`; reserva `SPC.scoreCadastroPositivo.resumo.quantidadeTotal` | `478` |
| `consultas` | `quantidadeTotal` dentro de `consultaRealizada` (P2 primeiro) | `fluxos_P2[0]` → `SPC.consultaRealizada.resumo.quantidadeTotal` (reserva: P1) | `0` |
| `cpf` | Nó `Cpf` (11 dígitos) | `fluxos_P1[0].Cpf` | `00000000000` |
| `reprov` | Texto da página: `(Pn) Reprovar: ... (atual=...)` | Itens de `data["Resumo proposta"].motivoStatus` (e `MotivoStatus` de cada fluxo) que contêm `Reprovar:` | `(P1) Reprovar: renda inferior ... (atual=R$1300)` |
| `rendaBiro` | Nó `RendaCalculo` | `fluxos_P1[0].RegrasDeNegocios.validaRendavalores.RendaCalculo` | `5000` |
| `rendaInf` | Cartão "Renda informada" (tela) | `DadosProposta.Submit.Inputs[Name=PROP_RENDA_PESSOAL].Value` | `"5000"` |
| `nome` | Cartão "Nome do cliente" (tela) | `DadosProposta.Submit.Inputs[Name=PROP_NOME].Value` | `"NOME FICTICIO"` |

### Proposta reprovada (amostra de 11/11/2026)

Diferenças em relação a uma proposta que passou pelos dois fluxos:

| Ponto | Proposta reprovada no P1 |
|---|---|
| Fluxos | Só `fluxos_P1`; **não existe `fluxos_P2`** |
| `statusFinal` / `StatusResposta` | `"R - Reprovado"` |
| `motivoStatus` | `["(P1) Reprovar: cliente abaixo do ponto de corte (score=344)"]` — formato `Reprovar:` confirmado |
| `RegrasDeNegocios.calculaRisco` | **`null`** → `qtd`/`val` vêm da reserva `SPC.pendenciaFinanceira.resumo` (`quantidadeTotal: 1`, `valorTotal: 3418.2`) |
| `RegrasDeNegocios.validaRendavalores` | **`null`** → sem `RendaCalculo` (`rendaBiro` vazio, como hoje) |
| `classificacaoRiscoDeCredito` | Presente: `valorScore: "344"` (texto), `Status`, `PontoCorte`, `riscoCredito` |
| Consultas | Só no P1: `SPC.consultaRealizada.resumo.quantidadeTotal` (`3`) |
| `Biros` | Só `SPCBrasil` |

Conclusões para o leitor:
- Regras de negócio podem vir `null`: tratar `null` como "não calculado" e usar a reserva, nunca como zero.
- `consultas` usa P2 quando existe e P1 quando não existe, como o código já faz.
- `score` também está em `RegrasDeNegocios.classificacaoRiscoDeCredito.valorScore` (texto). É o `valorScore` que o código atual procura primeiro.
- `reprov`: juntar os itens de `motivoStatus` que contêm `Reprovar:` com ` ¦ `, como o código atual.

Também disponível em `calculaRisco`: `Status`, `Regra`, `Idade`, `QuantidadePassagens`, `FonteValorRestritivos`, `FonteQuantidadeRestritivos`.

### Cuidados para o leitor

- **Números já vêm como número** (`2063.12`, ponto decimal). Não passar por `num()`, que trata ponto como milhar: converter só na exibição. Os `Inputs` vêm como texto (`"5000"`, `"300,00"`).
- **Várias execuções:** `fluxos_Pn` é lista. Hoje `podarExecucoes` mantém só a mais recente; no JSON, escolher pelo `Timestamp` mais recente (amostra com uma execução por fluxo; confirmar a ordem quando houver mais de uma).
- **Conferir a proposta:** comparar `IdProposta` com o id da coleta (`atualId`) antes de gravar, como a coleta já confere o CPF.
- **Campo ausente ≠ zero:** `consultaRealizada.detalheConsultaRealizada` vazio com `resumo.quantidadeTotal: 0` é zero real; ausência do bloco `SPC` é "não lido".
- **Sucesso da resposta:** `codigo_retorno === 0` e `mensagem_retorno === "Dados localizados"`; outros valores tratar como falha com o motivo da mensagem.
- **Dados pessoais:** a resposta inclui telefone, e-mail, endereços, documentos e biometria (`PH3A`, `DocValid`, `Facematch`). O leitor extrai só os campos da tabela; o JSON completo nunca é gravado em `GM_setValue` nem em `debug`.

### Pendências

1. ~~Requisição~~ **Resolvido:** `POST` com corpo JSON `token` + `flagUltimos`.
2. ~~Origem do token~~ **Resolvido:** é o caminho do link do iframe; um token novo a cada `MesaAnaliseMobFacil`. Validade do token e reaproveitamento: não testados (gerar um token novo a cada coleta, como a tela faz).
3. ~~Proposta reprovada~~ **Resolvido** (seção acima).
4. **Mais de uma execução por fluxo:** confirmar a ordem da lista e o efeito de `flagUltimos: true`.

### Como usar (proposta para P0.6)

O script já roda dentro do iframe do motor (`iniciarMotor`, mesmo domínio de `/api/visualizador`). Duas opções, a decidir com as pendências acima:

- **Escutar a resposta** que o próprio motor recebe (interceptar `fetch`/`XMLHttpRequest` no iframe). Não precisa saber como o token é enviado e não gera requisição extra.
- **Chamar a rota direto** do iframe, com os mesmos parâmetros. Mais controle, mas depende da forma de envio do token.

Nos dois casos não há requisição entre domínios, então não é preciso `@connect`. A leitura atual pela árvore continua como plano B. Mudança no motor = Categoria B (P0.6).

---

## Rotas do ER

Inventário preliminar em `docs/PLANO-API-ER.md`, seção 3. Detalhar aqui por rota (método, parâmetros, formato, leitor) à medida que cada módulo for migrado.

### Mesa de Crédito (HAR de 11/11/2026)

Base: `https://paymobi.ercard.com.br:9191/ErCardWeb/` (o ER usa barra dupla: `ErCardWeb//Rota`). Todas com o cookie de sessão.

| Rota | Método | Parâmetros | Resposta |
|---|---|---|---|
| `/MesaCredito/MesaCredito` | POST | — | HTML da tela da Mesa |
| `/MesaCredito/MesaCreditoLista` | GET | `strDados` = JSON com os filtros (`strDataInicial`, `strDataFinal`, `strProduto`, `strSituacao`, `strReanalise`, `strMesa`, `strTipoData`...) | HTML com a lista de propostas |
| `/MesaCredito/MesaAnaliseProposta` | GET | `lngProposta` | HTML da análise da proposta |
| `/MesaCredito/DetalheProposta` | GET | `lngProposta` | HTML (`#frmMesaAnalise`) com o detalhe |
| `/MesaCredito/MesaAnaliseMobFacil` | GET | `lngProposta` | HTML com o `<iframe src>` do motor (token) |
| `/MesaCredito/MesaAnaliseDocumentos` | GET | `lngProposta`, `blnDocumentosAnteriores=false` | HTML com a lista de documentos |
| `/Documentos/BaixaDocumento` | POST | `lngDocumento`, `strGerarArquivo=S`, `blnGerarUnicoPdf=false` | PDF (no HAR, conteúdo em base64) |
| `/MesaCredito/PreencheAnalistas` | POST | — | **JSON** `[{ strAnalista, strNome }]` |
| `/MesaCredito/PreencheMesasUsuario` | POST | — | **JSON** `[{ strMesa, strDescricao }]` |
| `/VendasLojistas/PreencheProdutosUsuario` | POST | — | **JSON** `[{ Produto, Abreviatura, Nome, Segmento... }]` |
| `/Notificacoes/VerificaQtdNotificacoes` | GET | — | Texto com o número de notificações (consulta periódica da tela) |

### Fila de Propostas (HAR de 11/11/2026)

| Rota | Método | Parâmetros | Resposta |
|---|---|---|---|
| `/FilaPropostas/FilaPropostas` | POST | — | HTML da tela |
| `/FilaPropostas/PreencheProdutosUsuario` | POST | — | **JSON** `[{ Produto, Abreviatura, Nome, Segmento... }]` |
| `/FilaPropostas/FilaPropostasLista` | GET | `strDados` = JSON com os filtros (`strDataInicial`, `strDataFinal`, `strLojista`, `strLoja`, `strProduto`, `strSituacao`, `strSituacaoDocumentos`, `strPagamento`, `strStatusAssinatura`, `strTipoData`, `strAnalista`...) | HTML com a lista |
| `/FilaPropostas/DetalheProposta` | GET | `lngProposta` | HTML do detalhe |

O código dos CCBs hoje aciona `DetalhePropostaCadastro` e `DetalhePropostaDocumentos` pelos objetos da página (`PAGINA.objFilaPropostas...`) e espera a resposta (`aguardarResposta`). Essas rotas não apareceram neste HAR: mapear numa leitura de CCB.

### Central de Atendimento — CAC (HAR de 11/11/2026, pesquisa pelo CPF)

Sequência da tela do ER ao abrir um cliente:

| Ordem | Rota | Método | Parâmetros | Resposta |
|---|---|---|---|---|
| 1 | `/CentralAtendimento/CentralAtendimento` | POST | — | HTML da tela |
| 2 | `/CentralAtendimento/CentralPesquisaCliente` | GET | `strCliente` (CPF) | HTML com a tabela de clientes |
| 3 | `/CentralAtendimento/BuscaCartao` | GET | `strProduto`, `strCartao` | **JSON** (lista com 1 objeto): `strResultado`, `strCpfCnpjCliente`, `strNomeCliente`, `strSituacaoCartao`, limites, `lngProtocoloAtendimento`, `strValidarDadosCliente`, `lstProdutos`... |
| 4 | `/CentralAtendimento/CentralInicio` | POST | `strProduto`, `strCartao`, `lngProtocolo` | HTML da **Posição Geral** (dados do cliente, score, contratos) |
| 5 | `/CentralAtendimento/DetalheCompra` | GET | `strAutorizacao` | HTML do contrato (parcelas) |
| 6 | `/CentralAtendimento/CentralPagamentos` | GET | `strProduto`, `strCartao`, `lngAutorizacao` | HTML dos pagamentos do contrato |
| 7 | `/Dataprev/Consulta` | GET | — | HTML (carregado junto com o contrato) |
| 8 | `/Dataprev/ConsultaContrato` | POST | `lngProposta`, `lngAutorizacao`, `strContrato` | **JSON** `{ Mensagem }` |
| 9 | `/CentralAtendimento/CentralFinalizaProtocolo` | GET | `strProtocolo` | HTML (encerra o atendimento) |

**Protocolo de atendimento (atenção à regra "somente leitura"):**
- `BuscaCartao` já devolve um `lngProtocoloAtendimento`, antes de qualquer outra tela. Não está confirmado se o protocolo é criado nessa chamada ou só ao abrir a Posição Geral (`CentralInicio`), como diz `docs/script/07-cac.md`.
- `CentralFinalizaProtocolo` **altera estado no ER** (encerra o protocolo). A camada `er` não pode chamá-la.
- O script chama `BuscaCartao` em toda consulta CAC e `CentralInicio` só com `cacPosicaoGeral` ligado. Antes de migrar o CAC (P0.5), confirmar na tela de protocolos do ER se uma consulta só com `BuscaCartao` + `CentralCompras` + `DetalheCompra` gera protocolo.

`CentralCompras` (usada pelo script quando a Posição Geral está desligada) não apareceu neste HAR.

### Fila de Pendências (HAR de 11/11/2026)

| Rota | Método | Parâmetros | Resposta |
|---|---|---|---|
| `/FilaPendencias/FilaPendencias` | POST | — | HTML da tela (filtros e listas de códigos) |
| `/FilaPendencias/FilaPendenciasLista` | GET | `strPendencia`, `strTipoRepasse=R`, `strTipoPendencia=T`, `strProduto`, `strLojista`, `strLoja`, `strDataInicial`, `strDataFinal`, `strTipoData=S`, `strCliente`, `lngAutorizacao`, `lngProposta`, `strPromotora`, `strPromotoraFilial`, `strAgrupamento=N`, `strReembolso`, `strTipoBloqueio`, `strTipoDocumento`, `strConveniada`, `strPlano` | HTML com a tabela: Pend, Sit, Autorização, Nome, CPF, Lojista, Loja, Data Compra, Valor |
| `/FilaPendencias/DetalheCompra` | GET | `strAutorizacao`, `strPendencia`, `strTipoConsulta=P` | HTML do detalhe (do código atual; não aberto neste HAR) |

Diferença em relação ao script (`pdLista`): a tela envia `strPendencia` com todos os códigos (`10,07,15,04,05,02,03,11,12,16,09,19,17,18,14,06,08`) e `strProduto=0001`; o script envia os dois vazios ("todos") e data inicial `01/01/2020`. Os dois funcionam (o relatório foi validado no ER real). Se um dia o ER passar a exigir esses campos, o leitor da rota é o único ponto a ajustar.

Códigos de pendência (da tela): 02 Conferência CPF · 03 Conferência identidade · 04 Conferência comprovante de renda · 05 Conferência comprovante de residência · 06 Termo de adesão assinado · 07 CCB assinada · 08 Termo de seguro assinado · 09 NF do lojista · 10 Ativação da licença · 11 Contrato social · 12 Declaração de faturamento · 14 Registro de boletos · 15 Comprovação NF de entrega · 16 Gravames · 17 PF ficha cadastral · 18 PJ ficha cadastral · 19 Nota fiscal ou conhecimento de transporte.

Situação (`strTipoPendencia`): `T` todas pendentes · `A` aberta · `P` pendente · `R` retorno · `B` baixada · `C` cancelada · vazio = todas.

Ainda não mapeadas com HAR: CAC pela pesquisa por nome (conta master), `DetalhePropostaCadastro`/`DetalhePropostaDocumentos` e `CentralCompras`.
