# Mobfacil-Automator

v11.39


Configuração Inicial:

- **Extensão:** É obrigatório ter a extensão **Tampermonkey** instalada no navegador.
- **Permissões:** Valide nas definições da extensão se a execução de *userscripts* está autorizada no navegador.
- **Funcionamento:** O script será injetado e executado diretamente no ER, caso o script se encontre ativo.

# PaymobiFin - Assistente: documentação funcional e técnica (v12.0)

Este documento é a referência para usar e manter o Atendimento (Negociação e Renegociação), as Mensagens, o Histórico da equipe, os Lembretes e o compartilhamento entre funcionários.

As regras vêm de três fontes:
- as planilhas **Negociação** e **Renegociação** (`Negociação.Renegociação.xlsx`, out/2026);
- o HTML real do ER;
- as decisões validadas com o responsável pelo projeto.

Nenhum dado de cliente foi copiado para cá.

---

## 1. Organização do painel (igual nas duas aparências)

| Aba | Conteúdo | Uso |
|---|---|---|
| **Atendimento** | Negociação · Renegociação · Mensagens | diário |
| **Histórico** | Acordos registrados pela equipe (busca, filtros, correções) | diário |
| **Agenda** | Lembretes · Timers | diário |
| **Relatórios** | Auditoria, Diário, Reprovadas, Efetivadas, Aprovadas (sem mudança) | rotina |
| **Mais ▾** | Consulta CAC · CCBs · Contas · Configurações | eventual |

A "UI Antiga" usa a mesma organização; muda só o visual (cores e tamanhos).

A Busca de cliente continua no topo e alimenta o Atendimento ("Aplicar cliente atual" ou "Usar em: Atendimento"), a Consulta CAC e os Lembretes.

---

## 2. Atendimento

### 2.1 Uma ficha, dois modelos

Os campos digitados ficam numa ficha só, em memória, e valem para **Negociação**, **Renegociação** e **Mensagens**: o que foi digitado em uma aparece nas outras. Nada é salvo até "Registrar no histórico".

| Bloco | Negociação | Renegociação |
|---|---|---|
| Cliente | Proposta\*, Nome\*, CPF, IMEI, Data da proposta, Filial, Atendente, **Número de contato (RD Station)**, Quem negociou, Data do contato (padrão: hoje) | igual |
| Cobrança | Valor parcela, FPD, Parcelas em atraso, Dias atraso, Vencimento mais antigo, Parcela atual | — |
| Acordo | **Resultado\*** (fechou · solicitou · não concluída) + **Modalidade\*** com os campos da modalidade (seção 3) | Modalidade\* (resultado = fechou) |
| Textos | Pedido do cliente · Acordo Realizado · A partir de qual parcela | Acordo Solicitado · Acordo Realizado |
| Acompanhamento | 12 colunas opcionais (botão "Trazer do acordo" preenche Data 1° pagamento e Quantidade de parcelas) | — |
| Renegociação | — | Responsável\* (padrão: seu nome na equipe), Formalizou (SIM), Data renegociação, Contrato novo, Observação, Régua, Recebeu boletos, Concluída + **Plano de parcelas** |

**Número de contato:**
- É sempre digitado: é o número que o cliente usou com a equipe (RD Station).
- **O telefone do cadastro da proposta nunca é usado para preencher esse campo**, em nenhuma tela. Na Busca, ele aparece como "Telefone do cadastro (proposta)".

### 2.2 Cópia para as planilhas

**Negociação:** 1 linha, 30 colunas.

> Proposta · Nome · CPF · IMEI · Data da Proposta · Filial · Atendente · Número Contato · Quem negociou · Data do Contato · Valor parcela · FPD · Parcelas Em Atraso · Dias Atraso · Vencimento Mais Antigo · A partir de qual parcela pediu acordo · Pedido do cliente · Acordo Realizado · Data do envio da proposta · Data 1° Pagamento · Vencimento(s) · Parcela (s) negociadas · Quantidade de parcelas · Pagamento da entrada · Disponibilizado boleto para o cliente · Número Contrato Novo · Data Renegociação · Procedimento feito na regua · Recebeu Boletos? · Negociação Concluída?

