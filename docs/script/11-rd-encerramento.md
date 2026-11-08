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
3. **Encerrar marcados** — confirma com um resumo por categoria e encerra uma a uma pelo fluxo da tela: botão `Encerrar` → janela "Encerrar atendimento" → opção da lista (`[role=option]`, texto exato) → botão `Encerrar` da janela. Antes de encerrar, confere que o telefone da conversa aberta é o da análise (últimos 8 dígitos, só números ou formatado; topo sem telefone vale o nome).

**Telefone do topo.** Ao trocar de conversa o RD mostra o nome novo antes do telefone: por alguns instantes o topo tem o telefone da conversa anterior. Por isso:
- o topo é acompanhado o tempo todo (`vigiarTopo`, no ritmo `RD_BOTAO_MS`): quando o nome muda, os telefones vistos com o nome anterior ficam marcados como da conversa anterior;
- na análise (`telefoneDaConversa`), o telefone só é aceito quando não é o da conversa anterior nem o de outra conversa já analisada (espera até `RD_ESPERA_TELEFONE` s; se não trocar, fica o do topo com aviso para conferir);
- no encerramento, espera o telefone analisado aparecer no topo (até `RD_ESPERA`) antes de dizer que a conversa aberta não é a analisada. O erro mostra os 4 últimos dígitos dos dois.
- Com mais de um topo montado na página, vale o visível que tem o botão Encerrar (`cabecalho`).
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
| F Nome do Cliente | ER (nome do cadastro, quando o cruzamento acha o cliente); senão **sempre o nome do contato no RD** (o do Perfil; sem Perfil, o da lista), mesmo que o cliente não tenha dito o nome na conversa. O nome que a IA lê na conversa só serve para procurar no ER |
| G CPF | ER: CPF do cadastro (aba Cliente da proposta); senão Perfil ou o CPF que o cliente escreveu |
| H Vendedor | ER: Digitador do detalhe da proposta |
| I Filial | ER: Ponto de Atendimento da Mesa de Crédito |
| J Canal | RD |
| K Observações | Gemini |
| L Tabulação | categoria usada no encerramento |
| M Tipo de atendimento | Lojista pelo setor do RD ou pelo nome do contato; senão Gemini (Cliente / Lojista); editável na revisão |

## Privacidade

CPF, telefone e e-mail saem do texto antes de ir para o Gemini (`mascarar`); esses dados são lidos localmente para a planilha. No plano grátis o Google pode usar o texto enviado para melhorar os produtos dele.

## Armazenamento

| Chave | Conteúdo |
|---|---|
| `geminiChave` | Chave da API do Gemini (só neste navegador, sem criptografia) |
| (modelo) | Sempre automático, sem campo no painel: primeiro os **Flash-Lite** estáveis, depois os Flash cheios estáveis, preview/experimental por último; troca sozinho quando um não responde ou fica sem cota. As chaves antigas `geminiModelo`/`geminiModeloManual` são apagadas ao abrir |
| `rdAnalises` | `{ dia, itens: [...] }` — análises do dia |
| `rdLinhas` | `{ dia, linhas: [{ cols: [A..M], copiada }] }` — linhas da planilha dos encerrados do dia. "Copiar linhas da planilha" leva só as ainda não copiadas (o botão mostra quantas são novas); sem nenhuma nova, pergunta antes de copiar de novo as do dia. "Limpar lista" apaga as análises **e** as linhas, avisando se houver linha ainda não copiada. Linhas no formato antigo contam como já copiadas |
| `erBase` | Endereço completo do ER, gravado pelo painel do ER ao abrir (e de novo após `ER_BASE_RECONFERIR` s), mesmo quando o campo do sistema vem relativo |

## Configuração (`CONFIG`)

`RD_ESPERA`, `RD_ESPERA_TELEFONE`, `RD_PAUSA_IA`, `RD_TIMEOUT_IA`, `RD_ESPERA_LIMITE`, `RD_ESPERA_FALHA`, `RD_TENTATIVAS_IA`, `RD_FALHAS_SEGUIDAS`, `RD_MAX_MENSAGENS`, `RD_MAX_CARACTERES`.

