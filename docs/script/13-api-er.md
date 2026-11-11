# Rotas do ER e do motor MobFacil (mapeamento da P0)

> Mapeamento das rotas usadas pelo script, para a camada `er` (P0 do `PRIORIDADES.md`, plano em `docs/PLANO-API-ER.md`).
> Exemplos com valores fictícios. Nunca registrar aqui cookies, tokens ou dados de clientes reais.

---

## Autenticação

| Sistema | Como autentica | Fonte |
|---|---|---|
| ER (`paymobi.ercard.com.br:9191/ErCardWeb/`) | Cookie `ASP.NET_SessionId`. Cookie anti-falsificação `__RequestVerificationToken_*`, normalmente exigido em POST de formulário | Requisição real em 11/11/2026 (`/Notificacoes/VerificaQtdNotificacoes`) e código |
| Motor MobFacil (`enviamotor.mobfacil.com.br`) | Token JWT associado ao link do iframe (a resposta ecoa `"parametro": "TokenJWT"`). Forma exata de envio: **a confirmar** | Resposta real de `/api/visualizador` em 11/11/2026 |

Observações:
- O servidor do ER é IIS 10 + ASP.NET MVC 5.2. As rotas devolvem principalmente HTML montado no servidor.
- `access-control-allow-origin: *` em respostas do ER não permite uso a partir de outro domínio com a sessão: o navegador não envia cookies para respostas com `*`.

---

## Motor MobFacil — `/api/visualizador`

**URL:** `https://enviamotor.mobfacil.com.br/api/visualizador`
**Resposta:** `application/json; charset=utf-8`
**Método, parâmetros e cabeçalhos da requisição:** a confirmar (ver Pendências).

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

Também disponível em `calculaRisco`: `Status`, `Regra`, `Idade`, `QuantidadePassagens`, `FonteValorRestritivos`, `FonteQuantidadeRestritivos`.

### Cuidados para o leitor

- **Números já vêm como número** (`2063.12`, ponto decimal). Não passar por `num()`, que trata ponto como milhar: converter só na exibição. Os `Inputs` vêm como texto (`"5000"`, `"300,00"`).
- **Várias execuções:** `fluxos_Pn` é lista. Hoje `podarExecucoes` mantém só a mais recente; no JSON, escolher pelo `Timestamp` mais recente (amostra com uma execução por fluxo; confirmar a ordem quando houver mais de uma).
- **Conferir a proposta:** comparar `IdProposta` com o id da coleta (`atualId`) antes de gravar, como a coleta já confere o CPF.
- **Campo ausente ≠ zero:** `consultaRealizada.detalheConsultaRealizada` vazio com `resumo.quantidadeTotal: 0` é zero real; ausência do bloco `SPC` é "não lido".
- **Sucesso da resposta:** `codigo_retorno === 0` e `mensagem_retorno === "Dados localizados"`; outros valores tratar como falha com o motivo da mensagem.
- **Dados pessoais:** a resposta inclui telefone, e-mail, endereços, documentos e biometria (`PH3A`, `DocValid`, `Facematch`). O leitor extrai só os campos da tabela; o JSON completo nunca é gravado em `GM_setValue` nem em `debug`.

### Pendências

1. **Requisição:** método (GET/POST), parâmetros (query ou corpo) e cabeçalhos (ex.: `Authorization`). Ver na aba **Cabeçalhos** e **Payload** da requisição no DevTools.
2. **Origem do token:** se vem no link do iframe obtido em `/MesaCredito/MesaAnaliseMobFacil`.
3. **Proposta reprovada:** capturar a resposta de uma proposta reprovada para confirmar o formato de `Reprovar:` em `motivoStatus`.
4. **Mais de uma execução por fluxo:** confirmar a ordem da lista.

### Como usar (proposta para P0.6)

O script já roda dentro do iframe do motor (`iniciarMotor`, mesmo domínio de `/api/visualizador`). Duas opções, a decidir com as pendências acima:

- **Escutar a resposta** que o próprio motor recebe (interceptar `fetch`/`XMLHttpRequest` no iframe). Não precisa saber como o token é enviado e não gera requisição extra.
- **Chamar a rota direto** do iframe, com os mesmos parâmetros. Mais controle, mas depende da forma de envio do token.

Nos dois casos não há requisição entre domínios, então não é preciso `@connect`. A leitura atual pela árvore continua como plano B. Mudança no motor = Categoria B (P0.6).

---

## Rotas do ER

Inventário preliminar em `docs/PLANO-API-ER.md`, seção 3. Detalhar aqui por rota (método, parâmetros, formato, leitor) à medida que cada módulo for migrado.