**Renegociação:** 1 linha por parcela, 26 colunas.

> Proposta · Nome · Responsável pela Negociação · Formalizou o acordo? · CPF · IMEI · Data da Proposta (Contrato Original) · Data Renegociação · Filial · Atendente · Acordo Solicitado · Acordo Realizado · Valor parcela · Valor Pago · Número Contato · Data do Contato · Ação · Situação · Baixa Parcela ER · Quebra de Acordo · Vencimento · Observação · Número Contrato Novo · Procedimento feito na regua · Recebeu Boletos? · Negociação Concluída?

Regras da cópia:
- Campo vazio vai em branco.
- Formatos: valores `R$ 0,00`, datas `dd/mm/aaaa`, telefone `(11) 912345678` (o formato que a planilha já usa).
- Cole na coluna Proposta da aba correspondente.

### 2.3 Plano de parcelas (Renegociação)

Regras tiradas da planilha real:
- **Ação:** `Pagamento Parcela 01/24` (2 dígitos). No PIX semanal, `Pagamentos 01/88`.
- **Situação:**
  - a 1ª linha é sempre a entrada: `Efetivado (Entrada)`, com Valor Pago igual ao valor da linha;
  - na quitação, a 1ª linha é `Efetivado (Quitação)`;
  - as demais linhas ficam `Em Aberto`, com Valor Pago `N/A`.
- Baixa Parcela ER e Quebra de Acordo saem em branco.

O plano é sugerido a partir do acordo. Tudo é editável antes de copiar (Ação, valor, vencimento, situação, valor pago).

| Modalidade | Linhas sugeridas |
|---|---|
| Entrada + parcelas | entrada (data da entrada) + N parcelas mensais; 1º vencimento = próximo "dia D" depois da entrada |
| Novo valor mensal / Parcelamento | N parcelas mensais a partir do 1º vencimento informado |
| PIX semanal / Automático | N pagamentos semanais (+ entrada, se informada) |
| Pagamento parcial / Fôlego | 2 linhas: valor pago agora (data) e saldo restante (data do restante) |
| Antecipação / quitação | 1 linha com o valor (quitação: `Efetivado (Quitação)`) |
| Regularização | dividida: N × valor; senão, 1 linha com o valor |
| Alteração de vencimento | N parcelas afetadas (se número) × novo valor |

**Dia 31 em mês curto:** o vencimento cai no último dia do mês (ex.: 30 → 28/02). *Ponto a validar com a prática da equipe.*

### 2.4 Mensagens (para o grupo)

- **Atendimento › "Mensagem p/ grupo":** gera a mensagem do acordo da modalidade atual.
- **Atendimento › Mensagens:** mantém todos os modelos de antes, com os mesmos dados da ficha:
  - Pedido de negociação
  - Acordo realizado (por modalidade)
  - Retorno do setor
  - Campanha do Fôlego
  - Retorno do setor — Instruções de pagamento
  - Solicitação de negociação
  - Antecipação de parcela
- Os modelos personalizados (`negModelos`) continuam valendo.

---

## 3. Modalidades do acordo (sem mudança desde a v11.38)