Sem resposta do Gemini (tempo esgotado, rede, HTTP 5xx ou modelo inexistente): até `RD_TENTATIVAS_IA` tentativas por conversa; no modelo automático, o painel passa para o próximo "flash" da lista e repete a mesma conversa (o modelo que falhou sai da vez até a página ser recarregada). Com `RD_FALHAS_SEGUIDAS` conversas seguidas sem resposta, ou nenhum modelo respondendo, a análise para e mostra o modelo. "Pensamento" reduzido: `thinkingBudget: 0` nos Gemini 2.5 Flash e `thinkingLevel: low` do Gemini 3 em diante; o modelo que recusar o ajuste é repetido sem ele. Ao clicar em Analisar, voltam para a fila as conversas que deram erro e as que ficaram sem os dados do ER (ER sem endereço, sessão expirada ou sem resposta). A chave e o modelo são salvos ao colar/digitar (sem depender do botão Salvar); "Limpar lista" só apaga as análises do dia, nunca a configuração.

## Cruzamento com o ER

**Sem o ER não analisa.** Antes de "1. Analisar" e de cada "Analisar (IA)", `erConferir()` busca na Mesa um nome que não existe. A resposta "nenhuma proposta" significa que o ER está respondendo, e esse ok vale `RD_ER_OK_S`. Sem endereço do ER, sessão expirada, conta que não é aprovadora da Mesa ou ER fora do ar: não analisa nada e diz o motivo, porque a planilha sairia sem proposta, vendedor e filial. Se o ER cair no meio da análise das vencidas (`erForaDoAr`), a análise para, a conversa que ficou sem o ER é desmarcada, e o próximo "1. Analisar" refaz todas as que ficaram sem o ER.

Durante a análise, com a **sessão do ER deste navegador** (o script usa `GM_xmlhttpRequest` com `@connect paymobi.ercard.com.br`):

1. **Caminhos, em ordem** (`MesaCreditoLista`), porque o CPF do Perfil pode estar errado ou ser de outra pessoa:
   1. CPF do Perfil do RD
   2. CPF que o cliente escreveu na conversa
   3. Nº da proposta citado na conversa
   4. Nome completo (Perfil, Gemini ou nome do contato com 2+ palavras) — só propostas com o **nome igual**
2. Em cada caminho, várias propostas: a **efetivada** (a mais recente, se houver mais de uma); sem efetivada, a citada na conversa; senão a mais recente que não está cancelada (`escolherProposta`).
3. **Confirmação** na aba Cliente da proposta (`MesaAnaliseCliente`, `erCadastro`): o telefone do RD (últimos 8 dígitos) ou um nome conhecido tem de bater com o cadastro. Fica o primeiro caminho confirmado; se nenhum confirmar, o primeiro achado, com aviso para conferir (continua marcado; só as conversas com erro na análise vêm desmarcadas).
4. `DetalheProposta` / `MesaAnaliseProposta` da proposta escolhida: **Digitador** = vendedor.

O CPF da planilha passa a ser o do cadastro no ER (corrige o CPF errado do Perfil). Avisos na revisão: por qual caminho o cliente foi achado (e os que não deram), CPF do Perfil diferente do ER, cliente não confirmado, nome do ER diferente do RD, proposta da conversa diferente da do cliente, várias/nenhuma efetivada, ER sem endereço salvo ("abra o ER uma vez neste navegador") ou sessão expirada.

A Mesa de Crédito só responde para usuário cadastrado como **aprovador**. Se a conta logada no ER não for (o ER devolve "Aprovador FULANO não cadastrado."), o aviso pede para entrar no ER com a conta da Mesa. Esse aviso, como o de ER indisponível, faz a conversa voltar para a fila no próximo "1. Analisar". Isso vale também para as conversas escolhidas antes das 24 h, que são refeitas pelo nome e mantêm o motivo. As que não puderem ser refeitas (parou antes ou saíram da lista) voltam como estavam.

## Limites do plano grátis do Gemini

Os limites mudam com frequência e valem **por projeto do Google** (não por chave) e **por modelo**; a cota diária volta à meia-noite do horário do Pacífico (por volta das 4 h–5 h de Brasília). Os modelos Flash cheios mais novos chegam a ter só cerca de 20 pedidos por dia no grátis, enquanto os Flash-Lite têm centenas — por isso o painel começa pelos Lite. Cada conversa analisada usa 1 pedido (mais as tentativas, se o modelo falhar).

Limite por minuto (HTTP 429): espera `RD_ESPERA_LIMITE` s e tenta de novo. Limite do dia esgotado: passa direto para o próximo modelo (cada modelo tem a sua cota); sem nenhum modelo com cota, a análise para com o aviso.

## Tom das observações

O prompt exige Solicitação e Observações neutras, só com fatos do assunto da conversa, e proíbe dizer ou insinuar que a equipe/atendente deixou de responder, demorou ou falhou — mesmo quando a última mensagem é do cliente; nesse caso a IA descreve o pedido ou o assunto do cliente. Reserva no código (`RD_CULPA_ATENDIMENTO`): texto que ainda assim culpe o atendimento não vai para a planilha — a Observação vira a própria Solicitação (ou N/A) e a revisão mostra um aviso. Frases sobre o cliente ("Sem respostas do cliente", "Cliente não retornou") passam normalmente.

