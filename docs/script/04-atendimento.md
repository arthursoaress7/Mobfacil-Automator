# Módulo: Atendimento (Negociação e Renegociação)

**Linhas:** 4546 – 4834  
**Gerador de textos:** 3274 – 4160  
**Funções principais:** `atDesenhar()`, `atLinhas()`, `atMontarPlano()`, `ngGerarTextos()`, `ngFrases()`

---

## Responsabilidade

O módulo de Atendimento centraliza o registro de negociações e renegociações. Ele mantém uma **ficha única em memória** que serve tanto para a aba Negociação quanto para a Renegociação — o que foi digitado em uma aparece na outra. Nada é salvo até clicar em "Registrar no histórico".

---

## Modelos

### Modelo 1 — Negociação

Campos organizados em blocos:

| Bloco | Campos |
|---|---|
| **Cliente** | Proposta\*, Nome\*, CPF, IMEI, Data da proposta, Filial, Atendente, Número de contato (RD Station)\*, Quem negociou, Data do contato (padrão: hoje) |
| **Cobrança** | Valor parcela, FPD, Parcelas em atraso, Dias atraso, Vencimento mais antigo, Parcela atual |
| **Acordo** | Resultado\* (fechou / solicitou / não concluída) + Modalidade\* + campos da modalidade |
| **Textos** | Pedido do cliente, Acordo Realizado, A partir de qual parcela |
| **Acompanhamento** | 12 colunas opcionais (botão "Trazer do acordo" preenche data e quantidade) |

### Modelo 2 — Renegociação

Aproveita o bloco Cliente do Modelo 1 e acrescenta:

| Bloco | Campos |
|---|---|
| **Acordo** | Modalidade\* (resultado fixo = fechou) |
| **Textos** | Acordo Solicitado, Acordo Realizado |
| **Renegociação** | Responsável\*, Formalizou (SIM), Data renegociação, Contrato novo, Observação, Régua, Recebeu boletos, Concluída |
| **Plano de parcelas** | Tabela editável gerada automaticamente a partir do acordo |

> **Número de contato:** é o número usado pelo cliente no RD Station. O telefone do cadastro da proposta nunca preenche esse campo automaticamente.

---

## Modalidades de acordo

Definidas em `NG_MODALIDADES`. Cada modalidade tem campos próprios, obrigatórios, texto de acordo e frases.

| Chave | Modalidade |
|---|---|
| `mensal` | Novo valor mensal |
| `parcelamento` | Parcelamento |
| `entrada` | Entrada + parcelas |
| `parcial` | Pagamento parcial + restante |
| `folego` | Campanha do Fôlego |
| `pix` | PIX semanal / Automático |
| `vencimento` | Alteração da data de vencimento |
| `antecipacao` | Antecipação / quitação |
| `regularizacao` | Regularização de parcela(s) em atraso |
| `semacordo` | Sem acordo / pagamento normal |

---

## Geração de textos

`ngGerarTextos(silencioso)` — monta os textos "Pedido do cliente" e "Acordo Realizado" com base na modalidade e nos campos preenchidos.

`ngFrases(tipo)` — retorna a frase do acordo para a modalidade atual, variando conforme o resultado:

| Resultado | Frase gerada |
|---|---|
| `fechou` | "Cliente fechou acordo de…" |
| `solicitou` | "Cliente solicitou…" (simulação) |
| `não concluída` | Apenas o pedido, sem frase de acordo |

A frase "Acordo Realizado" é idêntica à gerada na v11.38 (regressão validada com 14 casos).

---

## Plano de parcelas (Renegociação)

`atSugestao()` — sugere as linhas do plano com base na modalidade. Todas são editáveis antes de copiar.

`atMontarPlano()` — monta a lista de parcelas com campos: Ação, Valor, Vencimento, Situação, Valor Pago.

`atPlanoDesenhar()` — renderiza a tabela editável do plano.

### Regras das situações

- 1ª linha sempre = Entrada: situação `Efetivado (Entrada)`
- Na quitação: `Efetivado (Quitação)`
- Demais linhas: `Em Aberto`, Valor Pago = `N/A`

### Sugestão por modalidade

