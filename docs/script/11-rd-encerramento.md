# Módulo: RD Atendimento — Encerramento com IA

**Função:** `iniciarRD()` (bloco `RD ATENDIMENTO: ENCERRAMENTO COM IA`)
**Página:** `https://app.tallos.com.br/*` (RD Atendimento / RD Conversas)
**Prefixo das chaves:** `rd`, `gemini`

---

## Responsabilidade

Encerra os atendimentos com cadeado da lista "Meus atendimentos" (ícone com título **"Janela de 24 horas fechada"**). A IA (Gemini) só lê a conversa para escolher a tabulação e resumir a solicitação: **nenhuma mensagem é enviada ao cliente**.

## Fluxo

1. **Analisar conversas com cadeado** — para cada item com cadeado: abre a conversa, lê as mensagens (`#chat-show-messages .card`, cliente = `.bg-message-from-customer`, atendente = `.bg-message-from-employee`), lê o Perfil do contato (`[data-cy=cy-simple-form-name|cpf|email]`) e pede ao Gemini a tabulação e os campos da planilha. **Nada é encerrado nesta etapa.**
2. **Revisão** — cada conversa aparece com a categoria sugerida (pode ser trocada), solicitação, tipo, CPF/proposta e avisos (ex.: CPF da conversa diferente do Perfil). Dá para desmarcar.
3. **Encerrar marcados** — confirma com um resumo por categoria e encerra uma a uma pelo fluxo da tela: botão `Encerrar` → janela "Encerrar atendimento" → opção da lista (`[role=option]`, texto exato) → botão `Encerrar` da janela. Antes de encerrar, confere que o telefone da conversa aberta é o da análise.
4. **Copiar linhas da planilha** — copia (TSV) as linhas A–M dos encerrados do dia.

## Categorias permitidas

Só as PaymobiFin de `RD_CATEGORIAS` (o Gemini recebe a lista como `enum` no `responseSchema`; resposta fora da lista é recusada). **"PaymobiFin - Teste" fica de fora.**

## Planilha de encerramento (A–M)

| Coluna | Origem |
|---|---|
| A Número do Cliente | telefone do cabeçalho, sem o 55 |
| B Data Contato | data da última mensagem |
| C Etiqueta | etiqueta de loja do item (`xpanse ...` / `mundo amarelo ...`) ou N/A |
| D Solicitação | Gemini |
| E Proposta | ER: a proposta efetivada do CPF (Mesa de Crédito); senão a citada na conversa ("proposta 1234") |
| F Nome do Cliente | ER; senão Perfil (nome com 2+ palavras) ou Gemini |
| G CPF | ER: CPF do cadastro (aba Cliente da proposta); senão Perfil ou o CPF que o cliente escreveu |
| H Vendedor | ER: Digitador do detalhe da proposta |
| I Filial | ER: Ponto de Atendimento da Mesa de Crédito |
| J Canal | RD |
| K Observações | Gemini |
| L Tabulação | categoria usada no encerramento |
| M Tipo de atendimento | Gemini (Cliente / Lojista) |

## Privacidade

CPF, telefone e e-mail saem do texto antes de ir para o Gemini (`mascarar`); esses dados são lidos localmente para a planilha. No plano grátis o Google pode usar o texto enviado para melhorar os produtos dele.

## Armazenamento

| Chave | Conteúdo |
|---|---|
| `geminiChave` | Chave da API do Gemini (só neste navegador, sem criptografia) |
| `geminiModelo` + `geminiModeloManual` | Modelo digitado no painel (fica salvo). Vazio: o painel escolhe sozinho, a cada vez que a página abre, o "flash" estável mais novo (preview/experimental só se não houver outro) |
| `rdAnalises` | `{ dia, itens: [...] }` — análises do dia |
| `rdLinhas` | `{ dia, linhas: [[A..M], ...] }` — linhas da planilha dos encerrados do dia |
| `erBase` | Endereço do ER, gravado pelo painel do ER (só o endereço) |

## Configuração (`CONFIG`)

`RD_ESPERA`, `RD_PAUSA_IA`, `RD_TIMEOUT_IA`, `RD_ESPERA_LIMITE`, `RD_ESPERA_FALHA`, `RD_TENTATIVAS_IA`, `RD_FALHAS_SEGUIDAS`, `RD_MAX_MENSAGENS`, `RD_MAX_CARACTERES`.

Sem resposta do Gemini (tempo esgotado, rede, HTTP 5xx ou modelo inexistente): até `RD_TENTATIVAS_IA` tentativas por conversa; no modelo automático, o painel passa para o próximo "flash" da lista e repete a mesma conversa (o modelo que falhou sai da vez até a página ser recarregada). Com `RD_FALHAS_SEGUIDAS` conversas seguidas sem resposta, ou nenhum modelo respondendo, a análise para e mostra o modelo. "Pensamento" reduzido: `thinkingBudget: 0` nos Gemini 2.5 Flash e `thinkingLevel: low` do Gemini 3 em diante; o modelo que recusar o ajuste é repetido sem ele. Ao clicar em Analisar, as conversas que deram erro voltam para a fila.

## Cruzamento com o ER

Durante a análise, com a **sessão do ER deste navegador** (o script usa `GM_xmlhttpRequest` com `@connect paymobi.ercard.com.br`):

1. **Caminhos, em ordem** (`MesaCreditoLista`), porque o CPF do Perfil pode estar errado ou ser de outra pessoa:
   1. CPF do Perfil do RD
   2. CPF que o cliente escreveu na conversa
   3. Nº da proposta citado na conversa
   4. Nome completo (Perfil, Gemini ou nome do contato com 2+ palavras) — só propostas com o **nome igual**
2. Em cada caminho, várias propostas: a **efetivada** (a mais recente, se houver mais de uma); sem efetivada, a citada na conversa; senão a mais recente que não está cancelada (`escolherProposta`).
3. **Confirmação** na aba Cliente da proposta (`MesaAnaliseCliente`, `erCadastro`): o telefone do RD (últimos 8 dígitos) ou um nome conhecido tem de bater com o cadastro. Fica o primeiro caminho confirmado; se nenhum confirmar, o primeiro achado, **desmarcado** e com aviso para conferir.
4. `DetalheProposta` / `MesaAnaliseProposta` da proposta escolhida: **Digitador** = vendedor.

O CPF da planilha passa a ser o do cadastro no ER (corrige o CPF errado do Perfil). Avisos na revisão: por qual caminho o cliente foi achado (e os que não deram), CPF do Perfil diferente do ER, cliente não confirmado, nome do ER diferente do RD, proposta da conversa diferente da do cliente, várias/nenhuma efetivada, ER sem endereço salvo ("abra o ER uma vez neste navegador") ou sessão expirada.
