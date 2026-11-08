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
| E Proposta | conversa ("proposta 1234") |
| F Nome do Cliente | Perfil (nome com 2+ palavras) ou Gemini |
| G CPF | Perfil; senão o CPF que o cliente escreveu |
| H Vendedor / I Filial | N/A (busca no ER fica para depois) |
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
| `geminiModelo` | Modelo usado (escolhido sozinho entre os "flash" disponíveis; pode ser trocado no painel) |
| `rdAnalises` | `{ dia, itens: [...] }` — análises do dia |
| `rdLinhas` | `{ dia, linhas: [[A..M], ...] }` — linhas da planilha dos encerrados do dia |

## Configuração (`CONFIG`)

`RD_ESPERA`, `RD_PAUSA_IA`, `RD_TIMEOUT_IA`, `RD_ESPERA_LIMITE`, `RD_TENTATIVAS_IA`, `RD_MAX_MENSAGENS`, `RD_MAX_CARACTERES`.
