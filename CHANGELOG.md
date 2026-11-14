# Changelog

## [v13.29.2] — 2026-11-14

### 🐛 Correções

- fix: Relatório - Reprovadas inclui as reprovadas automaticamente (REPR AUT) (#55) (bef7091)

### 🔧 Outros

- docs: registrar decisões do responsável de 12/11 (p0.2 aprovada) (#51) (4dbff4c)

## [v13.29.1] — 2026-11-12

### 🐛 Correções

- fix: dica da posição geral e documentação do protocolo de atendimento do cac (f31f414)

### 🔧 Outros

- Merge pull request #43 from arthursoaress7/development (af4758e)
- Merge pull request #44 from arthursoaress7/feature/api-er (58f30dd)
- Merge pull request #42 from arthursoaress7/fix/dica-protocolo-cac (425167f)
- Merge pull request #41 from arthursoaress7/docs/plano-api-er (53826ea)


## [v13.29.0] — 2026-11-11

### ✨ Novas funcionalidades

- feat: Desbloqueios no arquivo principal e sessão expirada do ER atualizado (#40) (ea74405)
- feat: Desbloqueios no arquivo principal (#39) (f978a6e)

### 🐛 Correções

- fix: reconhece a sessão expirada do ER atualizado (#37) (597f766)

### 🔧 Outros

- Merge pull request #36 from arthursoaress7/docs/sincronizar-versao (2875b4b)


## [v13.28.0] — 2026-11-11

### ✨ Novas funcionalidades

- feat: adicionar funcionalidade de Desbloqueios no Atendimento (6c8b3bd)

### 🔧 Outros

- Merge pull request #35 from arthursoaress7/feature/desbloqueios-v2 (cf95bcf)


## [v13.27.1] — 2026-11-10

### 🐛 Correções

- fix: seção de pendências recolhível e com botão Limpar (#31) (781daa7)
- fix: seção de pendências recolhível e com botão Limpar (#29) (4fa7147)


## [v13.27.0] — 2026-11-10

### ✨ Novas funcionalidades

- feat: relatório de pendências da conta master (#28) (266e9af)
- feat: relatório de pendências da conta master (#27) (6fc22e7)


## [v13.26.3] — 2026-11-09

### 🐛 Correções

- fix: aviso do Relatório Diário mostra que inclui canceladas (#22) (ab5de61)
- fix: aviso do Relatório Diário mostra que inclui canceladas (#21) (3e9ec88)


## [v13.26.2] — 2026-11-09

### 🐛 Correções

- fix: CPF escrito na conversa é achado em mais formatos, na conversa inteira e com dígito errado (#19) (02d50e7)
- fix: CPF escrito na conversa é achado em mais formatos, na conversa inteira e com dígito errado (#18) (75b3282)

### 🔧 Outros

- Merge remote-tracking branch 'origin/main' into development (921e8cc)
- Merge remote-tracking branch 'origin/main' into development (e7973ac)


## [v13.26.1] — 2026-11-09

### 🐛 Correções

- fix: conversa encerrada no RD que sai da lista não fica mais como não encerrada (4c948ed)

### 🔧 Outros

- Merge pull request #15 from arthursoaress7/development (6ff4a39)
- RD: automação não fica lenta com a aba do RD escondida (070f652)
- Update version number in README (a9e8b0b)


## [v13.26.0] — 2026-11-09

### ✨ Novas funcionalidades

- feat: RD pode minimizar ou fechar o painel sem parar a automação (a1cd013)
- feat: RD analisa a conversa aberta para encerrar antes das 24 h (764414a)
- feat: RD identifica atendimentos de lojista pelo setor e pelo nome do contato (007f4aa)
- feat: RD também encerra conversas vencidas sem cadeado (9ce7f2d)
- feat: RD não culpa o atendimento nas observações da planilha (d863792)
- feat: RD procura o cliente no ER por outros caminhos quando o CPF está errado (8df2417)
- feat: cruzamento com o ER usa a proposta efetivada do CPF (a53fd06)
- feat: RD Atendimento cruza com o ER (proposta, nome, vendedor e filial) (383be02)
- feat: encerramento com IA dos atendimentos com cadeado no RD Atendimento (8753680)
- feat: Trocar de conta já oferece a conta de onde se saiu (2ba7c6f)

### 🐛 Correções

- fix: RD encerra conversas escolhidas antes das 24 h e ganha o botão "Analisar (IA)" (59111d9)
- fix: RD não repete na planilha as linhas já copiadas (aa393c1)
- fix: RD não conseguia escolher a categoria ao encerrar (MouseEvent view) (8741038)
- fix: RD mostra o que o ER devolveu quando a lista de propostas não vem (5425de0)
- fix: RD prefere os modelos Flash-Lite e troca de modelo no limite diário (3683b30)
- fix: RD não perde a chave ao limpar a lista e ER aberto é reconhecido (bedc2b4)
- fix: RD troca de modelo do Gemini quando o escolhido não responde (d1c0c35)
- fix: Gemini sem resposta (HTTP -1) no encerramento do RD (1feb7ff)
- fix: valor de transação vem do Valor da Compra da Operação de Crédito (2cd8271)
- fix: situação "06 - APROV MAN" reconhecida como aprovada (059024e)
- fix: valor simbólico da garantia até R$ 10,00 usa o Valor da Compra (81723cc)
- fix: Relatório Diário usa o Valor da Compra quando a garantia vem R$ 0,01 (c239b57)

### 🔧 Outros

- Merge pull request #14 from arthursoaress7/feature/auto-merge-workflow (ec35df2)
- Merge branch 'main' into feature/auto-merge-workflow (757b4e0)
- Merge pull request #13 from arthursoaress7/docs/governanca-versionamento-ia (4660560)
- Merge branch 'main' into docs/governanca-versionamento-ia (0c9d3fc)
- Versão 13.25 (2ee3a25)
- Desfaz o escurecer a página do RD (ficou feio) (9c48a6f)
- Versão 13.24 (6adf66e)
- Painel do RD: tira o minimizar (fazia o mesmo que o fechar) (55b21a1)
- Versão 13.23 (6341e95)
- RD: modo escuro também na página do RD (junto com o tema do painel) (8438b05)
- Merge remote-tracking branch 'origin/main' into development (59a2ef8)
- Versão 13.22 (bd878e8)
- Painel do RD: tema claro/escuro (sol/lua), ações em duas etapas, cartões e avisos organizados (81b11e3)
- Merge pull request #12 from arthursoaress7/development (25d00a5)
- Relatório Diário: visão geral do dia (inclui canceladas e em digitação) (ae5086a)
- Versão 13.21 (0f48e21)
- Mesa de Crédito abre filtrada no dia de hoje (mantém as datas escolhidas até o fim do dia) (f6bbaf7)
- Versão 13.20 (ea7955b)
- ER: aviso da Mesa lido já decodificado (o ER manda 'N&#227;o foi localizada...') (6c0e95b)
- Versão 13.19 (1dc3dbf)
- Login automático quando a sessão do ER expira; RD não analisa sem o ER (0118d1f)
- Versão 13.18 (59653d0)
- CAC: 'Nenhum registro selecionado' e termo inválido não trocam mais de conta; Fila lê 'Sit' pelo nome (d35aab7)
- ER: busca sem resultado ("Não foi localizada nenhuma proposta") não é mais erro (55461b4)
- Topo (Nova UI): botão de ampliar sem o ícone duplicado no modo claro; versão 13.17 (eb45184)
- Versão 13.16 (06eb11e)
- Atendimento (Nova UI): grades pela largura, seções de Dados, campos e seletor refinados; topo compacto (d861fb3)
- Versão 13.15 (6a1e72a)
- Atendimento (Nova UI): aviso sempre à vista, campos sem corte e grupos guardados um a um (236e3b5)
- RD: Analisar (IA) roda em segundo plano, sem abrir o painel (f8ccc81)
- RD: nome do cliente na planilha é o do contato no RD quando o ER não acha o cliente (a5cabe8)
- Versão 13.14 (4b42c10)
- RD: telefone certo nas conversas escolhidas e aviso de conta sem aprovador no ER (a5f5901)
- Merge pull request #10 from arthursoaress7/rd-er-efetivada (512761f)
- Merge pull request #9 from arthursoaress7/rd-gemini-troca-modelo (5208ae5)
- Merge pull request #8 from arthursoaress7/rd-cruzar-er (0189af8)
- Merge pull request #7 from arthursoaress7/rd-encerrar-ia (a419c40)
- Merge pull request #6 from arthursoaress7/diario-valor-da-compra (eab2a43)
- Merge pull request #5 from arthursoaress7/situacao-aprov-man (27fbcc5)
- Merge pull request #4 from arthursoaress7/diario-valor-simbolico (3d9606a)
- Merge pull request #3 from arthursoaress7/contas-voltar-rapido (afd607c)
- Merge pull request #2 from arthursoaress7/diario-valor-compra (8afe4d2)
- Merge pull request #1 from arthursoaress7/ui-reformulacao (ab05e3d)
- style: reformula o visual da Nova UI (somente CSS) (3195aea)
- Update version from v12.3 to v12.5 in README (35812b6)
- Update version to 12.5 and enhance comments (6ae723c)
- Update version to 12.4 and add new fields (21e3c3d)
- Update version number from v12.1 to v12.3 (2413597)
- Update version to 12.3 and improve dark mode styles (fb201b3)
- Update version to 12.2 and add dark mode (b79534f)
- Add newline at end of automacaomobfacil.user.js (52d3a30)
- Downgrade version from 12.2 to 12.1 (6ec5ea7)
- Enhance dark theme styles and select picker (988b442)
- Implement dark mode styles for UI elements (e920d13)
- Update version to 12.2 and add dark mode support (04a660d)
- Update version number in README.md (6abadb0)
- Update version to 12.1 and adjust styles (63b6f0d)
- Delete DOCUMENTACAO-Gerador-Negociacoes.md (42e5955)
- Update README with PaymobiFin documentation v12.0 (f76f62b)
- Add files via upload (d4b9640)
- Update automacaomobfacil.user.js (930a485)
- Update version from 11.37 to 11.39 (f181f04)
- Update print statement from 'Hello' to 'Goodbye' (7b0b49c)
- Update version from v11.34 to v11.37 (29a9e80)
- Update automacaomobfacil.user.js (fadc14b)
- Update fmt.Println message from 'Hello' to 'Goodbye' (b2c58a3)
- Update print statement from 'Hello' to 'Goodbye' (ccd7db5)
- Update README.md (c3e5bc8)
- Update version from v11.29 to v11.32 (8f92e37)
- Update version from 11.31 to 11.32 (f5ef516)
- Update automacaomobfacil.user.js (7af56e3)
- Update version number in README (9957c70)
- Update version from 11.27 to 11.29 (46bdfb2)
- Update automacaomobfacil.user.js (2318ab7)
- Update automacaomobfacil.user.js (fb130de)
- Update metadata comments in automacaomobfacil.user.js (ec551f9)
- Remove project description from README (7428473)
- Refactor README for clarity and formatting (f9633c5)
- Update README with initial setup instructions (5a6a672)
- Update README with version and tool requirements (482c2c9)
- Update README with Tampermonkey requirements (5872e7d)
- Update README with Tampermonkey requirements (cf17f61)
- Fix author tag and correct comments in user script (1318793)
- Add author to user script metadata (888d685)
- Add files via upload (097c36d)
- Delete automacaomobfacil.user.js.js (6cf3ea3)
- Add files via upload (948a59a)
- Delete automacaomobfacil.js (f52c274)
- Mobfácil Automator (626b6a7)
- Delete mobfacilautomator.js (18ade38)
- Add files via upload (f079d99)
- Delete tampermonkey-backup-chrome-2026-10-28T03-47-10-739Z.zip (c88f09a)
- Add files via upload (e684639)
- Initial commit (898c36d)