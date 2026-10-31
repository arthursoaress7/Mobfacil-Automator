# Visão Geral do Script — automacaomobfacil.user.js

**Arquivo:** `automacaomobfacil.user.js`  
**Versão atual:** 12.1  
**Tipo:** Tampermonkey Userscript  
**Sites alvo:**
- `https://paymobi.ercard.com.br/*` — painel principal (ER)
- `https://enviamotor.mobfacil.com.br/*` — motor de análise de crédito

---

## O que o script faz

O **PaymobiFin - Assistente** é um userscript que adiciona um painel flutuante ao sistema ER da Paymobi. Ele automatiza e centraliza tarefas do dia a dia da equipe de cobrança e crédito:

- Coleta dados de análise de crédito diretamente da árvore do MobFacil (score, restritivos, consultas, CPF, motivo de reprovação)
- Gera e copia linhas formatadas para as planilhas de Negociação e Renegociação
- Registra e compartilha o histórico de acordos entre os funcionários
- Gerencia lembretes de pagamentos parciais com sincronização em equipe
- Realiza consultas CAC (Central de Atendimento ao Cliente)
- Faz download de CCBs em lote
- Permite troca rápida entre contas do sistema
- Gera mensagens de acordos para grupos de WhatsApp
- Fornece timers e agendamentos de expediente

---

## Estrutura de módulos

O script é dividido em dois pontos de entrada principais:

| Função | URL | Responsabilidade |
|---|---|---|
| `iniciarMotor()` | `enviamotor.mobfacil.com.br` | Coleta dados da árvore de análise de crédito dentro do iframe do motor |
| `iniciarPainel()` | `paymobi.ercard.com.br` | Renderiza o painel completo com todas as abas e funcionalidades |

### Módulos internos ao painel (`iniciarPainel`)

| Seção no código | Módulo | Linha aprox. |
|---|---|---|
| Leitura da árvore | Motor de coleta React | 114 |
| Iframe do motor | Navegação da árvore MobFacil | 375 |
| Interface base | Painel, abas, arrastar, redimensionar | 838 |
| CCBs | Download de certificados | 2881 |
| Contas | Troca rápida de conta | 3069 |
| Gerador de Negociações | Formulário + textos + planilha | 3274 |
| Lembretes | Pagamentos parciais (v2) | 3768 |
| Consulta CAC | Central de Atendimento | 4161 |
| Atendimento | Negociação e Renegociação | 4546 |
| Timers | Agendamentos de expediente | 4835 |
| Navegação/Aparência | Nova UI / UI Antiga | 5172 |
| Equipe | Compartilhamento via Pusher | 5273 |
| Histórico | Acordos registrados pela equipe | 5740 |
| Busca de cliente | Central de busca somente leitura | 5969 |
| Navegação automática | Troca de tela automática no ER | 6274 |

---

## Dependências e permissões

```
@grant  GM_setValue / GM_getValue / GM_deleteValue  — armazenamento persistente
@grant  GM_setClipboard                             — copiar para área de transferência
@grant  unsafeWindow                                — acesso aos objetos do site (React)
@grant  GM_xmlhttpRequest                           — requisições HTTP externas
@connect api-sa1.pusher.com                         — envio via Pusher
@require https://js.pusher.com/8.4.0/pusher.min.js  — biblioteca do Pusher
@run-at  document-idle                              — executa após o carregamento da página
```

---

## Armazenamento

Todos os dados ficam no armazenamento do Tampermonkey (por navegador). Nenhum dado é enviado para servidores externos, exceto as mensagens criptografadas do compartilhamento de equipe (Pusher).

Chaves principais:

| Chave | Conteúdo |
|---|---|
| `dados` | Resultados da coleta de crédito por proposta |
| `fila` / `feitas` / `ignoradas` | Controle da fila de auditoria |
| `mfLembretes` | Lembretes de pagamentos (v2) |
| `mfAcordos` | Histórico de acordos (30 dias) |
| `equipeNome/Secret/Chave/Ativa` | Configuração do compartilhamento |
| `negModelos` / `negModalidade` | Modelos e preferências de negociação |
| `navAuto` | Estado da navegação automática |

Documentação completa das chaves: ver [README principal](../../README.md#9-armazenamento-tampermonkey).

---

## Documentação por módulo

- [02 - Motor de Coleta (MobFacil)](./02-motor-coleta.md)
- [03 - Painel Principal e Interface](./03-painel-interface.md)
- [04 - Atendimento (Negociação e Renegociação)](./04-atendimento.md)
- [05 - Histórico de Acordos](./05-historico.md)
- [06 - Lembretes e Timers](./06-lembretes-timers.md)
- [07 - Consulta CAC](./07-cac.md)
- [08 - CCBs e Contas](./08-ccbs-contas.md)
- [09 - Equipe e Compartilhamento](./09-equipe.md)
- [10 - Navegação Automática e Busca](./10-navegacao-busca.md)