## Conversas vencidas sem cadeado

Além das com cadeado ("Janela de 24 horas fechada"), o "1. Analisar" pega as **sem cadeado paradas há mais de `CONFIG.RD_HORAS_JANELA` (24 h)** — opção "Incluir conversas sem cadeado paradas…", ligada por padrão (GM `rdIncluirParadas`). A lista mostra a data da última mensagem (de qualquer lado): hora = hoje, "Ontem", ou a data completa. Só a data completa conta, medida a partir do fim daquele dia; como a janela do WhatsApp corre desde a última mensagem do cliente, essas conversas já passaram das 24 h com certeza. "Ontem" e hoje só entram com cadeado. A revisão mostra o motivo (🔒 cadeado ou ⏱ parada desde dd/mm/aaaa).

## Identificação de lojista

Ordem de decisão do tipo (coluna M), mostrada na revisão ("pelo setor…", "pelo nome do contato", "pela conversa (IA)") e editável lá:

1. **Setor do atendimento** no pé do item da lista (`setorDoItem`): contém "Lojista" → Lojista.
2. **Nome do contato** com cara de loja (`RD_NOME_LOJA`: loja, xpanse, mundo amarelo, shop, celulares, ltda, realme, samsung…) → Lojista. "iPhone"/"Apple" ficam de fora (clientes usam "iPhone de Fulano").
3. Sem esses sinais: o Gemini decide, recebendo o setor e o critério (fala em nome de loja, de "meu cliente", venda, cadastro, IMEI ou aparelho de cliente).

No **lojista**, o Perfil e o telefone do contato são da loja: o cruzamento com o ER ignora o CPF e o nome do Perfil, procura pelo CPF/proposta que o lojista escreveu (ou o nome do cliente citado), aceita o achado sem exigir telefone igual e não avisa "nome do ER diferente do RD".

## Encerrar antes das 24 h (conversa escolhida)

Botão **"+ Analisar a conversa aberta"**: o funcionário abre no RD um atendimento já resolvido (mesmo sem cadeado e dentro da janela) e clica; a conversa é analisada como as outras (`analisarItem`), entra na lista **marcada** com o motivo "✋ escolhida antes das 24 h" e é encerrada pelo "2. Encerrar marcados". Clicar de novo na mesma conversa não duplica; se ela tinha dado erro, é analisada de novo.

## Interface do painel

Os estilos são aplicados pelo CSSOM (`el.style.cssText`), sem `<style>` na página do RD. Cada elemento fixo guarda a função que monta o estilo a partir das cores do tema (`estilo(e, c => …)`).

- **Tema claro/escuro:** botão no topo, ao lado de — e ✕. O ícone mostra o modo atual: sol = claro, lua = escuro; o clique troca. A preferência fica em GM `rdTema` (padrão claro). Trocar reaplica as cores de todos os elementos (`repintar`), preservando o mostrar/esconder do painel, e redesenha a lista. As cores ficam em `RD_TEMAS` (claro e escuro desenhados separadamente). **O RD não muda.**
- **Página do RD no modo escuro** (`rdEscurecerPagina`, padrão ligado; caixa "No modo escuro (🌙), escurecer também a página do RD"): o RD não tem modo escuro próprio. Com o painel no escuro, uma folha de estilo construída pelo script (`adoptedStyleSheets`, aceita pelo RD) inverte as cores da página inteira (`html{filter:invert(1) hue-rotate(180deg)}`). Imagens, vídeos, iframes, fundos com imagem, o painel (`#mf-rd`) e o botão "Analisar (IA)" (`#mf-rd-ia`) são invertidos de volta e ficam com as cores originais. A folha sai no modo claro ou com a caixa desmarcada, e é conferida a cada `RD_BOTAO_MS`, porque o RD troca de tela sem recarregar. Não mexe em nada da página, só nas cores.
- **Configuração do Gemini:** recolhível. O título mostra o estado da chave ("● Chave salva · …1234" ou "● Sem chave"). Campo mascarado e botão Salvar na mesma linha; o mecanismo de salvar não mudou.
- **Ações:** "1. Analisar conversas vencidas" e "+ Analisar a conversa aberta" lado a lado; "2. Encerrar marcados" embaixo, na largura toda, em vermelho. A opção das paradas sem cadeado fica logo abaixo. As auxiliares ficam numa faixa menor: Copiar linhas da planilha, Parar e Limpar lista (texto vermelho).
- **Lista:** título "Conversas de hoje" com contadores (analisadas, marcadas, encerradas, com erro).
- **Cartão de cada conversa:**
  - **Topo:** seleção, nome e telefone. À direita, a situação e o motivo (🔒 cadeado, ⏱ parada, ✋ escolhida).
  - **Situação:** "Analisado · dados conferidos" (verde), "Revise antes de encerrar" (atenção), "Divergência: revise", "Erro na análise", "Não encerrado" ou "Encerrado". A situação **não autoriza o encerramento**: só entra no encerramento o que está marcado e for confirmado no "2. Encerrar marcados".
  - **Conteúdo:** tabulação, tipo, solicitação e observação. No bloco do ER: "✓ Confirmado no ER", "⚠ Achado no ER, não confirmado" ou "— Sem dados do ER", com proposta, CPF (ok/N/A), vendedor, filial e situação.
  - **Avisos:** cada aviso de `it.aviso` (separado no " · " de fora dos parênteses) aparece com o texto inteiro, nesta ordem e com estas cores:
    1. divergência de identidade, em vermelho: CPF ou nome diferente, cliente não confirmado, telefone repetido;
    2. ER indisponível e atenção, em amarelo, incluindo a proposta citada diferente da efetivada;
    3. informação, em neutro.