| Chave | Modalidade | Frase "Acordo Realizado" (resumo) |
|---|---|---|
| `mensal` | Novo valor mensal | Prosseguimos com o acordo de R$ X com pagamento todo dia D |
| `parcelamento` | Parcelamento | Prosseguimos com o acordo de N parcelas de R$ V… |
| `entrada` | Entrada + parcelas | Prosseguimos com 1 parcela de R$ E como entrada… |
| `parcial` | Pagamento parcial + restante | Prosseguimos com o pagamento parcial de R$ P no dia D e o restante (R$ S) com juros… |
| `folego` | Campanha do Fôlego | Prosseguimos com o acordo de R$ P no dia D e o restante no valor de R$ S com juros… |
| `pix` | PIX semanal / Automático | Prosseguimos com N parcelas de R$ M (R$ S semanal) via PIX… |
| `vencimento` | Alteração da data de vencimento | Prosseguimos com a alteração da data de vencimento… |
| `antecipacao` | Antecipação / quitação | Prosseguimos com a antecipação… / com a quitação de todo o contrato… |
| `regularizacao` | Regularização de parcela(s) em atraso | Prosseguimos com o pagamento das N parcelas em atraso… |
| `semacordo` | Sem acordo / pagamento normal | Cliente optou por pagar as parcelas normalmente… |

**Resultado:**
- **fechou** → frase "Cliente fechou…" e situação *Acordo realizado*.
- **solicitou** → frase "Cliente solicitou…" (simulação) e situação *Solicitação pendente*.
- **não concluída** → só o pedido (se houver dados) e situação *Não concluída*.

Os textos e frases saem **idênticos aos da v11.38** (teste comparativo com 14 casos).

**Saldo do pagamento parcial:** total devido − pago agora. Se o pago for maior que o total, nada é gerado.

---

## 4. Histórico de acordos da equipe

- **Registrar** (no Atendimento): grava proposta, nome, número de contato, modalidade, situação, textos, campos digitados e parcelas.
  - O CPF **não** é guardado.
  - Ficam registrados: quem registrou, quando, versão (`rev`) e revisões.
- **Duplicados:**
  - registro idêntico não é criado de novo;
  - se já existe registro da mesma proposta, o script pergunta: atualizar o existente (vira revisão) ou criar outro.
- **Busca:** nome, proposta, telefone ou responsável.
- **Filtros:** situação, modalidade, funcionário, período.
- **Detalhe:** copiar pedido / acordo / telefone / resumo; abrir no Atendimento.
- **Corrigir:** situação, número de contato, textos e observações, sempre com **motivo obrigatório**. A revisão guarda o valor anterior → novo.
- **Anular:** muda a situação para *Anulado*, com motivo. Nada é apagado à mão.
- **Retenção: 30 dias** depois da última alteração (decisão do responsável). Depois disso o registro sai da cópia local de cada computador.

---

## 5. Lembretes (v2)

- Campo **Telefone de contato** (opcional): validado (DDD + número; celular com 9), salvo no formato da planilha, copiável e pesquisável.
- **Migração automática v1 → v2:**
  - cópia do original em `mfLembretesBackup_v1` antes de converter;
  - telefone encontrado nas observações:
    - se houver **1**, ele é copiado para o campo (marcado "copiado das observações");
    - se houver **vários**, aparecem como sugestão ("Usar telefone …");
  - **as observações não mudam**;
  - registros não reconhecidos continuam preservados.
- Uma versão antiga do script (v11.x) que encontre a base v2 abre em **somente leitura** e não altera nada.
- Cada mudança grava autor e versão; cada pagamento tem id e autor. O acompanhamento mostra quem fez o quê.
- **Compartilhar com a equipe:**
  - novos lembretes vêm marcados quando a equipe está configurada;
  - lembretes antigos continuam só neste navegador até alguém clicar em "Compartilhar com a equipe";
  - excluir um compartilhado exclui para todos (com confirmação).

---

## 6. Compartilhamento da equipe (Pusher)

