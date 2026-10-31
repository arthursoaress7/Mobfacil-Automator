# Módulo: CCBs e Contas

## CCBs (Cédulas de Crédito Bancário)

**Linhas:** 2881 – 3068  
**Origem dos dados:** Fila de Propostas (`MostraConsulta('FilaPropostas')`)

---

### Responsabilidade

Faz o download em lote das CCBs das propostas listadas na Fila de Propostas do ER.

### Fluxo

1. "Ler propostas elegíveis" — lê os IDs da Fila de Propostas
2. "Baixar CCBs" — para cada proposta, acessa o endpoint do ER e faz o download do documento
3. Os arquivos são salvos localmente via link de download gerado pelo script

### Configuração de tempo

| Parâmetro | Valor padrão | Descrição |
|---|---|---|
| `TIMEOUT_CCB` | 20 s | Tempo máximo esperando cada resposta do sistema |

### Navegação automática

Se a tela de Fila de Propostas não estiver aberta, o módulo usa a navegação automática para abrí-la antes de tentar ler as propostas. Ver [Módulo de Navegação](./10-navegacao-busca.md).

---

## Contas (Troca rápida)

**Linhas:** 3069 – 3273

---

### Responsabilidade

Permite trocar rapidamente entre as contas cadastradas no ER sem precisar fazer logout e login manual.

### Comportamento

- Lista as contas disponíveis na sessão atual
- Ao selecionar uma conta, executa a troca diretamente via objetos do site (`PAGINA`)
- Se `trocaSemConfirmacao = true` (padrão), a troca é feita sem janela de confirmação do script
- A conta anterior é memorizada para que módulos como a CAC possam retornar a ela

### Integração com a CAC

O módulo de CAC usa este módulo para:
1. Trocar para a conta master quando a conta atual não tem acesso
2. Retornar para a conta original após a consulta

### Conta ativa

`contaAtiva()` — retorna os dados da conta em uso no momento (apelido, ID). Usado por outros módulos para identificar o funcionário logado.
