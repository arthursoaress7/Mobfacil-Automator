# Módulo: Lembretes e Timers

**Lembretes — Linhas:** 3768 – 4160  
**Timers — Linhas:** 4835 – 5171  
**Chaves de armazenamento:** `mfLembretes` (v2), `mfLembretesBackup_v0/_v1`, `mfLembretesExcluidos`, `mfLembretesAviso`

---

## Lembretes de Pagamentos Parciais

### Responsabilidade

Gerencia lembretes de clientes com pagamentos parcelados pendentes. Cada lembrete acompanha pagamentos individuais, responsável, datas e observações.

### Versão 2 (atual)

A v2 acrescenta um campo **Telefone de contato** opcional:
- Validado: DDD + número, celular obrigatório com 9º dígito
- Salvo no formato da planilha: `(11) 912345678`
- Copiável com um clique
- Pesquisável na busca

### Migração automática v1 → v2

`lbMigrar(x)` converte registros antigos automaticamente:

1. Cria backup em `mfLembretesBackup_v1` antes de converter
2. Busca telefone nas observações existentes:
   - **1 número encontrado** → copia para o campo telefone (marcado "copiado das observações")
   - **Vários números** → aparecem como sugestões ("Usar telefone …")
3. As observações **não são alteradas**
4. Registros não reconhecidos são preservados

Uma versão antiga do script (v11.x) que encontrar a base v2 abre em **somente leitura** e não altera nada.

### Compatibilidade retroativa

`lbV2(x)` — verifica se o registro está no formato v2. Registros v1 são lidos sem conversão e convertidos sob demanda.

### Operações

| Função | Descrição |
|---|---|
| `lbCarregar()` | Carrega os lembretes do armazenamento |
| `lbDesenhar()` | Renderiza a lista de lembretes na aba Agenda |
| `lbAbrirForm(it, modoForm)` | Abre o formulário de criação/edição |
| `lbAtualizar()` | Salva alterações no armazenamento e sincroniza com a equipe |
| `lbMudarStatus(id, st)` | Muda a situação de um lembrete (ativo, concluído, cancelado) |
| `lbExcluir(id)` | Exclui o lembrete (se compartilhado, exclui para todos com confirmação) |
| `lbUsarTelefone(id, t)` | Aplica um telefone sugerido ao lembrete |
| `lbCompartilhar(id)` | Compartilha um lembrete existente com a equipe |
| `lbAtualizarSaldoForm()` | Recalcula o saldo do formulário ao editar valores |
| `lbVerificarPopup()` | Verifica se há lembretes devidos hoje |
| `lbMostrarPopup(devidos)` | Exibe o pop-up de lembretes do dia |
| `lbFecharPopup()` | Fecha o pop-up |

### Rastreamento de alterações

Cada mudança registra: autor, versão do script, data. Cada pagamento tem ID único e autor. O acompanhamento mostra quem fez o quê.

### Compartilhamento com a equipe

- Novos lembretes criados quando a equipe está configurada já saem marcados para compartilhar
- Lembretes antigos ficam só no navegador local até alguém clicar "Compartilhar com a equipe"
- Excluir um lembrete compartilhado exclui para todos (com confirmação)

---

## Timers

### Responsabilidade

Gerencia contagens regressivas e agendamentos de expediente. **Timers não são compartilhados com a equipe.**

### Operações

| Função | Descrição |
|---|---|
| `tmCarregar()` | Carrega os timers do armazenamento |
| `tmCriar()` | Cria um novo timer |
| `tmEditar(id)` | Edita um timer existente |
| `tmIniciarExpediente(manual)` | Inicia os agendamentos do próximo expediente |
| `tmTick(forcar)` | Tick do relógio: atualiza contagens e dispara alarmes |
| `tmAlarme()` | Exibe notificação/alarme quando um timer chega a zero |
| `tmMostrarResumo(texto)` | Exibe resumo dos timers ativos |
| `tmDesenhar()` | Renderiza a lista de timers na aba Agenda |
| `tmAtualizarVisual()` | Atualiza os valores visuais sem redesenhar tudo |

### Expediente automático

Quando `tmExpedienteAuto` está ativo (padrão: `true`), os agendamentos do próximo expediente são iniciados automaticamente ao abrir o ER. O usuário pode iniciar manualmente pela aba Agenda.

### Pop-up de lembretes do dia

Ao detectar lembretes com pagamentos devidos hoje, `lbVerificarPopup()` aciona `lbMostrarPopup()` que exibe um pop-up não intrusivo sobre o painel. O estado do pop-up (visto / não visto) é salvo em `mfLembretesAviso`.
