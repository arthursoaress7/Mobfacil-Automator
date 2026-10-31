# Módulo: Motor de Coleta (MobFacil)

**Linhas:** 114 – 836  
**Funções de entrada:** `iniciarMotor()` (linha 376)

---

## Responsabilidade

Este módulo roda **dentro do iframe** do site `enviamotor.mobfacil.com.br`. Ele navega automaticamente pela árvore de dados do motor de análise de crédito e extrai os campos necessários para a auditoria.

Campos coletados:

| Campo | Descrição |
|---|---|
| `qtd` | Quantidade de restritivos (SPC/Serasa) |
| `val` | Valor total dos restritivos |
| `score` | Pontuação de crédito (SPC) |
| `consultas` | Quantidade de consultas ao CPF |
| `cpf` | CPF do cliente |
| `reprov` | Motivo(s) de reprovação do MobFacil |

---

## Leitura da árvore

A árvore do MobFacil é um componente React virtualizado (antd/rc-tree). Isso significa que **apenas os nós visíveis na tela existem no DOM** — o restante está somente na memória do React.

O módulo usa duas estratégias paralelas:

### 1. Leitura via DOM (tela)
Lê os nós que estão na área visível da tela. Usa a função `nos()` que retorna os nós presentes no DOM com texto e profundidade.

### 2. Leitura direta da memória React (preferencial)
Acessa `treeData` diretamente pelo fiber do React (`__reactFiberXXX`). Isso permite ler **todos os nós**, inclusive os fechados e fora da tela, sem precisar clicar.

- `arvoreReact()` — localiza o componente da árvore e retorna seus dados e instância
- `achatar(info)` — transforma a árvore hierárquica em lista plana
- `podarExecucoes(lista)` — quando há várias execuções do fluxo, mantém só a mais recente
- `validarReact(bruta)` — cruza a lista da memória com os títulos visíveis na tela para confirmar que os dados são confiáveis (≥80% de correspondência)
- `listaReact()` — orquestra os passos acima e retorna a lista validada (ou `null` se inválida)

### Extração dos valores

- `extrairDeLista(todos)` — percorre a lista de nós e localiza cada campo usando âncoras na hierarquia (ex.: busca `QuantidadeRestritivos` dentro de `calculaRisco`, ou `valorTotal` dentro de `pendenciaFinanceira`)
- `extrair()` — combina a leitura do DOM e da memória, e também lê o motivo de reprovação do texto da página
- `salvar(r)` — persiste os dados encontrados no armazenamento (`GM_setValue('dados', ...)`); nunca sobrescreve um campo já preenchido

---

## Navegação por caminhos

A árvore funciona como uma **sanfona**: abrir um nó fecha os irmãos dele. Por isso o módulo navega por **caminhos pré-definidos**, um de cada vez.

Caminhos definidos:

| Nome | Destino |
|---|---|
| `fluxo` | Execução do fluxo (para ler o CPF) |
| `risco` | `calculaRisco` → restritivos |
| `consultas` | `consultaRealizada` → quantidade de consultas |
| `score` | `scoreCadastroPositivo` |
| `pendencia` | `pendenciaFinanceira` → restritivos (reserva) |

### Funções de navegação

- `proximo(passos)` — dado o caminho atual, determina o próximo passo: `abrir` (clicar), `ok` (chegou ao destino) ou `sem-no` (nó não encontrado, pode estar fora da tela)
- `rodarCaminho(passos, maxSeg)` — executa o caminho até completar ou atingir o limite de tempo
- `clicar(item, tentativa)` — clica no seletor `+` do nó; nas tentativas 3+, dispara sequência completa de eventos de mouse
- `aguardarMovimento()` — espera a animação da sanfona terminar antes de clicar; se travar (nó animado fora da tela), libera forçadamente via `setState`
- `explorarScore(maxSeg)` — depois de abrir `scoreCadastroPositivo`, abre os filhos um a um para encontrar o valor do score

### Plano B: Pesquisa

Se um caminho falhar, o módulo usa a barra de pesquisa da árvore para filtrar pelo nome do nó desejado (ex.: `calcularisco`). A pesquisa força a exibição do nó e abre seus ancestrais automaticamente.

```
busca = [
  ['calcularisco',          'risco',     ...],
  ['consultaRealizada',     'consultas', ...],
  ['scoreCadastroPositivo', 'score',     ...],
  ['pendenciafinanceira',   'pendencia', ...],
]
```

---

## Ordem de coleta

1. Tenta ler da memória React (sem cliques)
2. Abre caminho `risco` → restritivos
3. Abre caminho `consultas`
4. Abre caminho `score`
5. Se SPC travou, pula direto para o Plano B
6. Abre caminho `pendencia` (reserva dos restritivos)
7. Refaz consultas se ainda faltarem
8. Executa Plano B (pesquisa) para os campos ainda ausentes

---

## Diagnóstico

A função `snapshot(id, etapa, buscaOk)` grava o estado da árvore no armazenamento a cada etapa. Os dados de diagnóstico **nunca incluem valores pessoais** — apenas nomes de campos e valores numéricos de interesse (score, quantidades, valores). O histórico das últimas 4 posições da árvore fica em `GM_getValue('debug')`.

---

## Considerações técnicas

- **Abas em segundo plano:** o navegador limita `setTimeout` em abas ocultas. O módulo substitui `requestAnimationFrame` por `setTimeout` enquanto a aba está escondida (a árvore antd usa RAF para animações).
- **sleep via Web Worker:** evita o mesmo problema no loop de polling — o worker não é afetado pela limitação de abas em segundo plano.
- **Limite de tempo:** cada proposta tem no máximo `TEMPO_MAX - MARGEM` segundos dentro do iframe.
- **Nó vazio:** se o último nó de um caminho não abre após `CLIQUES_VAZIO` tentativas, considera que a lista está vazia (ex.: `pendenciaFinanceira` sem pendências → grava `qtd: 0, val: 0`).
