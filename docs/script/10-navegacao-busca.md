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

### Configuração

Em Configurações → Painel e diagnóstico: marque/desmarque "Navegação automática".

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
