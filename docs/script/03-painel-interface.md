# Módulo: Painel Principal e Interface

**Linhas:** 837 – 2880 (bloco `iniciarPainel`)  
**Funções principais:** `iniciarPainel()`, `atualizarUI()`, `atualizarConfigUI()`

---

## Responsabilidade

Este módulo cria e gerencia o **painel flutuante** que aparece sobre o ER. Ele é responsável por:

- Renderizar a estrutura do painel (barra de título, abas, conteúdo)
- Controlar o arrastar e redimensionar do painel
- Gerenciar a navegação entre abas
- Executar o loop principal da coleta de auditoria
- Gerenciar a fila de propostas (ler da tela, iniciar, pausar, continuar)
- Exibir o status e a barra de progresso em tempo real
- Renderizar a aba Relatórios (Auditoria, Diário, Reprovadas, Efetivadas, Aprovadas)

---

## Interface e aparências

O painel suporta duas aparências selecionáveis em Configurações:

| Aparência | Descrição |
|---|---|
| **Nova** (`data-ui="nova"`) | Visual moderno com bordas suaves, abas compactas e botões com contorno |
| **UI Antiga** | Visual anterior com cores sólidas nos botões |

Ambas usam a mesma estrutura HTML e compartilham o mesmo CSS base. A nova UI adiciona regras com o seletor `[data-ui=nova]`.

### Camada visual da Nova UI (bloco "Nova UI v13")

No fim do `<style>` do painel há um bloco só de CSS, todo escopado em `#mf-p[data-ui=nova]`. Ele não altera HTML, IDs, textos nem JavaScript; a UI Antiga não é afetada.

- **Tokens de cor** (`--mf-bg`, `--mf-sup`, `--mf-borda`, `--mf-txt*`, `--mf-pri*`, `--mf-ok*`, `--mf-perigo*`, `--mf-alerta*`) definidos em `#mf-p[data-ui=nova]` e redefinidos em `[data-tema=escuro]`. Novas regras visuais devem usar esses tokens.
- **Cartões:** `.mf-sec` e `.mf-grupo` aparecem como cartões sobre o fundo `--mf-bg` do `.mf-corpo`.
- **Ícones:** desenhados com `mask` + `--mf-ico` (SVG inline) nas abas (`data-aba` / `data-ui-aba`), no menu "Mais" (`data-vai`), nos botões do título (`#mf-tam`, `#mf-tema`, `#mf-min`, `.mf-ui-icone`), no ⓘ e nos grupos recolhíveis. O estado dos ícones vem de atributos que o código já mantém (`.mf-min`, `data-tema`, `title` do `#mf-tam`).
- **Abas fixas:** `.mf-abas` usa `position: sticky` dentro do `.mf-corpo` e continua visível ao rolar.
- **Botões:** os botões principais (azul) e de cópia (verde) continuam definidos pela mesma lista de IDs; `.vermelho` e `.laranja` ficam só no contorno e no texto.
- **Topo compacto:** o topo tem 44–48 px e as abas 49 px. Os botões de ícone do topo são sempre quadrados de 28 px. Na Nova UI, a conta ativa (`.mf-ui-chip`, abre Contas) fica na 2ª linha do título, ao lado da versão. Ela é movida depois de os eventos serem ligados, para o nome "PaymobiFin - Assistente" não ser cortado no painel estreito. Tem a classe `mf-ui-nova`, então não aparece na UI Antiga, e some com o painel minimizado.
- **Aba ativa:** `mostrarAba()` grava a aba em `#mf-p[data-aba-ativa]`, só para o CSS (ex.: regras que valem só no Atendimento). Não use `data-aba` no painel: esse atributo é dos botões das abas.
- **Aviso (`#mf-msg`) na aba Atendimento:** fica preso no rodapé da rolagem (`position: sticky`), porque a aba é longa e o aviso fica no fim do painel. O × no canto (clique nos 30 px do canto superior direito) põe a classe `mf-msg-fechada`; `msg()` tira a classe no próximo aviso. Nas outras abas e na UI Antiga o aviso continua como era.
- **Grupos recolhíveis:** o aberto/fechado de cada `.mf-grupo` é guardado em `gruposCfg` pela chave `data-grupo`. Todo grupo novo precisa de `data-grupo` próprio. Sem ele, todos os grupos sem chave dividem a chave `undefined`: recolher um recolhe os outros no próximo carregamento. Ainda estão sem chave os 4 grupos de Lembretes e Timers.

### Estrutura do painel

```
┌─────────────────────────────────────┐
│ ■ PaymobiFin - Assistente  v13.29.2 │  ← barra de título (arrastar, minimizar)
├─────────────────────────────────────┤
│ Atendimento | Histórico | Agenda | Relatórios | Mais ▾ │  ← abas
├─────────────────────────────────────┤
│                                     │
│          conteúdo da aba            │
│                                     │
└─────────────────────────────────────┘
       ↗ alça redimensionar (canto)
```

### Menu "Mais ▾"

