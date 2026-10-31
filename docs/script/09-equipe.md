# Módulo: Equipe e Compartilhamento

**Linhas:** 5273 – 5739  
**Funções principais:** `eqCifrar()`, `eqDecifrar()`, `eqHmac()`, `eqChaveAes()`, `eqTodos()`, `eqAplicar()`, `eqUnir()`

---

## Responsabilidade

Sincroniza lembretes e histórico de acordos entre os computadores da equipe usando o serviço **Pusher Channels**.

---

## Como funciona

O Tampermonkey armazena dados **por navegador** — cada computador tem sua própria cópia. O Pusher atua como **mensageiro em tempo real**: ele não guarda histórico, apenas repassa as mensagens.

Cada computador mantém sua cópia local. Quando dois funcionários estão online ao mesmo tempo, trocam "resumos" (versão + impressão digital de cada registro). Quem estava offline recebe o que faltou quando outro colega se conectar.

---

## Canal e autenticação

- **Canal:** `presence-paymobifin-equipe` (canal de presença, privado)
- **Autenticação:** cada entrada no canal é assinada com HMAC-SHA256 usando a **secret** do Pusher
- A secret fica **apenas no navegador de cada funcionário** — nunca vai para o código (que é público)

---

## Criptografia de ponta a ponta

Todas as mensagens são cifradas antes de sair do navegador:

| Algoritmo | Uso |
|---|---|
| AES-GCM 256 | Cifra cada mensagem |
| PBKDF2-SHA256 (150.000 iterações) | Deriva a chave AES a partir da **chave da equipe** |
| HMAC-SHA256 | Assina as requisições à API REST do Pusher |
| MD5 | `body_md5` exigido pela API do Pusher |

O Pusher (e o painel de debug dele) vê **apenas texto cifrado**. Mensagens adulteradas são rejeitadas.

### Funções de criptografia

| Função | Descrição |
|---|---|
| `eqHmac(segredo, texto)` | Calcula HMAC-SHA256 |
| `eqChaveAes()` | Deriva a chave AES via PBKDF2 a partir da chave da equipe |
| `eqVerificador()` | Derivação lenta separada que gera 6 caracteres para detectar chave diferente |
| `eqCifrar(obj)` | Cifra um objeto com AES-GCM 256 |
| `eqDecifrar(env)` | Decifra e valida uma mensagem recebida |
| `eqMd5(str)` | Calcula MD5 (usado na assinatura das requisições) |

---

## Envio e recebimento

- **Envio:** API REST do Pusher (`/batch_events`), assinada com HMAC-SHA256, via `GM_xmlhttpRequest`
- **Recebimento:** conexão Pusher (`pusher.min.js 8.4.0`) em **uma aba por navegador**; as outras abas acompanham pelo armazenamento compartilhado do Tampermonkey

---

## Resolução de conflitos

- Vence a **versão maior**; em empate, a **alteração mais recente** (timestamp)
- Pagamentos, acompanhamentos e revisões **se somam** — dois funcionários registrando ao mesmo tempo não perdem dados

---

## Coleções compartilhadas

As funções `eqTodos()`, `eqAplicar()`, `eqUnir()` e `eqExpirado()` gerenciam as coleções:

| Coleção | Sigla | Conteúdo |
|---|---|---|
| Lembretes | `lb` | Lembretes de pagamentos parciais |
| Acordos | `ac` | Histórico de acordos |

---

## Quem está online

- Listado em Configurações → Equipe e na aba Histórico
- O campo "online" usa presença do Pusher

---

## Detecção de chave diferente

O verificador (6 caracteres derivados da chave) é exibido na tela de cada funcionário. Se dois funcionários mostram verificadores diferentes, um deles está com a chave errada. A chave em si **nunca é revelada**.

---

## Avisos

Avisos em tempo real aparecem em todas as abas abertas (e como notificação do navegador, se autorizada):
- Novo lembrete criado
- Pagamento registrado
- Lembrete concluído ou cancelado
- Novo acordo registrado
- Correção de acordo

O contador de avisos não vistos aparece na aba Histórico.

---

## Configuração (por computador)

Acesse: Mais ▾ → Configurações → **Equipe (compartilhamento)**

Preencha:
1. **Seu nome** — como vai aparecer para os colegas
2. **Secret do Pusher** — painel do Pusher > App Keys
3. **Chave da equipe** — combinada entre todos, mínimo 8 caracteres

Marque "Compartilhar lembretes e histórico com a equipe" e clique **Salvar e conectar**.

---

## Segurança e limites

| Situação | Ação recomendada |
|---|---|
| Secret vazou | Gere outra no painel do Pusher e atualize nos computadores |
| Chave da equipe vazou | Combinem outra entre todos |
| Computador perdeu os dados | Conectar enquanto um colega estiver online — recebe tudo dentro dos 30 dias |

- A secret e a chave ficam no armazenamento do Tampermonkey, que **não é criptografado**
- Quem usa o mesmo perfil de navegador consegue lê-las
- **Limite do Pusher:** mensagens com até 10 KB; registros maiores têm o histórico antigo cortado somente no envio — a cópia local fica inteira

---

## Backup e importação

"Exportar backup" (Configurações → Equipe) gera um arquivo JSON com todos os registros da equipe.  
"Importar" soma os registros sem apagar os existentes.

> O arquivo contém dados de clientes: guarde em local restrito.