- **As regras não mudaram:** conversas com erro continuam desmarcadas e sem poder marcar, e as analisadas continuam marcadas por padrão.

## Minimizar e continuar

O topo do painel tem **— (minimizar)** e **✕ (fechar)**: os dois só recolhem o painel no botão do canto; a análise e o encerramento continuam (só **Parar** interrompe). Recolhido, o botão do canto mostra o andamento ao vivo ("🔒 Analisando 3 de 20: …", depois o resultado) e o texto completo ao passar o mouse. Ao reabrir, o painel mantém o andamento/resultado em vez de trocar pela contagem da lista. Fechar ou recarregar a **aba** do RD para o script; o que já foi analisado/encerrado fica salvo e "Analisar"/"Encerrar marcados" continuam de onde pararam.

## Botão "Analisar (IA)" no topo do atendimento

Ao lado de Transferir / Encerrar aparece **"✨ Analisar (IA)"**. Ele analisa a conversa aberta (mesma função do "+ Analisar a conversa aberta" do painel) e a coloca na lista, marcada. **Não abre o painel**: a análise roda em segundo plano, para o funcionário seguir para o próximo cliente.

- **Leitura (uma por vez, `rdLendo`)**: mensagens, telefone e Perfil. Enquanto isso o botão mostra "⏳ Lendo a conversa…" e é preciso esperar. Se a conversa for trocada no meio, a análise para com o erro "a conversa foi trocada…", em vez de misturar dados de dois contatos.
- **Depois da leitura**: a IA e o ER terminam sozinhos. Dá para abrir outra conversa e analisar, e várias podem estar em análise ao mesmo tempo (`rdAbertas`, `emAnalise`).
- **Texto do botão**: mostra a situação da conversa aberta: "⏳ Analisando…", "✓ Na lista", "✓ Encerrada hoje", "⚠ Analisar de novo" (deu erro) ou "✨ Analisar (IA)". Com outras em análise, aparece "· ⏳N". O clique confere a situação na hora, porque o texto pode estar atrasado alguns instantes depois de trocar de conversa.
- **Botão "🔒" do canto**: com o painel fechado, mostra o andamento e o resultado da última análise.
- **Bloqueios**: "1. Analisar", "2. Encerrar marcados" e "Limpar lista" esperam terminar as análises em andamento.

O botão fica **fora da árvore do React do RD** (posição fixa calculada a partir dos botões do topo, conferida a cada `CONFIG.RD_BOTAO_MS`), para não quebrar a tela quando o RD redesenha o cabeçalho; some quando não há conversa aberta ou há uma janela aberta.

## Janela de encerrar diferente

O encerramento aceita variações da janela do RD (comuns quando a conversa ainda está dentro das 24 h): reconhece a janela que abriu depois do clique em Encerrar (qualquer título), procura a lista que tem as categorias PaymobiFin entre todos os campos de lista (inclusive dropdown fora do modal, via `aria-owns`), aceita o botão de confirmar "Encerrar/Finalizar/Confirmar/Concluir/Sim" e responde a uma segunda confirmação ("Tem certeza?"). Conversa já aberta não é clicada de novo. Quando não dá para encerrar, o aviso "Não encerrado" traz o resumo da janela (título, botões e se estão desativados, campos, obrigatórios vazios).