Itens que ficam ocultos nas abas principais são acessados pelo menu dropdown:
- Consulta CAC
- CCBs
- Contas
- Configurações

---

## Coleta de auditoria

### Fila de propostas

A fila é uma lista de IDs de propostas armazenada em `GM_getValue('fila')`. O fluxo de coleta:

1. **Ler propostas elegíveis** — lê os IDs da tabela da Fila de Propostas do ER
2. **Iniciar / Continuar** — começa o loop de coleta
3. Para cada proposta pendente:
   - Abre a página da proposta no motor (`enviamotor.mobfacil.com.br`)
   - Aguarda o iframe coletar os dados (sinal via `GM_getValue('fim')`)
   - Lê o resultado e marca a proposta como feita
4. **Pausar** — interrompe e salva o estado
5. **Copiar resultado** — gera o texto formatado para colar na planilha

**Sessão do ER expirada no meio da fila:** com a sessão vencida, o ER responde toda leitura com a página de aviso (`/AvisoSessao/AvisoSessao`, HTTP 200; ver `erSemSessao`). O detalhe da proposta, a aba Cliente e o link do motor reconhecem esse aviso e devolvem `SESSAO_EXPIRADA`: a fila **pausa** na proposta atual, sem gravar nada dela (`extra` fica vazio e a proposta não entra em `feitas`), e avisa "A sessão do ER expirou (proposta N)... Entre no ER de novo e clique em Continuar". Antes da v13.29.0 o aviso era lido como uma página sem dados: no Diário as propostas saíam N/A e a fila terminava como concluída.

### Modos de operação

| Modo | O que coleta |
|---|---|
| `coleta` (auditoria completa) | qtd, val, score, consultas, CPF, motivo de reprovação |
| `aprovadas` | Apenas CPF |
| `reprovadas` | Apenas motivo de reprovação |

### Manter aba ativa

Durante a coleta, o módulo usa duas técnicas para evitar que o navegador reduza a velocidade da aba quando ela está em segundo plano:

- **AudioContext** com oscilador inaudível (ganho 0,0005)
- **Web Lock** (`navigator.locks.request`) mantendo a aba bloqueada

### Batida (heartbeat)

A cada 1 segundo, grava `Date.now()` em `GM_getValue('batida')`. Outra aba do paymobi que abrir verifica esse valor — se a batida for recente, não assume o controle da coleta.

---

## Relatórios

A função `relatorioCols(m, id, d, processada)` monta as colunas de resultado para cada modo:

| Relatório | Colunas |
|---|---|
| Auditoria | Proposta, Nome, CPF, IMEI, Qtd Restritivos, Valor Restritivos, Score, Consultas, Motivo Reprovação |
| Diário | Propostas do dia com resultado |
| Reprovadas | Apenas propostas reprovadas: situação com "REP", "REPR" ou "REPROV" (ex.: "17 - PRE PROP REP", "07 - REPR AUT"), a mesma regra de `ehReprovada` |
| Efetivadas | Apenas propostas aprovadas e efetivadas |
| Aprovadas | Propostas aprovadas (com CPF) |

**Diário: visão geral do dia** (`diarioTudo`, padrão ligado; Configurações, ao lado de "Ignorar canceladas e testes"):
- **O que entra:** canceladas e em digitação (CONF CAD), além de aprovadas, reprovadas e pendentes (as pendentes já entravam). A Situação Relatório sai como "Cancelada", "Em digitação" ou "Pendente" (`statusDiario`). Só as propostas de teste continuam fora.
- **Onde vale:** em "Ler da tela", no Iniciar e no detalhe da proposta (`motivoFora`, `verificarRemoto` e `motivoDetalhe` não contam "cancelada" com a opção ligada). Em digitação sem valor de compra não aparece como incompleta; o valor sai N/A.
- **Os outros relatórios e a Auditoria não mudam.**
- **Aviso ao lado de "Ler da tela"** (`#mf-filtro`): no Diário com a opção ligada mostra "Incluindo canceladas (sem testes)", e a dica do mouse cita as em digitação. Nos outros relatórios continua "Ignorando canceladas e testes". Com "Ignorar canceladas e testes" desligado, "Incluindo canceladas e testes" em qualquer relatório.

**Valor de transação (Diário e Aprovadas):** `valorTransacao()` usa o "Valor da Compra" da Operação de Crédito (`extra.compra`). O "Valor" do bloco Garantias (`extra.valor`) é o valor cadastrado do aparelho e, nas aprovações automáticas, vem simbólico (R$ 0,01, R$ 1,00...); ele só entra quando a página não tem Valor da Compra. Sem nenhum dos dois, N/A. A escolha é feita na hora de montar o relatório, então vale também para propostas já coletadas.

### Relatório de Pendências (`pd`, bloco "RELATÓRIO DE PENDÊNCIAS")

Seção **Pendências** na aba Relatórios: lista as propostas com pendência em aberto na **Fila de Pendências** (Serviços), que fica na conta master. É só leitura: nenhum botão da tela de pendências é usado (nada é baixado, cancelado nem anexado).

