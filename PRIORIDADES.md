# PRIORIDADES.md — Prioridades funcionais do PayMobi

> **Referência central de prioridades.** Consulte este documento antes de solicitar qualquer desenvolvimento.
> Para regras de desenvolvimento, Git e governança, leia [`instructions.md`](./instructions.md).

---

## Como usar este documento com o Claude

1. Consultar `PRIORIDADES.md` (este arquivo).
2. Identificar a tarefa pendente de maior prioridade.
3. Solicitar ao Claude que **analise a implementação atual antes de propor alterações**.
4. Pedir um **plano de implementação** com: arquivos envolvidos, riscos e critérios de aceite.
5. Implementar **somente o escopo da tarefa solicitada**.
6. Revisar as alterações e testar.
7. **Atualizar o status** neste `PRIORIDADES.md` após a conclusão.

O Claude deve respeitar integralmente o `instructions.md` e as regras de governança do repositório. Mudanças críticas seguem o processo de autorização definido na governança. **Não ampliar o escopo por iniciativa própria.**

---

## Regras

- Este documento é a referência central de prioridades funcionais.
- Não propor refatoração estrutural como prioridade sem necessidade comprovada.
- Preservar funcionalidades existentes.
- Concluir e validar uma tarefa antes de avançar para a próxima.
- Registrar novas demandas aqui antes de iniciar seu desenvolvimento.

---

## P0 — Otimização dos lembretes

**Status geral:** Pendente  
**Objetivo:** tornar o sistema de lembretes mais eficiente para comunicação e acompanhamento das atividades da equipe.

### Implementação atual (analisada no código)

O módulo de lembretes (`lb*`) já possui:

- **Compartilhamento manual:** `lbCompartilhar(id)` compartilha com a equipe via Pusher. É um botão que o usuário clica explicitamente. Novos lembretes podem nascer compartilhados se a checkbox estiver marcada (padrão: marcada quando a equipe está configurada).
- **Edição sem restrição de autor:** qualquer membro da equipe pode editar, pagar, concluir, cancelar ou excluir um lembrete compartilhado. Não há verificação de `criadoPor`. A resolução de conflitos é por versão (`rev`) e timestamp.
- **Avisos para a equipe:** `eqAvisarLembrete()` já envia notificações para toda a equipe (exceto quem fez a alteração) quando: novo lembrete, pagamento registrado, status mudou, lembrete atualizado ou excluído. Os avisos aparecem num card flutuante no canto superior direito da tela (`#mf-eq-avisos`, `position:fixed; top:16px`).
- **Popup de lembretes do dia:** `lbMostrarPopup()` já é um card flutuante no canto inferior direito da tela (`#mf-lb-popup`, `position:fixed; bottom:16px`). Mostra até 20 lembretes devidos, com botões "Ver lembrete", "Adiar" e "Concluir". Rodapé com "Lembrar mais tarde (1 h)". Dispara também notificação do navegador (uma vez a cada 30 min). Verificado a cada minuto.
- **Renderização principal:** `lbDesenhar()` renderiza a lista dentro da aba "Agenda" do painel — não é flutuante.

### Tarefas

---