| Modalidade | Linhas sugeridas |
|---|---|
| Entrada + parcelas | Entrada (data da entrada) + N parcelas mensais |
| Novo valor mensal / Parcelamento | N parcelas mensais a partir do 1º vencimento |
| PIX semanal / Automático | N pagamentos semanais (+ entrada se informada) |
| Pagamento parcial / Fôlego | 2 linhas: valor agora + saldo restante |
| Antecipação / quitação | 1 linha com o valor |
| Regularização | N × valor ou 1 linha |
| Alteração de vencimento | N parcelas afetadas × novo valor |

> **Dia 31 em mês curto:** cai no último dia do mês (ex.: 28/02).

---

## Cópia para planilha

`atLinhas()` — monta as linhas prontas para colar na planilha.

### Negociação: 1 linha, 30 colunas

```
Proposta · Nome · CPF · IMEI · Data da Proposta · Filial · Atendente ·
Número Contato · Quem negociou · Data do Contato · Valor parcela · FPD ·
Parcelas Em Atraso · Dias Atraso · Vencimento Mais Antigo · A partir de qual
parcela pediu acordo · Pedido do cliente · Acordo Realizado · Data do envio da
proposta · Data 1° Pagamento · Vencimento(s) · Parcela(s) negociadas ·
Quantidade de parcelas · Pagamento da entrada · Disponibilizado boleto para o
cliente · Número Contrato Novo · Data Renegociação · Procedimento feito na
régua · Recebeu Boletos? · Negociação Concluída?
```

### Renegociação: 1 linha por parcela, 26 colunas

```
Proposta · Nome · Responsável pela Negociação · Formalizou o acordo? · CPF ·
IMEI · Data da Proposta (Contrato Original) · Data Renegociação · Filial ·
Atendente · Acordo Solicitado · Acordo Realizado · Valor parcela · Valor Pago ·
Número Contato · Data do Contato · Ação · Situação · Baixa Parcela ER ·
Quebra de Acordo · Vencimento · Observação · Número Contrato Novo ·
Procedimento feito na régua · Recebeu Boletos? · Negociação Concluída?
```

Formatos: valores `R$ 0,00`, datas `dd/mm/aaaa`, telefone `(11) 912345678`.

---

## Aplicar cliente atual

`atAplicarCliente()` — preenche os campos de cliente (Proposta, Nome, CPF, IMEI, Filial, Atendente) com os dados da Busca de cliente ativa. O campo Número de contato **nunca** é preenchido automaticamente.

---

## Mensagens para grupo

- **"Mensagem p/ grupo"** (botão no Atendimento): gera a mensagem da modalidade atual
- **Aba Mensagens**: acesso a todos os modelos — Pedido de negociação, Acordo realizado por modalidade, Retorno do setor, Campanha do Fôlego, Instrução de pagamento, Solicitação de negociação, Antecipação de parcela
- Modelos personalizados salvos em `negModelos`

---

## Funções auxiliares

| Função | Descrição |
|---|---|
| `atBloco(sel, campos)` | Renderiza um bloco de campos na interface |
| `atDesenhar()` | Monta toda a interface do Atendimento |
| `atTrocar(ctx)` | Alterna entre Negociação e Renegociação |
| `atSomarMeses(iso, n)` | Soma N meses a uma data ISO (respeitando últimos dias do mês) |
| `atPlanoCampos()` | Retorna os campos do plano de parcelas |
| `atValidar()` | Valida campos obrigatórios antes de registrar |
| `ngValor(k)` | Lê o valor atual de um campo do formulário |
| `ngMontar(modelo)` | Monta a interface do modelo selecionado |
| `ngDesenharCampos()` | Renderiza os campos da modalidade ativa |
| `ngCampoEl(c, rot, obrig)` | Cria o elemento HTML de um campo |
| `ngBlocosNova(grade, m)` | Organiza campos em blocos na Nova UI |
| `ngMostrarDependentes()` | Mostra/oculta campos dependentes da modalidade |
| `ngSaldoHook()` | Atualiza o saldo (total − pago) no pagamento parcial |
| `ngFaltando()` | Lista campos obrigatórios não preenchidos |
