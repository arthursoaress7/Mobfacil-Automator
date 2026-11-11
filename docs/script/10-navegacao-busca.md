# Módulo: Navegação Automática e Busca de Cliente

## Navegação Automática

**Linhas:** 6274 – 6293  
**Chave de armazenamento:** `navAuto`

---

### Responsabilidade

Abre automaticamente a tela do sistema que uma função precisa, sem que o usuário precise navegar manualmente.

### Telas gerenciadas

| Tela | Comando do ER | Usado por |
|---|---|---|
| Mesa de Crédito | `MostraConsulta('MesaCredito')` | Busca de cliente, "Ler da tela", "Iniciar" (Relatórios) |
| Fila de Propostas | `MostraConsulta('FilaPropostas')` | "Ler propostas elegíveis", "Baixar CCBs" |

### Comportamento

- Se a tela necessária já está aberta → não faz nada
- Se não está aberta → executa o mesmo item de menu do ER (troca de tela sem recarregar a página) → aguarda o carregamento → continua a função

### Quando **não** age

- O item **não existe no menu** da conta (usuário sem acesso a essa tela)
- Está na tela de login
- A opção `navAuto` está desligada em Configurações

Enquanto espera a tela abrir, o painel para na hora (sem esperar os 25 s) e diz o motivo quando (`telaRecusada`):
- a sessão do ER expirou (o aviso "Sua sessão de trabalho expirou" aparece na área principal; ver `erAvisoSessaoNaTela`);
- o ER abriu a tela com um aviso no lugar da lista. Na Mesa de Crédito: "Aprovador CONTA não cadastrado.", que é o que a conta master recebe (ela não é aprovadora da Mesa). A busca de cliente e os relatórios usam a Mesa, então precisam da conta da Mesa.

### Configuração

Em Configurações → Painel e diagnóstico: marque/desmarque "Navegação automática".

### Mesa de Crédito com as datas de hoje (`mesaHoje`, padrão ligado)

Ao abrir, a Mesa vem do sistema com as datas padrão dele (dois dias para trás). O painel faz o seguinte:
- **Aplica as datas do dia:** põe as datas nos campos do próprio filtro (`#txtDataInicial` e `#txtDataFinal`, dentro da janela `#dlgFiltrosMesaCredito`) e refiltra como o botão "Filtrar" (`waitingDialog.show()` + `objMesaCredito.MesaCredito()`). Antes, espera a lista padrão terminar de carregar (`jQuery.active`).
- **Quais datas:** hoje. Se o funcionário mudou as datas hoje, usa as que ele escolheu (GM `mesaDatas = { dia, ini, fim }`, gravado no `change` ou `input` dos dois campos). No dia seguinte, `dia` não bate e volta para hoje.
- **Quando aplica:** cada abertura da Mesa recria os campos, e o painel aplica uma vez por campo novo (`WeakSet`, conferido a cada `MESA_HOJE_CONFERE_MS`).
- **Leitura da tela:** enquanto refiltra (`mesaFiltrando`), a Mesa não conta como pronta para a navegação automática; as funções que leem a lista esperam a lista nova.
- **Teste no ER real (08/11/2026):** de 06–08/11, com 135 propostas, para 08–08/11, com 25 propostas, todas com a data de situação de hoje (o filtro do sistema está em "DATA SITUAÇÃO").

---

## Busca de Cliente

**Linhas:** 5969 – 6273  
**Armazenamento:** `sessionStorage` da aba (não persiste entre sessões)

---

### Responsabilidade

Central de busca somente leitura para consultar dados de um cliente pelo CPF, IMEI, nome ou número de proposta. O resultado alimenta o Atendimento, a CAC e os Lembretes.

### Como funciona

1. Campo de busca no topo do painel (sempre visível)
2. O usuário digita e pressiona Enter ou clica no botão de busca
3. O script consulta o ER (Mesa de Crédito) e exibe os resultados
4. O usuário pode clicar em um resultado para:
   - **"Aplicar cliente atual" / "Usar em: Atendimento"** → preenche os campos de cliente no Atendimento
   - **"Usar em: CAC"** → abre a Consulta CAC com o CPF
   - **"Usar em: Lembretes"** → preenche o campo de proposta nos Lembretes

### Dados exibidos na busca

- Nome do cliente
- Número da proposta
- CPF
- IMEI
- Filial
- Atendente
- **Telefone do cadastro (proposta)** — exibido apenas aqui, para referência; nunca preenche o campo "Número de contato" do Atendimento automaticamente

### Somente leitura

A busca não altera nenhum dado no sistema. Ela apenas lê e exibe informações já existentes.

### Sessão

Os resultados ficam no `sessionStorage` da aba. Fechar a aba ou recarregar limpa os resultados. Isso evita que dados de clientes fiquem persistidos no navegador além do necessário.

---

## Relação entre os módulos

```
Busca de cliente
    ├─→ Atendimento (preenche campos do cliente)
    ├─→ CAC (preenche CPF e inicia consulta)
    └─→ Lembretes (preenche proposta)

Navegação automática
    ├─→ Busca de cliente (garante Mesa de Crédito aberta)
    ├─→ Relatórios / Iniciar (garante Mesa de Crédito aberta)
    └─→ CCBs / Ler propostas (garante Fila de Propostas aberta)
```