### 6.1 Como funciona
- O armazenamento do Tampermonkey é **de cada navegador**; não é compartilhado.
- O Pusher Channels **só repassa mensagens**. Ele não guarda histórico.
- **Cada computador guarda a sua cópia.** Quem estava offline recebe o que faltou quando outro funcionário estiver conectado ao mesmo tempo (troca de "resumos" com versão e impressão digital de cada registro).
- **Canal:** `presence-paymobifin-equipe`, privado. A entrada é assinada (HMAC-SHA256) com a **secret**, que fica só no navegador de cada funcionário. A secret **nunca** vai para o código (que é público no GitHub).
- **Envio:** API REST do Pusher (`/batch_events`), assinada com a secret (inclui `body_md5`), via `GM_xmlhttpRequest` (`@connect api-sa1.pusher.com`). Biblioteca oficial: `@require https://js.pusher.com/8.4.0/pusher.min.js`.
- **Criptografia de ponta a ponta:**
  - cada mensagem vai cifrada com AES-GCM 256, com chave derivada da **chave da equipe** por PBKDF2-SHA256 (150.000 iterações);
  - o Pusher (e o painel de debug dele) só vê texto cifrado;
  - mensagem adulterada é rejeitada.
- **Conflitos:**
  - vence a versão maior; em empate, a alteração mais recente;
  - pagamentos, acompanhamento e revisões **se somam**: dois funcionários registrando pagamentos ao mesmo tempo não perdem nada.
- **Uma aba por navegador** mantém a conexão; as outras acompanham pelo armazenamento.
- **Avisos:** novo lembrete, pagamento registrado, conclusão/cancelamento, novo acordo ou correção. Aparecem em todas as abas abertas (e como notificação do navegador, se autorizada). Contador na aba Histórico.
- **Quem está online:** listado em Configurações > Equipe e no Histórico.
- **Chave diferente:** um verificador (derivação lenta separada, 6 caracteres) mostra quem está com a chave da equipe diferente, sem revelar a chave.
- **Timers não são compartilhados.**

### 6.2 Configurar (cada um dos 4 computadores)
1. Mais ▾ > Configurações > **Equipe (compartilhamento)**.
2. Preencher:
   - **Seu nome**;
   - **Secret do Pusher** (painel do Pusher > App Keys);
   - **Chave da equipe**: uma frase combinada entre os 4, igual em todos, com 8 caracteres ou mais.
3. Marcar "Compartilhar lembretes e histórico com a equipe" e clicar em **Salvar e conectar**.

### 6.3 Segurança e limites
- A secret e a chave ficam no armazenamento do Tampermonkey, que **não é criptografado**. Quem usar o mesmo perfil do navegador consegue lê-las.
- **Se a secret vazar** (ou já tiver sido enviada por chat/e-mail), gere outra no painel do Pusher e atualize nos 4 computadores.
- **Se a chave da equipe vazar**, combinem outra.
- **Backup:** "Exportar backup" (Configurações > Equipe) gera um arquivo JSON com os registros da equipe. "Importar" soma sem apagar.
  - O arquivo contém dados de clientes: guarde em local restrito.
- **Recuperação:** um computador que perdeu os dados recebe tudo de volta dos colegas ao conectar (dentro dos 30 dias).
- **Limites do Pusher:** cada mensagem tem até 10 KB. Registros muito grandes têm o histórico mais antigo cortado só no envio; a cópia local fica inteira.

---

## 7. Navegação automática

Busca de cliente, "Ler da tela" e "Iniciar" (Relatórios) precisam da **Mesa de Crédito**. "Ler propostas elegíveis" e "Baixar CCBs" precisam da **Fila de Propostas**.

Quando a tela não está aberta, o script:
- faz o mesmo que o item do menu do próprio ER: `MostraConsulta('MesaCredito')` / `MostraConsulta('FilaPropostas')`, que troca a tela sem recarregar a página;
- espera a tela carregar e continua a função.

Não faz nada quando:
- o item **não existe no menu** da conta (sem acesso);
- está na tela de login;
- a opção está desligada (Configurações > Painel, navegação e diagnóstico).

---

## 8. Consulta CAC

- Saíram:
  - o preenchimento manual (Proposta, IMEI, Atendente, Contato, Quem negociou, Data);
  - o botão "Copiar linha (Proposta → Vencimento Mais Antigo)".
  - A linha completa da Negociação agora sai do Atendimento.