1. **Lista** — `GET /FilaPendencias/FilaPendenciasLista` com o filtro "TODAS PENDENTES" (`strTipoPendencia=T`), sem agrupar, de `PD_DESDE` (01/01/2020) até hoje. Lê Pend, Autorização, Nome e Data Compra pelo cabeçalho. Sem pendências, o ER devolve só o aviso "Não foi localizada nenhuma pendência".
2. **Detalhe de cada autorização** — `GET /FilaPendencias/DetalheCompra?strAutorizacao=N&strPendencia=P&strTipoConsulta=P` (a tela "Manutenção de Pendência", só lida): Nro da Proposta, Usuário (vendedor), Lojista e Loja (`pdDl`, primeiro `dd` de cada `dt`). Pausa de `CONFIG.PD_PAUSA_MS` entre um detalhe e outro.
3. **Texto** — mais recentes primeiro (autorização maior), um bloco por proposta, separados por 66 traços:
   ```
   Proposta: 5017
   Pendência: 10
   Cliente: REGINALDO ARAUJO
   Vendedor: GUILHERME A. MELO
   Autorização: 2689
   Data: 08/11/2026
   Loja: XPANSE NEGOCIOS LTDA - ITAQUERA
   ```
   - **Pendência:** o código do tipo (10 = Ativação da licença, 07 = CCB assinada...). Com mais de uma em aberto, sai "07, 10".
   - **Vendedor** (`pdVendedor`): o Usuário sem o código e sem o sufixo da loja ("5170086580 - GUILHERME A. MELO-XP ITAQUERA AT" → "GUILHERME A. MELO").
   - **Loja** (`pdLoja`): nome do lojista + nome da loja, sem os códigos ("XPANSE NEGOCIOS LTDA - 000004" + "XPANSE - ITAQUERA - 0009" → "XPANSE NEGOCIOS LTDA - ITAQUERA").
   - Detalhe que não abre: proposta, vendedor e loja saem N/A, e o status avisa quantas ficaram assim.
4. **Conta master** — com a conta master escolhida em Configurações > Consulta CAC e "Trocar automaticamente para a conta master" ligado, o "Gerar relatório" numa conta que não é a master troca para ela e gera sozinho depois do login (`pdRetomar`, estado em `sessionStorage` `mfPendencias`, vale 15 min). Sem master escolhida, gera com a conta atual e, se ela não tiver a fila, avisa.
5. **Copiar** — copia o texto (`GM_setClipboard`). O último relatório fica na caixa enquanto a aba estiver aberta (`sessionStorage`), inclusive depois da troca de conta.
6. **Limpar** — o botão "Limpar" e o "Resetar" da coleta apagam o relatório da caixa e do `sessionStorage` (`pdLimpar`). Nada muda no ER.
7. **Seção recolhível** — o título "Pendências" abre e fecha a seção (`pdDobra`). Vem **fechada** e lembra a última escolha (GM `pdRecolhido`). Fechada, o título continua mostrando a quantidade do último relatório. Gerar depois da troca para a master abre a seção.

---

## Configurações

A aba de Configurações é montada por `atualizarConfigUI()` e expõe todas as preferências do objeto `PADRAO`:

| Configuração | Padrão | Descrição |
|---|---|---|
| `auditoriaCompleta` | `true` | Inclui CPF e motivo na coleta |
| `ignorarCanceladasTestes` | `true` | Pula propostas canceladas e de teste |
| `formatoAuto` | `true` | Formato de cópia definido pelo modo |
| `aparencia` | `'nova'` | UI Nova ou UI Antiga |
| `copiarAoConcluir` | `true` | Copia resultado automaticamente ao terminar a fila |
| `trocaSemConfirmacao` | `true` | Troca de conta sem janela de confirmação |
| `lerAbaCliente` | `true` | Lê dados da aba Cliente da análise |
| `tmExpedienteAuto` | `true` | Inicia timers de expediente ao entrar no ER |
| `cacTrocaAuto` | `true` | Troca para conta master automaticamente na CAC |
| `cacVoltarConta` | `true` | Volta para conta anterior após CAC |
| `cacPosicaoGeral` | `true` | Abre Posição Geral na CAC |
| `navAuto` | `true` | Navegação automática de tela |
| `equipeAtiva` | `false` | Compartilhamento com a equipe (Pusher) |

---

## Busca de proposta e detalhe

`buscarDetalhe(base, id)` — abre a proposta no motor e aguarda o resultado. Usado pelo relatório para exibir detalhes de uma proposta já coletada.

---

## Arrastar e redimensionar

- **Arrastar:** evento `pointerdown` na barra de título; movimenta com `pointermove`; respeita os limites da tela
- **Redimensionar:** três alças (`mf-rz-d` direita, `mf-rz-b` baixo, `mf-rz-c` canto); ao redimensionar, aplica `mf-tam-livre` para usar dimensões absolutas
- O estado de posição e tamanho é salvo no armazenamento e restaurado ao recarregar