- [x] **P0.1 — Notificações para toda a equipe**

  **Status:** Concluído (já implementado; validado no código em 09/11/2026, v13.26.4). Decisão do responsável: o pop-up local no dia do acompanhamento é suficiente, sem push pelo Pusher.  
  **Objetivo:** garantir que todos os integrantes da equipe sejam notificados sobre lembretes, não somente quem criou.

  **Comportamento esperado:** quando um lembrete está vencido ou chega no dia de acompanhamento, todos os membros da equipe conectados devem ver a notificação — não apenas quem criou o lembrete.

  **Como funciona (analisado no código):**
  - **Mudanças:** `eqAvisarLembrete()` avisa toda a equipe (menos quem alterou) sobre novo lembrete, pagamento, mudança de situação, atualização e exclusão de lembretes compartilhados, no card `#mf-eq-avisos`.
  - **Dia do acompanhamento:** um lembrete compartilhado fica no navegador de **todos** os membros. `eqAplicar()` grava o que chega pelo Pusher em `mfLembretes`, e quem estava offline recebe ao reconectar, pela troca de resumos (`eqEnviarResumo` / `eqResumoRecebido`). A cada minuto, cada navegador procura em todos os lembretes, inclusive os criados por outra pessoa, os que vencem hoje ou estão atrasados (`lbVerificarPopup` → `lbAtencao`). Mostra o pop-up `#mf-lb-popup` e, se a permissão foi dada, uma notificação do navegador (no máximo a cada 30 min). Não precisa haver nenhuma alteração no lembrete para o aviso aparecer.
  - **Correção do texto anterior:** não é verdade que os outros membros "só recebem o aviso quando algo muda". Isso vale só para o card da equipe; o pop-up do dia aparece para todos que têm o lembrete compartilhado.

  **Critérios de aceite (atendidos):**
  - Um lembrete compartilhado criado pelo membro A aparece no pop-up do dia do membro B na data de acompanhamento ou depois dela, sem nenhuma alteração no lembrete.
  - Isso vale também quando B estava offline no momento da criação: ele recebe o lembrete ao reconectar.
  - Mudanças em lembretes compartilhados (novo, pagamento, situação, atualização, exclusão) avisam os outros membros no card da equipe.

  **Dependências:** nenhuma.  
  **Limites conhecidos (por design):**
  - Lembretes **não compartilhados** (checkbox desmarcada) só avisam o próprio navegador.
  - Só é avisado quem está com o ER aberto, porque o script só roda lá. Um push pelo Pusher também não alcançaria quem está offline, por isso não foi adotado. Mexer no Pusher seria Categoria B.

  **Possível melhoria futura (não solicitada):** mostrar no pop-up quem criou cada lembrete e se ele é da equipe, e notificar uma vez por lembrete em vez de um resumo a cada 30 min. Registrar em P3.5 se a equipe quiser.

---

- [ ] **P0.2 — Edição compartilhada**

  **Status:** Concluído (já implementado)  
  **Objetivo:** qualquer usuário da equipe deve conseguir editar os lembretes, independentemente de quem os criou.

  **Comportamento atual:** não há restrição de autor. O botão "Editar" aparece para qualquer lembrete pendente, compartilhado ou não. `lbSalvar()` envia via Pusher as alterações em lembretes compartilhados. A resolução de conflitos usa `rev` (versão) + timestamp, e pagamentos/histórico se somam.

  **Critérios de aceite:** já atendidos — qualquer membro pode editar, pagar, concluir, cancelar ou excluir.  
  **Dependências:** nenhuma.  
  **Observações:** confirmar com a equipe se o comportamento atual é suficiente ou se precisam de controle mais granular (ex.: impedir exclusão por quem não criou). Hoje exclusão de lembrete compartilhado exclui para todos, com confirmação.

---

- [ ] **P0.3 — Card flutuante**

  **Status:** Parcialmente implementado  
  **Objetivo:** os lembretes devem ser exibidos em um card móvel pela tela, permitindo acompanhar sem depender de uma aba específica.

  **O que já existe:**
  - `#mf-lb-popup` (canto inferior direito): card flutuante que mostra lembretes devidos hoje. Aparece automaticamente, pode ser adiado ("Lembrar mais tarde 1h"). Não é arrastável — fica fixo no canto.
  - `#mf-eq-avisos` (canto superior direito): card flutuante com notificações da equipe. Tampouco é arrastável.

  **O que pode faltar:**
  - O popup de lembretes do dia some quando não há devidos. Um card flutuante permanente (minimizável, arrastável) mostrando os lembretes ativos seria diferente do comportamento atual?
  - O card deve mostrar **todos** os lembretes ativos, ou só os devidos hoje?
  - O card deve ser arrastável pela tela, ou fixo em um canto (como hoje)?
  - O card deve funcionar fora do ER (ex.: em outras abas do navegador) ou só dentro do painel?

  **Critérios de aceite:** A definir  
  **Dependências:** A definir (depende das decisões acima)  
  **Observações:** o painel principal já é arrastável e redimensionável. Um card de lembretes flutuante adicional seria um novo elemento no `document.body`, similar ao popup atual mas permanente.

---

## P1 — Otimização das mensagens

**Status geral:** Pendente  
**Objetivo:** melhorar as funcionalidades existentes de criação, preenchimento e envio de mensagens.

### Implementação atual (analisada no código)

O módulo de mensagens (`ng*` e `at*`) já possui:

- **7 modelos de mensagem** (`NG_MODELOS`): Pedido de negociação, Acordo realizado, Retorno do setor, Campanha do Fôlego, Retorno do setor — Instruções de pagamento, Solicitação de negociação, Antecipação de parcela.
- **11 modalidades de acordo** (`NG_MODALIDADES`): Novo valor mensal, Parcelamento, Entrada + parcelas, Pagamento parcial + restante, Campanha do Fôlego, PIX semanal/Automático, Alteração de vencimento, Antecipação/quitação, Regularização, Sem acordo, Condições gerais.
- **Preenchimento automático existente:**
  - `data_contato` = hoje (padrão)
  - `responsavel` = nome da equipe ou apelido da conta ativa
  - `com_juros` = true (padrão)
  - `abrangencia` = calculada a partir de `abrangencia_tipo` + `parcela_inicial`/`parcelas_especificas`
  - `antecipacao_descr` = calculada a partir de `tipo_antecipacao` + `qtd_antecipadas`
  - `valor_restante` = `total_devido` − `valor_pago_parcial` (auto-calculado, bloqueia pagar acima do total)
  - Dados de pagamento (`chave_pix`, `banco`, `agência`, `conta`) vindos de Configurações
  - `atSugerir()`: copia data 1° pagamento, quantidade de parcelas e "Todo Contrato" dos campos do acordo (só se estiverem vazios)
- **Preenchimento manual:** todo o resto — nome, proposta, CPF, valores das parcelas, entrada, datas, quantidades, observações, vencimentos.
- **Modelos editáveis:** o usuário pode personalizar o texto de qualquer modelo em Configurações > Gerador de negociações. Os modelos personalizados ficam em `negModelos`.

### Tarefas

---

- [ ] **P1.1 — Revisar os modelos de mensagens existentes**

  **Status:** Pendente  
  **Objetivo:** avaliar se os 7 modelos e 11 modalidades atuais atendem às necessidades da equipe.  
  **Comportamento esperado:** modelos cobrem todos os cenários do dia a dia sem precisar edição manual excessiva.  
  **Critérios de aceite:** lista de modelos que precisam ajuste, novos modelos necessários ou modelos obsoletos.  
  **Dependências:** feedback da equipe sobre o uso real.  
  **Observações:** não criar modelos novos sem necessidade confirmada.

---

- [ ] **P1.2 — Melhorar o preenchimento automático dos campos**

  **Status:** Pendente  
  **Objetivo:** reduzir digitação manual identificando campos que poderiam ser preenchidos automaticamente a partir de dados já disponíveis.  
  **Comportamento esperado:** ao aplicar o cliente atual (`atAplicarCliente`), o máximo de campos relevantes deve vir preenchido.  
  **Critérios de aceite:** lista de campos que hoje são manuais mas poderiam ser automáticos, com origem do dado.  
  **Dependências:** `atAplicarCliente` já preenche: nome, proposta, CPF, IMEI, data da proposta, filial, atendente, valor da parcela, FPD, parcelas em atraso, dias de atraso, vencimento mais antigo, parcela atual. O Número de contato é sempre manual (por design).  
  **Observações:** o número de contato (RD Station) nunca deve ser preenchido com o telefone da proposta — isso é uma regra confirmada.

---

- [ ] **P1.3 — Padronizar as mensagens utilizadas pela equipe**

  **Status:** Pendente  
  **Objetivo:** garantir que todos os membros usem os mesmos modelos e formatos.  
  **Comportamento esperado:** mensagens geradas sejam consistentes independentemente de quem as gerou.  
  **Critérios de aceite:** equipe confirma que os textos gerados estão padronizados e corretos.  
  **Dependências:** feedback da equipe.  
  **Observações:** os modelos personalizados (`negModelos`) são por navegador — não são compartilhados via Pusher.

---

- [ ] **P1.4 — Identificar oportunidades de reduzir preenchimentos manuais e erros**

  **Status:** Pendente  
  **Objetivo:** mapear onde os erros mais acontecem e onde a automação pode ajudar.  
  **Comportamento esperado:** relatório de pontos de fricção no fluxo de mensagens.  
  **Critérios de aceite:** lista de melhorias identificadas com prioridade.  
  **Dependências:** observação do uso real pela equipe.  
  **Observações:** prioridade é otimizar o que já existe, não criar funcionalidades novas.

---

## P2 — Otimização da geração de acordos

**Status geral:** Pendente  
**Objetivo:** melhorar o processo de geração e formalização de acordos.

### Implementação atual (analisada no código)

O módulo de geração de acordos (`at*`) já possui:

- **Plano de parcelas sugerido:** `atSugestao()` gera o plano a partir da modalidade. `atPlanoCampos()` preenche campos vazios com a sugestão, preservando edições manuais.
- **Cálculos automáticos:**
  - Vencimentos das parcelas: `atSomarMeses` (mensal, corrige dia 31 em mês curto) e `atSomarDias` (semanal, soma 7 dias)
  - 1º vencimento: próximo "dia D" após a data de entrada (auto-calculado quando entrada e dia de vencimento estão informados)
  - Rótulos de ação: "Pagamento Parcela 01/24" (mensal) ou "Pagamentos 01/88" (PIX semanal)
  - Situação padrão: "Efetivado (Entrada)" na 1ª linha, "Em Aberto" nas demais, "Efetivado (Quitação)" na quitação
  - Valor pago: valor da 1ª linha, "N/A" nas demais
  - Saldo restante no pagamento parcial: total − pago (bloqueia pagar acima do total)
- **Edição manual preservada:** tudo no plano é editável. Campos que o usuário já preencheu não são sobrescritos pela sugestão.
- **Cópia para planilha:** `atLinhas()` monta as linhas tabuladas — Negociação (1 linha, 30 colunas) ou Renegociação (1 linha por parcela, 26 colunas).
- **Manual:** quantidades, valores, data da entrada, 1º vencimento (embora sugerido), observações, procedimento na régua, recebeu boletos, negociação concluída.

### Tarefas

---

- [ ] **P2.1 — Revisar o fluxo atual de geração de acordos**

  **Status:** Pendente  
  **Objetivo:** mapear o fluxo completo e identificar gargalos.  
  **Comportamento esperado:** documentação do fluxo atual com pontos de melhoria.  
  **Critérios de aceite:** fluxo documentado e gargalos identificados.  
  **Dependências:** nenhuma.  
  **Observações:** o fluxo já é bem automatizado — foco em identificar o que ainda é manual desnecessariamente.

---

- [ ] **P2.2 — Identificar oportunidades de automatizar cálculos e preenchimentos**

  **Status:** Pendente  
  **Objetivo:** reduzir etapas manuais no preenchimento do acordo e do plano de parcelas.  
  **Comportamento esperado:** lista de campos que poderiam ser calculados ou preenchidos automaticamente.  
  **Critérios de aceite:** melhorias identificadas com viabilidade técnica.  
  **Dependências:** análise do fluxo atual (P2.1).  
  **Observações:** o script já calcula vencimentos, situações, rótulos e saldo. Possíveis melhorias: cálculo de juros no restante, preenchimento automático de "procedimento na régua" e "recebeu boletos" baseado na modalidade.

---

- [ ] **P2.3 — Melhorar a consistência das informações geradas**

  **Status:** Pendente  
  **Objetivo:** garantir que os dados do acordo, do plano de parcelas e da planilha estejam sempre consistentes.  
  **Comportamento esperado:** nenhum campo da planilha com valor divergente do que está na ficha.  
  **Critérios de aceite:** auditoria de consistência entre ficha, plano e linhas copiadas.  
  **Dependências:** nenhuma.  
  **Observações:** `atValidar()` já verifica campos obrigatórios. Possível melhoria: validar consistência entre modalidade e plano (ex.: PIX semanal com período mensal).

---

- [ ] **P2.4 — Reduzir erros e etapas manuais**

  **Status:** Pendente  
  **Objetivo:** diminuir erros de digitação e etapas desnecessárias.  
  **Comportamento esperado:** menos cliques e menos digitação para concluir um registro.  
  **Critérios de aceite:** lista de etapas que podem ser eliminadas ou combinadas.  
  **Dependências:** análise do fluxo (P2.1).  
  **Observações:** `atSugerir()` já combina 3 preenchimentos. Possível: auto-gerar textos ao montar o plano, auto-copiar ao concluir.

---

- [ ] **P2.5 — Documentar melhorias necessárias identificadas na análise do código**

  **Status:** Pendente  
  **Objetivo:** registrar tecnicamente o que foi encontrado para referência futura.  
  **Comportamento esperado:** documento com as melhorias e suas prioridades.  
  **Critérios de aceite:** documento atualizado em `docs/script/04-atendimento.md` se necessário.  
  **Dependências:** conclusão das análises P2.1 a P2.4.  
  **Observações:** não criar documento novo — atualizar o existente.

---

