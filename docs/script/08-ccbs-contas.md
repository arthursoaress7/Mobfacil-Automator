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

### Sessão expirada

Cada passo espera a resposta do sistema (`aguardarResposta`). Se a resposta for o aviso de sessão expirada do ER (`erSemSessao`, HTTP 200), o lote para com "A sessão do ER expirou. Entre no ER de novo e clique em Baixar CCBs para continuar." em vez de dizer que a proposta não está na fila.

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
- **Volta rápida:** ao trocar, `trocarPara()` grava em `contaAnterior` o usuário da conta de onde se saiu. Na página seguinte, `contaPadraoIndice()` já deixa essa conta escolhida em "Trocar de conta" (ex.: entrou na master → o menu mostra a conta da mesa, basta clicar em "Trocar para esta conta"). Sem conta anterior, escolhe a primeira conta que não é a ativa

### Integração com a CAC

O módulo de CAC usa este módulo para:
1. Trocar para a conta master quando a conta atual não tem acesso
2. Retornar para a conta original após a consulta

### Conta ativa

`contaAtiva()` — retorna os dados da conta em uso no momento (apelido, ID). Usado por outros módulos para identificar o funcionário logado.

### Login automático (sessão expirada)

Opção `loginAuto` (padrão ligado; Configurações > Contas, "Entrar sozinho quando a sessão expirar").

- **Última conta:** cada página do ER com usuário logado grava a conta em `ultimaContaER` (`lembrarConta`).
- **Tela de login:** sem troca de conta em andamento, `loginAutomatico()` cria um `trocaConta` com `auto: true` para essa conta. Quem preenche e envia é `processarTroca()`, o mesmo caminho da troca de conta. Ele só envia com a senha salva na lista de contas, sem captcha visível (o `#txtCaptcha` do ER é oculto) e numa única tentativa.
- **Senha recusada:** grava `loginAutoBloqueado = conta` e o login automático para, mesmo depois dos 15 min da troca. Volta a funcionar quando o funcionário entra à mão (`lembrarConta` limpa) ou salva outra senha para a conta (`guardarSenha` limpa).
- **Várias abas:** o id da aba fica em `sessionStorage` (`mfAbaId`, igual depois de recarregar a própria aba). Só a aba que começou o login entra; as outras avisam e recarregam a cada `LOGIN_AUTO_OUTRA_ABA_MS`. Se a aba que começou sumir, outra assume depois de `LOGIN_AUTO_OUTRA_ABA_LIMITE_S`.
- **Sessão expirada na tela** (`erAvisoSessaoNaTela`), conferida a cada `LOGIN_AUTO_CONFERE_MS`: a janela `#dlgRelogin` por cima da página, a página `/AvisoSessao/AvisoSessao` ("Sua sessão de trabalho expirou. Por favor, refaça seu login no sistema.", que o ER abre ao recarregar com a sessão vencida) ou esse mesmo aviso dentro de `#divPrincipal` (ao abrir um menu). Quando dá para entrar sozinho, vai para a tela de login (`cacBase() + '/'`) depois de `LOGIN_AUTO_ESPERA_MS`. Na versão atual do ER (conferido em 11/11/2026) a janela `#dlgRelogin` continua na página, escondida, mas nada a abre: a sessão vencida aparece como a página de aviso. Antes da v13.29.0 o painel só olhava a janela, e o login automático não disparava.
- **"Sair" clicado pelo funcionário:** grava `erSaiuManual`, e o login automático não entra de novo (em nenhuma aba) até um novo login. A troca de conta do painel não conta, porque ela já tem um `trocaConta` antes de clicar em Sair.
- **Depois de entrar:** aviso "Sessão do ER tinha expirado: entrei de novo com …". O `trocaConta` automático nunca vira o aviso de conta diferente da troca normal.
