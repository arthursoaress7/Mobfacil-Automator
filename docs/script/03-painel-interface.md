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

### Estrutura do painel

```
┌─────────────────────────────────────┐
│ ■ PaymobiFin - Assistente   v12.1   │  ← barra de título (arrastar, minimizar)
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
| Reprovadas | Apenas propostas reprovadas |
| Efetivadas | Apenas propostas aprovadas e efetivadas |
| Aprovadas | Propostas aprovadas (com CPF) |

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