- Continuam:
  - a consulta;
  - a troca para a conta master;
  - a Posição Geral;
  - o resultado.
  - A Busca de cliente depende deles.
- "Usar em: CAC" abre a Consulta CAC com o CPF do cliente atual (mostra o resultado já obtido ou consulta).

---

## 9. Armazenamento (Tampermonkey)

| Chave | Conteúdo |
|---|---|
| `mfLembretes` (versão 2), `mfLembretesBackup_v0/_v1`, `mfLembretesExcluidos`, `mfLembretesAviso` | Lembretes, cópias antes de migrar, exclusões compartilhadas (30 dias), estado do pop-up |
| `mfAcordos` (versão 1) | Histórico de acordos (30 dias) |
| `equipeNome`, `equipeSecret`, `equipeChave`, `equipeAtiva`, `equipeId` | Configuração da equipe (só neste navegador) |
| `equipeLider`, `equipeOnline`, `equipeVersao`, `equipeAvisos`, `equipeAvisosVistos`, `equipeLimpeza`, `hsVistoEm` | Controle interno (aba conectada, online, avisos) |
| `negModelos`, `negModeloAtual`, `negModalidade`, `negPagamento`, `atModelo` | Modelos de texto e últimas escolhas |
| `navAuto` | Navegação automática |

- Nenhuma chave antiga foi apagada ou limpa na atualização.
- A Busca e a Consulta CAC continuam só no `sessionStorage` da aba.

---

## 10. Manutenção

- **Nova modalidade:** acrescentar em `NG_MODALIDADES` (campos, obrigatórios, texto, frases). Se ela tiver um plano de parcelas próprio, acrescentar o caso em `atSugestao()`.
- **Nova coluna de planilha:**
  - acrescentar o campo em `NG_CAMPOS` (bloco "ATENDIMENTO");
  - incluir em `AT_COL_NEG` / `AT_COL_RENEG` na posição da planilha;
  - incluir no bloco correspondente (`AT_CLIENTE`, `AT_ACOMP`, `AT_RENEG`…).
- **Nova coleção compartilhada:** seguir `eqTodos` / `eqAplicar` / `eqUnir` / `eqExpirado` (coleções `lb` e `ac`).

---

## 11. Testes automatizados (ambiente de desenvolvimento, páginas simuladas)

Todos passaram em páginas simuladas. **Nada foi validado no ER real nem no Pusher real** (o Pusher não é acessível deste ambiente).

**Regressão (16 suítes):**
- painel, motor/MobFacil, Auditoria completa, Relatório Diário, CCBs;
- contas e login automático;
- Gerador/Mensagens, lembretes, timers, busca, Fila, CAC (3 variações);
- fluxo completo da auditoria (3 testes).

**Novos:**

| Teste | O que cobre |
|---|---|
| `teste_acordo12` | 14 casos de modalidades: textos e frases **idênticos** à v11.38 |
| `teste_atend` | Colunas exatas das duas planilhas, plano de parcelas (entrada, PIX, parcial, quitação, dia 30 em fevereiro), registro, duplicidade, revisão, anulação, abrir no Atendimento |
| `teste_lem12` | Migração v1→v2 com telefones nas observações, validação, busca e cópia, v11.38 em somente leitura |
| `teste_nav` | Mesa e Fila abertas pelo menu; opção desligada; conta sem o item no menu |
| `teste_cripto` | MD5 e HMAC iguais ao Node (inclui o exemplo da documentação do Pusher); AES-GCM decifrado pelo Node; adulteração rejeitada |
| `teste_ui12` | Navegação e páginas nas duas aparências, sem rolagem horizontal |
| `teste_equipe` | 4 funcionários, assinaturas conferidas com o Node: cifragem, autor, avisos, pagamentos simultâneos somados, correção com motivo, chave errada detectada, quem entra depois recebe tudo, exclusão, retenção de 30 dias e recuperação pelos colegas |