## P3 — Otimização geral do sistema

**Status geral:** Pendente  
**Objetivo:** aperfeiçoar funcionalidades já existentes no PayMobi.

### Tarefas

---

- [ ] **P3.1 — Identificar funcionalidades com lentidão ou dificuldade de uso**

  **Status:** Pendente  
  **Objetivo:** mapear pontos onde a experiência é lenta ou confusa.  
  **Comportamento esperado:** lista de funcionalidades com problema, com descrição do sintoma.  
  **Critérios de aceite:** itens priorizados pela equipe.  
  **Dependências:** feedback da equipe sobre o uso diário.  
  **Observações:** a coleta de auditoria já tem timeouts configuráveis em `CONFIG`. Possíveis pontos: tempo de abertura da árvore, lentidão do painel com muitos lembretes, troca de conta.

---

- [ ] **P3.2 — Identificar tarefas repetitivas que podem ser automatizadas**

  **Status:** Pendente  
  **Objetivo:** listar operações manuais repetitivas que o script poderia fazer sozinhas.  
  **Comportamento esperado:** lista de tarefas com estimativa de viabilidade.  
  **Critérios de aceite:** tarefas priorizadas pela equipe.  
  **Dependências:** observação do uso diário.  
  **Observações:** o script já automatiza coleta, navegação, troca de conta, login automático, timers de expediente. Foco no que ainda é manual e repetitivo.

---

- [ ] **P3.3 — Melhorar a experiência de uso**

  **Status:** Pendente  
  **Objetivo:** ajustes de usabilidade no painel e nos fluxos.  
  **Comportamento esperado:** interface mais fluida e intuitiva.  
  **Critérios de aceite:** melhorias validadas pela equipe.  
  **Dependências:** itens identificados em P3.1 e P3.2.  
  **Observações:** a Nova UI já melhorou muito a experiência. Foco em detalhes que ainda incomodam.

---

- [ ] **P3.4 — Corrigir problemas identificados**

  **Status:** Pendente  
  **Objetivo:** corrigir bugs e comportamentos inadequados.  
  **Comportamento esperado:** bugs documentados e corrigidos.  
  **Critérios de aceite:** bug corrigido e validado.  
  **Dependências:** bugs reportados pela equipe.  
  **Observações:** registrar cada bug como item separado quando identificado.

---

- [ ] **P3.5 — Registrar oportunidades futuras de melhoria**

  **Status:** Pendente  
  **Objetivo:** manter um backlog de ideias que surgirem do uso.  
  **Comportamento esperado:** seção atualizada continuamente.  
  **Critérios de aceite:** ideia registrada com descrição e contexto.  
  **Dependências:** nenhuma.  
  **Observações:** esta prioridade é alimentada continuamente conforme a equipe utiliza o sistema.

  **Backlog:**
  - Fazer o validate-pr.yml verificar se a versão da documentação bate com o @version — Categoria B, exige autorização.

---

- [x] **P3.6 — Relatório de pendências (conta master)**

  **Status:** Concluído (v13.27.0, 09/11/2026)  
  **Objetivo:** gerar, sem copiar à mão da Fila de Pendências, a lista das propostas com pendência em aberto no formato usado pela equipe (Proposta, Pendência, Cliente, Vendedor, Autorização, Data, Loja).  
  **Comportamento:** botão "Gerar relatório" na seção Pendências da aba Relatórios. Lê a Fila de Pendências (filtro "TODAS PENDENTES") e o detalhe de cada autorização, só leitura. Troca para a conta master quando ela está configurada.  
  **Critérios de aceite (atendidos):** o texto gerado bate com o exemplo da equipe (propostas 5017 e 4959 conferidas no ER real); pendências antigas ainda abertas também entram; fila vazia, sessão expirada e conta sem acesso dão aviso em vez de erro.  
  **Dependências:** conta master com acesso à Fila de Pendências.  
  **Observações:** detalhes técnicos em `docs/script/03-painel-interface.md` (Relatório de Pendências).

