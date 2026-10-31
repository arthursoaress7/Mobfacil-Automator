# Módulo: Consulta CAC

**Linhas:** 4161 – 4480  
**Funções principais:** `cacConsultar()`, `cacAbrir()`, `cacMostrar()`, `cacReq()`

---

## Responsabilidade

Realiza consultas à **Central de Atendimento ao Cliente (CAC)** do sistema ER. É um módulo de **somente leitura** — não faz nenhuma alteração nos dados do sistema.

A consulta retorna:
- Dados contratuais do cliente
- Parcelas (vencimentos, valores, situações)
- Posição Geral (protocolo registrado automaticamente pelo sistema)

---

## Fluxo de consulta

1. Usuário busca um cliente e clica "Usar em: CAC" (ou acessa a aba CAC diretamente)
2. O módulo verifica se a conta atual tem acesso à CAC
3. Se não tiver (`cacSemAcesso`):
   - Se `cacTrocaAuto` está ativo → troca automaticamente para a conta master
   - Senão → exibe aviso
4. Executa a consulta via `cacConsultar(termo, extra)`
5. Exibe o resultado em `cacMostrar(res)`
6. Se `cacVoltarConta` está ativo → volta para a conta anterior após a consulta

---

## Funções

| Função | Descrição |
|---|---|
| `cacReq(caminho, params, metodo)` | Requisição autenticada à API do ER |
| `cacParcelas(doc)` | Extrai as parcelas do documento retornado |
| `cacCalcular(row, posicao, det, parcelas)` | Calcula valores e situações das parcelas |
| `cacConsultar(termo, extra)` | Executa a consulta pelo CPF ou número de proposta |
| `cacAbrir(row, termo, extra, dentro)` | Abre os detalhes de um contrato específico |
| `cacFim(texto, extra)` | Finaliza a consulta e exibe o resultado |
| `cacVoltarConta(extra)` | Volta para a conta anterior após a consulta |
| `cacSemAcesso(termo, motivo, extra)` | Trata o caso de conta sem acesso à CAC |
| `cacRetomar()` | Retoma a consulta após troca de conta |
| `cacMostrar(res)` | Renderiza o resultado na interface |

---

## Integração com a Busca de cliente

A Busca de cliente (topo do painel) alimenta a CAC:
- "Usar em: CAC" preenche o CPF e inicia a consulta
- Se o resultado já foi obtido antes (mesma sessão), exibe sem consultar novamente

---

## Troca automática de conta

Quando `cacTrocaAuto = true`:
1. O módulo detecta que a conta atual não tem acesso
2. Troca para a conta master silenciosamente (sem confirmação)
3. Executa a consulta
4. Se `cacVoltarConta = true`, retorna para a conta original

A troca usa a mesma infraestrutura do módulo de Contas (seção CCBs/Contas).

---

## Posição Geral

Quando `cacPosicaoGeral = true`, o módulo abre a Posição Geral do cliente. O sistema do ER registra um protocolo de visualização automaticamente ao abrir essa tela (comportamento nativo do ER, não do script).

---

## O que foi removido na v12.0

- Preenchimento manual dos campos de proposta/IMEI/atendente/contato/quem negociou/data
- Botão "Copiar linha (Proposta → Vencimento Mais Antigo)"
  - Essa linha agora sai do módulo de Atendimento

O que permanece:
- A consulta em si
- Troca para conta master
- Posição Geral
- Resultado completo de parcelas
- Integração com a Busca de cliente
