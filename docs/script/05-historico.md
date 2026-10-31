# Módulo: Histórico de Acordos

**Linhas:** 5740 – 5968  
**Chave de armazenamento:** `mfAcordos` (versão 1)  
**Retenção:** 30 dias após a última alteração

---

## Responsabilidade

Armazena e exibe os acordos registrados pela equipe. Funciona como um log local (por navegador) que pode ser sincronizado via Pusher quando o compartilhamento de equipe está ativo.

---

## Estrutura de um registro

| Campo | Armazenado | Notas |
|---|---|---|
| Proposta | ✓ | |
| Nome | ✓ | |
| Número de contato | ✓ | Formato `(11) 912345678` |
| Modalidade | ✓ | Chave da modalidade (ex.: `entrada`) |
| Situação | ✓ | `realizado`, `pendente`, `nao_concluido`, `anulado` |
| Textos | ✓ | Pedido do cliente, Acordo Realizado |
| Campos digitados | ✓ | Todos os campos preenchidos no Atendimento |
| Parcelas | ✓ | Plano de parcelas completo |
| CPF | ✗ | Nunca é guardado |
| Quem registrou | ✓ | Nome do funcionário |
| Quando | ✓ | Data/hora do registro |
| Versão (`rev`) | ✓ | Número de revisões |

---

## Operações

### Registrar

Acionado pelo botão "Registrar no histórico" no Atendimento.

- Se o registro é idêntico ao existente → não cria duplicata
- Se já existe registro da mesma proposta → pergunta: atualizar (vira revisão) ou criar novo

### Buscar

Pesquisa por texto livre em: nome, proposta, telefone ou responsável.

### Filtros

- Situação
- Modalidade
- Funcionário
- Período (intervalo de datas)

### Detalhe de um registro

Ao clicar num item do histórico, expande e permite:
- Copiar pedido do cliente
- Copiar acordo realizado
- Copiar telefone
- Copiar resumo
- Abrir no Atendimento (preenche o formulário com os dados do registro)

### Corrigir

Permite editar: situação, número de contato, textos e observações.

- **Motivo obrigatório** para qualquer correção
- A revisão guarda: valor anterior → novo valor, autor, data

### Anular

Muda a situação para `Anulado`, com motivo obrigatório. O registro **nunca é apagado**.

---

## Retenção

Registros ficam por **30 dias** após a última alteração. Depois disso são removidos da cópia local do navegador.

---

## Integração com o módulo de Equipe

Quando o compartilhamento está ativo:
- Novos registros e correções são enviados aos colegas em tempo real
- Conflitos de versão: vence a versão maior; em empate, a alteração mais recente
- Pagamentos e revisões se **somam** (dois funcionários simultâneos não perdem dados)
- O contador de novos acordos aparece como badge na aba Histórico

---

## Exibição na interface

Cada item usa classes CSS para indicar a situação visualmente:

| Situação | Cor da borda lateral |
|---|---|
| `realizado` | Verde |
| `pendente` | Laranja |
| `nao_concluido` | Cinza |
| `anulado` | Vermelho (com opacidade reduzida) |