- [x] **P3.7 — Nome do arquivo do script**

  **Status:** Concluído (v13.27.2, 09/11/2026)  
  **Objetivo:** o arquivo principal passa de `automacaomobfacil.user.js` para `paymobifin-assistente.user.js`, nome que bate com o que aparece no Tampermonkey ("PaymobiFin - Assistente").  
  **Comportamento:** `@downloadURL`/`@updateURL` apontam para o arquivo novo. O arquivo antigo ficou como ponte congelada (cópia idêntica da 13.27.2), para que as instalações antigas atualizem e passem a seguir o arquivo novo. `@name` e `@namespace` não mudaram, então o Tampermonkey trata como o mesmo script e os dados salvos continuam.  
  **Critérios de aceite:** os workflows (validação e release) leem o arquivo novo; a validação confere que os endereços de atualização apontam para o arquivo novo e bloqueia alterações no arquivo-ponte.  
  **Observações:** alteração Categoria B (endereços de atualização e workflows), autorizada pelo responsável.

- [ ] **P3.8 — Remover o arquivo-ponte `automacaomobfacil.user.js`**

  **Status:** Aguardando (não antes de 09/12/2026)  
  **Objetivo:** apagar o nome antigo depois que todas as instalações já migraram para `paymobifin-assistente.user.js`.  
  **Critérios de aceite:** confirmar com a equipe que o Tampermonkey de cada pessoa mostra a versão 13.27.2 ou mais nova e o endereço de atualização terminando em `paymobifin-assistente.user.js`.  
  **Riscos:** quem ainda estiver no endereço antigo deixa de receber atualizações sem aviso.  
  **Observações:** alteração Categoria B (afeta a distribuição); exige autorização explícita.

- [x] **P3.9 — Compatibilidade com a atualização do ER (sessão expirada)**

  **Status:** Concluído (v13.27.3, 11/11/2026)  
  **Objetivo:** recuperar o funcionamento do painel depois da atualização do ER (visual novo, CSS de 05/11/2026), sem mudar o que continua funcionando.  
  **Análise (ER real, só leitura):** Mesa de Crédito, Ler da tela, navegação automática com datas do dia, Relatório Diário (valor, vendedor, IMEI), Auditoria no motor MobFacil, CCBs (até antes do download), busca de cliente (proposta, CPF, nome), Aplicar cliente atual, CAC, Relatório de Pendências, tela de login e modo escuro sobre o ER continuam com a mesma estrutura e funcionando. O que mudou: com a sessão vencida, o ER não abre mais a janela `#dlgRelogin`; redireciona toda requisição para `/AvisoSessao/AvisoSessao` ("Sua sessão de trabalho expirou").  
  **Correções:** `erSemSessao` reconhece esse aviso (Diário, Auditoria, aba Cliente, CAC, Pendências, busca, CCBs, RD); a fila pausa com aviso em vez de gravar N/A e concluir; o login automático volta a disparar; a navegação automática diz na hora quando a sessão expirou ou quando a conta não é aprovadora da Mesa ("Aprovador CONTA não cadastrado").  
  **Critérios de aceite (atendidos no ER real):** Diário com a sessão vencida pausa sem gravar dados (a versão anterior marcava as 3 propostas como feitas e copiava tudo N/A); Pendências e CCBs avisam a sessão expirada; o login automático leva à tela de login; nenhuma página normal é confundida com sessão expirada.  
  **Limitações:** a entrada automática com senha salva não foi testada (exige digitar senha no ER real); o RD (app.tallos.com.br) não foi aberto, só os endereços do ER que ele usa.

---

## Dúvidas funcionais que precisam de decisão da equipe

| # | Dúvida | Contexto |
|---|---|---|
| 1 | ~~Notificação no vencimento deve ser push ativo para todos, ou popup local já é suficiente?~~ **Decidido (09/11/2026): o pop-up local é suficiente.** | P0.1 — o pop-up do dia já aparece para todos os membros que têm o lembrete compartilhado |
| 2 | O card flutuante deve ser permanente (mesmo sem devidos) ou só quando há lembretes do dia? | P0.3 — hoje o popup só aparece com devidos |
| 3 | O card flutuante deve ser arrastável ou fixo em um canto? | P0.3 — hoje é fixo |
| 4 | O card flutuante deve mostrar todos os lembretes ativos ou só os devidos hoje? | P0.3 — hoje só mostra devidos |
| 5 | Devemos impedir que alguém exclua um lembrete compartilhado que não criou? | P0.2 — hoje qualquer um pode excluir |
| 6 | Os modelos personalizados (`negModelos`) devem ser compartilhados entre a equipe? | P1.3 — hoje são por navegador |
| 7 | Há campos do acordo que poderiam ser preenchidos automaticamente a partir do ER? | P2.2 — hoje muitos campos são manuais |
