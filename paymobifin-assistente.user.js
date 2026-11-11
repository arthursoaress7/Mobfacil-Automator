// ==UserScript==
// @name         PaymobiFin - Relatório
// @name:pt-BR   PaymobiFin - Assistente
// @name:pt      PaymobiFin - Assistente
// @namespace    mobfacil-planilha
// @version      13.27.2
// @author       Arthur
// @description  PaymobiFin - Assistente: atendimento (negociação e renegociação), histórico da equipe, lembretes, relatórios, CCBs e troca rápida de contas
// @include      /^https?:\/\/paymobi\.ercard\.com\.br(:\d+)?\/.*/
// @include      https://enviamotor.mobfacil.com.br/*
// @include      https://app.tallos.com.br/*
// @homepageURL  https://github.com/arthursoaress7/PaymobiFin-Assistente/tree/main
// @downloadURL  https://github.com/arthursoaress7/PaymobiFin-Assistente/raw/refs/heads/main/paymobifin-assistente.user.js
// @updateURL    https://github.com/arthursoaress7/PaymobiFin-Assistente/raw/refs/heads/main/paymobifin-assistente.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      api-sa1.pusher.com
// @connect      generativelanguage.googleapis.com
// @connect      paymobi.ercard.com.br
// @require      https://js.pusher.com/8.4.0/pusher.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // versão: lida do cabeçalho (@version) pelo Tampermonkey; o número só existe num lugar
  const VERSAO = 'v' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '13.27.2');
  const TITULO = 'PaymobiFin - Assistente';
  const CONFIG = {
    TEMPO_MAX: 120,         // s máximos por proposta (janela principal)
    MARGEM: 8,              // s: o iframe encerra sozinho antes do limite acima
    ESPERA_ARVORE: 25,      // s esperando o ID/árvore aparecer no iframe
    CAMINHO_SEG: 35,        // s máximos para abrir cada caminho da árvore até o dado
    SCORE_SEG: 30,          // s máximos para o caminho do score + exploração dos filhos
    BUSCA_SEG: 25,          // s máximos para cada caminho depois de uma pesquisa (plano B) (antes 15: faltava tempo, ex.: 4677)
    ESPERA_NO: 4,           // s esperando um nó aparecer (renderizar) antes de concluir que ele não existe
    MAX_CLIQUES_NO: 6,      // cliques máximos num mesmo nó que não abre
    CLIQUES_VAZIO: 4,       // cliques num nó FINAL do caminho que continua fechado: considera o nó vazio (ex.: pendenciaFinanceira sem pendências)
    PAUSA_BUSCA: 700,       // ms esperando a pesquisa filtrar a árvore
    PASSO_ROLAGEM: 0.4,     // fração da altura visível que a rolagem avança por passo
    PASSO_MS: 150,          // ms de espera depois de cada passo de rolagem
    ESPERA_CLIQUE: 120,     // ms de espera depois de clicar nos nós
    INTERVALO_CLIQUE: 900,  // ms mínimos antes de clicar DE NOVO no mesmo nó (evita abrir e fechar)
    GAP_NOVO_NO: 150,       // ms mínimos entre cliques em nós DIFERENTES
    ESPERA_RENDER: 500,     // ms esperando o próximo nó aparecer antes de começar a rolar a árvore
    ESPERA_MOVIMENTO: 1500, // ms máximos esperando a animação de abrir/fechar da árvore terminar antes de clicar
    DESTRAVA_MOVIMENTO: 1200, // ms com a árvore "em animação" para considerá-la travada e liberar os cliques
    POLL_MOTOR: 150,        // ms entre verificações no iframe
    POLL_PRINCIPAL: 100,    // ms entre verificações na janela principal
    PAUSA: 100,             // ms entre propostas
    TIMEOUT_REDE: 30,       // s máximos do fetch da página do motor
    BATIDA: 5,              // s: tempo para considerar que a coleta de outra aba ainda está viva
    CORTE_SCORE: 390,       // reprova se score < 390
    CORTE_VALOR: 4000,      // reprova se valor de restrições > 4000
    CORTE_QTD: 10,          // reprova se quantidade de restrições > 10
    VAZIAS_APOS_ID: 3,      // colunas entre a Proposta e a Qtd Restritivos (Nome, CPF, IMEI)
    TIMEOUT_CCB: 20,        // s máximos esperando cada resposta do sistema no download de CCB
    ER_BASE_RECONFERIR: 5,  // s depois de abrir o ER para gravar de novo o endereço do ER (usado pelo RD Atendimento)
    RD_BOTAO_MS: 700,       // ms entre conferências da posição do botão "Analisar (IA)" no topo do atendimento
    RD_HORAS_JANELA: 24,    // h sem mensagem para considerar vencida uma conversa SEM cadeado (janela do WhatsApp)
    RD_ESPERA: 15,         // s máximos esperando a conversa, a janela de encerrar ou a lista do RD Atendimento responderem
    RD_ESPERA_TELEFONE: 5,  // s máximos esperando o topo da conversa trocar o telefone da conversa anterior pelo desta
    RD_ER_OK_S: 60,         // s em que a conferência "o ER está respondendo" vale antes de analisar de novo (RD Atendimento)
    LOGIN_AUTO_CONFERE_MS: 3000,  // ms entre conferências da janela de sessão expirada do ER (login automático)
    LOGIN_AUTO_ESPERA_MS: 1500,   // ms antes de ir para a tela de login quando a sessão expira com a página aberta
    LOGIN_AUTO_OUTRA_ABA_MS: 8000, // ms que uma aba espera (e recarrega) enquanto outra aba faz o login automático
    LOGIN_AUTO_OUTRA_ABA_LIMITE_S: 30, // s depois dos quais o login de outra aba é dado como abandonado e esta aba assume
    MESA_HOJE_CONFERE_MS: 700,    // ms entre conferências da tela da Mesa de Crédito (filtro de datas do dia)
    MESA_HOJE_ESPERA_MS: 15000,   // ms máximos esperando a lista da Mesa carregar antes/depois de aplicar as datas do dia
    PD_PAUSA_MS: 150,       // ms entre um detalhe e outro no Relatório de Pendências (não sobrecarrega o ER)
    RD_PAUSA_IA: 4000,      // ms entre uma conversa e outra na análise (respeita o limite do plano grátis do Gemini)
    RD_TIMEOUT_IA: 45,      // s máximos esperando cada resposta do Gemini
    RD_ESPERA_LIMITE: 20,   // s de espera quando o Gemini avisa limite de uso (HTTP 429), antes de tentar de novo
    RD_ESPERA_FALHA: 5,     // s de espera quando o Gemini não responde ou está sobrecarregado, antes de tentar de novo
    RD_TENTATIVAS_IA: 3,    // tentativas por conversa (limite de uso, sem resposta ou servidor sobrecarregado)
    RD_FALHAS_SEGUIDAS: 2,  // conversas seguidas sem resposta do Gemini para parar a análise
    RD_MAX_MENSAGENS: 60,   // últimas mensagens da conversa enviadas para a análise
    RD_MAX_CARACTERES: 9000, // tamanho máximo do texto da conversa enviado para a análise
  };

  // janela da página (fora da sandbox do Tampermonkey): dá acesso aos objetos do próprio site
  const PAGINA = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // Preferências (aba Configurações). Valor padrão usado quando o usuário nunca alterou.
  const PADRAO = {
    auditoriaCompleta: true,         // CPF, motivo e dados da proposta (modelo Auditoria 2 Completo)
    ignorarCanceladasTestes: true,   // canceladas e testes nunca são processadas
    diarioTudo: true,                // Relatório Diário: visão geral do dia (entram canceladas e em digitação; testes continuam fora)
    rendasReprovadas: false,         // relatório de Rendas: false = só aprovadas/efetivadas; true = inclui as reprovadas
    formatoAuto: true,               // formato de cópia escolhido pelo modo
    formatosAntigos: false,          // mostra os formatos antigos na escolha manual
    aparencia: 'nova',               // 'nova' (padrão) ou 'antiga'
    tema: 'claro',                   // 'claro' (padrão) ou 'escuro' (só cores)
    copiarAoConcluir: true,          // copia o resultado sozinho quando a fila termina
    trocaSemConfirmacao: true,
    loginAuto: true,                 // sessão do ER expirada: entra sozinho na última conta usada (só com a senha salva em Contas)
    lerAbaCliente: true, 
    tmExpedienteAuto: true,          // Timers: inicia os agendamentos "próximo expediente" ao entrar no ER
    cacTrocaAuto: true,              // Consulta CAC: troca sozinho para a conta master quando a atual não tem acesso
    cacVoltarConta: true,            // Consulta CAC: volta para a conta anterior depois da consulta
    cacPosicaoGeral: true,           // Consulta CAC: abre a Posição Geral (o sistema registra protocolo, como na tela)            // auditoria completa: telefone e e-mail pela aba Cliente da análise       // trocar de conta sem a janela de confirmação do script
    mesaHoje: true,                  // Mesa de Crédito abre com as datas de hoje (ou as que você escolheu hoje)
    navAuto: true,                   // abre sozinho a tela do sistema que a função precisa (Mesa de Crédito, Fila de Propostas)
    equipeAtiva: false,              // sincronização da equipe (Pusher): só liga quando o funcionário configura
  };
  const cfg = k => GM_getValue(k, PADRAO[k]);

  // ER sem sessão: a tela de login (#frmLogin / #txtSenha) ou a página de aviso de sessão expirada. Com a sessão vencida,
  // o ER redireciona TODA requisição para /AvisoSessao/AvisoSessao (HTTP 200, sem a lista e sem os dados): "Sua sessão
  // de trabalho expirou. Por favor, refaça seu login no sistema." + botão "Acessar o Sistema" (ReiniciaSistema()).
  // Só o "refaça seu login" e o ReiniciaSistema são da página de aviso: a janela #dlgRelogin, escondida em toda página
  // logada, também diz "sessão de trabalho expirou". O "ç" pode vir como &#231; ou &ccedil;: \S{1,8} cobre as formas.
  const erSemSessao = t => /id=["']?frmLogin|id=["']?txtSenha|function\s+ReiniciaSistema|refa\S{1,8}a seu login/i.test(t || '');
  const SESSAO_EXPIRADA = 'sessão do ER expirada';

  // sleep via Web Worker: abas em segundo plano deixam setTimeout lento (até 1 minuto por tick); o worker não.
  // Se o site bloquear o worker (CSP), cai no setTimeout normal. O setTimeout reserva (ms + 1,5 s) evita travar se o worker falhar.
  const sleep = (() => {
    let w = null, n = 0;
    const pend = {};
    try {
      w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>{const i=e.data.i;setTimeout(()=>postMessage(i),e.data.ms)}'])));
      w.onmessage = e => { const f = pend[e.data]; delete pend[e.data]; if (f) f(); };
      w.onerror = () => { w = null; };
    } catch (_) { w = null; }
    return ms => new Promise(r => {
      if (!w) return setTimeout(r, ms);
      const i = ++n;
      pend[i] = r;
      try { w.postMessage({ i, ms }); } catch (_) { delete pend[i]; return setTimeout(r, ms); }
      setTimeout(() => { if (pend[i]) { delete pend[i]; r(); } }, ms + 1500);
    });
  })();
  const NOMES = { qtd: 'qtd restritivos', val: 'valor restritivos', score: 'score', consultas: 'consultas', cpf: 'cpf', reprov: 'motivo da reprovação', rendaInf: 'renda informada', rendaBiro: 'renda do birô' };
  // Auditoria completa inclui CPF e motivo; os dados de crédito são SEMPRE coletados.
  const campos = () => {
    const m = GM_getValue('modo', 'coleta');
    if (m === 'aprovadas') return ['cpf'];
    if (m === 'reprovadas') return ['reprov'];
    if (m === 'rendas') return ['rendaInf', 'rendaBiro', 'cpf'];   // '' em rendaBiro = a proposta não tem RendaCalculo (conta como lido)
    const credito = ['qtd', 'val', 'score', 'consultas'];
    return cfg('auditoriaCompleta') ? [...credito, 'cpf', 'reprov'] : credito;
  };
  const completo = d => !!d && campos().every(k => d[k] != null);
  const faltaCampos = d => !d ? ['tudo'] : campos().filter(k => d[k] == null).map(k => NOMES[k]);

  /* ================= LEITURA DA ÁRVORE ================= */

  // tira o ": null" (e similares) do título dos nós-objeto: "calculaRisco: null" -> "calculaRisco"
  const limpa = s => s.replace(/\s*:\s*(null|undefined|Object|Array\(\d*\)|\{.*\}|\[.*\])?\s*$/i, '').trim();

  // execuções do fluxo: "27/10/2026 às 12:34:56"
  const rxData = /^(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2}):(\d{2})(?::(\d{2}))?/;
  const chaveData = txt => {
    const m = String(txt).match(rxData);
    return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5] + (m[6] || '00')) : -1;
  };

  // A árvore é VIRTUALIZADA: só os nós da área visível existem no DOM.
  const nos = () =>
    [...document.querySelectorAll('.ant-tree-treenode')].map(no => {
      const t = no.querySelector('.ant-tree-title');
      if (!t) return null;
      const txt = t.textContent.replace(/\s+/g, ' ').trim();
      return {
        t: txt,                                                       // texto completo
        n: limpa(txt),                                                // nome sem ": null"
        d: no.querySelectorAll('.ant-tree-indent-unit').length,       // profundidade
      };
    }).filter(x => x && x.t);

  /* ---- Leitura direta dos dados da árvore (React) ----
     A árvore do MobFacil (antd/rc-tree) guarda TODOS os nós na memória (treeData), inclusive os fechados
     e os fora da tela. Quando o navegador permite acessar esses dados, os valores são lidos sem depender
     de cliques. Se não der (outro navegador, outra versão do site), tudo continua pelo caminho de cliques.
     A lista só é usada depois de conferida com os títulos que aparecem na tela. */
  const react = { dados: null, bruta: null, lista: null, ok: null, nos: 0, motivo: 'não lido', inst: null };

  const textoReact = (x, prof = 0) => {
    if (x == null || typeof x === 'boolean' || prof > 15) return '';
    if (typeof x === 'string' || typeof x === 'number') return String(x);
    if (Array.isArray(x)) return x.map(y => textoReact(y, prof + 1)).join('');
    if (typeof x === 'object' && x.props) return textoReact(x.props.children, prof + 1);
    return '';
  };

  function arvoreReact() {
    let raizes = [];
    try { raizes = [...PAGINA.document.querySelectorAll('.ant-tree')]; } catch (_) { return null; }
    for (const el of raizes) {
      let k = null;
      try { k = Object.keys(el).find(x => /^__react(Fiber|InternalInstance)\$/.test(x)); } catch (_) {}
      if (!k) continue;
      let f = el[k], achado = null, inst = null;
      for (let i = 0; f && i < 40; i++, f = f.return) {
        const sn = f.stateNode, st = sn && sn.state;
        if (!inst && st && typeof st === 'object' && 'listChanging' in st) inst = sn;
        if (!achado && st && Array.isArray(st.treeData)) achado = { dados: st.treeData, fn: st.fieldNames || (sn.props || {}).fieldNames || {}, tr: (sn.props || {}).titleRender };
        const p = f.memoizedProps;
        if (!achado && p && Array.isArray(p.treeData)) achado = { dados: p.treeData, fn: p.fieldNames || {}, tr: p.titleRender };
        if (achado && inst) break;
      }
      if (achado || inst) return { ...(achado || {}), inst };
    }
    return null;
  }

  function achatar(info) {
    const kc = (info.fn && info.fn.children) || 'children', kt = (info.fn && info.fn.title) || 'title';
    const out = [];
    const rec = (arr, d) => {
      for (const n of arr) {
        if (out.length >= 40000) return;
        if (!n || typeof n !== 'object') continue;
        let t = n[kt];
        if (typeof info.tr === 'function') { try { const s = textoReact(info.tr(n)); if (s) t = s; } catch (_) {} }
        if (typeof t === 'function') { try { t = t(n); } catch (_) { t = ''; } }
        const txt = textoReact(t).replace(/\s+/g, ' ').trim();
        const filhos = Array.isArray(n[kc]) ? n[kc] : [];
        out.push({ t: txt, n: limpa(txt), d, filhos: filhos.length });
        if (filhos.length && d < 80) rec(filhos, d + 1);
      }
    };
    rec(info.dados, 0);
    return out;
  }

  // Várias execuções do fluxo (datas) no mesmo nível: mantém só a MAIS RECENTE, igual ao caminho de cliques.
  function podarExecucoes(lista) {
    const fora = new Uint8Array(lista.length);
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      const datas = [];
      for (let j = i + 1; j < lista.length && lista[j].d > p.d; j++) if (lista[j].d === p.d + 1 && rxData.test(lista[j].n)) datas.push(j);
      if (datas.length < 2) continue;
      const melhor = datas.reduce((a, b) => (chaveData(lista[b].t) > chaveData(lista[a].t) ? b : a));
      datas.forEach(j => {
        if (j === melhor) return;
        fora[j] = 1;
        for (let k = j + 1; k < lista.length && lista[k].d > lista[j].d; k++) fora[k] = 1;
      });
    }
    return lista.filter((_, i) => !fora[i]);
  }

  // confere a lista da memória com os títulos visíveis na tela (null = ainda não dá para conferir)
  function validarReact(bruta) {
    const dom = nos().slice(0, 80);
    if (dom.length < 3) return null;
    const vistos = new Set(bruta.map(n => n.t));
    return dom.filter(n => vistos.has(n.t)).length / dom.length >= 0.8;
  }

  function listaReact() {
    const arv = arvoreReact();
    react.inst = arv ? arv.inst : null;
    if (!arv || !arv.dados) { react.motivo = 'árvore React não acessível'; return null; }
    if (arv.dados !== react.dados) {
      react.dados = arv.dados;
      try { react.bruta = achatar(arv); react.lista = podarExecucoes(react.bruta); } catch (e) { react.bruta = react.lista = []; }
      react.nos = react.bruta.length;
      react.ok = null;
    }
    if (react.ok == null && react.bruta.length) {
      const v = validarReact(react.bruta);
      if (v != null) { react.ok = v; react.motivo = v ? 'ok' : 'títulos não conferem com a tela'; }
    }
    return react.ok ? react.lista : null;
  }
  // nº de filhos de um nó segundo a memória da árvore (null = não sabe)
  const filhosReact = (txt, d) => {
    if (!react.ok || !react.bruta) return null;
    const n = react.bruta.find(x => x.d === d && x.t === txt);
    return n ? n.filhos : null;
  };
  // só o bloco "Fluxos P1" (quando existe); sem ele (ex.: fluxos_reanalise), a árvore toda
  const soP1 = lista => {
    const i = lista.findIndex(n => /^Fluxos P1\b/i.test(n.t));
    if (i < 0) return lista;
    let f = i + 1;
    while (f < lista.length && lista[f].d > lista[i].d) f++;
    return lista.slice(i, f);
  };

  function valor(lista, chave, ancora) {
    let i = -1, dA = null;
    if (ancora) {
      i = lista.findIndex(n => n.n.toLowerCase() === ancora.toLowerCase());
      if (i < 0) return null;
      dA = lista[i].d;
    }
    const escopo = dA != null && lista.some(n => n.d > 0);
    const re = new RegExp('^' + chave + '\\s*:\\s*(.*)$', 'i');
    for (let j = i + 1; j < lista.length; j++) {
      if (escopo && lista[j].d <= dA) break;
      const m = lista[j].t.match(re);
      if (m) return m[1].trim();
    }
    return null;
  }

  // converte para o formato da planilha (vírgula decimal, sem separador de milhar)
  const num = v => {
    if (v == null) return null;
    v = String(v).trim();
    if (!v || /^(null|undefined|-)$/i.test(v)) return null;
    const m = v.replace(/[^\d.,-]/g, '');
    if (!m || !/\d/.test(m)) return null;
    if (m.includes(',')) return m.replace(/\./g, '');                      // 1.234,56 -> 1234,56
    if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(m)) return m.replace(/\./g, ''); // 1.234 (milhar) -> 1234
    return m.replace('.', ',');                                            // 1234.56 -> 1234,56
  };

  // nós "raiz" dos dados (usado só no diagnóstico)
  const RAIZES = /^(spcbrasil|calcularisco|pendenciafinanceira|consultarealizada|scorecadastropositivo)$/i;

  // dados de crédito e CPF a partir de uma lista de nós (da tela ou da memória da árvore)
  function extrairDeLista(todos) {
    const marcas = [];
    todos.forEach((n, i) => { if (/^Fluxos P\d/i.test(n.t)) marcas.push({ nome: n.t, ini: i }); });
    marcas.forEach((m, k) => (m.fim = k + 1 < marcas.length ? marcas[k + 1].ini : todos.length));
    const bloco = n => {
      const m = marcas.find(x => new RegExp('P' + n + '\\b', 'i').test(x.nome));
      return m ? todos.slice(m.ini, m.fim) : [];
    };
    const p1 = bloco(1), p2 = bloco(2);

    // Restritivos: tenta com âncora calculaRisco; sem a âncora na janela, lê pelo nome do campo
    // (QuantidadeRestritivos / ValorRestritivos não se confundem com FonteQuantidade... pois a regex começa no início);
    // por último usa pendenciaFinanceira.
    const restritivos = lista => {
      let qtd = num(valor(lista, 'QuantidadeRestritivos', 'calculaRisco')) ?? num(valor(lista, 'QuantidadeRestritivos'));
      let val = num(valor(lista, 'ValorRestritivos', 'calculaRisco')) ?? num(valor(lista, 'ValorRestritivos'));
      if (qtd == null) qtd = num(valor(lista, 'quantidadeTotal', 'pendenciaFinanceira'));
      if (val == null) val = num(valor(lista, 'valorTotal', 'pendenciaFinanceira'));
      return { qtd, val };
    };

    let { qtd, val } = restritivos(p1);
    if (qtd == null || val == null) {            // não resolveu no bloco P1: tenta na janela inteira
      const g = restritivos(todos);
      if (qtd == null) qtd = g.qtd;
      if (val == null) val = g.val;
    }

    // Score: o nó scoreCadastroPositivo (ramo do SPC) guarda o valor. Aceita "valorScore" em qualquer
    // lugar ou "score" dentro do scoreCadastroPositivo.
    const score =
      num(valor(todos, 'valorScore')) ??
      num(valor(todos, 'valorScore', 'scoreCadastroPositivo')) ??
      num(valor(todos, 'score', 'scoreCadastroPositivo')) ??
      num(valor(todos, 'quantidadeTotal', 'scoreCadastroPositivo'));   // o resumo do SPC repete o score (ex.: 788, 351)
    const consultas = num(
      valor(p2, 'quantidadeTotal', 'consultaRealizada') ??
      valor(todos, 'quantidadeTotal', 'consultaRealizada') ??
      valor(p1, 'quantidadeTotal', 'consultaRealizada')
    );
    // CPF: nó "Cpf: 12345678901" logo abaixo da execução do fluxo (só aceita 11 dígitos)
    const cpfDig = String(valor(todos, 'Cpf') || '').replace(/\D/g, '');
    const cpf = cpfDig.length === 11 ? cpfDig : null;
    return { qtd, val, score, consultas, cpf };
  }

  // Relatório de Rendas: o nó "RendaCalculo: 1724.27" da árvore é a renda do birô. Pega o primeiro com número válido.
  // O valor vem do JSON (o ponto é DECIMAL): num() leria "900.125" como milhar, por isso este tratamento à parte.
  function rendaDeLista(lista) {
    for (const n of lista) {
      const m = n.t.match(/^RendaCalculo\s*:\s*(.*)$/i);
      if (!m) continue;
      const v = m[1].trim();
      const x = /^-?\d+(\.\d+)?$/.test(v) ? v.replace('.', ',') : num(v);
      if (x != null) return x;
    }
    return null;
  }

  // campo do cartão do resultado ("Renda informada: 3000"): rótulo e valor são <span> vizinhos dentro de .ant-card-body
  function cartao(rotulo, texto) {
    const rx = new RegExp('^\\s*' + rotulo + '\\s*:\\s*$', 'i');
    try {
      for (const sp of document.querySelectorAll('.ant-card-body span')) {
        if (!rx.test(sp.textContent)) continue;
        const v = sp.nextElementSibling;
        if (v && v.textContent.trim()) return v.textContent.trim();
      }
    } catch (_) {}
    // reserva: texto da página (os <span> vêm colados, então o valor termina no próximo rótulo do cartão)
    const m = String(texto || '').match(new RegExp(rotulo + '\\s*:\\s*([^:]*?)(?=\\s*(?:Fluxo processado|CPF|Data de nascimento|Renda informada|ID da proposta|Pol[ií]tica|Nome do cliente)\\s*:|$)', 'i'));
    return m && m[1].trim() ? m[1].trim() : null;
  }

  function extrair() {
    const texto = document.body.textContent.replace(/\s+/g, ' ');
    const id = (texto.match(/ID da proposta:\s*(\d+)/i) || [])[1];
    if (!id) return null;
    // 1) o que está na tela (validado nas versões anteriores); 2) completa o que faltar com a memória da árvore
    const r = extrairDeLista(nos());
    let lr = null;
    try { lr = listaReact(); } catch (_) { lr = null; }
    if (lr) {
      const x = extrairDeLista(soP1(lr));
      ['qtd', 'val', 'score', 'consultas', 'cpf'].forEach(k => { if (r[k] == null && x[k] != null) r[k] = x[k]; });
    }
    // modo "rendas": Renda informada, nome e CPF vêm do cartão do resultado; RendaCalculo (renda do birô) vem da árvore
    // (tela e, se faltar, memória: primeiro o bloco "Fluxos P1", depois a árvore inteira)
    if (GM_getValue('modo', 'coleta') === 'rendas') {
      let rb = rendaDeLista(nos());
      if (rb == null && lr) { rb = rendaDeLista(soP1(lr)); if (rb == null) rb = rendaDeLista(lr); }
      r.rendaBiro = rb;
      r.rendaInf = num(cartao('Renda informada', texto));
      r.nome = cartao('Nome do cliente', texto);
      if (r.cpf == null) { const c = String(cartao('CPF', texto) || '').replace(/\D/g, ''); if (c.length === 11) r.cpf = c; }
    }
    // Mensagem de reprovação do MobFacil: "(P1) Reprovar: renda inferior a mínima permitida (1621 reais) (atual=R$1300)"
    // null = cartão de resultado ainda não carregou; '' = carregou e não tem mensagem de reprovação
    let reprov = null;
    if (/Fluxo processado\s*:/i.test(texto)) {
      // cada motivo termina no "(atual=...)", "(score=...)" ou "(situação=...)" e NUNCA atravessa o motivo seguinte
      // (antes um motivo de score seguido de um de valor virava uma mensagem só, e o score sem "atual=" se perdia)
      let ms = texto.match(/\(P\d+\)\s*Reprovar\s*:(?:(?!\(P\d+\)\s*Reprovar).){0,200}?\((?:atual|score|situa[çc][ãa]o)\s*=\s*[^)]*\)/gi);
      if (!ms) ms = texto.match(/\(P\d+\)\s*Reprovar\s*:.{0,150}?(?=\s*\(P\d+\)|\s*Exibir|\s*$)/gi);
      reprov = [...new Set((ms || []).map(x => x.trim()))].join(' ¦ ');
    }
    // reprovada por score: a própria mensagem traz o valor, ex.: "(score=351)"
    if (r.score == null && reprov) {
      const ms = reprov.match(/score\s*=\s*(\d+(?:[.,]\d+)?)/i);
      if (ms) r.score = num(ms[1]);
    }
    return { id, ...r, reprov };
  }

  // só preenche campos ainda vazios: uma leitura posterior nunca sobrescreve dado bom
  function salvar(r) {
    const todos = GM_getValue('dados', {});
    const atual = todos[r.id] || {};
    let mudou = false;
    ['qtd', 'val', 'score', 'consultas', 'cpf', 'reprov', 'rendaInf', 'rendaBiro', 'nome'].forEach(k => {
      if (r[k] != null && (atual[k] == null || (k === 'reprov' && atual[k] === '' && r[k] !== ''))) { atual[k] = r[k]; mudou = true; }
    });
    if (!mudou) return;
    todos[r.id] = atual;
    GM_setValue('dados', todos);
    console.log('[PaymobiFin]', r.id, atual);
  }

  /* ================= IFRAME DO MOTOR (enviamotor.mobfacil.com.br) ================= */
  function iniciarMotor() {
    // Em aba escondida o navegador não executa requestAnimationFrame, e a árvore (antd) usa isso para abrir os nós.
    // Só enquanto a aba estiver escondida, troca por um setTimeout equivalente. Com a aba visível nada muda.
    try {
      const W = PAGINA;
      const raf0 = W.requestAnimationFrame.bind(W), caf0 = W.cancelAnimationFrame.bind(W);
      const falsos = new Map();
      let nid = 1e9;
      W.requestAnimationFrame = cb => {
        if (!document.hidden) return raf0(cb);
        const id = ++nid;
        falsos.set(id, setTimeout(() => { falsos.delete(id); cb(performance.now()); }, 16));
        return id;
      };
      W.cancelAnimationFrame = id => {
        if (falsos.has(id)) { clearTimeout(falsos.get(id)); falsos.delete(id); } else caf0(id);
      };
    } catch (_) {}
    function pesquisar(termo) {
      const inp = [...document.querySelectorAll('input')]
        .find(i => i.offsetParent !== null && /^(text|search|)$/.test(i.type || ''));
      if (!inp) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, termo);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      const caixa = inp.closest('.ant-input-group-wrapper') || inp.parentElement;
      const btn = caixa && caixa.querySelector('button, .anticon-search');
      if (btn) btn.click();
      return true;
    }

    // contêiner rolável da árvore virtualizada (null = a árvore inteira cabe na tela)
    function areaRolavel() {
      const h = document.querySelector('.ant-tree-list-holder');
      if (h && h.scrollHeight > h.clientHeight + 5) return h;
      let p = document.querySelector('.ant-tree-treenode');
      while (p && p.parentElement && p !== document.documentElement) {
        p = p.parentElement;
        if (p.scrollHeight > p.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
      }
      return null;
    }

    /* A árvore ignora cliques enquanto a animação de abrir/fechar está em andamento (rc-tree: "listChanging").
       Se a animação fica presa (nó animado fora da área visível), TODOS os cliques seguintes são ignorados:
       era o que travava "result"/"return_object" e fazia o score não abrir (4677, 4688, 4689).
       Antes de cada clique, espera a animação terminar; se ela não termina, traz o nó animado para a tela
       e, em último caso, libera a árvore. */
    let destravadas = 0;
    const emMovimento = () => {
      if (document.querySelector('.ant-tree-treenode-motion')) return true;
      try { return !!(react.inst && react.inst.state && react.inst.state.listChanging); } catch (_) { return false; }
    };
    const aguardarMovimento = async () => {
      const ini = Date.now();
      try { const a = arvoreReact(); if (a) react.inst = a.inst; } catch (_) {}
      while (emMovimento() && Date.now() - ini < CONFIG.ESPERA_MOVIMENTO) {
        if (Date.now() - ini > 500) {
          const m = document.querySelector('.ant-tree-treenode-motion'), h = areaRolavel();
          if (m && h) {
            const r = m.getBoundingClientRect(), rh = h.getBoundingClientRect();
            if (r.bottom < rh.top || r.top > rh.bottom) h.scrollTop += r.top - rh.top - 40;
          }
        }
        if (Date.now() - ini > CONFIG.DESTRAVA_MOVIMENTO) {
          try {
            const inst = react.inst;
            if (inst && inst.state && inst.state.listChanging) {
              if (typeof inst.onListChangeEnd === 'function') inst.onListChangeEnd();
              else inst.setState({ listChanging: false });
              destravadas++;
            }
          } catch (_) {}
        }
        await sleep(50);
      }
    };

    // clica no seletor (+) do nó; relocaliza o elemento (a lista virtual recria os nós) e, a partir da
    // 3ª tentativa, envia a sequência completa de eventos do mouse
    const clicar = (item, tentativa) => {
      const fresco = [...document.querySelectorAll('.ant-tree-treenode')].find(no => {
        const t = no.querySelector('.ant-tree-title');
        return t && t.textContent.replace(/\s+/g, ' ').trim() === item.txt && no.querySelectorAll('.ant-tree-indent-unit').length === item.d;
      }) || item.no;
      const sw = fresco.querySelector(':scope > .ant-tree-switcher_close');
      if (!sw) return false;
      if (tentativa <= 2) { sw.click(); return true; }
      const o = { bubbles: true, cancelable: true, button: 0 };
      try { sw.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (_) {}
      sw.dispatchEvent(new MouseEvent('mousedown', o));
      try { sw.dispatchEvent(new PointerEvent('pointerup', o)); } catch (_) {}
      sw.dispatchEvent(new MouseEvent('mouseup', o));
      sw.dispatchEvent(new MouseEvent('click', o));
      return true;
    };

    // Diagnóstico SEM dados pessoais: só mostra o NOME dos campos.
    // Valores só aparecem para campos numéricos de interesse (quantidade, valor, score, restritivos...).
    const SEGURO = /^(quantidade\w*|valor\w*|total\w*|qtd\w*|score\w*|\w*restritiv\w*|pendencia\w*|consulta\w*)$/i;
    const fmt = n => {
      const i = n.t.indexOf(':');
      const chave = (i < 0 ? n.t : n.t.slice(0, i)).trim().slice(0, 60);
      const val = i < 0 ? '' : n.t.slice(i + 1).trim();
      const mostra = i >= 0 && SEGURO.test(chave) && /^(null|undefined|true|false|-?[\d.,]*)$/i.test(val);
      return '.'.repeat(n.d) + chave + (mostra ? ': ' + val : (i >= 0 ? ': …' : ''));
    };

    // guarda o estado por proposta; se a proposta está incompleta, guarda também o esqueleto da árvore
    function snapshot(id, etapa, buscaOk) {
      const todas = nos();
      const semToken = todas.filter(n => !/token|jwt/i.test(n.t));
      const dadosAteAgora = (id && GM_getValue('dados', {})[id]) || null;
      const h = areaRolavel();
      const info = {
        versao: VERSAO, id, etapa, buscaOk, quando: new Date().toLocaleTimeString(),
        totalNos: todas.length,
        nosFechados: document.querySelectorAll('.ant-tree-switcher_close').length,
        rolagem: h ? { topo: Math.round(h.scrollTop), visivel: h.clientHeight, total: h.scrollHeight } : 'sem rolagem',
        // leitura direta da memória da árvore: ok = usada; nos = quantidade de nós lidos
        memoria: { ok: react.ok, nos: react.nos, motivo: react.motivo },
        animacao: { agora: emMovimento(), destravadas },
        dadosAteAgora,
        linhas: semToken.filter(n =>
          /restritiv|score|quantidadeTotal|valorTotal|^Fluxos|calculaRisco|pendencia|consultaRealizada|^resumo$|^Exibir|^\d{2}\/\d{2}\/\d{4}|reanalise/i.test(n.t)
        ).slice(0, 60).map(fmt),
      };
      if (!completo(dadosAteAgora)) {
        // esqueleto: só os níveis de cima, sem entrar nos blocos de dados cadastrais
        info.esqueleto = semToken.filter(n => n.d <= 4).slice(0, 120).map(fmt);
        // tudo que está dentro de SPCBrasil / calculaRisco / pendenciaFinanceira / consultaRealizada / scoreCadastroPositivo
        const dentro = [];
        let raiz = null;
        semToken.forEach(n => {
          if (raiz != null && n.d <= raiz) raiz = null;
          if (raiz == null && RAIZES.test(n.n)) raiz = n.d;
          if (raiz != null) dentro.push(fmt(n));
        });
        info.dentroDasRaizes = dentro.slice(0, 250);
        // estrutura da memória (só nomes, até 4 níveis) — mostra o que existe mesmo nos nós fechados (ex.: fluxos_reanalise)
        if (react.bruta && react.bruta.length) info.memoriaEsqueleto = react.bruta.filter(n => n.d <= 5 && !/token|jwt/i.test(n.t)).slice(0, 120).map(fmt);
      }
      // histórico: a árvore como ficou depois de cada caminho (não é sobrescrito pelo snapshot seguinte)
      const todos = GM_getValue('debug', {});
      const chave = id || 'sem-id';
      const antigo = todos[chave] || {};
      const hist = antigo.historico || [];
      if (/^caminho/.test(etapa)) hist.push({ etapa, quando: info.quando, arvore: semToken.slice(0, 120).map(fmt) });
      info.historico = hist.slice(-4);
      todos[chave] = info;
      GM_setValue('debug', todos);
    }

    let iniciado = false;
    const t0 = Date.now();
    const timer = setInterval(async () => {
      const rodando = GM_getValue('rodando', false);
      const temArvore = document.querySelector('.ant-tree-title');
      const r = temArvore ? extrair() : null;
      // só grava quando a coleta automática está rodando E é a proposta da vez
      // (abrir o painel do MobFacil manualmente não altera mais os dados)
      if (r && rodando && GM_getValue('atualId', '') === r.id) salvar(r);
      if (!rodando || iniciado) return;

      if (!r) {
        if (Date.now() - t0 > CONFIG.ESPERA_ARVORE * 1000) {
          iniciado = true; clearInterval(timer);
          snapshot(null, 'não achou ID da proposta ou árvore', null);
        }
        return;
      }
      if (GM_getValue('atualId', '') !== r.id) return;   // não é a coleta automática desta proposta
      iniciado = true;
      clearInterval(timer);
      snapshot(r.id, 'começou', null);

      // o iframe encerra sozinho antes de a janela principal desistir
      const prazo = Date.now() + (CONFIG.TEMPO_MAX - CONFIG.MARGEM) * 1000;

      const lerEGravar = () => {
        const x = extrair();
        if (x && x.id === r.id) salvar(x);
      };
      const dadosAtuais = () => GM_getValue('dados', {})[r.id] || {};

      /* A árvore do MobFacil é uma "SANFONA": abrir um nó FECHA os irmãos dele.
         Por isso não dá para abrir tudo de uma vez. Abre-se só o CAMINHO até o dado, lê,
         e depois abre o caminho do próximo dado. Sempre um clique por vez, recalculando
         o próximo passo a partir da árvore como ela está agora. */
      // "Fluxos P1" (ou, em propostas de reanálise, "fluxos_reanalise"); data = a execução mais recente (pula se não houver datas)
      const FLUXO = [{ re: /^exibir fluxos$/i }, { re: /^fluxos p1\b/i, alt: /^fluxos[\s_-]*rean/i }, { data: true, pula: true }];
      const SPC = [{ re: /^biros$/i }, { re: /^spcbrasil$/i }, { re: /^result$/i }, { re: /^return_object$/i }, { re: /^resultado$/i }];
      const CAMINHOS = {
        // só abre a execução do fluxo (o CPF fica logo abaixo dela)
        fluxo: [...FLUXO],
        // restritivos (qtd, valor)
        risco: [...FLUXO, { re: /^regrasdenegocios$/i }, { re: /^calcularisco$/i }],
        // consultas: consultaRealizada > resumo > quantidadeTotal
        consultas: [...FLUXO, ...SPC, { re: /^consultarealizada$/i }, { re: /^resumo$/i, opc: true }],
        // score: scoreCadastroPositivo (os filhos são abertos em seguida por explorarScore)
        score: [...FLUXO, ...SPC, { re: /^scorecadastropositivo$/i }],
        // reserva dos restritivos, pelo SPC
        pendencia: [...FLUXO, ...SPC, { re: /^pendenciafinanceira$/i }, { re: /^resumo$/i, opc: true }],
      };
      const IDX_CONSULTA = CAMINHOS.consultas.length - 2;   // posição do nó consultaRealizada no caminho

      const lerNos = () => [...document.querySelectorAll('.ant-tree-treenode')].map(no => {
        const t = no.querySelector('.ant-tree-title');
        if (!t) return null;
        const txt = t.textContent.replace(/\s+/g, ' ').trim();
        return {
          no, txt, nome: limpa(txt),
          d: no.querySelectorAll('.ant-tree-indent-unit').length,
          fechado: !!no.querySelector(':scope > .ant-tree-switcher_close'),
        };
      }).filter(Boolean);

      // próximo passo do caminho: 'abrir' (nó fechado a clicar), 'ok' (caminho todo aberto) ou 'sem-no'
      const proximo = passos => {
        const lista = lerNos();
        let ini = 0, fim = lista.length, dPai = -1, pai = null;
        for (let k = 0; k < passos.length; k++) {
          const p = passos[k];
          const achar = re => {
            let alvo = -1;
            for (let j = ini; j < fim; j++) {
              const n = lista[j];
              if (k > 0 && n.d !== dPai + 1) continue;                    // só filhos diretos do nó anterior
              if (!(p.data ? rxData.test(n.nome) : re.test(n.nome))) continue;
              if (alvo < 0 || (p.data && chaveData(n.txt) > chaveData(lista[alvo].txt))) alvo = j;
              if (!p.data) break;
            }
            return alvo;
          };
          let alvo = achar(p.re);
          if (alvo < 0 && p.alt) alvo = achar(p.alt);
          if (alvo < 0) {
            const paiComFilhos = pai && !pai.fechado && fim - ini > 0;
            if (p.pula && paiComFilhos) continue;                         // passo dispensável (ex.: reanálise sem datas)
            if (p.opc && paiComFilhos) return { estado: 'ok' };           // passo opcional que não existe
            return { estado: 'sem-no', passo: k, paiAberto: !!pai && !pai.fechado, nFilhos: fim - ini };
          }
          const n = lista[alvo];
          if (n.fechado) return { estado: 'abrir', no: n, passo: k };
          let f = alvo + 1;
          while (f < lista.length && lista[f].d > n.d) f++;
          ini = alvo + 1; fim = f; dPai = n.d; pai = n;
        }
        return { estado: 'ok' };
      };

      const rodarCaminho = async (passos, maxSeg) => {
        const limite = Math.min(Date.now() + maxSeg * 1000, prazo);
        const cliques = {};
        const ultimoObrig = passos.reduce((a, p, i) => (p.opc ? a : i), -1);   // último passo que não é opcional
        let ultimoClique = 0, ultimaChave = '', semNoDesde = 0, varre = 0, oks = 0;
        const h0 = areaRolavel();
        if (h0) h0.scrollTop = 0;
        await sleep(150);
        while (Date.now() < limite) {
          lerEGravar();
          if (completo(dadosAtuais())) return { res: 'completo' };
          const s = proximo(passos);
          if (s.estado === 'ok') {
            if (++oks >= 2) return { res: 'ok' };                       // estável: 'ok' duas leituras seguidas
            await sleep(CONFIG.ESPERA_CLIQUE);
            continue;
          }
          oks = 0;
          if (s.estado === 'abrir') {
            semNoDesde = 0; varre = 0;
            const chave = s.no.d + '|' + s.no.txt;
            // nó novo (o anterior já abriu): clica logo; o MESMO nó ainda fechado: espera o intervalo longo
            if (Date.now() - ultimoClique >= (chave === ultimaChave ? CONFIG.INTERVALO_CLIQUE : CONFIG.GAP_NOVO_NO) &&
                !s.no.no.querySelector('.ant-tree-switcher-loading-icon')) {
              // nó final que não abre depois de alguns cliques = nó vazio (lista sem itens), não é erro.
              // Se a memória da árvore mostra que ele TEM filhos, não é vazio: continua tentando (evita "0" falso).
              if (s.passo === ultimoObrig && (cliques[chave] || 0) >= CONFIG.CLIQUES_VAZIO && !(filhosReact(s.no.txt, s.no.d) > 0)) {
                return { res: 'vazio', nome: s.no.nome.slice(0, 40), passo: s.passo };
              }
              cliques[chave] = (cliques[chave] || 0) + 1;
              if (cliques[chave] > CONFIG.MAX_CLIQUES_NO) return { res: 'travou', nome: s.no.nome.slice(0, 40), passo: s.passo };
              await aguardarMovimento();
              if (clicar(s.no, cliques[chave])) { ultimoClique = Date.now(); ultimaChave = chave; }
            }
            await sleep(CONFIG.ESPERA_CLIQUE);
            continue;
          }
          // 'sem-no': o nó pode estar fora da janela (árvore virtualizada) ou ainda renderizando
          if (!semNoDesde) semNoDesde = Date.now();
          if (Date.now() - semNoDesde < CONFIG.ESPERA_RENDER) { await sleep(80); continue; }   // dá tempo de o nó recém-aberto renderizar antes de rolar
          const espera = Date.now() - semNoDesde > CONFIG.ESPERA_NO * 1000;
          const ausente = { res: 'ausente', passo: s.passo, paiAberto: s.paiAberto, nFilhos: s.nFilhos };
          const h = areaRolavel();
          if (h) {
            const fim = h.scrollTop + h.clientHeight >= h.scrollHeight - 5;
            if (fim) {
              if (++varre >= 2 && espera) return ausente;
              h.scrollTop = 0;
            } else {
              h.scrollTop += Math.max(Math.floor(h.clientHeight * CONFIG.PASSO_ROLAGEM), 100);
            }
            await sleep(CONFIG.PASSO_MS);
          } else {
            if (espera) return ausente;
            await sleep(CONFIG.ESPERA_CLIQUE);
          }
        }
        return { res: 'tempo' };
      };

      // Com o scoreCadastroPositivo aberto, abre os filhos fechados dele, UM por vez, e lê o score depois de cada clique.
      // Sanfona: abrir "detalheScoreCadastroPositivo" fecha o irmão "resumo". Antes o script voltava a abrir o resumo,
      // que fechava o detalhe de novo (pingue-pongue) e o nó com o Score nunca era aberto (4688, 4689).
      // Agora um nó que já esteve aberto (e foi lido) não é reaberto: a exploração segue para dentro.
      const explorarScore = async maxSeg => {
        const limite = Math.min(Date.now() + maxSeg * 1000, prazo);
        const tentados = {}, abertos = new Set();
        let ultimoClique = 0, ultimaChave = '';
        while (Date.now() < limite) {
          lerEGravar();
          if (dadosAtuais().score != null) return 'lido';
          const lista = lerNos();
          const i = lista.findIndex(n => /^scorecadastropositivo$/i.test(n.nome));
          if (i < 0) return 'sem-no';
          const base = lista[i];
          let alvo = base.fechado ? base : null;
          if (!alvo) {
            for (let f = i + 1; f < lista.length && lista[f].d > base.d; f++) {
              const n = lista[f], ch = n.d + '|' + n.txt;
              if (!n.fechado) { abertos.add(ch); continue; }
              if (abertos.has(ch)) continue;
              if ((tentados[ch] || 0) < 3) { alvo = n; break; }
            }
          }
          if (!alvo) {
            // nada mais para abrir: dá uma última chance de a leitura ver o valor renderizado
            await sleep(CONFIG.ESPERA_CLIQUE);
            lerEGravar();
            return dadosAtuais().score != null ? 'lido' : 'sem-filho';
          }
          const chaveA = alvo.d + '|' + alvo.txt;
          if (Date.now() - ultimoClique >= (chaveA === ultimaChave ? CONFIG.INTERVALO_CLIQUE : CONFIG.GAP_NOVO_NO) &&
              !alvo.no.querySelector('.ant-tree-switcher-loading-icon')) {
            tentados[chaveA] = (tentados[chaveA] || 0) + 1;
            await aguardarMovimento();
            if (clicar(alvo, tentados[chaveA])) { ultimoClique = Date.now(); ultimaChave = chaveA; }
          }
          await sleep(CONFIG.ESPERA_CLIQUE);
        }
        return 'tempo';
      };

      // modo "rendas", plano B: pesquisa "RendaCalculo" (a pesquisa abre os ancestrais sozinha) e lê o nó que aparecer
      const buscarRenda = async maxSeg => {
        const limite = Math.min(Date.now() + maxSeg * 1000, prazo);
        await aguardarMovimento();
        const achouCampo = pesquisar('RendaCalculo');
        await sleep(CONFIG.PAUSA_BUSCA);
        const ini = Date.now();
        const h0 = areaRolavel();
        if (h0) h0.scrollTop = 0;
        let varre = 0;
        while (Date.now() < limite) {
          lerEGravar();
          if (dadosAtuais().rendaBiro != null) return 'lido';
          const fim = () => (achouCampo ? 'ausente' : 'sem campo de pesquisa');
          const h = areaRolavel();
          if (h) {
            if (h.scrollTop + h.clientHeight >= h.scrollHeight - 5) {
              if (++varre >= 2 && Date.now() - ini > CONFIG.ESPERA_NO * 1000) return fim();
              h.scrollTop = 0;
            } else h.scrollTop += Math.max(Math.floor(h.clientHeight * CONFIG.PASSO_ROLAGEM), 100);
            await sleep(CONFIG.PASSO_MS);
          } else {
            if (Date.now() - ini > CONFIG.ESPERA_NO * 1000) return fim();
            await sleep(CONFIG.ESPERA_CLIQUE);
          }
        }
        return 'tempo';
      };

      const log = [];
      const rodar = async (nome, maxSeg) => {
        let rr = await rodarCaminho(CAMINHOS[nome], maxSeg);
        if (nome === 'score' && rr.res === 'ok') {
          const e = await explorarScore(maxSeg);
          rr = { ...rr, extra: e };
        }
        if (rr.res === 'vazio') {
          // SPC devolveu a lista vazia: consultaRealizada vazio = 0 consultas; pendenciaFinanceira vazio = 0 restritivos
          if (nome === 'consultas' && /consultarealizada/i.test(rr.nome || '') && GM_getValue('modo', 'coleta') !== 'reprovadas') salvar({ id: r.id, consultas: '0' });
          if (nome === 'pendencia' && /pendenciafinanceira/i.test(rr.nome || '')) salvar({ id: r.id, qtd: '0', val: '0' });
        }
        const txt = nome + ': ' + rr.res + (rr.extra ? '/' + rr.extra : '') + (rr.nome ? ' em ' + rr.nome : '') + (rr.passo != null ? ' (passo ' + rr.passo + ')' : '');
        log.push(txt);
        snapshot(r.id, 'caminho ' + txt, null);
        return rr;
      };

      // antes de abrir qualquer caminho: a memória da árvore pode já ter tudo
      lerEGravar();

      const modoAtual = GM_getValue('modo', 'coleta');
      // modo "rendas": Renda informada (cartão do resultado) + RendaCalculo (nó da árvore = renda do birô).
      // Não usa os caminhos do SPC: lê o cartão, depois a memória da árvore (sem cliques) e, se ela não servir, pesquisa o nó.
      if (modoAtual === 'rendas') {
        // 1) cartão do resultado (Renda informada e CPF): dá um tempo para carregar
        for (let i = 0; i < 10 && (dadosAtuais().rendaInf == null || dadosAtuais().cpf == null) && Date.now() < prazo; i++) {
          await sleep(300);
          lerEGravar();
        }
        // 2) RendaCalculo pela memória da árvore. Memória confiável, completa e estável SEM o nó = a proposta não tem renda do birô
        //    (grava '' para a coleta terminar sem falha; o relatório deixa a coluna vazia)
        const memCompleta = () => !!(react.ok && react.lista && react.lista.some(n => /^(cpf\b|fluxos)/i.test(n.t)));
        const tMem = Date.now();
        let ultimoN = -1, estavel = 0;
        while (dadosAtuais().rendaBiro == null && Date.now() < prazo) {
          lerEGravar();
          if (dadosAtuais().rendaBiro != null) break;
          if (memCompleta()) {
            estavel = react.nos === ultimoN ? estavel + 1 : 0;
            ultimoN = react.nos;
            if (estavel >= 3) { salvar({ id: r.id, rendaBiro: '' }); log.push('rendaBiro: sem o nó (memória)'); break; }
          } else if (Date.now() - tMem > 4000) break;   // sem memória confiável: segue para a pesquisa
          await sleep(300);
        }
        // 3) plano B: pesquisa o nó na árvore
        if (dadosAtuais().rendaBiro == null && Date.now() < prazo) log.push('rendaBiro: pesquisa ' + await buscarRenda(CONFIG.BUSCA_SEG));
        // 4) CPF pela árvore, se o cartão não trouxe
        if (dadosAtuais().cpf == null && Date.now() < prazo) await rodar('fluxo', CONFIG.CAMINHO_SEG);
        snapshot(r.id, 'fim (' + (log.join(' | ') || 'lido da memória') + ')', null);
        GM_setValue('fim', r.id);
        return;
      }
      // modo "reprovadas": se o motivo não depende da árvore (renda, idade...), a mensagem do MobFacil basta
      if (modoAtual === 'reprovadas') {
        let rp = dadosAtuais().reprov;
        for (let i = 0; i < 8 && rp === ''; i++) {   // cartão carregou sem mensagem: dá um tempo para ela aparecer
          await sleep(500);
          lerEGravar();
          rp = dadosAtuais().reprov;
        }
        if (rp != null) {   // lida a mensagem (com todos os motivos), não precisa da árvore
          snapshot(r.id, rp === '' ? 'fim (SEM mensagem de reprovação do MobFacil)' : 'fim (reprovação lida da mensagem, sem árvore)', null);
          GM_setValue('fim', r.id);
          return;
        }
      }

      // modo "aprovadas": só precisa do CPF, não faz o resto da coleta
      if (modoAtual === 'aprovadas') {
        if (!completo(dadosAtuais())) await rodar('fluxo', CONFIG.CAMINHO_SEG);
        snapshot(r.id, 'fim (' + (log.join(' | ') || 'lido da memória') + ')', null);
        GM_setValue('fim', r.id);
        return;
      }

      // auditoria: dá um instante para o cartão do resultado (motivo) carregar antes de concluir pela memória
      if (completo(dadosAtuais()) === false && campos().includes('reprov') && dadosAtuais().reprov == null) {
        for (let i = 0; i < 6 && dadosAtuais().reprov == null; i++) { await sleep(300); lerEGravar(); }
      }

      // Se um caminho do SPC (Biros > SPCBrasil > result...) travou, os outros caminhos do SPC travam no mesmo nó:
      // pula direto para a pesquisa (plano B), que abre os ancestrais sozinha, em vez de gastar o tempo da proposta.
      let spcTravou = false;
      const marcaSPC = rr => { if (rr && rr.res === 'travou' && rr.passo >= FLUXO.length) spcTravou = true; return rr; };

      // 1) restritivos (qtd e valor)
      let d = dadosAtuais();
      if (!completo(d) && (d.qtd == null || d.val == null)) await rodar('risco', CONFIG.CAMINHO_SEG);

      // 2) consultas
      d = dadosAtuais();
      let rrCons = null;
      if (!completo(d) && modoAtual !== 'reprovadas' && d.consultas == null && Date.now() < prazo) rrCons = marcaSPC(await rodar('consultas', CONFIG.CAMINHO_SEG));

      // 3) score (scoreCadastroPositivo, depois de ler as consultas)
      d = dadosAtuais();
      if (!completo(d) && d.score == null && !spcTravou && Date.now() < prazo) marcaSPC(await rodar('score', CONFIG.SCORE_SEG));

      // 0 consultas SÓ se o caminho chegou em "resultado" aberto, com filhos,
      // o nó consultaRealizada não existe, e os outros dados já foram lidos.
      const x0 = dadosAtuais();
      if (rrCons && x0.consultas == null && rrCons.res === 'ausente' && rrCons.passo === IDX_CONSULTA &&
          rrCons.paiAberto && rrCons.nFilhos > 0 && x0.qtd != null && x0.val != null && x0.score != null) {
        salvar({ id: r.id, consultas: '0' });
      }

      // 4) reserva: restritivos pelo SPC (pendenciaFinanceira)
      d = dadosAtuais();
      if (!completo(d) && (d.qtd == null || d.val == null) && !spcTravou && Date.now() < prazo) marcaSPC(await rodar('pendencia', CONFIG.CAMINHO_SEG));

      // 4b) consultas de novo: depois do passo anterior o caminho do SPC já está aberto
      d = dadosAtuais();
      if (!completo(d) && modoAtual !== 'reprovadas' && d.consultas == null && !spcTravou && Date.now() < prazo) marcaSPC(await rodar('consultas', CONFIG.CAMINHO_SEG));

      // plano B: pesquisa o que ainda falta (a pesquisa abre os ancestrais sozinha) e refaz o caminho
      const busca = [
        ['calcularisco',          'risco',     x => x.qtd == null || x.val == null],
        ['consultaRealizada',     'consultas', x => modoAtual !== 'reprovadas' && x.consultas == null],
        ['scoreCadastroPositivo', 'score',     x => x.score == null],
        ['pendenciafinanceira',   'pendencia', x => x.qtd == null || x.val == null],
      ];
      let buscaOk = null;
      for (const [termo, caminho, precisa] of busca) {
        if (Date.now() >= prazo) break;
        const x = dadosAtuais();
        if (completo(x)) break;
        if (!precisa(x)) continue;
        await aguardarMovimento();
        buscaOk = pesquisar(termo);
        await sleep(CONFIG.PAUSA_BUSCA);
        await rodar(caminho, caminho === 'score' ? CONFIG.SCORE_SEG : CONFIG.BUSCA_SEG);
      }

      snapshot(r.id, 'fim (' + (log.join(' | ') || 'lido sem abrir caminhos') + ')', buscaOk);
      GM_setValue('fim', r.id);
    }, CONFIG.POLL_MOTOR);
  }

  /* ================= JANELA PRINCIPAL (paymobi) ================= */
  function iniciarPainel() {
    // "batida": enquanto uma coleta roda, esta aba avisa que está viva.
    // Assim, abrir/recarregar outra aba do paymobi não derruba a coleta em andamento.
    const outraAbaRodando = () =>
      GM_getValue('rodando', false) && Date.now() - GM_getValue('batida', 0) < CONFIG.BATIDA * 1000;
    if (!outraAbaRodando()) GM_setValue('rodando', false);

    let executando = false;
    let resetando = false;
    let relogio = null;
    let ctlAtual = null;   // AbortController do fetch em andamento (para a pausa ser imediata)
    let atual = null;      // proposta sendo coletada agora
    let etapaAtual = '';   // etapa da proposta em andamento (aparece no status)
    // Mantém a aba "ativa" para o navegador (áudio inaudível + Web Lock): evita que ele deixe a coleta lenta
    // quando você está em outra aba/janela. Só liga durante a coleta; precisa começar num clique (Iniciar/Continuar).
    let audioCtx = null, osc = null, soltarLock = null, lockPedido = false;
    const manterAtiva = () => {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (!osc) {
          osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          g.gain.value = 0.0005;          // inaudível
          osc.frequency.value = 30;
          osc.connect(g); g.connect(audioCtx.destination);
          osc.start();
        }
      } catch (_) {}
      try {
        if (navigator.locks && !lockPedido) {
          lockPedido = true;
          navigator.locks.request('mf-coleta', () => new Promise(r => { soltarLock = r; })).catch(() => {});
        }
      } catch (_) {}
    };
    const soltarAtiva = () => {
      try { if (osc) { osc.stop(); osc.disconnect(); } } catch (_) {}
      osc = null;
      try { if (soltarLock) soltarLock(); } catch (_) {}
      soltarLock = null; lockPedido = false;
    };
    const iniciarBatida = () => {
      GM_setValue('batida', Date.now());
      manterAtiva();
      relogio = setInterval(() => { GM_setValue('batida', Date.now()); atualizarUI(); }, 1000);   // também atualiza o status ao vivo
    };
    const pararBatida = () => { clearInterval(relogio); relogio = null; soltarAtiva(); };

    const falhas = {};
    const fila = () => GM_getValue('fila', []);
    const feitas = () => GM_getValue('feitas', []);
    const ignoradas = () => GM_getValue('ignoradas', {});          // { id: 'teste' | 'cancelada' }
    const verificadas = () => GM_getValue('verificadas', []);      // conferidas na tabela da tela
    const pendentes = () => { const f = new Set(feitas()); return fila().filter(id => !f.has(id)); };

    /* ---------- interface ---------- */
    const painel = document.createElement('div');
    painel.id = 'mf-p';
    painel.innerHTML = `
      <style>
        #mf-p{position:fixed;bottom:60px;left:10px;z-index:2147483647;width:340px;max-width:calc(100vw - 8px);background:#fff;color:#1f2937;
          border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 28px #0005;font:14px/1.4 system-ui,Segoe UI,Arial,sans-serif;overflow:visible}
        #mf-p *{box-sizing:border-box;font-family:inherit}
        #mf-p .mf-top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;color:#fff;font-size:15px;
          cursor:move;user-select:none;touch-action:none;border-radius:11px 11px 0 0}
        #mf-p .mf-top small{opacity:.6;margin-left:6px;font-size:12px;font-weight:400}
        #mf-p.mf-min .mf-top{border-radius:11px}
        #mf-p.mf-arrastando{opacity:.93;box-shadow:0 14px 40px #0007}
        /* redimensionar: alças fora da borda (direita, baixo) e puxador no canto; nada fica sobre campos ou a barra de rolagem */
        #mf-p .mf-rz{position:absolute;z-index:4;touch-action:none}
        #mf-p .mf-rz-d{top:14px;bottom:14px;right:-8px;width:8px;cursor:ew-resize}
        #mf-p .mf-rz-b{left:14px;right:14px;bottom:-8px;height:8px;cursor:ns-resize}
        #mf-p .mf-rz-c{right:-8px;bottom:-8px;width:22px;height:22px;cursor:nwse-resize;outline:none;border-radius:0 0 12px 0}
        #mf-p .mf-rz-c::after{content:'';position:absolute;right:10px;bottom:10px;width:10px;height:10px;opacity:.55;
          background:linear-gradient(135deg,transparent 0 45%,#94a3b8 45% 55%,transparent 55% 70%,#94a3b8 70% 80%,transparent 80%)}
        #mf-p .mf-rz-c:hover::after,#mf-p .mf-rz-c:focus-visible::after,#mf-p.mf-redimensionando .mf-rz-c::after{opacity:1}
        #mf-p .mf-rz-c:focus-visible{box-shadow:inset 0 0 0 2px #93c5fd}
        #mf-p.mf-min .mf-rz,#mf-p.mf-min #mf-tam{display:none}
        #mf-p.mf-tam-livre{box-sizing:border-box}   /* tamanho escolhido = medida na tela (borda incluída); o original não muda */
        #mf-p.mf-redimensionando{box-shadow:0 14px 40px #0007;user-select:none}
        #mf-p.mf-redimensionando *{user-select:none}
        #mf-p #mf-tam{margin-left:auto;font-size:15px;padding:2px 8px}
        #mf-p .mf-abas{display:flex;flex-wrap:wrap;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
        #mf-p .mf-abas{position:relative;flex-wrap:nowrap}
        #mf-p .mf-abas button{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;background:transparent;color:#64748b;border-radius:0;padding:9px 2px;font-size:12px;border-bottom:2px solid transparent;white-space:nowrap}
        #mf-p .mf-abas .mf-badge{min-width:15px;height:15px;line-height:15px;font-size:10px;padding:0 4px}
        #mf-p .mf-abas button.ativa{background:#fff;color:#1e293b;border-bottom-color:#2563eb}
        #mf-p .mf-sec{padding:10px 14px;border-bottom:1px solid #e2e8f0}
        #mf-p .mf-tit{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px}
        #mf-p #mf-st{font-size:15px;font-weight:600;margin-bottom:6px}
        #mf-p .mf-barra{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden}
        #mf-p #mf-prog{height:100%;width:0;background:#16a34a;transition:width .3s}
        #mf-p .mf-linha{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        #mf-p .mf-info{font-size:12px;color:#64748b}
        #mf-p textarea{width:100%;height:80px;resize:vertical;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:13px;color:#1f2937;background:#fff}
        #mf-p select,#mf-p input[type=text]{width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;color:#1f2937}
        #mf-p .mf-grade{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        #mf-p .mf-cheia{grid-column:1/-1}
        #mf-p button{cursor:pointer;border:0;border-radius:8px;padding:10px 8px;font-size:14px;font-weight:600;color:#fff;background:#475569;line-height:1.2}
        #mf-p button:hover:not(:disabled){filter:brightness(1.1)}
        #mf-p button:disabled{opacity:.35;cursor:not-allowed}
        #mf-p .verde{background:#16a34a}
        #mf-p .laranja{background:#ea580c}
        #mf-p .azul{background:#2563eb}
        #mf-p .vermelho{background:#dc2626}
        #mf-p .cinza{background:#e2e8f0;color:#1e293b}
        #mf-p .mf-mini{background:transparent;color:#fff;padding:2px 10px;font-size:18px;cursor:pointer}
        #mf-p .mf-opc{display:flex;gap:8px;align-items:flex-start;margin:8px 0;font-size:13px;color:#1f2937;cursor:pointer}
        #mf-p .mf-opc input{margin-top:3px;flex:none}
        #mf-p .mf-opc small{display:block;color:#64748b;font-size:12px;margin-top:1px}
        #mf-p #mf-versao{cursor:default;user-select:none}
        #mf-p .mf-grupo{padding:4px 14px;border-bottom:1px solid #e2e8f0}
        /* navegação (as duas aparências): Atendimento · Histórico · Agenda · Relatórios · Mais ▾ */
        #mf-p .mf-abas button[data-aba=ccb],#mf-p .mf-abas button[data-aba=cac],#mf-p .mf-abas button[data-aba=cta],
        #mf-p .mf-abas button[data-aba=lem],#mf-p .mf-abas button[data-aba=tim],#mf-p .mf-abas button[data-aba=cfg]{display:none}
        #mf-p .mf-ui-menu{position:absolute;right:4px;top:100%;z-index:5;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 20px #0003;padding:4px;min-width:170px;display:none}
        #mf-p .mf-ui-menu.aberto{display:block}
        #mf-p .mf-ui-menu button{display:block;width:100%;text-align:left;background:transparent;color:#1e293b;padding:8px 10px;border-radius:6px;font-size:13px;border:0}
        #mf-p .mf-ui-menu button:hover,#mf-p .mf-ui-menu button.ativa{background:#e2e8f0;filter:none}
        #mf-p .mf-ui-seg{display:flex;gap:4px;margin:8px 14px 0}
        #mf-p .mf-ui-seg button{flex:1;padding:6px 4px;font-size:12.5px;background:#e2e8f0;color:#1e293b}
        #mf-p .mf-ui-seg button.ativa{background:#1e293b;color:#fff}
        /* atendimento, histórico e equipe */
        #mf-p .mf-pl-lin{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
        #mf-p .mf-pl-lin input,#mf-p .mf-pl-lin select{width:100%;padding:4px 6px !important;border:1px solid #cbd5e1;border-radius:6px;font-size:12px !important;min-height:30px !important}
        #mf-p .mf-pl-lin .mf-pl-acao{grid-column:1/-1;font-weight:600}
        #mf-p .mf-hs-item{border:1px solid #e2e8f0;border-left:4px solid #64748b;border-radius:6px;padding:6px 8px;margin-bottom:6px;cursor:pointer;font-size:12px}
        #mf-p .mf-hs-item.realizado{border-left-color:#16a34a}
        #mf-p .mf-hs-item.pendente{border-left-color:#ea580c}
        #mf-p .mf-hs-item.nao_concluido{border-left-color:#94a3b8}
        #mf-p .mf-hs-item.anulado{opacity:.6;border-left-color:#dc2626}
        #mf-p .mf-hs-det{white-space:pre-wrap;color:#475569;margin-top:6px;cursor:auto}
        #mf-p .mf-hs-det textarea,#mf-p .mf-hs-det input,#mf-p .mf-hs-det select{width:100%;margin-top:3px;font-size:12px;padding:5px;border:1px solid #cbd5e1;border-radius:6px}
        #mf-p .mf-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:0 6px;border-radius:9px;background:#e0e7ff;color:#3730a3;margin-left:4px;vertical-align:1px}
        #mf-p .mf-copia{border:0;background:transparent !important;color:#2563eb !important;padding:0 4px !important;font-size:12px !important;cursor:pointer}

        /* ===== Nova UI: só vale com data-ui="nova". A UI Antiga usa as regras acima, sem nenhuma alteração ===== */
        #mf-p .mf-ui-nova{display:none}
        #mf-p[data-ui=nova] .mf-ui-nova{display:revert}
        #mf-p[data-ui=nova]{width:min(360px,calc(100vw - 16px));border-color:#e2e8f0;border-radius:14px;box-shadow:0 10px 30px #0f172a33;font-size:13.5px}
        #mf-p[data-ui=nova] .mf-top{padding:8px 10px 8px 14px;gap:6px}
        #mf-p[data-ui=nova] .mf-top>div:first-child{display:flex;align-items:center;min-width:0;overflow:hidden;white-space:nowrap;font-size:14px}
        #mf-p[data-ui=nova] .mf-top>div:first-child>b{overflow:hidden;text-overflow:ellipsis;min-width:0}
        #mf-p[data-ui=nova] .mf-top>div:first-child>small,#mf-p[data-ui=nova] .mf-top>div:first-child>span{flex:none}
        #mf-p[data-ui=nova] .mf-top .mf-ui-acoes{display:flex;align-items:center;gap:2px;margin-left:auto}
        /* expandido, o contador do título fica só na aba Agenda; minimizado, volta a aparecer no título */
        #mf-p[data-ui=nova]:not(.mf-min) #mf-lb-badge-topo{display:none !important}
        #mf-p[data-ui=nova].mf-min .mf-ui-chip{display:none}
        #mf-p[data-ui=nova] .mf-ui-chip{border:0;background:#334155;color:#e2e8f0;border-radius:99px;padding:3px 9px;font-size:11.5px;font-weight:600;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mf-p[data-ui=nova] .mf-ui-chip:empty{display:none}
        #mf-p[data-ui=nova] .mf-ui-icone{border:0;background:transparent;color:#cbd5e1;padding:3px 7px;font-size:15px;border-radius:6px}
        #mf-p[data-ui=nova] .mf-ui-icone:hover{background:#334155;color:#fff;filter:none}
        /* abas: uma linha; as secundárias ficam no menu "Mais" */
        #mf-p[data-ui=nova] .mf-abas{flex-wrap:nowrap;position:relative;background:#fff;padding:0 3px;border-bottom:1px solid #e2e8f0}
        #mf-p[data-ui=nova] .mf-abas button{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;padding:10px 2px 8px;font-size:12.5px;font-weight:600;color:#64748b;border:0;border-radius:0;border-bottom:2px solid transparent;background:transparent;white-space:nowrap}
        #mf-p[data-ui=nova] .mf-abas button:hover:not(:disabled){background:#f8fafc}
        #mf-p[data-ui=nova] .mf-abas button.ativa{color:#1d4ed8;border-bottom-color:#2563eb;background:transparent}
        #mf-p[data-ui=nova] .mf-abas button[data-aba=ccb],#mf-p[data-ui=nova] .mf-abas button[data-aba=cac],#mf-p[data-ui=nova] .mf-abas button[data-aba=cta],
        #mf-p[data-ui=nova] .mf-abas button[data-aba=lem],#mf-p[data-ui=nova] .mf-abas button[data-aba=tim],#mf-p[data-ui=nova] .mf-abas button[data-aba=cfg]{display:none}
        #mf-p[data-ui=nova] .mf-ui-menu{position:absolute;right:6px;top:100%;z-index:5;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 24px #0f172a26;padding:4px;min-width:170px;display:none}
        #mf-p[data-ui=nova] .mf-ui-menu.aberto{display:block}
        #mf-p[data-ui=nova] .mf-ui-menu button{display:block;width:100%;text-align:left;background:transparent;color:#1e293b;font-weight:500;padding:8px 10px;border-radius:6px;border:0}
        #mf-p[data-ui=nova] .mf-ui-menu button:hover,#mf-p[data-ui=nova] .mf-ui-menu button.ativa{background:#eff6ff;color:#1d4ed8;filter:none}
        #mf-p[data-ui=nova] .mf-ui-seg{display:flex;background:#f1f5f9;border-radius:8px;padding:3px;margin:10px 14px 0;gap:3px}
        #mf-p[data-ui=nova] .mf-ui-seg button{flex:1;background:transparent;color:#475569;padding:6px;font-size:12.5px;border-radius:6px;border:0}
        #mf-p[data-ui=nova] .mf-ui-seg button.ativa{background:#fff;color:#1e293b;box-shadow:0 1px 3px #0f172a22}
        /* espaçamento e títulos */
        #mf-p[data-ui=nova] .mf-sec{padding:12px 14px;border-bottom:1px solid #f1f5f9}
        #mf-p[data-ui=nova] .mf-tit{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:#475569;margin-bottom:8px}
        #mf-p[data-ui=nova] .mf-grupo{padding:6px 14px;border-bottom:1px solid #f1f5f9}
        #mf-p[data-ui=nova] .mf-grupo>summary{font-size:12px;letter-spacing:0;text-transform:none;font-weight:600;color:#475569}
        #mf-p[data-ui=nova] #mf-st{font-size:14px}
        #mf-p[data-ui=nova] .mf-grade{gap:6px}
        #mf-p[data-ui=nova] textarea,#mf-p[data-ui=nova] select,#mf-p[data-ui=nova] input[type=text],#mf-p[data-ui=nova] input[type=date],#mf-p[data-ui=nova] input[type=time],
        #mf-p[data-ui=nova] input[type=password],#mf-p[data-ui=nova] .mf-lb-rot input,#mf-p[data-ui=nova] .mf-lb-rot select{border:1px solid #d6dde6;border-radius:8px;padding:7px 9px;font-size:13px;min-height:34px}
        #mf-p[data-ui=nova] textarea:focus,#mf-p[data-ui=nova] select:focus,#mf-p[data-ui=nova] input:focus{outline:2px solid #bfdbfe;border-color:#2563eb}
        #mf-p[data-ui=nova] .mf-lb-rot{gap:3px;font-size:12px}
        /* botões: neutro com contorno por padrão; principal (azul cheio), cópia (verde cheio), perigo (vermelho só no texto) */
        #mf-p[data-ui=nova] button{background:#fff;color:#1e293b;border:1px solid #d6dde6;font-weight:600;font-size:13px;padding:8px 10px}
        #mf-p[data-ui=nova] button:hover:not(:disabled){filter:none;background:#f8fafc}
        #mf-p[data-ui=nova] button:disabled{opacity:1;background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0}
        #mf-p[data-ui=nova] .vermelho{color:#dc2626;border-color:#fecaca}
        #mf-p[data-ui=nova] .laranja{color:#c2410c;border-color:#fed7aa}
        #mf-p[data-ui=nova] #mf-ini,#mf-p[data-ui=nova] #mf-ng-gerar,#mf-p[data-ui=nova] #mf-cac-buscar,#mf-p[data-ui=nova] #mf-tm-criar,#mf-p[data-ui=nova] #mf-lb-salvar,
        #mf-p[data-ui=nova] #mf-ccb-baixar,#mf-p[data-ui=nova] #mf-conta-trocar,#mf-p[data-ui=nova] #mf-ng-frases,#mf-p[data-ui=nova] #mf-at-registrar,#mf-p[data-ui=nova] #mf-at-plano-gerar,#mf-p[data-ui=nova] #mf-eq-salvar,#mf-p[data-ui=nova] #mf-bs-buscar,#mf-p[data-ui=nova] #mf-pd-gerar{background:#2563eb;color:#fff;border-color:#2563eb}
        #mf-p[data-ui=nova] #mf-cop,#mf-p[data-ui=nova] #mf-ng-copiar,#mf-p[data-ui=nova] #mf-at-copiar,#mf-p[data-ui=nova] #mf-at-msg-copiar,#mf-p[data-ui=nova] #mf-dval,#mf-p[data-ui=nova] #mf-dlin,#mf-p[data-ui=nova] #mf-pd-copiar{background:#16a34a;color:#fff;border-color:#16a34a}
        #mf-p[data-ui=nova] #mf-ini:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-gerar:hover,#mf-p[data-ui=nova] #mf-cac-buscar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-tm-criar:hover,
        #mf-p[data-ui=nova] #mf-lb-salvar:hover,#mf-p[data-ui=nova] #mf-ccb-baixar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-conta-trocar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-frases:hover,#mf-p[data-ui=nova] #mf-bs-buscar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-pd-gerar:hover:not(:disabled){background:#1d4ed8}
        #mf-p[data-ui=nova] #mf-cop:hover,#mf-p[data-ui=nova] #mf-ng-copiar:hover,#mf-p[data-ui=nova] #mf-at-copiar:hover,#mf-p[data-ui=nova] #mf-at-msg-copiar:hover,#mf-p[data-ui=nova] #mf-dval:hover,#mf-p[data-ui=nova] #mf-dlin:hover,#mf-p[data-ui=nova] #mf-pd-copiar:hover{background:#15803d}
        #mf-p[data-ui=nova] .mf-mini{border:0;background:transparent;color:#fff;padding:2px 8px;font-size:18px}
        #mf-p[data-ui=nova] #mf-tam{margin-left:0;font-size:15px}
        #mf-p[data-ui=nova] .mf-top{border-radius:13px 13px 0 0}
        #mf-p[data-ui=nova].mf-min .mf-top{border-radius:13px}
        #mf-p[data-ui=nova] .mf-corpo{border-radius:0 0 13px 13px}
        #mf-p[data-ui=nova] .mf-rz-c{border-radius:0 0 14px 0}
        #mf-p[data-ui=nova] .mf-mini:hover{background:#334155}
        #mf-p[data-ui=nova] .mf-lb-filtros button{background:#f1f5f9;border:0;color:#475569;font-weight:600;padding:6px 2px}
        #mf-p[data-ui=nova] .mf-lb-filtros button.ativa{background:#1e293b;color:#fff}
        #mf-p[data-ui=nova] .mf-lb-acoes button,#mf-p[data-ui=nova] .mf-conta button{padding:4px 8px;font-size:11.5px}
        #mf-p[data-ui=nova] .mf-lb-item{border-color:#e8edf3;border-radius:8px}
        /* "Copiar ▾": as outras cópias da Auditoria num menu */
        #mf-p[data-ui=nova] .mf-ui-copias{position:relative}
        #mf-p[data-ui=nova] .mf-ui-copias:not(.aberto) .mf-ui-extra{display:none}
        #mf-p[data-ui=nova] .mf-ui-copias.aberto .mf-ui-extra{background:#fff;color:#1e293b;border:1px solid #d6dde6}
        /* ajuda: textos fixos viram ⓘ (o texto aparece ao passar o mouse) */
        #mf-p .mf-ui-i{display:none}
        #mf-p[data-ui=nova] .mf-ui-ajuda{display:none}
        #mf-p[data-ui=nova] .mf-ui-i{display:inline-block;cursor:help;color:#94a3b8;font-size:13px;margin-left:4px;font-weight:400}
        #mf-p[data-ui=nova] #mf-msg{margin:10px 14px 12px;background:#f8fafc;border:1px solid #e2e8f0}
        #mf-p[data-ui=nova] .mf-badge{background:#ef4444}
        #mf-p .mf-ui-prev{display:none}
        #mf-p .mf-ng-bloco{margin-bottom:6px}
        #mf-p .mf-ng-saldo{font-size:14px;font-weight:700;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 9px}
        #mf-p .mf-ng-saldo:empty{display:none}
        #mf-p .mf-ng-saldo.erro{color:#b91c1c;background:#fef2f2;border-color:#fecaca}
        #mf-p .mf-ng-bloco>summary{cursor:pointer;font-size:12px;font-weight:600;color:#475569;padding:4px 0}
        #mf-p .mf-ui-prev.ativo{display:flex;gap:6px;align-items:center;padding:8px 14px;background:#fef9c3;font-size:12.5px;border-bottom:1px solid #fde68a}
        #mf-p .mf-bs{padding:8px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
        #mf-p .mf-bs .mf-tit{margin-bottom:6px}
        #mf-p .mf-bs-cand{display:block;width:100%;text-align:left;font-size:12px !important;padding:6px 8px !important;margin-top:4px}
        #mf-p .mf-bs-cab{font-weight:700;font-size:13px;margin:6px 0 2px}
        #mf-p .mf-bs-mini{padding:4px 9px !important;font-size:12px !important}
        #mf-p #mf-bs-res{max-height:260px;overflow:auto}
        #mf-p .mf-cac-lin{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px solid #f1f5f9}
        #mf-p .mf-cac-lin span{color:#64748b}
        #mf-p .mf-cac-lin b{text-align:right}
        #mf-p .mf-badge{display:inline-block;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;vertical-align:middle}
        #mf-p .mf-lb-rot{display:flex;flex-direction:column;gap:2px;font-size:12px;color:#475569}
        #mf-p .mf-lb-rot input,#mf-p .mf-lb-rot select,#mf-p .mf-lb-rot textarea{width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;color:#1f2937;background:#fff}
        #mf-p .mf-lb-rot input[type=checkbox]{width:auto}
        #mf-p input[type=date]{padding:5px}
        #mf-p .mf-erro{border-color:#dc2626 !important;background:#fef2f2 !important}
        #mf-p .mf-lb-filtros{display:flex;gap:4px}
        #mf-p .mf-lb-filtros button{flex:1;padding:6px 2px;font-size:12px;background:#e2e8f0;color:#1e293b}
        #mf-p .mf-lb-filtros button.ativa{background:#1e293b;color:#fff}
        #mf-p .mf-lb-item{border:1px solid #e2e8f0;border-left:4px solid #94a3b8;border-radius:6px;padding:6px 8px;margin-bottom:6px;cursor:pointer;font-size:12px}
        #mf-p .mf-lb-item.hoje{border-left-color:#ea580c;background:#fff7ed}
        #mf-p .mf-lb-item.atrasado{border-left-color:#dc2626;background:#fef2f2}
        #mf-p .mf-lb-item.encerrado{opacity:.6}
        #mf-p .mf-lb-l1{font-weight:600;color:#1e293b}
        #mf-p .mf-lb-det{white-space:pre-wrap;color:#475569;margin-top:4px}
        #mf-p .mf-lb-acoes button{padding:4px 7px;font-size:11px;margin:4px 4px 0 0}
        #mf-p .mf-grupo>summary{cursor:pointer;padding:6px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;list-style:none}
        #mf-p .mf-grupo>summary::-webkit-details-marker{display:none}
        #mf-p .mf-grupo>summary::before,#mf-p .mf-dobra::before{content:'▸ ';color:#94a3b8}
        #mf-p .mf-grupo[open]>summary::before,#mf-p .mf-dobra.aberta::before{content:'▾ '}
        #mf-p .mf-grupo[open]{padding-bottom:10px}
        #mf-p .mf-dobra{cursor:pointer;user-select:none}
        #mf-p .mf-fmt{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center;margin:6px 0;font-size:13px}
        #mf-p .mf-fmt select{padding:6px}
        #mf-p .mf-conta{display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
        #mf-p .mf-conta span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mf-p .mf-conta button{padding:4px 8px;font-size:12px}
        #mf-p #mf-msg{margin:10px 14px 14px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:13px;max-height:130px;overflow:auto;white-space:pre-wrap}
        #mf-p #mf-msg:empty{display:none}
        #mf-p .mf-corpo{max-height:calc(100vh - 140px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;border-radius:0 0 11px 11px;container-type:inline-size}
        /* painel mais largo: o conteúdo se reorganiza (só visual; os módulos não mudam). Abaixo de 560 px fica como sempre foi */
        @container (min-width: 560px) {
          #mf-p .mf-grade{grid-template-columns:repeat(3,minmax(0,1fr))}
          #mf-p [data-pag="his"] .mf-grade{grid-template-columns:repeat(4,minmax(0,1fr))}
          #mf-p #mf-bs-res{display:grid;grid-template-columns:1fr 1fr;column-gap:18px;max-height:420px;align-content:start}
          #mf-p #mf-bs-res > :not(.mf-cac-lin){grid-column:1/-1}
          #mf-p #mf-cac-tabela{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}
          #mf-p #mf-cac-tabela > :not(.mf-cac-lin){grid-column:1/-1}
        }
        @container (min-width: 680px) {
          #mf-p .mf-grade{grid-template-columns:repeat(4,minmax(0,1fr))}
          #mf-p #mf-lb-lista,#mf-p #mf-hs-lista,#mf-p #mf-tm-lista{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start}
          #mf-p #mf-lb-lista > *,#mf-p #mf-hs-lista > *,#mf-p #mf-tm-lista > *{margin:0}
          #mf-p #mf-lb-lista > .mf-info,#mf-p #mf-hs-lista > .mf-info,#mf-p #mf-tm-lista > .mf-info,
          #mf-p .mf-lb-item:has(.mf-lb-det),#mf-p .mf-hs-item:has(.mf-hs-det){grid-column:1/-1}
          #mf-p .mf-pl-lin{grid-template-columns:1.7fr 1fr 1.25fr 1.6fr 1fr}
          #mf-p .mf-pl-lin .mf-pl-acao{grid-column:auto}
          #mf-p #mf-ng-texto,#mf-p #mf-at-msg-texto{height:240px !important}
          #mf-p #mf-ng-f-pedido,#mf-p #mf-ng-f-acordo{height:44px !important}
        }
        #mf-p .mf-corpo::-webkit-scrollbar{width:8px}
        #mf-p .mf-corpo::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}
        /* ===== Modo escuro: só vale com data-tema="escuro". O modo claro (padrão) usa as regras acima, sem nenhuma alteração ===== */
        #mf-p[data-tema=escuro]{color-scheme:dark;background:#0f172a !important;color:#e2e8f0 !important;border-color:#334155 !important;box-shadow:0 8px 28px #000a}
        #mf-p[data-tema=escuro] #mf-tema{font-size:15px;padding:2px 8px}
        #mf-p[data-tema=escuro] .mf-top{border-bottom:1px solid #334155}
        #mf-p[data-tema=escuro] .mf-abas{background:#111c33 !important;border-bottom-color:#334155 !important}
        #mf-p[data-tema=escuro] .mf-abas button{color:#94a3b8 !important}
        #mf-p[data-tema=escuro] .mf-abas button:hover:not(:disabled){background:#1e293b !important}
        #mf-p[data-tema=escuro] .mf-abas button.ativa{color:#93c5fd !important;background:#0f172a !important;border-bottom-color:#3b82f6 !important}
        #mf-p[data-tema=escuro] .mf-sec,#mf-p[data-tema=escuro] .mf-grupo{border-bottom-color:#263349 !important}
        #mf-p[data-tema=escuro] .mf-tit,#mf-p[data-tema=escuro] .mf-info,#mf-p[data-tema=escuro] .mf-grupo>summary,#mf-p[data-tema=escuro] .mf-ng-bloco>summary,#mf-p[data-tema=escuro] .mf-opc small,#mf-p[data-tema=escuro] .mf-lb-rot,#mf-p[data-tema=escuro] .mf-cac-lin span,#mf-p[data-tema=escuro] .mf-hs-det,#mf-p[data-tema=escuro] .mf-lb-det{color:#94a3b8 !important}
        #mf-p[data-tema=escuro] .mf-opc,#mf-p[data-tema=escuro] .mf-fmt,#mf-p[data-tema=escuro] .mf-conta,#mf-p[data-tema=escuro] .mf-lb-l1{color:#e2e8f0 !important}
        #mf-p[data-tema=escuro] .mf-barra{background:#334155}
        #mf-p[data-tema=escuro] textarea,#mf-p[data-tema=escuro] select,#mf-p[data-tema=escuro] input:not([type]),#mf-p[data-tema=escuro] input[type=text],#mf-p[data-tema=escuro] input[type=date],#mf-p[data-tema=escuro] input[type=time],#mf-p[data-tema=escuro] input[type=password],#mf-p[data-tema=escuro] input[type=number],#mf-p[data-tema=escuro] input[type=search],#mf-p[data-tema=escuro] input[type=email],#mf-p[data-tema=escuro] input[type=tel]{background:#1e293b !important;color:#e2e8f0 !important;border-color:#475569 !important}
        #mf-p[data-tema=escuro] textarea:focus,#mf-p[data-tema=escuro] select:focus,#mf-p[data-tema=escuro] input:focus{outline-color:#1d4ed8 !important;border-color:#60a5fa !important}
        #mf-p[data-tema=escuro] ::placeholder{color:#64748b !important}
        #mf-p[data-tema=escuro] option{background:#1e293b;color:#e2e8f0}
        #mf-p[data-tema=escuro] input.mf-erro,#mf-p[data-tema=escuro] textarea.mf-erro,#mf-p[data-tema=escuro] select.mf-erro{background:#450a0a !important;border-color:#ef4444 !important}
        #mf-p[data-tema=escuro] .mf-ng-saldo{color:#4ade80;background:#052e16;border-color:#166534}
        #mf-p[data-tema=escuro] .mf-ng-saldo.erro{color:#fca5a5;background:#450a0a;border-color:#7f1d1d}
        /* botões: antiga (cinza claro vira cinza escuro) e nova (neutros escuros; os principais azul/verde mantêm as cores) */
        #mf-p[data-tema=escuro][data-ui=antiga] .cinza{background:#334155 !important;color:#e2e8f0 !important}
        #mf-p[data-tema=escuro][data-ui=nova] button{background:#1e293b;color:#e2e8f0;border-color:#475569}
        #mf-p[data-tema=escuro][data-ui=nova] button:hover:not(:disabled){background:#273449;filter:none}
        #mf-p[data-tema=escuro][data-ui=nova] button:disabled{background:#1e293b;color:#64748b;border-color:#334155}
        #mf-p[data-tema=escuro] .mf-mini{background:transparent !important;border:0 !important;color:#fff !important}
        #mf-p[data-tema=escuro] .mf-mini:hover{background:#334155 !important}
        #mf-p[data-tema=escuro] .mf-ui-icone{background:transparent !important;border:0 !important;color:#cbd5e1 !important}
        #mf-p[data-tema=escuro] .mf-ui-icone:hover{background:#334155 !important;color:#fff !important}
        #mf-p[data-tema=escuro] .mf-ui-chip{background:#334155 !important;border:0 !important;color:#e2e8f0 !important}
        #mf-p[data-tema=escuro] .vermelho{color:#f87171 !important;border-color:#7f1d1d !important}
        #mf-p[data-tema=escuro][data-ui=antiga] .vermelho{color:#fff !important}
        #mf-p[data-tema=escuro] .laranja{color:#fb923c !important;border-color:#7c2d12 !important}
        #mf-p[data-tema=escuro][data-ui=antiga] .laranja{color:#fff !important}
        #mf-p[data-tema=escuro] .mf-copia{color:#60a5fa !important}
        #mf-p[data-tema=escuro] .mf-ui-menu{background:#1e293b !important;border-color:#334155 !important;box-shadow:0 10px 24px #000a}
        #mf-p[data-tema=escuro] .mf-ui-menu button{color:#e2e8f0 !important}
        #mf-p[data-tema=escuro] .mf-ui-menu button:hover,#mf-p[data-tema=escuro] .mf-ui-menu button.ativa{background:#334155 !important;color:#93c5fd !important}
        #mf-p[data-tema=escuro][data-ui=nova] .mf-ui-seg{background:#1e293b !important}
        #mf-p[data-tema=escuro][data-ui=nova] .mf-ui-seg button{background:transparent !important;color:#94a3b8 !important;border:0 !important}
        #mf-p[data-tema=escuro][data-ui=antiga] .mf-ui-seg button,#mf-p[data-tema=escuro] .mf-lb-filtros button{background:#334155 !important;color:#cbd5e1 !important;border:0 !important}
        #mf-p[data-tema=escuro] .mf-ui-seg button.ativa,#mf-p[data-tema=escuro] .mf-lb-filtros button.ativa{background:#2563eb !important;color:#fff !important}
        #mf-p[data-tema=escuro] .mf-ui-copias.aberto .mf-ui-extra{background:#1e293b !important;color:#e2e8f0 !important;border-color:#475569 !important}
        /* blocos, listas e cartões */
        #mf-p[data-tema=escuro] .mf-bs{background:#111c33 !important;border-bottom-color:#263349 !important}
        #mf-p[data-tema=escuro] .mf-ui-prev.ativo{background:#422006;color:#fde68a;border-bottom-color:#854d0e}
        #mf-p[data-tema=escuro] #mf-tm-resumo{background:#422006 !important;color:#fed7aa !important}
        #mf-p[data-tema=escuro] #mf-msg{background:#1e293b !important;border:1px solid #334155 !important;color:#e2e8f0 !important}
        #mf-p[data-tema=escuro] .mf-lb-item,#mf-p[data-tema=escuro] .mf-hs-item{border-top-color:#334155 !important;border-right-color:#334155 !important;border-bottom-color:#334155 !important}
        #mf-p[data-tema=escuro] .mf-lb-item.hoje{background:#3a2a12 !important}
        #mf-p[data-tema=escuro] .mf-lb-item.atrasado{background:#3b1519 !important}
        #mf-p[data-tema=escuro] .mf-lb-item div[style*="color"]{color:#94a3b8 !important}
        #mf-p[data-tema=escuro] .mf-tag{background:#312e81;color:#c7d2fe}
        #mf-p[data-tema=escuro] .mf-pl-lin,#mf-p[data-tema=escuro] .mf-cac-lin,#mf-p[data-tema=escuro] .mf-conta{border-bottom-color:#263349 !important}
        #mf-p[data-tema=escuro] .mf-corpo::-webkit-scrollbar-thumb{background:#475569}
        /* avisos fora do painel (lembretes, timer e equipe) */
        html[data-mf-tema=escuro] #mf-lb-popup,html[data-mf-tema=escuro] #mf-tm-alarme{background:#1e293b !important;color:#e2e8f0 !important}
        html[data-mf-tema=escuro] #mf-lb-popup .it,html[data-mf-tema=escuro] #mf-tm-alarme .it{border-top-color:#334155 !important}
        html[data-mf-tema=escuro] #mf-lb-popup [style*="color"]{color:#94a3b8 !important}
        html[data-mf-tema=escuro] #mf-tm-alarme h4{color:#fca5a5 !important}
        html[data-mf-tema=escuro] #mf-lb-popup button:not(.pri),html[data-mf-tema=escuro] #mf-tm-alarme button:not(.pri),html[data-mf-tema=escuro] #mf-eq-avisos button:not(.pri){background:#334155 !important;color:#e2e8f0 !important}
        html[data-mf-tema=escuro] #mf-lb-popup input{background:#0f172a !important;color:#e2e8f0 !important;border:1px solid #475569}
        html[data-mf-tema=escuro] #mf-eq-avisos .av{background:#1e293b !important;color:#e2e8f0 !important;border-top-color:#1e3a8a !important;border-right-color:#1e3a8a !important;border-bottom-color:#1e3a8a !important}
        html[data-mf-tema=escuro] #mf-eq-avisos p{color:#cbd5e1 !important}

        /* ===== Modo escuro também no ER (segue o mesmo botão 🌙 e a mesma escolha; só cores, nenhum dado ou função) ===== */
        html[data-mf-tema=escuro]{color-scheme:dark}
        html[data-mf-tema=escuro] .main-header .navbar,html[data-mf-tema=escuro] .main-header .logo,html[data-mf-tema=escuro] .main-header .navbar-static-top{background:#1b3a2d !important;border-color:#1b3a2d !important}
        html[data-mf-tema=escuro] .main-sidebar,html[data-mf-tema=escuro] .left-side,html[data-mf-tema=escuro] .sidebar,html[data-mf-tema=escuro] .main-sidebar .sidebar{background:#111c33 !important}
        html[data-mf-tema=escuro] .sidebar a,html[data-mf-tema=escuro] .sidebar-menu>li>a,html[data-mf-tema=escuro] .sidebar .user-panel .info,html[data-mf-tema=escuro] .sidebar .user-panel .info a,html[data-mf-tema=escuro] .sidebar-menu .treeview-menu>li>a{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .sidebar-menu .treeview-menu>li>a{color:#94a3b8 !important}
        html[data-mf-tema=escuro] .sidebar-menu>li:hover>a,html[data-mf-tema=escuro] .sidebar-menu>li.active>a,html[data-mf-tema=escuro] .sidebar-menu .treeview-menu>li>a:hover,html[data-mf-tema=escuro] .sidebar-menu .treeview-menu>li.active>a{background:#1e293b !important;color:#fff !important}
        html[data-mf-tema=escuro] .sidebar-menu .treeview-menu,html[data-mf-tema=escuro] .sidebar-menu>li.active>.treeview-menu{background:#0b1220 !important}
        html[data-mf-tema=escuro] .sidebar .user-panel{background:#1e293b !important}
        html[data-mf-tema=escuro] body,html[data-mf-tema=escuro] .wrapper,html[data-mf-tema=escuro] .content-wrapper,html[data-mf-tema=escuro] .right-side,html[data-mf-tema=escuro] .main-footer,html[data-mf-tema=escuro] .content,html[data-mf-tema=escuro] .content-header{background:#0f172a !important;color:#e2e8f0 !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .content-wrapper h1,html[data-mf-tema=escuro] .content-wrapper h2,html[data-mf-tema=escuro] .content-wrapper h3,html[data-mf-tema=escuro] .content-wrapper h4,html[data-mf-tema=escuro] .content-wrapper h5,html[data-mf-tema=escuro] .content-wrapper h6,html[data-mf-tema=escuro] .content-wrapper label,html[data-mf-tema=escuro] .content-wrapper .control-label,html[data-mf-tema=escuro] .content-header>h1,html[data-mf-tema=escuro] .content-header>.breadcrumb>li,html[data-mf-tema=escuro] .content-header>.breadcrumb>li>a{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .content-wrapper .text-muted,html[data-mf-tema=escuro] .content-wrapper small,html[data-mf-tema=escuro] .content-wrapper .help-block{color:#94a3b8 !important}
        html[data-mf-tema=escuro] .content-wrapper a:not(.btn):not([class*=label]){color:#60a5fa}
        html[data-mf-tema=escuro] .box,html[data-mf-tema=escuro] .box-header,html[data-mf-tema=escuro] .box-body,html[data-mf-tema=escuro] .box-footer,html[data-mf-tema=escuro] .nav-tabs-custom,html[data-mf-tema=escuro] .nav-tabs-custom>.tab-content,html[data-mf-tema=escuro] .nav-tabs-custom>.nav-tabs,html[data-mf-tema=escuro] .panel,html[data-mf-tema=escuro] .panel-body,html[data-mf-tema=escuro] .panel-heading,html[data-mf-tema=escuro] .panel-footer,html[data-mf-tema=escuro] .well,html[data-mf-tema=escuro] .info-box,html[data-mf-tema=escuro] .modal-content,html[data-mf-tema=escuro] .modal-header:not([class*=bg-]),html[data-mf-tema=escuro] .modal-footer,html[data-mf-tema=escuro] .modal-body,html[data-mf-tema=escuro] .dropdown-menu,html[data-mf-tema=escuro] .popover,html[data-mf-tema=escuro] .list-group-item,html[data-mf-tema=escuro] .callout.callout-default,html[data-mf-tema=escuro] .jumbotron{background:#1e293b !important;color:#e2e8f0 !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .nav-tabs>li>a,html[data-mf-tema=escuro] .nav-tabs-custom>.nav-tabs>li>a,html[data-mf-tema=escuro] .nav-pills>li>a{color:#cbd5e1 !important}
        html[data-mf-tema=escuro] .nav-tabs>li.active>a,html[data-mf-tema=escuro] .nav-tabs>li.active>a:hover,html[data-mf-tema=escuro] .nav-tabs-custom>.nav-tabs>li.active>a{background:#1e293b !important;color:#93c5fd !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .dropdown-menu>li>a{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .dropdown-menu>li>a:hover,html[data-mf-tema=escuro] .dropdown-menu>.active>a{background:#334155 !important}
        html[data-mf-tema=escuro] .close,html[data-mf-tema=escuro] .modal-header .close{color:#e2e8f0 !important;text-shadow:none !important;opacity:.8}
        html[data-mf-tema=escuro] .table,html[data-mf-tema=escuro] .table>thead>tr>th,html[data-mf-tema=escuro] .table>tbody>tr>td,html[data-mf-tema=escuro] .table>tbody>tr>th,html[data-mf-tema=escuro] .table>tfoot>tr>td,html[data-mf-tema=escuro] .table>tfoot>tr>th,html[data-mf-tema=escuro] .table-bordered,html[data-mf-tema=escuro] .table-bordered>thead>tr>th,html[data-mf-tema=escuro] .table-bordered>tbody>tr>td{border-color:#334155 !important}
        html[data-mf-tema=escuro] .table>thead>tr>th,html[data-mf-tema=escuro] .table>thead>tr>td{background:#1e293b !important}
        html[data-mf-tema=escuro] .table>tbody>tr,html[data-mf-tema=escuro] .table>tbody>tr>td,html[data-mf-tema=escuro] .table>tbody>tr>th{background-color:#0f172a}
        html[data-mf-tema=escuro] .table-striped>tbody>tr:nth-of-type(odd),html[data-mf-tema=escuro] .table-striped>tbody>tr:nth-of-type(odd)>td{background-color:#162033 !important}
        html[data-mf-tema=escuro] .table-hover>tbody>tr:hover,html[data-mf-tema=escuro] .table-hover>tbody>tr:hover>td{background-color:#273449 !important}
        html[data-mf-tema=escuro] .form-control,html[data-mf-tema=escuro] .input-group-addon,html[data-mf-tema=escuro] .content-wrapper input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]),html[data-mf-tema=escuro] .content-wrapper select,html[data-mf-tema=escuro] .content-wrapper textarea,html[data-mf-tema=escuro] .select2-container--default .select2-selection--single,html[data-mf-tema=escuro] .select2-container--default .select2-selection--multiple,html[data-mf-tema=escuro] .select2-dropdown{background:#1e293b !important;color:#e2e8f0 !important;border-color:#475569 !important}
        html[data-mf-tema=escuro] .select2-container--default .select2-selection--single .select2-selection__rendered,html[data-mf-tema=escuro] .select2-results__option{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .select2-container--default .select2-results__option--highlighted[aria-selected]{background:#2563eb !important;color:#fff !important}
        html[data-mf-tema=escuro] .form-control[disabled],html[data-mf-tema=escuro] .form-control[readonly],html[data-mf-tema=escuro] .content-wrapper input[disabled],html[data-mf-tema=escuro] .content-wrapper input[readonly]{background:#162033 !important;color:#94a3b8 !important}
        html[data-mf-tema=escuro] .btn-default{background:#334155 !important;color:#e2e8f0 !important;border-color:#475569 !important}
        html[data-mf-tema=escuro] .pagination>li>a,html[data-mf-tema=escuro] .pagination>li>span,html[data-mf-tema=escuro] .dataTables_wrapper .dataTables_paginate .paginate_button{background:#1e293b !important;color:#cbd5e1 !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .pagination>.active>a,html[data-mf-tema=escuro] .pagination>.active>span{background:#2563eb !important;color:#fff !important;border-color:#2563eb !important}
        html[data-mf-tema=escuro] .dataTables_wrapper,html[data-mf-tema=escuro] .dataTables_wrapper .dataTables_info,html[data-mf-tema=escuro] .dataTables_wrapper .dataTables_length,html[data-mf-tema=escuro] .dataTables_wrapper .dataTables_filter{color:#cbd5e1 !important}
        html[data-mf-tema=escuro] hr{border-color:#334155}

        /* ajustes a partir do HTML real do ER (Mesa de Crédito e menu lateral) */
        html[data-mf-tema=escuro] .sidebar-menu>li.header{background:#111c33 !important}
        html[data-mf-tema=escuro] .user-panel>.info,html[data-mf-tema=escuro] .user-panel>.info>p,html[data-mf-tema=escuro] .user-panel>.info>a{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .control-sidebar-light,html[data-mf-tema=escuro] .control-sidebar-bg{background:#111c33 !important;color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .progress{background:#334155 !important}
        html[data-mf-tema=escuro] .btn-white,html[data-mf-tema=escuro] .bootstrap-select>.dropdown-toggle{background:#1e293b !important;color:#e2e8f0 !important;border-color:#475569 !important}
        html[data-mf-tema=escuro] .bootstrap-select .dropdown-menu li a,html[data-mf-tema=escuro] .bootstrap-select .dropdown-menu li a .text{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .bootstrap-select .dropdown-menu li a:hover,html[data-mf-tema=escuro] .bootstrap-select .dropdown-menu li.selected a,html[data-mf-tema=escuro] .bootstrap-select .dropdown-menu li.active a{background:#334155 !important}
        html[data-mf-tema=escuro] .bootstrap-select .dropdown-header,html[data-mf-tema=escuro] .dropdown-header,html[data-mf-tema=escuro] .text-gray{color:#94a3b8 !important}
        html[data-mf-tema=escuro] .bs-searchbox input,html[data-mf-tema=escuro] .bs-actionsbox .btn{background:#0f172a !important;color:#e2e8f0 !important;border-color:#475569 !important}
        html[data-mf-tema=escuro] #divNotificacoesDetalhe{background:#1e293b !important;color:#e2e8f0 !important;border-left-color:#334155 !important}
        html[data-mf-tema=escuro] .modal-header:not([class*=bg-]) .close{color:#e2e8f0 !important}
        /* tela de login (login-box) */
        html[data-mf-tema=escuro] .login-page,html[data-mf-tema=escuro] .register-page{background:#0f172a !important}
        html[data-mf-tema=escuro] .login-box-body,html[data-mf-tema=escuro] .register-box-body{background:#1e293b !important;color:#e2e8f0 !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .login-box-msg,html[data-mf-tema=escuro] .register-box-msg,html[data-mf-tema=escuro] .login-logo a,html[data-mf-tema=escuro] .login-box-body p,html[data-mf-tema=escuro] .login-box-body b{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .login-box a:not(.btn){color:#60a5fa !important}
        html[data-mf-tema=escuro] .login-box .form-control-feedback,html[data-mf-tema=escuro] .login-box .glyphicon{color:#94a3b8 !important}
        html[data-mf-tema=escuro] .login-logo img{background:#fff;border-radius:12px;padding:10px}
        /* ===== Modo escuro: complemento (textos brancos sobre fundo claro e textos de baixo contraste) ===== */
        /* 1) Fundos claros fixos do ER: painel "Itens de análise" e painel de detalhe do item (tinham fundo #f9faff e texto claro) */
        html[data-mf-tema=escuro] #divMesaAnaliseOrientacoes,html[data-mf-tema=escuro] #divMesaAnaliseItem{background-color:#111c33 !important;border-left-color:#334155 !important;color:#e2e8f0 !important}
        html[data-mf-tema=escuro] #divMesaAnaliseOrientacoes .btn{color:#0f172a !important}
        html[data-mf-tema=escuro] .btn .text-black,html[data-mf-tema=escuro] button .text-black{color:#0f172a !important}
        html[data-mf-tema=escuro] .text-black{color:#e2e8f0 !important}
        /* 2) Cabeçalhos e blocos com classes de fundo claro (modais "Aviso", "Consulta Linha Digitável", "Detalhes do Refinanciamento", "Documentos"...) */
        html[data-mf-tema=escuro] .bg-gray-light,html[data-mf-tema=escuro] .bg-white{background-color:#1e293b !important;color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .bg-gray{background-color:#334155 !important;color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .bg-warning{background-color:#78350f !important;color:#fef3c7 !important}
        html[data-mf-tema=escuro] .bg-danger{background-color:#7f1d1d !important;color:#fee2e2 !important}
        html[data-mf-tema=escuro] .bg-success{background-color:#14532d !important;color:#dcfce7 !important}
        html[data-mf-tema=escuro] .bg-info{background-color:#0c4a6e !important;color:#e0f2fe !important}
        html[data-mf-tema=escuro] .bg-warning .modal-title,html[data-mf-tema=escuro] .bg-warning h4{color:#fef3c7 !important}
        html[data-mf-tema=escuro] .bg-danger .modal-title,html[data-mf-tema=escuro] .bg-danger h4{color:#fee2e2 !important}
        html[data-mf-tema=escuro] .bg-success .modal-title,html[data-mf-tema=escuro] .bg-success h4{color:#dcfce7 !important}
        html[data-mf-tema=escuro] .bg-info .modal-title,html[data-mf-tema=escuro] .bg-info h4{color:#e0f2fe !important}
        html[data-mf-tema=escuro] .modal-header.bg-gray-light .modal-title,html[data-mf-tema=escuro] .modal-header.bg-gray .modal-title,html[data-mf-tema=escuro] .modal-header.bg-gray-light h4{color:#e2e8f0 !important}
        /* 3) Rede de segurança: qualquer elemento do ER com fundo claro escrito direto no style (fora do painel do script) */
        html[data-mf-tema=escuro] [style*="background-color:#FFFFFF"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="background-color:#fff"]:not(#mf-p):not(#mf-p *),
        html[data-mf-tema=escuro] [style*="background-color: rgb(255, 255, 255)"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="background: rgb(255, 255, 255)"]:not(#mf-p):not(#mf-p *),
        html[data-mf-tema=escuro] [style*="background:#fff"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="background: #fff"]:not(#mf-p):not(#mf-p *),
        html[data-mf-tema=escuro] [style*="#f4f4f4"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="#f8f8f8"]:not(#mf-p):not(#mf-p *),
        html[data-mf-tema=escuro] [style*="#f5f5f5"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="#f7f7f7"]:not(#mf-p):not(#mf-p *),
        html[data-mf-tema=escuro] [style*="#f9faff"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="rgb(249, 250, 255)"]:not(#mf-p):not(#mf-p *),
        html[data-mf-tema=escuro] [style*="background: #eee"]:not(#mf-p):not(#mf-p *),html[data-mf-tema=escuro] [style*="background:#eee"]:not(#mf-p):not(#mf-p *){background-color:#111c33 !important;color:#e2e8f0 !important;border-color:#334155 !important}
        /* 4) Cores de texto do AdminLTE/Bootstrap que ficavam escuras demais sobre o fundo escuro */
        html[data-mf-tema=escuro] .text-primary,html[data-mf-tema=escuro] .text-blue,html[data-mf-tema=escuro] .text-light-blue{color:#7cb7f0 !important}
        html[data-mf-tema=escuro] .text-red,html[data-mf-tema=escuro] .text-danger,html[data-mf-tema=escuro] .text-maroon{color:#f87171 !important}
        html[data-mf-tema=escuro] .text-green,html[data-mf-tema=escuro] .text-success,html[data-mf-tema=escuro] .text-olive{color:#4ade80 !important}
        html[data-mf-tema=escuro] .text-yellow,html[data-mf-tema=escuro] .text-warning,html[data-mf-tema=escuro] .text-orange{color:#fbbf24 !important}
        html[data-mf-tema=escuro] .text-aqua,html[data-mf-tema=escuro] .text-info,html[data-mf-tema=escuro] .text-teal{color:#38bdf8 !important}
        html[data-mf-tema=escuro] .text-navy,html[data-mf-tema=escuro] .text-purple{color:#a5b4fc !important}
        html[data-mf-tema=escuro] .text-muted,html[data-mf-tema=escuro] .text-gray{color:#94a3b8 !important}
        /* 5) Links, placeholders e campos dentro dos modais que ficam fora do .content-wrapper */
        html[data-mf-tema=escuro] .modal-body a:not(.btn):not([class*=label]),html[data-mf-tema=escuro] .modal-content a:not(.btn):not([class*=label]):not([class*=navbar]){color:#60a5fa}
        html[data-mf-tema=escuro] .modal-body label,html[data-mf-tema=escuro] .modal-body .control-label,html[data-mf-tema=escuro] .modal-body .help-block{color:#cbd5e1 !important}
        html[data-mf-tema=escuro] ::placeholder{color:#8b9bb2 !important;opacity:1}
        html[data-mf-tema=escuro] .callout,html[data-mf-tema=escuro] .alert{color:#e2e8f0}
        html[data-mf-tema=escuro] .info-box-text,html[data-mf-tema=escuro] .info-box-number,html[data-mf-tema=escuro] .progress-description{color:#e2e8f0 !important}
        /* 6) Painel do script: cores de texto escritas direto em style (geradas pelos módulos) */
        #mf-p[data-tema=escuro] [style*="color:#475569"],#mf-p[data-tema=escuro] [style*="color:#64748b"],#mf-p[data-tema=escuro] [style*="color:#6b7280"],#mf-p[data-tema=escuro] [style*="color: #475569"],#mf-p[data-tema=escuro] [style*="color: #64748b"]{color:#94a3b8 !important}
        #mf-p[data-tema=escuro] [style*="color:#1f2937"],#mf-p[data-tema=escuro] [style*="color:#1e293b"],#mf-p[data-tema=escuro] [style*="color:#0f172a"],#mf-p[data-tema=escuro] [style*="color:#334155"],#mf-p[data-tema=escuro] [style*="color:#111"],#mf-p[data-tema=escuro] [style*="color:#000"]{color:#e2e8f0 !important}
        #mf-p[data-tema=escuro] .mf-bs-cab,#mf-p[data-tema=escuro] .mf-cac-lin b,#mf-p[data-tema=escuro] .mf-hs-item,#mf-p[data-tema=escuro] .mf-lb-item{color:#e2e8f0}

        /* ===== Nova UI v13 (só visual): tokens de cor, cartões, ícones e estados. Vale só com data-ui="nova";
           a UI Antiga continua exatamente igual. Nenhum ID, classe usada pelo código, texto ou ação foi alterado. ===== */
        #mf-p[data-ui=nova]{
          --mf-bg:#f4f6fa;--mf-sup:#fff;--mf-sup2:#f8fafc;--mf-borda:#e4e9f0;--mf-borda2:#d3dbe6;--mf-borda-hover:#b8c4d4;
          --mf-txt:#0f172a;--mf-txt2:#334155;--mf-txt3:#64748b;--mf-apagado:#94a3b8;
          --mf-pri:#2563eb;--mf-pri-hover:#1d4ed8;--mf-pri-suave:#eff6ff;--mf-pri-borda:#bfdbfe;--mf-anel:rgba(37,99,235,.2);
          --mf-ok:#16a34a;--mf-ok-hover:#15803d;--mf-perigo:#dc2626;--mf-perigo-suave:#fef2f2;--mf-perigo-borda:#fecaca;
          --mf-alerta:#c2410c;--mf-alerta-suave:#fff7ed;--mf-alerta-borda:#fed7aa;--mf-seg:#eaeff5;
          --mf-sombra:0 1px 2px rgba(15,23,42,.05);--mf-sombra2:0 4px 14px rgba(15,23,42,.08);
          background:var(--mf-sup);color:var(--mf-txt);border:1px solid #d9e0ea;border-radius:14px;
          box-shadow:0 24px 48px -16px rgba(15,23,42,.35),0 6px 16px rgba(15,23,42,.08);
          font:13.5px/1.45 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
        #mf-p[data-ui=nova][data-tema=escuro]{
          --mf-bg:#0b1220;--mf-sup:#111c33;--mf-sup2:#16223b;--mf-borda:#263349;--mf-borda2:#334155;--mf-borda-hover:#475569;
          --mf-txt:#e2e8f0;--mf-txt2:#cbd5e1;--mf-txt3:#94a3b8;--mf-apagado:#64748b;
          --mf-pri:#3b82f6;--mf-pri-hover:#2563eb;--mf-pri-suave:#172554;--mf-pri-borda:#1e3a8a;--mf-anel:rgba(59,130,246,.35);
          --mf-perigo-suave:#2a1215;--mf-perigo-borda:#7f1d1d;--mf-alerta-suave:#2a1a0c;--mf-alerta-borda:#7c2d12;--mf-seg:#0f1a2e;
          --mf-sombra:0 1px 2px rgba(0,0,0,.3);--mf-sombra2:0 6px 18px rgba(0,0,0,.4)}
        /* ícones (traço único, mesma espessura): desenhados com máscara na cor do texto */
        #mf-p[data-ui=nova] .mf-abas>button::before,#mf-p[data-ui=nova] .mf-ui-menu button::before,#mf-p[data-ui=nova] .mf-mini::before,#mf-p[data-ui=nova] .mf-ui-icone::before,
        #mf-p[data-ui=nova] .mf-grupo>summary::after,#mf-p[data-ui=nova] .mf-dobra::after,#mf-p[data-ui=nova] #mf-msg::before,#mf-p[data-ui=nova] .mf-ui-i::before{
          content:'';display:inline-block;flex:none;width:16px;height:16px;background:currentColor;
          -webkit-mask:var(--mf-ico) center/contain no-repeat;mask:var(--mf-ico) center/contain no-repeat}
        #mf-p[data-ui=nova] .mf-abas>button[data-aba=neg]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-abas>button[data-aba=his]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/%3E%3Cpath d='M3 3v5h5M12 7v5l4 2'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-abas>button[data-ui-aba=agenda],#mf-p[data-ui=nova] .mf-abas>button[data-aba=lem],#mf-p[data-ui=nova] .mf-abas>button[data-aba=tim]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M16 2v4M8 2v4M3 10h18'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-abas>button[data-aba=rel]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3v18h18M18 17V9M13 17V5M8 17v-3'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-abas>button[data-ui-aba=mais]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='7' height='7' rx='1.5'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1.5'/%3E%3Crect x='14' y='14' width='7' height='7' rx='1.5'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1.5'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-ui-menu button[data-vai=cac],#mf-p[data-ui=nova] .mf-abas>button[data-aba=cac]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-ui-menu button[data-vai=ccb],#mf-p[data-ui=nova] .mf-abas>button[data-aba=ccb]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z'/%3E%3Cpath d='M14 2v5h6M12 18v-6M9 15l3 3 3-3'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-ui-menu button[data-vai=cta],#mf-p[data-ui=nova] .mf-abas>button[data-aba=cta]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-ui-menu button[data-vai=cfg],#mf-p[data-ui=nova] .mf-abas>button[data-aba=cfg],#mf-p[data-ui=nova] .mf-ui-icone{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] #mf-tam{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] #mf-tam[title^="Voltar"]{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] #mf-tema{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova][data-tema=escuro] #mf-tema{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='4'/%3E%3Cpath d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] #mf-min{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12h14'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova].mf-min #mf-min{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='4' width='16' height='16' rx='2.5'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] .mf-grupo>summary,#mf-p[data-ui=nova] .mf-dobra{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] #mf-msg,#mf-p[data-ui=nova] .mf-ui-i{--mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9.5'/%3E%3Cpath d='M12 16v-4.5M12 8h.01'/%3E%3C/svg%3E")}

        /* barra do título: marca, nome, versão e ações (ícones do mesmo tamanho) */
        #mf-p[data-ui=nova] .mf-top{background:linear-gradient(180deg,#1e293b,#0f172a);padding:8px 8px 8px 12px;min-height:48px;gap:8px;border-radius:13px 13px 0 0}
        #mf-p[data-ui=nova].mf-min .mf-top{border-radius:13px}
        /* título em duas linhas: nome em cima; versão e contadores embaixo (o nome ganha espaço) */
        #mf-p[data-ui=nova] .mf-top>div:first-child{position:relative;flex-wrap:wrap;align-items:center;align-content:center;row-gap:2px;padding-left:34px;min-height:32px;flex:1 1 auto}
        #mf-p[data-ui=nova] .mf-top>div:first-child>b{flex:1 0 100%;line-height:1.2}
        #mf-p[data-ui=nova] .mf-top>div:first-child>#mf-lb-badge-topo,#mf-p[data-ui=nova] .mf-top>div:first-child>#mf-tm-topo{margin-left:5px !important;font-size:10.5px !important;line-height:16px}
        #mf-p[data-ui=nova] .mf-top>div:first-child::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:25px;height:25px;border-radius:7px;box-shadow:0 0 0 1px rgba(255,255,255,.12) inset;
          background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8.5 17.5V6.5h4.2a3.4 3.4 0 0 1 0 6.8H8.5' fill='none' stroke='white' stroke-width='2.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/18px no-repeat,linear-gradient(135deg,#3b82f6,#0ea5a4)}
        #mf-p[data-ui=nova] .mf-top>div:first-child>b{font-size:13.5px;font-weight:600;letter-spacing:-.005em;color:#f8fafc}
        #mf-p[data-ui=nova] .mf-top small#mf-versao{opacity:1;margin-left:0;font-size:10.5px;font-weight:600;color:#94a3b8;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);border-radius:99px;padding:1px 7px;line-height:16px}
        #mf-p[data-ui=nova] .mf-top .mf-ui-acoes{gap:2px}
        #mf-p[data-ui=nova] .mf-mini,#mf-p[data-ui=nova] .mf-ui-icone{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;font-size:0;line-height:0;
          border:0;border-radius:8px;background:transparent;color:#94a3b8;transition:background-color .15s,color .15s}
        #mf-p[data-ui=nova] .mf-mini:hover,#mf-p[data-ui=nova] .mf-ui-icone:hover{background:rgba(255,255,255,.09);color:#f8fafc}
        #mf-p[data-ui=nova] .mf-mini:focus-visible,#mf-p[data-ui=nova] .mf-ui-icone:focus-visible,#mf-p[data-ui=nova] .mf-ui-chip:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}
        #mf-p[data-ui=nova] .mf-ui-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#e2e8f0;padding:3px 9px 3px 8px;margin-right:2px;
          font-size:11.5px;font-weight:600;max-width:110px;border-radius:99px;transition:background-color .15s}
        #mf-p[data-ui=nova] .mf-ui-chip::before{content:'';flex:none;width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.25)}
        #mf-p[data-ui=nova] .mf-ui-chip:hover{background:rgba(255,255,255,.13)}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-top{background:linear-gradient(180deg,#111c33,#0b1220)}

        /* corpo: fundo levemente cinza; as seções viram cartões brancos (separação clara entre funcionalidades) */
        #mf-p[data-ui=nova] .mf-corpo{background:var(--mf-bg);border-radius:0 0 13px 13px}
        #mf-p[data-ui=nova] [data-pag]{padding-bottom:2px}
        #mf-p[data-ui=nova] .mf-sec,#mf-p[data-ui=nova] .mf-grupo{background:var(--mf-sup);border:1px solid var(--mf-borda);border-radius:12px;box-shadow:var(--mf-sombra);margin:10px 12px 0;padding:12px 14px}
        #mf-p[data-ui=nova] .mf-grupo{padding:0 14px}
        #mf-p[data-ui=nova] .mf-grupo[open]{padding-bottom:14px}
        #mf-p[data-ui=nova] .mf-grupo>summary{display:flex;align-items:center;gap:6px;padding:12px 0;margin:0;font-size:13px;font-weight:600;color:var(--mf-txt);letter-spacing:0;text-transform:none;border-radius:8px}
        #mf-p[data-ui=nova] .mf-grupo>summary::before{content:none}
        #mf-p[data-ui=nova] .mf-grupo>summary::after{margin-left:auto;width:16px;height:16px;color:var(--mf-apagado);transform:rotate(-90deg);transition:transform .18s,color .15s}
        #mf-p[data-ui=nova] .mf-grupo[open]>summary{margin-bottom:4px}
        #mf-p[data-ui=nova] .mf-grupo[open]>summary::after{transform:none}
        #mf-p[data-ui=nova] .mf-grupo>summary:hover::after{color:var(--mf-txt2)}
        #mf-p[data-ui=nova] .mf-grupo>summary:focus-visible{outline:2px solid var(--mf-pri);outline-offset:2px}
        #mf-p[data-ui=nova] .mf-tit{display:block;font-size:13px;font-weight:600;color:var(--mf-txt);letter-spacing:0;text-transform:none;margin-bottom:10px}
        #mf-p[data-ui=nova] .mf-tit span:not(.mf-ui-i):not(.mf-badge){font-weight:500;color:var(--mf-txt3)}
        #mf-p[data-ui=nova] .mf-dobra{display:flex;align-items:center;gap:6px}
        #mf-p[data-ui=nova] .mf-dobra::before{content:none}
        #mf-p[data-ui=nova] .mf-dobra::after{margin-left:auto;color:var(--mf-apagado);transform:rotate(-90deg);transition:transform .18s}
        #mf-p[data-ui=nova] .mf-dobra.aberta::after{transform:none}
        #mf-p[data-ui=nova] .mf-info{font-size:12px;color:var(--mf-txt3);line-height:1.5}
        #mf-p[data-ui=nova] .mf-ui-i{display:inline-flex;align-items:center;vertical-align:-2px;margin-left:5px;font-size:0;color:var(--mf-apagado);cursor:help;transition:color .15s}
        #mf-p[data-ui=nova] .mf-ui-i::before{width:14px;height:14px}
        #mf-p[data-ui=nova] .mf-ui-i:hover{color:var(--mf-pri)}

        /* busca de cliente: faixa fixa acima das abas, campo com lupa */
        #mf-p[data-ui=nova] .mf-bs{background:var(--mf-sup);border-bottom:1px solid var(--mf-borda);padding:10px 12px}
        #mf-p[data-ui=nova] .mf-bs .mf-tit{margin-bottom:8px;cursor:pointer;color:var(--mf-txt2);font-size:12.5px}
        #mf-p[data-ui=nova] #mf-bs-termo{padding-left:32px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:10px center;background-size:15px}
        #mf-p[data-ui=nova] #mf-bs-tipo:not(:empty){min-width:0 !important;padding:2px 7px;border-radius:99px;background:var(--mf-pri-suave);color:var(--mf-pri);font-weight:600;font-size:11px}
        #mf-p[data-ui=nova] #mf-bs-res{border-top:1px solid var(--mf-borda);margin-top:8px;padding-top:6px}
        #mf-p[data-ui=nova] .mf-bs-cab{font-size:13px;font-weight:600;color:var(--mf-txt);margin:8px 0 4px}

        /* abas principais: ícone + rótulo, fixas no topo ao rolar */
        #mf-p[data-ui=nova] .mf-abas{position:sticky;top:0;z-index:6;display:flex;gap:2px;background:var(--mf-sup);padding:4px 6px 0;border-bottom:1px solid var(--mf-borda);box-shadow:0 1px 0 rgba(15,23,42,.02)}
        #mf-p[data-ui=nova] .mf-abas>button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1 1 auto;min-width:0;
          padding:7px 2px 8px;margin:0;font-size:11.5px;font-weight:600;line-height:1.15;color:var(--mf-txt3);background:transparent;border:0;border-bottom:2px solid transparent;border-radius:8px 8px 0 0;box-shadow:none;transition:color .15s,background-color .15s,border-color .15s}
        #mf-p[data-ui=nova] .mf-abas>button::before{width:17px;height:17px;opacity:.9}
        #mf-p[data-ui=nova] .mf-abas>button:hover:not(:disabled){color:var(--mf-txt);background:var(--mf-sup2)}
        #mf-p[data-ui=nova] .mf-abas>button.ativa{color:var(--mf-pri);border-bottom-color:var(--mf-pri);background:transparent}
        #mf-p[data-ui=nova] .mf-abas>button.ativa::before{opacity:1}
        #mf-p[data-ui=nova] .mf-abas>button:focus-visible{outline:2px solid var(--mf-pri);outline-offset:-2px}
        #mf-p[data-ui=nova] .mf-abas>button .mf-badge{position:absolute;top:3px;left:calc(50% + 5px);margin:0}
        /* menu "Mais" */
        #mf-p[data-ui=nova] .mf-ui-menu{right:6px;top:calc(100% + 4px);min-width:200px;padding:5px;background:var(--mf-sup);border:1px solid var(--mf-borda);border-radius:12px;box-shadow:0 16px 36px -8px rgba(15,23,42,.28),0 2px 6px rgba(15,23,42,.06)}
        #mf-p[data-ui=nova] .mf-ui-menu button{display:flex;align-items:center;gap:10px;padding:9px 10px;font-size:13px;font-weight:500;color:var(--mf-txt2);border:0;border-radius:8px;background:transparent;box-shadow:none}
        #mf-p[data-ui=nova] .mf-ui-menu button::before{color:var(--mf-apagado)}
        #mf-p[data-ui=nova] .mf-ui-menu button:hover{background:var(--mf-sup2);color:var(--mf-txt)}
        #mf-p[data-ui=nova] .mf-ui-menu button.ativa{background:var(--mf-pri-suave);color:var(--mf-pri)}
        #mf-p[data-ui=nova] .mf-ui-menu button.ativa::before,#mf-p[data-ui=nova] .mf-ui-menu button:hover::before{color:currentColor}

        /* controles segmentados (sub-abas e filtros): mesmo visual em todos os módulos */
        #mf-p[data-ui=nova] .mf-ui-seg,#mf-p[data-ui=nova] .mf-lb-filtros{display:flex;gap:2px;padding:3px;background:var(--mf-seg);border:1px solid var(--mf-borda);border-radius:10px}
        #mf-p[data-ui=nova] .mf-ui-seg{margin:12px 12px 0}
        #mf-p[data-ui=nova] .mf-ui-seg button,#mf-p[data-ui=nova] .mf-lb-filtros button{flex:1;min-width:0;padding:6px 4px;font-size:12.5px;font-weight:600;color:var(--mf-txt3);background:transparent;border:0;border-radius:7px;box-shadow:none;transition:background-color .15s,color .15s,box-shadow .15s}
        #mf-p[data-ui=nova] .mf-ui-seg button:hover:not(.ativa),#mf-p[data-ui=nova] .mf-lb-filtros button:hover:not(.ativa){color:var(--mf-txt);background:transparent}
        #mf-p[data-ui=nova] .mf-ui-seg button.ativa,#mf-p[data-ui=nova] .mf-lb-filtros button.ativa{background:var(--mf-sup);color:var(--mf-txt);box-shadow:0 1px 2px rgba(15,23,42,.1),0 0 0 1px var(--mf-borda)}

        /* campos */
        #mf-p[data-ui=nova] textarea,#mf-p[data-ui=nova] select,#mf-p[data-ui=nova] input[type=text],#mf-p[data-ui=nova] input[type=date],#mf-p[data-ui=nova] input[type=time],#mf-p[data-ui=nova] input[type=password],
        #mf-p[data-ui=nova] .mf-lb-rot input:not([type=checkbox]):not([type=range]),#mf-p[data-ui=nova] .mf-lb-rot select{
          background-color:var(--mf-sup);color:var(--mf-txt);border:1px solid var(--mf-borda2);border-radius:8px;padding:7px 10px;font-size:13px;min-height:36px;line-height:1.4;
          transition:border-color .15s,box-shadow .15s}
        #mf-p[data-ui=nova] textarea{line-height:1.5}
        #mf-p[data-ui=nova] textarea:hover,#mf-p[data-ui=nova] select:hover,#mf-p[data-ui=nova] input[type=text]:hover,#mf-p[data-ui=nova] input[type=date]:hover,#mf-p[data-ui=nova] input[type=time]:hover,#mf-p[data-ui=nova] input[type=password]:hover{border-color:var(--mf-borda-hover)}
        #mf-p[data-ui=nova] textarea:focus,#mf-p[data-ui=nova] select:focus,#mf-p[data-ui=nova] input:focus{outline:none;border-color:var(--mf-pri);box-shadow:0 0 0 3px var(--mf-anel)}
        #mf-p[data-ui=nova] ::placeholder{color:var(--mf-apagado)}
        #mf-p[data-ui=nova] input[type=checkbox],#mf-p[data-ui=nova] input[type=radio],#mf-p[data-ui=nova] input[type=range]{accent-color:var(--mf-pri)}
        #mf-p[data-ui=nova] input[type=checkbox],#mf-p[data-ui=nova] input[type=radio]{width:15px;height:15px}
        #mf-p[data-ui=nova] input[type=range]{width:100%}
        #mf-p[data-ui=nova] input[type=checkbox]:focus,#mf-p[data-ui=nova] input[type=radio]:focus,#mf-p[data-ui=nova] input[type=range]:focus{box-shadow:none}
        #mf-p[data-ui=nova] input[type=checkbox]:focus-visible,#mf-p[data-ui=nova] input[type=radio]:focus-visible{outline:2px solid var(--mf-pri);outline-offset:2px}
        #mf-p[data-ui=nova] .mf-lb-rot{gap:4px;font-size:12px;font-weight:500;color:var(--mf-txt2)}
        #mf-p[data-ui=nova] .mf-erro{border-color:var(--mf-perigo) !important;box-shadow:0 0 0 3px rgba(220,38,38,.12) !important}
        #mf-p[data-ui=nova] .mf-grade{gap:8px}
        #mf-p[data-ui=nova] .mf-opc{gap:10px;margin:2px -8px;padding:8px;border-radius:8px;font-size:13px;color:var(--mf-txt);transition:background-color .15s}
        #mf-p[data-ui=nova] .mf-opc:hover{background:var(--mf-sup2)}
        #mf-p[data-ui=nova] .mf-opc input{margin-top:2px}
        #mf-p[data-ui=nova] .mf-opc b{font-weight:600}
        #mf-p[data-ui=nova] .mf-opc small{color:var(--mf-txt3);font-size:12px;margin-top:2px;line-height:1.45}
        #mf-p[data-ui=nova] .mf-fmt{font-size:12.5px;color:var(--mf-txt2)}

        /* botões: secundário (contorno), principal (azul), cópia/conclusão (verde), alerta e perigo (só no texto) */
        #mf-p[data-ui=nova] button{background:var(--mf-sup);color:var(--mf-txt);border:1px solid var(--mf-borda2);border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;line-height:1.25;
          box-shadow:var(--mf-sombra);transition:background-color .15s,border-color .15s,color .15s,box-shadow .15s,transform .06s}
        #mf-p[data-ui=nova] button:hover:not(:disabled){background:var(--mf-sup2);border-color:var(--mf-borda-hover);filter:none}
        #mf-p[data-ui=nova] button:active:not(:disabled){transform:translateY(1px)}
        #mf-p[data-ui=nova] button:focus-visible{outline:none;box-shadow:0 0 0 3px var(--mf-anel)}
        #mf-p[data-ui=nova] button:disabled{opacity:1;cursor:not-allowed;background:var(--mf-sup2);color:var(--mf-apagado);border-color:var(--mf-borda);box-shadow:none}
        #mf-p[data-ui=nova] #mf-ini,#mf-p[data-ui=nova] #mf-ng-gerar,#mf-p[data-ui=nova] #mf-cac-buscar,#mf-p[data-ui=nova] #mf-tm-criar,#mf-p[data-ui=nova] #mf-lb-salvar,#mf-p[data-ui=nova] #mf-ccb-baixar,
        #mf-p[data-ui=nova] #mf-conta-trocar,#mf-p[data-ui=nova] #mf-ng-frases,#mf-p[data-ui=nova] #mf-at-registrar,#mf-p[data-ui=nova] #mf-at-plano-gerar,#mf-p[data-ui=nova] #mf-eq-salvar,#mf-p[data-ui=nova] #mf-bs-buscar,#mf-p[data-ui=nova] #mf-pd-gerar{
          background:var(--mf-pri);color:#fff;border-color:var(--mf-pri);box-shadow:0 1px 2px rgba(37,99,235,.25),inset 0 1px 0 rgba(255,255,255,.12)}
        #mf-p[data-ui=nova] #mf-cop,#mf-p[data-ui=nova] #mf-ng-copiar,#mf-p[data-ui=nova] #mf-at-copiar,#mf-p[data-ui=nova] #mf-at-msg-copiar,#mf-p[data-ui=nova] #mf-dval,#mf-p[data-ui=nova] #mf-dlin,#mf-p[data-ui=nova] #mf-pd-copiar{
          background:var(--mf-ok);color:#fff;border-color:var(--mf-ok);box-shadow:0 1px 2px rgba(22,163,74,.25),inset 0 1px 0 rgba(255,255,255,.12)}
        #mf-p[data-ui=nova] #mf-ini:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-gerar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-cac-buscar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-tm-criar:hover:not(:disabled),
        #mf-p[data-ui=nova] #mf-lb-salvar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ccb-baixar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-conta-trocar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-frases:hover:not(:disabled),
        #mf-p[data-ui=nova] #mf-at-registrar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-at-plano-gerar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-eq-salvar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-bs-buscar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-pd-gerar:hover:not(:disabled){background:var(--mf-pri-hover);border-color:var(--mf-pri-hover)}
        #mf-p[data-ui=nova] #mf-cop:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-copiar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-at-copiar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-at-msg-copiar:hover:not(:disabled),
        #mf-p[data-ui=nova] #mf-dval:hover:not(:disabled),#mf-p[data-ui=nova] #mf-dlin:hover:not(:disabled),#mf-p[data-ui=nova] #mf-pd-copiar:hover:not(:disabled){background:var(--mf-ok-hover);border-color:var(--mf-ok-hover)}
        #mf-p[data-ui=nova] #mf-ini:disabled,#mf-p[data-ui=nova] #mf-cac-buscar:disabled,#mf-p[data-ui=nova] #mf-ccb-baixar:disabled,#mf-p[data-ui=nova] #mf-conta-trocar:disabled,#mf-p[data-ui=nova] #mf-bs-buscar:disabled,#mf-p[data-ui=nova] #mf-pd-gerar:disabled,
        #mf-p[data-ui=nova] #mf-cop:disabled,#mf-p[data-ui=nova] #mf-dval:disabled,#mf-p[data-ui=nova] #mf-dlin:disabled{background:var(--mf-sup2);color:var(--mf-apagado);border-color:var(--mf-borda);box-shadow:none}
        #mf-p[data-ui=nova] .vermelho{color:var(--mf-perigo);border-color:var(--mf-perigo-borda)}
        #mf-p[data-ui=nova] .vermelho:hover:not(:disabled){background:var(--mf-perigo-suave);border-color:var(--mf-perigo-borda)}
        #mf-p[data-ui=nova] .laranja{color:var(--mf-alerta);border-color:var(--mf-alerta-borda)}
        #mf-p[data-ui=nova] .laranja:hover:not(:disabled){background:var(--mf-alerta-suave);border-color:var(--mf-alerta-borda)}
        #mf-p[data-ui=nova] .mf-bs-mini,#mf-p[data-ui=nova] .mf-lb-acoes button,#mf-p[data-ui=nova] .mf-conta button{padding:4px 10px !important;font-size:12px !important;border-radius:7px}
        #mf-p[data-ui=nova] .mf-copia{box-shadow:none !important;border:0 !important;font-weight:600}
        #mf-p[data-ui=nova] .mf-copia:hover{text-decoration:underline}

        /* status e progresso da coleta */
        #mf-p[data-ui=nova] #mf-st{font-size:15px;font-weight:600;color:var(--mf-txt);margin-bottom:8px}
        #mf-p[data-ui=nova] .mf-barra{height:6px;background:var(--mf-seg);border-radius:99px}
        #mf-p[data-ui=nova] #mf-prog{background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:99px}

        /* listas (lembretes, histórico, timers, contas, CAC) */
        #mf-p[data-ui=nova] .mf-lb-item,#mf-p[data-ui=nova] .mf-hs-item{background:var(--mf-sup);border:1px solid var(--mf-borda);border-left-width:3px;border-radius:10px;padding:9px 11px;margin-bottom:8px;
          font-size:12.5px;transition:border-color .15s,box-shadow .15s}
        #mf-p[data-ui=nova] .mf-lb-item:hover,#mf-p[data-ui=nova] .mf-hs-item:hover{box-shadow:var(--mf-sombra2);border-top-color:var(--mf-borda2);border-right-color:var(--mf-borda2);border-bottom-color:var(--mf-borda2)}
        #mf-p[data-ui=nova] .mf-lb-item.hoje{background:var(--mf-alerta-suave)}
        #mf-p[data-ui=nova] .mf-lb-item.atrasado{background:var(--mf-perigo-suave)}
        #mf-p[data-ui=nova] .mf-lb-l1{font-weight:600;color:var(--mf-txt)}
        #mf-p[data-ui=nova] .mf-lb-det,#mf-p[data-ui=nova] .mf-hs-det{color:var(--mf-txt2);line-height:1.5}
        #mf-p[data-ui=nova] .mf-tag{border-radius:99px;padding:1px 7px;font-size:10.5px;font-weight:600}
        #mf-p[data-ui=nova] .mf-conta{padding:8px 0;border-bottom-color:var(--mf-borda);color:var(--mf-txt)}
        #mf-p[data-ui=nova] .mf-conta:last-child{border-bottom:0}
        #mf-p[data-ui=nova] .mf-cac-lin{padding:6px 0;font-size:12.5px;border-bottom-color:var(--mf-borda)}
        #mf-p[data-ui=nova] .mf-cac-lin span{color:var(--mf-txt3)}
        #mf-p[data-ui=nova] .mf-cac-lin b{font-weight:600;color:var(--mf-txt)}
        #mf-p[data-ui=nova] .mf-pl-lin{border-bottom-color:var(--mf-borda)}
        #mf-p[data-ui=nova] .mf-ng-bloco>summary{font-size:12.5px;color:var(--mf-txt2)}
        #mf-p[data-ui=nova] #mf-conta-ativa{font-size:14px;color:var(--mf-txt)}

        /* contadores, mensagens e avisos */
        #mf-p[data-ui=nova] .mf-badge{background:#ef4444;min-width:17px;height:17px;line-height:17px;font-size:10.5px;padding:0 5px;box-shadow:0 0 0 2px var(--mf-sup)}
        #mf-p[data-ui=nova] .mf-top .mf-badge{box-shadow:none}
        #mf-p[data-ui=nova] #mf-msg{position:relative;margin:10px 12px 12px;padding:10px 12px 10px 36px;background:var(--mf-pri-suave);border:1px solid var(--mf-pri-borda);border-radius:10px;color:var(--mf-txt);font-size:12.5px;line-height:1.5}
        #mf-p[data-ui=nova] #mf-msg::before{position:absolute;left:12px;top:11px;color:var(--mf-pri)}
        #mf-p[data-ui=nova] .mf-ui-prev.ativo{padding:8px 12px;font-weight:500}
        #mf-p[data-ui=nova] .mf-ui-prev.ativo button{padding:5px 10px}
        #mf-p[data-ui=nova] .mf-corpo::-webkit-scrollbar{width:10px}
        #mf-p[data-ui=nova] .mf-corpo::-webkit-scrollbar-thumb{background:#cbd5e1;border:3px solid transparent;border-radius:99px;background-clip:content-box}
        #mf-p[data-ui=nova] .mf-corpo::-webkit-scrollbar-thumb:hover{background-color:#94a3b8}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-corpo::-webkit-scrollbar-thumb{background-color:#334155}
        /* modo escuro da Nova UI: mantém ícones, lupa e controles segmentados iguais ao modo claro (só as cores mudam) */
        #mf-p[data-ui=nova][data-tema=escuro] #mf-tema,#mf-p[data-ui=nova][data-tema=escuro] .mf-mini{font-size:0 !important;padding:0 !important;color:#94a3b8 !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-mini:hover,#mf-p[data-ui=nova][data-tema=escuro] .mf-ui-icone:hover{background:rgba(255,255,255,.09) !important;color:#f8fafc !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-ui-icone{color:#94a3b8 !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-ui-chip{background:rgba(255,255,255,.07) !important;border:1px solid rgba(255,255,255,.1) !important}
        #mf-p[data-ui=nova][data-tema=escuro] #mf-bs-termo{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E") !important;
          background-repeat:no-repeat !important;background-position:10px center !important;background-size:15px !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-ui-seg,#mf-p[data-ui=nova][data-tema=escuro] .mf-lb-filtros{background:var(--mf-seg) !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-ui-seg button,#mf-p[data-ui=nova][data-tema=escuro] .mf-lb-filtros button{background:transparent !important;color:var(--mf-txt3) !important;border:0 !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-ui-seg button:hover:not(.ativa),#mf-p[data-ui=nova][data-tema=escuro] .mf-lb-filtros button:hover:not(.ativa){color:var(--mf-txt) !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-ui-seg button.ativa,#mf-p[data-ui=nova][data-tema=escuro] .mf-lb-filtros button.ativa{background:#1e2c47 !important;color:#f8fafc !important;box-shadow:0 1px 2px rgba(0,0,0,.4),0 0 0 1px #334155}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-abas>button.ativa{background:transparent !important;color:#93c5fd !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-abas>button:hover:not(.ativa){background:var(--mf-sup2) !important;color:var(--mf-txt) !important}
        #mf-p[data-ui=nova][data-tema=escuro] #mf-msg{background:#13213d !important;border-color:#1e3a8a !important}
        /* ===== Aba Atendimento (Nova UI): só aparência; campos, ids e botões são os mesmos ===== */
        /* aviso sempre à vista nesta aba (ela é longa e o aviso fica no fim): preso no rodapé da rolagem; o × esconde até o próximo */
        #mf-p[data-ui=nova][data-aba-ativa=neg] #mf-msg:not(:empty){position:sticky;bottom:8px;z-index:4;padding-right:36px;box-shadow:0 8px 22px -6px rgba(15,23,42,.28)}
        #mf-p[data-ui=nova][data-aba-ativa=neg] #mf-msg:not(:empty)::after{content:'×';position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:6px;font-size:17px;line-height:21px;text-align:center;color:var(--mf-txt3);cursor:pointer}
        #mf-p[data-ui=nova][data-aba-ativa=neg] #mf-msg:not(:empty):hover::after{background:var(--mf-seg);color:var(--mf-txt)}
        #mf-p[data-ui=nova][data-aba-ativa=neg] #mf-msg.mf-msg-fechada{display:none}
        #mf-p[data-ui=nova][data-tema=escuro][data-aba-ativa=neg] #mf-msg:not(:empty){box-shadow:0 8px 22px -6px rgba(0,0,0,.65)}
        /* Resultado e Modalidade um embaixo do outro no painel estreito (lado a lado, o texto das opções ficava cortado) */
        #mf-p[data-ui=nova] #mf-at-g-acordo > .mf-grade{grid-template-columns:minmax(0,1fr)}
        @container (min-width: 560px){#mf-p[data-ui=nova] #mf-at-g-acordo > .mf-grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
        /* "Copiar" de cada texto da planilha: botão compacto à direita, logo abaixo do texto */
        #mf-p[data-ui=nova] #mf-ng-copiar-pedido,#mf-p[data-ui=nova] #mf-ng-copiar-acordo{display:block;width:auto !important;margin:5px 0 10px auto !important;padding:5px 14px !important;font-size:12px !important}
        /* plano de parcelas: cada parcela num cartão; a 1ª (entrada) com a borda verde */
        #mf-p[data-ui=nova] #mf-at-plano .mf-pl-lin{background:var(--mf-sup2);border:1px solid var(--mf-borda);border-radius:10px;padding:8px;margin-top:6px}
        #mf-p[data-ui=nova] #mf-at-plano .mf-info + .mf-pl-lin{border-left:3px solid var(--mf-ok)}
        /* botões que apagam o que foi digitado (pedem confirmação): texto vermelho, para não confundir com os outros */
        #mf-p[data-ui=nova] #mf-at-novo,#mf-p[data-ui=nova] #mf-ng-novo,#mf-p[data-ui=nova] #mf-ng-limpar{color:var(--mf-perigo);border-color:var(--mf-perigo-borda)}
        #mf-p[data-ui=nova] #mf-at-novo:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-novo:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-limpar:hover:not(:disabled){background:var(--mf-perigo-suave);border-color:var(--mf-perigo)}
        #mf-p[data-ui=nova][data-tema=escuro] #mf-at-novo,#mf-p[data-ui=nova][data-tema=escuro] #mf-ng-novo,#mf-p[data-ui=nova][data-tema=escuro] #mf-ng-limpar{color:#f87171}

        /* ===== Refinamento da aba Atendimento (Nova UI): grades, campos, seções e seletor. Só aparência ===== */
        /* grades: colunas conforme a largura (2 no painel padrão, até 5 no ampliado); grupo com poucos campos usa a largura toda */
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-grade{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-grade > .mf-lb-rot:not(.mf-cheia){max-width:420px}
        /* rótulo em cima e caixa embaixo: as caixas da mesma linha ficam alinhadas mesmo quando um rótulo quebra em 2 linhas */
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-grade > .mf-lb-rot:not(.mf-cheia){justify-content:space-between}
        /* botões de ação: sempre 2 por linha (os de largura toda continuam inteiros) */
        #mf-p[data-ui=nova] #mf-at-form > .mf-sec > .mf-grade{grid-template-columns:repeat(2,minmax(0,1fr))}
        /* rótulos e campos */
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-lb-rot{gap:5px;font-size:12px;font-weight:500;line-height:1.35}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-obrig{color:var(--mf-pri);font-weight:700}
        #mf-p[data-ui=nova] [data-pag="neg"] input[inputmode=decimal],#mf-p[data-ui=nova] [data-pag="neg"] input[inputmode=numeric],#mf-p[data-ui=nova] [data-pag="neg"] input[inputmode=tel],
        #mf-p[data-ui=nova] [data-pag="neg"] input[type=date]{font-variant-numeric:tabular-nums}
        #mf-p[data-ui=nova] [data-pag="neg"] textarea{resize:vertical;min-height:54px}
        /* campo preenchido sozinho (somente leitura, ex.: saldo restante calculado): fundo neutro, sem cara de campo para digitar */
        #mf-p[data-ui=nova] [data-pag="neg"] input[readonly]{background-color:var(--mf-seg) !important;color:var(--mf-txt2) !important;border-style:dashed !important;cursor:default}
        #mf-p[data-ui=nova] [data-pag="neg"] input[readonly]:focus{box-shadow:none;border-color:var(--mf-borda2) !important}
        #mf-p[data-ui=nova][data-tema=escuro] [data-pag="neg"] .mf-lb-rot{color:#a9b6c9 !important}
        #mf-p[data-ui=nova][data-tema=escuro] [data-pag="neg"] ::placeholder{color:#71809a}
        /* seções de dentro de "Dados" (Mensagens): título discreto com divisória fina e a mesma seta dos grupos, sem cartões */
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco{margin:0;padding:10px 0 2px;border-top:1px solid var(--mf-borda)}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco:first-child{border-top:0;padding-top:0}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco[open]{padding-bottom:12px}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco>summary{display:flex;align-items:center;gap:6px;list-style:none;padding:4px 0;margin:0;border-radius:6px;
          font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mf-txt3);
          --mf-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco>summary::-webkit-details-marker{display:none}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco>summary::before{content:none}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco>summary::after{content:'';flex:none;margin-left:auto;width:14px;height:14px;background:currentColor;color:var(--mf-apagado);
          -webkit-mask:var(--mf-ico) center/contain no-repeat;mask:var(--mf-ico) center/contain no-repeat;transform:rotate(-90deg);transition:transform .18s}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco[open]>summary{margin-bottom:8px;color:var(--mf-txt2)}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco[open]>summary::after{transform:none}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco>summary:hover{color:var(--mf-txt)}
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-ng-bloco>summary:focus-visible{outline:2px solid var(--mf-pri);outline-offset:2px}
        #mf-p[data-ui=nova][data-tema=escuro] [data-pag="neg"] .mf-ng-bloco>summary{color:#8a9ab0 !important}
        #mf-p[data-ui=nova][data-tema=escuro] [data-pag="neg"] .mf-ng-bloco[open]>summary,#mf-p[data-ui=nova][data-tema=escuro] [data-pag="neg"] .mf-ng-bloco>summary:hover{color:#cbd5e1 !important}
        /* grupos da aba: título do grupo fechado um tom mais apagado (aberto x fechado fica claro) */
        #mf-p[data-ui=nova] [data-pag="neg"] .mf-grupo:not([open])>summary{color:var(--mf-txt2)}
        /* Negociação | Renegociação | Mensagens: opção ativa em destaque azul; inativas com contraste menor; foco visível */
        #mf-p[data-ui=nova] .mf-at-seg{gap:4px;padding:4px;border-radius:11px}
        #mf-p[data-ui=nova] .mf-at-seg button{padding:7px 6px;border-radius:8px;font-size:12.5px;line-height:1.2;text-align:center;color:var(--mf-txt3)}
        #mf-p[data-ui=nova] .mf-at-seg button:hover:not(.ativa){color:var(--mf-txt);background:rgba(15,23,42,.045)}
        #mf-p[data-ui=nova] .mf-at-seg button.ativa{background:var(--mf-sup);color:var(--mf-pri);box-shadow:0 1px 2px rgba(15,23,42,.12),0 0 0 1px var(--mf-pri-borda)}
        #mf-p[data-ui=nova] .mf-at-seg button:focus-visible{outline:2px solid var(--mf-pri);outline-offset:-2px}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-at-seg button:hover:not(.ativa){color:#e2e8f0 !important;background:rgba(255,255,255,.05) !important}
        #mf-p[data-ui=nova][data-tema=escuro] .mf-at-seg button.ativa{background:rgba(59,130,246,.18) !important;color:#dbeafe !important;box-shadow:inset 0 0 0 1px rgba(96,165,250,.5) !important}
        /* topo, abas e busca um pouco mais compactos (mais espaço para o conteúdo); nenhum controle sai */
        #mf-p[data-ui=nova] .mf-top{min-height:44px;padding:6px 8px 6px 12px}
        #mf-p[data-ui=nova] .mf-top>div:first-child{min-height:30px;row-gap:1px}
        #mf-p[data-ui=nova] .mf-top small#mf-versao{line-height:14px;padding:0 6px}
        /* conta ativa na 2ª linha do título, do mesmo tamanho da versão */
        #mf-p[data-ui=nova] .mf-top>div:first-child>.mf-ui-chip{margin:0 0 0 5px;padding:0 7px 0 6px;gap:5px;font-size:10.5px;line-height:16px;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
        #mf-p[data-ui=nova] .mf-top>div:first-child>.mf-ui-chip::before{display:inline-block;vertical-align:1px;margin-right:5px}
        #mf-p[data-ui=nova] .mf-top>div:first-child>.mf-ui-chip:empty,#mf-p[data-ui=nova].mf-min .mf-top>div:first-child>.mf-ui-chip{display:none}
        /* botões de ícone do topo sempre quadrados (no painel estreito eles eram espremidos para 25 px) */
        #mf-p[data-ui=nova] .mf-top .mf-mini,#mf-p[data-ui=nova] .mf-top .mf-ui-icone{flex:none;width:28px !important;height:28px}
        /* só o ícone desenhado: no modo claro o texto (⤢/⤡) do botão de ampliar aparecia junto, duplicado */
        #mf-p[data-ui=nova] .mf-top .mf-mini{font-size:0 !important;line-height:0;padding:0 !important}
        #mf-p[data-ui=nova] .mf-abas>button{padding:5px 2px 6px;gap:2px}
        #mf-p[data-ui=nova] .mf-abas>button::before{width:16px;height:16px}
        #mf-p[data-ui=nova] .mf-bs{padding:8px 12px}
        #mf-p[data-ui=nova] .mf-bs .mf-tit{margin-bottom:6px}
        @media (prefers-reduced-motion: reduce){#mf-p[data-ui=nova] *{transition:none !important}}
      </style>
      <div class="mf-top" title="Arraste para mover o painel"><div><b>${TITULO}</b><small id="mf-versao" title="Clique 7 vezes para a mensagem secreta">${VERSAO}</small><span id="mf-lb-badge-topo" class="mf-badge" style="display:none;cursor:pointer;margin-left:6px"></span><span id="mf-tm-topo" style="display:none;cursor:pointer;margin-left:6px;font-size:12px;background:#334155;border-radius:9px;padding:1px 7px"></span></div>
        <button id="mf-tam" class="mf-mini" type="button" title="Ampliar o painel">⤢</button><button id="mf-tema" class="mf-mini" type="button" title="Modo escuro">🌙</button><button id="mf-min" class="mf-mini" title="Minimizar / expandir">—</button></div>
      <div class="mf-rz mf-rz-d" data-rz="x" title="Arraste para mudar a largura"></div><div class="mf-rz mf-rz-b" data-rz="y" title="Arraste para mudar a altura"></div>
      <div class="mf-rz mf-rz-c" data-rz="xy" tabindex="0" role="separator" aria-label="Redimensionar o painel (setas do teclado; duplo clique alterna padrão e ampliado)" title="Arraste para redimensionar · duplo clique: padrão / ampliado"></div>
      <div class="mf-corpo">
        <div id="mf-ui-prev" class="mf-ui-prev"><span id="mf-ui-prev-txt" style="flex:1"></span><button id="mf-ui-prev-manter" class="verde" style="padding:5px 9px">Manter</button><button id="mf-ui-prev-voltar" class="cinza" style="padding:5px 9px">Voltar</button></div>
        <div class="mf-bs" id="mf-bs">
          <div class="mf-tit mf-dobra aberta" id="mf-bs-tit" title="Mostrar / esconder a busca">Buscar cliente</div>
          <div id="mf-bs-corpo">
            <div class="mf-linha" style="margin-bottom:4px">
              <input id="mf-bs-termo" type="text" placeholder="CPF, nº da proposta ou nome" autocomplete="off" style="flex:1">
              <span id="mf-bs-tipo" class="mf-info" style="min-width:52px;text-align:center"></span>
              <button id="mf-bs-buscar" class="azul" style="padding:8px 12px">Buscar</button>
            </div>
            <label class="mf-opc" style="margin:2px 0"><input type="checkbox" id="mf-bs-cac"><span>Incluir cobrança do CAC (troca para a conta master se precisar)</span></label>
            <div id="mf-bs-st" class="mf-info"></div>
            <div id="mf-bs-res" style="display:none"></div>
            <div id="mf-bs-usar" class="mf-linha" style="display:none;flex-wrap:wrap;gap:4px;margin:6px 0 0">
              <span class="mf-info" id="mf-bs-usar-rot">Usar em:</span>
              <button id="mf-bs-usar-neg" class="cinza mf-bs-mini">Atendimento</button>
              <button id="mf-bs-usar-cac" class="cinza mf-bs-mini">CAC</button>
              <button id="mf-bs-usar-lem" class="cinza mf-bs-mini">Lembretes</button>
              <button id="mf-bs-limpar" class="vermelho mf-bs-mini">Limpar</button>
            </div>
          </div>
        </div>
        <div class="mf-abas">
          <button data-aba="neg">Atendimento</button>
          <button data-aba="his">Histórico <span id="mf-hs-badge" class="mf-badge" style="display:none"></span></button>
          <button data-aba="lem">Lembretes <span id="mf-lb-badge" class="mf-badge" style="display:none"></span></button>
          <button data-aba="tim">Timers <span id="mf-tm-badge" class="mf-badge" style="display:none"></span></button>
          <button data-aba="rel">Relatórios</button>
          <button data-aba="cac">Consulta CAC</button>
          <button data-aba="ccb">CCBs</button>
          <button data-aba="cta">Contas</button>
          <button data-aba="cfg">Configurações</button>
        </div>

        <div data-pag="rel">
          <div class="mf-sec">
            <div class="mf-tit">Status</div>
            <div id="mf-st">Pronto</div>
            <div class="mf-barra"><div id="mf-prog"></div></div>
          </div>
          <div class="mf-sec">
            <div class="mf-tit">Propostas <span id="mf-qtd"></span></div>
            <select id="mf-modo" style="margin-bottom:8px">
              <option value="coleta">Relatório - Auditoria</option>
              <option value="reprovadas">Relatório - Reprovadas</option>
              <option value="efetivadas">Relatório - Efetivadas (Boleto+)</option>
              <option value="aprovadas">Relatório - Aprovadas não efetivadas</option>
              <option value="valortransacao">Relatório - Diário</option>
              <option value="rendas">Relatório - Rendas (informada x birô)</option>
            </select>
            <div id="mf-diario" style="display:none;margin-bottom:8px">
              <select id="mf-diario-saida" title="Só muda a saída do Relatório Diário">
                <option value="completo">Relatório completo (linhas A–L + valores N)</option>
                <option value="valores">Somente valores de transação (coluna N)</option>
              </select>
            </div>
            <div class="mf-linha">
              <button id="mf-tela" class="cinza">Ler da tela</button>
              <span id="mf-filtro" class="mf-info"></span>
            </div>
            <textarea id="mf-lista" placeholder="Ou cole aqui os números das propostas (um por linha)"></textarea>
          </div>
          <div class="mf-sec">
            <div class="mf-tit">Controle</div>
            <div class="mf-grade">
              <button id="mf-ini" class="verde">▶ Iniciar</button>
              <button id="mf-par" class="laranja">⏸ Pausar</button>
              <button id="mf-cont" class="azul">⏯ Continuar</button>
              <button id="mf-res" class="vermelho">↺ Resetar</button>
            </div>
          </div>
          <div class="mf-sec">
            <div class="mf-tit">Copiar para a planilha <span id="mf-formato-info" style="text-transform:none;letter-spacing:0;font-weight:400"></span></div>
            <div class="mf-grade">
              <button id="mf-cop">Copiar resultado</button>
              <button id="mf-cid">Copiar c/ proposta</button>
              <button id="mf-cfull" class="azul mf-cheia" title="Linha inteira do modelo Auditoria 2 Completo, da coluna A (Proposta) à R (Motivo Reprovação)">Copiar auditoria completa (A–R)</button>
              <button id="mf-dlin" class="azul mf-cheia" title="Colunas A a L da planilha do Relatório Diário (a M, Situação Relatório, não é tocada)">Copiar linhas (A–L)</button>
              <button id="mf-dval" class="verde mf-cheia" title="Só os valores de transação, um por linha, para colar na coluna N">Copiar somente valores (coluna N)</button>
              <button id="mf-colr" class="cinza mf-cheia" title="Só a coluna do motivo de reprovação, para colar na coluna R">Copiar motivo (coluna R)</button>
            </div>
          </div>
          <div class="mf-sec">
            <div class="mf-tit mf-dobra" id="mf-pd-tit" title="Mostrar / esconder as pendências">Pendências <span id="mf-pd-qtd" style="text-transform:none;letter-spacing:0;font-weight:400"></span></div>
            <div id="mf-pd-corpo" style="display:none">
              <div class="mf-info" style="margin-bottom:8px">Propostas com pendência em aberto na <b>Fila de Pendências</b> (Serviços), que fica na conta master. Só leitura: nada é baixado nem alterado.</div>
              <div class="mf-grade">
                <button id="mf-pd-gerar" class="verde">Gerar relatório</button>
                <button id="mf-pd-copiar">Copiar</button>
                <button id="mf-pd-limpar" class="vermelho" title="Apaga o relatório da caixa (não mexe em nada no ER)">Limpar</button>
              </div>
              <div id="mf-pd-st" class="mf-info" style="margin-top:8px"></div>
              <textarea id="mf-pd-res" readonly wrap="off" placeholder="O relatório das pendências aparece aqui" style="display:none;margin-top:8px;height:240px;white-space:pre;overflow-x:auto;font-size:12px"></textarea>
            </div>
          </div>
        </div>

        <div data-pag="ccb">
          <div class="mf-sec">
            <div class="mf-tit">Download de CCBs</div>
            <div class="mf-info" style="margin-bottom:8px">Use na tela <b>Fila de Propostas</b>. Informe nomes de clientes ou números de proposta (um por linha).
              Só baixa propostas <b>EFETIVADAS</b>, <b>assinadas digitalmente</b> e com exatamente uma "CCB ASSINADA". Arquivo: CPF_NOME.pdf.</div>
            <button id="mf-ccb-ler" class="cinza" style="width:100%;margin-bottom:8px">Ler propostas elegíveis da fila</button>
            <textarea id="mf-ccb-lista" placeholder="Nomes completos ou números das propostas (um por linha)"></textarea>
            <div class="mf-grade" style="margin-top:8px">
              <button id="mf-ccb-baixar" class="verde">⬇ Baixar CCBs</button>
              <button id="mf-ccb-parar" class="laranja" disabled>⏹ Parar</button>
            </div>
            <div id="mf-ccb-st" class="mf-info" style="margin-top:8px"></div>
          </div>
        </div>

        <div data-pag="cta">
          <div class="mf-sec">
            <div class="mf-tit">Conta ativa</div>
            <div id="mf-conta-ativa" style="font-weight:600">—</div>
          </div>
          <div class="mf-sec">
            <div class="mf-tit">Trocar de conta</div>
            <select id="mf-conta-sel"></select>
            <button id="mf-conta-trocar" class="azul" style="width:100%;margin-top:8px">Trocar para esta conta</button>
            <div class="mf-info" style="margin-top:6px">Sai pelo botão "Sair" do próprio sistema (a sessão é do navegador: vale para todas as abas). Na tela de login preenche o usuário e, se a conta tiver senha salva, entra sozinho.</div>
          </div>
          <div class="mf-sec">
            <div class="mf-tit mf-dobra" id="mf-contas-tit" title="Mostrar / esconder as contas cadastradas">Contas cadastradas <span id="mf-contas-qtd"></span></div>
            <div id="mf-contas-corpo">
            <div id="mf-contas"></div>
            <div class="mf-grade" style="margin-top:8px">
              <input id="mf-conta-apelido" type="text" placeholder="Nome da conta (ex.: Caio Mesa)" autocomplete="off">
              <input id="mf-conta-usuario" type="text" placeholder="Usuário de login" autocomplete="off" spellcheck="false">
            </div>
            <div style="display:flex;gap:6px;margin-top:8px">
              <input id="mf-conta-senha" type="password" placeholder="Senha (opcional: login automático)" autocomplete="new-password" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px">
              <button id="mf-conta-ver" class="cinza" type="button" title="Mostrar / ocultar a senha digitada" style="padding:6px 10px">👁</button>
            </div>
            <button id="mf-conta-salvar" class="cinza" style="width:100%;margin-top:8px">Adicionar / atualizar conta</button>
            <div class="mf-info" style="margin-top:6px">Usuário e senha ficam só neste navegador, no armazenamento local do Tampermonkey: não vão para o código, o GitHub, o Diagnóstico nem para outros funcionários.
              <b>Esse armazenamento não é criptografado</b>: quem usar este perfil do navegador ou um backup do Tampermonkey consegue ler. Ao editar, senha em branco mantém a atual.</div>
            </div>
          </div>
        </div>

        <div data-pag="cac">
          <div class="mf-sec">
            <div class="mf-tit">Consulta CAC (somente leitura)</div>
            <div class="mf-linha" style="margin-bottom:6px">
              <input id="mf-cac-termo" type="text" placeholder="CPF ou nome do cliente" autocomplete="off" style="flex:1">
              <button id="mf-cac-buscar" class="azul" style="padding:8px 12px">Consultar</button>
            </div>
            <div id="mf-cac-st" class="mf-info"></div>
            <div id="mf-cac-escolha"></div>
          </div>
          <div class="mf-sec" id="mf-cac-res" style="display:none">
            <div class="mf-tit">Resultado do CAC</div>
            <div id="mf-cac-tabela"></div>
            <div class="mf-grade" style="margin-top:8px">
              <button id="mf-cac-limpar" class="cinza mf-cheia">Nova consulta</button>
            </div>
            <div class="mf-info" style="margin-top:6px">O resultado fica só nesta aba do navegador (some ao fechar a aba) e não é enviado a lugar nenhum.</div>
          </div>
        </div>

        <div data-pag="neg">
          <div class="mf-ui-seg mf-at-seg">
            <button data-at="negociacao">Negociação</button><button data-at="renegociacao">Renegociação</button><button data-at="mensagens">Mensagens</button>
          </div>
          <div id="mf-at-form">
            <details class="mf-grupo" id="mf-at-g-cliente" data-grupo="at-cliente" open><summary>Cliente</summary>
              <div class="mf-linha" style="flex-wrap:wrap;gap:6px;margin:2px 0 6px">
                <button id="mf-at-aplicar" class="cinza mf-bs-mini" title="Preenche com o cliente da busca do topo. O número de contato nunca é preenchido pelo telefone da proposta.">Aplicar cliente atual</button>
              </div>
              <div id="mf-at-cliente" class="mf-grade"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-cobranca" data-grupo="at-cobranca"><summary>Cobrança</summary>
              <div id="mf-at-cobranca" class="mf-grade"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-acordo" data-grupo="at-acordo" open><summary>Acordo</summary>
              <div class="mf-grade">
                <label class="mf-lb-rot" id="mf-at-resultado-rot"><span>Resultado<span class="mf-obrig">&nbsp;*</span></span><select id="mf-ng-frase-tipo">
                  <option value="fechou">Cliente fechou (acordo realizado)</option>
                  <option value="solicitou">Cliente solicitou (simulação / pendente)</option>
                  <option value="nao">Negociação não concluída</option>
                </select></label>
                <label class="mf-lb-rot"><span>Modalidade<span class="mf-obrig">&nbsp;*</span></span><select id="mf-at-modalidade"></select></label>
              </div>
              <div id="mf-at-modal" style="margin-top:6px"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-reneg" data-grupo="at-reneg" open><summary>Renegociação</summary>
              <div id="mf-at-reneg" class="mf-grade"></div>
              <div class="mf-tit" style="margin-top:10px">Plano de parcelas</div>
              <div id="mf-at-plano-cfg" class="mf-grade"></div>
              <button id="mf-at-plano-gerar" class="azul" style="width:100%;margin-top:6px">Montar parcelas</button>
              <div id="mf-at-plano" style="margin-top:6px"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-textos" data-grupo="at-textos" open><summary>Textos da planilha</summary>
              <button id="mf-ng-frases" class="azul" style="width:100%;margin-bottom:8px">Gerar textos</button>
              <label class="mf-lb-rot"><span id="mf-at-rot-pedido">Pedido do cliente</span><textarea id="mf-ng-f-pedido" style="height:54px"></textarea></label>
              <button id="mf-ng-copiar-pedido" class="cinza" style="width:100%;margin:4px 0 8px">Copiar</button>
              <label class="mf-lb-rot">Acordo Realizado<textarea id="mf-ng-f-acordo" style="height:54px"></textarea></label>
              <button id="mf-ng-copiar-acordo" class="cinza" style="width:100%;margin-top:4px">Copiar</button>
              <div class="mf-linha" id="mf-at-linha-parcela" style="margin-top:8px"><input id="mf-ng-f-parcela" type="text" placeholder="A partir de qual parcela" style="flex:1"><button id="mf-ng-copiar-parcela" class="cinza" style="padding:7px 9px">Copiar</button></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-acomp" data-grupo="at-acomp"><summary>Acompanhamento (opcional)</summary>
              <button id="mf-at-sugerir" class="cinza mf-bs-mini" style="margin-bottom:6px" title="Preenche Data 1° pagamento e Quantidade de parcelas com o que foi digitado no acordo">Trazer do acordo</button>
              <div id="mf-at-acomp" class="mf-grade"></div>
            </details>
            <div class="mf-sec">
              <div class="mf-grade">
                <button id="mf-at-copiar" class="verde mf-cheia">Copiar linha da planilha</button>
                <button id="mf-at-registrar" class="azul">Registrar no histórico</button>
                <button id="mf-at-mensagem" class="cinza">Mensagem p/ grupo</button>
                <button id="mf-at-novo" class="cinza mf-cheia">Novo atendimento</button>
              </div>
              <div id="mf-at-msg-caixa" style="display:none;margin-top:8px">
                <textarea id="mf-at-msg-texto" style="height:150px" placeholder="Mensagem do acordo (pode editar antes de copiar)"></textarea>
                <button id="mf-at-msg-copiar" class="verde" style="width:100%;margin-top:4px">Copiar mensagem</button>
              </div>
              <div class="mf-info" style="margin-top:6px">Os campos ficam só nesta página até você registrar no histórico. O número de contato é sempre o informado pelo cliente (RD Station), nunca o telefone da proposta.</div>
            </div>
          </div>
          <div id="mf-at-mensagens">
            <div class="mf-sec">
              <div class="mf-tit">Mensagens para o grupo</div>
              <select id="mf-ng-modelo"></select>
              <select id="mf-ng-modalidade" style="margin-top:6px;display:none" title="Tipo de acordo realizado"></select>
              <div id="mf-ng-desc" class="mf-info" style="margin-top:6px"></div>
            </div>
            <details class="mf-grupo" id="mf-ng-dados" data-grupo="ng-dados" open><summary>Dados</summary>
              <div id="mf-ng-slot"><div id="mf-ng-campos"></div></div>
            </details>
            <details class="mf-grupo" id="mf-ng-saida" data-grupo="ng-saida" open><summary>Texto</summary>
              <div class="mf-grade" style="margin-bottom:8px">
                <button id="mf-ng-gerar" class="azul">Gerar texto</button>
                <button id="mf-ng-copiar" class="verde">Copiar texto</button>
              </div>
              <textarea id="mf-ng-texto" style="height:180px" placeholder="O texto gerado aparece aqui e pode ser editado antes de copiar."></textarea>
              <div class="mf-grade" style="margin-top:8px">
                <button id="mf-ng-limpar" class="cinza">Limpar campos</button>
                <button id="mf-ng-novo" class="cinza">Novo texto</button>
              </div>
              <div class="mf-info" style="margin-top:6px">Os mesmos dados do Atendimento: o que foi digitado lá já aparece aqui. Nada é enviado.</div>
            </details>
          </div>
        </div>

        <div data-pag="his">
          <div class="mf-sec">
            <div class="mf-tit">Histórico de acordos da equipe <span id="mf-hs-qtd" style="font-weight:400"></span></div>
            <input id="mf-hs-busca" type="text" placeholder="Nome, proposta, telefone ou responsável" autocomplete="off">
            <div class="mf-grade" style="margin-top:6px">
              <select id="mf-hs-status">
                <option value="">Todas as situações</option><option value="realizado">Acordos realizados</option><option value="pendente">Solicitações pendentes</option>
                <option value="nao_concluido">Não concluídas</option><option value="anulado">Anulados</option>
              </select>
              <select id="mf-hs-modal"><option value="">Todas as modalidades</option></select>
              <select id="mf-hs-func"><option value="">Todos os funcionários</option></select>
              <select id="mf-hs-periodo"><option value="30">Últimos 30 dias</option><option value="7">Últimos 7 dias</option><option value="1">Hoje</option></select>
            </div>
            <div id="mf-hs-equipe" class="mf-info" style="margin-top:6px"></div>
            <div id="mf-hs-lista" style="margin-top:8px"></div>
          </div>
        </div>

        <div data-pag="lem">
          <div class="mf-sec">
            <div class="mf-tit">Lembretes de pagamentos parciais</div>
            <div id="mf-lb-resumo" style="font-size:13px;margin-bottom:8px"></div>
            <div class="mf-lb-filtros">
              <button data-filtro="atencao">Atenção</button>
              <button data-filtro="pendentes">Pendentes</button>
              <button data-filtro="encerrados">Concluídos</button>
              <button data-filtro="todos">Todos</button>
            </div>
            <input id="mf-lb-busca" type="text" placeholder="Buscar por proposta, cliente, telefone ou responsável" autocomplete="off" style="margin-top:8px">
            <div id="mf-lb-lista" style="margin-top:8px"></div>
          </div>
          <details class="mf-grupo" id="mf-lb-form-grupo"><summary id="mf-lb-form-tit">Novo lembrete</summary>
            <div class="mf-grade">
              <input id="mf-lb-cliente" type="text" placeholder="Cliente (opcional)" autocomplete="off">
              <input id="mf-lb-proposta" type="text" placeholder="Nº da proposta" autocomplete="off">
              <label class="mf-lb-rot mf-cheia">Telefone de contato (opcional)<input id="mf-lb-telefone" type="text" inputmode="tel" placeholder="(11) 91234-5678" autocomplete="off"></label>
              <label class="mf-lb-rot">Valor total<input id="mf-lb-total" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
              <label class="mf-lb-rot"><span id="mf-lb-pago-rot">Valor pago agora</span><input id="mf-lb-pago" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
              <label class="mf-lb-rot">Data do pagamento<input id="mf-lb-data-pag" type="date"></label>
              <label class="mf-lb-rot">Próximo acompanhamento<input id="mf-lb-proxima" type="date"></label>
            </div>
            <div id="mf-lb-saldo" class="mf-info" style="margin:6px 0"></div>
            <textarea id="mf-lb-obs" style="height:54px" placeholder="Observações"></textarea>
            <label class="mf-opc" id="mf-lb-compartilhar-rot" style="display:none"><input type="checkbox" id="mf-lb-compartilhar" checked><span><b>Compartilhar com a equipe</b><small>Aparece para os funcionários conectados e entra no acompanhamento da equipe.</small></span></label>
            <label class="mf-lb-rot" id="mf-lb-status-rot" style="display:none">Status
              <select id="mf-lb-status"><option value="pendente">Pendente</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></label>
            <div class="mf-grade" style="margin-top:8px">
              <button id="mf-lb-salvar" class="verde">Salvar lembrete</button>
              <button id="mf-lb-cancelar" class="cinza">Cancelar</button>
            </div>
          </details>
          <details class="mf-grupo"><summary>Backup e avisos</summary>
            <div class="mf-grade">
              <button id="mf-lb-exportar" class="cinza">Exportar backup</button>
              <button id="mf-lb-importar" class="cinza">Importar backup</button>
            </div>
            <input id="mf-lb-arquivo" type="file" accept=".json,application/json" style="display:none">
            <button id="mf-lb-notif" class="cinza" style="width:100%;margin-top:8px">Ativar notificações do navegador</button>
            <div class="mf-info" style="margin-top:6px">Os lembretes ficam neste navegador (armazenamento do Tampermonkey) e continuam após atualizar o script. Os marcados "Compartilhar com a equipe" vão para os funcionários conectados (Configurações > Equipe); os outros ficam só aqui. Os avisos só aparecem com uma página do sistema aberta.</div>
          </details>
        </div>

        <div data-pag="tim">
          <div id="mf-tm-resumo" class="mf-sec" style="display:none;background:#fff7ed;font-size:12px"></div>
          <details class="mf-grupo" open><summary>Novo timer</summary>
            <input id="mf-tm-titulo" type="text" placeholder="Título (ex.: Retornar ligação)" autocomplete="off">
            <input id="mf-tm-desc" type="text" placeholder="Descrição (opcional)" autocomplete="off" style="margin-top:6px">
            <div class="mf-grade" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px">
              <label class="mf-lb-rot">Horas<input id="mf-tm-h" type="text" inputmode="numeric" value="0"></label>
              <label class="mf-lb-rot">Minutos<input id="mf-tm-m" type="text" inputmode="numeric" value="15"></label>
              <label class="mf-lb-rot">Segundos<input id="mf-tm-s" type="text" inputmode="numeric" value="0"></label>
            </div>
            <div class="mf-grade" style="margin-top:6px">
              <label class="mf-lb-rot mf-cheia">Quando começa
                <select id="mf-tm-quando"><option value="agora">Agora</option><option value="expediente">No próximo expediente (ao entrar no ER)</option><option value="horario">Em data e horário</option></select></label>
              <label class="mf-lb-rot" id="mf-tm-data-rot" style="display:none">Data<input id="mf-tm-data" type="date"></label>
              <label class="mf-lb-rot" id="mf-tm-hora-rot" style="display:none">Horário<input id="mf-tm-hora" type="time"></label>
            </div>
            <button id="mf-tm-criar" class="verde" style="width:100%;margin-top:8px">Criar timer</button>
          </details>
          <div class="mf-sec">
            <div class="mf-lb-filtros mf-tm-filtros">
              <button data-filtro="ativos">Ativos</button><button data-filtro="agendados">Agendados</button><button data-filtro="encerrados">Encerrados</button><button data-filtro="todos">Todos</button>
            </div>
            <input id="mf-tm-busca" type="text" placeholder="Buscar timer" autocomplete="off" style="margin-top:8px">
            <div id="mf-tm-lista" style="margin-top:8px"></div>
          </div>
          <details class="mf-grupo"><summary>Som e expediente</summary>
            <label class="mf-lb-rot">Volume do alarme<input id="mf-tm-volume" type="range" min="0" max="100" step="5"></label>
            <div class="mf-grade" style="margin-top:6px">
              <button id="mf-tm-testar" class="cinza">Testar som</button>
              <button id="mf-tm-expediente" class="cinza" title="Inicia agora os timers agendados para o expediente de hoje">Iniciar expediente</button>
            </div>
            <label class="mf-opc"><input type="checkbox" id="mf-tm-auto"><span><b>Iniciar o expediente ao entrar no ER</b><small>1ª página do dia com você logado (não conta a tela de login nem sessão expirada).</small></span></label>
            <div class="mf-info">Os timers ficam salvos neste navegador e continuam após atualizar o script. Só tocam com uma página do ER aberta: com o navegador fechado não há alarme; ao reabrir, o que venceu aparece num resumo, sem tocar.</div>
          </details>
        </div>

        <div data-pag="cfg">
          <details class="mf-grupo" data-grupo="coleta" open><summary>Coleta</summary>
            <label class="mf-opc" title="Coleta também CPF, motivo (coluna R) e os dados da proposta (nome, loja, vendedor, contato...) no modelo Auditoria 2 Completo. Desligada: só os dados de crédito."><input type="checkbox" id="mf-audit-full"><span><b>Auditoria completa</b><small>CPF, motivo e dados da proposta (A–R)</small></span></label>
            <label class="mf-opc" title="Abre a aba Cliente da Análise de Proposta (oculta) para ler telefone e e-mail. Desligue se ela deixar a coleta lenta ou falhar: o resto da auditoria continua."><input type="checkbox" id="mf-aba-cliente"><span><b>Telefone e e-mail (aba Cliente)</b></span></label>
            <label class="mf-opc" title="Proposta cancelada ou de teste (cliente ou digitador TESTE) nunca é processada, qualquer que seja a situação."><input type="checkbox" id="mf-canc"><span><b>Ignorar canceladas e testes</b></span></label>
            <label class="mf-opc" title="Só no Relatório Diário. Testes continuam fora."><input type="checkbox" id="mf-diario-tudo"><span><b>Relatório Diário: visão geral do dia</b><small>Inclui canceladas e em digitação (CONF CAD), além de aprovadas, reprovadas e pendentes, como na planilha do Relatório Diário. Propostas de teste continuam fora.</small></span></label>
            <label class="mf-opc" title="Relatório de Rendas: por padrão só entram propostas aprovadas e efetivadas (pendentes, canceladas e testes ficam de fora). Ligado: as reprovadas também entram; as que não tiverem a renda do birô (RendaCalculo) no motor saem com a coluna F vazia."><input type="checkbox" id="mf-rendas-repr"><span><b>Rendas: incluir reprovadas</b></span></label>
            <label class="mf-opc" title="Copia o resultado sozinho quando a fila termina."><input type="checkbox" id="mf-auto-copia"><span><b>Copiar ao concluir</b></span></label>
          </details>
          <details class="mf-grupo" data-grupo="formato"><summary>Formato de cópia</summary>
            <label class="mf-opc" title="Auditoria e Diário: texto com tabulação (Excel). Reprovadas, Efetivadas e Aprovadas: tabela com parágrafos (Canva)."><input type="checkbox" id="mf-formato-auto"><span><b>Automático por modo</b></span></label>
            <label class="mf-opc" title="Tabela estilo Excel, quebra br, blocos div, 2 colunas e Google Sheets."><input type="checkbox" id="mf-formatos-antigos"><span><b>Mostrar formatos antigos</b></span></label>
            <div id="mf-formatos"></div>
            <div class="mf-info" id="mf-formato-dica"></div>
          </details>
          <details class="mf-grupo" data-grupo="contas"><summary>Contas</summary>
            <label class="mf-opc" title="Desligado: pede confirmação antes de sair da conta atual."><input type="checkbox" id="mf-troca-direta"><span><b>Trocar de conta sem confirmação</b></span></label>
            <label class="mf-opc" title="Na tela de login do ER, entra com a última conta usada. Precisa da senha salva na lista de contas (aba Contas)."><input type="checkbox" id="mf-login-auto"><span><b>Entrar sozinho quando a sessão expirar</b><small>Na tela de login, entra com a última conta usada (precisa da senha salva em Contas). Uma tentativa só: se a senha for recusada, não tenta de novo até você entrar manualmente ou salvar outra senha.</small></span></label>
          </details>
          <details class="mf-grupo" data-grupo="cac"><summary>Consulta CAC</summary>
            <label class="mf-lb-rot">Conta master (acessa o CAC e a Fila de Pendências)<select id="mf-cac-master"></select></label>
            <label class="mf-opc"><input type="checkbox" id="mf-cac-troca"><span><b>Trocar automaticamente para a conta master</b><small>Quando a conta atual não acessar o CAC. Encerra a sessão em todas as abas.</small></span></label>
            <label class="mf-opc"><input type="checkbox" id="mf-cac-voltar"><span><b>Voltar para a conta anterior depois</b></span></label>
            <label class="mf-opc" title="Como na tela do CAC, abrir a Posição Geral registra um protocolo de atendimento. Desligado: lê só os contratos (a Filial pode ficar N/A)."><input type="checkbox" id="mf-cac-posicao"><span><b>Abrir a Posição Geral</b><small>Traz a Filial (Origem); o sistema registra protocolo.</small></span></label>
          </details>
          <details class="mf-grupo" data-grupo="negociacoes"><summary>Gerador de negociações</summary>
            <div class="mf-info" style="margin-bottom:4px">Modelo de texto</div>
            <select id="mf-ng-cfg-modelo"></select>
            <textarea id="mf-ng-cfg-texto" style="height:170px;margin-top:6px;font-family:Consolas,monospace;font-size:12px"></textarea>
            <div class="mf-grade" style="margin-top:6px">
              <button id="mf-ng-cfg-salvar" class="verde">Salvar modelo</button>
              <button id="mf-ng-cfg-restaurar" class="cinza">Restaurar original</button>
            </div>
            <div id="mf-ng-cfg-vars" class="mf-info" style="margin-top:6px;white-space:pre-wrap"></div>
            <div class="mf-info" style="margin:10px 0 4px">Dados para pagamento (só neste navegador; usados no modelo "Retorno do setor — Instruções de pagamento")</div>
            <div class="mf-grade">
              <input id="mf-ng-pix" type="text" placeholder="Chave PIX" autocomplete="off" class="mf-cheia">
              <input id="mf-ng-banco" type="text" placeholder="Banco" autocomplete="off">
              <input id="mf-ng-agencia" type="text" placeholder="Agência" autocomplete="off">
              <input id="mf-ng-conta" type="text" placeholder="Conta" autocomplete="off" class="mf-cheia">
            </div>
            <button id="mf-ng-pag-salvar" class="cinza" style="width:100%;margin-top:6px">Salvar dados para pagamento</button>
          </details>
          <details class="mf-grupo" data-grupo="equipe"><summary>Equipe (compartilhamento)</summary>
            <div id="mf-eq-status" style="font-weight:600;margin-bottom:6px"></div>
            <label class="mf-lb-rot">Seu nome (como a equipe vê)<input id="mf-eq-nome" type="text" autocomplete="off" maxlength="40"></label>
            <label class="mf-lb-rot" style="margin-top:6px">Secret do Pusher
              <span style="display:flex;gap:6px"><input id="mf-eq-secret" type="password" autocomplete="new-password" spellcheck="false" style="flex:1"><button id="mf-eq-secret-ver" class="cinza" type="button" style="padding:4px 9px">👁</button></span></label>
            <label class="mf-lb-rot" style="margin-top:6px">Chave da equipe (a mesma nos 4 computadores)
              <span style="display:flex;gap:6px"><input id="mf-eq-chave" type="password" autocomplete="new-password" spellcheck="false" style="flex:1"><button id="mf-eq-chave-ver" class="cinza" type="button" style="padding:4px 9px">👁</button></span></label>
            <label class="mf-opc"><input type="checkbox" id="mf-eq-ativa"><span><b>Compartilhar lembretes e histórico com a equipe</b><small>Novos lembretes compartilhados e acordos registrados aparecem para quem estiver com o sistema aberto.</small></span></label>
            <div class="mf-grade">
              <button id="mf-eq-salvar" class="azul mf-cheia">Salvar e conectar</button>
              <button id="mf-eq-sync" class="cinza">Sincronizar agora</button>
              <button id="mf-eq-exportar" class="cinza">Exportar backup</button>
              <button id="mf-eq-importar" class="cinza mf-cheia">Importar backup</button>
            </div>
            <input id="mf-eq-arquivo" type="file" accept=".json,application/json" style="display:none">
            <div class="mf-info" style="margin-top:6px">A secret e a chave ficam só neste navegador (armazenamento do Tampermonkey); esse armazenamento não é criptografado e elas nunca vão para o código ou o GitHub. As mensagens saem criptografadas com a chave da equipe: o Pusher só repassa, não guarda nem consegue ler. Quem estiver offline recebe o que faltou quando outro funcionário estiver conectado ao mesmo tempo. Registros da equipe ficam 30 dias (lembretes pendentes ficam até serem concluídos).</div>
          </details>
          <details class="mf-grupo" data-grupo="aparencia" open><summary>Aparência da interface</summary>
            <label class="mf-opc"><input type="radio" name="mf-ui-aparencia" value="nova"><span><b>Nova UI</b><small>Visual moderno, botões principais em destaque, ajuda em ⓘ.</small></span></label>
            <label class="mf-opc"><input type="radio" name="mf-ui-aparencia" value="antiga"><span><b>UI Antiga</b><small>Cores e tamanhos anteriores, com a mesma organização das abas.</small></span></label>
            <div class="mf-tit" style="margin-top:10px">Tema</div>
            <label class="mf-opc"><input type="radio" name="mf-ui-tema" value="claro"><span><b>Modo claro</b><small>Padrão.</small></span></label>
            <label class="mf-opc"><input type="radio" name="mf-ui-tema" value="escuro"><span><b>Modo escuro</b><small>Fundo escuro, mais confortável em ambiente com pouca luz. Só muda as cores; também pelo botão 🌙 do topo.</small></span></label>
            <button id="mf-ui-previsualizar" class="cinza" style="width:100%">Pré-visualizar a outra aparência</button>
          </details>
          <details class="mf-grupo" data-grupo="painel"><summary>Painel, navegação e diagnóstico</summary>
            <label class="mf-opc"><input type="checkbox" id="mf-nav-auto"><span><b>Abrir sozinho a tela necessária</b><small>Busca e Relatórios abrem a Mesa de Crédito; CCBs abrem a Fila de Propostas, pelo menu do próprio sistema.</small></span></label>
            <label class="mf-opc"><input type="checkbox" id="mf-mesa-hoje"><span><b>Mesa de Crédito com as datas de hoje</b><small>Ao abrir a Mesa, a data inicial e a final ficam no dia de hoje. Se você mudar as datas, elas ficam até o fim do dia; no dia seguinte volta para hoje.</small></span></label>
            <button id="mf-pos" class="cinza" style="width:100%" title="Arraste o painel pela barra escura do título; a posição fica salva.">Restaurar posição original do painel</button>
            <div class="mf-info" id="mf-tam-info" style="margin:8px 0 4px"></div>
            <div class="mf-grade">
              <button id="mf-tam-exp" class="cinza" title="760 px de largura e a altura da tela menos 80 px (adaptado à tela)">Tamanho expandido</button>
              <button id="mf-tam-orig" class="cinza" title="Volta exatamente ao tamanho padrão do painel">Restaurar tamanho original</button>
            </div>
            <div class="mf-grade" style="margin-top:8px">
              <button id="mf-fal" class="cinza">Faltantes</button>
              <button id="mf-dbg" class="cinza">Diagnóstico</button>
            </div>
          </details>
        </div>
        <div id="mf-msg"></div>
      </div>
`;
    painel.dataset.ui = cfg('aparencia') === 'antiga' ? 'antiga' : 'nova';   // aparência aplicada antes de mostrar (sem "piscar")
    document.body.appendChild(painel);
    const $ = s => painel.querySelector(s);
    // aviso do painel. Na aba Atendimento (Nova UI) ele fica preso no rodapé e o × o esconde até o próximo aviso
    const msg = t => { const m = $('#mf-msg'); m.classList.remove('mf-msg-fechada'); return (m.textContent = t); };
    $('#mf-msg').addEventListener('click', e => {
      const m = e.currentTarget, r = m.getBoundingClientRect();
      if (painel.dataset.ui === 'nova' && painel.dataset.abaAtiva === 'neg' && e.clientX >= r.right - 30 && e.clientY <= r.top + 30) m.classList.add('mf-msg-fechada');
    });
    const idsDaCaixa = () => $('#mf-lista').value.split(/\s+/).filter(Boolean);

    /* ---------- abas ---------- */
    const mostrarAba = a => {
      if (!['rel', 'ccb', 'cac', 'cta', 'neg', 'his', 'lem', 'tim', 'cfg'].includes(a)) a = 'neg';
      painel.querySelectorAll('[data-pag]').forEach(p => { p.style.display = p.dataset.pag === a ? 'block' : 'none'; });
      painel.querySelectorAll('.mf-abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === a));
      painel.dataset.abaAtiva = a;   // só para o visual (CSS) saber qual aba está aberta
      GM_setValue('abaPainel', a);
    };
    painel.querySelectorAll('.mf-abas button').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
    mostrarAba(GM_getValue('abaPainel', 'neg'));

    /* ---------- posição do painel (arrastar, salvar, restaurar) ---------- */
    const topo = $('.mf-top'), corpo = $('.mf-corpo');
    const aplicarPosicao = p => {
      if (!p) {   // posição original (definida no CSS: canto inferior esquerdo)
        painel.style.left = painel.style.top = painel.style.bottom = '';
        corpo.style.maxHeight = '';
        corpoTamanho(null);
        return null;
      }
      const w = painel.offsetWidth || 340, hTopo = topo.offsetHeight || 42;
      // mantém pelo menos a barra do título dentro da tela (dá para arrastar de volta)
      const left = Math.round(Math.min(Math.max(0, p.left), Math.max(0, window.innerWidth - w)));
      const top = Math.round(Math.min(Math.max(0, p.top), Math.max(0, window.innerHeight - hTopo)));
      painel.style.left = left + 'px';
      painel.style.top = top + 'px';
      painel.style.bottom = 'auto';
      corpo.style.maxHeight = Math.max(140, window.innerHeight - top - hTopo - 40) + 'px';
      corpoTamanho(top);
      return { left, top };
    };
    let arraste = null;
    topo.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, input, select, textarea, a, label, #mf-versao, .mf-badge, #mf-tm-topo')) return;
      const r = painel.getBoundingClientRect();
      arraste = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, id: e.pointerId, moveu: false };
      try { topo.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    topo.addEventListener('pointermove', e => {
      if (!arraste || e.pointerId !== arraste.id) return;
      if (!arraste.moveu && Math.abs(e.clientX - arraste.x0) + Math.abs(e.clientY - arraste.y0) < 4) return;
      arraste.moveu = true;
      painel.classList.add('mf-arrastando');
      aplicarPosicao({ left: e.clientX - arraste.dx, top: e.clientY - arraste.dy });
    });
    const soltar = e => {
      if (!arraste || (e && e.pointerId !== arraste.id)) return;
      const moveu = arraste.moveu;
      arraste = null;
      painel.classList.remove('mf-arrastando');
      try { topo.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moveu) {
        const r = painel.getBoundingClientRect();
        GM_setValue('posPainel', { left: Math.round(r.left), top: Math.round(r.top) });
      }
    };
    topo.addEventListener('pointerup', soltar);
    topo.addEventListener('pointercancel', soltar);
    window.addEventListener('resize', () => ajustarPainel(false));

    /* ---------- tamanho do painel (redimensionar, expandido, restaurar) ----------
       GM 'tamPainel' = { modo: 'personalizado', w, h } | { modo: 'expandido' }; sem a chave = tamanho ORIGINAL (o CSS de sempre,
       nada é sobrescrito). Um tamanho só para as duas aparências. Alças só na direita, embaixo e no canto: o canto superior
       esquerdo (a posição) não se move. A janela menor encolhe o painel só na tela; o valor salvo não muda.
       'tamAmpliado' guarda o último tamanho ampliado, para o botão ⤢ alternar entre o original e ele. */
    const TAM_MIN = { w: 320, h: 300 }, TAM_MAX_W = 1200, TAM_BORDA = 8, TAM_EXP = { w: 760, folgaH: 80 };
    let tamTemp = null;   // tamanho durante o arraste (só é salvo ao soltar)
    const tamSalvo = () => { const t = GM_getValue('tamPainel', null); return t && (t.modo === 'expandido' || (Number.isFinite(t.w) && Number.isFinite(t.h))) ? t : null; };
    function tamLimitar(t) {
      const maxW = Math.max(TAM_MIN.w, Math.min(TAM_MAX_W, window.innerWidth - 2 * TAM_BORDA)), maxH = Math.max(TAM_MIN.h, window.innerHeight - 2 * TAM_BORDA);
      return { w: Math.round(Math.min(Math.max(t.w, TAM_MIN.w), maxW)), h: Math.round(Math.min(Math.max(t.h, TAM_MIN.h), maxH)) };
    }
    // tamanho que vale agora (null = original). Expandido = 760 × (altura da tela − 80), adaptado se a tela não comportar
    function tamEfetivo() {
      if (tamTemp) return tamTemp;
      const t = tamSalvo();
      if (!t) return null;
      return tamLimitar(t.modo === 'expandido' ? { w: TAM_EXP.w, h: window.innerHeight - TAM_EXP.folgaH } : t);
    }
    // largura no painel; altura no corpo (a rolagem interna dos módulos continua no mesmo lugar). Minimizado: largura original
    function aplicarTamanho() {
      const t = GM_getValue('min', false) ? null : tamEfetivo();
      painel.style.width = t ? t.w + 'px' : '';
      painel.classList.toggle('mf-tam-livre', !!t);
      return t;
    }
    function corpoTamanho(top) {
      const t = GM_getValue('min', false) ? null : tamEfetivo();
      if (!t) { corpo.style.height = ''; return; }
      const hTopo = topo.offsetHeight || 42;
      // sempre dentro da tela: na posição original (ancorada embaixo) e na escolhida
      const disponivel = top == null ? window.innerHeight - 60 - hTopo - TAM_BORDA : window.innerHeight - top - hTopo - TAM_BORDA;
      corpo.style.maxHeight = 'none';
      corpo.style.height = Math.max(120, Math.min(t.h - hTopo - 2, disponivel)) + 'px';
    }
    // tamanho + posição: se o tamanho não cabe onde o painel está, ele sobe / vai para a esquerda o mínimo necessário
    function ajustarPainel(salvarPos) {
      const t = aplicarTamanho(), pos = GM_getValue('posPainel', null);
      if (!t || !pos) { aplicarPosicao(pos); tamInfo(); return; }
      const q = aplicarPosicao({ left: Math.min(pos.left, window.innerWidth - t.w - TAM_BORDA), top: Math.min(pos.top, window.innerHeight - t.h - TAM_BORDA) });
      if (salvarPos && q && (q.left !== pos.left || q.top !== pos.top)) GM_setValue('posPainel', q);
      tamInfo();
    }
    function tamInfo() {
      const t = tamSalvo(), e = tamEfetivo();
      const txt = !t ? 'Tamanho: original' : (t.modo === 'expandido' ? 'Tamanho: expandido' : 'Tamanho: personalizado') + (e ? ' (' + e.w + ' × ' + e.h + ' px' + (t.modo !== 'expandido' && (e.w !== t.w || e.h !== t.h) ? ', reduzido para caber nesta janela' : '') + ')' : '');
      const el = $('#mf-tam-info'); if (el) el.textContent = txt + '. Arraste a borda direita, a de baixo ou o canto inferior direito.';
      const b = $('#mf-tam'); if (b) { b.textContent = t ? '⤡' : '⤢'; b.title = t ? 'Voltar ao tamanho original' : 'Ampliar o painel'; }
    }
    function tamDefinir(t, msgTxt) {
      if (t) { GM_setValue('tamPainel', t); GM_setValue('tamAmpliado', t); } else GM_deleteValue('tamPainel');
      if (GM_getValue('min', false)) { GM_setValue('min', false); aplicarMin(false); }
      ajustarPainel(true);
      if (msgTxt) msg(msgTxt);
    }
    const tamAlternar = () => tamSalvo() ? tamDefinir(null, 'Painel no tamanho original.') : tamDefinir(GM_getValue('tamAmpliado', null) || { modo: 'expandido' }, 'Painel ampliado. ⤡ volta ao tamanho original.');
    $('#mf-tam').onclick = tamAlternar;
    $('#mf-tam-exp').onclick = () => tamDefinir({ modo: 'expandido' }, 'Painel no tamanho expandido (760 px × altura da tela − 80 px, adaptado à tela).');
    $('#mf-tam-orig').onclick = () => { GM_deleteValue('tamAmpliado'); tamDefinir(null, 'Painel de volta ao tamanho original.'); };
    // arrastar as alças
    let rz = null, rzQuadro = 0;
    painel.querySelectorAll('.mf-rz').forEach(al => {
      al.addEventListener('pointerdown', e => {
        if (e.button !== 0 || GM_getValue('min', false) || arraste) return;
        e.preventDefault(); e.stopPropagation();
        let r = painel.getBoundingClientRect();
        if (!painel.style.top) {   // posição original (ancorada embaixo): fixa onde está, para o painel crescer para baixo/direita
          const q = aplicarPosicao({ left: r.left, top: r.top });
          if (q) GM_setValue('posPainel', q);
          r = painel.getBoundingClientRect();
        }
        rz = { eixo: al.dataset.rz, x0: e.clientX, y0: e.clientY, w0: r.width, h0: r.height, left: r.left, top: r.top, id: e.pointerId, el: al };
        try { al.setPointerCapture(e.pointerId); } catch (_) {}
        painel.classList.add('mf-redimensionando');
      });
      al.addEventListener('pointermove', e => {
        if (!rz || e.pointerId !== rz.id) return;
        const x = rz.eixo.includes('x') ? rz.w0 + e.clientX - rz.x0 : rz.w0, y = rz.eixo.includes('y') ? rz.h0 + e.clientY - rz.y0 : rz.h0;
        // limites: mínimo, máximo da tela e o espaço até a borda da janela a partir da posição atual (o painel não sai da tela)
        const lim = tamLimitar({ w: x, h: y });
        tamTemp = { w: Math.max(TAM_MIN.w, Math.min(lim.w, window.innerWidth - rz.left - TAM_BORDA)), h: Math.max(TAM_MIN.h, Math.min(lim.h, window.innerHeight - rz.top - TAM_BORDA)) };
        if (!rzQuadro) rzQuadro = requestAnimationFrame(() => { rzQuadro = 0; if (rz) { aplicarTamanho(); corpoTamanho(rz.top); } });
      });
      const fim = e => {
        if (!rz || (e && e.pointerId !== rz.id)) return;
        try { rz.el.releasePointerCapture(rz.id); } catch (_) {}
        rz = null; painel.classList.remove('mf-redimensionando');
        if (tamTemp) { const t = { modo: 'personalizado', w: tamTemp.w, h: tamTemp.h }; tamTemp = null; GM_setValue('tamPainel', t); GM_setValue('tamAmpliado', t); }
        ajustarPainel(false);
      };
      al.addEventListener('pointerup', fim);
      al.addEventListener('pointercancel', fim);
    });
    const canto = $('.mf-rz-c');
    canto.addEventListener('dblclick', tamAlternar);
    // teclado: setas mudam o tamanho (Shift = passo maior)
    canto.addEventListener('keydown', e => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (!d || GM_getValue('min', false)) return;
      e.preventDefault();
      const r = painel.getBoundingClientRect(), passo = e.shiftKey ? 60 : 20;
      if (!painel.style.top) { const q = aplicarPosicao({ left: r.left, top: r.top }); if (q) GM_setValue('posPainel', q); }
      const lim = tamLimitar({ w: r.width + d[0] * passo, h: r.height + d[1] * passo });
      const t = { modo: 'personalizado', w: Math.min(lim.w, Math.max(TAM_MIN.w, window.innerWidth - r.left - TAM_BORDA)), h: Math.min(lim.h, Math.max(TAM_MIN.h, window.innerHeight - r.top - TAM_BORDA)) };
      GM_setValue('tamPainel', t); GM_setValue('tamAmpliado', t);
      ajustarPainel(false);
    });
    ajustarPainel(false);
    $('#mf-pos').onclick = () => {
      GM_deleteValue('posPainel');
      aplicarPosicao(null);
      msg('Painel de volta à posição original.');
    };

    // "completas" = propostas com todos os dados do modo atual; mesma regra no status e na cópia parcial
    // conta só entre as já PROCESSADAS (a proposta em andamento ainda não entra), então nunca passa do número de processadas
    function completas() {
      const f = fila(), fe = new Set(feitas()), ig = ignoradas();
      if (modo() !== 'coleta') {
        const falt = new Set(faltantes().map(x => x.split(' ')[0]));
        return f.filter(id => fe.has(id) && !ig[id] && !falt.has(id)).length;
      }
      const dd = GM_getValue('dados', {});
      return f.filter(id => fe.has(id) && !ig[id] && completo(dd[id])).length;
    }

    function atualizarUI() {
      const total = fila().length;
      const pend = pendentes().length;
      const f = total - pend;
      const nIg = Object.keys(ignoradas()).filter(id => fila().includes(id)).length;
      let st;
      if (executando) st = 'Rodando: ' + f + ' de ' + total + ' processadas · ' + completas() + ' completas' + (atual ? ' (em andamento: ' + atual + (etapaAtual ? ' · ' + etapaAtual : '') + ')' : '');
      else if (!total) st = 'Pronto';
      else if (!pend) st = 'Concluído: ' + f + ' de ' + total;
      else st = 'Parado: ' + f + ' de ' + total + ' coletadas';
      if (total && nIg) st += ' · ' + nIg + ' ignorada' + (nIg > 1 ? 's' : '');
      $('#mf-st').textContent = st;
      $('#mf-prog').style.width = (total ? Math.round(f / total * 100) : 0) + '%';
      $('#mf-qtd').textContent = idsDaCaixa().length ? '(' + idsDaCaixa().length + ')' : '';
      $('#mf-ini').disabled = executando;
      $('#mf-par').disabled = !executando;
      $('#mf-cont').disabled = executando || !pend || !total;
      $('#mf-tela').disabled = executando;
      $('#mf-res').disabled = false;
    }

    // minimizado = só a barra do título (com nome e versão); nenhum outro elemento fica visível
    const aplicarMin = m => {
      $('.mf-corpo').style.display = m ? 'none' : 'block';
      painel.classList.toggle('mf-min', !!m);
      aplicarTamanho(); corpoTamanho(painel.style.top ? parseFloat(painel.style.top) : null);   // minimizado: só a barra, na largura original
      $('#mf-min').textContent = m ? '+' : '—';
      $('#mf-min').title = m ? 'Expandir' : 'Minimizar';
    };
    // ao expandir: se o painel ficou (parcial ou totalmente) fora da tela, sobe para dentro dela e salva a nova posição;
    // se já cabe, a posição não muda. Só se aplica à posição escolhida pelo usuário (a original já cresce para cima).
    const trazerParaTela = () => {
      if (tamEfetivo()) return ajustarPainel(true);   // tamanho escolhido: o mesmo ajuste do redimensionar
      if (!painel.style.top) return;
      corpo.style.maxHeight = '';   // mede o painel no tamanho natural (o limite antigo foi calculado para a posição minimizada)
      const r = painel.getBoundingClientRect(), MARGEM = 8;
      if (r.top >= 0 && r.bottom <= window.innerHeight - MARGEM / 2) { aplicarPosicao({ left: r.left, top: r.top }); return; }
      const topo2 = r.height >= window.innerHeight - 2 * MARGEM ? MARGEM : Math.max(MARGEM, window.innerHeight - r.height - MARGEM);
      const q = aplicarPosicao({ left: r.left, top: topo2 });
      if (q) GM_setValue('posPainel', q);
    };
    $('#mf-min').onclick = () => { const m = !GM_getValue('min', false); GM_setValue('min', m); aplicarMin(m); if (!m) trazerParaTela(); };
    aplicarMin(GM_getValue('min', false));
    let toquesVersao = 0, resetToquesVersao = null;
    $('#mf-versao').addEventListener('click', () => {
      toquesVersao++;
      clearTimeout(resetToquesVersao);
      resetToquesVersao = setTimeout(() => { toquesVersao = 0; }, 5000);
      if (toquesVersao === 7) {
        toquesVersao = 0;
        msg('/*\nVocê encontrou uma mensagem secreta. *\nEsse projeto começou como uma tentativa de automatizar\nalgumas tarefas e acabou virando tudo isso. *\nFeito por Arthur, na base da curiosidade e da persistência.\n© 2026 */');
      }
    });

    /* ---------- canceladas e testes ---------- */
    // texto de cada célula separado: tr.textContent junta as células sem espaço ("16:04TESTEMASTER"),
    // e aí "\bteste\b" não casava — por isso a 4336 (cliente "TESTE") passava pelo filtro.
    const celulas = tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim());
    // teste: qualquer célula com a PALAVRA "teste"/"testes" (cliente "TESTE", "PROPOSTA DE TESTE"...), em qualquer situação
    const ehTeste = cels => [].concat(cels).some(c => /\btestes?\b/i.test(String(c || '')));
    const motivoIgnorar = cels => {
      if ([].concat(cels).some(c => /cancelad/i.test(String(c || '')))) return 'cancelada';
      if (ehTeste(cels)) return 'teste';
      return null;
    };
    const ehConfCad = txt => /\bCONF\s*CAD\b/i.test(txt || '');         // situação "20 - CONF CAD": proposta em digitação, não concluída
    // Relatório Diário com a visão geral do dia (cfg 'diarioTudo'): canceladas e em digitação (CONF CAD) entram, como na
    // planilha do Diário; só as propostas de teste ficam fora. Os outros relatórios e a Auditoria não mudam.
    const diarioTudo = () => $('#mf-modo').value === 'valortransacao' && cfg('diarioTudo');
    const motivoFora = cels => (diarioTudo() ? (ehTeste(cels) ? 'teste' : null) : motivoIgnorar(cels));

    /* ---- telas do sistema que algumas funções precisam (ver "NAVEGAÇÃO AUTOMÁTICA" no fim) ---- */
    const TELAS = {
      // (enquanto o painel aplica as datas do dia, a lista ainda é a padrão do sistema: espera a nova)
      // recusa: o ER abriu a tela com um aviso no lugar da lista (ex.: conta que não é aprovadora da Mesa)
      mesa: { nome: 'Mesa de Crédito', menu: 'MesaCredito', pronta: () => !!document.querySelector('#tabMesaCreditoLista') && !mesaFiltrando,
        recusa: () => { const pr = document.querySelector('#divPrincipal'); const m = pr && pr.textContent.replace(/\s+/g, ' ').match(/Aprovador\s+\S+\s+n[ãa]o\s+cadastrad[oa]/i); return m ? m[0] : ''; } },
      fila: { nome: 'Fila de Propostas', menu: 'FilaPropostas', pronta: () => !!document.querySelector('#tabPropostasLista, #txtPropostasPesquisa') },
    };
    // por que a tela não vai abrir ('' = ainda pode abrir): sessão vencida ou aviso do ER no lugar da lista
    const telaRecusada = tela => {
      if (erAvisoSessaoNaTela()) return 'A sessão do ER expirou. Entre no ER de novo e tente outra vez.';
      const r = tela.recusa ? tela.recusa() : '';
      return r ? 'A ' + tela.nome + ' não abriu: o ER respondeu "' + r + '". Esta conta não usa a ' + tela.nome + '; entre com a conta da Mesa (Trocar de conta) e tente de novo.' : '';
    };
    let navOcupado = false;
    let mesaFiltrando = false;   // a Mesa está sendo refiltrada com as datas do dia (ver MESA DE CRÉDITO: DATAS DO DIA)
    async function irParaTela(t) {
      const tela = TELAS[t];
      if (tela.pronta()) return true;
      if (!cfg('navAuto')) { msg('Abra a ' + tela.nome + ' pelo menu do sistema (ou ligue "Abrir sozinho a tela necessária" em Configurações).'); return false; }
      if (navOcupado) return false;
      if (document.querySelector('#txtSenha, input[type=password]:not(#mf-p input)') && !document.querySelector('#divNomeCliente')) { msg('Entre no sistema antes (tela de login).'); return false; }
      const rx = new RegExp("MostraConsulta\\(\\s*['\"]" + tela.menu + "['\"]\\s*\\)");
      const link = [...document.querySelectorAll('a[onclick]')].find(a => !painel.contains(a) && rx.test(a.getAttribute('onclick') || ''));
      if (!link) { msg('Não achei "' + tela.nome + '" no menu do sistema nesta página (a conta tem acesso a ela?). Abra a tela pelo menu e tente de novo.'); return false; }
      navOcupado = true;
      msg('Abrindo a ' + tela.nome + ' (menu do sistema)…');
      try {
        // a mesma chamada do onclick do menu; o link (href=".") não é seguido, para a página não recarregar
        if (typeof PAGINA.MostraConsulta === 'function') PAGINA.MostraConsulta(tela.menu);
        else link.click();
        const ate = Date.now() + 25000;
        while (!tela.pronta() && Date.now() < ate) {
          const recusa = telaRecusada(tela);
          if (recusa) { msg(recusa); return false; }
          await sleep(250);
        }
        if (!tela.pronta()) { msg('A ' + tela.nome + ' não abriu a tempo. Abra pelo menu do sistema e tente de novo.'); return false; }
        await sleep(300);   // espera a tela terminar de carregar a lista
        const ate2 = Date.now() + 10000;
        while (Date.now() < ate2 && PAGINA.jQuery && PAGINA.jQuery.active > 0) await sleep(250);
        msg(tela.nome + ' aberta.');
        return true;
      } finally { navOcupado = false; }
    }

    /* ---------- leitura da tela ---------- */
    let confCadIgnoradas = 0;   // propostas "20 - CONF CAD" (em digitação) deixadas de fora na última leitura
    let canceladasTestesIgnoradas = 0;
    function lerTela(ignorarCanc) {
      const ids = [];
      confCadIgnoradas = 0; canceladasTestesIgnoradas = 0;

      // 1) Tabela da Mesa de Crédito (#tabMesaCreditoLista): o número da proposta vem do
      //    onclick da célula, ex.: objMesaCredito.DetalheProposta('4672')
      document.querySelectorAll('#tabMesaCreditoLista tbody tr').forEach(tr => {
        if (painel.contains(tr)) return;
        const cels = celulas(tr);
        if (ehConfCad(cels.join(' | '))) { confCadIgnoradas++; return; }   // em digitação: nunca entra
        if (ignorarCanc && motivoIgnorar(cels)) { canceladasTestesIgnoradas++; return; }
        const td = tr.querySelector('td[onclick*="DetalheProposta"]');
        const m = td && (td.getAttribute('onclick') || '').match(/DetalheProposta\(\s*['"]?(\d+)/);
        if (m) ids.push(m[1]);
      });
      if (ids.length) return [...new Set(ids)];

      // 2) Reserva (lógica anterior): primeira célula só com 3 a 8 dígitos em qualquer linha
      confCadIgnoradas = 0; canceladasTestesIgnoradas = 0;
      document.querySelectorAll('tr').forEach(tr => {
        if (painel.contains(tr)) return;
        const c = [...tr.querySelectorAll('td')]
          .find(td => /^\d{3,8}$/.test(td.textContent.replace(/\s+/g, '')));
        if (!c) return;
        const cels = celulas(tr);
        if (ehConfCad(cels.join(' | '))) { confCadIgnoradas++; return; }
        if (ignorarCanc && motivoIgnorar(cels)) { canceladasTestesIgnoradas++; return; }
        ids.push(c.textContent.replace(/\s+/g, ''));
      });
      if (!ids.length) {
        document.querySelectorAll('a').forEach(a => {
          if (painel.contains(a)) return;
          const tr = a.closest('tr');
          if (ignorarCanc && tr && motivoIgnorar(celulas(tr))) return;
          const t = a.textContent.replace(/\s+/g, '');
          if (/^\d{4,8}$/.test(t)) ids.push(t);
        });
      }
      return [...new Set(ids)];
    }

    /* ---------- relatórios (ordem das colunas dos slides) ---------- */
    const modo = () => $('#mf-modo').value;
    $('#mf-modo').value = GM_getValue('modo', 'coleta');
    if (!$('#mf-modo').value) $('#mf-modo').value = 'coleta';

    /* ---------- formatos de cópia ---------- */
    // est = como a cópia é montada: 'p' parágrafos, 'xl' estilo Excel, 'br', 'div', 'p2col', 'tsv' texto tabulado
    const FORMATOS = {
      canva:     { rot: 'Tabela com parágrafos (Canva)', est: 'p' },
      excel:     { rot: 'Excel (texto com tabulação)', est: 'tsv' },
      canvaxl:   { rot: 'Tabela estilo Excel', est: 'xl', antigo: true },
      canvabr:   { rot: 'Tabela com quebra br', est: 'br', antigo: true },
      canvadiv:  { rot: 'Tabela com blocos div', est: 'div', antigo: true },
      canva2col: { rot: 'Valor e quantidade em 2 colunas', est: 'p2col', antigo: true, so: 'reprovadas' },
      sheets:    { rot: 'Google Sheets (texto com tabulação)', est: 'tsv', antigo: true },
    };
    const MODOS = ['coleta', 'reprovadas', 'efetivadas', 'aprovadas', 'valortransacao', 'rendas'];
    // formato automático: cada modo usa o mais adequado ao destino
    const FORMATO_AUTO = { coleta: 'excel', reprovadas: 'canva', efetivadas: 'canva', aprovadas: 'canva', valortransacao: 'excel', rendas: 'excel' };
    const NOME_MODO = { coleta: 'Auditoria', reprovadas: 'Reprovadas', efetivadas: 'Efetivadas', aprovadas: 'Aprovadas', valortransacao: 'Diário', rendas: 'Rendas' };
    const formatoValido = (m, k) => {
      const f = FORMATOS[k];
      return !!f && (!f.antigo || cfg('formatosAntigos')) && (!f.so || f.so === m);
    };
    // Automático ligado: formato do modo. Desligado: a escolha manual DAQUELE modo (guardada por modo,
    // então mudar um relatório não altera os outros); escolha vazia ou indisponível = formato automático.
    const formatoDoModo = m => {
      if (cfg('formatoAuto')) return FORMATO_AUTO[m] || 'canva';
      const esc = (GM_getValue('formatoPorModo', {}) || {})[m];
      return esc && formatoValido(m, esc) ? esc : FORMATO_AUTO[m] || 'canva';
    };
    const estilo = () => FORMATOS[formatoDoModo(modo())].est;

    // um seletor por modo de relatório, sempre visível; desabilitado enquanto o automático estiver ligado
    function montarFormatos() {
      const caixa = $('#mf-formatos');
      caixa.innerHTML = '';
      const auto = cfg('formatoAuto');
      MODOS.forEach(m => {
        const lin = document.createElement('label');
        lin.className = 'mf-fmt';
        const rot = document.createElement('span');
        rot.textContent = NOME_MODO[m];
        const sel = document.createElement('select');
        sel.dataset.modo = m;
        Object.entries(FORMATOS).forEach(([k, f]) => {
          if (!formatoValido(m, k)) return;
          const o = document.createElement('option');
          o.value = k;
          o.textContent = f.rot + (k === FORMATO_AUTO[m] ? ' (padrão)' : '');
          sel.appendChild(o);
        });
        sel.value = formatoDoModo(m);
        sel.disabled = auto;
        sel.addEventListener('change', () => {
          const pm = GM_getValue('formatoPorModo', {}) || {};
          pm[m] = sel.value;
          GM_setValue('formatoPorModo', pm);
          atualizarConfigUI();
        });
        lin.append(rot, sel);
        caixa.appendChild(lin);
      });
      $('#mf-formato-dica').textContent = auto
        ? 'Desative o formato automático para escolher o formato de cada relatório.'
        : 'Cada relatório usa o formato escolhido acima.' + (cfg('formatosAntigos') ? '' : ' Marque "Mostrar formatos antigos" para ver as demais opções.');
    }

    function atualizarConfigUI() {
      const m = modo();
      montarFormatos();
      $('#mf-formato-info').textContent = '· ' + FORMATOS[formatoDoModo(m)].rot + (cfg('formatoAuto') ? ' (auto)' : '');
      const coleta = m === 'coleta';
      $('#mf-colr').style.display = coleta ? '' : 'none';
      const diario = m === 'valortransacao';
      $('#mf-diario').style.display = diario ? '' : 'none';
      $('#mf-diario-saida').value = GM_getValue('diarioSaida', 'completo');
      $('#mf-dlin').style.display = diario && $('#mf-diario-saida').value === 'completo' ? '' : 'none';
      $('#mf-dval').style.display = diario ? '' : 'none';
      $('#mf-cop').style.display = diario ? 'none' : '';
      $('#mf-cid').style.display = diario || m === 'rendas' ? 'none' : '';
      $('#mf-cfull').style.display = coleta && cfg('auditoriaCompleta') ? '' : 'none';
      // Relatório Diário com a visão geral do dia: canceladas e em digitação entram; só os testes ficam fora (ver motivoFora)
      const ign = cfg('ignorarCanceladasTestes');
      $('#mf-filtro').textContent = !ign ? 'Incluindo canceladas e testes' : diarioTudo() ? 'Incluindo canceladas (sem testes)' : 'Ignorando canceladas e testes';
      $('#mf-filtro').title = ign && diarioTudo() ? 'Relatório Diário: visão geral do dia (Configurações). Entram canceladas e em digitação (CONF CAD); propostas de teste continuam fora.' : '';
    }
    $('#mf-modo').addEventListener('change', () => { GM_setValue('modo', modo()); atualizarConfigUI(); });
    const ligarOpcao = (sel, chave) => {
      $(sel).checked = cfg(chave);
      $(sel).addEventListener('change', () => { GM_setValue(chave, $(sel).checked); atualizarConfigUI(); });
    };
    ligarOpcao('#mf-audit-full', 'auditoriaCompleta');
    ligarOpcao('#mf-canc', 'ignorarCanceladasTestes');
    ligarOpcao('#mf-diario-tudo', 'diarioTudo');
    ligarOpcao('#mf-rendas-repr', 'rendasReprovadas');
    ligarOpcao('#mf-auto-copia', 'copiarAoConcluir');
    ligarOpcao('#mf-formato-auto', 'formatoAuto');
    ligarOpcao('#mf-formatos-antigos', 'formatosAntigos');
    ligarOpcao('#mf-troca-direta', 'trocaSemConfirmacao');
    ligarOpcao('#mf-login-auto', 'loginAuto');
    ligarOpcao('#mf-aba-cliente', 'lerAbaCliente');
    // saída do Relatório Diário: preferência só deste modo
    $('#mf-diario-saida').addEventListener('change', () => { GM_setValue('diarioSaida', $('#mf-diario-saida').value); atualizarConfigUI(); });
    const gruposAbertos = GM_getValue('gruposCfg', {}) || {};
    painel.querySelectorAll('.mf-grupo').forEach(g => {
      if (g.dataset.grupo in gruposAbertos) g.open = !!gruposAbertos[g.dataset.grupo];
      g.addEventListener('toggle', () => { const x = GM_getValue('gruposCfg', {}) || {}; x[g.dataset.grupo] = g.open; GM_setValue('gruposCfg', x); });
    });
    atualizarConfigUI();
    GM_deleteValue('urlVideoAjuda');   // o tutorial do YouTube saiu do painel: limpa o link que ficou salvo

    const FILTROS = {
      reprovadas: sit => /\brep\b|reprov/i.test(sit),
      efetivadas: sit => /efetivad/i.test(sit) && !/n[ãa]o\s+efetivad/i.test(sit),
      aprovadas: sit => /\bapr\b|aprov/i.test(sit) && !/efetivad/i.test(sit),   // "APR", "06 - APROV MAN", "APROVADA"
      valortransacao: () => true,   // todas as propostas da lista
      // Rendas: aprovadas e efetivadas (têm o cálculo de renda do birô no motor); reprovadas só se ligado em Configurações.
      // Pendentes e canceladas nunca entram.
      rendas: sit => !/cancelad/i.test(sit) && (/efetivad|\bapr\b|aprov/i.test(sit) || (cfg('rendasReprovadas') && ehReprovada(sit))),
    };

    // lê as linhas da Mesa de Crédito achando as colunas pelo NOME do cabeçalho
    function lerLinhas() {
      const t = document.querySelector('#tabMesaCreditoLista');
      if (!t) return [];
      const ths = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase());
      const col = n => ths.findIndex(x => x.startsWith(n));
      const ci = { id: col('proposta'), sit: col('situa'), dh: col('data/hora'), cli: col('cliente'), ana: col('analista'), loja: col('pto'),
        acoes: col('aç'), ind: col('indicador'), dts: col('dt situa') >= 0 ? col('dt situa') : col('data/situa'), prod: col('produto') };
      const out = [];
      t.querySelectorAll('tbody tr').forEach(tr => {
        const c = celulas(tr);
        const id = (c[ci.id] || '').replace(/\D/g, '');
        if (!id) return;
        out.push({ id, sit: c[ci.sit] || '', dh: c[ci.dh] || '', cli: c[ci.cli] || '', ana: c[ci.ana] || '', loja: c[ci.loja] || '',
          acoes: c[ci.acoes] || '', ind: c[ci.ind] || '', dts: c[ci.dts] || '', prod: c[ci.prod] || '', cels: c, texto: c.join(' | ') });
      });
      return out;
    }
    // o que fica guardado da tabela (sem o texto da linha inteira)
    const metaDe = l => ({ id: l.id, sit: l.sit, dh: l.dh, cli: l.cli, ana: l.ana, loja: l.loja, acoes: l.acoes, ind: l.ind, dts: l.dts, prod: l.prod });

    const hora = s => (String(s || '').match(/(\d{1,2}:\d{2})\s*$/) || [])[1] || '';
    const lojaNome = s => String(s || '').replace(/^.*?\s-\s/, '').trim();       // "XPANSE NEGOCIOS LTDA - GRAND PLAZA" -> "GRAND PLAZA"
    const titulo = s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
    const cel = s => (/[\n\t"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const aNum = v => Number(String(v).replace(',', '.'));
    const moeda = v => {
      const [i, dec] = String(v).split(',');
      return 'R$' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + ((dec || '0') + '00').slice(0, 2);
    };
    // valor de transação: o "Valor da Compra" da Operação de Crédito (extra.compra). O "Valor" do bloco Garantias
    // (extra.valor) é o valor cadastrado do aparelho, e nas aprovações automáticas vem simbólico (R$ 0,01, R$ 1,00...):
    // só é usado quando a página não tem Valor da Compra
    const valorTransacao = e => {
      if (!e) return null;
      return e.compra ? String(e.compra).replace(/^R\$\s*/, 'R$') : e.valor || null;
    };

    // lê a mensagem do MobFacil, ex.:
    //  "(P1) Reprovar: renda inferior a mínima permitida (1621 reais) (atual=R$1300)"   -> Renda, R$1300
    //  "(P1) Reprovar: cliente abaixo do ponto de corte (score=351)"                    -> Score, 351
    //  "(P1) Reprovar: valor de restrições acima do limite permitido (R$4000) (atual=R$10223,77)" -> Restrições, R$10223,77
    function motivoDoMobFacil(reprov) {
      const primeira = String(reprov || '').split(' ¦ ')[0];
      const m = primeira.match(/Reprovar\s*:\s*(.*)$/i);
      if (!m) return null;
      const corpo = m[1].trim();
      const atual = ((corpo.match(/(?:atual|score)\s*=\s*([^)]+)/i) || [])[1] || '').trim();
      const descr = corpo.replace(/\s*\(.*$/, '').trim();
      let label;
      if (/renda/i.test(descr)) label = 'Renda';
      else if (/restri|pend|negativ/i.test(descr)) label = 'Restrições';
      else if (/score|ponto de corte/i.test(corpo)) label = 'Score';
      else if (/idade/i.test(descr)) label = 'Idade';
      else label = descr.charAt(0).toUpperCase() + descr.slice(1);
      return { label, atual, descr };
    }
    const ehReprovada = sit => /\brep\b|\brepr\b|reprov/i.test(String(sit || ''));
    // Motivo de reprovação (coluna R).
    // 1) Mensagem do MobFacil (fonte primária; mantém a ordem e junta "valor" + "quantidade" num motivo só, como na planilha).
    // 2) Sem mensagem: cortes do CONFIG (só quando a situação é reprovada ou desconhecida).
    // Situação conhecida e NÃO reprovada (efetivada, aprovada, cancelada): vazio, como no modelo.
    // "Divergência Documentação" / "Erro de Digitação" não dá para saber pelos dados: fica à mão.
    const motivoColunaR = (d, mt) => {
      if (!d) return '';
      const sit = mt && mt.sit;
      if (sit && !ehReprovada(sit)) return '';
      if (d.reprov) {
        const reais = [];
        let posRestr = -1, temValor = false, temQtd = false;
        String(d.reprov).split(' ¦ ').map(motivoDoMobFacil).filter(Boolean).forEach(mf => {
          if (/restri|pend|negativ/i.test(mf.descr) && /quantidade|qtd|valor/i.test(mf.descr)) {
            if (/quantidade|qtd/i.test(mf.descr)) temQtd = true; else temValor = true;
            if (posRestr < 0) { posRestr = reais.length; reais.push(null); }
            return;
          }
          if (/renda/i.test(mf.descr)) return reais.push('Renda');
          if (/idade/i.test(mf.descr)) return reais.push('Idade');
          if (/score|ponto de corte/i.test(mf.descr)) return reais.push('Score Baixo');
          const t = (mf.descr || mf.label).replace(/\bcpf\b/gi, 'CPF');
          reais.push(t.charAt(0).toUpperCase() + t.slice(1));
        });
        if (posRestr >= 0) {
          reais[posRestr] = temValor && temQtd ? 'Valor e quantidade de restrições acima do limite'
            : temValor ? 'Valor de restrições acima do limite' : 'Quantidade de restrições acima do limite';
        }
        if (reais.length) return [...new Set(reais)].join(' / ');
      }
      // proposta sem reprovação na mensagem e situação desconhecida: usa os cortes (comportamento anterior)
      const val = d.val != null ? aNum(d.val) : null;
      const qtd = d.qtd != null ? aNum(d.qtd) : null;
      const sc = d.score != null ? aNum(d.score) : null;
      const v = val != null && val > CONFIG.CORTE_VALOR;
      const q = qtd != null && qtd > CONFIG.CORTE_QTD;
      const motivos = [];
      if (v && q) motivos.push('Valor e quantidade de restrições acima do limite');
      else if (v) motivos.push('Valor de restrições acima do limite');
      else if (q) motivos.push('Quantidade de restrições acima do limite');
      if (sc != null && sc < CONFIG.CORTE_SCORE) motivos.push('Score Baixo');
      return motivos.join(' / ');
    };
    const fmtAtual = a => (/^R\$/.test(a) && num(a) != null ? moeda(num(a)) : a);

    /* ---------- modelo "Auditoria 2 Completo" (colunas A a R) ---------- */
    const COLUNAS_AUDITORIA = ['Proposta', 'Nome', 'CPF', 'IMEI', 'Quantidade Restritivos', 'Valor dos Restritivos', 'Score',
      'Quantidade de Consultas', 'Número', 'E-mail', 'Data da Proposta', 'Valor da compra', 'Valor entrada', 'Loja', 'Vendedor',
      'Situação', 'Manual/Auto', 'Motivo Reprovação'];
    const situacaoLimpa = s => String(s || '').replace(/^\s*\d+\s*-\s*/, '').trim();          // "17 - PRE PROP REP" -> "PRE PROP REP"
    const dataDe = s => (String(s || '').match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || '';
    const valorCompra = v => (v ? String(v).replace(/^R\$\s*/, 'R$ ') : '');
    // Valor entrada (coluna M) em percentual, como no modelo (ex.: 37,51%): o da página, ou entrada ÷ valor da compra
    // Valor entrada (coluna M) em percentual, como no modelo: o percentual que a própria página mostra ("(20,00 %)");
    // sem ele, entrada ÷ valor da compra
    const percentualEntrada = e => {
      if (e.entradaPct) return e.entradaPct;
      const en = e.entrada ? aNum(num(e.entrada)) : NaN, co = e.compra ? aNum(num(e.compra)) : NaN;
      if (!(en >= 0) || !(co > 0)) return '';
      return (en / co * 100).toFixed(2).replace('.', ',') + '%';
    };
    // Manual/Auto: mesma regra do relatório de Reprovadas (analista MASTER = automática); textos como no modelo
    const manualAuto = mt => {
      if (!mt || !mt.sit) return '';
      const manual = !!mt.ana && !/master/i.test(mt.ana);
      if (ehReprovada(mt.sit)) return manual || /\bman\b/i.test(mt.sit) ? 'Reprovado manual' : 'Reprovação Automática';
      if ((/efetivad|\bapr\b|aprov/i.test(mt.sit)) && (manual || /\bman\b/i.test(mt.sit))) return 'Aprovado manual';
      return '';
    };
    // N/A: o campo foi procurado (proposta já processada) e não existe. Vazio: ainda não processada, ou a busca
    // falhou (ex.: a aba Cliente não carregou) — aí aparece em Faltantes com o motivo, em vez de virar N/A.
    const NA = 'N/A';
    function linhaCompleta(id, d, mt, e, processada) {
      d = d || {}; mt = mt || null; e = e || {};
      const m = mt || {};
      const v = x => (x != null && String(x).trim() !== '' ? String(x) : processada ? NA : '');
      // contato só vale se a aba Cliente for da mesma pessoa (CPF da aba = CPF do motor)
      const cpfConfere = !e.cpfCliente || !d.cpf || e.cpfCliente === d.cpf;
      const contato = x => (!processada ? (x || '') : e.abaCliente === false || !cpfConfere ? '' : v(x));
      return [
        id,                              // A Proposta
        v(m.cli || e.clienteAba || e.cliente),   // B Nome
        v(d.cpf),                        // C CPF
        v(e.imei),                       // D IMEI
        v(d.qtd), v(d.val), v(d.score), v(d.consultas),   // E–H crédito
        contato(e.telefone),             // I Número (aba Cliente: Telefone 1)
        contato(e.email),                // J E-mail (aba Cliente)
        v(dataDe(m.dh)),                 // K Data da Proposta
        v(valorCompra(e.compra || e.valor)),   // L Valor da compra
        v(percentualEntrada(e)),         // M Valor entrada (%)
        v(m.loja),                       // N Loja
        v(e.vendedor),                   // O Vendedor
        v(situacaoLimpa(m.sit)),         // P Situação
        manualAuto(mt),                  // Q Manual/Auto (vazio é regra do modelo, não falta de dado)
        motivoColunaR(d, mt),            // R Motivo Reprovação (vazio = não reprovada)
      ];
    }

    function relatorioCols(m, id, d, processada) {
      const na = t => (t ? t : processada ? NA : '');   // procurado e não encontrado = N/A
      const x = GM_getValue('meta', {})[id] || {};
      const e = GM_getValue('extra', {})[id] || {};
      const hh = hora(x.dh);
      const loja = lojaNome(x.loja);
      let cols;
      if (m === 'reprovadas') {
        const tipo = x.ana && !/master/i.test(x.ana) ? 'Manual' : 'Automática';
        // uma mensagem por motivo de reprovação (o MobFacil lista TODOS os que falharam, ex.: valor E quantidade)
        const msgs = d && d.reprov ? String(d.reprov).split(' ¦ ').map(motivoDoMobFacil).filter(Boolean) : [];
        const motivo = [...new Set(msgs.map(x => x.label))].join(' / ');
        const partes = [];
        msgs.forEach(mf => {
          let t;
          if (mf.label === 'Restrições' && /quantidade|qtd/i.test(mf.descr)) {
            const q = aNum(mf.atual);
            t = isNaN(q) ? '' : q + ' restrições';
          } else if (mf.label === 'Score') {
            t = String(mf.atual || (d.score != null ? d.score : '')).replace(/,0+$/, '');
          } else {
            t = fmtAtual(mf.atual);   // valor das restrições, renda, idade...
          }
          if (t && !partes.includes(t)) partes.push(t);
        });
        let det = partes.join('\n');   // sem mensagem do MobFacil: Motivo em branco e N/A (não inventa)
        if (!String(det).trim()) det = 'N/A';
        if (estilo() === 'p2col') cols = [id, hh, titulo(loja), tipo, motivo, partes[0] || 'N/A', partes.slice(1).join(' ')];
        else cols = [id, hh, titulo(loja), tipo, motivo, det];
      } else if (m === 'valortransacao') {
        const vt = valorTransacao(e);
        const nv = vt ? num(vt) : null;                                   // "R$1.864,00" -> "1864,00" (Excel pt-BR)
        cols = [na(nv ? nv.split(',')[0] + ',' + (((nv.split(',')[1] || '') + '00').slice(0, 2)) : '')];
      } else if (m === 'rendas') {
        // planilha "Rendas informadas": A Data da proposta · B Proposta · C Nome · D CPF · E Renda informada · F Renda birô · G % proximidade.
        // G % proximidade (menor ÷ maior), a mesma conta da fórmula da planilha: vazia se faltar renda ou for 0.
        // Renda ausente = vazio (nunca "N/A").
        const dd = d || {};
        const ri = dd.rendaInf ? aNum(dd.rendaInf) : NaN, rb = dd.rendaBiro ? aNum(dd.rendaBiro) : NaN;
        const prox = ri > 0 && rb > 0 ? (Math.min(ri, rb) / Math.max(ri, rb) * 100).toFixed(2).replace('.', ',') + '%' : '';
        cols = [dataDe(x.dh), id, na(x.cli || dd.nome), na(dd.cpf), dd.rendaInf || '', dd.rendaBiro || '', prox];
      } else if (m === 'efetivadas') {
        cols = [id, na(x.cli), na(e.vendedor), '', na(hh), na(loja.toUpperCase())];   // Acesso ao APP: à mão (fica vazio)
      } else {
        const c = d && d.cpf ? d.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
        cols = [id, na(x.cli), na(c), 'XPANSE - ' + loja.toUpperCase(), na(e.vendedor), na(valorTransacao(e)), 'Aprovada, não efetivada'];
      }
      return cols;
    }

    // tabela HTML: o Canva/Excel/Sheets mantêm cada coluna separada e a quebra de linha dentro da célula (valor em cima, quantidade embaixo)
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // a quebra de linha dentro da célula muda conforme o estilo:
    // 'br' = <br>; 'p' = um parágrafo por linha; 'div' = um bloco por linha
    const celulaHtml = (c, est) => {
      const ls = String(c).split('\n');
      if (est === 'xl') return ls.map(esc).join('<br style="mso-data-placement:same-cell;">');
      if (est === 'p' || est === 'div') return ls.map(l => '<' + est + '>' + esc(l) + '</' + est + '>').join('');
      return ls.map(esc).join('<br>');
    };
    const htmlTabela = (linhas, est) => '<table border="1" cellspacing="0" cellpadding="4">' + linhas.map(cols =>
      '<tr>' + cols.map(c => '<td>' + celulaHtml(c, est) + '</td>').join('') + '</tr>').join('') + '</table>';

    /* ---------- detalhe da proposta (Vendedor, Valor, IMEI, Cliente, Situação, contato e entrada) ---------- */
    // "R$ 360,00 (20,00 %)" -> "R$ 360,00" e "20,00%"
    const dinheiro = t => { const m = String(t || '').match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/); return m ? 'R$ ' + m[1] : null; };
    const pctDe = t => {
      const m = String(t || '').match(/\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/) || String(t || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (!m) return null;
      const n = Number(m[1].replace(',', '.'));
      return isNaN(n) ? null : n.toFixed(2).replace('.', ',') + '%';
    };
    // "(11) 91437-7547" / "(11) 973546966 - " / "+55 11 ..." -> "(11) 973546966" (formato da planilha); "() -" = vazio
    const fmtTelefone = t => {
      let d = String(t).replace(/\D/g, '');
      if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
      return d.length === 10 || d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2) : null;
    };
    // telefone brasileiro informado pelo funcionário: valida DDD e celular (9 dígitos começando por 9) e devolve no
    // formato que a planilha já usa, "(11) 921539364". '' = não é um telefone válido (o texto digitado não é alterado).
    const telDigitos = t => {
      let d = String(t || '').replace(/\D/g, '');
      if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
      if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1);
      if (!(d.length === 10 || d.length === 11) || !/^[1-9][1-9]/.test(d)) return '';
      if (d.length === 11 && d[2] !== '9') return '';
      if (d.length === 10 && !/[2-5]/.test(d[2])) return '';   // fixo: 2 a 5 (celular antigo sem o 9 não é aceito)
      return d;
    };
    const telFormatar = t => { const d = telDigitos(t); return d ? '(' + d.slice(0, 2) + ') ' + d.slice(2) : ''; };
    // telefones escritos num texto livre (ex.: observações antigas dos lembretes), sem confundir com CPF, valores ou datas
    const telExtrair = t => {
      const achados = [];
      const txt = String(t || '');
      txt.replace(/(?<![\d.,\/-])(?:\+?55[\s.-]?)?(?:\(\s*0?[1-9][1-9]\s*\)|0?[1-9][1-9])[\s.-]?9?\d{4}[\s.-]?\d{4}(?![\d.,\/-]*\d)/g, (m, pos) => {
        if (/cpf\W{0,6}$/i.test(txt.slice(Math.max(0, pos - 12), pos))) return m;   // "CPF 11912345678" não é telefone
        const f = telFormatar(m); if (f && !achados.includes(f)) achados.push(f); return m;
      });
      return achados;
    };
    const DETALHES = ['/MesaCredito/MesaAnaliseProposta?lngProposta=', '/MesaCredito/DetalheProposta?lngProposta='];
    const proprio = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    const normRot = t => t.replace(/:$/, '').trim().toLowerCase();

    // texto de um elemento; se ele for (ou contiver) um campo de formulário, o valor do campo
    // (páginas que mostram os dados em <input readonly> não têm o valor no texto)
    const textoOuCampo = n => {
      if (!n) return '';
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t || n.nodeType !== 1) return t;
      const c = n.matches('input, textarea, select') ? n : n.querySelector('input, textarea, select');
      if (!c) return '';
      if (c.tagName === 'SELECT') { const o = c.querySelector('option[selected]'); return o ? o.textContent.replace(/\s+/g, ' ').trim() : ''; }
      return String(c.getAttribute('value') || c.textContent || '').replace(/\s+/g, ' ').trim();
    };
    // acha o "rótulo" (ex.: Digitador) e devolve o texto do valor que vem logo depois dele
    // estrito = com título informado e não encontrado, não procura no resto da página (evita pegar dados de outra seção)
    function acharRotulo(doc, rotulo, depoisDeTitulo, estrito) {
      const todos = [...doc.querySelectorAll('body *')].filter(el => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName));
      let cands = todos.filter(el => normRot(proprio(el)) === rotulo.toLowerCase());
      if (depoisDeTitulo) {
        const tit = todos.find(el => normRot(el.textContent.replace(/\s+/g, ' ')) === depoisDeTitulo.toLowerCase());
        if (tit) cands = cands.filter(c => !tit.contains(c) && (tit.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
        else if (estrito) return null;
      }
      for (const el of cands) {
        let n = el.nextSibling;
        while (n && ((n.nodeType === 3 && !n.textContent.trim()) || n.nodeName === 'BR')) n = n.nextSibling;
        let t = textoOuCampo(n);
        if (!t && el.parentElement) t = textoOuCampo(el.parentElement.nextElementSibling);
        if (t) return t;
      }
      return null;
    }
    const primeiroRotulo = (docs, rotulos, valida) => {
      for (const doc of docs) for (const r of rotulos) {
        const t = acharRotulo(doc, r);
        if (t && (!valida || valida(t))) return t;
      }
      return null;
    };

    async function buscarDetalhe(base, id) {
      const raiz = base.replace(/\/$/, '');
      const docs = [], info = [], rotulos = new Set();
      let expirou = false;
      for (const a of DETALHES) {
        const nome = a.split('?')[0].split('/').pop();
        const ctl = new AbortController();
        const tm = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_REDE * 1000);
        try {
          const html = await (await fetch(raiz + a + id, { credentials: 'include', signal: ctl.signal })).text();
          if (erSemSessao(html)) { expirou = true; info.push(nome + ': erro (sessão expirada)'); continue; }
          const doc = new DOMParser().parseFromString(html, 'text/html');
          docs.push(doc);
          info.push(nome + ': ' + html.length + ' bytes');
          doc.querySelectorAll('body *').forEach(el => {
            const t = proprio(el);
            if (t.length < 30 && /digitador|vendedor|valor|imei|garantia|cliente|nome|situa|telefone|celular|fone|contato|mail|entrada|percent|%/i.test(t)) rotulos.add(t);
          });
        } catch (e) { info.push(nome + ': erro'); }
        finally { clearTimeout(tm); }
      }
      // sessão vencida: não grava a proposta "sem vendedor/valor" (no Diário viraria N/A); quem chamou para a fila
      if (expirou) {
        const dbg = GM_getValue('extraDbg', {});
        dbg[id] = { paginas: info, sessaoExpirada: true };
        GM_setValue('extraDbg', dbg);
        return;
      }
      let vendedor = null, valor = null;
      for (const doc of docs) {
        if (!vendedor) vendedor = acharRotulo(doc, 'Digitador');
        if (!valor) valor = acharRotulo(doc, 'Valor', 'Garantias');
      }
      if (vendedor) vendedor = vendedor.replace(/^\d+\s+/, '').replace(/\s+-\s+.*$/, '').trim();   // "4144175588 LUCAS S. LINERES - XP ..." -> "LUCAS S. LINERES"
      if (valor) valor = valor.replace(/^R\$\s*/, 'R$');                                          // "R$ 1.864,00" -> "R$1.864,00"
      // IMEI: só aceita 14 a 16 dígitos; cliente: só letras (não inventa quando o rótulo não existe)
      const imeiTxt = primeiroRotulo(docs, ['IMEI'], t => /^\d{14,16}$/.test(t.replace(/\D/g, '')));
      const imei = imeiTxt ? imeiTxt.replace(/\D/g, '') : null;
      const cliente = primeiroRotulo(docs, ['Nome do Cliente', 'Cliente', 'Nome'], t => /^[A-Za-zÀ-ÿ'.\s-]{3,120}$/.test(t));
      const situacao = primeiroRotulo(docs, ['Situação', 'Situacao', 'Status'], t => t.length <= 60);
      // Valor da Compra / Valor da Entrada ("R$ 360,00 (20,00 %)"): só pelo rótulo exato, nunca pelo primeiro dd.text-bold.
      // Telefone e e-mail NÃO são lidos aqui: nestas páginas os rótulos de contato são do usuário que digitou
      // (ex.: ADMINISTRATIVOXPANSE). Os do cliente vêm da aba "Cliente" (dadosCliente).
      const compra = dinheiro(primeiroRotulo(docs, ['Valor da Compra'], t => !!dinheiro(t)));
      const entradaTxt = primeiroRotulo(docs, ['Valor da Entrada'], t => !!dinheiro(t) || !!pctDe(t));
      const entrada = entradaTxt ? dinheiro(entradaTxt) : null;
      const entradaPct = entradaTxt ? pctDe(entradaTxt) : null;
      const extra = GM_getValue('extra', {});
      extra[id] = { vendedor: vendedor || null, valor: valor || null, imei, cliente: cliente || null, situacao: situacao || null,
        compra, entrada, entradaPct };
      GM_setValue('extra', extra);
      const dbg = GM_getValue('extraDbg', {});
      dbg[id] = { paginas: info, achouVendedor: !!vendedor, achouValor: !!valor, achouImei: !!imei, achouCliente: !!cliente, achouSituacao: !!situacao,
        achouCompra: !!compra, achouEntrada: !!(entrada || entradaPct), rotulosVistos: [...rotulos].slice(0, 40) };
      GM_setValue('extraDbg', dbg);
    }

    /* ---------- aba "Cliente" da Análise de Proposta (telefone, e-mail) ----------
       No sistema, a aba Cliente é carregada por objMesaAnalise.MesaAnaliseDados('Cliente'), que faz
       GET strCaminhoSistema + '/MesaCredito/MesaAnaliseCliente?lngProposta=N' e põe o HTML em #divMesaAnaliseDados.
       O script faz a MESMA requisição (uma por proposta, nada fica da anterior) e lê o bloco #divDetalhePropostaCadastro:
         <td><small> Email</small><br><b> &nbsp;</b></td>   <td><small> Telefone 1</small><br><b>(11) 964577660 - </b></td>
       O valor é o <b> da MESMA célula do rótulo; <b> vazio/&nbsp; = sem dado (nunca lê a célula vizinha).
       O CPF do bloco é guardado para conferir com o CPF do motor (garante que os dados são da proposta certa). */
    async function dadosCliente(base, id) {
      const r = { ok: false, telefone: null, email: null, cpf: null, nome: null, motivo: '' };
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_REDE * 1000);
      let html = '';
      try {
        const resp = await fetch(base.replace(/\/$/, '') + '/MesaCredito/MesaAnaliseCliente?lngProposta=' + encodeURIComponent(id), { credentials: 'include', signal: ctl.signal });
        if (!resp.ok) { r.motivo = 'aba Cliente respondeu HTTP ' + resp.status; return r; }
        html = await resp.text();
        if (erSemSessao(html)) { r.motivo = SESSAO_EXPIRADA; return r; }
      } catch (e) {
        r.motivo = ctl.signal.aborted ? 'aba Cliente: tempo esgotado' : 'aba Cliente: erro de rede';
        return r;
      } finally { clearTimeout(tm); }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const bloco = doc.querySelector('#divDetalhePropostaCadastro') || doc.body;
      const limpo = t => String(t || '').replace(/[\s\u00a0]+/g, ' ').trim();
      // valor do campo: <b> da mesma célula do <small> com o rótulo exato
      const campo = rotulo => {
        const sm = [...bloco.querySelectorAll('small')].find(x => limpo(x.textContent).toLowerCase() === rotulo.toLowerCase());
        if (!sm) return null;
        const cel = sm.closest('td') || sm.parentElement;
        const b = cel && cel.querySelector('b');
        const v = b ? limpo(b.textContent) : '';
        return v || null;
      };
      if (!campo('Nome do Cliente') && !campo('CPF')) { r.motivo = 'aba Cliente sem o bloco Identificação do Cliente'; return r; }
      r.ok = true;
      r.nome = campo('Nome do Cliente');
      r.cpf = (campo('CPF') || '').replace(/\D/g, '') || null;
      const em = campo('Email') || campo('E-mail');
      r.email = em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) ? em : null;
      for (const rot of ['Telefone 1', 'Telefone 2']) {
        const tel = fmtTelefone(campo(rot) || '');
        if (tel) { r.telefone = tel; break; }
      }
      return r;
    }

    // segunda barreira contra testes/canceladas: proposta que NÃO está na tabela da tela é conferida no detalhe
    async function verificarRemoto(id) {
      const base = (document.getElementById('txtCaminhoSistema') || {}).value || '';
      if (!GM_getValue('extra', {})[id]) await buscarDetalhe(base, id);
      const e = GM_getValue('extra', {})[id] || {};
      if (e.situacao && /cancelad/i.test(e.situacao) && !diarioTudo()) return 'cancelada';
      if (ehTeste([e.cliente, e.vendedor])) return 'teste';
      return null;
    }
    // depois de ler o detalhe (auditoria completa e relatórios): cliente ou digitador "TESTE" = proposta de teste
    const motivoDetalhe = e => (e && e.situacao && /cancelad/i.test(e.situacao) && !diarioTudo() ? 'cancelada' : e && ehTeste([e.cliente, e.vendedor]) ? 'teste' : null);
    const marcarIgnorada = (id, motivo) => { const ig = ignoradas(); ig[id] = motivo; GM_setValue('ignoradas', ig); };

    /* ---------- cópia ---------- */
    // copia HTML e texto ao mesmo tempo; sem clique do usuário (ou em página http) cai no GM_setClipboard só com HTML
    const copiarHtmlETexto = (html, texto) => {
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({
            'text/html':  new Blob([html],  { type: 'text/html' }),
            'text/plain': new Blob([texto], { type: 'text/plain' }),
          })]).catch(() => GM_setClipboard(html, { type: 'html', mimetype: 'text/html' }));
          return;
        }
      } catch (_) {}
      GM_setClipboard(html, { type: 'html', mimetype: 'text/html' });
    };
    // Propostas ignoradas (teste/cancelada): nas listas coladas linha a linha na planilha (Auditoria e Diário)
    // viram linha em branco, para não desalinhar as linhas seguintes; nas tabelas dos relatórios (Canva) saem da lista.
    // TODAS as cópias passam por aqui: o formato escolhido (automático ou manual) decide como as linhas vão para a área de transferência
    const textoTab = linhas => linhas.map(c => c.map(v => cel(String(v == null ? '' : v))).join('\t')).join('\n');
    function emitir(linhas) {
      const est = estilo();
      if (est === 'tsv') GM_setClipboard(textoTab(linhas), 'text');
      else if (est === 'xl') copiarHtmlETexto(htmlTabela(linhas, 'xl'), textoTab(linhas));
      else GM_setClipboard(htmlTabela(linhas, est), { type: 'html', mimetype: 'text/html' });
    }
    /* ---------- Relatório Diário (planilha "Relatório Diário - PaymobiFin") ----------
       A–L: as colunas da tabela da Mesa (Ações ... Ponto de Atendimento), K Status e L vazia.
       M (Situação Relatório) é fórmula da planilha: NUNCA entra na cópia (colar texto por cima apagaria a fórmula).
       N: valor de transação, colado à parte. As duas cópias usam a MESMA lista (fila), na mesma ordem:
       uma linha por proposta, sem descartar nenhuma (sem valor = N/A; ignorada ou ainda não processada = vazia). */
    const statusDiario = mt => {
      if (!mt || !mt.sit) return '';
      const manual = (!!mt.ana && !/master/i.test(mt.ana)) || /\bman\b/i.test(mt.sit);
      if (/cancelad/i.test(mt.sit)) return 'Cancelada';
      if (ehConfCad(mt.sit)) return 'Em digitação';
      if (ehReprovada(mt.sit)) return manual ? 'Reprovada Manual' : 'Reprovada Automática';
      if (/efetivad|\bapr\b|aprov/i.test(mt.sit)) return manual ? 'Aprovada Manual' : 'Aprovada Automática';   // inclui "06 - APROV MAN"
      return 'Pendente';
    };
    const linhaDiario = (id, mt, processada) => {
      const v = x => (x ? x : processada && !mt ? NA : '');
      const m = mt || {};
      return [m.acoes || '', id, v(m.sit), m.ind || '', v(m.dh), v(m.dts), v(m.cli), v(m.ana), v(m.prod), v(m.loja), v(statusDiario(mt)), ''];
    };
    // "R$1.864,00" -> "R$ 1.864,00" (o Excel em português reconhece como moeda)
    const valorDiario = (e, processada) => {
      const vt = valorTransacao(e);
      const n = vt ? num(vt) : null;
      return n ? moeda(n).replace(/^R\$/, 'R$ ') : processada ? NA : '';
    };
    function copiarDiario(qual) {
      const ig = ignoradas(), fe = new Set(feitas()), meta = GM_getValue('meta', {}), extra = GM_getValue('extra', {});
      const f = fila();
      if (qual === 'valores') {
        const vals = f.map(id => (ig[id] ? '' : valorDiario(extra[id], fe.has(id))));
        emitir(vals.map(x => [x]));
        const comValor = vals.filter(x => x && x !== NA).length, na = vals.filter(x => x === NA).length;
        return 'Valores de transação copiados: ' + f.length + ' linhas (' + comValor + ' com valor' + (na ? ', ' + na + ' N/A' : '') +
          (f.length - comValor - na ? ', ' + (f.length - comValor - na) + ' em branco: ignoradas ou ainda não processadas' : '') +
          '). ' + fe.size + ' propostas processadas. Cole na coluna N, na primeira linha da lista (mesma ordem).';
      }
      emitir(f.map(id => (ig[id] ? ['', id, ...Array(10).fill('')] : linhaDiario(id, meta[id], fe.has(id)))));
      return 'Linhas copiadas (A–L, ' + f.length + ' propostas). Cole na coluna A. A coluna M (Situação Relatório) não é alterada; ' +
        'depois clique em "Copiar somente valores" e cole na coluna N.';
    }
    $('#mf-dlin').onclick = () => { atualizarFila(); if (!fila().length) return msg('Não há propostas na fila.'); msg((executando ? 'Cópia PARCIAL. ' : '') + copiarDiario('linhas')); };
    $('#mf-dval').onclick = () => { atualizarFila(); if (!fila().length) return msg('Não há propostas na fila.'); msg((executando ? 'Cópia PARCIAL. ' : '') + copiarDiario('valores')); };

    function copiar(comId) {
      const dados = GM_getValue('dados', {});
      const ig = ignoradas();
      if (modo() === 'valortransacao') { copiarDiario('valores'); return false; }
      if (modo() !== 'coleta') {
        const alinhado = modo() === 'valortransacao';
        const ids = alinhado ? fila() : fila().filter(id => !ig[id]);
        const fe = new Set(feitas());
        emitir(ids.map(id => (ig[id] ? [''] : relatorioCols(modo(), id, dados[id], fe.has(id)))));
        return false;
      }
      const usarId = comId !== undefined ? comId : GM_getValue('origem', 'manual') === 'tela';
      const vazias = Array(CONFIG.VAZIAS_APOS_ID).fill('');   // Nome, CPF, IMEI: entre a Proposta (A) e a coluna E
      const fe = new Set(feitas());
      emitir(fila().map(id => {
        const d = ig[id] ? null : dados[id];
        const falta = !ig[id] && fe.has(id) ? 'N/A' : '';   // processada e sem o dado = N/A (como na planilha, ex.: 4663)
        const cred = [d && d.qtd, d && d.val, d && d.score, d && d.consultas].map(x => (x == null || x === '' ? falta : x));
        return usarId ? [id, ...vazias, ...cred] : cred;
      }));
      return usarId;
    }
    function copiarCompleta() {
      const dados = GM_getValue('dados', {}), meta = GM_getValue('meta', {}), extra = GM_getValue('extra', {}), ig = ignoradas();
      const fe = new Set(feitas());
      emitir(fila().map(id => (ig[id] ? [id, ...Array(COLUNAS_AUDITORIA.length - 1).fill('')] : linhaCompleta(id, dados[id], meta[id], extra[id], fe.has(id)))));
    }
    const AVISO_COMPLETA = 'Copiado no modelo Auditoria 2 Completo (colunas A a R). Cole na coluna A (Proposta), na primeira linha da lista. ' +
      'Campos que a página da proposta não informar (ex.: telefone, e-mail, entrada, IMEI) vão em branco.';

    const avisoCopia = usouId => modo() === 'valortransacao'
      ? (estilo() === 'tsv'
        ? 'Cole na coluna N (Valor de transação), na mesma ordem da lista.'
        : 'Copiado como ' + FORMATOS[formatoDoModo(modo())].rot + ', na ordem da lista.')
      : modo() === 'rendas'
      ? 'Cole na coluna A (Data da proposta), na primeira linha livre. Vão as colunas A–G (a G, % proximidade, vai como valor, não como fórmula).'
      : modo() !== 'coleta'
      ? 'Copiado como ' + FORMATOS[formatoDoModo(modo())].rot + ', na ordem do relatório.'
      : estilo() !== 'tsv'
      ? 'Copiado como ' + FORMATOS[formatoDoModo(modo())].rot + '. ' + (usouId ? 'Cole na coluna A.' : 'Cole na coluna E.')
      : usouId
      ? 'Cole na coluna A (proposta). Atenção: Nome, CPF e IMEI das linhas coladas serão sobrescritos por células vazias.'
      : 'Cole na coluna E.';

    function faltantes() {
      const dados = GM_getValue('dados', {});
      const ex = GM_getValue('extra', {});
      const ig = ignoradas();
      const ativos = fila().filter(id => !ig[id]);
      const m = modo();
      if (m === 'reprovadas') {
        return ativos.map(id => {
          const rp = dados[id] && dados[id].reprov;
          if (rp == null) return id + ' (falta: motivo da reprovação)';
          if (rp === '') return id + ' (o MobFacil NÃO mostrou mensagem de reprovação: conferir à mão)';
          const mt = GM_getValue('meta', {})[id];
          if (!mt || !mt.dh || !mt.loja) return id + ' (falta: horário/loja da tabela da tela)';
          return null;
        }).filter(Boolean);
      }
      if (m === 'rendas') {
        const meta = GM_getValue('meta', {});
        return ativos.map(id => {
          const d = dados[id] || {}, f = [];
          if (d.rendaInf == null) f.push('renda informada');
          if (d.rendaBiro == null) f.push('renda do birô');   // '' = o motor não tem RendaCalculo nesta proposta (não é falta)
          if (d.cpf == null) f.push('cpf');
          if (!meta[id] || !meta[id].dh) f.push('data da proposta (fora da tabela da tela)');
          return f.length ? id + ' (falta: ' + f.join(', ') + ')' : null;
        }).filter(Boolean);
      }
      // em digitação (CONF CAD) ainda não tem valor: não é falta (a linha sai com N/A no valor)
      if (m === 'valortransacao') { const mt = GM_getValue('meta', {}); return ativos.filter(id => !valorTransacao(ex[id]) && !ehConfCad((mt[id] || {}).sit)).map(id => id + ' (sem valor de transação)'); }
      if (m === 'efetivadas') return ativos.filter(id => !(ex[id] && ex[id].vendedor)).map(id => id + ' (falta: vendedor)');
      if (m === 'aprovadas') {
        return ativos.map(id => {
          const f = [];
          if (!(dados[id] && dados[id].cpf)) f.push('cpf');
          if (!(ex[id] && ex[id].vendedor)) f.push('vendedor');
          if (!valorTransacao(ex[id])) f.push('valor');
          return f.length ? id + ' (falta: ' + f.join(', ') + ')' : null;
        }).filter(Boolean);
      }
      const meta = GM_getValue('meta', {});
      const full = cfg('auditoriaCompleta');
      return ativos.map(id => {
        const f = completo(dados[id]) ? [] : faltaCampos(dados[id]);
        if (full && !meta[id]) f.push('nome/loja/situação (proposta fora da tabela da tela)');
        if (full && !(ex[id] && ex[id].vendedor)) f.push('vendedor');
        if (full && ex[id]) {
          const e = ex[id], d = dados[id] || {};
          if (e.abaCliente === false) f.push('telefone/e-mail (aba Cliente: ' + ((GM_getValue('extraDbg', {})[id] || {}).abaCliente || 'não carregou') + ')');
          else if (e.cpfCliente && d.cpf && e.cpfCliente !== d.cpf) f.push('telefone/e-mail (CPF da aba Cliente diferente: não usados)');
        }
        return f.length ? id + ' (falta: ' + f.join(', ') + ')' : null;
      }).filter(Boolean);
    }

    /* ---------- coleta ---------- */
    // etapas de cada proposta, para o Diagnóstico mostrar ONDE parou (só nome da etapa, tempo e resultado; nada pessoal)
    const etapa = (id, nome, resultado) => {
      etapaAtual = resultado == null ? nome : '';
      const dbg = GM_getValue('extraDbg', {});
      const d = dbg[id] || {};
      d.etapas = [...(d.etapas || []), { etapa: nome, quando: new Date().toLocaleTimeString(), ...(resultado != null ? { resultado: String(resultado).slice(0, 80) } : {}) }].slice(-14);
      dbg[id] = d;
      GM_setValue('extraDbg', dbg);
      atualizarUI();
    };
    async function coletar(id) {
      try { const r = await coletarEtapas(id); if (r) etapa(id, 'falha', r); return r; }
      catch (e) { etapa(id, 'erro', e && e.message); return 'erro no script: ' + (e && e.message); }
      finally { etapaAtual = ''; }
    }
    async function coletarEtapas(id) {
      const base = (document.getElementById('txtCaminhoSistema') || {}).value || '';
      const url = base.replace(/\/$/, '') + '/MesaCredito/MesaAnaliseMobFacil?lngProposta=' + id;
      const m = modo();

      // dados da página de detalhe: Vendedor e Valor (aba Garantias); na auditoria completa também IMEI/cliente
      const precisaDetalhe = m === 'efetivadas' || m === 'aprovadas' || m === 'valortransacao' || (m === 'coleta' && cfg('auditoriaCompleta'));
      if (precisaDetalhe && !GM_getValue('extra', {})[id]) {
        etapa(id, 'detalhe da proposta');
        await buscarDetalhe(base, id);
        const dbgDet = GM_getValue('extraDbg', {})[id] || {}, pg = dbgDet.paginas || [];
        etapa(id, 'detalhe da proposta', dbgDet.sessaoExpirada ? SESSAO_EXPIRADA : pg.some(x => /erro/.test(x)) ? 'erro ao abrir página' : 'ok');
        if (dbgDet.sessaoExpirada) return SESSAO_EXPIRADA;
      }
      if (m === 'coleta' && cfg('auditoriaCompleta') && cfg('lerAbaCliente')) {
        etapa(id, 'aba Cliente');
        const cli = await dadosCliente(base, id);
        etapa(id, 'aba Cliente', cli.ok ? 'ok' : cli.motivo);
        if (cli.motivo === SESSAO_EXPIRADA) return SESSAO_EXPIRADA;
        const ex1 = GM_getValue('extra', {});
        ex1[id] = { ...(ex1[id] || {}), abaCliente: cli.ok, telefone: cli.telefone, email: cli.email, cpfCliente: cli.cpf, clienteAba: cli.nome || null };
        GM_setValue('extra', ex1);
        const dbg = GM_getValue('extraDbg', {});
        dbg[id] = { ...(dbg[id] || {}), abaCliente: cli.ok ? 'ok' : cli.motivo, achouTelefone: !!cli.telefone, achouEmail: !!cli.email, achouCpfAba: !!cli.cpf };
        GM_setValue('extraDbg', dbg);
      }
      if (cfg('ignorarCanceladasTestes')) {
        const ex2 = GM_getValue('extra', {})[id];
        const mot = motivoDetalhe(ex2) || (ex2 && ehTeste([ex2.clienteAba]) ? 'teste' : null);
        if (mot) { marcarIgnorada(id, mot); return null; }
      }
      if (m === 'efetivadas' || m === 'aprovadas' || m === 'valortransacao') {
        const extra = GM_getValue('extra', {})[id] || {};
        // Diário: página lida e sem valor = N/A (não é falha); página que não carregou = falha (Continuar tenta de novo)
        if (m === 'valortransacao' && !valorTransacao(extra) &&((GM_getValue('extraDbg', {})[id] || {}).paginas || []).some(x => /erro/.test(x))) return 'página da proposta não carregou';
        if (m === 'efetivadas' && !extra.vendedor) return 'vendedor não localizado';
        if (m === 'aprovadas' && (!extra.vendedor || !valorTransacao(extra))) return 'vendedor ou valor não localizado';
        if (m !== 'aprovadas') return null;
      }
      if (!GM_getValue('rodando', false)) return 'pausado';
      etapa(id, 'motor MobFacil');

      const ctl = new AbortController();
      ctlAtual = ctl;
      const tm = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_REDE * 1000);
      let html;
      try {
        html = await (await fetch(url, { credentials: 'include', signal: ctl.signal })).text();
      } catch (e) {
        return ctl.signal.aborted ? 'tempo esgotado na rede' : 'erro de rede';
      } finally { clearTimeout(tm); ctlAtual = null; }

      if (!html.trim()) return 'MobFacil indisponível';
      if (erSemSessao(html)) return SESSAO_EXPIRADA;
      const src = (new DOMParser().parseFromString(html, 'text/html').querySelector('iframe') || {}).src;
      if (!src) return 'sem link do motor';

      GM_setValue('fim', '');
      GM_setValue('atualId', id);   // o iframe só grava dados desta proposta, durante esta coleta
      const fr = document.createElement('iframe');
      fr.src = src;
      fr.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:2500px;opacity:0;pointer-events:none;border:0;z-index:-1';
      document.body.appendChild(fr);
      const ini = Date.now();
      while (Date.now() - ini < CONFIG.TEMPO_MAX * 1000 && GM_getValue('rodando', false)) {
        await sleep(CONFIG.POLL_PRINCIPAL);
        if (completo(GM_getValue('dados', {})[id]) || GM_getValue('fim', '') === id) break;
      }
      fr.remove();
      GM_setValue('atualId', '');
      const coletados = GM_getValue('dados', {})[id] || {};
      etapa(id, 'motor MobFacil', completo(coletados) ? 'ok' : 'faltou: ' + faltaCampos(coletados).join(', '));
      if (!completo(coletados)) return 'auditoria incompleta: ' + faltaCampos(coletados).join(', ');
      return null;
    }

    async function rodar() {
      const ids = fila();
      let sessaoCaiu = '';   // proposta em que o ER respondeu "sessão expirada": a fila pausa (não segue gravando falhas)
      try {
        for (const id of ids) {
          if (!GM_getValue('rodando', false)) break;
          if (feitas().includes(id)) continue;          // já coletada: pula (é o "continuar")
          atual = id;
          delete falhas[id];
          atualizarUI();
          // regra rígida: teste/cancelada NUNCA é processada (independe da situação). A tabela da tela já foi
          // conferida no Iniciar; o que não estava nela é conferido agora, no detalhe da proposta.
          if (!ignoradas()[id] && cfg('ignorarCanceladasTestes') && !verificadas().includes(id)) {
            const mot = await verificarRemoto(id);
            if (mot) marcarIgnorada(id, mot);
          }
          let erro = null;
          if (!ignoradas()[id]) erro = await coletar(id);
          if (erro === SESSAO_EXPIRADA) { sessaoCaiu = id; GM_setValue('rodando', false); }
          if (!GM_getValue('rodando', false)) break;    // pausou no meio: NÃO marca como feita, será refeita
          if (erro) falhas[id] = erro;                  // falhou: não marca, "Continuar" tenta de novo
          else GM_setValue('feitas', [...feitas(), id]);
          atualizarUI();
          await sleep(CONFIG.PAUSA);
        }
      } finally {
        pararBatida();
        executando = false;
        GM_setValue('atualId', '');
      }
      const concluiu = GM_getValue('rodando', false);   // true = chegou ao fim sem ninguém pausar
      GM_setValue('rodando', false);
      atual = null;
      if (resetando) { resetando = false; return; }
      atualizarUI();

      const total = fila().length;
      if (sessaoCaiu) {
        return msg('A sessão do ER expirou (proposta ' + sessaoCaiu + '). A fila foi pausada em ' + (total - pendentes().length) + ' de ' + total +
          ' para não gravar dados em branco. Entre no ER de novo e clique em Continuar.');
      }
      if (!concluiu) {
        return msg('Pausado em ' + (total - pendentes().length) + ' de ' + total +
          '. Clique em Continuar para seguir de onde parou.');
      }
      let aviso = 'Fila concluída.';
      if (cfg('copiarAoConcluir')) {
        if (modo() === 'coleta' && cfg('auditoriaCompleta')) { copiarCompleta(); aviso = 'Fila concluída e resultado COPIADO. ' + AVISO_COMPLETA; }
        else if (modo() === 'valortransacao') aviso = 'Fila concluída e COPIADO. ' + copiarDiario(GM_getValue('diarioSaida', 'completo') === 'completo' ? 'linhas' : 'valores');
        else aviso = 'Fila concluída e resultado COPIADO. ' + avisoCopia(copiar(false));
      } else aviso += ' Use os botões de cópia.';
      const f = faltantes();
      const ef = Object.keys(falhas);
      const ig = ignoradas();
      const igLista = fila().filter(id => ig[id]);
      const ex = GM_getValue('extra', {}), ver = new Set(verificadas());
      const semVerif = cfg('ignorarCanceladasTestes') ? fila().filter(id => !ig[id] && !ver.has(id) && !(ex[id] && ex[id].cliente)) : [];
      const dRend = GM_getValue('dados', {});
      const semBiro = modo() === 'rendas' ? fila().filter(id => !ig[id] && dRend[id] && dRend[id].rendaBiro === '') : [];
      msg(aviso +
        (semBiro.length ? '\nSem renda do birô no motor (coluna F vazia): ' + semBiro.join(', ') : '') +
        (igLista.length ? '\nIgnoradas (teste/cancelada): ' + igLista.map(id => id + ' (' + ig[id] + ')').join(', ') : '') +
        (semVerif.length ? '\nNão conferidas como teste (fora da tabela da tela e sem nome no detalhe): ' + semVerif.join(', ') : '') +
        (f.length ? '\nIncompletas: ' + f.join('; ') : '') +
        (ef.length ? '\nFalhas (clique em Continuar para tentar de novo): ' + ef.map(k => k + ' (' + falhas[k] + ')').join(', ') : ''));
    }

    /* ---------- eventos ---------- */
    $('#mf-lista').addEventListener('input', () => {
      if (!executando) GM_setValue('origem', 'manual');
      atualizarUI();
    });

    $('#mf-tela').onclick = () => {
      if (executando) return msg('Coleta em andamento. Pause antes de ler a tela de novo.');
      const m = modo();
      GM_setValue('modo', m);
      const ign = cfg('ignorarCanceladasTestes');
      let ids;
      if (m === 'coleta') {
        ids = lerTela(ign);
        if (!ids.length) return msg('Não achei propostas na tela. Abra a Mesa de Crédito com a lista visível.');
        const meta = {};
        lerLinhas().forEach(l => { if (ids.includes(l.id)) meta[l.id] = metaDe(l); });   // nome/loja/situação para a auditoria completa
        GM_setValue('meta', meta);
      } else {
        const todasLinhas = lerLinhas();
        const semConf = diarioTudo() ? todasLinhas : todasLinhas.filter(l => !ehConfCad(l.sit));   // CONF CAD fora dos relatórios (menos o Diário com a visão geral)
        confCadIgnoradas = todasLinhas.length - semConf.length;
        const elegiveis = semConf.filter(l => FILTROS[m](l.sit));
        const linhas = elegiveis.filter(l => !(ign && motivoFora(l.cels)));
        canceladasTestesIgnoradas = elegiveis.length - linhas.length;
        if (!linhas.length) return msg('Nenhuma proposta desse tipo na lista da tela. Confira o filtro de data/situação da Mesa de Crédito.');
        const meta = {};
        linhas.forEach(l => (meta[l.id] = metaDe(l)));
        GM_setValue('meta', meta);
        ids = [...new Set(linhas.map(l => l.id))];
      }
      $('#mf-lista').value = ids.join('\n');
      GM_setValue('origem', 'tela');
      atualizarUI();
      msg(ids.length + ' propostas lidas da tela. Confira com o contador do sistema e clique em Iniciar.' +
        (canceladasTestesIgnoradas ? '\n' + canceladasTestesIgnoradas + ' canceladas/de teste ficaram de fora.' : '') +
        (confCadIgnoradas ? '\n' + confCadIgnoradas + ' em "CONF CAD" (em digitação) ficaram de fora.' : ''));
    };

    $('#mf-ini').onclick = () => {
      if (executando) return;
      if (outraAbaRodando()) return msg('Já existe uma coleta rodando em outra aba.');
      let ids = [...new Set(idsDaCaixa())];
      if (!ids.length) return msg('Clique em "Ler da tela" ou cole a lista de propostas.');
      if (!contaConfirmada()) return msg('Coleta não iniciada: confirme a conta ativa na aba Contas.');
      GM_setValue('modo', modo());
      // confere cada proposta na tabela da Mesa de Crédito que está na tela (situação e células da linha)
      const linhasTela = lerLinhas();
      const porId = {};
      linhasTela.forEach(l => { porId[l.id] = l; });
      const ign = cfg('ignorarCanceladasTestes');
      const novasIgnoradas = {};
      if (ign) ids.forEach(id => { const l = porId[id]; const mot = l && motivoFora(l.cels); if (mot) novasIgnoradas[id] = mot; });
      // lista colada da planilha (Auditoria) e Relatório Diário: a proposta ignorada continua na fila como linha em branco,
      // para a cópia ficar alinhada com as linhas da planilha. Nos outros casos ela sai da lista.
      const alinhado = (modo() === 'coleta' && GM_getValue('origem', 'manual') !== 'tela') || modo() === 'valortransacao';
      let removidas = 0;
      if (!alinhado) {
        const antes = ids.length;
        ids = ids.filter(id => !novasIgnoradas[id]);
        removidas = antes - ids.length;
        if (!ids.length) return msg('Todas as propostas da lista são canceladas ou de teste. Nada para processar.');
        if (removidas) $('#mf-lista').value = ids.join('\n');
      }
      const dados = GM_getValue('dados', {});
      ids.forEach(id => delete dados[id]);
      GM_setValue('dados', dados);
      const ex0 = GM_getValue('extra', {});
      ids.forEach(id => delete ex0[id]);
      GM_setValue('extra', ex0);
      GM_deleteValue('extraDbg');
      GM_deleteValue('debug');
      GM_setValue('ignoradas', alinhado ? novasIgnoradas : {});
      GM_setValue('verificadas', ids.filter(id => porId[id]));
      // horário, loja, nome, situação e analista vêm da tabela da Mesa de Crédito que está na tela (não do MobFacil)
      let avisoMeta = '';
      const meta = GM_getValue('meta', {});
      linhasTela.forEach(l => { if (ids.includes(l.id)) meta[l.id] = metaDe(l); });
      GM_setValue('meta', meta);
      const sem = ids.filter(id => !meta[id]);
      if (sem.length && (modo() !== 'coleta' || cfg('auditoriaCompleta'))) {
        avisoMeta = '\nSem dados da tabela da tela (horário/loja/nome/situação): ' + sem.join(', ') +
          '. Deixe a lista da Mesa de Crédito visível e clique em Iniciar de novo.';
      }
      GM_setValue('fila', ids);
      GM_setValue('feitas', []);
      GM_setValue('rodando', true);
      Object.keys(falhas).forEach(k => delete falhas[k]);
      executando = true;
      iniciarBatida();
      const nIg = Object.keys(novasIgnoradas).length;
      msg('Rodando... deixe esta aba aberta e visível.' + avisoMeta +
        (nIg ? '\n' + nIg + ' canceladas/de teste ' + (alinhado ? 'ficam como linha em branco: ' : 'foram retiradas: ') + Object.keys(novasIgnoradas).join(', ') : ''));
      atualizarUI();
      rodar();
    };

    $('#mf-par').onclick = () => {
      if (!executando) return;
      GM_setValue('rodando', false);
      if (ctlAtual) ctlAtual.abort();   // corta a requisição de rede em andamento
      msg('Pausando...');
    };

    $('#mf-cont').onclick = () => {
      if (executando) return;
      if (outraAbaRodando()) return msg('Já existe uma coleta rodando em outra aba.');
      const caixa = idsDaCaixa();
      if (caixa.length && caixa.join(',') !== fila().join(',')) {
        return msg('A lista da caixa é diferente da fila salva. Clique em Iniciar para usar a lista nova, ou em Resetar para limpar tudo.');
      }
      if (!pendentes().length) return msg('Não há nada pendente para continuar.');
      if (!contaConfirmada()) return msg('Coleta não retomada: confirme a conta ativa na aba Contas.');
      GM_setValue('rodando', true);
      executando = true;
      iniciarBatida();
      msg('Continuando de onde parou (' + pendentes().length + ' pendentes)...');
      atualizarUI();
      rodar();
    };

    $('#mf-res').onclick = async () => {
      if (!confirm('Resetar tudo? Isso apaga os dados coletados, a fila, o progresso e o relatório de pendências.')) return;
      msg('Parando e limpando...');
      if (executando) {
        resetando = true;
        GM_setValue('rodando', false);
        if (ctlAtual) ctlAtual.abort();
        while (executando) await sleep(200);   // espera a coleta encerrar de verdade antes de apagar
        resetando = false;
      }
      ['dados', 'fila', 'feitas', 'fim', 'debug', 'origem', 'atualId', 'meta', 'extra', 'extraDbg', 'ignoradas', 'verificadas'].forEach(k => GM_deleteValue(k));
      GM_setValue('rodando', false);
      Object.keys(falhas).forEach(k => delete falhas[k]);
      atual = null;
      $('#mf-lista').value = '';
      pdLimpar();   // o relatório de pendências também sai (ver RELATÓRIO DE PENDÊNCIAS)
      atualizarUI();
      msg('Tudo limpo. Pronto para uma nova coleta.');
    };

    // copiar NUNCA para a coleta. Durante a coleta, copia o parcial e a fila em andamento não é alterada.
    const atualizarFila = () => {
      if (executando) return;
      const ids = idsDaCaixa();
      if (!ids.length || ids.join(',') === fila().join(',')) return;
      GM_setValue('fila', ids);
      GM_setValue('feitas', []);   // lista nova: o progresso antigo não vale mais
    };
    const resumoParcial = () => {
      const f = fila();
      return (f.length - pendentes().length) + ' de ' + f.length + ' processadas, ' + completas() + ' completas';
    };
    $('#mf-cop').onclick = () => {
      atualizarFila();
      const usouId = copiar(false);   // sem número da proposta: só as 4 colunas, para a coluna E
      atualizarUI();
      msg(executando
        ? 'Cópia PARCIAL (' + resumoParcial() + '). A coleta continua rodando. Propostas ainda não coletadas ficam em branco. ' + avisoCopia(usouId)
        : 'Copiado. ' + avisoCopia(usouId));
    };
    $('#mf-cid').onclick = () => {
      atualizarFila();
      copiar(true);
      atualizarUI();
      msg(executando
        ? 'Cópia PARCIAL (' + resumoParcial() + ') com o número da proposta na 1ª coluna. A coleta continua rodando.'
        : 'Copiado com o número da proposta na 1ª coluna.');
    };
    $('#mf-cfull').onclick = () => {
      atualizarFila();
      if (!fila().length) return msg('Não há propostas na fila. Leia a tela ou cole a lista e faça a coleta antes.');
      copiarCompleta();
      msg((executando ? 'Cópia PARCIAL (' + resumoParcial() + '). ' : '') + AVISO_COMPLETA);
    };
    $('#mf-colr').onclick = () => {
      atualizarFila();
      const dados = GM_getValue('dados', {});
      const meta = GM_getValue('meta', {});
      const ig = ignoradas();
      const f = fila();
      if (!f.length) return msg('Não há propostas na fila. Leia a tela ou cole a lista e faça a coleta antes.');
      const motivos = f.map(id => (ig[id] ? '' : motivoColunaR(dados[id], meta[id])));
      emitir(motivos.map(x => [x]));
      const sem = f.filter(id => !ig[id] && !completo(dados[id])).length;
      const com = motivos.filter(Boolean).length;
      msg((executando ? 'Cópia PARCIAL. ' : '') + 'Motivo copiado na ordem da lista: ' + com + ' com motivo, ' + (f.length - com) + ' em branco' +
        (sem ? ' (' + sem + ' ainda sem coleta completa)' : '') + '. Cole na coluna R, na primeira linha da lista. ' +
        'Linhas em branco apagam o que já estiver digitado na R (ex.: Divergência Documentação).');
    };
    $('#mf-fal').onclick = () => {
      const f = faltantes();
      msg(f.length ? 'Incompletas:\n' + f.join('\n') : 'Tudo completo!');
    };
    $('#mf-dbg').onclick = () => {
      const dados = GM_getValue('dados', {});
      const dbg = GM_getValue('debug', {});
      const debug = {};
      let n = 0;
      // todas as propostas da fila; a árvore completa só para as 3 primeiras incompletas
      fila().forEach(id => {
        const d = dbg[id];
        if (!d) return;
        const incompleta = !completo(dados[id]);
        debug[id] = (incompleta && n++ < 3) ? d : { ...d, esqueleto: undefined, dentroDasRaizes: undefined, historico: undefined, memoriaEsqueleto: undefined };
      });
      if (dbg['sem-id']) debug['sem-id'] = dbg['sem-id'];
      GM_setClipboard(JSON.stringify({
        versao: VERSAO, modo: modo(),
        config: Object.fromEntries(Object.keys(PADRAO).map(k => [k, cfg(k)])),
        contasCadastradas: contas().length, trocaPendente: !!GM_getValue('trocaConta', null),
        dados, fila: fila(), faltam: faltantes(), falhas, ignoradas: ignoradas(), verificadas: verificadas().length,
        extraDbg: GM_getValue('extraDbg', {}),
        // horário/loja/analista da tabela da tela: só mostra se o campo existe (sem nomes de clientes)
        meta: Object.fromEntries(fila().map(id => { const m = GM_getValue('meta', {})[id]; return [id, m ? { dh: !!m.dh, loja: !!m.loja, ana: !!m.ana, sit: !!m.sit, cli: !!m.cli } : null]; })),
        debug,
      }, null, 1), 'text');
      msg('Diagnóstico copiado.');
    };

    /* ================= CCBs (Fila de Propostas) =================
       Mesma lógica do script antigo do Console, usando as funções do próprio sistema:
       objFilaPropostas.FilaPropostas('X')            -> pesquisa (/FilaPropostas/FilaPropostasLista)
       objFilaPropostas.MostraDetalheProposta(id,'C') -> cadastro (/FilaPropostas/DetalhePropostaCadastro): confere nome e CPF
       objFilaPropostas.DetalheProposta('D')          -> documentos (/FilaPropostas/DetalhePropostaDocumentos)
       DetalhePropostaDocumentos.Download(doc, nome)  -> arquivo (/Documentos/BaixaDocumento)
       Cada passo espera a resposta do sistema (ajaxComplete do jQuery da página). */
    const ccb = { rodando: false, parar: false };
    const normalizarNome = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
    const filaPronta = () => {
      try {
        const o = PAGINA.objFilaPropostas;
        return !!(PAGINA.jQuery && o && typeof o.FilaPropostas === 'function' &&
          typeof o.MostraDetalheProposta === 'function' && typeof o.DetalheProposta === 'function');
      } catch (_) { return false; }
    };
    // colunas da fila (as mesmas do script antigo: 2 situação, 3 cliente, 9 assinatura); se o cabeçalho mostrar outra ordem, segue o cabeçalho
    const COLS_FILA = { sit: 2, cli: 3, ass: 9 };
    function colunasFila(tab) {
      const ths = [...tab.querySelectorAll('thead th')].map(th => th.textContent.replace(/\s+/g, ' ').trim().toLowerCase());
      if (!ths.length) return COLS_FILA;
      if (/^sit\b|situa/.test(ths[2] || '') && /client|nome/.test(ths[3] || '')) return COLS_FILA;   // no sistema o cabeçalho é "Sit"
      const sit = ths.findIndex(x => /^sit\b|situa/.test(x)), cli = ths.findIndex(x => /client|nome/.test(x)), ass = ths.findIndex(x => /assina/.test(x));
      return sit >= 0 && cli >= 0 && ass >= 0 ? { sit, cli, ass } : COLS_FILA;
    }
    function linhasFila() {
      const tab = document.querySelector('#tabPropostasLista');
      if (!tab) return [];
      const ci = colunasFila(tab);
      return [...tab.querySelectorAll('tbody tr')].map(tr => {
        const cels = [...tr.cells].map(td => td.textContent.replace(/\s+/g, ' ').trim());
        const alvo = tr.querySelector('[onclick*="MostraDetalheProposta"]');
        const cmd = alvo ? alvo.getAttribute('onclick') || '' : '';
        const id = (cmd.match(/MostraDetalheProposta\(\s*['"]([^'"]+)['"]/) || [])[1] || '';
        const numero = cels.find(c => /^\d{3,9}$/.test(c)) || '';
        return { id, numero, sit: cels[ci.sit] || '', nome: cels[ci.cli] || '', ass: cels[ci.ass] || '', cels };
      }).filter(l => l.id);
    }
    const ehEfetivada = sit => /^(\d+\s*-\s*)?EFETIVADA$/i.test(String(sit || '').trim());
    const elegivelCCB = l => ehEfetivada(l.sit) && /assinado digitalmente/i.test(l.ass);

    class ErroCCB extends Error { constructor(m, parar) { super(m); this.parar = !!parar; } }
    // registra a espera ANTES de chamar a ação (a resposta pode chegar muito rápido)
    const aguardarResposta = (trecho, acao) => new Promise((resolve, reject) => {
      const jq = PAGINA.jQuery;
      let timer = null, feito = false;
      const handler = (_ev, xhr, settings) => {
        if (feito || !String((settings && settings.url) || '').includes(trecho)) return;
        fim();
        const st = xhr ? xhr.status : 0;
        // sessão vencida: o ER responde 200 com o aviso "Sua sessão de trabalho expirou" no lugar da lista/do detalhe
        if (st === 200 && xhr && typeof xhr.responseText === 'string' && erSemSessao(xhr.responseText)) {
          return reject(new ErroCCB('A sessão do ER expirou. Entre no ER de novo e clique em Baixar CCBs para continuar.', true));
        }
        if (st === 200) resolve(); else reject(new ErroCCB('O sistema retornou uma resposta inesperada (' + st + ') em ' + trecho.split('/').pop() + '.', true));
      };
      const fim = () => { feito = true; clearTimeout(timer); try { jq(PAGINA.document).off('ajaxComplete', handler); } catch (_) {} };
      try { jq(PAGINA.document).on('ajaxComplete', handler); } catch (e) { return reject(new ErroCCB('Não foi possível acompanhar as respostas do sistema.', true)); }
      timer = setTimeout(() => { if (feito) return; fim(); reject(new ErroCCB('Tempo limite aguardando o sistema (' + trecho.split('/').pop() + ').', true)); }, CONFIG.TIMEOUT_CCB * 1000);
      try { acao(); } catch (e) { fim(); reject(new ErroCCB('Falha ao acionar o sistema: ' + e.message, true)); }
    });
    const fecharDetalhe = () => { try { PAGINA.jQuery('#dlgDetalheProposta').modal('hide'); } catch (_) {} };
    const funcaoDownload = () => {
      try { if (PAGINA.DetalhePropostaDocumentos && typeof PAGINA.DetalhePropostaDocumentos.Download === 'function') return PAGINA.DetalhePropostaDocumentos; } catch (_) {}
      try {   // declarado com let/const no script da página: não fica em window
        const o = PAGINA.eval('typeof DetalhePropostaDocumentos !== "undefined" ? DetalhePropostaDocumentos : null');
        if (o && typeof o.Download === 'function') return o;
      } catch (_) {}
      return null;
    };

    async function baixarUmaCCB(item, ign, jaBaixadas) {
      const porNumero = /^\d+$/.test(item);
      const casa = l => (porNumero ? l.numero === item || l.id === item : normalizarNome(l.nome) === normalizarNome(item));
      let linhas = linhasFila();
      if (!linhas.some(casa)) {
        // 1. pesquisa no sistema
        const campo = PAGINA.document.querySelector('#txtPropostasPesquisa');
        if (!campo) throw new ErroCCB('Campo de pesquisa da fila não encontrado.', true);
        await aguardarResposta('/FilaPropostas/FilaPropostasLista', () => {
          campo.value = item;
          PAGINA.jQuery(campo).trigger('input');
          PAGINA.objFilaPropostas.FilaPropostas('X');
        });
        linhas = linhasFila();
      }
      // 2. exatamente uma proposta efetivada e assinada
      const corresp = linhas.filter(casa);
      if (!corresp.length) throw new ErroCCB('não encontrada na fila');
      if (ign && corresp.some(l => motivoIgnorar(l.cels))) throw new ErroCCB('proposta de teste ou cancelada (ignorada)');
      const eleg = corresp.filter(elegivelCCB);
      if (eleg.length !== 1) throw new ErroCCB(eleg.length ? 'mais de uma proposta efetivada e assinada' : 'nenhuma proposta efetivada e assinada digitalmente');
      const l = eleg[0];
      // a mesma proposta informada duas vezes (ex.: pelo nome e pelo número) não é baixada de novo
      if (jaBaixadas.has(l.id)) throw new ErroCCB('repetida: a proposta ' + (l.numero || l.id) + ' já foi baixada neste lote');

      // 3. cadastro: confere nome e CPF
      await aguardarResposta('/FilaPropostas/DetalhePropostaCadastro', () => PAGINA.objFilaPropostas.MostraDetalheProposta(l.id, 'C'));
      const raiz = document.querySelector('#divDetalhePropostaBody');
      const linhaCad = [...(raiz ? raiz.querySelectorAll('tr') : [])].find(tr => {
        const rot = [...tr.querySelectorAll('small')].map(el => el.textContent.trim());
        return rot.includes('Nome do Cliente') && rot.includes('CPF');
      });
      if (!linhaCad) throw new ErroCCB('não encontrei nome e CPF no cadastro');
      const tds = [...linhaCad.querySelectorAll('td')];
      const valorDe = rot => { const td = tds.find(x => (x.querySelector('small') || {}).textContent?.trim() === rot); const b = td && td.querySelector('b'); return b ? b.textContent.trim() : ''; };
      const nomeCad = valorDe('Nome do Cliente');
      const cpf = valorDe('CPF').replace(/\D/g, '');
      if (!nomeCad || normalizarNome(nomeCad) !== normalizarNome(l.nome) || (!porNumero && normalizarNome(nomeCad) !== normalizarNome(item))) {
        throw new ErroCCB('o nome do cadastro não corresponde à proposta', true);
      }
      if (!/^\d{11}$/.test(cpf)) throw new ErroCCB('CPF ausente ou inválido no cadastro');

      // 4. documentos: somente a CCB assinada
      await aguardarResposta('/FilaPropostas/DetalhePropostaDocumentos', () => PAGINA.objFilaPropostas.DetalheProposta('D'));
      const docs = [...(document.querySelector('#divDetalhePropostaBody') || document).querySelectorAll('.product-info[documento][nome]')];
      const ccbs = docs.filter(el => /^CCB ASSINADA_.*\.PDF$/i.test(el.getAttribute('nome') || ''));
      if (ccbs.length !== 1) throw new ErroCCB(ccbs.length ? 'mais de uma CCB assinada' : 'CCB assinada não encontrada nos documentos');
      const idDoc = ccbs[0].getAttribute('documento');
      if (!/^\d+$/.test(idDoc || '')) throw new ErroCCB('identificador do documento inválido');

      // 5. nome do arquivo: CPF_NOME_COMPLETO.pdf
      const nomeSeguro = nomeCad.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
        .replace(/\s+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
      const nomeArquivo = cpf + '_' + nomeSeguro + '.pdf';

      // 6. download pelo próprio sistema
      const dl = funcaoDownload();
      if (dl) {
        await aguardarResposta('/Documentos/BaixaDocumento', () => dl.Download(Number(idDoc), nomeArquivo));
      } else {
        // reserva: o botão de download do próprio documento (o nome do arquivo fica o do sistema)
        const btn = ccbs[0].matches('[onclick*="Download"]') ? ccbs[0] : ccbs[0].querySelector('[onclick*="Download"], a, button');
        if (!btn) throw new ErroCCB('função de download do sistema não encontrada', true);
        await aguardarResposta('/Documentos/BaixaDocumento', () => btn.click());
      }
      jaBaixadas.add(l.id);
      fecharDetalhe();
      await sleep(700);
      return { proposta: l.numero || l.id, arquivo: nomeArquivo };
    }

    const ccbStatus = t => ($('#mf-ccb-st').textContent = t);
    $('#mf-ccb-ler').onclick = () => {
      if (ccb.rodando) return;
      const ls = linhasFila();
      if (!ls.length) return msg(document.querySelector('#tabPropostasLista') ? 'A Fila de Propostas está aberta, mas a lista está vazia: pesquise na Fila e clique de novo.' : 'Não achei a lista da Fila de Propostas nesta tela (#tabPropostasLista). Abra a Fila de Propostas.');
      const ign = cfg('ignorarCanceladasTestes');
      const eleg = ls.filter(l => elegivelCCB(l) && !(ign && motivoIgnorar(l.cels)));
      $('#mf-ccb-lista').value = [...new Set(eleg.map(l => l.numero || l.id))].join('\n');
      msg(eleg.length + ' de ' + ls.length + ' propostas da fila estão efetivadas e assinadas. Revise a lista e clique em Baixar CCBs.');
    };
    $('#mf-ccb-parar').onclick = () => { if (ccb.rodando) { ccb.parar = true; ccbStatus('Parando depois do download atual...'); } };
    $('#mf-ccb-baixar').onclick = async () => {
      if (ccb.rodando) return;
      if (executando) return msg('Há uma coleta de relatório rodando. Pause antes de baixar CCBs.');
      if (!contaConfirmada()) return msg('Download não iniciado: confirme a conta ativa na aba Contas.');
      if (!filaPronta()) return msg('A Fila de Propostas não está pronta nesta tela. Abra a Fila de Propostas (com a lista carregada) e tente de novo.');
      const brutos = $('#mf-ccb-lista').value.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (!brutos.length) return msg('Informe os nomes ou números das propostas (um por linha), ou clique em "Ler propostas elegíveis da fila".');
      const vistos = new Set(), itens = [];
      brutos.forEach(x => { const k = /^\d+$/.test(x) ? x : normalizarNome(x); if (!vistos.has(k)) { vistos.add(k); itens.push(x); } });
      const ign = cfg('ignorarCanceladasTestes');
      ccb.rodando = true; ccb.parar = false;
      $('#mf-ccb-baixar').disabled = true; $('#mf-ccb-parar').disabled = false; $('#mf-ccb-ler').disabled = true;
      const ok = [], erros = [], jaBaixadas = new Set();
      let interrompido = '';
      fecharDetalhe();
      try {
        for (let i = 0; i < itens.length; i++) {
          if (ccb.parar) { interrompido = 'parado pelo usuário'; break; }
          ccbStatus('Baixando ' + (i + 1) + ' de ' + itens.length + '...');
          try {
            const r = await baixarUmaCCB(itens[i], ign, jaBaixadas);
            ok.push(r.proposta);
          } catch (e) {
            fecharDetalhe();
            erros.push((i + 1) + '. ' + itens[i] + ': ' + e.message);
            // erro de comunicação com o sistema: o estado da tela é incerto, então para o lote
            if (e.parar) { interrompido = 'interrompido no item ' + (i + 1); break; }
          }
        }
      } finally {
        ccb.rodando = false;
        $('#mf-ccb-baixar').disabled = false; $('#mf-ccb-parar').disabled = true; $('#mf-ccb-ler').disabled = false;
      }
      ccbStatus(ok.length + ' baixada(s), ' + erros.length + ' com problema' + (interrompido ? ' · ' + interrompido : '') + '.');
      msg('CCBs: ' + ok.length + ' de ' + itens.length + ' download(s) solicitado(s)' + (ok.length ? ' (propostas ' + ok.join(', ') + ')' : '') + '.' +
        (erros.length ? '\nNão baixadas:\n' + erros.join('\n') : '') + (interrompido ? '\nLote ' + interrompido + '.' : ''));
    };


    /* ================= CONTAS (troca rápida) =================
       Sem senhas: o script guarda só apelido + usuário (local, por navegador). A troca usa o fluxo oficial:
       botão "Sair" do sistema -> tela de login (usuário preenchido; senha pelo usuário ou pelo gerenciador de
       senhas do navegador) -> depois do login, confere a conta ativa no topo da página. */
    const contas = () => GM_getValue('contas', []);
    const rotuloConta = c => (c.apelido ? c.apelido + ' (' + c.usuario + ')' : c.usuario);
    const escRe = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const visivel = el => !!el && !painel.contains(el) && el.offsetParent !== null;
    // tela de login do sistema: #txtUsuario ("Código de Usuário") e #txtSenha; os genéricos ficam de reserva
    const campoSenha = () => [document.querySelector('#frmLogin #txtSenha'), ...document.querySelectorAll('input[type=password]')].find(visivel) || null;
    const campoUsuario = senha => {
      const id = document.querySelector('#frmLogin #txtUsuario');
      if (visivel(id)) return id;
      const raiz = senha.form || senha.closest('form') || document;
      const cands = [...raiz.querySelectorAll('input')].filter(i => visivel(i) && /^(text|email|)$/i.test(i.getAttribute('type') || ''));
      const antes = cands.filter(i => i.compareDocumentPosition(senha) & Node.DOCUMENT_POSITION_FOLLOWING);
      return antes[antes.length - 1] || cands[0] || null;
    };
    // conta ativa: procura o usuário (ou o apelido) cadastrado no topo/menu da página — nunca nas tabelas de propostas
    // usuário logado, no topo do menu lateral: <div id="divNomeCliente"><p>ARTHUR MESA</p><a><i class="fa fa-user"></i> ARTHURMESA</a>
    const usuarioLogado = () => {
      const box = document.querySelector('#divNomeCliente');
      if (!box) return null;
      const a = [...box.querySelectorAll('a')].find(x => x.querySelector('.fa-user'));
      const codigo = a ? a.textContent.replace(/\s+/g, ' ').trim() : '';
      if (!codigo || codigo.length > 80) return null;
      const p = box.querySelector('p');
      return { codigo, nome: p ? p.textContent.replace(/\s+/g, ' ').trim() : '' };
    };
    function contaAtiva() {
      const lista = contas();
      const log = usuarioLogado();
      if (log) {   // fonte oficial: o código do usuário mostrado pelo sistema
        const c = lista.find(x => x.usuario.toLowerCase() === log.codigo.toLowerCase());
        return c || { usuario: log.codigo, apelido: log.nome, naoCadastrada: true };
      }
      if (!lista.length) return null;
      const SEL = 'header, nav, .navbar, .navbar-header, .navbar-right, .user-info, .user-panel, .dropdown-user, [class*="usuario" i], [id*="usuario" i], [class*="user" i], [id*="user" i]';
      const textos = [...document.querySelectorAll(SEL)].filter(el => !painel.contains(el) && !el.closest('table'))
        .map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(t => t && t.length < 600);
      const achadas = lista.filter(c => [c.usuario, c.apelido].filter(Boolean)
        .some(n => textos.some(t => new RegExp('(^|[^\\wÀ-ÿ])' + escRe(n) + '($|[^\\wÀ-ÿ])', 'i').test(t))));
      return achadas.length === 1 ? achadas[0] : null;   // nenhuma ou mais de uma: não dá para afirmar
    }
    const linkSair = () => {
      const els = [...document.querySelectorAll('a, button, [onclick]')].filter(el => !painel.contains(el));
      return els.find(el => /^(sair|logout|log ?off|desconectar|encerrar sess[ãa]o)$/i.test((el.textContent || '').replace(/\s+/g, ' ').trim() || el.getAttribute('title') || ''))
        || els.find(el => el.tagName === 'A' && /(logout|logoff|signout|\/sair\b)/i.test(el.getAttribute('href') || '')) || null;
    };

    // senhas: chave separada das contas, nunca exibidas nem incluídas no diagnóstico
    const senhas = () => GM_getValue('senhasContas', {}) || {};
    // id desta aba (sessionStorage: continua igual quando a própria aba recarrega; outra aba tem outro)
    const ABA_ID = (() => { try { let v = sessionStorage.getItem('mfAbaId'); if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('mfAbaId', v); } return v; } catch (_) { return Math.random().toString(36).slice(2, 10); } })();
    const guardarSenha = (usuario, senha) => {
      const sx = senhas();
      if (senha) sx[usuario.toLowerCase()] = senha; else delete sx[usuario.toLowerCase()];
      // senha nova para a conta cujo login automático foi recusado: libera uma nova tentativa
      if (senha && String(GM_getValue('loginAutoBloqueado', '')).toLowerCase() === usuario.toLowerCase()) GM_deleteValue('loginAutoBloqueado');
      if (Object.keys(sx).length) GM_setValue('senhasContas', sx); else GM_deleteValue('senhasContas');
    };
    $('#mf-conta-ver').onclick = () => { const i = $('#mf-conta-senha'); i.type = i.type === 'password' ? 'text' : 'password'; };
    // conta já escolhida no "Trocar de conta": a conta de onde se saiu na última troca (ex.: entrou na master,
    // o menu já mostra a conta da mesa para voltar num clique); sem ela, a primeira conta que não é a ativa
    function contaPadraoIndice(lista) {
      const a = contaAtiva(), ativa = a ? a.usuario.toLowerCase() : '';
      const anterior = String(GM_getValue('contaAnterior', '') || '').toLowerCase();
      let i = anterior && anterior !== ativa ? lista.findIndex(c => c.usuario.toLowerCase() === anterior) : -1;
      if (i < 0) i = lista.findIndex(c => c.usuario.toLowerCase() !== ativa);
      return Math.max(0, i);
    }
    function desenharContas() {
      const lista = contas();
      const sel = $('#mf-conta-sel');
      sel.innerHTML = '';
      lista.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = rotuloConta(c); sel.appendChild(o); });
      if (lista.length) sel.value = String(contaPadraoIndice(lista));
      $('#mf-conta-trocar').disabled = !lista.length;
      const caixa = $('#mf-contas');
      caixa.innerHTML = lista.length ? '' : '<div class="mf-info">Nenhuma conta cadastrada.</div>';
      lista.forEach((c, i) => {
        const lin = document.createElement('div');
        lin.className = 'mf-conta';
        const nome = document.createElement('span');
        nome.textContent = rotuloConta(c);
        const tr = document.createElement('button'); tr.className = 'azul'; tr.textContent = 'Trocar';
        tr.title = 'Trocar para esta conta';
        tr.onclick = () => trocarPara(c);
        const ed = document.createElement('button'); ed.className = 'cinza'; ed.textContent = 'Editar';
        ed.onclick = () => { $('#mf-conta-apelido').value = c.apelido || ''; $('#mf-conta-usuario').value = c.usuario; };
        const ex = document.createElement('button'); ex.className = 'vermelho'; ex.textContent = 'Excluir';
        ex.onclick = () => {
          if (!confirm('Excluir a conta ' + rotuloConta(c) + ' deste navegador?')) return;
          GM_setValue('contas', contas().filter((_, k) => k !== i));
          guardarSenha(c.usuario, null);
          desenharContas();
        };
        const temSenha = !!senhas()[c.usuario.toLowerCase()];
        if (temSenha) nome.textContent += ' 🔒';
        nome.title = temSenha ? 'Senha salva neste navegador: login automático' : 'Sem senha salva: login manual';
        const rs = document.createElement('button'); rs.className = 'cinza'; rs.textContent = 'Tirar senha';
        rs.onclick = () => { guardarSenha(c.usuario, null); desenharContas(); msg('Senha de ' + c.usuario + ' removida deste navegador.'); };
        lin.append(nome, tr, ed);
        if (temSenha) lin.append(rs);
        lin.append(ex);
        caixa.appendChild(lin);
      });
      const a = contaAtiva();
      const t = GM_getValue('trocaConta', null);
      $('#mf-contas-qtd').textContent = '(' + lista.length + ')';
      aplicarDobraContas();
      $('#mf-conta-ativa').textContent = (a ? rotuloConta(a) : 'não identificada na página') + (t ? ' · troca para ' + t.usuario + ' pendente' : '');
    }
    $('#mf-conta-salvar').onclick = () => {
      const usuario = $('#mf-conta-usuario').value.trim();
      const apelido = $('#mf-conta-apelido').value.trim().slice(0, 40);
      // nome da conta (apelido) e usuário de login são campos distintos; espaços e acentos são mantidos como digitados
      if (!usuario || usuario.length > 80) return msg('Informe o usuário de login.');
      const lista = contas();
      const i = lista.findIndex(c => c.usuario.toLowerCase() === usuario.toLowerCase());
      if (i >= 0) lista[i] = { usuario, apelido }; else lista.push({ usuario, apelido });
      GM_setValue('contas', lista);
      const senha = $('#mf-conta-senha').value;
      if (senha) guardarSenha(usuario, senha);   // em branco: mantém a senha que já estava salva
      $('#mf-conta-usuario').value = ''; $('#mf-conta-apelido').value = ''; $('#mf-conta-senha').value = ''; $('#mf-conta-senha').type = 'password';
      desenharContas();
      msg('Conta ' + usuario + (i >= 0 ? ' atualizada.' : ' adicionada.'));
    };
    // lista de contas recolhível (lembra a última escolha)
    const aplicarDobraContas = () => {
      const aberta = !GM_getValue('contasRecolhidas', true);
      $('#mf-contas-corpo').style.display = aberta ? '' : 'none';
      $('#mf-contas-tit').classList.toggle('aberta', aberta);
    };
    $('#mf-contas-tit').onclick = () => { GM_setValue('contasRecolhidas', !GM_getValue('contasRecolhidas', true)); aplicarDobraContas(); };
    $('#mf-conta-trocar').onclick = () => trocarPara(contas()[$('#mf-conta-sel').value]);
    // só roda por clique explícito (botão Trocar); a confirmação do script é opcional (Configurações > Contas)
    function trocarPara(c) {
      if (executando || ccb.rodando) return msg('Pause a coleta ou o download de CCBs antes de trocar de conta.');
      if (!c) return msg('Cadastre uma conta primeiro.');
      if (!cfg('trocaSemConfirmacao') &&
          !confirm('Trocar para ' + rotuloConta(c) + '?\nA sessão atual será encerrada pelo "Sair" do sistema, em todas as abas deste navegador.')) return;
      const atual = contaAtiva();   // lembrada para o menu já oferecer a volta (ver contaPadraoIndice)
      if (atual && atual.usuario.toLowerCase() !== c.usuario.toLowerCase()) GM_setValue('contaAnterior', atual.usuario);
      GM_setValue('trocaConta', { usuario: c.usuario, quando: Date.now(), etapa: 'saindo' });
      const senha = campoSenha();
      if (senha) return processarTroca();   // já está na tela de login
      const sair = linkSair();
      if (sair) { msg('Encerrando a sessão atual...'); sair.click(); }
      else msg('Não encontrei o botão "Sair" nesta tela. Saia pelo menu do sistema; na tela de login o usuário ' + c.usuario + ' será preenchido.');
    }
    // roda a cada carregamento de página: tela de login = preenche o usuário; depois do login = confere a conta
    function processarTroca() {
      const t = GM_getValue('trocaConta', null);
      if (!t) return;
      if (Date.now() - t.quando > 15 * 60 * 1000) { GM_deleteValue('trocaConta'); return; }
      const senha = campoSenha();
      if (senha) {
        // login automático (sessão expirada) começado por OUTRA aba: só uma aba entra; esta espera e recarrega
        if (t.auto && t.aba !== ABA_ID && t.etapa !== 'falhou') {
          if (Date.now() - t.quando < CONFIG.LOGIN_AUTO_OUTRA_ABA_LIMITE_S * 1000) {
            msg('Sessão expirada: outra aba do ER está entrando com ' + t.usuario + '. Esta aba recarrega em seguida.');
            setTimeout(() => location.reload(), CONFIG.LOGIN_AUTO_OUTRA_ABA_MS);
            return;
          }
          GM_setValue('trocaConta', { ...t, aba: ABA_ID, etapa: 'login', quando: Date.now() });   // a outra aba sumiu: esta assume
          return processarTroca();
        }
        const u = campoUsuario(senha);
        if (u && u.value !== t.usuario) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(u, t.usuario);
          u.dispatchEvent(new Event('input', { bubbles: true }));
          u.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (t.etapa === 'saindo' || t.etapa === 'conferir') GM_setValue('trocaConta', { ...t, etapa: 'login' });
        setTimeout(() => { try { senha.focus(); } catch (_) {} }, 300);
        mostrarAba('cta');
        const pw = senhas()[t.usuario.toLowerCase()];
        // login automático: só com senha salva, sem captcha visível e uma única tentativa por troca (senha errada não fica em laço)
        const capt = document.querySelector('#txtCaptcha');
        const temCaptcha = (capt && capt.type !== 'hidden') ||
          [...document.querySelectorAll('.g-recaptcha, iframe[src*="captcha" i], img[src*="captcha" i], [id*="captcha" i]:not(input[type=hidden])')].some(visivel);
        const btn = document.querySelector('#frmLogin button[onclick*="Login"]') || (senha.form && senha.form.querySelector('button, input[type=submit]'));
        if (u && pw && t.etapa !== 'enviado' && t.etapa !== 'falhou' && !temCaptcha && btn) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(senha, pw);
          senha.dispatchEvent(new Event('input', { bubbles: true }));
          senha.dispatchEvent(new Event('change', { bubbles: true }));
          GM_setValue('trocaConta', { ...t, etapa: 'enviado', enviadoEm: Date.now() });
          msg('Entrando automaticamente com ' + t.usuario + '...');
          setTimeout(() => btn.click(), 400);
          // o sistema pode recusar sem recarregar a página: se a tela de login continuar, avisa e não tenta de novo
          setTimeout(() => {
            if (!campoSenha()) return;
            GM_setValue('trocaConta', { ...(GM_getValue('trocaConta', null) || t), etapa: 'falhou' });
            if (t.auto) GM_setValue('loginAutoBloqueado', t.usuario);   // senha recusada: o login automático para até entrar à mão
            msg('O login automático de ' + t.usuario + ' não foi concluído. Confira a mensagem do sistema e a senha salva (aba Contas) e entre manualmente.');
          }, 10000);
          return;
        }
        if (t.etapa === 'enviado') GM_setValue('trocaConta', { ...t, etapa: 'falhou' });
        if (t.auto && (t.etapa === 'enviado' || t.etapa === 'falhou')) GM_setValue('loginAutoBloqueado', t.usuario);
        msg(!u ? 'Tela de login: não achei o campo de usuário. Entre com ' + t.usuario + '.'
          : t.etapa === 'enviado' || t.etapa === 'falhou' ? 'O login automático de ' + t.usuario + ' não foi aceito. Confira a senha salva na aba Contas e entre manualmente (não tento de novo para não bloquear a conta).'
          : temCaptcha && pw ? 'Tela de login com verificação (captcha): usuário ' + t.usuario + ' preenchido; complete a verificação e entre.'
          : 'Tela de login: usuário ' + t.usuario + ' preenchido. Digite a senha (ou salve a senha na aba Contas para entrar sozinho).');
        return;
      }
      if (t.etapa === 'saindo' && Date.now() - t.quando < 3000) return;   // ainda é a página de onde saiu
      const a = contaAtiva();
      if (t.auto) {   // login automático: já está logado (por ele ou à mão); não é uma troca de conta para conferir
        GM_deleteValue('trocaConta');
        if (a && a.usuario.toLowerCase() === t.usuario.toLowerCase() && t.etapa === 'enviado') msg('Sessão do ER tinha expirado: entrei de novo com ' + rotuloConta(a) + '.');
        return;
      }
      if (a && a.usuario.toLowerCase() === t.usuario.toLowerCase()) {
        GM_deleteValue('trocaConta');
        msg('Troca concluída: conta ativa ' + rotuloConta(a) + '.');
      } else {
        GM_setValue('trocaConta', { ...t, etapa: 'conferir' });
        msg(a ? 'ATENÇÃO: a conta ativa é ' + rotuloConta(a) + ', não ' + t.usuario + '. Saia e entre com a conta certa.'
          : 'Não consegui confirmar na página se a conta ativa é ' + t.usuario + '. Confira no topo do sistema antes de rodar relatórios.');
      }
    }
    // antes de rodar relatórios ou baixar CCBs: troca pendente/não confirmada exige a confirmação do usuário
    const contaConfirmada = () => {
      const t = GM_getValue('trocaConta', null);
      if (!t) return true;
      const a = contaAtiva();
      if (a && a.usuario.toLowerCase() === t.usuario.toLowerCase()) { GM_deleteValue('trocaConta'); return true; }
      if (!confirm('A troca para a conta ' + t.usuario + ' não foi confirmada (conta ativa: ' + (a ? rotuloConta(a) : 'não identificada') + ').\nContinuar mesmo assim?')) return false;
      GM_deleteValue('trocaConta');
      return true;
    };
    /* ---- login automático quando a sessão do ER expira ----
       Cada página logada guarda a conta em uso (GM 'ultimaContaER'). Na tela de login, sem troca de conta em andamento,
       o painel entra com essa conta pelo mesmo caminho da troca (processarTroca): só com a senha salva em Contas, sem
       captcha visível e UMA tentativa. Senha recusada = 'loginAutoBloqueado' até entrar à mão ou salvar outra senha.
       Com várias abas, só a aba que começou entra; as outras esperam e recarregam. A janela de sessão expirada que o
       sistema abre por cima da página (#dlgRelogin) leva para a tela de login. Desliga em Configurações > Contas. */
    function lembrarConta() {
      const u = usuarioLogado();
      if (!u) return;
      if (GM_getValue('ultimaContaER', '') !== u.codigo) GM_setValue('ultimaContaER', u.codigo);
      if (String(GM_getValue('loginAutoBloqueado', '')).toLowerCase() === u.codigo.toLowerCase()) GM_deleteValue('loginAutoBloqueado');   // entrou: libera
      GM_deleteValue('erSaiuManual');
    }
    // "Sair" clicado pelo funcionário (não é sessão expirada): não entra sozinho de novo até um novo login (vale para todas as abas)
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a, button, [onclick]');
      if (!a || painel.contains(a) || GM_getValue('trocaConta', null)) return;   // a troca de conta do painel também passa pelo Sair
      if (/\bSair\s*\(/.test(a.getAttribute('onclick') || '') || /^sair$/i.test((a.textContent || '').trim())) GM_setValue('erSaiuManual', Date.now());
    }, true);
    // conta e motivo para não entrar sozinho ('' = pode entrar)
    const loginAutoConta = () => {
      const usuario = String(GM_getValue('ultimaContaER', '') || '');
      if (!cfg('loginAuto') || !usuario) return { usuario, motivo: 'desligado' };
      if (GM_getValue('erSaiuManual', 0)) return { usuario, motivo: 'desligado' };   // saiu pelo "Sair": entra quem o funcionário quiser
      if (!senhas()[usuario.toLowerCase()]) return { usuario, motivo: 'Sessão do ER expirada: salve a senha de ' + usuario + ' na lista de contas (aba Contas) para o painel entrar sozinho.' };
      if (String(GM_getValue('loginAutoBloqueado', '')).toLowerCase() === usuario.toLowerCase())
        return { usuario, motivo: 'Login automático parado: a senha salva de ' + usuario + ' foi recusada. Entre à mão ou salve a senha certa na aba Contas.' };
      return { usuario, motivo: '' };
    };
    function loginAutomatico() {
      if (GM_getValue('trocaConta', null) || !campoSenha() || usuarioLogado()) return;
      const { usuario, motivo } = loginAutoConta();
      if (motivo) { if (motivo !== 'desligado') msg(motivo); return; }
      GM_setValue('trocaConta', { usuario, quando: Date.now(), etapa: 'login', auto: true, aba: ABA_ID });
    }
    // sessão vencida na tela: a janela #dlgRelogin por cima da página, a página /AvisoSessao/AvisoSessao ("Sua sessão de
    // trabalho expirou", que o ER abre ao recarregar) ou o mesmo aviso dentro da área principal (ao abrir um menu)
    const erAvisoSessaoNaTela = () => {
      const d = document.querySelector('#dlgRelogin');
      if (d && (d.classList.contains('in') || getComputedStyle(d).display === 'block')) return true;
      if (/\/AvisoSessao\//i.test(location.pathname)) return true;
      const pr = document.querySelector('#divPrincipal');
      return !!pr && erSemSessao(pr.textContent);
    };
    let reloginIndo = false;
    setInterval(() => {
      if (reloginIndo || !erAvisoSessaoNaTela()) return;
      if (GM_getValue('trocaConta', null) || loginAutoConta().motivo) return;
      reloginIndo = true;
      msg('Sessão do ER expirada: indo para a tela de login para entrar de novo com ' + loginAutoConta().usuario + '...');
      setTimeout(() => { location.href = cacBase() + '/'; }, CONFIG.LOGIN_AUTO_ESPERA_MS);
    }, CONFIG.LOGIN_AUTO_CONFERE_MS);
    lembrarConta();
    loginAutomatico();
    desenharContas();
    processarTroca();
    desenharContas();


    /* ================= GERADOR DE NEGOCIAÇÕES =================
       Texto montado SÓ com o que foi digitado: nada é inventado, salvo ou enviado.
       Os dados ficam em memória (campos da tela); o que fica salvo são os MODELOS (negModelos) e os dados
       para pagamento (negPagamento), que o próprio usuário cadastra em Configurações.
       Regras dos modelos:
         {{variavel}}            -> valor digitado (moeda em R$ 0,00, datas em dd/mm/aaaa)
         linha com variável vazia -> a linha sai do texto
         parágrafo (bloco entre linhas em branco) que tinha variáveis e perdeu todas -> sai inteiro (com o título) */
    const NG_CAMPOS = {
      nome: { rot: 'Nome do cliente', tipo: 'texto' },
      proposta: { rot: 'Nº da proposta', tipo: 'texto' },
      cpf: { rot: 'CPF (só se necessário)', tipo: 'texto' },
      valor_parcela: { rot: 'Valor atual da parcela', tipo: 'moeda' },
      parcelas_atraso: { rot: 'Parcelas em atraso', tipo: 'num' },
      dias_atraso: { rot: 'Dias de atraso', tipo: 'num' },
      vencimento_antigo: { rot: 'Vencimento mais antigo', tipo: 'data' },
      vencimento: { rot: 'Vencimento', tipo: 'data' },
      valor_entrada: { rot: 'Valor da entrada', tipo: 'moeda' },
      data_entrada: { rot: 'Data da entrada', tipo: 'data' },
      quantidade_parcelas: { rot: 'Quantidade de parcelas', tipo: 'num' },
      valor_desejado: { rot: 'Valor desejado por parcela', tipo: 'moeda' },
      valor_parcela_acordo: { rot: 'Valor de cada parcela', tipo: 'moeda' },
      dia_vencimento: { rot: 'Dia de vencimento', tipo: 'dia' },
      data_pagamento: { rot: 'Data de pagamento', tipo: 'data' },
      proximo_vencimento: { rot: 'Próximo vencimento', tipo: 'data' },
      pedido_cliente: { rot: 'Pedido do cliente (texto livre)', tipo: 'area' },
      condicoes: { rot: 'Condições', tipo: 'area' },
      instrucoes: { rot: 'Instruções de pagamento do setor', tipo: 'area' },
      prazo_pagamento: { rot: 'Prazo para pagamento', tipo: 'texto' },
      validade: { rot: 'Validade do acordo', tipo: 'data' },
      valor_inicial: { rot: 'Valor do pagamento inicial', tipo: 'moeda' },
      data_inicial: { rot: 'Data do pagamento inicial', tipo: 'data' },
      valor_restante: { rot: 'Valor restante', tipo: 'moeda' },
      data_restante: { rot: 'Data do valor restante', tipo: 'data' },
      prazo_dias_uteis: { rot: 'Validade (dias úteis)', tipo: 'num' },
      valor_solicitado: { rot: 'Valor solicitado pelo cliente', tipo: 'moeda' },
      vencimento_solicitado: { rot: 'Vencimento solicitado', tipo: 'data' },
      parcela_antecipada: { rot: 'Parcela antecipada (ex.: 03/10)', tipo: 'texto' },
      vencimento_original: { rot: 'Vencimento original da parcela', tipo: 'data' },
      valor_na_data_pagamento: { rot: 'Valor na data de pagamento', tipo: 'moeda' },
      incluir_ted: { rot: 'Incluir conta para TED/transferência', tipo: 'check' },
      observacoes: { rot: 'Observações', tipo: 'area' },
    };
    // variáveis que vêm de Configurações (não são digitadas por negociação)
    const NG_VARS_PAGAMENTO = { chave_pix: 'Chave PIX', banco: 'Banco', agencia: 'Agência', conta: 'Conta' };
    const NG_MODELOS = {
      pedido: {
        nome: 'Pedido de negociação', desc: 'Organiza o que o CLIENTE pediu, para encaminhar ao setor. Não indica aprovação.',
        campos: ['nome', 'proposta', 'cpf', 'valor_parcela', 'parcelas_atraso', 'dias_atraso', 'vencimento_antigo', 'valor_entrada', 'quantidade_parcelas', 'valor_desejado', 'dia_vencimento', 'data_pagamento', 'pedido_cliente', 'observacoes'],
        obrig: ['nome'], umDe: [['valor_entrada', 'quantidade_parcelas', 'valor_desejado', 'dia_vencimento', 'data_pagamento', 'pedido_cliente']],
        texto: 'Pedido de negociação\n\nCliente: {{nome}}\nProposta: {{proposta}}\nCPF: {{cpf}}\n\nSituação atual:\nValor da parcela: {{valor_parcela}}\nParcelas em atraso: {{parcelas_atraso}}\nDias em atraso: {{dias_atraso}}\nVencimento mais antigo: {{vencimento_antigo}}\n\nO cliente solicita:\nEntrada de {{valor_entrada}}\nQuantidade de parcelas: {{quantidade_parcelas}}\nValor por parcela: {{valor_desejado}}\nVencimento no dia {{dia_vencimento}}\nPagamento em {{data_pagamento}}\n\nPedido do cliente: {{pedido_cliente}}\n\nObservações: {{observacoes}}\n\nFico no aguardo do retorno do setor sobre a possibilidade desta negociação.',
      },
      acordo: {
        nome: 'Acordo realizado', desc: 'Registra as condições EFETIVAMENTE aceitas pelo cliente.',
        campos: ['nome', 'proposta', 'valor_entrada', 'data_entrada', 'quantidade_parcelas', 'valor_parcela_acordo', 'dia_vencimento', 'proximo_vencimento', 'condicoes', 'observacoes'],
        obrig: ['nome'], umDe: [['valor_entrada', 'valor_parcela_acordo', 'condicoes']],
        texto: 'Acordo realizado\n\nCliente: {{nome}}\nProposta: {{proposta}}\n\nCondições aceitas pelo cliente:\nEntrada: {{valor_entrada}}\nData da entrada: {{data_entrada}}\nParcelas: {{quantidade_parcelas}}\nValor de cada parcela: {{valor_parcela_acordo}}\nVencimento: todo dia {{dia_vencimento}}\nPróximo vencimento: {{proximo_vencimento}}\n\nOutras condições: {{condicoes}}\n\nObservações: {{observacoes}}',
      },
      retorno: {
        nome: 'Retorno do setor', desc: 'Repassa o que o SETOR autorizou, sem alterar as condições.',
        campos: ['nome', 'proposta', 'valor_entrada', 'quantidade_parcelas', 'valor_parcela_acordo', 'dia_vencimento', 'instrucoes', 'prazo_pagamento', 'validade', 'condicoes', 'observacoes'],
        obrig: ['nome'], umDe: [['valor_entrada', 'quantidade_parcelas', 'valor_parcela_acordo', 'condicoes']],
        rotulos: { valor_entrada: 'Entrada autorizada', quantidade_parcelas: 'Parcelas autorizadas', valor_parcela_acordo: 'Valor das parcelas autorizadas', dia_vencimento: 'Dia de vencimento autorizado', condicoes: 'Condições adicionais' },
        texto: 'Retorno do setor responsável\n\nCliente: {{nome}}\nProposta: {{proposta}}\n\nCondições autorizadas pelo setor:\nEntrada: {{valor_entrada}}\nParcelas: {{quantidade_parcelas}}\nValor das parcelas: {{valor_parcela_acordo}}\nVencimento: todo dia {{dia_vencimento}}\n\nInstruções de pagamento: {{instrucoes}}\nPrazo para pagamento: {{prazo_pagamento}}\nAcordo válido até {{validade}}\n\nCondições adicionais: {{condicoes}}\n\nObservações: {{observacoes}}',
      },
      folego: {
        nome: 'Campanha do Fôlego', desc: 'Condição da campanha: pagamento inicial e saldo restante, como informado.',
        campos: ['nome', 'proposta', 'condicoes', 'valor_inicial', 'data_inicial', 'valor_restante', 'data_restante', 'observacoes'],
        obrig: ['nome', 'valor_inicial', 'data_inicial'],
        rotulos: { condicoes: 'Condições da campanha' },
        texto: 'Campanha do Fôlego\n\nCliente: {{nome}}\nProposta: {{proposta}}\n\nCondição da campanha: {{condicoes}}\n\nPagamento inicial de {{valor_inicial}} em {{data_inicial}}\nValor restante: {{valor_restante}}\nPagamento do restante em {{data_restante}}\n\nObservações: {{observacoes}}',
      },
      retornoPix: {
        nome: 'Retorno do setor — Instruções de pagamento', desc: 'Usa a chave PIX e a conta cadastradas em Configurações > Gerador de negociações.',
        campos: ['quantidade_parcelas', 'valor_parcela', 'vencimento', 'prazo_dias_uteis', 'proximo_vencimento', 'incluir_ted'],
        obrig: ['quantidade_parcelas', 'valor_parcela', 'vencimento', 'prazo_dias_uteis', 'proximo_vencimento', 'chave_pix'],
        rotulos: { valor_parcela: 'Valor da parcela' },
        texto: 'Segue retorno do setor responsável pela negociação:\n\nParcelas: {{quantidade_parcelas}}\nValor: {{valor_parcela}}\nVencimento: {{vencimento}}\n\nPara confirmação desta negociação, peço que realize o pagamento da primeira parcela via PIX, conforme os dados abaixo.\n\nDados para pagamento:\n\nChave PIX: {{chave_pix}}\n\nConta corrente (caso prefira TED/transferência):\nBanco: {{banco}}\nAgência: {{agencia}}\nConta: {{conta}}\n\nApós a efetuação do pagamento, por gentileza, envie o comprovante. Os demais boletos serão encaminhados mediante confirmação do pagamento.\n\nEste acordo é válido por {{prazo_dias_uteis}} dias úteis. Caso o pagamento seja realizado dentro desse prazo, o seu próximo vencimento será no dia {{proximo_vencimento}}. Se o pagamento não for realizado dentro do prazo, o acordo será cancelado e será necessário entrar em contato com o nosso suporte para renegociar novamente.',
      },
      solicitacao: {
        nome: 'Solicitação de negociação', desc: 'Resumo para o setor com o que o cliente quer negociar.',
        campos: ['nome', 'cpf', 'valor_parcela', 'vencimento', 'parcelas_atraso', 'valor_solicitado', 'vencimento_solicitado'],
        obrig: ['nome', 'valor_solicitado'],
        texto: 'Nome: {{nome}}\nCPF: {{cpf}}\nValor da parcela: {{valor_parcela}}\nVencimento: {{vencimento}}\nParcelas em atraso: {{parcelas_atraso}}\n\nCliente quer negociar (de acordo com a solicitação):\n\nValor: {{valor_solicitado}}\nVencimento: {{vencimento_solicitado}}',
      },
      antecipacao: {
        nome: 'Antecipação de parcela', desc: 'Dados da antecipação como informados; nenhum valor é calculado pelo script.',
        campos: ['nome', 'cpf', 'parcela_antecipada', 'vencimento_original', 'data_pagamento', 'valor_na_data_pagamento'],
        obrig: ['nome', 'parcela_antecipada', 'data_pagamento', 'valor_na_data_pagamento'],
        texto: 'Sr. {{nome}}, segue os dados conforme solicitado.\n\nCliente: {{nome}}\nCPF: {{cpf}}\nParcela antecipada: {{parcela_antecipada}}\nVencimento original da parcela: {{vencimento_original}}\nData de pagamento: {{data_pagamento}}\nValor na data de pagamento: {{valor_na_data_pagamento}}\n\nFavor conferir os dados acima.\n\nEstando de acordo, para a quitação antecipada do contrato, o pagamento será via PIX.\n\nO pagamento deve ser realizado, no mínimo, em D+1, considerando que o pagamento deverá ocorrer até amanhã. Caso não seja realizado dentro do prazo informado, será necessário fazer uma nova solicitação.',
      },
    };

    /* ---- "Acordo realizado": modalidades (levantadas nas planilhas Negociação e Renegociação) ----
       Cada modalidade = campos + obrigatórios + modelo de texto (editável) + frases para a planilha.
       Para criar uma nova modalidade basta acrescentar uma entrada aqui (nada mais no gerador muda).
       Chave do modelo editável: 'acordo:<modalidade>'. 'geral' usa o modelo "Acordo realizado" anterior (chave 'acordo'). */
    Object.assign(NG_CAMPOS, {
      parcela_atual: { rot: 'Parcela atual do contrato', tipo: 'num' },
      abrangencia_tipo: { rot: 'Abrangência', tipo: 'select', opcoes: [['', '(não informar)'], ['inteiro', 'Contrato inteiro'], ['apartir', 'A partir de uma parcela'], ['especificas', 'Parcelas específicas']] },
      parcela_inicial: { rot: 'A partir da parcela', tipo: 'num' },
      parcelas_especificas: { rot: 'Parcelas negociadas (ex.: 8, 9 e 10)', tipo: 'texto' },
      abrangencia: { rot: 'Abrangência (texto)', tipo: 'calc' },
      valor_total_devido: { rot: 'Valor total devido', tipo: 'moeda' },
      valor_pago_parcial: { rot: 'Valor pago agora (parcial)', tipo: 'moeda' },
      com_juros: { rot: 'Restante com juros', tipo: 'check', padrao: true },
      forma_pix: { rot: 'Forma', tipo: 'select', opcoes: [['PIX semanal', 'PIX semanal'], ['PIX Automático', 'PIX Automático']] },
      valor_semanal: { rot: 'Valor semanal', tipo: 'moeda' },
      qtd_semanas: { rot: 'Nº de pagamentos semanais', tipo: 'num' },
      dia_semana: { rot: 'Dia da semana (ex.: sábado)', tipo: 'texto' },
      qtd_parcelas_mensais: { rot: 'Equivale a (nº de parcelas)', tipo: 'num' },
      parcela_mensal: { rot: 'Valor da parcela equivalente', tipo: 'moeda' },
      dia_anterior: { rot: 'Dia de vencimento anterior', tipo: 'dia' },
      novo_dia: { rot: 'Novo dia de vencimento', tipo: 'dia' },
      parcelas_afetadas: { rot: 'Parcelas afetadas (quantidade)', tipo: 'num' },
      autorizacao: { rot: 'Autorização / origem (ex.: Procon)', tipo: 'texto' },
      tipo_antecipacao: { rot: 'Tipo', tipo: 'select', opcoes: [['parcelas', 'Antecipar parcela(s)'], ['quitacao', 'Quitar todo o contrato']] },
      qtd_antecipadas: { rot: 'Quantidade de parcelas antecipadas', tipo: 'num' },
      referencia: { rot: 'Referência (ex.: fatura de setembro, parcela 8)', tipo: 'texto' },
      valor_antecipacao: { rot: 'Valor', tipo: 'moeda' },
      antecipacao_descr: { rot: 'Descrição da antecipação', tipo: 'calc' },
      qtd_regularizar: { rot: 'Parcelas em atraso regularizadas (quantidade)', tipo: 'num' },
      valor_regularizar: { rot: 'Valor da regularização', tipo: 'moeda' },
      dividir_qtd: { rot: 'Dividido em (nº de parcelas)', tipo: 'num' },
      dividir_valor: { rot: 'Valor de cada parte', tipo: 'moeda' },
    });
    const NG_CAB = c => 'Acordo realizado — ' + c + '\n\nCliente: {{nome}}\nProposta: {{proposta}}\nParcela atual do contrato: {{parcela_atual}}\nAbrangência: {{abrangencia}}\n\n';
    const NG_ABR = ['abrangencia_tipo', 'parcela_inicial', 'parcelas_especificas'];
    const NG_MODALIDADES = {
      geral: { nome: 'Condições gerais (modelo anterior)' },
      mensal: {
        nome: 'Novo valor mensal', campos: ['nome', 'proposta', 'parcela_atual', ...NG_ABR, 'valor_parcela_acordo', 'dia_vencimento', 'quantidade_parcelas', 'observacoes'],
        obrig: ['nome', 'valor_parcela_acordo', 'dia_vencimento'], rotulos: { valor_parcela_acordo: 'Novo valor da parcela' },
        texto: NG_CAB('Novo valor mensal') + 'Prosseguimos com o acordo de {{valor_parcela_acordo}} com pagamento todo dia {{dia_vencimento}}.\nQuantidade de parcelas: {{quantidade_parcelas}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => ({ pedido: 'Cliente ' + verbo + ' renegociar as parcelas para ' + v('valor_parcela_acordo') + ' com pagamento todo dia ' + v('dia_vencimento') + (v('quantidade_parcelas') ? ', ' + v('quantidade_parcelas') + ' parcelas' : ''),
          acordo: 'Prosseguimos com o acordo de ' + v('valor_parcela_acordo') + ' com pagamento todo dia ' + v('dia_vencimento') + (v('quantidade_parcelas') ? ', ' + v('quantidade_parcelas') + ' parcelas' : '') }),
      },
      parcelamento: {
        nome: 'Parcelamento (quantidade × valor)', campos: ['nome', 'proposta', 'parcela_atual', ...NG_ABR, 'quantidade_parcelas', 'valor_parcela_acordo', 'dia_vencimento', 'observacoes'],
        obrig: ['nome', 'quantidade_parcelas', 'valor_parcela_acordo'],
        texto: NG_CAB('Parcelamento') + 'Prosseguimos com o acordo de {{quantidade_parcelas}} parcelas de {{valor_parcela_acordo}}.\nVencimento: todo dia {{dia_vencimento}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => { const d = v('dia_vencimento') ? ', com vencimento para todo dia ' + v('dia_vencimento') : '';
          return { pedido: 'Cliente ' + verbo + ' renegociar as parcelas para ' + v('quantidade_parcelas') + ' parcelas de ' + v('valor_parcela_acordo') + d, acordo: 'Prosseguimos com o acordo de ' + v('quantidade_parcelas') + ' parcelas de ' + v('valor_parcela_acordo') + d }; },
      },
      entrada: {
        nome: 'Entrada + parcelas', campos: ['nome', 'proposta', 'parcela_atual', ...NG_ABR, 'valor_entrada', 'data_entrada', 'quantidade_parcelas', 'valor_parcela_acordo', 'dia_vencimento', 'observacoes'],
        obrig: ['nome', 'valor_entrada', 'quantidade_parcelas', 'valor_parcela_acordo'],
        texto: NG_CAB('Entrada + parcelas') + 'Prosseguimos com 1 parcela de {{valor_entrada}} como entrada e {{quantidade_parcelas}} parcelas de {{valor_parcela_acordo}}.\nData da entrada: {{data_entrada}}\nVencimento das parcelas: todo dia {{dia_vencimento}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => { const e = '1 parcela de ' + v('valor_entrada') + ' como entrada' + (v('data_entrada') ? ' no dia ' + v('data_entrada') : '') + ', e ' + v('quantidade_parcelas') + ' parcelas de ' + v('valor_parcela_acordo') + (v('dia_vencimento') ? ', vencendo todo dia ' + v('dia_vencimento') : '');
          return { pedido: 'Cliente ' + verbo + ' ' + e, acordo: 'Prosseguimos com ' + e }; },
      },
      parcial: {
        nome: 'Pagamento parcial + restante', campos: ['nome', 'proposta', 'parcela_atual', 'valor_total_devido', 'valor_pago_parcial', 'data_pagamento', 'valor_restante', 'data_restante', 'com_juros', 'observacoes'],
        obrig: ['nome', 'valor_pago_parcial', 'data_pagamento', 'valor_restante', 'data_restante'], saldo: true, rotulos: { data_pagamento: 'Data do pagamento parcial', valor_restante: 'Saldo restante' },
        texto: NG_CAB('Pagamento parcial') + 'Prosseguimos com o pagamento parcial de {{valor_pago_parcial}} no dia {{data_pagamento}}.\nValor total devido: {{valor_total_devido}}\nSaldo restante: {{valor_restante}}\nPagamento do restante: {{data_restante}}\nRestante com juros: {{com_juros}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => { const r = ' e o restante (' + v('valor_restante') + ')' + (v('com_juros') ? ' com juros' : '') + ' no dia ' + v('data_restante');
          return { pedido: 'Cliente ' + (verbo === 'fechou' ? 'fechou o pagamento parcial de ' : 'solicitou pagar parcialmente ') + v('valor_pago_parcial') + ' no dia ' + v('data_pagamento') + r, acordo: 'Prosseguimos com o pagamento parcial de ' + v('valor_pago_parcial') + ' no dia ' + v('data_pagamento') + r }; },
      },
      folego: {
        nome: 'Campanha do Fôlego (pagamento parcial)', campos: ['nome', 'proposta', 'parcela_atual', 'valor_total_devido', 'valor_pago_parcial', 'data_pagamento', 'valor_restante', 'data_restante', 'com_juros', 'condicoes', 'observacoes'],
        obrig: ['nome', 'valor_pago_parcial', 'data_pagamento', 'valor_restante', 'data_restante'], saldo: true, rotulos: { data_pagamento: 'Data do pagamento inicial', valor_pago_parcial: 'Pagamento inicial', valor_restante: 'Saldo restante', condicoes: 'Condições da campanha' },
        texto: NG_CAB('Campanha do Fôlego') + 'Pagamento inicial de {{valor_pago_parcial}} no dia {{data_pagamento}}.\nValor total devido: {{valor_total_devido}}\nSaldo restante: {{valor_restante}}\nPagamento do restante: {{data_restante}}\nRestante com juros: {{com_juros}}\n\nCondições da campanha: {{condicoes}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => { const r = ' e o restante no valor de ' + v('valor_restante') + (v('com_juros') ? ' com juros' : '') + ' no dia ' + v('data_restante');
          return { pedido: 'Campanha do Fôlego: Cliente ' + (verbo === 'fechou' ? 'fechou acordo para pagar ' : 'solicitou pagar ') + v('valor_pago_parcial') + ' no dia ' + v('data_pagamento') + r, acordo: 'Prosseguimos com o acordo de ' + v('valor_pago_parcial') + ' no dia ' + v('data_pagamento') + r }; },
      },
      pix: {
        nome: 'PIX semanal / PIX Automático', campos: ['nome', 'proposta', 'parcela_atual', ...NG_ABR, 'forma_pix', 'valor_semanal', 'qtd_semanas', 'dia_semana', 'qtd_parcelas_mensais', 'parcela_mensal', 'valor_entrada', 'observacoes'],
        obrig: ['nome', 'forma_pix', 'valor_semanal', 'qtd_semanas'], rotulos: { valor_entrada: 'Entrada (opcional)' },
        texto: NG_CAB('{{forma_pix}}') + 'Prosseguimos com o acordo via {{forma_pix}}: {{qtd_semanas}} pagamentos semanais de {{valor_semanal}}.\nDia da semana: {{dia_semana}}\nEquivale a {{qtd_parcelas_mensais}} parcelas de {{parcela_mensal}}\nEntrada: {{valor_entrada}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => {
          const base = v('qtd_parcelas_mensais') && v('parcela_mensal') ? v('qtd_parcelas_mensais') + ' parcelas de ' + v('parcela_mensal') + ' (' + v('valor_semanal') + ' semanal)' : v('qtd_semanas') + ' pagamentos semanais de ' + v('valor_semanal');
          const ds = v('dia_semana'), toda = /^(segunda|ter[çc]a|quarta|quinta|sexta)|feira$/i.test(ds);
          const resto = ' via ' + v('forma_pix') + (ds ? (toda ? ' toda ' : ' todo ') + ds : '') + (v('valor_entrada') ? ', com entrada de ' + v('valor_entrada') : '');
          return { pedido: 'Cliente ' + verbo + ' ' + base + resto, acordo: 'Prosseguimos com ' + base + resto };
        },
      },
      vencimento: {
        nome: 'Alteração da data de vencimento', campos: ['nome', 'proposta', 'parcela_atual', 'dia_anterior', 'novo_dia', 'parcelas_afetadas', 'valor_parcela_acordo', 'autorizacao', 'observacoes'],
        obrig: ['nome', 'novo_dia'], rotulos: { valor_parcela_acordo: 'Novo valor das parcelas (se mudou)' },
        texto: NG_CAB('Alteração da data de vencimento') + 'Prosseguimos com a alteração da data de vencimento para todo dia {{novo_dia}}.\nVencimento anterior: dia {{dia_anterior}}\nParcelas afetadas: {{parcelas_afetadas}}\nNovo valor das parcelas: {{valor_parcela_acordo}}\nAutorização: {{autorizacao}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => { const x = (v('parcelas_afetadas') ? ' de suas ' + v('parcelas_afetadas') + ' parcelas' : '') + (v('valor_parcela_acordo') ? ', valor das parcelas para ' + v('valor_parcela_acordo') : '') + (v('autorizacao') ? ', formalizado via ' + v('autorizacao') : '');
          return { pedido: 'Cliente ' + verbo + (verbo === 'fechou' ? ' a' : '') + ' alteração da data de vencimento' + (v('dia_anterior') ? ' de dia ' + v('dia_anterior') : '') + ' para dia ' + v('novo_dia') + x,
            acordo: 'Prosseguimos com a alteração da data de vencimento' + (v('dia_anterior') ? ' de dia ' + v('dia_anterior') : '') + ' para todo dia ' + v('novo_dia') + x }; },
      },
      antecipacao: {
        nome: 'Antecipação / quitação', campos: ['nome', 'proposta', 'parcela_atual', 'tipo_antecipacao', 'qtd_antecipadas', 'referencia', 'valor_antecipacao', 'data_pagamento', 'observacoes'],
        obrig: ['nome', 'tipo_antecipacao', 'valor_antecipacao'],
        texto: NG_CAB('Antecipação / quitação') + 'Prosseguimos com {{antecipacao_descr}} no valor de {{valor_antecipacao}}.\nReferência: {{referencia}}\nData de pagamento: {{data_pagamento}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => {
          if (v('tipo_antecipacao') === 'quitacao') return { pedido: 'Cliente ' + verbo + ' ' + v('valor_antecipacao') + ' para quitar todo o contrato' + (v('data_pagamento') ? ' com pagamento em ' + v('data_pagamento') : ''), acordo: 'Prosseguimos com a quitação de todo o contrato no valor de ' + v('valor_antecipacao') + (v('data_pagamento') ? ' com pagamento em ' + v('data_pagamento') : '') };
          const q = v('qtd_antecipadas') + (v('qtd_antecipadas') === '1' ? ' parcela' : ' parcelas') + (v('referencia') ? ' (' + v('referencia') + ')' : '');
          return { pedido: 'Cliente ' + (verbo === 'fechou' ? 'fechou a antecipação de ' : 'solicitou antecipar ') + q + ' no valor de ' + v('valor_antecipacao') + (v('data_pagamento') ? ' com pagamento em ' + v('data_pagamento') : ''), acordo: 'Prosseguimos com a antecipação de ' + q + ' no valor de ' + v('valor_antecipacao') + (v('data_pagamento') ? ' com pagamento em ' + v('data_pagamento') : '') };
        },
      },
      regularizacao: {
        nome: 'Regularização de parcela(s) em atraso', campos: ['nome', 'proposta', 'parcela_atual', 'qtd_regularizar', 'referencia', 'valor_regularizar', 'data_pagamento', 'dividir_qtd', 'dividir_valor', 'observacoes'],
        obrig: ['nome', 'qtd_regularizar'], umDe: [['valor_regularizar', 'dividir_valor']],
        texto: NG_CAB('Regularização de parcela(s) em atraso') + 'Prosseguimos com a regularização de {{qtd_regularizar}} parcela(s) em atraso.\nReferência: {{referencia}}\nValor: {{valor_regularizar}}\nData de pagamento: {{data_pagamento}}\nDividido em {{dividir_qtd}} parcelas de {{dividir_valor}}\n\nObservações: {{observacoes}}',
        frases: (v, verbo) => {
          if (v('dividir_qtd') && v('dividir_valor')) { const t = v('dividir_qtd') + ' parcelas de ' + v('dividir_valor') + ' referentes ' + (v('referencia') ? 'a ' + v('referencia') : 'à(s) parcela(s) em atraso'); return { pedido: 'Cliente ' + verbo + ' ' + t, acordo: 'Prosseguimos com ' + t }; }
          const um = v('qtd_regularizar') === '1';
          const resto = (v('referencia') ? ' (' + v('referencia') + ')' : '') + ' no valor de ' + v('valor_regularizar') + (v('data_pagamento') ? ' no dia ' + v('data_pagamento') : '');
          const de = (um ? 'da parcela em atraso' : 'das ' + v('qtd_regularizar') + ' parcelas em atraso') + resto;
          return { pedido: verbo === 'fechou' ? 'Cliente fechou o pagamento ' + de : 'Cliente solicitou pagar ' + (um ? 'a parcela em atraso' : 'as ' + v('qtd_regularizar') + ' parcelas em atraso') + resto,
            acordo: 'Prosseguimos com o pagamento ' + de };
        },
      },
      semacordo: {
        nome: 'Sem acordo / pagamento normal', campos: ['nome', 'proposta', 'parcela_atual', 'condicoes', 'valor_parcela_acordo', 'observacoes'],
        obrig: ['nome', 'condicoes'], rotulos: { condicoes: 'O que aconteceu (ex.: optou por pagar normalmente)', valor_parcela_acordo: 'Valor da parcela (mantido)' },
        texto: 'Sem acordo\n\nCliente: {{nome}}\nProposta: {{proposta}}\n\n{{condicoes}}\nValor da parcela mantido: {{valor_parcela_acordo}}\n\nObservações: {{observacoes}}',
        frases: v => ({ pedido: v('condicoes'), acordo: v('valor_parcela_acordo') ? 'Cliente optou por pagar as parcelas normalmente em ' + v('valor_parcela_acordo') : v('condicoes') }),
      },
    };
    const NG_ALL = { ...NG_MODELOS };
    Object.entries(NG_MODALIDADES).forEach(([k, md]) => { if (k !== 'geral') NG_ALL['acordo:' + k] = { ...md, nome: 'Acordo realizado — ' + md.nome, desc: 'Acordo realizado: ' + md.nome + '. Registra só o que foi efetivamente combinado.' }; });
    const ngModalidade = () => (GM_getValue('negModalidade', 'mensal') in NG_MODALIDADES ? GM_getValue('negModalidade', 'mensal') : 'mensal');
    // contexto: 'negociacao' / 'renegociacao' (Atendimento: sempre o acordo da modalidade) ou 'mensagens' (todos os modelos)
    let ngCtx = GM_getValue('atModelo', 'negociacao');
    if (!['negociacao', 'renegociacao', 'mensagens'].includes(ngCtx)) ngCtx = 'negociacao';
    const ngNoAtendimento = () => ngCtx !== 'mensagens';
    const ngChave = () => ngNoAtendimento() ? (ngModalidade() !== 'geral' ? 'acordo:' + ngModalidade() : 'acordo')
      : (ngModeloAtual() === 'acordo' && ngModalidade() !== 'geral' ? 'acordo:' + ngModalidade() : ngModeloAtual());
    const ngDef = () => NG_ALL[ngChave()];
    const ngOrdinal = n => n + '°';
    const ngValores = {};   // SÓ em memória: some ao recarregar a página
    const ngModelosSalvos = () => GM_getValue('negModelos', {}) || {};
    const ngTextoModelo = k => (typeof ngModelosSalvos()[k] === 'string' ? ngModelosSalvos()[k] : NG_ALL[k].texto);
    const ngPagamento = () => GM_getValue('negPagamento', {}) || {};
    const ngCentavos = t => {
      let s = String(t == null ? '' : t).replace(/R\$|\s/g, '');
      if (!s) return null;
      if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
      else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      if (!/^\d+(\.\d+)?$/.test(s)) return null;
      return Math.round(parseFloat(s) * 100);
    };
    const ngReais = c => 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const ngData = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
    // valor de cada variável já formatado ('' = vazio)
    function ngValor(k) {
      if (k in NG_VARS_PAGAMENTO) {
        const pg = ngPagamento();
        const chave = { chave_pix: 'pix', banco: 'banco', agencia: 'agencia', conta: 'conta' }[k];
        if (k !== 'chave_pix' && !ngValores.incluir_ted) return '';
        return String(pg[chave] || '').trim();
      }
      const def = NG_CAMPOS[k], v = ngValores[k];
      if (!def) return '';
      // variáveis calculadas a partir de outros campos
      if (k === 'abrangencia') {
        const t = ngValores.abrangencia_tipo;
        if (t === 'inteiro') return 'contrato inteiro';
        if (t === 'apartir') return ngValor('parcela_inicial') ? 'a partir da parcela ' + ngValor('parcela_inicial') : '';
        if (t === 'especificas') return ngValor('parcelas_especificas') ? 'parcelas ' + ngValor('parcelas_especificas') : '';
        return '';
      }
      if (k === 'antecipacao_descr') {
        if (ngValores.tipo_antecipacao === 'quitacao') return 'a quitação de todo o contrato';
        const q = ngValor('qtd_antecipadas');
        return q ? 'a antecipação de ' + q + (q === '1' ? ' parcela' : ' parcelas') : '';
      }
      if (def.tipo === 'calc') return '';
      if (def.tipo === 'check') return v ? 'sim' : '';
      if (v == null || String(v).trim() === '') return '';
      if (def.tipo === 'moeda') { const c = ngCentavos(v); return c == null ? '' : ngReais(c); }
      if (def.tipo === 'data') return ngData(v);
      if (def.tipo === 'fone') return telFormatar(v) || String(v).trim();
      return String(v).trim().replace(/\s*\n\s*/g, def.tipo === 'area' ? '\n' : ' ');
    }
    // monta o texto a partir do modelo; nunca deixa {{...}} no resultado
    function ngMontar(modelo) {
      const paragrafos = modelo.replace(/\r/g, '').split(/\n[ \t]*\n/);
      const saida = [];
      paragrafos.forEach(p => {
        const linhas = p.split('\n');
        let tinhaVar = false, ficouVar = false;
        const kept = [];
        linhas.forEach(l => {
          const vars = [...l.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map(m => m[1]);
          if (!vars.length) { kept.push(l); return; }
          tinhaVar = true;
          const vals = vars.map(ngValor);
          if (vals.some(x => !x)) return;   // alguma variável vazia: a linha sai
          ficouVar = true;
          kept.push(l.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => ngValor(k)));
        });
        if (tinhaVar && !ficouVar) return;  // bloco sem nenhum dado: sai com o título
        const t = kept.join('\n').trim();
        if (t) saida.push(t);
      });
      return saida.join('\n\n').replace(/\{\{[^}]*\}\}/g, '').trim();
    }
    const ngModeloAtual = () => GM_getValue('negModeloAtual', 'pedido') in NG_MODELOS ? GM_getValue('negModeloAtual', 'pedido') : 'pedido';
    // campos que no Atendimento ficam nos blocos fixos (Cliente / Cobrança), e não repetidos na modalidade
    const AT_FIXOS = new Set(['nome', 'proposta', 'cpf', 'parcela_atual', 'valor_parcela', 'parcelas_atraso', 'dias_atraso', 'vencimento_antigo']);
    function ngDesenharCampos() {
      const k = ngModeloAtual(), m = ngDef();
      $('#mf-ng-desc').textContent = m.desc;
      $('#mf-ng-modalidade').style.display = k === 'acordo' ? '' : 'none';
      const caixa = $('#mf-ng-campos');
      caixa.innerHTML = '';
      const grade = document.createElement('div');
      grade.className = 'mf-grade';
      m.campos.forEach(c => {
        const def = NG_CAMPOS[c];
        if (def.tipo === 'calc') return;
        if (ngNoAtendimento() && AT_FIXOS.has(c)) return;
        const rot = (m.rotulos && m.rotulos[c]) || def.rot;
        const obrig = m.obrig.includes(c);
        const lab = ngCampoEl(c, rot, obrig);
        lab.dataset.bloco = def.tipo === 'area' ? 'textos' : ['nome', 'proposta', 'cpf', 'parcela_atual'].includes(c) ? 'cliente' : NG_ABR.includes(c) ? 'abrangencia'
          : (['pedido', 'solicitacao'].includes(k) && ['valor_parcela', 'parcelas_atraso', 'dias_atraso', 'vencimento_antigo', 'vencimento'].includes(c)) ? 'situacao' : 'condicoes';
        grade.appendChild(lab);
      });
      if (painel.dataset.ui !== 'nova' || ngNoAtendimento()) { caixa.appendChild(grade); ngSaldoHook(); ngMostrarDependentes(); return; }
      ngBlocosNova(grade, m);
    }
    // um campo (rótulo + entrada) ligado a ngValores: o mesmo valor em todas as telas
    function ngCampoEl(c, rot, obrig) {
      const def = NG_CAMPOS[c];
      const lab = document.createElement('label');
      lab.className = 'mf-lb-rot' + (def.tipo === 'area' || def.tipo === 'check' ? ' mf-cheia' : '');
      let inp;
      if (def.tipo === 'area') { inp = document.createElement('textarea'); inp.style.height = '54px'; }
      else if (def.tipo === 'select') {
        inp = document.createElement('select');
        def.opcoes.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; inp.appendChild(o); });
      } else {
        inp = document.createElement('input');
        inp.type = def.tipo === 'data' ? 'date' : def.tipo === 'check' ? 'checkbox' : 'text';
        if (def.tipo === 'moeda') { inp.inputMode = 'decimal'; inp.placeholder = '0,00'; }
        if (def.tipo === 'fone') { inp.inputMode = 'tel'; inp.placeholder = '(11) 912345678'; inp.addEventListener('blur', () => { const f = telFormatar(inp.value); if (f && f !== inp.value) { inp.value = f; ngValores[c] = f; } }); }
        if (def.tipo === 'num' || def.tipo === 'dia') inp.inputMode = 'numeric';
        inp.autocomplete = 'off';
      }
      inp.dataset.campo = c;
      if (def.tipo === 'check') inp.checked = ngValores[c] != null ? !!ngValores[c] : 'padrao' in def ? !!def.padrao : !!(ngPagamento().banco || ngPagamento().conta);
      else if (def.tipo === 'select') inp.value = ngValores[c] != null ? ngValores[c] : def.padrao != null ? def.padrao : def.opcoes[0][0];
      else inp.value = ngValores[c] || '';
      if (def.tipo === 'check') ngValores[c] = inp.checked;
      if (def.tipo === 'select') ngValores[c] = inp.value;
      inp.addEventListener(def.tipo === 'check' || def.tipo === 'select' ? 'change' : 'input', () => {
        ngValores[c] = def.tipo === 'check' ? inp.checked : inp.value;
        inp.classList.remove('mf-erro');
        if (c === 'abrangencia_tipo' || c === 'tipo_antecipacao') ngMostrarDependentes();
      });
      if (def.tipo === 'check') { lab.style.flexDirection = 'row'; lab.style.alignItems = 'center'; lab.append(inp, document.createTextNode(' ' + rot)); }
      else {   // rótulo + " *" (num span, só para a cor do obrigatório na Nova UI; o texto do rótulo é o mesmo)
        const t = document.createElement('span'); t.textContent = rot;
        // espaço que não quebra antes do *: o * não fica sozinho na linha de baixo
        if (obrig) { const s = document.createElement('span'); s.className = 'mf-obrig'; s.textContent = String.fromCharCode(160) + '*'; t.appendChild(s); }
        lab.append(t, inp);
      }
      if (def.dica) lab.title = def.dica;
      return lab;
    }
    function ngBlocosNova(grade, m) {
      const caixa = $('#mf-ng-campos');
      // Nova UI: os mesmos campos em blocos recolhíveis; abre o bloco com campo obrigatório ou já preenchido
      const nomes = { cliente: 'Cliente', abrangencia: 'Abrangência', situacao: 'Situação atual', condicoes: 'Condições', textos: 'Textos e observações' };
      const essenciais = new Set([...m.obrig, ...(m.umDe || []).flat()]);
      Object.keys(nomes).forEach(b => {
        const labs = [...grade.children].filter(l => l.dataset.bloco === b);
        if (!labs.length) return;
        const det = document.createElement('details');
        det.className = 'mf-ng-bloco';
        det.open = labs.some(l => { const i = l.querySelector('[data-campo]'); return essenciais.has(i.dataset.campo) || (i.type !== 'checkbox' && i.value); }) || b === 'condicoes';
        const sum = document.createElement('summary'); sum.textContent = nomes[b];
        const g = document.createElement('div'); g.className = 'mf-grade';
        labs.forEach(l => g.appendChild(l));
        det.append(sum, g);
        caixa.appendChild(det);
      });
      ngSaldoHook(); ngMostrarDependentes();
    }
    // campos que só aparecem conforme a escolha (abrangência; antecipação x quitação)
    function ngMostrarDependentes() {
      const vis = (c, on) => { const i = painel.querySelector('#mf-ng-campos [data-campo="' + c + '"]'); if (i) i.closest('label').style.display = on ? '' : 'none'; };
      vis('parcela_inicial', ngValores.abrangencia_tipo === 'apartir');
      vis('parcelas_especificas', ngValores.abrangencia_tipo === 'especificas');
      vis('qtd_antecipadas', ngValores.tipo_antecipacao !== 'quitacao');
    }
    // pagamento parcial: saldo = total devido − pago (atualiza a cada digitação; não aceita pagamento acima do total)
    function ngSaldoHook() {
      if (!ngDef().saldo) return;
      const g = c => painel.querySelector('#mf-ng-campos [data-campo="' + c + '"]');
      const tot = g('valor_total_devido'), pago = g('valor_pago_parcial'), rest = g('valor_restante');
      if (!tot || !pago || !rest) return;
      const box = document.createElement('div');
      box.className = 'mf-ng-saldo mf-cheia';
      rest.closest('label').after(box);
      const calc = () => {
        const t = tot.value.trim() ? ngCentavos(tot.value) : null, p = pago.value.trim() ? ngCentavos(pago.value) : null;
        ngValores._saldoErro = '';
        box.classList.remove('erro');
        if (t != null && p != null) {
          if (p > t) { ngValores._saldoErro = 'O valor pago (' + ngReais(p) + ') é maior que o total devido (' + ngReais(t) + ').'; box.textContent = ngValores._saldoErro; box.classList.add('erro'); rest.readOnly = false; return; }
          rest.value = ((t - p) / 100).toFixed(2).replace('.', ','); rest.readOnly = true; ngValores.valor_restante = rest.value;
          box.textContent = 'Saldo restante: ' + ngReais(t - p);
        } else { rest.readOnly = false; box.textContent = tot.value.trim() ? 'Informe o valor pago para calcular o saldo.' : 'Informe o total devido para calcular o saldo (ou digite o restante).'; }
      };
      [tot, pago].forEach(i => i.addEventListener('input', calc));
      calc();
    }
    // campos essenciais que faltam (nomes para mostrar ao usuário)
    function ngFaltando() {
      const m = ngDef(), f = [];
      if (ngValores._saldoErro) f.push(ngValores._saldoErro);
      if (m.campos.includes('abrangencia_tipo')) {
        if (ngValores.abrangencia_tipo === 'apartir' && !ngValor('parcela_inicial')) f.push('A partir da parcela');
        if (ngValores.abrangencia_tipo === 'especificas' && !ngValor('parcelas_especificas')) f.push('Parcelas negociadas');
      }
      if (m.campos.includes('tipo_antecipacao') && ngValores.tipo_antecipacao !== 'quitacao' && !ngValor('qtd_antecipadas')) f.push('Quantidade de parcelas antecipadas');
      m.obrig.forEach(c => {
        if (c in NG_VARS_PAGAMENTO) { if (!ngValor(c)) f.push(NG_VARS_PAGAMENTO[c] + ' (Configurações > Gerador de negociações)'); return; }
        if (!ngValor(c)) f.push(((m.rotulos && m.rotulos[c]) || NG_CAMPOS[c].rot));
      });
      (m.umDe || []).forEach(g => { if (!g.some(c => ngValor(c))) f.push('pelo menos um de: ' + g.map(c => (m.rotulos && m.rotulos[c]) || NG_CAMPOS[c].rot).join(', ')); });
      // valores digitados que não são válidos (não viram texto em vez de sumir sem aviso)
      m.campos.forEach(c => {
        const def = NG_CAMPOS[c], v = ngValores[c];
        if (v == null || String(v).trim() === '' || def.tipo === 'check') return;
        if (def.tipo === 'moeda' && ngCentavos(v) == null) f.push(((m.rotulos && m.rotulos[c]) || def.rot) + ' (valor inválido)');
        if ((def.tipo === 'num') && !/^\d+$/.test(String(v).trim())) f.push(((m.rotulos && m.rotulos[c]) || def.rot) + ' (use só números)');
        if (def.tipo === 'dia' && !(/^\d{1,2}$/.test(String(v).trim()) && +v >= 1 && +v <= 31)) f.push(((m.rotulos && m.rotulos[c]) || def.rot) + ' (1 a 31)');
      });
      return f;
    }
    const ngTemDados = () => Object.entries(ngValores).some(([k, v]) => NG_CAMPOS[k] && !['check', 'select'].includes(NG_CAMPOS[k].tipo) && String(v || '').trim()) || !!$('#mf-ng-texto').value.trim();
    const ngLimpar = () => { Object.keys(ngValores).forEach(k => delete ngValores[k]); ngDesenharCampos(); };
    const selNg = $('#mf-ng-modelo');
    Object.entries(NG_MODELOS).forEach(([k, m]) => { const o = document.createElement('option'); o.value = k; o.textContent = m.nome; selNg.appendChild(o); });
    selNg.value = ngModeloAtual();
    selNg.addEventListener('change', () => { GM_setValue('negModeloAtual', selNg.value); $('#mf-ng-texto').value = ''; ngDesenharCampos(); });
    // "Acordo realizado": tipo de acordo (modalidade)
    const selMod = $('#mf-ng-modalidade');
    Object.entries(NG_MODALIDADES).filter(([k]) => k !== 'geral').concat([['geral', NG_MODALIDADES.geral]]).forEach(([k, md]) => { const o = document.createElement('option'); o.value = k; o.textContent = md.nome; selMod.appendChild(o); });
    selMod.value = ngModalidade();
    selMod.addEventListener('change', () => { GM_setValue('negModalidade', selMod.value); $('#mf-ng-texto').value = ''; ['#mf-ng-f-pedido', '#mf-ng-f-acordo', '#mf-ng-f-parcela'].forEach(x => { const e = $(x); if (e) e.value = ''; }); ngDesenharCampos(); });
    $('#mf-ng-gerar').onclick = () => {
      const f = ngFaltando();
      painel.querySelectorAll('#mf-ng-campos [data-campo]').forEach(i => i.classList.toggle('mf-erro', f.some(x => x.startsWith((ngDef().rotulos || {})[i.dataset.campo] || NG_CAMPOS[i.dataset.campo].rot))));
      painel.querySelectorAll('#mf-ng-campos .mf-erro').forEach(i => { const d = i.closest('details'); if (d) d.open = true; });   // Nova UI: abre o bloco do campo com erro
      if (f.length) return msg('Preencha antes de gerar:\n- ' + f.join('\n- '));
      $('#mf-ng-texto').value = ngMontar(ngTextoModelo(ngChave()));
      msg('Texto gerado. Revise (pode editar) e clique em Copiar texto.');
    };
    $('#mf-ng-copiar').onclick = () => {
      const t = $('#mf-ng-texto').value;
      if (!t.trim()) return msg('Gere o texto antes de copiar.');
      GM_setClipboard(t, 'text');   // exatamente o que está na pré-visualização, com as quebras de linha
      msg('Texto copiado.');
    };
    $('#mf-ng-limpar').onclick = () => {
      if (ngTemDados() && !confirm('Apagar os dados digitados neste modelo?')) return;
      ngLimpar(); msg('Campos limpos.');
    };
    $('#mf-ng-novo').onclick = () => {
      if (ngTemDados() && !confirm('Começar um novo texto? Os dados e o texto atuais serão apagados.')) return;
      ngLimpar(); $('#mf-ng-texto').value = ''; msg('Pronto para uma nova negociação.');
    };
    ngDesenharCampos();

    // Configurações: modelos editáveis e dados para pagamento (só locais)
    const selCfgNg = $('#mf-ng-cfg-modelo');
    Object.entries(NG_ALL).forEach(([k, m]) => { const o = document.createElement('option'); o.value = k; o.textContent = m.nome; selCfgNg.appendChild(o); });
    const ngCfgMostrar = () => {
      const k = selCfgNg.value, m = NG_ALL[k];
      $('#mf-ng-cfg-texto').value = ngTextoModelo(k);
      const vars = [...m.campos.filter(c => NG_CAMPOS[c].tipo !== 'check').map(c => '{{' + c + '}} ' + ((m.rotulos && m.rotulos[c]) || NG_CAMPOS[c].rot)),
        ...(m.campos.includes('abrangencia_tipo') ? ['{{abrangencia}} Abrangência por extenso (calculada)'] : []),
        ...(m.campos.includes('tipo_antecipacao') ? ['{{antecipacao_descr}} "a antecipação de N parcelas" ou "a quitação de todo o contrato" (calculada)'] : []),
        ...(/\{\{\s*(chave_pix|banco|agencia|conta)/.test(NG_ALL[k].texto) ? Object.entries(NG_VARS_PAGAMENTO).map(([v, r]) => '{{' + v + '}} ' + r + ' (dados para pagamento)') : [])];
      $('#mf-ng-cfg-vars').textContent = 'Variáveis deste modelo:\n' + vars.join('\n') + '\nLinha com variável vazia sai do texto; bloco que fica sem nenhum dado sai inteiro.' +
        (typeof ngModelosSalvos()[k] === 'string' ? '\n(modelo personalizado)' : '');
    };
    selCfgNg.addEventListener('change', ngCfgMostrar);
    $('#mf-ng-cfg-salvar').onclick = () => {
      const t = $('#mf-ng-cfg-texto').value;
      const desconhecidas = [...t.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map(x => x[1]).filter(v => !(v in NG_CAMPOS) && !(v in NG_VARS_PAGAMENTO));
      if (desconhecidas.length) return msg('Variáveis desconhecidas no modelo: ' + [...new Set(desconhecidas)].map(v => '{{' + v + '}}').join(', '));
      const mm = ngModelosSalvos(); mm[selCfgNg.value] = t; GM_setValue('negModelos', mm);
      ngCfgMostrar(); msg('Modelo "' + NG_ALL[selCfgNg.value].nome + '" salvo.');
    };
    $('#mf-ng-cfg-restaurar').onclick = () => {
      if (!confirm('Voltar o modelo "' + NG_ALL[selCfgNg.value].nome + '" ao texto original?')) return;
      const mm = ngModelosSalvos(); delete mm[selCfgNg.value]; GM_setValue('negModelos', mm);
      ngCfgMostrar(); msg('Modelo original restaurado.');
    };
    ['pix', 'banco', 'agencia', 'conta'].forEach(c => { $('#mf-ng-' + c).value = ngPagamento()[c] || ''; });
    $('#mf-ng-pag-salvar').onclick = () => {
      const pg = {};
      ['pix', 'banco', 'agencia', 'conta'].forEach(c => { const v = $('#mf-ng-' + c).value.trim(); if (v) pg[c] = v.slice(0, 120); });
      if (Object.keys(pg).length) GM_setValue('negPagamento', pg); else GM_deleteValue('negPagamento');
      msg('Dados para pagamento salvos neste navegador.');
    };
    ngCfgMostrar();

    /* ================= LEMBRETES DE PAGAMENTOS PARCIAIS =================
       Base própria e versionada: GM 'mfLembretes' = { versao, itens: [...], invalidos: [...] }.
       - Ao carregar NADA é apagado nem recriado; só grava quando o usuário muda algo (ou numa migração).
       - Migração de formato antigo: copia o original para 'mfLembretesBackup_v<versão>' antes de converter.
       - Registros que não se reconhecem vão para "invalidos" (preservados, não apagados).
       - O estado dos avisos (pop-up adiado) fica em 'mfLembretesAviso', separado dos registros.
       - Datas sempre 'AAAA-MM-DD' no horário LOCAL do navegador (sem conversão de fuso). Valores em centavos.
       - v2 (script 12.0): telefone de contato, autor/versão (rev) de cada mudança, id em cada pagamento e "compartilhado"
         (equipe). Telefones achados nas observações são COPIADOS para o campo (1 telefone) ou sugeridos (vários);
         as observações não são alteradas. Lembretes que já existiam continuam só neste navegador até alguém compartilhar. */
    const LB_VERSAO = 2, LB_CHAVE = 'mfLembretes';
    const lbHoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const lbDataOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const lbNovoId = () => 'lb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const lbItemValido = x => x && typeof x === 'object' && typeof x.id === 'string' && Number.isFinite(x.total) && Array.isArray(x.pagamentos);
    function lbCarregar() {
      let raw = GM_getValue(LB_CHAVE, null);
      if (raw == null) return { versao: LB_VERSAO, itens: [], invalidos: [] };
      if (Array.isArray(raw)) raw = { versao: 0, itens: raw };          // formato sem versão (lista simples)
      if (typeof raw !== 'object') return { versao: LB_VERSAO, itens: [], invalidos: [raw], somenteLeitura: true };
      const base = { versao: raw.versao | 0, itens: Array.isArray(raw.itens) ? raw.itens : [], invalidos: Array.isArray(raw.invalidos) ? raw.invalidos : [] };
      if (base.versao > LB_VERSAO) return { ...base, somenteLeitura: true };   // base de versão mais nova: não mexe
      if (base.versao < LB_VERSAO) {
        GM_setValue('mfLembretesBackup_v' + base.versao, raw);            // cópia do original antes de migrar
        const itens = [], invalidos = [...base.invalidos], vistos = new Set();
        base.itens.forEach(x => {
          const y = lbMigrar(x);
          if (!y) { invalidos.push(x); return; }
          if (vistos.has(y.id)) return;                                   // nunca duplica
          vistos.add(y.id); itens.push(y);
        });
        const nova = { versao: LB_VERSAO, itens, invalidos };
        GM_setValue(LB_CHAVE, nova);
        return nova;
      }
      // itens que não se reconhecem são PRESERVADOS em "invalidos" (nunca apagados); mesmo id repetido aparece uma vez
      const vistos = new Set(), ok = [];
      base.itens.forEach(x => {
        if (!lbItemValido(x)) { base.invalidos.push(x); return; }
        if (vistos.has(x.id)) return;
        vistos.add(x.id); ok.push(lbV2(x));
      });
      base.itens = ok;
      return base;
    }
    // versão 0 (lista simples): aceita { proposta, total, pago, proxima, ... } e converte sem perder campos
    // v1 -> v2 (idempotente: só completa o que falta)
    function lbV2(x) {
      const y = { ...x };
      if (typeof y.telefone !== 'string') {
        const t = telExtrair(y.obs);
        y.telefone = t.length === 1 ? t[0] : '';
        if (t.length === 1) y.telefoneOrigem = 'obs';
        if (t.length > 1) y.telefonesObs = t;
      }
      y.pagamentos = (y.pagamentos || []).map((p, i) => p && p.id ? p : { ...p, id: 'pg' + Number(p && p.registradoEm || y.criadoEm || 0).toString(36) + '_' + i });
      if (!Number.isFinite(y.rev)) y.rev = 1;
      y.compartilhado = !!y.compartilhado;
      return y;
    }
    function lbMigrar(x) {
      if (lbItemValido(x)) return lbV2(x);
      if (!x || typeof x !== 'object') return null;
      const total = Number.isFinite(x.total) ? x.total : ngCentavos(x.total);
      if (total == null) return null;
      const pago = x.pago != null ? (Number.isFinite(x.pago) ? x.pago : ngCentavos(x.pago)) : 0;
      return lbV2({
        id: typeof x.id === 'string' ? x.id : lbNovoId(), cliente: String(x.cliente || ''), proposta: String(x.proposta || ''), total,
        pagamentos: pago ? [{ valor: pago, data: lbDataOk(x.dataPagamento) ? x.dataPagamento : '', registradoEm: Date.now() }] : [],
        proxima: lbDataOk(x.proxima) ? x.proxima : '', obs: String(x.obs || ''), status: ['pendente', 'concluido', 'cancelado'].includes(x.status) ? x.status : 'pendente',
        historico: [], criadoEm: x.criadoEm || Date.now(), atualizadoEm: Date.now(), original: x,
      });
    }
    let lbBase = lbCarregar();
    const lbSujos = new Set();   // ids alterados AQUI (só esses são enviados para a equipe; o que chega da equipe não volta)
    const LB_EXCLUIDOS = 'mfLembretesExcluidos';   // exclusões de lembretes compartilhados (para a equipe também excluir)
    // toda mudança feita pelo funcionário: nova versão (rev), quando e quem
    const lbTocar = it => { it.atualizadoEm = Date.now(); it.rev = (it.rev || 1) + 1; it.atualizadoPor = eqId(); it.atualizadoPorNome = eqNomeLocal(); lbSujos.add(it.id); };
    const lbSalvar = () => {
      if (lbBase.somenteLeitura) { msg('Os lembretes salvos são de uma versão mais nova do script: atualize o script antes de alterar.'); return false; }
      GM_setValue(LB_CHAVE, { versao: LB_VERSAO, itens: lbBase.itens, invalidos: lbBase.invalidos });
      eqMarcarVersao();
      // compartilhados alterados aqui vão para a equipe
      const enviar = lbBase.itens.filter(it => lbSujos.has(it.id) && it.compartilhado);
      lbSujos.clear();
      enviar.forEach(it => eqEnviar('lb', it));
      lbAtualizar();
      return true;
    };
    // outras abas/janelas alteraram: recarrega
    const lbRecarregar = () => { lbBase = lbCarregar(); };
    const lbPago = it => it.pagamentos.reduce((s, p) => s + (Number.isFinite(p.valor) ? p.valor : 0), 0);
    const lbSaldo = it => it.total - lbPago(it);
    const lbAtencao = it => it.status === 'pendente' && lbDataOk(it.proxima) && it.proxima <= lbHoje();
    const lbVencido = it => it.status === 'pendente' && lbDataOk(it.proxima) && it.proxima < lbHoje();

    let lbFiltro = 'atencao', lbEditando = null, lbAberto = null;
    function lbDesenhar() {
      const hoje = lbHoje(), itens = lbBase.itens;
      const venc = itens.filter(lbVencido).length, deHoje = itens.filter(it => lbAtencao(it) && it.proxima === hoje).length;
      const pend = itens.filter(it => it.status === 'pendente').length;
      $('#mf-lb-resumo').innerHTML = '';
      const r = document.createElement('span');
      r.textContent = 'Atrasados: ' + venc + ' · Para hoje: ' + deHoje + ' · Pendentes: ' + pend + (lbBase.invalidos.length ? ' · ' + lbBase.invalidos.length + ' registro(s) não reconhecido(s) preservado(s)' : '');
      $('#mf-lb-resumo').appendChild(r);
      painel.querySelectorAll('.mf-lb-filtros button').forEach(b => b.classList.toggle('ativa', b.dataset.filtro === lbFiltro));
      const busca = $('#mf-lb-busca').value.trim().toLowerCase();
      let lista = itens.filter(it => lbFiltro === 'todos' ? true : lbFiltro === 'atencao' ? lbAtencao(it) : lbFiltro === 'pendentes' ? it.status === 'pendente' : it.status !== 'pendente');
      if (busca) {
        const dig = busca.replace(/\D/g, '');
        lista = lista.filter(it => (it.proposta + ' ' + it.cliente + ' ' + (it.criadoPorNome || '') + ' ' + (it.atualizadoPorNome || '')).toLowerCase().includes(busca)
          || (dig.length >= 4 && String(it.telefone || '').replace(/\D/g, '').includes(dig)));
      }
      lista.sort((a, b) => (a.proxima || '9999') .localeCompare(b.proxima || '9999'));
      const caixa = $('#mf-lb-lista');
      caixa.innerHTML = '';
      if (!lista.length) { const v = document.createElement('div'); v.className = 'mf-info'; v.textContent = lbFiltro === 'atencao' ? 'Nenhum lembrete para hoje ou atrasado.' : 'Nenhum lembrete.'; caixa.appendChild(v); return; }
      lista.forEach(it => {
        const el = document.createElement('div');
        el.className = 'mf-lb-item' + (lbVencido(it) ? ' atrasado' : lbAtencao(it) ? ' hoje' : '') + (it.status !== 'pendente' ? ' encerrado' : '');
        const l1 = document.createElement('div'); l1.className = 'mf-lb-l1';
        l1.textContent = (it.proposta ? 'Proposta ' + it.proposta : 'Sem proposta') + (it.cliente ? ' · ' + it.cliente : '') + (it.telefone ? ' · ' + it.telefone : '');
        if (it.compartilhado) { const tg = document.createElement('span'); tg.className = 'mf-tag'; tg.textContent = 'equipe'; tg.title = 'Compartilhado com a equipe'; l1.appendChild(tg); }
        const l2 = document.createElement('div'); l2.className = 'mf-lb-l2';
        const st = it.status === 'pendente' ? (lbVencido(it) ? 'ATRASADO' : lbAtencao(it) ? 'HOJE' : 'pendente') : it.status === 'concluido' ? 'concluído' : 'cancelado';
        l2.textContent = 'Saldo ' + ngReais(lbSaldo(it)) + ' de ' + ngReais(it.total) + ' · próx.: ' + (ngData(it.proxima) || '—') + ' · ' + st + (it.criadoPorNome ? ' · por ' + it.criadoPorNome : '');
        el.append(l1, l2);
        if (lbAberto === it.id) {
          const det = document.createElement('div'); det.className = 'mf-lb-det';
          det.textContent = (it.telefone ? 'Telefone: ' + it.telefone + (it.telefoneOrigem === 'obs' ? ' (copiado das observações)' : '') + '\n' : '') +
            (it.telefonesObs && it.telefonesObs.length && !it.telefone ? 'Telefones nas observações: ' + it.telefonesObs.join(', ') + ' (clique em "Usar telefone" para escolher)\n' : '') +
            'Pagamentos: ' + (it.pagamentos.length ? it.pagamentos.map(p => ngReais(p.valor) + (p.data ? ' em ' + ngData(p.data) : '') + (p.por ? ' (' + p.por + ')' : '')).join('; ') : 'nenhum') +
            (it.obs ? '\nObs.: ' + it.obs : '') + (it.historico && it.historico.length ? '\nAcompanhamento:\n' + it.historico.slice(-6).map(h => h.texto + (h.por ? ' — ' + h.por : '')).join('\n') : '');
          const acoes = document.createElement('div'); acoes.className = 'mf-lb-acoes';
          const bt = (t, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = t; b.onclick = e => { e.stopPropagation(); fn(); }; acoes.appendChild(b); };
          if (it.telefone) bt('Copiar telefone', 'cinza', () => { GM_setClipboard(it.telefone, 'text'); msg('Telefone copiado: ' + it.telefone); });
          (it.telefone ? [] : it.telefonesObs || []).forEach(t => bt('Usar telefone ' + t, 'cinza', () => lbUsarTelefone(it.id, t)));
          if (!it.compartilhado && eqPronta()) bt('Compartilhar com a equipe', 'azul', () => lbCompartilhar(it.id));
          if (it.status === 'pendente') {
            bt('Pagamento', 'verde', () => lbAbrirForm(it, 'pagamento'));
            bt('Editar', 'cinza', () => lbAbrirForm(it, 'editar'));
            bt('Concluir', 'azul', () => lbMudarStatus(it.id, 'concluido'));
            bt('Cancelar', 'laranja', () => lbMudarStatus(it.id, 'cancelado'));
          } else bt('Reabrir', 'cinza', () => lbMudarStatus(it.id, 'pendente'));
          bt('Excluir', 'vermelho', () => lbExcluir(it.id));
          el.append(det, acoes);
        }
        el.onclick = () => { lbAberto = lbAberto === it.id ? null : it.id; lbDesenhar(); };
        caixa.appendChild(el);
      });
    }
    const lbHist = (it, texto) => { it.historico = [...(it.historico || []), { em: Date.now(), texto: new Date().toLocaleDateString() + ': ' + texto, por: eqNomeLocal() }].slice(-60); };
    function lbMudarStatus(id, st) {
      lbRecarregar();
      const it = lbBase.itens.find(x => x.id === id);
      if (!it) return;
      const nome = { concluido: 'concluir', cancelado: 'cancelar', pendente: 'reabrir' }[st];
      if (!confirm('Confirma ' + nome + ' o lembrete' + (it.proposta ? ' da proposta ' + it.proposta : '') + '?')) return;
      it.status = st; lbTocar(it); lbHist(it, { concluido: 'concluído', cancelado: 'cancelado', pendente: 'reaberto' }[st]);
      if (lbSalvar()) msg('Lembrete ' + { concluido: 'concluído', cancelado: 'cancelado', pendente: 'reaberto' }[st] + '.');
    }
    function lbExcluir(id) {
      lbRecarregar();
      const it = lbBase.itens.find(x => x.id === id);
      if (!it || !confirm('EXCLUIR definitivamente o lembrete' + (it.proposta ? ' da proposta ' + it.proposta : '') + '?' + (it.compartilhado ? ' Ele é compartilhado: sai também para a equipe.' : '') + ' Esta ação não pode ser desfeita.')) return;
      lbBase.itens = lbBase.itens.filter(x => x.id !== id);
      if (it.compartilhado) {   // a exclusão também vai para a equipe (fica 30 dias para quem estava offline receber)
        const marca = { id, excluido: true, rev: (it.rev || 1) + 1, atualizadoEm: Date.now(), atualizadoPor: eqId(), atualizadoPorNome: eqNomeLocal(), proposta: it.proposta };
        GM_setValue(LB_EXCLUIDOS, { ...(GM_getValue(LB_EXCLUIDOS, {}) || {}), [id]: marca });
        eqEnviar('lb', marca);
      }
      if (lbSalvar()) msg('Lembrete excluído.');
    }
    function lbUsarTelefone(id, t) {
      lbRecarregar();
      const it = lbBase.itens.find(x => x.id === id);
      if (!it) return;
      it.telefone = t; it.telefoneOrigem = 'obs'; lbHist(it, 'telefone ' + t + ' (das observações)'); lbTocar(it);
      if (lbSalvar()) msg('Telefone ' + t + ' salvo no lembrete (as observações continuam iguais).');
    }
    function lbCompartilhar(id) {
      lbRecarregar();
      const it = lbBase.itens.find(x => x.id === id);
      if (!it || !confirm('Compartilhar este lembrete' + (it.proposta ? ' da proposta ' + it.proposta : '') + ' com a equipe? Ele passa a aparecer para os funcionários conectados.')) return;
      it.compartilhado = true; if (!it.criadoPorNome) { it.criadoPor = eqId(); it.criadoPorNome = eqNomeLocal(); }
      lbHist(it, 'compartilhado com a equipe'); lbTocar(it);
      if (lbSalvar()) msg('Lembrete compartilhado com a equipe.');
    }
    // formulário: novo, editar ou registrar novo pagamento
    function lbAbrirForm(it, modoForm) {
      lbEditando = it ? { id: it.id, modo: modoForm } : null;
      $('#mf-lb-form-grupo').open = true;
      $('#mf-lb-form-tit').textContent = !it ? 'Novo lembrete' : modoForm === 'pagamento' ? 'Registrar pagamento (proposta ' + (it.proposta || '—') + ')' : 'Editar lembrete';
      $('#mf-lb-cliente').value = it ? it.cliente : ''; $('#mf-lb-proposta').value = it ? it.proposta : '';
      $('#mf-lb-telefone').value = it ? it.telefone || '' : '';
      $('#mf-lb-compartilhar-rot').style.display = eqPronta() && !(it && it.compartilhado) ? '' : 'none';
      $('#mf-lb-compartilhar').checked = !it;
      $('#mf-lb-total').value = it ? (it.total / 100).toFixed(2).replace('.', ',') : '';
      $('#mf-lb-pago').value = '';
      $('#mf-lb-pago-rot').textContent = it ? 'Novo pagamento (opcional)' : 'Valor pago agora';
      $('#mf-lb-data-pag').value = '';
      $('#mf-lb-proxima').value = it ? it.proxima : '';
      $('#mf-lb-obs').value = it ? it.obs : '';
      $('#mf-lb-status').value = it ? it.status : 'pendente';
      $('#mf-lb-status-rot').style.display = it && modoForm === 'editar' ? '' : 'none';
      ['#mf-lb-cliente', '#mf-lb-proposta', '#mf-lb-total', '#mf-lb-telefone'].forEach(s => { $(s).disabled = !!it && modoForm === 'pagamento'; });
      lbAtualizarSaldoForm();
      mostrarAba('lem');
    }
    function lbAtualizarSaldoForm() {
      const total = ngCentavos($('#mf-lb-total').value), novo = ngCentavos($('#mf-lb-pago').value) || 0;
      const it = lbEditando && lbBase.itens.find(x => x.id === lbEditando.id);
      const jaPago = it ? lbPago(it) : 0;
      if (total == null) { $('#mf-lb-saldo').textContent = 'Saldo restante: informe o valor total.'; return; }
      const saldo = total - jaPago - novo;
      $('#mf-lb-saldo').textContent = (jaPago ? 'Já pago: ' + ngReais(jaPago) + ' · ' : '') + 'Saldo restante: ' + (saldo < 0 ? 'NEGATIVO (' + ngReais(-saldo) + ' acima do total)' : ngReais(saldo));
      $('#mf-lb-saldo').style.color = saldo < 0 ? '#dc2626' : '';
    }
    ['#mf-lb-total', '#mf-lb-pago'].forEach(s => $(s).addEventListener('input', lbAtualizarSaldoForm));
    $('#mf-lb-cancelar').onclick = () => { lbAbrirForm(null); $('#mf-lb-form-grupo').open = false; };
    $('#mf-lb-salvar').onclick = () => {
      lbRecarregar();
      const total = ngCentavos($('#mf-lb-total').value);
      const pagoTxt = $('#mf-lb-pago').value.trim(), pago = pagoTxt ? ngCentavos(pagoTxt) : 0;
      const dataPag = $('#mf-lb-data-pag').value, proxima = $('#mf-lb-proxima').value;
      const proposta = $('#mf-lb-proposta').value.trim().slice(0, 40), cliente = $('#mf-lb-cliente').value.trim().slice(0, 120);
      const telTxt = $('#mf-lb-telefone').value.trim(), telefone = telTxt ? telFormatar(telTxt) : '';
      const erros = [];
      if (telTxt && !telefone) erros.push('telefone válido (DDD + número) ou deixe em branco');
      if (!proposta && !cliente) erros.push('proposta ou cliente');
      if (total == null || total <= 0) erros.push('valor total válido');
      if (pago == null || pago < 0) erros.push('valor pago válido');
      if (pagoTxt && pago > 0 && !lbDataOk(dataPag)) erros.push('data do pagamento');
      const st = $('#mf-lb-status-rot').style.display === 'none' ? 'pendente' : $('#mf-lb-status').value;
      if (st === 'pendente' && !lbDataOk(proxima)) erros.push('data do próximo acompanhamento');
      if (erros.length) return msg('Preencha: ' + erros.join(', ') + '.');
      let it = lbEditando && lbBase.itens.find(x => x.id === lbEditando.id);
      if (!it) {
        // já existe lembrete pendente desta proposta: oferece registrar o pagamento nele (sem duplicar)
        const existente = proposta && lbBase.itens.find(x => x.status === 'pendente' && x.proposta === proposta);
        if (existente && confirm('Já existe um lembrete pendente para a proposta ' + proposta + '. Registrar este pagamento nele?\n(Cancelar = criar outro lembrete separado)')) it = existente;
      }
      const jaPago = it ? lbPago(it) : 0;
      const totalFinal = it && lbEditando && lbEditando.modo === 'pagamento' ? it.total : total;
      if (jaPago + pago > totalFinal) return msg('O valor pago (' + ngReais(jaPago + pago) + ') passa do total (' + ngReais(totalFinal) + '): o saldo não pode ficar negativo.');
      if (!it) {
        it = { id: lbNovoId(), cliente, proposta, telefone, total, pagamentos: [], proxima: '', obs: '', status: 'pendente', historico: [], criadoEm: Date.now(), atualizadoEm: Date.now(),
          rev: 1, criadoPor: eqId(), criadoPorNome: eqNomeLocal(), compartilhado: eqPronta() && $('#mf-lb-compartilhar').checked };
        lbBase.itens.push(it);
        lbHist(it, 'criado');
      } else if (!(lbEditando && lbEditando.modo === 'pagamento')) {
        if (telefone !== (it.telefone || '')) { lbHist(it, 'telefone ' + (it.telefone || '—') + ' → ' + (telefone || '—')); it.telefone = telefone; delete it.telefoneOrigem; }
        it.cliente = cliente; it.proposta = proposta; it.total = total;
      }
      if (!it.compartilhado && eqPronta() && $('#mf-lb-compartilhar-rot').style.display !== 'none' && $('#mf-lb-compartilhar').checked) { it.compartilhado = true; lbHist(it, 'compartilhado com a equipe'); }
      if (pago > 0) { it.pagamentos.push({ id: 'pg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), valor: pago, data: dataPag, registradoEm: Date.now(), por: eqNomeLocal() }); lbHist(it, 'pagamento de ' + ngReais(pago) + (dataPag ? ' em ' + ngData(dataPag) : '')); }
      if (lbDataOk(proxima) && proxima !== it.proxima) { if (it.proxima) lbHist(it, 'acompanhamento ' + ngData(it.proxima) + ' → ' + ngData(proxima)); it.proxima = proxima; }
      if ($('#mf-lb-obs').value.trim() !== it.obs) it.obs = $('#mf-lb-obs').value.trim().slice(0, 1000);
      if (st !== it.status) { it.status = st; lbHist(it, 'status: ' + st); }
      lbTocar(it);
      if (!lbSalvar()) return;
      lbAberto = it.id; lbEditando = null;
      $('#mf-lb-form-grupo').open = false; lbAbrirForm(null); $('#mf-lb-form-grupo').open = false;
      lbFiltro = 'pendentes';
      lbDesenhar();
      msg('Lembrete salvo. Saldo restante: ' + ngReais(lbSaldo(it)) + '.');
    };
    painel.querySelectorAll('.mf-lb-filtros button').forEach(b => b.addEventListener('click', () => { lbFiltro = b.dataset.filtro; lbDesenhar(); }));
    $('#mf-lb-busca').addEventListener('input', lbDesenhar);

    // backup: exporta tudo (inclusive registros não reconhecidos); importa SOMANDO, sem duplicar (mesmo id: fica o mais recente)
    $('#mf-lb-exportar').onclick = () => {
      lbRecarregar();
      const json = JSON.stringify({ tipo: 'PaymobiFin-Assistente-lembretes', versao: LB_VERSAO, exportadoEm: new Date().toISOString(), itens: lbBase.itens, invalidos: lbBase.invalidos }, null, 1);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'lembretes-paymobifin-' + lbHoje() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      msg('Backup exportado (' + lbBase.itens.length + ' lembretes).');
    };
    $('#mf-lb-importar').onclick = () => $('#mf-lb-arquivo').click();
    $('#mf-lb-arquivo').addEventListener('change', async () => {
      const f = $('#mf-lb-arquivo').files[0];
      $('#mf-lb-arquivo').value = '';
      if (!f) return;
      let dados;
      try { dados = JSON.parse(await f.text()); } catch (_) { return msg('Arquivo inválido: não é um JSON.'); }
      const vindos = Array.isArray(dados) ? dados : dados && Array.isArray(dados.itens) ? dados.itens : null;
      if (!vindos) return msg('Arquivo não reconhecido como backup de lembretes.');
      lbRecarregar();
      let novos = 0, atualizados = 0, ignorados = 0;
      vindos.forEach(x => {
        const y = lbMigrar(x);
        if (!y) { ignorados++; return; }
        const i = lbBase.itens.findIndex(z => z.id === y.id);
        if (i < 0) { lbBase.itens.push(y); novos++; }
        else if ((y.atualizadoEm || 0) > (lbBase.itens[i].atualizadoEm || 0)) { lbBase.itens[i] = y; atualizados++; }
      });
      if (lbSalvar()) msg('Importação: ' + novos + ' novos, ' + atualizados + ' atualizados, ' + ignorados + ' não reconhecidos. Nenhum lembrete existente foi apagado.');
    });
    $('#mf-lb-notif').onclick = async () => {
      if (!('Notification' in window)) return msg('Este navegador não oferece notificações.');
      const p = await Notification.requestPermission();   // só quando o usuário clica
      msg(p === 'granted' ? 'Notificações ativadas: o navegador também avisa quando houver lembretes (com uma página do sistema aberta).' : 'Notificações não autorizadas. Os avisos continuam aparecendo dentro da página.');
    };

    /* ---- contador (badge) e pop-up ---- */
    function lbAtualizar() {
      const n = lbBase.itens.filter(lbAtencao).length;
      [$('#mf-lb-badge'), $('#mf-lb-badge-topo')].forEach(b => { b.textContent = n; b.style.display = n ? '' : 'none'; });
      $('#mf-lb-badge-topo').title = n + ' lembrete(s) para hoje ou atrasado(s)';
      lbDesenhar();
      lbVerificarPopup();
    }
    const lbAviso = () => GM_getValue('mfLembretesAviso', {}) || {};
    let lbPopup = null, lbNotificouEm = 0;
    function lbFecharPopup() { if (lbPopup) { lbPopup.remove(); lbPopup = null; } }
    function lbVerificarPopup() {
      const devidos = lbBase.itens.filter(lbAtencao);
      if (!devidos.length) return lbFecharPopup();
      const av = lbAviso();
      if (av.adiadoAte && Date.now() < av.adiadoAte) return lbFecharPopup();   // "Lembrar mais tarde" (vale para todas as abas)
      lbMostrarPopup(devidos);
    }
    function lbMostrarPopup(devidos) {
      if (!lbPopup) {
        lbPopup = document.createElement('div');
        lbPopup.id = 'mf-lb-popup';
        document.body.appendChild(lbPopup);
        if (window.Notification && Notification.permission === 'granted' && Date.now() - lbNotificouEm > 30 * 60 * 1000) {
          lbNotificouEm = Date.now();
          try { new Notification('PaymobiFin - Assistente', { body: devidos.length + ' lembrete(s) de pagamento para acompanhar hoje.' }); } catch (_) {}
        }
      }
      lbPopup.innerHTML = '';
      const st = document.createElement('style');
      st.textContent = '#mf-lb-popup{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:340px;max-width:calc(100vw - 32px);max-height:70vh;overflow:auto;background:#fff;color:#1f2937;border:1px solid #fca5a5;border-left:5px solid #dc2626;border-radius:10px;box-shadow:0 10px 30px #0004;font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif;padding:12px}' +
        '#mf-lb-popup *{box-sizing:border-box;font-family:inherit}#mf-lb-popup h4{margin:0 0 8px;font-size:14px}#mf-lb-popup .it{border-top:1px solid #f1f5f9;padding:8px 0}' +
        '#mf-lb-popup .at{color:#dc2626;font-weight:700}#mf-lb-popup button{cursor:pointer;border:0;border-radius:6px;padding:5px 8px;margin:4px 4px 0 0;font-size:12px;font-weight:600;background:#e2e8f0;color:#1e293b}' +
        '#mf-lb-popup button.pri{background:#2563eb;color:#fff}#mf-lb-popup input{font-size:12px;padding:3px;margin:4px 4px 0 0}';
      lbPopup.appendChild(st);
      const h = document.createElement('h4');
      h.textContent = '🔔 ' + devidos.length + ' acompanhamento(s) de pagamento';
      lbPopup.appendChild(h);
      devidos.sort((a, b) => a.proxima.localeCompare(b.proxima)).slice(0, 20).forEach(it => {
        const d = document.createElement('div'); d.className = 'it';
        const t = document.createElement('div');
        t.textContent = (it.cliente || 'Cliente não informado') + (it.proposta ? ' · proposta ' + it.proposta : '');
        const s = document.createElement('div');
        s.innerHTML = '';
        s.append('Pago: ' + ngReais(lbPago(it)) + ' · Saldo: ' + ngReais(lbSaldo(it)) + ' · ');
        const dt = document.createElement('span'); dt.className = lbVencido(it) ? 'at' : '';
        dt.textContent = (lbVencido(it) ? 'atrasado desde ' : 'hoje, ') + ngData(it.proxima);
        s.appendChild(dt);
        d.append(t, s);
        if (it.obs) { const o = document.createElement('div'); o.style.color = '#64748b'; o.textContent = it.obs.slice(0, 160); d.appendChild(o); }
        const b = (txt, cls, fn) => { const x = document.createElement('button'); x.textContent = txt; if (cls) x.className = cls; x.onclick = fn; d.appendChild(x); return x; };
        b('Ver lembrete', 'pri', () => { lbAberto = it.id; lbFiltro = 'atencao'; if (GM_getValue('min', false)) { GM_setValue('min', false); aplicarMin(false); trazerParaTela(); } mostrarAba('lem'); lbDesenhar(); });
        const adiarBt = b('Adiar', '', () => {
          if (d.querySelector('input[type=date]')) return;
          const inp = document.createElement('input'); inp.type = 'date'; inp.min = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })();
          const ok = document.createElement('button'); ok.textContent = 'OK'; ok.className = 'pri';
          ok.onclick = () => {
            if (!lbDataOk(inp.value) || inp.value <= lbHoje()) return msg('Escolha uma data a partir de amanhã.');
            lbRecarregar();
            const x = lbBase.itens.find(z => z.id === it.id);
            if (!x) return;
            lbHist(x, 'adiado de ' + ngData(x.proxima) + ' para ' + ngData(inp.value)); x.proxima = inp.value; lbTocar(x);
            if (lbSalvar()) msg('Lembrete adiado para ' + ngData(inp.value) + '.');
          };
          adiarBt.after(inp, ok);
        });
        b('Concluir', '', () => lbMudarStatus(it.id, 'concluido'));
        lbPopup.appendChild(d);
      });
      const rod = document.createElement('div'); rod.style.marginTop = '8px';
      const mais = document.createElement('button');
      mais.textContent = 'Lembrar mais tarde (1 h)';
      mais.onclick = () => { GM_setValue('mfLembretesAviso', { ...lbAviso(), adiadoAte: Date.now() + 60 * 60 * 1000 }); lbFecharPopup(); };   // não muda nenhum lembrete
      rod.appendChild(mais);
      lbPopup.appendChild(rod);
    }
    $('#mf-lb-badge-topo').addEventListener('click', e => {
      e.stopPropagation();
      if (GM_getValue('min', false)) { GM_setValue('min', false); aplicarMin(false); trazerParaTela(); }
      lbFiltro = 'atencao'; mostrarAba('lem'); lbDesenhar();
    });
    // a cada minuto: virada do dia, mudanças feitas em outra aba e fim do "lembrar mais tarde"
    setInterval(() => { lbRecarregar(); lbAtualizar(); }, 60 * 1000);
    lbAtualizar();


    /* ================= CONSULTA CAC (Central de Atendimento) — SOMENTE LEITURA =================
       Usa as MESMAS requisições que a tela do CAC faz (código da própria página):
         1. GET  /CentralAtendimento/CentralPesquisaCliente?strCliente=...  -> #tabCentralClientes (CPF, Nome, Produto, Conta...)
            cada linha chama Atendimento('produto', 'conta')
         2. GET  /CentralAtendimento/BuscaCartao?strProduto&strCartao       -> JSON do cliente (situação, protocolo, confirmação)
         3. POST /CentralAtendimento/CentralInicio (opcional)              -> Posição Geral (Origem, Data de Adesão, contratos)
            (como na tela, o sistema registra um protocolo de atendimento; pode ser desligado em Configurações)
            sem ela: GET /CentralAtendimento/CentralCompras (lista de contratos)
         4. GET  /CentralAtendimento/DetalheCompra?strAutorizacao=N         -> Detalhes da Transação + tabela de parcelas
       Nada é alterado no CAC (nenhuma "Operação"). Se o sistema pedir confirmação de identidade, a consulta para.
       Consulta em andamento e resultado ficam no sessionStorage DESTA aba (somem ao fechar a aba); nada vai para o GM. */
    const CAC_SS = 'mfCacEstado';
    const cacSS = () => { try { return JSON.parse(sessionStorage.getItem(CAC_SS) || 'null'); } catch (_) { return null; } };
    const cacSSSet = v => { try { if (v) sessionStorage.setItem(CAC_SS, JSON.stringify(v)); else sessionStorage.removeItem(CAC_SS); } catch (_) {} };
    const cacBase = () => {
      const v = (document.getElementById('txtCaminhoSistema') || {}).value;
      if (v) return v.replace(/\/+$/, '');
      const m = location.pathname.match(/^(.*?\/ErCardWeb)(\/|$)/i);
      return location.origin + (m ? m[1] : '');
    };
    // endereço do ER guardado para o módulo do RD Atendimento consultar a Mesa (só o endereço; nenhum dado de cliente)
    // O campo do sistema (txtCaminhoSistema) pode vir relativo ("/ErCardWeb"): vira endereço completo antes de gravar.
    // Confere de novo depois que a página termina de montar (o campo pode aparecer depois do login).
    const erGuardarBase = () => {
      try {
        // resolve exatamente como as consultas do painel (cacBase() + '/MesaCredito/...', relativo à página) e tira o caminho
        const u = new URL(cacBase() + '/MesaCredito/MesaCreditoLista', location.href);
        if (!/(^|\.)paymobi\.ercard\.com\.br$/i.test(u.hostname)) return;
        const b = (u.origin + u.pathname.replace(/\/MesaCredito\/MesaCreditoLista$/, '')).replace(/\/+$/, '');
        if (GM_getValue('erBase', '') !== b) GM_setValue('erBase', b);
      } catch (_) {}
    };
    erGuardarBase();
    setTimeout(erGuardarBase, CONFIG.ER_BASE_RECONFERIR * 1000);
    let cacOcupado = false;
    const cacStatus = t => { $('#mf-cac-st').textContent = t; };
    const limpoTxt = t => String(t || '').replace(/[\s ]+/g, ' ').trim();
    async function cacReq(caminho, params, metodo) {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_REDE * 1000);
      const corpo = new URLSearchParams(params).toString();
      const url = cacBase() + caminho + (metodo === 'POST' ? '' : '?' + corpo);
      try {
        const r = await fetch(url, metodo === 'POST'
          ? { method: 'POST', credentials: 'include', signal: ctl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: corpo }
          : { credentials: 'include', signal: ctl.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        return { ok: r.ok, status: r.status, texto: await r.text() };
      } catch (e) {
        return { ok: false, status: 0, texto: '', erro: ctl.signal.aborted ? 'tempo esgotado' : 'erro de rede' };
      } finally { clearTimeout(tm); }
    }
    const cacDoc = t => new DOMParser().parseFromString(t, 'text/html');
    const ehLogin = erSemSessao;   // tela de login ou aviso de sessão expirada (ver erSemSessao)
    // pares <dt>rótulo</dt><dd>valor</dd> de um fragmento
    const cacDl = doc => {
      const o = {};
      doc.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        const k = limpoTxt(dt.textContent).toLowerCase();
        if (dd && dd.tagName === 'DD' && !(k in o)) o[k] = limpoTxt(dd.textContent);
      });
      return o;
    };
    const cacContratos = doc => [...new Set([...doc.querySelectorAll('[onclick*="CentralDetalheCompra"]')]
      .map(el => (el.getAttribute('onclick').match(/CentralDetalheCompra\(\s*['"]?(\d+)/) || [])[1]).filter(Boolean))];
    const cacNum = t => { const c = ngCentavos(limpoTxt(t)); return c == null ? null : c; };
    const cacIsoDe = br => { const m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
    const cacCpfFmt = d => (d && d.length >= 11 ? d.slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '');

    // tabela de parcelas do "Detalhes da Transação" (colunas achadas pelo cabeçalho)
    function cacParcelas(doc) {
      const tab = [...doc.querySelectorAll('table')].find(t => { const h = limpoTxt(t.querySelector('thead') && t.querySelector('thead').textContent).toLowerCase(); return /parcela/.test(h) && /dias atraso/.test(h) && /saldo/.test(h); });
      if (!tab) return null;
      const ths = [...tab.querySelectorAll('thead th')].map(th => limpoTxt(th.textContent).toLowerCase());
      const ix = n => ths.findIndex(h => h === n || h.startsWith(n));
      const c = { parc: ix('parcela'), venc: ix('vencimento'), valor: ix('valor'), saldo: ix('saldo'), dias: ix('dias atraso'), dpg: ix('data pagto'), vpg: ix('vlr pg'), sit: ix('situação') };
      return [...tab.querySelectorAll('tbody tr')].map(tr => {
        const td = [...tr.children].map(x => limpoTxt(x.textContent));
        const num = parseInt((td[c.parc] || '').match(/\d+/) || ['0'], 10);
        return { num, venc: cacIsoDe(td[c.venc]), valor: cacNum(td[c.valor]), saldo: cacNum(td[c.saldo]), dias: parseInt(td[c.dias], 10) || 0,
          dataPg: cacIsoDe(td[c.dpg]), valorPg: cacNum(td[c.vpg]), situacao: td[c.sit] || '' };
      }).filter(p => p.num > 0);
    }

    // campos da aba Negociação a partir do que veio do CAC (cada um com a origem)
    function cacCalcular(row, posicao, det, parcelas) {
      const f = {}, src = {};
      const put = (k, v, s) => { if (v != null && v !== '' && f[k] == null) { f[k] = v; src[k] = s; } };
      put('nome', det && det['nome do cliente'], 'Detalhe do contrato');
      put('nome', posicao && (posicao['cliente'] || '').replace(/\s*\([\d.\-/]+\)\s*$/, ''), 'Posição Geral');
      put('nome', row.nome, 'Pesquisa');
      put('cpf', det && det['cpf'], 'Detalhe do contrato');
      put('cpf', cacCpfFmt(row.cpf), 'Pesquisa');
      put('dataProposta', det && (det['data contrato'] || '').match(/\d{2}\/\d{2}\/\d{4}/) && det['data contrato'].match(/\d{2}\/\d{2}\/\d{4}/)[0], 'Detalhe do contrato (Data Contrato)');
      put('dataProposta', posicao && posicao['data de adesão'], 'Posição Geral (Data de Adesão)');
      put('filial', posicao && (posicao['origem'] || '').replace(/\s*\(\d+\)\s*$/, ''), 'Posição Geral (Origem)');
      put('totalParcelas', det && ((det['prazo'] || '').match(/\d+/) || [])[0], 'Detalhe do contrato (Prazo)');
      if (parcelas && parcelas.length) put('totalParcelas', String(Math.max(...parcelas.map(p => p.num))), 'Parcelas (quantidade na tabela)');
      if (parcelas && parcelas.length) {
        const hoje = lbHoje();
        const p1 = parcelas.find(p => p.num === 1) || parcelas[0];
        if (p1.valor != null) put('valorParcela', ngReais(p1.valor), 'Parcelas (valor da parcela ' + p1.num + ')');
        const atraso = parcelas.filter(p => p.dias > 0 && (p.saldo == null || p.saldo > 0));
        put('parcelasAtraso', String(atraso.length), 'Parcelas (dias de atraso > 0 e saldo em aberto)');
        put('diasAtraso', String(atraso.length ? Math.max(...atraso.map(p => p.dias)) : 0), 'Parcelas (maior "Dias Atraso")');
        const antigo = atraso.map(p => p.venc).filter(Boolean).sort()[0];
        if (antigo) put('vencMaisAntigo', ngData(antigo), 'Parcelas (vencimento mais antigo em atraso)');
        // parcela atual = a de menor número ainda em aberto (saldo > 0); total = Prazo do contrato
        const aberta = parcelas.filter(p => p.saldo == null ? !/liquid/i.test(p.situacao) : p.saldo > 0).sort((a, b) => a.num - b.num)[0];
        if (aberta) put('parcelaAtual', String(aberta.num), 'Parcelas (1ª parcela com saldo em aberto)');
        // FPD: a 1ª parcela venceu e não foi paga integralmente
        if (p1.num === 1 && p1.venc) {
          const naoPaga = p1.saldo == null ? !/liquid/i.test(p1.situacao) : p1.saldo > 0;
          put('fpd', p1.venc < hoje && naoPaga ? 'SIM' : 'NÃO', 'Parcela 1 (' + (p1.situacao || 'sem situação') + ', saldo ' + (p1.saldo != null ? ngReais(p1.saldo) : '?') + ')');
        }
      }
      return { campos: f, origem: src };
    }

    async function cacConsultar(termo, extra) {
      extra = extra || {};
      if (cacOcupado) return;
      if (executando || ccb.rodando) return msg('Há uma coleta ou download em andamento. Aguarde terminar para consultar o CAC.');
      termo = limpoTxt(termo).toUpperCase();
      if (termo.replace(/\D/g, '').length === 11 && /^[\d.\-\s]+$/.test(termo)) termo = termo.replace(/\D/g, '');
      if (termo.length < 3) return msg('Informe o CPF ou o nome do cliente.');
      cacOcupado = true;
      $('#mf-cac-buscar').disabled = true;
      cacMostrar(null);
      try {
        cacStatus('Pesquisando no CAC...');
        const r = await cacReq('/CentralAtendimento/CentralPesquisaCliente', { strCliente: termo });
        const doc = r.texto ? cacDoc(r.texto) : null;
        const tab = doc && doc.querySelector('#tabCentralClientes');
        // sem resultado: avisa e, se o script trocou de conta para esta consulta, volta para a conta de antes
        const semResultado = texto => {
          const st = cacSS();
          if ((extra && extra.voltar) || (st && st.voltar)) return cacFim(texto, extra);
          cacSSSet(null); cacStatus(''); msg(texto);
        };
        if (!r.ok || !tab) {
          // Sem a tabela, o CAC responde um aviso (visto no sistema real). Só "sem direito" é falta de acesso:
          //   "Nenhum registro selecionado" = não achou · "Informe corretamente o CPF / CNPJ..." = termo inválido
          //   "Usuário sem direito de pesquisa por nome de cliente" = a conta só pesquisa pelo CPF (a master pesquisa pelo nome)
          const aviso = r.ok && doc && doc.body ? limpoTxt(doc.body.textContent) : '';
          if (/nenhum registro/i.test(aviso)) return semResultado('CAC: nenhum cliente encontrado para "' + termo + '".');
          if (/informe corretamente/i.test(aviso)) return semResultado('CAC: ' + aviso);
          const motivo = r.erro || (ehLogin(r.texto) ? 'a sessão expirou' : /sem direito/i.test(aviso) ? 'esta conta não pesquisa o CAC pelo nome do cliente (pelo CPF ela pesquisa)'
            : 'esta conta não tem acesso ao CAC (HTTP ' + r.status + ')');
          return cacSemAcesso(termo, motivo, extra);
        }
        let rows = [...tab.querySelectorAll('tbody tr[onclick*="Atendimento("]')].map(tr => {
          const m = tr.getAttribute('onclick').match(/Atendimento\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]/) || [];
          const td = [...tr.children].map(x => limpoTxt(x.textContent));
          return { produto: m[1] || '', conta: m[2] || '', cpf: (td[0] || '').replace(/\D/g, ''), nome: td[1] || '', produtoTxt: td[2] || '', situacao: td[4] || '', motivo: td[5] || '' };
        }).filter(x => x.produto && x.conta);
        const cpfBusca = /^\d{11}$/.test(termo) ? termo : '';
        if (cpfBusca) rows = rows.filter(x => x.cpf.startsWith(cpfBusca));
        if (!rows.length) return semResultado('CAC: nenhum cliente encontrado para "' + termo + '".');
        if (rows.length > 1) {
          cacStatus('Mais de um resultado: escolha o cliente/produto.');
          const caixa = $('#mf-cac-escolha');
          caixa.innerHTML = '';
          rows.slice(0, 30).forEach(x => {
            const b = document.createElement('button');
            b.className = 'cinza'; b.style.cssText = 'width:100%;margin-top:4px;text-align:left;font-size:12px;padding:6px';
            b.textContent = x.nome + ' · ' + cacCpfFmt(x.cpf) + ' · ' + x.produtoTxt + ' · conta ' + x.conta + (x.motivo ? ' · ' + x.motivo : '');
            b.onclick = () => { caixa.innerHTML = ''; cacAbrir(x, termo, extra); };
            caixa.appendChild(b);
          });
          return;
        }
        await cacAbrir(rows[0], termo, extra, true);
      } finally {
        cacOcupado = false;
        $('#mf-cac-buscar').disabled = false;
      }
    }

    async function cacAbrir(row, termo, extra, dentro) {
      if (!dentro) { if (cacOcupado) return; cacOcupado = true; }
      try {
        cacStatus('Abrindo o cliente (somente leitura)...');
        const r = await cacReq('/CentralAtendimento/BuscaCartao', { strProduto: row.produto, strCartao: row.conta });
        let js = null;
        try { js = JSON.parse(r.texto); } catch (_) {}
        const c = Array.isArray(js) ? js[0] : js;
        if (!r.ok || !c) return cacFim('O CAC não devolveu os dados do cliente' + (ehLogin(r.texto) ? ' (sessão expirada)' : ' (HTTP ' + r.status + ')') + '.', extra);
        if (c.strResultado) return cacFim('CAC: ' + limpoTxt(cacDoc(String(c.strResultado)).body.textContent), extra);
        if (c.strValidarDadosCliente === 'S') return cacFim('O CAC exige a confirmação de identidade deste cliente. Faça esta consulta pela tela do CAC.', extra);
        let posicao = null, contratos = [];
        if (cfg('cacPosicaoGeral')) {
          cacStatus('Lendo a Posição Geral...');
          const p = await cacReq('/CentralAtendimento/CentralInicio', { strProduto: row.produto, strCartao: row.conta, lngProtocolo: c.lngProtocoloAtendimento || 0 }, 'POST');
          if (p.ok && p.texto) { const d = cacDoc(p.texto); posicao = cacDl(d); contratos = cacContratos(d); }
        }
        if (!contratos.length) {
          cacStatus('Lendo os contratos...');
          const p = await cacReq('/CentralAtendimento/CentralCompras', { strProduto: row.produto, strCartao: row.conta });
          if (p.ok && p.texto) contratos = cacContratos(cacDoc(p.texto));
        }
        const detalhes = [];
        for (const aut of contratos.slice(0, 5)) {
          cacStatus('Lendo o contrato ' + aut + '...');
          const d = await cacReq('/CentralAtendimento/DetalheCompra', { strAutorizacao: aut });
          if (!d.ok || !d.texto) continue;
          const doc = cacDoc(d.texto), dl = cacDl(doc);
          // o contrato tem que ser do MESMO cliente pesquisado (CPF)
          const cpfDet = (dl['cpf'] || '').replace(/\D/g, '');
          if (cpfDet && row.cpf && !row.cpf.startsWith(cpfDet)) continue;
          detalhes.push({ aut, dl, parcelas: cacParcelas(doc) || [] });
        }
        // vários contratos: usa o que tem atraso (o mais atrasado); senão o primeiro
        const escolhido = detalhes.slice().sort((a, b) => Math.max(0, ...b.parcelas.map(p => p.dias)) - Math.max(0, ...a.parcelas.map(p => p.dias)))[0] || null;
        const calc = cacCalcular(row, posicao, escolhido && escolhido.dl, escolhido && escolhido.parcelas);
        const resultado = {
          termo, consultadoEm: new Date().toLocaleString(), conta: (contaAtiva() || {}).usuario || '',
          cliente: { nome: calc.campos.nome || row.nome, cpf: calc.campos.cpf || cacCpfFmt(row.cpf) },
          contrato: escolhido ? escolhido.aut : '', outrosContratos: detalhes.filter(d => d !== escolhido).map(d => d.aut),
          produto: row.produtoTxt, situacao: (posicao && posicao['situação']) || row.situacao + (row.motivo ? ' / ' + row.motivo : ''),
          protocolo: c.lngProtocoloAtendimento || '', posicaoGeral: !!posicao,
          campos: calc.campos, origem: calc.origem,
        };
        const st = cacSS() || {};
        cacSSSet({ etapa: 'resultado', resultado, voltar: extra.voltar || st.voltar || '', quando: Date.now(), abrirAba: !(extra.origemBusca || st.origemBusca) });
        cacMostrar(resultado);
        cacStatus('');
        msg('CAC: dados de ' + resultado.cliente.nome + ' lidos. Para a planilha, use o Atendimento ("Aplicar cliente atual").');
        cacVoltarConta(extra);
      } finally {
        if (!dentro) cacOcupado = false;
      }
    }
    function cacFim(texto, extra) {
      cacStatus('');
      const st = cacSS();
      // o aviso fica guardado nesta aba para ser mostrado de novo depois da volta para a conta anterior
      if (!st || st.etapa !== 'resultado') cacSSSet({ etapa: 'aviso', texto, voltar: (extra && extra.voltar) || (st && st.voltar) || '', quando: Date.now() });
      msg(texto);
      cacVoltarConta(extra);
    }
    // depois da consulta, volta para a conta de antes (se a troca foi feita pelo script)
    function cacVoltarConta(extra) {
      const voltar = (extra && extra.voltar) || ((cacSS() || {}).voltar);
      if (!voltar || !cfg('cacVoltarConta')) return;
      const c = contas().find(x => x.usuario.toLowerCase() === voltar.toLowerCase());
      const st = cacSS();
      if (st) cacSSSet({ ...st, voltar: '' });
      if (!c) return msg('Consulta feita. A conta anterior (' + voltar + ') não está cadastrada: volte para ela manualmente.');
      setTimeout(() => trocarPara(c), 1500);
    }
    // sem acesso com a conta atual: troca para a conta master (se configurada) e continua sozinho depois do login
    function cacSemAcesso(termo, motivo, extra) {
      const master = contas().find(x => x.usuario === GM_getValue('cacContaMaster', ''));
      const atual = contaAtiva();
      if (extra.jaTrocou || !master || !cfg('cacTrocaAuto') || (atual && atual.usuario.toLowerCase() === master.usuario.toLowerCase())) {
        cacSSSet(null); cacStatus('');
        return msg('CAC indisponível: ' + motivo + '.' + (!master ? ' Escolha a conta master em Configurações > Consulta CAC para trocar automaticamente.' : ''));
      }
      if (GM_getValue('trocaConta', null)) return msg('Já existe uma troca de conta em andamento. Aguarde terminar.');
      cacSSSet({ etapa: 'trocando', termo, voltar: atual ? atual.usuario : '', quando: Date.now(), origemBusca: !!extra.origemBusca });
      cacStatus('Trocando para a conta master (' + rotuloConta(master) + ')...');
      msg('A conta atual não acessa o CAC (' + motivo + '). Trocando para a conta master; a consulta continua sozinha depois do login.');
      trocarPara(master);
    }
    // a cada página carregada: continua a consulta depois da troca, ou mostra o resultado guardado nesta aba
    function cacRetomar() {
      const st = cacSS();
      if (!st) return;
      if (st.etapa === 'resultado') {
        cacMostrar(st.resultado);
        if (st.abrirAba && !campoSenha() && !GM_getValue('trocaConta', null)) { cacSSSet({ ...st, abrirAba: false }); mostrarAba('cac'); }
        return;
      }
      if (st.etapa === 'aviso') {
        if (campoSenha() || GM_getValue('trocaConta', null)) return;
        cacSSSet(null); mostrarAba('cac'); msg('Consulta CAC: ' + st.texto);
        return;
      }
      if (Date.now() - st.quando > 15 * 60 * 1000) return cacSSSet(null);
      if (campoSenha() || GM_getValue('trocaConta', null)) { cacStatus('Aguardando o login da conta master...'); return; }
      const master = GM_getValue('cacContaMaster', '');
      const a = contaAtiva();
      if (st.etapa === 'trocando' && a && a.usuario.toLowerCase() === master.toLowerCase()) {
        cacSSSet({ ...st, etapa: 'consultando' });
        mostrarAba('cac');
        $('#mf-cac-termo').value = st.termo;
        cacConsultar(st.termo, { voltar: st.voltar, jaTrocou: true, origemBusca: !!st.origemBusca });
      } else if (st.etapa === 'trocando') {
        cacSSSet(null);
        msg('A troca para a conta master não foi confirmada (conta ativa: ' + (a ? rotuloConta(a) : 'não identificada') + '). Consulta CAC cancelada.');
      }
    }

    // dados do CAC mostrados no resultado (o preenchimento manual e a cópia da linha saíram na v12: a linha completa
    // da planilha Negociação agora sai do Atendimento, que recebe estes mesmos dados pela Busca de cliente)
    const CAC_EXIBIR = [['Data da Proposta', 'dataProposta'], ['Filial', 'filial'], ['Valor parcela', 'valorParcela'], ['FPD', 'fpd'],
      ['Parcelas Em Atraso', 'parcelasAtraso'], ['Dias Atraso', 'diasAtraso'], ['Vencimento Mais Antigo', 'vencMaisAntigo']];
    function cacMostrar(res) {
      $('#mf-cac-res').style.display = res ? '' : 'none';
      if (!res) return;
      const t = $('#mf-cac-tabela');
      t.innerHTML = '';
      const add = (k, v, s) => {
        const d = document.createElement('div'); d.className = 'mf-cac-lin';
        const a = document.createElement('span'); a.textContent = k;
        const b = document.createElement('b'); b.textContent = v || 'N/A';
        if (s) b.title = 'Origem: ' + s;
        d.append(a, b); t.appendChild(d);
      };
      add('Cliente', res.cliente.nome + (res.cliente.cpf ? ' (' + res.cliente.cpf + ')' : ''));
      add('Contrato', res.contrato + (res.outrosContratos.length ? ' (outros: ' + res.outrosContratos.join(', ') + ')' : ''));
      add('Situação', res.situacao);
      CAC_EXIBIR.forEach(([rot, k]) => add(rot, res.campos[k], res.origem[k]));
      add('Parcela atual', res.campos.parcelaAtual, res.origem.parcelaAtual);
      add('Total de parcelas', res.campos.totalParcelas, res.origem.totalParcelas);
      const info = document.createElement('div'); info.className = 'mf-info'; info.style.marginTop = '4px';
      info.textContent = 'Consultado em ' + res.consultadoEm + (res.conta ? ' com a conta ' + res.conta : '') + (res.posicaoGeral ? ' · Posição Geral aberta (protocolo ' + (res.protocolo || 'do sistema') + ')' : ' · sem Posição Geral') + '. Passe o mouse no valor para ver a origem.';
      t.appendChild(info);
    }
    $('#mf-cac-buscar').onclick = () => { cacSSSet(null); cacConsultar($('#mf-cac-termo').value); };
    $('#mf-cac-termo').addEventListener('keydown', e => { if (e.key === 'Enter') $('#mf-cac-buscar').click(); });
    $('#mf-cac-limpar').onclick = () => {
      cacSSSet(null); cacMostrar(null); cacStatus('');
      $('#mf-cac-termo').value = '';
      msg('Pronto para uma nova consulta.');
    };
    // Configurações: conta master e opções
    const selMaster = $('#mf-cac-master');
    const desenharMaster = () => {
      const atual = GM_getValue('cacContaMaster', '');
      selMaster.innerHTML = '<option value="">(nenhuma)</option>';
      contas().forEach(c => { const o = document.createElement('option'); o.value = c.usuario; o.textContent = rotuloConta(c); selMaster.appendChild(o); });
      selMaster.value = contas().some(c => c.usuario === atual) ? atual : '';
    };
    selMaster.addEventListener('change', () => { GM_setValue('cacContaMaster', selMaster.value); msg(selMaster.value ? 'Conta master do CAC: ' + selMaster.value + '.' : 'Sem conta master para o CAC.'); });
    $('#mf-contas-tit').addEventListener('click', desenharMaster);
    $('#mf-conta-salvar').addEventListener('click', desenharMaster);
    painel.querySelectorAll('[data-aba="cfg"]').forEach(b => b.addEventListener('click', desenharMaster));
    ligarOpcao('#mf-cac-troca', 'cacTrocaAuto');
    ligarOpcao('#mf-cac-voltar', 'cacVoltarConta');
    ligarOpcao('#mf-cac-posicao', 'cacPosicaoGeral');
    desenharMaster();
    cacRetomar();

    /* ================= RELATÓRIO DE PENDÊNCIAS (pd) — SOMENTE LEITURA =================
       Propostas com pendência em aberto na "Fila de Pendências" (Serviços), que fica na conta master:
         1. GET /FilaPendencias/FilaPendenciasLista (filtro "TODAS PENDENTES", sem agrupar, desde PD_DESDE até hoje)
            -> tabela com Pend, Sit, Autorização, Nome, Data Compra
         2. GET /FilaPendencias/DetalheCompra?strAutorizacao=N&strPendencia=P&strTipoConsulta=P (a tela "Manutenção de
            Pendência"; só é lida, nenhum botão dela é usado) -> Nro da Proposta, Usuário (vendedor), Lojista e Loja
       Conta sem a fila: com a conta master escolhida em Configurações > Consulta CAC (e a troca automática ligada),
       troca para ela e gera sozinho depois do login, como a Consulta CAC. O resultado fica nesta aba (sessionStorage). */
    const PD_SS = 'mfPendencias';
    const PD_DESDE = '01/01/2020';
    const PD_SEPARADOR = '-'.repeat(66);
    const pdSS = () => { try { return JSON.parse(sessionStorage.getItem(PD_SS) || 'null'); } catch (_) { return null; } };
    const pdSSSet = v => { try { if (v) sessionStorage.setItem(PD_SS, JSON.stringify(v)); else sessionStorage.removeItem(PD_SS); } catch (_) {} };
    const pdStatus = t => { $('#mf-pd-st').textContent = t || ''; };
    const pdHoje = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
    let pdRodando = false;
    // pares <dt>rótulo</dt><dd>valor</dd>: fica o PRIMEIRO de cada rótulo ("Usuário" se repete em cada pendência)
    const pdDl = doc => {
      const o = {};
      doc.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling, k = limpoTxt(dt.textContent).replace(/:$/, '').toLowerCase();
        if (dd && dd.tagName === 'DD' && !(k in o)) o[k] = limpoTxt(dd.textContent);
      });
      return o;
    };
    // "5170086580 - GUILHERME A. MELO-XP ITAQUERA AT" -> "GUILHERME A. MELO"; "5051394680 - JULIA - XP MAUA AT" -> "JULIA"
    const pdVendedor = u => String(u || '').replace(/^\d+\s*-\s*/, '').split(/\s*-\s*/)[0].trim();
    // Lojista "XPANSE NEGOCIOS LTDA - 000004" + Loja "XPANSE - ITAQUERA - 0009" -> "XPANSE NEGOCIOS LTDA - ITAQUERA"
    const pdLoja = (lojista, loja) => {
      const lj = String(lojista || '').replace(/\s*-\s*\d+$/, '').trim();
      const lo = String(loja || '').replace(/\s*-\s*\d+$/, '').trim();
      const partes = lo.split(/\s+-\s+/);
      const nome = partes.length > 1 ? partes.slice(1).join(' - ') : lo;
      return lj && nome ? lj + ' - ' + nome : lj || nome;
    };
    async function pdLista() {
      const r = await cacReq('/FilaPendencias/FilaPendenciasLista', {
        strPendencia: '', strTipoRepasse: 'R', strTipoPendencia: 'T', strProduto: '', strLojista: '', strLoja: '',
        strDataInicial: PD_DESDE, strDataFinal: pdHoje(), strTipoData: 'S', strCliente: '', lngAutorizacao: '', lngProposta: '',
        strPromotora: '', strPromotoraFilial: '', strAgrupamento: 'N', strReembolso: '', strTipoBloqueio: '', strTipoDocumento: '',
        strConveniada: '', strPlano: '' });
      if (r.erro) return { erro: 'o ER não respondeu (' + r.erro + ')' };
      if (ehLogin(r.texto)) return { erro: 'sessão do ER expirada: entre de novo' };
      if (!r.ok) return { erro: 'o ER respondeu com erro (HTTP ' + r.status + ')', semAcesso: r.status === 401 || r.status === 403 };
      const doc = cacDoc(r.texto);
      const t = doc.querySelector('table');
      // sem nenhuma pendência o ER devolve só o aviso (o "ã" pode vir como &#227;: o DOMParser já decodifica)
      if (!t) return /n[ãa]o foi localizada nenhuma pend[êe]ncia/i.test(doc.body.textContent) ? { linhas: [] }
        : { erro: 'a resposta não trouxe a Fila de Pendências', semAcesso: true };
      const ths = [...t.querySelectorAll('thead th')].map(th => limpoTxt(th.textContent).toLowerCase());
      const col = n => ths.findIndex(x => x.startsWith(n));
      const ci = { pend: col('pend'), aut: col('autoriza'), nome: col('nome'), data: col('data') };
      if (ci.aut < 0) return { erro: 'a Fila de Pendências veio sem a coluna Autorização', semAcesso: true };
      const linhas = [...t.querySelectorAll('tbody tr')].map(tr => {
        const c = [...tr.children].map(td => limpoTxt(td.textContent));
        return { aut: (c[ci.aut] || '').replace(/\D/g, ''), pend: c[ci.pend] || '', nome: c[ci.nome] || '', data: c[ci.data] || '' };
      }).filter(l => l.aut);
      return { linhas };
    }
    async function pdDetalhe(l) {
      const r = await cacReq('/FilaPendencias/DetalheCompra', { strAutorizacao: l.aut, strPendencia: (l.pend.match(/\d+/) || [''])[0], strTipoConsulta: 'P' });
      if (r.erro || !r.ok || ehLogin(r.texto)) return null;
      const d = pdDl(cacDoc(r.texto));
      return { proposta: (d['nro da proposta'] || '').replace(/\D/g, ''), vendedor: pdVendedor(d['usuário']), loja: pdLoja(d['lojista'], d['loja']),
        nome: (d['nome'] || '').replace(/\s*\(\d+\)\s*$/, '').trim(), data: d['data da operação'] || '' };
    }
    function pdMostrar(st) {
      const res = $('#mf-pd-res');
      res.style.display = st && st.texto ? '' : 'none';
      res.value = st && st.texto || '';
      $('#mf-pd-qtd').textContent = st && st.qtd != null ? '(' + st.qtd + ')' : '';
    }
    async function pdGerar(extra) {
      extra = extra || {};
      if (pdRodando) return;
      const master = contas().find(x => x.usuario === GM_getValue('cacContaMaster', ''));
      const atual = contaAtiva();
      const ehMaster = !!(master && atual && atual.usuario.toLowerCase() === master.usuario.toLowerCase());
      // a fila fica na conta master: troca antes (quando há master escolhida e a troca automática está ligada)
      if (master && !ehMaster && !extra.jaTrocou && cfg('cacTrocaAuto')) {
        if (GM_getValue('trocaConta', null)) return pdStatus('Já existe uma troca de conta em andamento. Aguarde terminar.');
        pdSSSet({ etapa: 'trocando', quando: Date.now() });
        pdStatus('Trocando para a conta master (' + rotuloConta(master) + ')...');
        msg('As pendências ficam na conta master. Trocando para ela; o relatório é gerado sozinho depois do login.');
        return trocarPara(master);
      }
      pdRodando = true; $('#mf-pd-gerar').disabled = true;
      try {
        pdStatus('Lendo a Fila de Pendências...');
        const lista = await pdLista();
        if (lista.erro) {
          const dica = lista.semAcesso && !ehMaster ? (master ? ' Entre na conta master (' + rotuloConta(master) + ') e gere de novo.' : ' As pendências ficam na conta master: escolha a conta master em Configurações > Consulta CAC ou entre nela e gere de novo.') : '';
          return pdStatus('Não deu para gerar: ' + lista.erro + '.' + dica);
        }
        if (!lista.linhas.length) {
          const st = { etapa: 'resultado', texto: '', qtd: 0, em: Date.now() };
          pdSSSet(st); pdMostrar(st);
          return pdStatus('Nenhuma proposta com pendência em aberto' + (master && !ehMaster ? ' nesta conta (as pendências ficam na conta master)' : '') + '.');
        }
        // mais recentes primeiro (o número da autorização cresce com o tempo)
        const linhas = lista.linhas.sort((a, b) => Number(b.aut) - Number(a.aut));
        const blocos = [];
        let semDetalhe = 0;
        for (const [i, l] of linhas.entries()) {
          pdStatus('Lendo o detalhe ' + (i + 1) + ' de ' + linhas.length + ' (autorização ' + l.aut + ')...');
          const d = await pdDetalhe(l);
          if (!d) semDetalhe++;
          blocos.push(['Proposta: ' + ((d && d.proposta) || 'N/A'), 'Pendência: ' + (l.pend || 'N/A'), 'Cliente: ' + (l.nome || (d && d.nome) || 'N/A'),
            'Vendedor: ' + ((d && d.vendedor) || 'N/A'), 'Autorização: ' + l.aut, 'Data: ' + (l.data || (d && d.data) || 'N/A'), 'Loja: ' + ((d && d.loja) || 'N/A')].join('\n'));
          if (i < linhas.length - 1) await sleep(CONFIG.PD_PAUSA_MS);
        }
        const st = { etapa: 'resultado', texto: blocos.join('\n' + PD_SEPARADOR + '\n'), qtd: linhas.length, em: Date.now() };
        pdSSSet(st); pdMostrar(st);
        pdStatus(linhas.length + ' proposta(s) com pendência em aberto. ' + (semDetalhe ? semDetalhe + ' sem o detalhe (proposta, vendedor e loja ficaram N/A). ' : '') + 'Gerado às ' + new Date().toLocaleTimeString().slice(0, 5) + '.');
      } catch (e) {
        console.warn('[PaymobiFin] pendências', e && e.message);
        pdStatus('Não deu para gerar: ' + (e && e.message || 'erro inesperado') + '.');
      } finally { pdRodando = false; $('#mf-pd-gerar').disabled = false; }
    }
    // a cada página carregada: gera depois da troca para a master, ou mostra o último relatório desta aba
    function pdRetomar() {
      const st = pdSS();
      if (!st) return;
      if (st.etapa === 'resultado') return pdMostrar(st);
      if (Date.now() - st.quando > 15 * 60 * 1000) return pdSSSet(null);
      if (campoSenha() || GM_getValue('trocaConta', null)) return pdStatus('Aguardando o login da conta master...');
      const master = GM_getValue('cacContaMaster', ''), a = contaAtiva();
      pdSSSet(null);
      if (a && master && a.usuario.toLowerCase() === master.toLowerCase()) { mostrarAba('rel'); pdDobra(true); pdGerar({ jaTrocou: true }); }
      else msg('A troca para a conta master não foi confirmada (conta ativa: ' + (a ? rotuloConta(a) : 'não identificada') + '). Relatório de pendências cancelado.');
    }
    // seção recolhível (fechada por padrão; lembra a última escolha). Gerar o relatório abre a seção
    function pdDobra(aberta) {
      if (aberta != null) GM_setValue('pdRecolhido', !aberta);
      const ab = !GM_getValue('pdRecolhido', true);
      $('#mf-pd-corpo').style.display = ab ? '' : 'none';
      $('#mf-pd-tit').classList.toggle('aberta', ab);
    }
    $('#mf-pd-tit').addEventListener('click', () => pdDobra(GM_getValue('pdRecolhido', true)));
    // "Limpar" e o "Resetar" da coleta: apagam só o relatório da caixa (nada no ER)
    function pdLimpar() {
      if (pdRodando) return msg('Aguarde o relatório de pendências terminar.');
      pdSSSet(null); pdMostrar(null); pdStatus('');
    }
    $('#mf-pd-limpar').addEventListener('click', () => { if (!$('#mf-pd-res').value && !$('#mf-pd-st').textContent) return; pdLimpar(); msg('Relatório de pendências limpo.'); });
    pdDobra();
    $('#mf-pd-gerar').addEventListener('click', () => pdGerar());
    $('#mf-pd-copiar').addEventListener('click', () => {
      const t = $('#mf-pd-res').value;
      if (!t) return msg('Gere o relatório de pendências primeiro.');
      GM_setClipboard(t, 'text');
      msg('Relatório de pendências copiado (' + (pdSS() || {}).qtd + ' proposta(s)).');
    });
    pdRetomar();

    /* ---- Gerador: frases de uma linha para a planilha (colunas "Pedido do cliente" e "Acordo Realizado") ----
       "fechou" = acordo fechado; "solicitou" = simulação para ver se é viável. Só usa o que foi digitado. */
    function ngFrases(tipo) {
      const m = ngNoAtendimento() ? 'acordo' : ngModeloAtual(), v = ngValor;   // Atendimento: sempre o acordo da modalidade
      const verbo = tipo === 'fechou' ? 'fechou' : 'solicitou';
      if (m === 'acordo' && ngModalidade() !== 'geral') {
        const md = NG_MODALIDADES[ngModalidade()];
        const falta = ngFaltando().filter(x => x !== ((md.rotulos || {}).nome || NG_CAMPOS.nome.rot));
        if (falta.length) return { erro: 'Para as frases, preencha: ' + falta.join(', ') + '.' };
        return md.frases(v, verbo);
      }
      if (m === 'antecipacao') return { erro: 'O modelo "Antecipação de parcela" não tem frase para a planilha de negociação.' };
      const ini = v('valor_inicial'), dIni = v('data_inicial'), rest = v('valor_restante'), dRest = v('data_restante');
      if (m === 'folego') {
        if (!ini || !dIni) return { erro: 'Preencha o valor e a data do pagamento inicial.' };
        const resto = rest && dRest ? ' e o restante no valor de ' + rest + ' no dia ' + dRest : rest ? ' e o restante no valor de ' + rest : '';
        return {
          pedido: 'Campanha do Fôlego: Cliente ' + (tipo === 'fechou' ? 'fechou acordo para pagar ' : 'solicitou pagar ') + ini + ' no dia ' + dIni + resto,
          acordo: 'Prosseguimos com o acordo de ' + ini + ' no dia ' + dIni + resto,
        };
      }
      const ent = v('valor_entrada'), dEnt = v('data_entrada') || (m === 'pedido' ? v('data_pagamento') : '');
      const qtd = v('quantidade_parcelas');
      const parc = v('valor_parcela_acordo') || v('valor_desejado') || (m === 'retornoPix' ? v('valor_parcela') : '');
      const dia = v('dia_vencimento');
      const todoDia = dia ? ', com vencimento para todo dia ' + dia : '';
      if (m === 'solicitacao') {
        const vs = v('valor_solicitado'), vd = v('vencimento_solicitado');
        if (!vs) return { erro: 'Preencha o valor solicitado.' };
        return { pedido: 'Cliente ' + verbo + ' pagar ' + vs + (vd ? ' com vencimento em ' + vd : ''), acordo: 'Prosseguimos com ' + vs + (vd ? ' com vencimento em ' + vd : '') };
      }
      if (ent && qtd && parc) {
        const e = ent + (dEnt ? ' no dia ' + dEnt : '');
        return { pedido: 'Cliente ' + verbo + ' pagar de entrada ' + e + ' + ' + qtd + 'x ' + parc + (dia ? ' para todo dia ' + dia : ''),
          acordo: 'Prosseguimos com o acordo de ' + e + ' de entrada + ' + qtd + 'x ' + parc + (dia ? ' para todo dia ' + dia : '') };
      }
      if (qtd && parc) {
        const venc = m === 'retornoPix' && v('vencimento') ? ', com 1º vencimento em ' + v('vencimento') : todoDia;
        return { pedido: 'Cliente ' + verbo + ' renegociar as parcelas para ' + qtd + ' parcelas de ' + parc + venc, acordo: 'Prosseguimos com o acordo de ' + qtd + ' parcelas de ' + parc + venc };
      }
      if (parc && dia) return { pedido: 'Cliente ' + verbo + ' pagar ' + parc + ' todo dia ' + dia, acordo: 'Prosseguimos com ' + parc + ' todo dia ' + dia };
      if (ent && dEnt) return { pedido: 'Cliente ' + verbo + ' pagar ' + ent + ' no dia ' + dEnt, acordo: 'Prosseguimos com o pagamento de ' + ent + ' no dia ' + dEnt };
      return { erro: 'Para a frase, preencha: quantidade e valor das parcelas, ou valor da parcela e dia de vencimento, ou entrada com data.' };
    }
    // Atendimento: Resultado decide o verbo (Renegociação = acordo já fechado). "Não concluída": só o pedido, se houver dados.
    function ngGerarTextos(silencioso) {
      const res = ngCtx === 'renegociacao' ? 'fechou' : $('#mf-ng-frase-tipo').value;
      const r = ngFrases(res === 'nao' ? 'solicitou' : res);
      if (r.erro && res !== 'nao') { if (!silencioso) msg(r.erro); return false; }
      $('#mf-ng-f-pedido').value = r.erro ? '' : r.pedido;
      $('#mf-ng-f-acordo').value = res === 'nao' || r.erro ? '' : r.acordo;
      const pi = ngValor('parcela_inicial');
      $('#mf-ng-f-parcela').value = pi ? 'A partir da ' + ngOrdinal(pi) : '';
      if (!silencioso) msg(res === 'nao' && r.erro ? 'Negociação não concluída: sem dados de acordo, os textos ficam em branco (pode digitar).' : 'Textos gerados. Revise (pode editar) e copie.');
      return true;
    }
    $('#mf-ng-frases').onclick = () => ngGerarTextos(false);
    $('#mf-ng-copiar-pedido').onclick = () => { const t = $('#mf-ng-f-pedido').value; if (!t.trim()) return msg('Gere as frases antes.'); GM_setClipboard(t, 'text'); msg('Frase do "Pedido do cliente" copiada.'); };
    $('#mf-ng-copiar-parcela').onclick = () => { const t = $('#mf-ng-f-parcela').value; if (!t.trim()) return msg('Informe "A partir da parcela" e gere as frases.'); GM_setClipboard(t, 'text'); msg('"A partir de qual parcela" copiado.'); };
    $('#mf-ng-copiar-acordo').onclick = () => { const t = $('#mf-ng-f-acordo').value; if (!t.trim()) return msg('Gere as frases antes.'); GM_setClipboard(t, 'text'); msg('Frase do "Acordo Realizado" copiada.'); };
    // novo texto / limpar / trocar de modelo também apagam as frases (nada de uma negociação passa para outra)
    ['#mf-ng-novo', '#mf-ng-limpar'].forEach(s => $(s).addEventListener('click', () => {
      const vazio = !Object.entries(ngValores).some(([k, v]) => NG_CAMPOS[k] && NG_CAMPOS[k].tipo !== 'check' && String(v || '').trim());
      if (vazio) { $('#mf-ng-f-pedido').value = ''; $('#mf-ng-f-acordo').value = ''; $('#mf-ng-f-parcela').value = ''; }
    }));
    $('#mf-ng-modelo').addEventListener('change', () => { $('#mf-ng-f-pedido').value = ''; $('#mf-ng-f-acordo').value = ''; });

    /* ================= ATENDIMENTO: Modelo 1 Negociação · Modelo 2 Renegociação =================
       Uma ficha só (ngValores, em memória) alimenta as duas planilhas, os textos e as mensagens do grupo.
         Negociação  : 1 linha por proposta, 30 colunas (Proposta … Negociação Concluída?)
         Renegociação: 1 linha por PARCELA do acordo, 26 colunas (Proposta … Negociação Concluída?)
       Regras tiradas da planilha real (Negociação.Renegociação.xlsx): Ação "Pagamento Parcela 01/24" (PIX semanal:
       "Pagamentos 01/88"); a 1ª linha é sempre a entrada, "Efetivado (Entrada)" (quitação: "Efetivado (Quitação)");
       as demais "Em Aberto" com Valor Pago "N/A". O Número de Contato é SEMPRE digitado (RD Station): o telefone da
       proposta nunca entra aqui. */
    Object.assign(NG_CAMPOS, {
      imei: { rot: 'IMEI', tipo: 'texto' },
      data_proposta: { rot: 'Data da proposta', tipo: 'data' },
      filial: { rot: 'Filial', tipo: 'texto' },
      atendente: { rot: 'Atendente', tipo: 'texto' },
      contato: { rot: 'Número de contato (RD Station)', tipo: 'fone', dica: 'O número que o cliente usou para falar com a equipe. Nunca é preenchido com o telefone da proposta.' },
      quem_negociou: { rot: 'Quem negociou', tipo: 'select', opcoes: [['Paymobi', 'Paymobi'], ['Recupere', 'Recupere']] },
      data_contato: { rot: 'Data do contato', tipo: 'data' },
      fpd: { rot: 'FPD', tipo: 'select', opcoes: [['', '(em branco)'], ['SIM', 'SIM'], ['NÃO', 'NÃO']] },
      data_envio: { rot: 'Data do envio da proposta', tipo: 'data' },
      data_1pag: { rot: 'Data 1° pagamento', tipo: 'data' },
      vencimentos: { rot: 'Vencimento(s)', tipo: 'data' },
      parcelas_negociadas: { rot: 'Parcela(s) negociadas', tipo: 'texto', dica: 'Quantidade (ex.: 12) ou "Todo Contrato"' },
      qtd_parcelas_neg: { rot: 'Quantidade de parcelas', tipo: 'num' },
      pag_entrada: { rot: 'Pagamento da entrada', tipo: 'select', opcoes: [['', '(em branco)'], ['SIM', 'SIM'], ['NÃO', 'NÃO'], ['N/A', 'N/A']] },
      boleto_disp: { rot: 'Boleto disponibilizado', tipo: 'select', opcoes: [['', '(em branco)'], ['SIM', 'SIM'], ['NÃO', 'NÃO'], ['N/A', 'N/A']] },
      contrato_novo: { rot: 'Número contrato novo', tipo: 'texto' },
      data_reneg: { rot: 'Data renegociação', tipo: 'data', dica: 'Data do comprovante de pagamento' },
      regua: { rot: 'Procedimento na régua', tipo: 'select', opcoes: [['', '(em branco)'], ['SIM', 'SIM'], ['Não foi necessário', 'Não foi necessário']] },
      recebeu_boletos: { rot: 'Recebeu boletos?', tipo: 'select', opcoes: [['', '(em branco)'], ['SIM', 'SIM'], ['NÃO', 'NÃO'], ['N/A', 'N/A'], ['Pix Automático', 'Pix Automático']] },
      concluida: { rot: 'Negociação concluída?', tipo: 'select', opcoes: [['', '(em branco)'], ['SIM', 'SIM'], ['NÃO', 'NÃO'], ['N/A', 'N/A']] },
      responsavel: { rot: 'Responsável pela negociação', tipo: 'texto' },
      formalizou: { rot: 'Formalizou o acordo?', tipo: 'select', opcoes: [['SIM', 'SIM'], ['NÃO', 'NÃO']] },
      obs_reneg: { rot: 'Observação (todas as linhas)', tipo: 'texto', dica: 'Ex.: Boletos no App' },
      plano_entrada_valor: { rot: 'Entrada (linha 1)', tipo: 'moeda' },
      plano_entrada_data: { rot: 'Data da entrada', tipo: 'data' },
      plano_qtd: { rot: 'Nº de parcelas', tipo: 'num' },
      plano_valor: { rot: 'Valor de cada parcela', tipo: 'moeda' },
      plano_periodo: { rot: 'Periodicidade', tipo: 'select', opcoes: [['mensal', 'Mensal'], ['semanal', 'Semanal (PIX)']] },
      plano_inicio: { rot: '1º vencimento das parcelas', tipo: 'data' },
    });
    const AT_CLIENTE = ['proposta', 'nome', 'cpf', 'imei', 'data_proposta', 'filial', 'atendente', 'contato', 'quem_negociou', 'data_contato'];
    const AT_COBRANCA = ['valor_parcela', 'fpd', 'parcelas_atraso', 'dias_atraso', 'vencimento_antigo', 'parcela_atual'];
    const AT_ACOMP = ['data_envio', 'data_1pag', 'vencimentos', 'parcelas_negociadas', 'qtd_parcelas_neg', 'pag_entrada', 'boleto_disp', 'contrato_novo', 'data_reneg', 'regua', 'recebeu_boletos', 'concluida'];
    const AT_RENEG = ['responsavel', 'formalizou', 'data_reneg', 'contrato_novo', 'obs_reneg', 'regua', 'recebeu_boletos', 'concluida'];
    const AT_PLANO = ['plano_entrada_valor', 'plano_entrada_data', 'plano_qtd', 'plano_valor', 'plano_periodo', 'plano_inicio'];
    const AT_COL_NEG = [['Proposta', 'proposta'], ['Nome', 'nome'], ['CPF', 'cpf'], ['IMEI', 'imei'], ['Data da Proposta', 'data_proposta'], ['Filial', 'filial'],
      ['Atendente', 'atendente'], ['Número Contato', 'contato'], ['Quem negociou', 'quem_negociou'], ['Data do Contato', 'data_contato'], ['Valor parcela', 'valor_parcela'],
      ['FPD', 'fpd'], ['Parcelas Em Atraso', 'parcelas_atraso'], ['Dias Atraso', 'dias_atraso'], ['Vencimento Mais Antigo', 'vencimento_antigo'],
      ['A partir de qual parcela pediu acordo', 't:parcela'], ['Pedido do cliente', 't:pedido'], ['Acordo Realizado', 't:acordo'], ['Data do envio da proposta', 'data_envio'],
      ['Data 1° Pagamento', 'data_1pag'], ['Vencimento(s)', 'vencimentos'], ['Parcela (s) negociadas', 'parcelas_negociadas'], ['Quantidade de parcelas', 'qtd_parcelas_neg'],
      ['Pagamento da entrada', 'pag_entrada'], ['Disponibilizado boleto para o cliente', 'boleto_disp'], ['Número Contrato Novo', 'contrato_novo'],
      ['Data Renegociação (comprovante pag.)', 'data_reneg'], ['Procedimento feito na regua', 'regua'], ['Recebeu Boletos?', 'recebeu_boletos'], ['Negociação Concluída?', 'concluida']];
    const AT_COL_RENEG = [['Proposta', 'proposta'], ['Nome', 'nome'], ['Responsável pela Negociação', 'responsavel'], ['Formalizou o acordo?', 'formalizou'], ['CPF', 'cpf'],
      ['IMEI', 'imei'], ['Data da Proposta (Contrato Original)', 'data_proposta'], ['Data Renegociação', 'data_reneg'], ['Filial', 'filial'], ['Atendente', 'atendente'],
      ['Acordo Solicitado', 't:pedido'], ['Acordo Realizado', 't:acordo'], ['Valor parcela', 'p:valor'], ['Valor Pago', 'p:pago'], ['Número Contato', 'contato'],
      ['Data do Contato', 'data_contato'], ['Ação', 'p:acao'], ['Situação', 'p:situacao'], ['Baixa Parcela ER', 'p:baixa'], ['Quebra de Acordo', 'p:quebra'],
      ['Vencimento', 'p:venc'], ['Observação', 'obs_reneg'], ['Número Contrato Novo', 'contrato_novo'], ['Procedimento feito na regua', 'regua'],
      ['Recebeu Boletos?', 'recebeu_boletos'], ['Negociação Concluída?', 'concluida']];
    const AT_SITUACOES = ['Efetivado (Entrada)', 'Em Aberto', 'Pendente', 'Efetivado', 'Efetivado (Quitação)', 'Pendente (ATRASO)', 'Pendente (QUEBRA DE ACORDO)'];
    let atPlano = [];   // linhas da Renegociação (em memória, como o resto da ficha)
    const atIso = br => { const m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
    const atNomeEquipe = () => String(GM_getValue('equipeNome', '') || '').trim();
    const atResponsavelPadrao = () => atNomeEquipe() || ((contaAtiva() || {}).apelido || '');

    function atBloco(sel, campos) {
      const g = $(sel); g.innerHTML = '';
      const obrig = ngCtx === 'renegociacao' ? ['proposta', 'nome', 'responsavel'] : ['proposta', 'nome'];
      campos.forEach(c => g.appendChild(ngCampoEl(c, NG_CAMPOS[c].rot, obrig.includes(c))));
    }
    function atDesenhar() {
      const at = ngNoAtendimento(), reneg = ngCtx === 'renegociacao';
      painel.querySelectorAll('.mf-at-seg button').forEach(b => b.classList.toggle('ativa', b.dataset.at === ngCtx));
      $('#mf-at-form').style.display = at ? '' : 'none';
      $('#mf-at-mensagens').style.display = at ? 'none' : '';
      // o mesmo bloco de campos da modalidade serve às duas telas
      (at ? $('#mf-at-modal') : $('#mf-ng-slot')).appendChild($('#mf-ng-campos'));
      if (at) {
        if (ngValores.data_contato == null) ngValores.data_contato = lbHoje();
        if (reneg && !ngValores.responsavel) ngValores.responsavel = atResponsavelPadrao();
        atBloco('#mf-at-cliente', AT_CLIENTE);
        atBloco('#mf-at-cobranca', AT_COBRANCA);
        atBloco('#mf-at-acomp', AT_ACOMP);
        atBloco('#mf-at-reneg', AT_RENEG);
        $('#mf-at-g-cobranca').style.display = reneg ? 'none' : '';
        $('#mf-at-g-acomp').style.display = reneg ? 'none' : '';
        $('#mf-at-g-reneg').style.display = reneg ? '' : 'none';
        $('#mf-at-resultado-rot').style.display = reneg ? 'none' : '';
        $('#mf-at-linha-parcela').style.display = reneg ? 'none' : '';
        $('#mf-at-rot-pedido').textContent = reneg ? 'Acordo Solicitado' : 'Pedido do cliente';
        $('#mf-at-copiar').textContent = reneg ? 'Copiar linhas da Renegociação' : 'Copiar linha da Negociação';
        $('#mf-at-modalidade').value = ngModalidade();
        if (reneg) atPlanoCampos();
      }
      ngDesenharCampos();
      if (at && reneg) atPlanoDesenhar();
    }
    function atTrocar(ctx) {
      ngCtx = ctx; GM_setValue('atModelo', ctx);
      $('#mf-ng-texto').value = '';
      atDesenhar();
    }
    painel.querySelectorAll('.mf-at-seg button').forEach(b => b.addEventListener('click', () => atTrocar(b.dataset.at)));
    const selAtMod = $('#mf-at-modalidade');
    [...$('#mf-ng-modalidade').options].forEach(o => selAtMod.appendChild(o.cloneNode(true)));
    selAtMod.addEventListener('change', () => {
      GM_setValue('negModalidade', selAtMod.value); $('#mf-ng-modalidade').value = selAtMod.value;
      ['#mf-ng-f-pedido', '#mf-ng-f-acordo', '#mf-ng-f-parcela'].forEach(x => { $(x).value = ''; });
      atPlano = []; AT_PLANO.forEach(k => delete ngValores[k]); atPlanoAuto = {};
      atDesenhar();
    });
    $('#mf-ng-modalidade').addEventListener('change', () => { selAtMod.value = $('#mf-ng-modalidade').value; });

    /* ---- plano de parcelas (Renegociação) ---- */
    const atPad = n => String(n).padStart(2, '0');
    function atSomarMeses(iso, n) {
      const [a, m, d] = iso.split('-').map(Number);
      const alvo = new Date(a, m - 1 + n, 1), fim = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
      return alvo.getFullYear() + '-' + atPad(alvo.getMonth() + 1) + '-' + atPad(Math.min(d, fim));   // dia 31 em mês curto: último dia do mês
    }
    function atSomarDias(iso, n) { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d + n); return x.getFullYear() + '-' + atPad(x.getMonth() + 1) + '-' + atPad(x.getDate()); }
    // o que a modalidade já informa vira o plano sugerido; linhas "especiais" quando o acordo não é parcelado
    function atSugestao() {
      const mod = ngModalidade(), v = k => ngValores[k], c = k => ngCentavos(v(k));
      if (mod === 'parcial' || mod === 'folego') {
        const l = [];
        if (c('valor_pago_parcial') != null) l.push({ valor: c('valor_pago_parcial'), venc: v('data_pagamento') || '' });
        if (c('valor_restante') != null) l.push({ valor: c('valor_restante'), venc: v('data_restante') || '' });
        return { especial: l };
      }
      if (mod === 'antecipacao') return { especial: c('valor_antecipacao') != null ? [{ valor: c('valor_antecipacao'), venc: v('data_pagamento') || '', situacao: v('tipo_antecipacao') === 'quitacao' ? 'Efetivado (Quitação)' : '' }] : [] };
      if (mod === 'regularizacao' && !(v('dividir_qtd') && c('dividir_valor') != null)) return { especial: c('valor_regularizar') != null ? [{ valor: c('valor_regularizar'), venc: v('data_pagamento') || '' }] : [] };
      const s = { periodo: 'mensal' };
      if (mod === 'entrada') Object.assign(s, { entradaValor: v('valor_entrada'), entradaData: v('data_entrada'), qtd: v('quantidade_parcelas'), valor: v('valor_parcela_acordo') });
      if (mod === 'mensal' || mod === 'parcelamento') Object.assign(s, { qtd: v('quantidade_parcelas'), valor: v('valor_parcela_acordo') });
      if (mod === 'pix') Object.assign(s, { periodo: 'semanal', qtd: v('qtd_semanas'), valor: v('valor_semanal'), entradaValor: v('valor_entrada') });
      if (mod === 'regularizacao') Object.assign(s, { qtd: v('dividir_qtd'), valor: v('dividir_valor'), inicio: v('data_pagamento') });
      if (mod === 'vencimento') Object.assign(s, { qtd: /^\d+$/.test(String(v('parcelas_afetadas') || '').trim()) ? v('parcelas_afetadas') : '', valor: v('valor_parcela_acordo') });
      // 1º vencimento: o próximo "dia D" depois da entrada (só quando os dois foram informados)
      const dia = +(v('dia_vencimento') || v('novo_dia') || 0);
      if (!s.inicio && s.entradaData && dia >= 1 && dia <= 31) {
        const mesmoMes = atSomarMeses(s.entradaData.slice(0, 8) + atPad(dia), 0);
        s.inicio = mesmoMes > s.entradaData ? mesmoMes : atSomarMeses(s.entradaData.slice(0, 8) + atPad(dia), 1);
      }
      return s;
    }
    // sugestões do acordo: preenchem o que está vazio ou o que ainda é a sugestão anterior (o que foi editado à mão fica)
    let atPlanoAuto = {};
    function atPlanoCampos() {
      const sug = atSugestao(), esp = !!sug.especial;
      if (!esp) {
        const mapa = { plano_entrada_valor: 'entradaValor', plano_entrada_data: 'entradaData', plano_qtd: 'qtd', plano_valor: 'valor', plano_periodo: 'periodo', plano_inicio: 'inicio' };
        Object.entries(mapa).forEach(([k, s2]) => {
          const atual = ngValores[k] == null ? '' : String(ngValores[k]);
          if (atual !== '' && atual !== (atPlanoAuto[k] || '')) return;
          const novo = sug[s2] == null ? '' : String(sug[s2]);
          if (novo === '' && atual === '') return;
          ngValores[k] = novo; atPlanoAuto[k] = novo;
        });
      }
      atBloco('#mf-at-plano-cfg', esp ? [] : AT_PLANO);
      $('#mf-at-plano-cfg').style.display = esp ? 'none' : '';
      $('#mf-at-plano-gerar').textContent = esp ? 'Montar parcelas com os valores do acordo' : 'Montar parcelas';
    }
    function atMontarPlano() {
      atPlanoCampos();   // o acordo pode ter sido preenchido depois de abrir a tela
      const sug = atSugestao(), linhas = [], erros = [];
      let semanal = false;
      if (sug.especial) {
        if (!sug.especial.length) erros.push('os valores do acordo (bloco Acordo)');
        sug.especial.forEach(l => linhas.push(l));
      } else {
        const qtd = +String(ngValores.plano_qtd || '').trim(), valor = ngCentavos(ngValores.plano_valor), ini = ngValores.plano_inicio || '';
        semanal = ngValores.plano_periodo === 'semanal';
        const ent = String(ngValores.plano_entrada_valor || '').trim() ? ngCentavos(ngValores.plano_entrada_valor) : null;
        if (!(qtd >= 1 && qtd <= 240)) erros.push('Nº de parcelas');
        if (valor == null) erros.push('Valor de cada parcela');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) erros.push('1º vencimento das parcelas');
        if (String(ngValores.plano_entrada_valor || '').trim() && ent == null) erros.push('Entrada (valor inválido)');
        if (!erros.length) {
          if (ent != null) linhas.push({ valor: ent, venc: ngValores.plano_entrada_data || '' });
          for (let i = 0; i < qtd; i++) linhas.push({ valor, venc: semanal ? atSomarDias(ini, 7 * i) : atSomarMeses(ini, i) });
        }
      }
      if (erros.length) return msg('Para montar as parcelas, preencha: ' + erros.join(', ') + '.');
      const n = linhas.length, pre = semanal ? 'Pagamentos ' : 'Pagamento Parcela ';
      atPlano = linhas.map((l, i) => ({ acao: pre + atPad(i + 1) + '/' + atPad(n), valor: l.valor, pago: i === 0 ? ngReais(l.valor) : 'N/A', venc: l.venc,
        situacao: i === 0 ? (l.situacao || 'Efetivado (Entrada)') : 'Em Aberto', baixa: '', quebra: '' }));
      atPlanoDesenhar();
      msg(n + ' linha(s) montadas. A 1ª é a entrada; revise valores, vencimentos e situações antes de copiar.');
    }
    $('#mf-at-plano-gerar').onclick = atMontarPlano;
    function atPlanoDesenhar() {
      const caixa = $('#mf-at-plano'); caixa.innerHTML = '';
      if (!atPlano.length) { const i = document.createElement('div'); i.className = 'mf-info'; i.textContent = 'Nenhuma parcela montada.'; caixa.appendChild(i); return; }
      const cab = document.createElement('div'); cab.className = 'mf-info'; cab.textContent = atPlano.length + ' linha(s). Em cada uma: Ação; Valor e Vencimento; Situação e Valor pago.'; caixa.appendChild(cab);
      atPlano.forEach((l, i) => {
        const d = document.createElement('div'); d.className = 'mf-pl-lin'; d.title = 'Linha ' + (i + 1);
        const inp = (val, fn, tipo, dica) => { const x = document.createElement('input'); x.type = tipo || 'text'; x.value = val; x.title = dica; x.addEventListener('input', () => fn(x.value)); d.appendChild(x); return x; };
        inp(l.acao, v => { l.acao = v; }, 'text', 'Ação').className = 'mf-pl-acao';
        inp((l.valor / 100).toFixed(2).replace('.', ','), v => { const c = ngCentavos(v); if (c != null) l.valor = c; }, 'text', 'Valor da parcela').inputMode = 'decimal';
        inp(l.venc, v => { l.venc = v; }, 'date', 'Vencimento');
        const sel = document.createElement('select'); sel.title = 'Situação';
        [...new Set([...AT_SITUACOES, l.situacao])].forEach(t => { const o = document.createElement('option'); o.value = o.textContent = t; sel.appendChild(o); });
        sel.value = l.situacao; sel.onchange = () => { l.situacao = sel.value; };
        d.appendChild(sel);
        inp(l.pago, v => { l.pago = v; }, 'text', 'Valor pago');
        caixa.appendChild(d);
      });
    }

    /* ---- cópia para a planilha ---- */
    const atTexto = k => ({ pedido: $('#mf-ng-f-pedido').value, acordo: $('#mf-ng-f-acordo').value, parcela: $('#mf-ng-f-parcela').value }[k] || '').replace(/\s*\n\s*/g, ' ').trim();
    function atValidar() {
      const obrig = ngCtx === 'renegociacao' ? ['proposta', 'nome', 'responsavel'] : ['proposta', 'nome'];
      const falta = obrig.filter(k => !ngValor(k)).map(k => NG_CAMPOS[k].rot);
      painel.querySelectorAll('#mf-at-form [data-campo]').forEach(i => i.classList.toggle('mf-erro', falta.includes(NG_CAMPOS[i.dataset.campo].rot)));
      const contatoRuim = ngValores.contato && !telFormatar(ngValores.contato);
      if (contatoRuim) falta.push('Número de contato válido (DDD + número) ou deixe em branco');
      // Nova UI, só visual: marca o contato inválido e abre o grupo recolhido que tem campo marcado (o campo em vermelho aparece)
      if (painel.dataset.ui === 'nova') {
        if (contatoRuim) painel.querySelectorAll('#mf-at-form [data-campo="contato"]').forEach(i => i.classList.add('mf-erro'));
        painel.querySelectorAll('#mf-at-form .mf-erro').forEach(i => { const d = i.closest('details'); if (d && !d.open) d.open = true; });
      }
      return falta;
    }
    function atLinhas() {
      if (ngCtx === 'renegociacao') return atPlano.map(l => AT_COL_RENEG.map(([, k]) => {
        if (k.startsWith('t:')) return atTexto(k.slice(2));
        if (k === 'p:valor') return ngReais(l.valor);
        if (k === 'p:venc') return ngData(l.venc);
        if (k.startsWith('p:')) return l[k.slice(2)] || '';
        return ngValor(k);
      }));
      return [AT_COL_NEG.map(([, k]) => k.startsWith('t:') ? atTexto(k.slice(2)) : ngValor(k))];
    }
    $('#mf-at-copiar').onclick = () => {
      const falta = atValidar();
      if (falta.length) return msg('Preencha antes de copiar:\n- ' + falta.join('\n- '));
      if (ngCtx === 'renegociacao' && !atPlano.length) return msg('Monte as parcelas (bloco Renegociação) antes de copiar.');
      if (!atTexto('pedido') && !atTexto('acordo') && !ngGerarTextos(true) && !confirm('Os textos "Pedido" e "Acordo Realizado" não puderam ser gerados (faltam dados do acordo). Copiar a linha com eles em branco?')) return;
      const linhas = atLinhas();
      GM_setClipboard(textoTab(linhas), 'text');
      msg(ngCtx === 'renegociacao' ? linhas.length + ' linha(s) copiadas (' + AT_COL_RENEG.length + ' colunas, Proposta → Negociação Concluída?). Cole na coluna Proposta da aba Renegociação.'
        : 'Linha copiada (' + AT_COL_NEG.length + ' colunas, Proposta → Negociação Concluída?). Cole na coluna Proposta da aba Negociação. Campos vazios vão em branco.');
    };
    $('#mf-at-mensagem').onclick = () => {
      const f = ngFaltando();
      if (f.length) return msg('Para a mensagem, preencha:\n- ' + f.join('\n- '));
      $('#mf-at-msg-caixa').style.display = '';
      $('#mf-at-msg-texto').value = ngMontar(ngTextoModelo(ngChave()));
      msg('Mensagem gerada (modelo editável em Configurações > Gerador de negociações). Revise e copie.');
    };
    $('#mf-at-msg-copiar').onclick = () => { const t = $('#mf-at-msg-texto').value; if (!t.trim()) return msg('Gere a mensagem antes.'); GM_setClipboard(t, 'text'); msg('Mensagem copiada.'); };
    $('#mf-at-sugerir').onclick = () => {
      const feitos = [];
      const set = (k, v, rot) => { if (v && !String(ngValores[k] || '').trim()) { ngValores[k] = v; feitos.push(rot); } };
      set('data_1pag', ngValores.data_entrada || ngValores.data_pagamento || '', 'Data 1° pagamento');
      set('qtd_parcelas_neg', String(ngValores.quantidade_parcelas || ngValores.qtd_semanas || ngValores.dividir_qtd || '').trim(), 'Quantidade de parcelas');
      if (ngValores.abrangencia_tipo === 'inteiro') set('parcelas_negociadas', 'Todo Contrato', 'Parcela(s) negociadas');
      atBloco('#mf-at-acomp', AT_ACOMP);
      msg(feitos.length ? 'Preenchido do acordo: ' + feitos.join(', ') + '. Revise.' : 'Nada a trazer: os campos já estão preenchidos ou o acordo não tem essas informações.');
    };
    $('#mf-at-novo').onclick = () => {
      if ((ngTemDados() || atPlano.length) && !confirm('Começar um novo atendimento? Os dados digitados serão apagados (o que já foi registrado no histórico continua lá).')) return;
      Object.keys(ngValores).forEach(k => delete ngValores[k]);
      atPlano = []; atPlanoAuto = {};
      ['#mf-ng-f-pedido', '#mf-ng-f-acordo', '#mf-ng-f-parcela', '#mf-at-msg-texto', '#mf-ng-texto'].forEach(x => { $(x).value = ''; });
      $('#mf-at-msg-caixa').style.display = 'none';
      atDesenhar(); msg('Pronto para um novo atendimento.');
    };
    // cliente da busca do topo -> ficha (pergunta antes de trocar o que já foi digitado). NUNCA o telefone da proposta.
    function atAplicarCliente() {
      const st = bsGet();
      if (!st || !st.cliente) return msg('Busque um cliente antes (campo "Buscar cliente" no topo).');
      const c = st.cliente.campos;
      const num = v => String(v || '').replace(/\D/g, '');
      const novos = {
        nome: c.nome, proposta: c.proposta, cpf: c.cpf, imei: c.imei, data_proposta: atIso(c.dataProposta), filial: c.filial, atendente: c.vendedor,
        valor_parcela: c.valorParcela ? bsReais(c.valorParcela) : '', fpd: c.fpd, parcelas_atraso: num(c.parcelasAtraso), dias_atraso: num(c.diasAtraso),
        vencimento_antigo: atIso(c.vencMaisAntigo), parcela_atual: num(c.parcelaAtual),
      };
      if (c.parcelaAtual && !String(ngValores.parcela_inicial || '').trim()) novos.parcela_inicial = num(c.parcelaAtual);
      const conflitos = Object.entries(novos).filter(([k, v]) => v && String(ngValores[k] || '').trim() && String(ngValores[k]).trim() !== String(v));
      if (conflitos.length && !confirm(conflitos.length + ' campo(s) já preenchido(s) serão substituídos pelos dados do cliente atual. Continuar?')) return;
      let n = 0;
      Object.entries(novos).forEach(([k, v]) => { if (v) { ngValores[k] = v; n++; } });
      if (novos.parcela_inicial && !ngValores.abrangencia_tipo) ngValores.abrangencia_tipo = 'apartir';
      if (ngCtx === 'mensagens') atTrocar('negociacao'); else atDesenhar();
      mostrarAba('neg');
      msg('Dados de ' + (c.nome || 'cliente') + ' aplicados (' + n + ' campo(s)). O número de contato não vem da proposta: digite o que o cliente usou.');
    }
    $('#mf-at-aplicar').onclick = atAplicarCliente;
    atDesenhar();



    /* ================= TIMERS E LEMBRETES ATIVOS =================
       Base própria e versionada: GM 'mfTimers' = { versao, itens, invalidos } (não se mistura com os lembretes de pagamento).
       Horários em epoch (ms); datas de ativação 'AAAA-MM-DD' e hora 'HH:MM' no fuso de Brasília (America/Sao_Paulo, -03:00).
       Estados: agendado · rodando · pausado · disparado (terminou, alarme aguardando) · concluido · cancelado · expirado.
       Entrada no ER (início do expediente) = 1ª página do dia com o usuário logado: #divNomeCliente com o código do usuário
       (só existe com sessão ativa) e sem o aviso de sessão expirada (#dlgRelogin). Tela de login (#frmLogin) não conta.
       Abrir o painel em outra página, ou com a sessão expirada, NÃO inicia nada. Alternativa manual: "Iniciar expediente".
       Alarme sem duplicar: quem marca "disparado" grava o id da aba; só essa aba toca. As outras só mostram o aviso.
       Navegador fechado: nada toca. Ao reabrir, o que venceu nesse tempo aparece num único resumo, sem som. */
    const TM_VERSAO = 1, TM_CHAVE = 'mfTimers', TM_EXPIRA_DIAS = 7;
    const tmAba = 'aba' + Math.random().toString(36).slice(2, 10);
    const TZ = 'America/Sao_Paulo';
    const tmHoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const tmEpoch = (data, hora) => Date.parse(data + 'T' + (hora || '00:00') + ':00-03:00');
    const tmFmtDataHora = ms => ms ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '';
    const tmDur = ms => { ms = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(ms / 3600), m = Math.floor(ms % 3600 / 60), s = ms % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
    const tmDiasEntre = (a, b) => Math.round((tmEpoch(b) - tmEpoch(a)) / 864e5);
    const tmValido = x => x && typeof x === 'object' && typeof x.id === 'string' && Number.isFinite(x.duracaoMs) && typeof x.status === 'string';
    function tmCarregar() {
      let raw = GM_getValue(TM_CHAVE, null);
      if (raw == null) return { versao: TM_VERSAO, itens: [], invalidos: [] };
      if (Array.isArray(raw)) raw = { versao: 0, itens: raw };
      if (typeof raw !== 'object') return { versao: TM_VERSAO, itens: [], invalidos: [raw], somenteLeitura: true };
      const base = { versao: raw.versao | 0, itens: Array.isArray(raw.itens) ? raw.itens : [], invalidos: Array.isArray(raw.invalidos) ? raw.invalidos : [] };
      if (base.versao > TM_VERSAO) return { ...base, somenteLeitura: true };
      if (base.versao < TM_VERSAO) GM_setValue('mfTimersBackup_v' + base.versao, raw);   // cópia antes de migrar
      const vistos = new Set(), ok = [];
      base.itens.forEach(x => {
        if (!tmValido(x)) { base.invalidos.push(x); return; }
        if (vistos.has(x.id)) return;
        vistos.add(x.id); ok.push(x);
      });
      base.itens = ok;
      if (base.versao < TM_VERSAO) { base.versao = TM_VERSAO; GM_setValue(TM_CHAVE, { versao: TM_VERSAO, itens: base.itens, invalidos: base.invalidos }); }
      return base;
    }
    let tmBase = tmCarregar();
    const tmSalvar = () => {
      if (tmBase.somenteLeitura) { msg('Os timers salvos são de uma versão mais nova do script: atualize antes de alterar.'); return false; }
      GM_setValue(TM_CHAVE, { versao: TM_VERSAO, itens: tmBase.itens, invalidos: tmBase.invalidos });
      return true;
    };
    // altera um item relendo a base antes (outra aba pode ter mudado)
    const tmAlterar = (id, fn) => {
      tmBase = tmCarregar();
      const it = tmBase.itens.find(x => x.id === id);
      if (!it) return null;
      if (fn(it) === false) return null;
      it.atualizadoEm = Date.now();
      return tmSalvar() ? it : null;
    };
    const tmHist = (it, t) => { it.historico = [...(it.historico || []), { em: Date.now(), t }].slice(-20); };
    const tmRestante = it => it.status === 'rodando' ? it.fimEm - Date.now() : it.status === 'pausado' ? it.restanteMs : it.duracaoMs;

    /* ---- som (Web Audio, sem arquivos externos) ---- */
    let tmAudio = null;
    const tmLiberarAudio = () => {
      try {
        tmAudio = tmAudio || new (window.AudioContext || window.webkitAudioContext)();
        if (tmAudio.state === 'suspended') tmAudio.resume();
      } catch (_) {}
      return !!tmAudio && tmAudio.state === 'running';
    };
    painel.addEventListener('pointerdown', () => tmLiberarAudio(), true);   // o navegador só libera áudio depois de um clique
    const tmBip = () => {
      if (!tmLiberarAudio()) return false;
      const vol = Math.max(0, Math.min(100, GM_getValue('tmVolume', 70))) / 100;
      if (!vol) return true;
      const t0 = tmAudio.currentTime;
      [0, 0.25, 0.5].forEach(d => {
        const o = tmAudio.createOscillator(), g = tmAudio.createGain();
        o.type = 'square'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25 * vol, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
        o.connect(g); g.connect(tmAudio.destination); o.start(t0 + d); o.stop(t0 + d + 0.2);
      });
      return true;
    };

    /* ---- criação e ações ---- */
    function tmCriar() {
      const h = parseInt($('#mf-tm-h').value || '0', 10), mi = parseInt($('#mf-tm-m').value || '0', 10), se = parseInt($('#mf-tm-s').value || '0', 10);
      const dur = ((h * 60 + mi) * 60 + se) * 1000;
      if (!(dur > 0) || [h, mi, se].some(x => x < 0 || isNaN(x)) || mi > 59 || se > 59 || h > 99) return msg('Informe a duração (horas, minutos 0–59, segundos 0–59).');
      const titulo = limpoTxt($('#mf-tm-titulo').value).slice(0, 80) || 'Timer';
      const quando = $('#mf-tm-quando').value, data = $('#mf-tm-data').value, hora = $('#mf-tm-hora').value;
      const it = { id: 'tm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titulo, descricao: $('#mf-tm-desc').value.trim().slice(0, 300),
        duracaoMs: dur, tipo: quando, status: 'agendado', criadoEm: Date.now(), historico: [] };
      if (quando === 'agora') { it.status = 'rodando'; it.ativadoEm = Date.now(); it.fimEm = Date.now() + dur; }
      else if (quando === 'expediente') {
        it.ativarData = data || new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(tmEpoch(tmHoje(), '12:00') + 864e5));   // padrão: amanhã
        if (it.ativarData < tmHoje()) return msg('A data do expediente já passou.');
        // para HOJE e o expediente de hoje já começou: inicia agora
        if (it.ativarData === tmHoje() && (GM_getValue('tmExpediente', {}) || {}).dia === tmHoje()) { it.status = 'rodando'; it.ativadoEm = Date.now(); it.fimEm = Date.now() + dur; }
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return msg('Informe a data e o horário de início.');
        if (tmEpoch(data, hora) <= Date.now()) return msg('Esse horário já passou. Escolha um horário futuro.');
        it.ativarData = data; it.ativarHora = hora;
      }
      tmHist(it, 'criado');
      tmBase = tmCarregar(); tmBase.itens.push(it);
      if (!tmSalvar()) return;
      ['#mf-tm-titulo', '#mf-tm-desc'].forEach(s => { $(s).value = ''; });
      tmFiltro = 'ativos';
      tmDesenhar();
      msg(it.status === 'rodando' ? 'Timer "' + titulo + '" iniciado (' + tmDur(dur) + ').'
        : it.tipo === 'expediente' ? 'Timer "' + titulo + '" agendado: começa quando você entrar no ER a partir de ' + ngData(it.ativarData) + '.'
        : 'Timer "' + titulo + '" agendado para ' + ngData(it.ativarData) + ' às ' + it.ativarHora + '.');
    }
    const TM_ACOES = {
      pausar: it => { if (it.status !== 'rodando') return false; it.restanteMs = Math.max(0, it.fimEm - Date.now()); it.status = 'pausado'; delete it.fimEm; tmHist(it, 'pausado'); },
      retomar: it => { if (it.status !== 'pausado') return false; it.fimEm = Date.now() + it.restanteMs; it.status = 'rodando'; delete it.restanteMs; tmHist(it, 'retomado'); },
      reiniciar: it => { if (!['rodando', 'pausado', 'disparado', 'concluido', 'expirado'].includes(it.status)) return false; it.status = 'rodando'; it.fimEm = Date.now() + it.duracaoMs; it.ativadoEm = Date.now(); delete it.restanteMs; delete it.alarmeAba; delete it.silenciado; delete it.perdido; tmHist(it, 'reiniciado'); },
      iniciar: it => { if (it.status !== 'agendado') return false; it.status = 'rodando'; it.ativadoEm = Date.now(); it.fimEm = Date.now() + it.duracaoMs; tmHist(it, 'iniciado manualmente'); },
      cancelar: it => { if (['concluido', 'cancelado'].includes(it.status)) return false; it.status = 'cancelado'; it.silenciado = true; delete it.fimEm; tmHist(it, 'cancelado'); },
      concluir: it => { if (['concluido', 'cancelado'].includes(it.status)) return false; it.status = 'concluido'; it.silenciado = true; it.concluidoEm = Date.now(); delete it.fimEm; tmHist(it, 'concluído'); },
      silenciar: it => { if (it.silenciado) return false; it.silenciado = true; tmHist(it, 'alarme silenciado'); },
      adiar5: it => { it.status = 'rodando'; it.fimEm = Date.now() + 5 * 60000; it.ativadoEm = Date.now(); delete it.alarmeAba; delete it.silenciado; delete it.perdido; tmHist(it, 'adiado 5 min'); },
    };
    const tmAcao = (id, acao) => {
      if (acao === 'cancelar' && !confirm('Cancelar este timer?')) return;
      const it = tmAlterar(id, TM_ACOES[acao]);
      if (it) msg('Timer "' + it.titulo + '": ' + { pausar: 'pausado', retomar: 'retomado', reiniciar: 'reiniciado', iniciar: 'iniciado', cancelar: 'cancelado', concluir: 'concluído', silenciar: 'alarme silenciado', adiar5: 'toca de novo em 5 minutos' }[acao] + '.');
      tmTick(true);
    };
    function tmEditar(id) {
      const it = tmBase.itens.find(x => x.id === id);
      if (!it) return;
      const t = prompt('Título do timer:', it.titulo);
      if (t == null) return;
      let novaDur = null;
      if (['agendado', 'pausado'].includes(it.status)) {
        const d = prompt('Duração (h:mm:ss ou minutos):', tmDur(it.status === 'pausado' ? it.restanteMs : it.duracaoMs));
        if (d == null) return;
        const p = d.trim().split(':').map(x => parseInt(x, 10));
        novaDur = (p.length === 1 ? p[0] * 60 : p.length === 2 ? p[0] * 60 + p[1] : (p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
        if (!(novaDur > 0) || p.some(isNaN)) return msg('Duração inválida.');
      }
      tmAlterar(id, x => {
        x.titulo = limpoTxt(t).slice(0, 80) || x.titulo;
        if (novaDur) { if (x.status === 'pausado') x.restanteMs = novaDur; else x.duracaoMs = novaDur; }
        tmHist(x, 'editado');
      });
      tmTick(true);
    }

    /* ---- início do expediente ---- */
    const tmLogado = () => {
      const u = usuarioLogado();
      if (!u) return null;
      if (erAvisoSessaoNaTela()) return null;   // sessão expirada
      return u;
    };
    // ativa os agendamentos "próximo expediente" (uma vez por dia; o mesmo agendamento nunca duas vezes)
    function tmIniciarExpediente(manual) {
      const hoje = tmHoje(), u = tmLogado();
      if (!manual && !cfg('tmExpedienteAuto')) return;
      if (!manual && !u) return;
      const ex = GM_getValue('tmExpediente', {}) || {};
      if (!manual && ex.dia === hoje) return;   // já começou hoje (ex.: troca de conta, recarregar a página)
      GM_setValue('tmExpediente', { dia: hoje, em: Date.now(), usuario: u ? u.codigo : '', manual: !!manual });
      tmBase = tmCarregar();
      const iniciados = [], expirados = [];
      tmBase.itens.forEach(it => {
        if (it.status !== 'agendado' || it.tipo !== 'expediente' || it.ativadoEm) return;
        if (it.ativarData > hoje) return;
        if (tmDiasEntre(it.ativarData, hoje) > TM_EXPIRA_DIAS) { it.status = 'expirado'; tmHist(it, 'expirado: não houve expediente até ' + ngData(hoje)); expirados.push(it.titulo); return; }
        it.status = 'rodando'; it.ativadoEm = Date.now(); it.fimEm = Date.now() + it.duracaoMs; tmHist(it, 'iniciado no expediente de ' + ngData(hoje) + (manual ? ' (manual)' : ''));
        iniciados.push(it.titulo);
      });
      if (iniciados.length || expirados.length) { tmSalvar(); tmMostrarResumo((iniciados.length ? 'Expediente iniciado: ' + iniciados.length + ' timer(s) começaram: ' + iniciados.join(', ') + '.' : '') + (expirados.length ? ' Expirados sem iniciar (mais de ' + TM_EXPIRA_DIAS + ' dias sem expediente): ' + expirados.join(', ') + '.' : '')); }
      else if (manual) msg('Expediente marcado como iniciado hoje. Nenhum timer agendado para iniciar.');
    }

    /* ---- relógio (via Web Worker: não fica lento com a aba em segundo plano) ---- */
    let tmUltimaCarga = 0;
    function tmTick(forcar) {
      const agora = Date.now();
      // com alarme pendente relê a base a cada volta (silenciar/concluir em outra aba para o som aqui na hora)
      // sem nada ativo, relê só a cada 5 s (outra aba pode ter criado um timer); com timers ativos, a cada 1 s
      const ativo = tmBase.itens.some(x => x.status === 'rodando' || (x.status === 'agendado' && x.tipo === 'horario'));
      if (forcar || agora - tmUltimaCarga > (ativo ? 1000 : 5000) || tmBase.itens.some(x => x.status === 'disparado' && !x.silenciado)) { tmBase = tmCarregar(); tmUltimaCarga = agora; }
      else if (!ativo && !tmBase.itens.some(x => x.status === 'pausado')) return;   // nada para atualizar na tela
      let mudou = false;
      tmBase.itens.forEach(it => {
        // agendado por data/hora: a linha do tempo é a real (não recomeça do zero se o navegador esteve fechado)
        if (it.status === 'agendado' && it.tipo === 'horario') {
          const ini = tmEpoch(it.ativarData, it.ativarHora);
          if (agora >= ini) { it.status = 'rodando'; it.ativadoEm = ini; it.fimEm = ini + it.duracaoMs; tmHist(it, 'iniciado no horário agendado'); mudou = true; }
        }
        if (it.status === 'rodando' && agora >= it.fimEm) {
          const atrasado = agora - it.fimEm > 60000;   // terminou com o navegador/página fechados
          it.status = 'disparado'; it.disparadoEm = agora; it.perdido = atrasado; it.alarmeAba = atrasado ? '' : tmAba; it.silenciado = atrasado;
          tmHist(it, atrasado ? 'terminou às ' + tmFmtDataHora(it.fimEm) + ' sem página aberta' : 'terminou');
          mudou = true;
        }
      });
      if (mudou) {
        // relê e só grava as transições que ninguém fez antes (evita duas abas tocarem o mesmo alarme)
        const salvo = tmCarregar(), meus = tmBase.itens;
        salvo.itens = salvo.itens.map(s => { const m = meus.find(x => x.id === s.id); return m && (s.status === 'agendado' || s.status === 'rodando') && m.status !== s.status ? m : s; });
        tmBase = salvo; tmSalvar();
        const perdidos = tmBase.itens.filter(x => x.perdido && !x.resumoVisto);
        if (perdidos.length) {
          tmMostrarResumo(perdidos.length + ' timer(s) terminaram enquanto o navegador ou o ER estavam fechados: ' + perdidos.map(x => x.titulo + ' (' + tmFmtDataHora(x.fimEm) + ')').join(', ') + '. O alarme não tocou; eles estão na lista como vencidos.');
          perdidos.forEach(x => { x.resumoVisto = true; }); tmSalvar();
        }
      }
      tmAlarme();
      tmAtualizarVisual();
    }

    /* ---- aviso de alarme (fica visível até silenciar/tratar, mesmo com o painel minimizado) ---- */
    let tmPop = null, tmUltimoBip = 0, tmTocandoDesde = 0;
    function tmAlarme() {
      const tocando = tmBase.itens.filter(x => x.status === 'disparado' && !x.silenciado);
      if (!tocando.length) { if (tmPop) { tmPop.remove(); tmPop = null; } tmTocandoDesde = 0; return; }
      if (!tmPop) {
        tmPop = document.createElement('div'); tmPop.id = 'mf-tm-alarme'; document.body.appendChild(tmPop);
        if (window.Notification && Notification.permission === 'granted') { try { new Notification('PaymobiFin - Assistente', { body: 'Timer terminou: ' + tocando.map(x => x.titulo).join(', ') }); } catch (_) {} }
      }
      const chave = tocando.map(x => x.id).join(',') + '|' + (tmAudio && tmAudio.state);
      if (tmPop.dataset.chave !== chave) {
        tmPop.dataset.chave = chave;
        tmPop.innerHTML = '';
        const st = document.createElement('style');
        st.textContent = '#mf-tm-alarme{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;width:360px;max-width:calc(100vw - 24px);background:#fff;color:#1f2937;border:2px solid #dc2626;border-radius:12px;box-shadow:0 12px 40px #0006;font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif;padding:12px;animation:mftmpisca 1s infinite}' +
          '@keyframes mftmpisca{50%{box-shadow:0 0 0 6px #fecaca}}#mf-tm-alarme *{box-sizing:border-box;font-family:inherit}#mf-tm-alarme h4{margin:0 0 6px;font-size:15px;color:#b91c1c}' +
          '#mf-tm-alarme .it{border-top:1px solid #fee2e2;padding:6px 0}#mf-tm-alarme button{cursor:pointer;border:0;border-radius:6px;padding:5px 9px;margin:4px 4px 0 0;font-size:12px;font-weight:600;background:#e2e8f0;color:#1e293b}#mf-tm-alarme button.pri{background:#dc2626;color:#fff}';
        tmPop.appendChild(st);
        const h = document.createElement('h4'); h.textContent = '⏰ Timer terminou'; tmPop.appendChild(h);
        if (!(tmAudio && tmAudio.state === 'running')) {
          const a = document.createElement('button'); a.className = 'pri'; a.textContent = '🔊 Clique para ativar o som';
          a.onclick = () => { tmLiberarAudio(); tmPop.dataset.chave = ''; tmBip(); tmAlarme(); };
          tmPop.appendChild(a);
        }
        tocando.forEach(it => {
          const d = document.createElement('div'); d.className = 'it';
          const t = document.createElement('div'); t.style.fontWeight = '700'; t.textContent = it.titulo; d.appendChild(t);
          if (it.descricao) { const s = document.createElement('div'); s.textContent = it.descricao; s.style.color = '#475569'; d.appendChild(s); }
          const b = (txt, cls, ac) => { const x = document.createElement('button'); x.textContent = txt; if (cls) x.className = cls; x.onclick = () => tmAcao(it.id, ac); d.appendChild(x); };
          b('Silenciar', 'pri', 'silenciar'); b('Concluir', '', 'concluir'); b('+5 min', '', 'adiar5'); b('Reiniciar', '', 'reiniciar');
          tmPop.appendChild(d);
        });
      }
      // som: só a aba que disparou; bipes a cada 1 s nos primeiros 2 min, depois a cada 5 s, até silenciar
      // só toca depois de reconfirmar (na volta seguinte, relendo a base) que esta aba é a dona do alarme
      if (!tocando.some(x => x.alarmeAba === tmAba && Date.now() - x.disparadoEm >= 400)) return;
      if (!tmTocandoDesde) tmTocandoDesde = Date.now();
      const intervalo = Date.now() - tmTocandoDesde < 120000 ? 1000 : 5000;
      if (Date.now() - tmUltimoBip >= intervalo) { tmUltimoBip = Date.now(); tmBip(); }
    }
    function tmMostrarResumo(texto) {
      msg(texto);
      const bx = $('#mf-tm-resumo');
      bx.textContent = (bx.style.display === 'none' ? '' : bx.textContent + '\n') + texto;   // acumula; clique para fechar
      bx.style.display = ''; bx.style.whiteSpace = 'pre-wrap'; bx.style.cursor = 'pointer'; bx.title = 'Clique para fechar';
      bx.onclick = () => { bx.style.display = 'none'; bx.textContent = ''; };
    }

    /* ---- lista ---- */
    let tmFiltro = 'ativos', tmChaveLista = '';
    const TM_ESTADO = { agendado: 'agendado', rodando: 'em andamento', pausado: 'pausado', disparado: 'vencido', concluido: 'concluído', cancelado: 'cancelado', expirado: 'expirado' };
    function tmDesenhar() {
      const busca = $('#mf-tm-busca').value.trim().toLowerCase();
      const grupo = it => ({ rodando: 0, disparado: 1, pausado: 2, agendado: 3 }[it.status] ?? 4);
      let lista = tmBase.itens.filter(it => tmFiltro === 'todos' ? true : tmFiltro === 'ativos' ? ['rodando', 'pausado', 'disparado'].includes(it.status)
        : tmFiltro === 'agendados' ? it.status === 'agendado' : ['concluido', 'cancelado', 'expirado'].includes(it.status));
      if (busca) lista = lista.filter(it => (it.titulo + ' ' + (it.descricao || '')).toLowerCase().includes(busca));
      lista.sort((a, b) => grupo(a) - grupo(b) || (a.fimEm || tmEpoch(a.ativarData || '2999-01-01', a.ativarHora)) - (b.fimEm || tmEpoch(b.ativarData || '2999-01-01', b.ativarHora)) || b.criadoEm - a.criadoEm);
      painel.querySelectorAll('.mf-tm-filtros button').forEach(b => b.classList.toggle('ativa', b.dataset.filtro === tmFiltro));
      const caixa = $('#mf-tm-lista');
      caixa.innerHTML = '';
      if (!lista.length) { const v = document.createElement('div'); v.className = 'mf-info'; v.textContent = 'Nada aqui.'; caixa.appendChild(v); }
      lista.slice(0, 60).forEach(it => {
        const el = document.createElement('div');
        el.className = 'mf-lb-item' + (it.status === 'disparado' ? ' atrasado' : it.status === 'rodando' ? ' hoje' : '') + (['concluido', 'cancelado', 'expirado'].includes(it.status) ? ' encerrado' : '');
        const l1 = document.createElement('div'); l1.className = 'mf-lb-l1';
        const tempo = document.createElement('span'); tempo.className = 'mf-tm-tempo'; tempo.dataset.id = it.id;
        l1.append(it.titulo + ' · ' + TM_ESTADO[it.status] + ' ', tempo);
        const l2 = document.createElement('div'); l2.className = 'mf-lb-l2';
        l2.textContent = 'Criado ' + tmFmtDataHora(it.criadoEm) + ' · duração ' + tmDur(it.duracaoMs) +
          (it.status === 'agendado' ? (it.tipo === 'expediente' ? ' · inicia no expediente a partir de ' + ngData(it.ativarData) : ' · inicia ' + ngData(it.ativarData) + ' ' + it.ativarHora) : '') +
          (it.ativadoEm ? ' · ativado ' + tmFmtDataHora(it.ativadoEm) : '') + (it.perdido ? ' · terminou sem página aberta' : '');
        el.append(l1, l2);
        if (it.descricao) { const d = document.createElement('div'); d.className = 'mf-lb-det'; d.textContent = it.descricao; el.appendChild(d); }
        const ac = document.createElement('div'); ac.className = 'mf-lb-acoes';
        const bt = (t, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = t; b.onclick = e => { e.stopPropagation(); fn(); }; ac.appendChild(b); };
        const s = it.status;
        if (s === 'rodando') bt('Pausar', 'laranja', () => tmAcao(it.id, 'pausar'));
        if (s === 'pausado') bt('Retomar', 'verde', () => tmAcao(it.id, 'retomar'));
        if (s === 'agendado') bt('Iniciar agora', 'verde', () => tmAcao(it.id, 'iniciar'));
        if (['rodando', 'pausado', 'disparado', 'concluido', 'expirado'].includes(s)) bt('Reiniciar', 'cinza', () => tmAcao(it.id, 'reiniciar'));
        if (['agendado', 'rodando', 'pausado'].includes(s)) bt('Editar', 'cinza', () => tmEditar(it.id));
        if (!['concluido', 'cancelado'].includes(s)) { bt('Concluir', 'azul', () => tmAcao(it.id, 'concluir')); bt('Cancelar', 'vermelho', () => tmAcao(it.id, 'cancelar')); }
        el.appendChild(ac);
        caixa.appendChild(el);
      });
      tmChaveLista = tmBase.itens.map(x => x.id + x.status + (x.atualizadoEm || '')).join('|') + tmFiltro + busca;
    }
    function tmAtualizarVisual() {
      const chave = tmBase.itens.map(x => x.id + x.status + (x.atualizadoEm || '')).join('|') + tmFiltro + $('#mf-tm-busca').value.trim().toLowerCase();
      if (chave !== tmChaveLista) tmDesenhar();
      painel.querySelectorAll('.mf-tm-tempo').forEach(el => {
        const it = tmBase.itens.find(x => x.id === el.dataset.id);
        el.textContent = it && ['rodando', 'pausado'].includes(it.status) ? '⏱ ' + tmDur(tmRestante(it)) : '';
      });
      // contadores: aba (vencidos) e título (o timer que termina primeiro, visível com o painel minimizado)
      const venc = tmBase.itens.filter(x => x.status === 'disparado' && !x.silenciado).length;
      $('#mf-tm-badge').textContent = venc; $('#mf-tm-badge').style.display = venc ? '' : 'none';
      const prox = tmBase.itens.filter(x => x.status === 'rodando').sort((a, b) => a.fimEm - b.fimEm)[0];
      const topo = $('#mf-tm-topo');
      topo.textContent = prox ? '⏱ ' + tmDur(prox.fimEm - Date.now()) : '';
      topo.title = prox ? prox.titulo : '';
      topo.style.display = prox ? '' : 'none';
    }
    $('#mf-tm-quando').addEventListener('change', () => {
      const q = $('#mf-tm-quando').value;
      $('#mf-tm-data-rot').style.display = q === 'agora' ? 'none' : '';
      $('#mf-tm-hora-rot').style.display = q === 'horario' ? '' : 'none';
    });
    $('#mf-tm-criar').onclick = tmCriar;
    painel.querySelectorAll('.mf-tm-filtros button').forEach(b => b.addEventListener('click', () => { tmFiltro = b.dataset.filtro; tmDesenhar(); tmAtualizarVisual(); }));
    $('#mf-tm-busca').addEventListener('input', () => { tmDesenhar(); tmAtualizarVisual(); });
    $('#mf-tm-volume').value = GM_getValue('tmVolume', 70);
    $('#mf-tm-volume').addEventListener('change', () => GM_setValue('tmVolume', +$('#mf-tm-volume').value));
    $('#mf-tm-testar').onclick = () => { if (!tmBip()) msg('O navegador bloqueou o som: clique de novo em "Testar som".'); };
    $('#mf-tm-expediente').onclick = () => tmIniciarExpediente(true);
    $('#mf-tm-topo').addEventListener('click', e => { e.stopPropagation(); if (GM_getValue('min', false)) { GM_setValue('min', false); aplicarMin(false); trazerParaTela(); } tmFiltro = 'ativos'; mostrarAba('tim'); tmDesenhar(); });
    ligarOpcao('#mf-tm-auto', 'tmExpedienteAuto');
    tmTick(true);
    tmIniciarExpediente(false);
    tmDesenhar(); tmAtualizarVisual();
    let tmVoltas = 0;
    (async () => { for (;;) { await sleep(500); try { tmTick(false); if (++tmVoltas % 120 === 0) tmIniciarExpediente(false); } catch (e) { console.warn('[PaymobiFin] timers', e && e.message); } } })();


    /* ================= NAVEGAÇÃO E APARÊNCIA (Nova UI / UI Antiga) =================
       A organização das abas é a mesma nas duas aparências (v12): Atendimento · Histórico · Agenda (Lembretes | Timers)
       · Relatórios · Mais ▾ (Consulta CAC, CCBs, Contas, Configurações). As páginas e botões de aba são os mesmos de
       sempre (nada duplicado). A aparência só muda o visual: data-ui="nova" (CSS escopado, ⓘ, chip da conta) ou "antiga". */
    const UI_MAIS = [['cac', 'Consulta CAC'], ['ccb', 'CCBs'], ['cta', 'Contas'], ['cfg', 'Configurações']];
    const uiAtual = () => painel.dataset.ui;
    // menu "Mais ▾" e o botão "Agenda" (Pagamentos | Timers)
    const abas = $('.mf-abas');
    const btAgenda = document.createElement('button');
    btAgenda.dataset.uiAba = 'agenda';
    btAgenda.innerHTML = 'Agenda <span class="mf-badge" style="display:none"></span>';
    const btMais = document.createElement('button');
    btMais.dataset.uiAba = 'mais'; btMais.textContent = 'Mais ▾';
    const menu = document.createElement('div');
    menu.className = 'mf-ui-menu';
    UI_MAIS.forEach(([a, rot]) => { const b = document.createElement('button'); b.dataset.vai = a; b.textContent = rot; b.onclick = () => { menu.classList.remove('aberto'); mostrarAba(a); }; menu.appendChild(b); });
    abas.querySelector('[data-aba="his"]').after(btAgenda);
    abas.append(btMais, menu);
    btAgenda.onclick = () => mostrarAba(GM_getValue('uiAgenda', 'lem') === 'tim' ? 'tim' : 'lem');
    btMais.onclick = e => { e.stopPropagation(); menu.classList.toggle('aberto'); };
    document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== btMais) menu.classList.remove('aberto'); }, true);
    // sub-abas da Agenda, no topo das duas páginas
    ['lem', 'tim'].forEach(pg => {
      const seg = document.createElement('div');
      seg.className = 'mf-ui-seg';
      [['lem', 'Lembretes'], ['tim', 'Timers']].forEach(([a, rot]) => {
        const b = document.createElement('button'); b.textContent = rot; b.dataset.vai = a; b.classList.toggle('ativa', a === pg);
        b.onclick = () => { GM_setValue('uiAgenda', a); mostrarAba(a); };
        seg.appendChild(b);
      });
      painel.querySelector('[data-pag="' + pg + '"]').prepend(seg);
    });
    // título: conta ativa (abre Contas) e ⚙ (abre Configurações)
    const acoesTopo = document.createElement('div');
    acoesTopo.className = 'mf-ui-acoes mf-ui-nova';
    const chip = document.createElement('button'); chip.className = 'mf-ui-chip'; chip.title = 'Conta ativa (abre Contas)'; chip.onclick = () => mostrarAba('cta');
    const eng = document.createElement('button'); eng.className = 'mf-ui-icone'; eng.textContent = '⚙'; eng.title = 'Configurações'; eng.onclick = () => mostrarAba('cfg');
    acoesTopo.append(chip, eng);
    $('#mf-tam').before(acoesTopo);
    // "Copiar ▾" na Auditoria: o botão principal continua sendo "Copiar resultado"; os outros vão para o menu
    const gradeCopia = $('#mf-cop').parentElement;
    gradeCopia.classList.add('mf-ui-copias');
    ['#mf-cid', '#mf-cfull', '#mf-colr'].forEach(s => $(s).classList.add('mf-ui-extra'));
    const btCopMais = document.createElement('button');
    btCopMais.className = 'mf-ui-nova'; btCopMais.textContent = 'Mais cópias ▾'; btCopMais.title = 'Copiar c/ proposta, auditoria completa (A–R), motivo (coluna R)';
    btCopMais.onclick = () => { gradeCopia.classList.toggle('aberto'); btCopMais.textContent = gradeCopia.classList.contains('aberto') ? 'Menos cópias ▴' : 'Mais cópias ▾'; };
    $('#mf-cop').after(btCopMais);
    // textos de ajuda fixos: na Nova UI viram ⓘ ao lado do título da seção (mesmo texto, ao passar o mouse)
    painel.querySelectorAll('.mf-info:not([id])').forEach(el => {
      const txt = limpoTxt(el.textContent);
      if (!txt || /não é criptografado/.test(txt)) return;   // aviso de segurança continua sempre visível
      el.classList.add('mf-ui-ajuda');
      const alvo = el.closest('.mf-sec, .mf-grupo');
      const tit = alvo && (alvo.querySelector(':scope > .mf-tit') || alvo.querySelector(':scope > summary'));
      const existente = tit && tit.querySelector(':scope > .mf-ui-i');
      if (existente) { existente.title += '\n\n' + txt; return; }   // um ⓘ por título, com todos os textos
      const i = document.createElement('span'); i.className = 'mf-ui-i'; i.textContent = 'ⓘ'; i.title = txt;
      if (tit) { tit.appendChild(i); } else el.before(i);
    });
    // contadores e estado das abas (Agenda = lembretes + timers vencidos)
    function uiSincronizar() {
      const a = GM_getValue('abaPainel', 'neg');
      btAgenda.classList.toggle('ativa', a === 'lem' || a === 'tim');
      btMais.classList.toggle('ativa', UI_MAIS.some(([x]) => x === a));
      btMais.textContent = ({ cac: 'CAC', ccb: 'CCBs', cta: 'Contas', cfg: 'Config.' }[a] || 'Mais') + ' ▾';   // curto: cabe na linha das abas
      btMais.title = (UI_MAIS.find(([x]) => x === a) || [, 'Mais opções'])[1];
      menu.querySelectorAll('button').forEach(b => b.classList.toggle('ativa', b.dataset.vai === a));
      const n = ['#mf-lb-badge', '#mf-tm-badge'].reduce((s, sel) => s + ($(sel).style.display === 'none' ? 0 : +$(sel).textContent || 0), 0);
      const bd = btAgenda.querySelector('.mf-badge'); bd.textContent = n; bd.style.display = n ? '' : 'none';
      const c = contaAtiva(); chip.textContent = c ? (c.apelido && !c.naoCadastrada ? c.apelido : c.usuario) : '';
    }
    painel.querySelectorAll('.mf-abas button, .mf-ui-menu button, .mf-ui-seg button, .mf-ui-acoes button').forEach(b => b.addEventListener('click', () => setTimeout(uiSincronizar)));
    // a conta ativa vai para a 2ª linha do título, ao lado da versão (com os eventos já ligados): no painel estreito o
    // nome "PaymobiFin - Assistente" deixa de ser cortado. Continua só na Nova UI e abrindo Contas ao clicar.
    chip.classList.add('mf-ui-nova'); $('#mf-versao').after(chip);
    setInterval(uiSincronizar, 1000);
    // aplica a aparência (o Gerador redesenha os campos: na Nova UI em blocos recolhíveis)
    function aplicarUI(modoUi) {
      painel.dataset.ui = modoUi === 'antiga' ? 'antiga' : 'nova';
      try { ngDesenharCampos(); } catch (_) {}
      uiSincronizar();
      $$ui('input[name="mf-ui-aparencia"]').forEach(r => { r.checked = r.value === cfg('aparencia'); });
    }
    function $$ui(s) { return [...painel.querySelectorAll(s)]; }
    $$ui('input[name="mf-ui-aparencia"]').forEach(r => r.addEventListener('change', () => {
      if (!r.checked) return;
      GM_setValue('aparencia', r.value); aplicarUI(r.value);
      msg('Aparência: ' + (r.value === 'nova' ? 'Nova UI' : 'UI Antiga') + '. Nenhum dado ou configuração foi alterado.');
    }));
    // pré-visualização: mostra a outra aparência; volta sozinha em 30 s se não confirmar
    let uiPrevTimer = null;
    const faixa = $('#mf-ui-prev');
    $('#mf-ui-previsualizar').onclick = () => {
      const outra = cfg('aparencia') === 'nova' ? 'antiga' : 'nova';
      aplicarUI(outra);
      faixa.classList.add('ativo');
      $('#mf-ui-prev-txt').textContent = 'Pré-visualizando a ' + (outra === 'nova' ? 'Nova UI' : 'UI Antiga') + '.';
      clearTimeout(uiPrevTimer);
      uiPrevTimer = setTimeout(() => $('#mf-ui-prev-voltar').click(), 30000);
    };
    $('#mf-ui-prev-manter').onclick = () => { clearTimeout(uiPrevTimer); faixa.classList.remove('ativo'); GM_setValue('aparencia', painel.dataset.ui); aplicarUI(painel.dataset.ui); msg('Aparência mantida.'); };
    $('#mf-ui-prev-voltar').onclick = () => { clearTimeout(uiPrevTimer); faixa.classList.remove('ativo'); aplicarUI(cfg('aparencia')); };
    aplicarUI(cfg('aparencia'));

    /* ---- Tema claro / escuro: só cores (nenhum dado, função ou configuração muda) ---- */
    function aplicarTema(t) {
      t = t === 'escuro' ? 'escuro' : 'claro';
      painel.dataset.tema = t;
      document.documentElement.setAttribute('data-mf-tema', t);   // ER e avisos fora do painel
      const b = $('#mf-tema');
      if (b) { b.textContent = t === 'escuro' ? '☀️' : '🌙'; b.title = t === 'escuro' ? 'Voltar ao modo claro' : 'Modo escuro'; }
      $$ui('input[name="mf-ui-tema"]').forEach(r => { r.checked = r.value === t; });
    }
    function trocarTema(t) { GM_setValue('tema', t); aplicarTema(t); }
    $('#mf-tema').onclick = () => trocarTema(painel.dataset.tema === 'escuro' ? 'claro' : 'escuro');
    $$ui('input[name="mf-ui-tema"]').forEach(r => r.addEventListener('change', () => { if (r.checked) trocarTema(r.value); }));
    aplicarTema(cfg('tema'));

    /* ================= EQUIPE: compartilhamento entre os funcionários (Pusher) =================
       O armazenamento do Tampermonkey é de cada navegador. Para a equipe ver os mesmos lembretes e acordos:
         · Pusher Channels, canal de PRESENÇA privado: só entra quem assina com a secret do app (a assinatura é feita aqui,
           com a secret guardada SÓ neste navegador; nada de segredo no código, que é público no GitHub).
         · Cada mensagem vai criptografada (AES-GCM, chave derivada da "chave da equipe" com PBKDF2): o Pusher só repassa
           texto cifrado. O Pusher NÃO guarda nada: cada computador mantém a sua cópia local, e quem estava offline recebe
           o que faltou quando outro funcionário estiver conectado ao mesmo tempo (troca de "resumos").
         · Uma aba por navegador mantém a conexão (as outras leem o armazenamento); envio pela API REST do Pusher.
         · Retenção: registros da equipe ficam 30 dias depois da última alteração (lembrete pendente fica até encerrar).
       Coleções: 'lb' = lembretes compartilhados (e exclusões), 'ac' = histórico de acordos. */
    const EQ = { app: '2208097', key: 'dabed4eab8cfd1428193', cluster: 'sa1', canal: 'presence-paymobifin-equipe' };
    const EQ_RETENCAO = 30 * 24 * 3600 * 1000, EQ_LIMITE = 9500, EQ_ABA = 'aba' + Math.random().toString(36).slice(2, 10);
    function eqId() { let id = GM_getValue('equipeId', ''); if (!id) { id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); GM_setValue('equipeId', id); } return id; }
    function eqNomeLocal() { return String(GM_getValue('equipeNome', '') || '').trim() || (typeof contaAtiva === 'function' && contaAtiva() && contaAtiva().apelido) || 'Este computador'; }
    function eqCfg() { return { nome: String(GM_getValue('equipeNome', '') || '').trim(), secret: String(GM_getValue('equipeSecret', '') || '').trim(), chave: String(GM_getValue('equipeChave', '') || ''), ativa: !!cfg('equipeAtiva') }; }
    function eqPronta() { const c = eqCfg(); return !!(c.ativa && c.nome && c.secret && c.chave); }
    function eqMarcarVersao() { GM_setValue('equipeVersao', (GM_getValue('equipeVersao', 0) || 0) + 1); }

    /* ---- criptografia (WebCrypto do navegador) ---- */
    const eqTE = new TextEncoder(), eqTD = new TextDecoder();
    const eqB64 = buf => { const b = new Uint8Array(buf); let t = ''; for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(t); };
    const eqDeB64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
    const eqHex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    async function eqHmac(segredo, texto) {
      const k = await crypto.subtle.importKey('raw', eqTE.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return eqHex(await crypto.subtle.sign('HMAC', k, eqTE.encode(texto)));
    }
    let eqChaveCache = null;
    async function eqChaveAes() {
      const c = eqCfg().chave;
      if (eqChaveCache && eqChaveCache.de === c) return eqChaveCache.k;
      const base = await crypto.subtle.importKey('raw', eqTE.encode(c), 'PBKDF2', false, ['deriveKey']);
      const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: eqTE.encode('paymobifin-equipe-v1'), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      eqChaveCache = { de: c, k };
      return k;
    }
    // verificador da chave (6 hex de outra derivação lenta): mostra quem está com a chave diferente, sem revelar a chave
    let eqVerifCache = null;
    async function eqVerificador() {
      const c = eqCfg().chave;
      if (eqVerifCache && eqVerifCache.de === c) return eqVerifCache.v;
      const base = await crypto.subtle.importKey('raw', eqTE.encode(c), 'PBKDF2', false, ['deriveBits']);
      const v = eqHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: eqTE.encode('paymobifin-verificador-v1'), iterations: 150000, hash: 'SHA-256' }, base, 64)).slice(0, 6);
      eqVerifCache = { de: c, v };
      return v;
    }
    async function eqCifrar(obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await eqChaveAes(), eqTE.encode(JSON.stringify(obj)));
      return { v: 1, iv: eqB64(iv), c: eqB64(ct) };
    }
    async function eqDecifrar(env) {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: eqDeB64(env.iv) }, await eqChaveAes(), eqDeB64(env.c));
      return JSON.parse(eqTD.decode(pt));
    }
    // MD5 (exigido pela assinatura da API REST do Pusher: body_md5)
    function eqMd5(str) {
      const b = eqTE.encode(str), n = b.length, w = new Uint32Array((((n + 8) >> 6) + 1) * 16);
      for (let i = 0; i < n; i++) w[i >> 2] |= b[i] << ((i % 4) * 8);
      w[n >> 2] |= 0x80 << ((n % 4) * 8);
      w[w.length - 2] = n * 8;
      const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], K = [];
      for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
      let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
      for (let o = 0; o < w.length; o += 16) {
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
          let F, g;
          if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
          else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
          F = (F + A + K[i] + w[o + g]) >>> 0;
          A = D; D = C; C = B;
          const r = S[(i >> 4) * 4 + (i % 4)];
          B = (B + ((F << r) | (F >>> (32 - r)))) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
      }
      return [a0, b0, c0, d0].map(x => [0, 8, 16, 24].map(sh => ((x >>> sh) & 255).toString(16).padStart(2, '0')).join('')).join('');
    }

    /* ---- envio: API REST do Pusher (assinada com a secret local); fila com lotes de até 10 eventos ---- */
    async function eqPost(caminho, corpo) {
      const c = eqCfg(), body = JSON.stringify(corpo), ts = Math.floor(Date.now() / 1000);
      const q = 'auth_key=' + EQ.key + '&auth_timestamp=' + ts + '&auth_version=1.0&body_md5=' + eqMd5(body);
      const path = '/apps/' + EQ.app + caminho;
      const sig = await eqHmac(c.secret, 'POST\n' + path + '\n' + q);
      return new Promise(res => {
        try {
          GM_xmlhttpRequest({ method: 'POST', url: 'https://api-' + EQ.cluster + '.pusher.com' + path + '?' + q + '&auth_signature=' + sig, headers: { 'Content-Type': 'application/json' }, data: body, timeout: 15000,
            onload: r => res({ ok: r.status >= 200 && r.status < 300, status: r.status }), onerror: () => res({ ok: false, status: 0 }), ontimeout: () => res({ ok: false, status: 0 }) });
        } catch (_) { res({ ok: false, status: 0 }); }
      });
    }
    const eqFila = [];
    let eqEnviando = false, eqErroEnvio = '';
    function eqEnfileirar(nome, dados) { if (!eqPronta()) return; eqFila.push({ nome, dados }); eqDespachar(); }
    async function eqDespachar() {
      if (eqEnviando) return;
      eqEnviando = true;
      try {
        while (eqFila.length && eqPronta()) {
          const lote = [];
          while (eqFila.length && lote.length < 10) {
            const ev = eqFila.shift(), dados = JSON.stringify(await eqCifrar(ev.dados));
            if (dados.length > EQ_LIMITE) { eqErroEnvio = 'um registro passou do limite de tamanho do Pusher e não foi enviado (' + (ev.dados.rec && ev.dados.rec.proposta || '') + ')'; continue; }
            lote.push({ channel: EQ.canal, name: ev.nome, data: dados, ...(eqSocket ? { socket_id: eqSocket } : {}) });
          }
          if (!lote.length) continue;
          let r = await eqPost('/batch_events', { batch: lote });
          if (!r.ok) { await sleep(2000); r = await eqPost('/batch_events', { batch: lote }); }
          eqErroEnvio = r.ok ? '' : 'falha ao enviar para o Pusher (HTTP ' + r.status + (r.status === 401 ? ': secret incorreta' : '') + '). O registro está salvo aqui e vai na próxima sincronização.';
          await sleep(250);
        }
      } finally { eqEnviando = false; eqStatusUI(); }
    }
    // registro alterado aqui -> equipe (os outros mesclam pela versão)
    function eqEnviar(col, rec) { if (eqPronta()) eqEnfileirar('mf-reg', { col, rec: eqEnxugar(col, rec), de: eqId() }); }
    // cabe no limite de 10 KB do Pusher: corta o histórico mais antigo se precisar (a cópia local fica inteira)
    function eqEnxugar(col, rec) {
      let r = rec;
      for (let corte = 40; JSON.stringify(r).length > 6500 && corte >= 0; corte -= 10) {
        r = { ...r };
        if (Array.isArray(r.historico)) r.historico = r.historico.slice(-corte);
        if (Array.isArray(r.revisoes)) r.revisoes = r.revisoes.slice(-Math.max(1, Math.floor(corte / 4)));
        if (corte === 0 && r.original) delete r.original;
      }
      return r;
    }

    /* ---- coleções: lista local, mescla e retenção ---- */
    const eqExpirado = (col, r) => {
      const idade = Date.now() - (r.atualizadoEm || r.criadoEm || 0);
      if (col === 'lb') return (r.excluido || r.status !== 'pendente') && idade > EQ_RETENCAO;
      return idade > EQ_RETENCAO;
    };
    // impressão digital do conteúdo: mesma versão com conteúdo diferente (dois funcionários alterando ao mesmo tempo, sem
    // conexão) também é detectada, e os dois lados trocam e somam os registros
    const eqN = (col, r) => eqMd5(JSON.stringify(col === 'lb'
      ? [r.excluido ? 1 : 0, r.atualizadoEm, r.atualizadoPor, (r.pagamentos || []).map(p => p.id || p.registradoEm).sort(), (r.historico || []).map(h => h.em + '|' + h.texto).sort()]
      : [r.atualizadoEm, r.atualizadoPor, (r.revisoes || []).map(v => v.id).sort()])).slice(0, 10);
    function eqTodos(col) {
      if (col === 'lb') {
        lbRecarregar();
        const marcas = Object.values(GM_getValue(LB_EXCLUIDOS, {}) || {});
        return [...lbBase.itens.filter(it => it.compartilhado), ...marcas].filter(r => !eqExpirado('lb', r));
      }
      acRecarregar();
      return acBase.itens.filter(r => !eqExpirado('ac', r));
    }
    // quem vence: versão maior; empate: alteração mais recente; empate: id do autor (todos decidem igual)
    function eqVence(a, b) {
      if (!a) return true;
      if ((b.rev || 1) !== (a.rev || 1)) return (b.rev || 1) > (a.rev || 1);
      if ((b.atualizadoEm || 0) !== (a.atualizadoEm || 0)) return (b.atualizadoEm || 0) > (a.atualizadoEm || 0);
      return String(b.atualizadoPor || '') > String(a.atualizadoPor || '');
    }
    // pagamentos, acompanhamento e revisões se SOMAM (dois funcionários mexendo ao mesmo tempo não perdem nada)
    function eqUnir(col, a, b) {
      const base = JSON.parse(JSON.stringify(eqVence(a, b) ? b : a));
      if (!a || a.excluido || b.excluido) return base;
      const uniao = (x, y, chave, ord) => { const m = new Map(); [...(x || []), ...(y || [])].forEach(i => { if (i) m.set(chave(i), i); }); return [...m.values()].sort(ord); };
      if (col === 'lb') {
        base.pagamentos = uniao(a.pagamentos, b.pagamentos, p => p.id || p.registradoEm + ':' + p.valor, (x, y) => (x.registradoEm || 0) - (y.registradoEm || 0));
        base.historico = uniao(a.historico, b.historico, h => h.em + '|' + h.texto, (x, y) => x.em - y.em).slice(-60);
      } else base.revisoes = uniao(a.revisoes, b.revisoes, r => r.id, (x, y) => x.em - y.em);
      return base;
    }
    // aplica um registro vindo da equipe na cópia local; avisa quem está com o sistema aberto
    function eqAplicar(col, rec) {
      if (!rec || typeof rec.id !== 'string' || eqExpirado(col, rec)) return false;
      if (col === 'lb') {
        lbRecarregar();
        if (lbBase.somenteLeitura) return false;
        const marcas = GM_getValue(LB_EXCLUIDOS, {}) || {};
        const atual = lbBase.itens.find(x => x.id === rec.id) || marcas[rec.id];
        if (rec.excluido) {
          if (atual && !eqVence(atual, rec)) return false;
          if (atual && atual.excluido && atual.rev === rec.rev) return false;
          lbBase.itens = lbBase.itens.filter(x => x.id !== rec.id);
          GM_setValue(LB_EXCLUIDOS, { ...marcas, [rec.id]: rec });
          GM_setValue(LB_CHAVE, { versao: LB_VERSAO, itens: lbBase.itens, invalidos: lbBase.invalidos });
          eqMarcarVersao(); lbAtualizar();
          if (atual && !atual.excluido) eqAvisar('Lembrete excluído por ' + (rec.atualizadoPorNome || 'outro funcionário'), (atual.proposta ? 'Proposta ' + atual.proposta : '') + (atual.cliente ? ' · ' + atual.cliente : ''), null);
          return true;
        }
        if (atual && atual.excluido && !eqVence(atual, rec)) return false;
        const vivo = atual && !atual.excluido ? atual : null;
        const novo = lbV2({ ...eqUnir('lb', vivo, rec), compartilhado: true });
        if (vivo && JSON.stringify(vivo) === JSON.stringify(novo)) return false;
        const i = lbBase.itens.findIndex(x => x.id === rec.id);
        if (i >= 0) lbBase.itens[i] = novo; else lbBase.itens.push(novo);
        GM_setValue(LB_CHAVE, { versao: LB_VERSAO, itens: lbBase.itens, invalidos: lbBase.invalidos });
        eqMarcarVersao(); lbAtualizar();
        if (rec.atualizadoPor !== eqId()) eqAvisarLembrete(vivo, novo);
        return true;
      }
      acRecarregar();
      if (acBase.somenteLeitura) return false;
      const atual = acBase.itens.find(x => x.id === rec.id);
      const novo = eqUnir('ac', atual, rec);
      if (atual && JSON.stringify(atual) === JSON.stringify(novo)) return false;
      const i = acBase.itens.findIndex(x => x.id === rec.id);
      if (i >= 0) acBase.itens[i] = novo; else acBase.itens.push(novo);
      acGravar();
      if (rec.atualizadoPor !== eqId()) eqAvisar(atual ? 'Acordo alterado por ' + (novo.atualizadoPorNome || 'outro funcionário') : 'Novo acordo registrado por ' + (novo.criadoPorNome || 'outro funcionário'),
        'Proposta ' + (novo.cliente.proposta || '—') + ' · ' + (novo.cliente.nome || '') + ' · ' + (HS_STATUS[novo.status] || novo.status), { aba: 'his', id: novo.id });
      return true;
    }
    function eqAvisarLembrete(antes, depois) {
      const quem = depois.atualizadoPorNome || depois.criadoPorNome || 'outro funcionário';
      const cab = (depois.proposta ? 'Proposta ' + depois.proposta : 'Sem proposta') + (depois.cliente ? ' · ' + depois.cliente : '');
      const alvo = { aba: 'lem', id: depois.id };
      if (!antes) return eqAvisar('Novo lembrete de pagamento — ' + quem, cab + '\nSaldo ' + ngReais(lbSaldo(depois)) + ' de ' + ngReais(depois.total) + (depois.proxima ? ' · acompanhar em ' + ngData(depois.proxima) : ''), alvo);
      const novosPg = (depois.pagamentos || []).filter(p => !(antes.pagamentos || []).some(q => (q.id || '') === (p.id || '')));
      if (novosPg.length) return eqAvisar('Pagamento registrado — ' + quem, cab + '\n' + novosPg.map(p => ngReais(p.valor) + (p.data ? ' em ' + ngData(p.data) : '')).join('; ') + ' · saldo ' + ngReais(lbSaldo(depois)), alvo);
      if (antes.status !== depois.status) return eqAvisar('Lembrete ' + ({ concluido: 'concluído', cancelado: 'cancelado', pendente: 'reaberto' }[depois.status] || depois.status) + ' — ' + quem, cab, alvo);
      eqAvisar('Lembrete atualizado — ' + quem, cab, alvo);
    }
    // retenção: tira da cópia local o que passou de 30 dias (só registros da equipe; lembretes só deste navegador ficam)
    function eqLimpar() {
      let n = 0;
      lbRecarregar();
      if (!lbBase.somenteLeitura) {
        const antes = lbBase.itens.length;
        lbBase.itens = lbBase.itens.filter(it => !(it.compartilhado && eqExpirado('lb', it)));
        const marcas = GM_getValue(LB_EXCLUIDOS, {}) || {}, ficam = {};
        Object.entries(marcas).forEach(([k, v]) => { if (!eqExpirado('lb', v)) ficam[k] = v; else n++; });
        if (lbBase.itens.length !== antes || Object.keys(ficam).length !== Object.keys(marcas).length) {
          n += antes - lbBase.itens.length;
          GM_setValue(LB_CHAVE, { versao: LB_VERSAO, itens: lbBase.itens, invalidos: lbBase.invalidos });
          GM_setValue(LB_EXCLUIDOS, ficam);
        }
      }
      acRecarregar();
      if (!acBase.somenteLeitura) {
        const antes = acBase.itens.length;
        acBase.itens = acBase.itens.filter(r => !eqExpirado('ac', r));
        if (acBase.itens.length !== antes) { n += antes - acBase.itens.length; GM_setValue(AC_CHAVE, { versao: AC_VERSAO, itens: acBase.itens }); }
      }
      if (n) { eqMarcarVersao(); GM_setValue('equipeLimpeza', { em: Date.now(), removidos: n }); }
      return n;
    }

    /* ---- recebimento ---- */
    const eqVistos = new Map();   // id -> { n (impressão digital), em } que passaram pelo canal (não reenvia o que outro acabou de mandar)
    let eqFalhasChave = 0;
    async function eqReceber(evento, bruto) {
      let p;
      try { p = await eqDecifrar(typeof bruto === 'string' ? JSON.parse(bruto) : bruto); }
      catch (_) { eqFalhasChave++; eqStatusUI(); return; }   // outra chave da equipe (ou mensagem que não é nossa): ignora
      if (!p || !p.col || !['lb', 'ac'].includes(p.col)) return;
      if (evento === 'mf-reg' && p.rec) { eqVistos.set(p.rec.id, { n: eqN(p.col, p.rec), em: Date.now() }); eqAplicar(p.col, p.rec); }
      if (evento === 'mf-resumo') eqResumoRecebido(p);
    }
    // resumo = lista [id, versão, impressão digital] de tudo o que o funcionário tem; quem tem algo mais novo (ou diferente) manda
    let eqUltimoResumo = 0, eqResumosResposta = [];
    async function eqEnviarResumo(forcar, resposta) {
      if (!eqPronta()) return;
      if (resposta) {   // pedido do que falta aqui: rápido, mas limitado (nunca vira ping-pong)
        eqResumosResposta = eqResumosResposta.filter(t => Date.now() - t < 60000);
        if (eqResumosResposta.length >= 8 || Date.now() - (eqResumosResposta.slice(-1)[0] || 0) < 3000) return;
        eqResumosResposta.push(Date.now());
      } else if (!forcar && Date.now() - eqUltimoResumo < 15000) return;
      eqUltimoResumo = Date.now();
      eqLimpar();
      for (const col of ['lb', 'ac']) {
        const itens = eqTodos(col).map(r => [r.id, r.rev || 1, eqN(col, r)]);
        const partes = Math.max(1, Math.ceil(itens.length / 150));
        for (let i = 0; i < partes; i++) eqEnfileirar('mf-resumo', { col, de: eqId(), lote: eqUltimoResumo, parte: i, total: partes, itens: itens.slice(i * 150, i * 150 + 150) });
      }
    }
    const eqResumos = {};
    function eqResumoRecebido(p) {
      if (p.de === eqId()) return;
      const k = p.de + '|' + p.col + '|' + p.lote;
      const r = eqResumos[k] = eqResumos[k] || { partes: new Set(), itens: new Map() };
      r.partes.add(p.parte);
      (p.itens || []).forEach(([id, rev, n]) => r.itens.set(id, { rev, n }));
      if (r.partes.size < p.total) return;
      delete eqResumos[k];
      const meus = eqTodos(p.col), meusPorId = new Map(meus.map(x => [x.id, x]));
      const faltaLa = meus.filter(x => { const d = r.itens.get(x.id); return !d || d.rev < (x.rev || 1) || (d.rev === (x.rev || 1) && d.n !== eqN(p.col, x)); });
      const faltaAqui = [...r.itens].some(([id, d]) => { const x = meusPorId.get(id); return !x || (x.rev || 1) < d.rev || ((x.rev || 1) === d.rev && eqN(p.col, x) !== d.n); });
      if (faltaAqui) setTimeout(() => eqEnviarResumo(false, true), 500 + Math.random() * 1500);   // pede o que falta aqui
      if (!faltaLa.length) return;
      // espera um pouco: se outro funcionário já mandou o mesmo registro DEPOIS deste pedido, não manda de novo
      const pedidoEm = Date.now();
      setTimeout(() => faltaLa.forEach(x => {
        const v = eqVistos.get(x.id), n = eqN(p.col, x);
        if (v && v.n === n && v.em >= pedidoEm) return;
        eqVistos.set(x.id, { n, em: Date.now() });
        eqEnfileirar('mf-reg', { col: p.col, rec: eqEnxugar(p.col, x), de: eqId() });
      }), 300 + Math.random() * 1700);
    }

    /* ---- conexão: uma aba por navegador (as outras acompanham pelo armazenamento) ---- */
    let eqPusher = null, eqCanal = null, eqSocket = null, eqEstado = 'desligado', eqMembros = [], eqChaveDiferente = [];
    const eqLib = () => (typeof Pusher !== 'undefined' ? Pusher : window.Pusher || PAGINA.Pusher);
    function eqConectar() {
      const Lib = eqLib();
      if (!Lib) { eqEstado = 'biblioteca do Pusher não carregou (sem internet ou bloqueada)'; return eqStatusUI(); }
      const c = eqCfg();
      try {
        eqPusher = new Lib(EQ.key, {
          cluster: EQ.cluster, forceTLS: true,
          channelAuthorization: {
            customHandler: (prm, cb) => {
              eqVerificador().then(v => {
                const dados = JSON.stringify({ user_id: eqId(), user_info: { nome: c.nome, v } });
                return eqHmac(c.secret, prm.socketId + ':' + prm.channelName + ':' + dados).then(sig => cb(null, { auth: EQ.key + ':' + sig, channel_data: dados }));
              }).catch(e => cb(e, null));
            },
          },
        });
      } catch (e) { eqEstado = 'erro ao iniciar o Pusher'; eqPusher = null; return eqStatusUI(); }
      eqPusher.connection.bind('state_change', st => { eqEstado = st.current; if (st.current !== 'connected') eqSocket = null; eqStatusUI(); });
      eqPusher.connection.bind('connected', () => { eqSocket = eqPusher.connection.socket_id; });
      eqCanal = eqPusher.subscribe(EQ.canal);
      const membros = async () => {
        const l = [], dif = [], meu = await eqVerificador();
        try { eqCanal.members.each(m => { const n = (m.info && m.info.nome) || m.id; l.push(n); if (m.id !== eqId() && m.info && m.info.v && m.info.v !== meu) dif.push(n); }); } catch (_) {}
        eqMembros = l; eqChaveDiferente = dif;
        GM_setValue('equipeOnline', { em: Date.now(), nomes: l, dif });
        eqStatusUI();
      };
      eqCanal.bind('pusher:subscription_succeeded', () => { eqEstado = 'conectado'; membros(); eqEnviarResumo(true); });
      eqCanal.bind('pusher:subscription_error', () => { eqEstado = 'acesso negado ao canal (confira a secret do Pusher)'; eqStatusUI(); });
      eqCanal.bind('pusher:member_added', membros);
      eqCanal.bind('pusher:member_removed', membros);
      ['mf-reg', 'mf-resumo'].forEach(ev => eqCanal.bind(ev, d => eqReceber(ev, d)));
    }
    function eqDesconectar() {
      try { if (eqPusher) eqPusher.disconnect(); } catch (_) {}
      eqPusher = eqCanal = eqSocket = null; eqMembros = []; eqEstado = eqPronta() ? 'em espera (outra aba está conectada)' : 'desligado';
      eqStatusUI();
    }
    function eqCiclo() {
      const pronta = eqPronta(), l = GM_getValue('equipeLider', null), agora = Date.now();
      const livre = !l || l.aba === EQ_ABA || agora - (l.em || 0) > 15000;
      if (pronta && livre) {
        GM_setValue('equipeLider', { aba: EQ_ABA, em: agora });
        if (!eqPusher) setTimeout(() => { const x = GM_getValue('equipeLider', null); if (x && x.aba === EQ_ABA && !eqPusher && eqPronta()) eqConectar(); }, 400);   // duas abas ao mesmo tempo: fica uma
      } else if (eqPusher) eqDesconectar();
      if (!pronta && eqEstado !== 'desligado') { eqEstado = 'desligado'; }
      eqStatusUI();
    }
    window.addEventListener('beforeunload', () => { const l = GM_getValue('equipeLider', null); if (l && l.aba === EQ_ABA) GM_deleteValue('equipeLider'); });

    /* ---- avisos (todas as abas mostram; fechar em uma fecha em todas) ---- */
    function eqAvisar(titulo, texto, alvo) {
      const lista = (GM_getValue('equipeAvisos', []) || []).filter(a => Date.now() - a.em < 30 * 60 * 1000).slice(-19);
      const av = { id: 'av' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), em: Date.now(), titulo, texto, alvo };
      GM_setValue('equipeAvisos', [...lista, av]);
      eqDesenharAvisos();
      if (window.Notification && Notification.permission === 'granted') { try { new Notification('PaymobiFin - ' + titulo, { body: texto }); } catch (_) {} }
    }
    let eqCaixaAvisos = null;
    function eqDesenharAvisos() {
      const vistos = GM_getValue('equipeAvisosVistos', []) || [], todos = GM_getValue('equipeAvisos', []) || [];
      const recentes = todos.filter(a => Date.now() - a.em < 30 * 60 * 1000);
      if (recentes.length !== todos.length) GM_setValue('equipeAvisos', recentes);   // avisos têm nome/proposta: não ficam guardados
      const ativos = recentes.filter(a => !vistos.includes(a.id));
      if (!ativos.length) { if (eqCaixaAvisos) { eqCaixaAvisos.remove(); eqCaixaAvisos = null; } return; }
      if (!eqCaixaAvisos) {
        eqCaixaAvisos = document.createElement('div'); eqCaixaAvisos.id = 'mf-eq-avisos';
        document.body.appendChild(eqCaixaAvisos);
      }
      eqCaixaAvisos.innerHTML = '';
      const st = document.createElement('style');
      st.textContent = '#mf-eq-avisos{position:fixed;right:16px;top:16px;z-index:2147483646;width:330px;max-width:calc(100vw - 32px);display:flex;flex-direction:column;gap:8px;font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif}' +
        '#mf-eq-avisos .av{background:#fff;color:#1f2937;border:1px solid #bfdbfe;border-left:5px solid #2563eb;border-radius:10px;box-shadow:0 10px 30px #0003;padding:10px 12px}' +
        '#mf-eq-avisos b{display:block;margin-bottom:2px}#mf-eq-avisos p{margin:0;white-space:pre-wrap;color:#475569}' +
        '#mf-eq-avisos button{cursor:pointer;border:0;border-radius:6px;padding:4px 8px;margin:6px 6px 0 0;font-size:12px;font-weight:600;background:#e2e8f0;color:#1e293b}#mf-eq-avisos button.pri{background:#2563eb;color:#fff}';
      eqCaixaAvisos.appendChild(st);
      const fechar = ids => { GM_setValue('equipeAvisosVistos', [...(GM_getValue('equipeAvisosVistos', []) || []), ...ids].slice(-200)); eqDesenharAvisos(); };
      ativos.slice(-4).forEach(a => {
        const d = document.createElement('div'); d.className = 'av';
        const b = document.createElement('b'); b.textContent = '👥 ' + a.titulo;
        const p = document.createElement('p'); p.textContent = a.texto;
        d.append(b, p);
        if (a.alvo) {
          const ver = document.createElement('button'); ver.className = 'pri'; ver.textContent = 'Ver';
          ver.onclick = () => {
            if (GM_getValue('min', false)) { GM_setValue('min', false); aplicarMin(false); trazerParaTela(); }
            if (a.alvo.aba === 'lem') { lbRecarregar(); lbAberto = a.alvo.id; lbFiltro = 'todos'; mostrarAba('lem'); lbDesenhar(); }
            else { hsAberto = a.alvo.id; mostrarAba('his'); hsDesenhar(); }
            fechar([a.id]);
          };
          d.appendChild(ver);
        }
        const ok = document.createElement('button'); ok.textContent = 'OK'; ok.onclick = () => fechar([a.id]);
        d.appendChild(ok);
        eqCaixaAvisos.appendChild(d);
      });
      if (ativos.length > 1) { const t = document.createElement('button'); t.textContent = 'Fechar todos (' + ativos.length + ')'; t.onclick = () => fechar(ativos.map(a => a.id)); eqCaixaAvisos.appendChild(t); }
    }

    /* ---- configuração (Configurações > Equipe) ---- */
    function eqStatusUI() {
      const c = eqCfg(), onl = GM_getValue('equipeOnline', null);
      let t;
      if (!c.ativa) t = 'Compartilhamento desligado: lembretes e histórico ficam só neste navegador.';
      else if (!c.nome || !c.secret || !c.chave) t = 'Falta preencher: ' + [!c.nome && 'seu nome', !c.secret && 'secret do Pusher', !c.chave && 'chave da equipe'].filter(Boolean).join(', ') + '.';
      else if (eqPusher) t = 'Equipe: ' + eqEstado + (eqMembros.length ? ' · online: ' + eqMembros.join(', ') : '');
      else t = 'Equipe: ' + (onl && Date.now() - onl.em < 60000 ? 'conectada por outra aba · online: ' + (onl.nomes || []).join(', ') : eqEstado);
      const dif = eqPusher ? eqChaveDiferente : ((onl && Date.now() - onl.em < 60000 && onl.dif) || []);
      if (c.ativa && dif.length) t += ' · ⚠ chave da equipe diferente de: ' + dif.join(', ') + ' (vocês não conseguem ler as mensagens um do outro; combinem a mesma chave)';
      else if (eqFalhasChave) t += ' · ' + eqFalhasChave + ' mensagem(ns) com outra chave da equipe (ignoradas)';
      if (eqErroEnvio) t += ' · ' + eqErroEnvio;
      const lim = GM_getValue('equipeLimpeza', null);
      [$('#mf-eq-status'), $('#mf-hs-equipe')].forEach(el => { if (el) el.textContent = t; });
      if (lim && $('#mf-hs-equipe') && Date.now() - lim.em < 24 * 3600 * 1000) $('#mf-hs-equipe').textContent += ' · ' + lim.removidos + ' registro(s) com mais de 30 dias saíram hoje';
    }
    $('#mf-eq-nome').value = eqCfg().nome;
    $('#mf-eq-secret').value = eqCfg().secret ? '••••••••' : '';
    $('#mf-eq-chave').value = eqCfg().chave ? '••••••••' : '';
    $('#mf-eq-ativa').checked = cfg('equipeAtiva');
    [['#mf-eq-secret-ver', '#mf-eq-secret'], ['#mf-eq-chave-ver', '#mf-eq-chave']].forEach(([b, i]) => { $(b).onclick = () => { $(i).type = $(i).type === 'password' ? 'text' : 'password'; }; });
    ['#mf-eq-secret', '#mf-eq-chave'].forEach(i => $(i).addEventListener('focus', () => { if ($(i).value === '••••••••') $(i).value = ''; }));
    $('#mf-eq-salvar').onclick = () => {
      const nome = limpoTxt($('#mf-eq-nome').value).slice(0, 40), sec = $('#mf-eq-secret').value.trim(), ch = $('#mf-eq-chave').value;
      if (!nome) return msg('Informe seu nome (é como a equipe vê quem registrou).');
      GM_setValue('equipeNome', nome);
      if (sec && sec !== '••••••••') { if (!/^[0-9a-f]{20}$/i.test(sec)) return msg('A secret do Pusher tem 20 caracteres (letras a–f e números). Confira no painel do Pusher, em App Keys.'); GM_setValue('equipeSecret', sec); }
      if (ch && ch !== '••••••••') { if (ch.length < 8) return msg('A chave da equipe precisa ter pelo menos 8 caracteres (use a mesma nos 4 computadores).'); GM_setValue('equipeChave', ch); eqChaveCache = null; }
      GM_setValue('equipeAtiva', $('#mf-eq-ativa').checked);
      $('#mf-eq-secret').value = eqCfg().secret ? '••••••••' : ''; $('#mf-eq-chave').value = eqCfg().chave ? '••••••••' : '';
      $('#mf-eq-secret').type = $('#mf-eq-chave').type = 'password';
      eqDesconectar(); GM_deleteValue('equipeLider'); eqCiclo();
      msg(eqPronta() ? 'Equipe configurada. Conectando…' : 'Configuração salva. ' + ($('#mf-eq-ativa').checked ? 'Preencha secret e chave para conectar.' : 'Compartilhamento desligado.'));
      lbDesenhar();
    };
    $('#mf-eq-sync').onclick = () => { if (!eqPronta()) return msg('Configure e ligue o compartilhamento antes.'); if (!eqPusher) return msg('A conexão está em outra aba do sistema: a sincronização acontece por lá.'); eqEnviarResumo(true); msg('Sincronizando com quem está online…'); };
    $('#mf-eq-exportar').onclick = () => {
      lbRecarregar(); acRecarregar();
      const json = JSON.stringify({ tipo: 'PaymobiFin-Assistente-equipe', versao: 1, exportadoEm: new Date().toISOString(), lembretes: lbBase.itens.filter(i => i.compartilhado),
        exclusoes: GM_getValue(LB_EXCLUIDOS, {}) || {}, acordos: acBase.itens }, null, 1);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'equipe-paymobifin-' + lbHoje() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      msg('Backup da equipe exportado. O arquivo tem dados de clientes: guarde em local restrito.');
    };
    $('#mf-eq-importar').onclick = () => $('#mf-eq-arquivo').click();
    $('#mf-eq-arquivo').addEventListener('change', async () => {
      const f = $('#mf-eq-arquivo').files[0]; $('#mf-eq-arquivo').value = '';
      if (!f) return;
      let d; try { d = JSON.parse(await f.text()); } catch (_) { return msg('Arquivo inválido: não é um JSON.'); }
      if (!d || d.tipo !== 'PaymobiFin-Assistente-equipe') return msg('Arquivo não reconhecido como backup da equipe.');
      let n = 0;
      (d.lembretes || []).forEach(r => { const y = lbMigrar(r); if (y && eqAplicar('lb', { ...y, compartilhado: true })) n++; });
      Object.values(d.exclusoes || {}).forEach(r => { if (eqAplicar('lb', r)) n++; });
      (d.acordos || []).forEach(r => { if (r && r.cliente && eqAplicar('ac', r)) n++; });
      msg('Importação: ' + n + ' registro(s) novos ou mais recentes. Nada foi apagado (registros com mais de 30 dias não entram).');
      hsDesenhar();
    });
    // outras abas: acompanham as mudanças pelo armazenamento
    let eqVersaoVista = GM_getValue('equipeVersao', 0);
    setInterval(() => {
      const v = GM_getValue('equipeVersao', 0);
      if (v !== eqVersaoVista) { eqVersaoVista = v; lbRecarregar(); lbAtualizar(); acRecarregar(); hsDesenhar(); }
      eqDesenharAvisos();
    }, 2000);
    setInterval(() => { if (eqLimpar()) { lbAtualizar(); hsDesenhar(); } }, 60 * 60 * 1000);
    setInterval(eqCiclo, 5000);

    /* ================= HISTÓRICO DE ACORDOS DA EQUIPE =================
       GM 'mfAcordos' = { versao, itens }. Registro: cliente (nome, proposta, número de contato), modalidade, situação,
       textos da planilha, campos digitados (sem CPF), parcelas da Renegociação, autor e revisões. Nada é sobrescrito:
       cada correção vira uma revisão (quem, quando, motivo, de → para). "Anular" muda a situação; não apaga. */
    const AC_CHAVE = 'mfAcordos', AC_VERSAO = 1;
    const HS_STATUS = { realizado: 'Acordo realizado', pendente: 'Solicitação pendente', nao_concluido: 'Não concluída', anulado: 'Anulado' };
    function acCarregar() {
      const raw = GM_getValue(AC_CHAVE, null);
      if (!raw || typeof raw !== 'object') return { versao: AC_VERSAO, itens: [] };
      if ((raw.versao | 0) > AC_VERSAO) return { versao: raw.versao, itens: Array.isArray(raw.itens) ? raw.itens : [], somenteLeitura: true };
      return { versao: AC_VERSAO, itens: Array.isArray(raw.itens) ? raw.itens.filter(x => x && typeof x.id === 'string' && x.cliente) : [] };
    }
    let acBase = acCarregar(), hsAberto = null, hsCorrigindo = null;
    function acRecarregar() { acBase = acCarregar(); }
    function acGravar() { GM_setValue(AC_CHAVE, { versao: AC_VERSAO, itens: acBase.itens }); eqMarcarVersao(); hsDesenhar(); }
    function acSalvar(rec) {
      if (acBase.somenteLeitura) { msg('O histórico salvo é de uma versão mais nova do script: atualize o script antes de alterar.'); return false; }
      acGravar();
      if (rec) eqEnviar('ac', rec);
      return true;
    }
    const hsResumoValores = r => {
      const v = r.valores || {}, l = [];
      Object.entries(v).forEach(([k, x]) => {
        const def = NG_CAMPOS[k];
        if (!def || ['nome', 'proposta', 'contato', 'observacoes'].includes(k) || def.tipo === 'check' || k.startsWith('plano_') || x === '' || x == null) return;
        const val = def.tipo === 'moeda' ? (ngCentavos(x) != null ? ngReais(ngCentavos(x)) : x) : def.tipo === 'data' ? ngData(x) : def.tipo === 'select' ? ((def.opcoes.find(o => o[0] === x) || [, x])[1]) : String(x);
        if (val) l.push(def.rot + ': ' + val);
      });
      return l;
    };
    // diferenças entre duas versões (para a revisão)
    function hsDiferencas(a, b) {
      const out = [], cmp = (rot, x, y) => { x = x == null ? '' : String(x); y = y == null ? '' : String(y); if (x !== y) out.push({ campo: rot, de: x.slice(0, 200), para: y.slice(0, 200) }); };
      cmp('Situação', HS_STATUS[a.status] || a.status, HS_STATUS[b.status] || b.status);
      cmp('Modalidade', (NG_MODALIDADES[a.modalidade] || {}).nome || a.modalidade, (NG_MODALIDADES[b.modalidade] || {}).nome || b.modalidade);
      cmp('Número de contato', a.cliente.contato, b.cliente.contato);
      cmp('Nome', a.cliente.nome, b.cliente.nome);
      ['pedido', 'acordo', 'parcela'].forEach(k => cmp({ pedido: 'Pedido do cliente', acordo: 'Acordo Realizado', parcela: 'A partir de qual parcela' }[k], (a.textos || {})[k], (b.textos || {})[k]));
      cmp('Observações', a.obs, b.obs);
      const ks = new Set([...Object.keys(a.valores || {}), ...Object.keys(b.valores || {})]);
      ks.forEach(k => { if (!['nome', 'contato'].includes(k) && NG_CAMPOS[k]) cmp(NG_CAMPOS[k].rot, (a.valores || {})[k], (b.valores || {})[k]); });
      if (JSON.stringify(a.plano || []) !== JSON.stringify(b.plano || [])) out.push({ campo: 'Parcelas da renegociação', de: (a.plano || []).length + ' linha(s)', para: (b.plano || []).length + ' linha(s)' });
      return out;
    }
    function hsRevisar(rec, novo, motivo) {
      const mud = hsDiferencas(rec, novo);
      if (!mud.length) return null;
      const r = { ...novo, revisoes: [...(rec.revisoes || []), { id: 'rv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), em: Date.now(), por: eqId(), porNome: eqNomeLocal(), motivo, mudancas: mud }],
        rev: (rec.rev || 1) + 1, atualizadoEm: Date.now(), atualizadoPor: eqId(), atualizadoPorNome: eqNomeLocal() };
      return r;
    }
    // registra o que está no Atendimento (evita duplicado: mesma proposta -> atualizar o existente, com revisão)
    function atRegistrar() {
      const falta = atValidar();
      if (falta.length) return msg('Preencha antes de registrar:\n- ' + falta.join('\n- '));
      if (ngCtx === 'renegociacao' && !atPlano.length && !confirm('As parcelas da renegociação não foram montadas. Registrar assim mesmo?')) return;
      if (!atTexto('pedido') && !atTexto('acordo')) ngGerarTextos(true);
      const status = ngCtx === 'renegociacao' ? 'realizado' : { fechou: 'realizado', solicitou: 'pendente', nao: 'nao_concluido' }[$('#mf-ng-frase-tipo').value] || 'pendente';
      const valores = {};
      Object.entries(ngValores).forEach(([k, v]) => {
        if (k === 'cpf' || k.startsWith('_') || !NG_CAMPOS[k] || NG_CAMPOS[k].tipo === 'calc') return;   // CPF não vai para o histórico
        if (v === '' || v == null || v === false) return;
        valores[k] = typeof v === 'string' ? v.slice(0, 600) : v;
      });
      const agora = Date.now();
      const rec = {
        id: 'ac' + agora.toString(36) + Math.random().toString(36).slice(2, 7), tipo: ngCtx, modalidade: ngModalidade(), status,
        cliente: { nome: ngValor('nome'), proposta: String(ngValores.proposta || '').trim(), contato: telFormatar(ngValores.contato) || '' },
        valores, textos: { pedido: atTexto('pedido'), acordo: atTexto('acordo'), parcela: atTexto('parcela') },
        plano: ngCtx === 'renegociacao' ? atPlano.map(l => ({ ...l })) : [], obs: '',
        criadoEm: agora, criadoPor: eqId(), criadoPorNome: eqNomeLocal(), atualizadoEm: agora, atualizadoPor: eqId(), atualizadoPorNome: eqNomeLocal(), rev: 1, revisoes: [],
      };
      acRecarregar();
      const mesmos = acBase.itens.filter(x => x.cliente.proposta === rec.cliente.proposta && x.status !== 'anulado' && !eqExpirado('ac', x)).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
      const igual = mesmos.find(x => x.tipo === rec.tipo && x.modalidade === rec.modalidade && x.status === rec.status && JSON.stringify(x.textos) === JSON.stringify(rec.textos) && JSON.stringify(x.valores) === JSON.stringify(rec.valores));
      if (igual) { hsAberto = igual.id; mostrarAba('his'); hsDesenhar(); return msg('Este acordo já está no histórico (' + new Date(igual.criadoEm).toLocaleString('pt-BR') + ', por ' + igual.criadoPorNome + '). Nada foi duplicado.'); }
      if (mesmos.length) {
        const x = mesmos[0];
        if (confirm('Já existe registro da proposta ' + rec.cliente.proposta + ': ' + (HS_STATUS[x.status] || x.status) + ', ' + new Date(x.atualizadoEm).toLocaleString('pt-BR') + ' por ' + (x.atualizadoPorNome || x.criadoPorNome) + '.\n\nOK = ATUALIZAR esse registro (a mudança fica nas alterações, com o valor anterior)\nCancelar = outras opções')) {
          const novo = hsRevisar(x, { ...x, tipo: rec.tipo, modalidade: rec.modalidade, status: rec.status, cliente: rec.cliente, valores: rec.valores, textos: rec.textos, plano: rec.plano }, 'Atualizado pelo Atendimento');
          if (!novo) { hsAberto = x.id; mostrarAba('his'); hsDesenhar(); return msg('Nada mudou em relação ao registro existente.'); }
          acBase.itens[acBase.itens.findIndex(y => y.id === x.id)] = novo;
          if (acSalvar(novo)) { hsAberto = novo.id; msg('Registro da proposta ' + rec.cliente.proposta + ' atualizado (' + novo.revisoes.slice(-1)[0].mudancas.length + ' alteração(ões)).'); }
          return;
        }
        if (!confirm('Criar um registro NOVO, separado, para a mesma proposta ' + rec.cliente.proposta + '?')) return msg('Nada foi registrado.');
      }
      acBase.itens.push(rec);
      if (acSalvar(rec)) { hsAberto = rec.id; msg('Registrado no histórico' + (eqPronta() ? ' e enviado para a equipe' : ' (só neste navegador: ligue o compartilhamento em Configurações > Equipe)') + '.'); }
    }
    $('#mf-at-registrar').onclick = atRegistrar;

    /* ---- tela do histórico ---- */
    const selHsModal = $('#mf-hs-modal');
    Object.entries(NG_MODALIDADES).forEach(([k, md]) => { const o = document.createElement('option'); o.value = k; o.textContent = md.nome; selHsModal.appendChild(o); });
    ['#mf-hs-status', '#mf-hs-modal', '#mf-hs-func', '#mf-hs-periodo'].forEach(sl => $(sl).addEventListener('change', () => hsDesenhar()));
    $('#mf-hs-busca').addEventListener('input', () => hsDesenhar());
    function hsDesenhar() {
      const caixa = $('#mf-hs-lista');
      if (!caixa) return;
      const itens = acBase.itens.filter(r => !eqExpirado('ac', r));
      // funcionários (filtro)
      const sf = $('#mf-hs-func'), atualF = sf.value, nomes = [...new Set(itens.flatMap(r => [r.criadoPorNome, r.atualizadoPorNome]).filter(Boolean))].sort();
      sf.innerHTML = '<option value="">Todos os funcionários</option>';
      nomes.forEach(n => { const o = document.createElement('option'); o.value = o.textContent = n; sf.appendChild(o); });
      sf.value = nomes.includes(atualF) ? atualF : '';
      const busca = $('#mf-hs-busca').value.trim().toLowerCase(), dig = busca.replace(/\D/g, '');
      const fSt = $('#mf-hs-status').value, fMod = $('#mf-hs-modal').value, fFunc = sf.value, dias = +$('#mf-hs-periodo').value || 30;
      const desde = dias === 1 ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : Date.now() - dias * 24 * 3600 * 1000;
      const lista = itens.filter(r => (!fSt || r.status === fSt) && (!fMod || r.modalidade === fMod) && (!fFunc || r.criadoPorNome === fFunc || r.atualizadoPorNome === fFunc)
        && (r.atualizadoEm || r.criadoEm) >= desde
        && (!busca || [r.cliente.nome, r.cliente.proposta, r.criadoPorNome, r.atualizadoPorNome, (r.valores || {}).responsavel].join(' ').toLowerCase().includes(busca)
          || (dig.length >= 4 && String(r.cliente.contato || '').replace(/\D/g, '').includes(dig))))
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
      $('#mf-hs-qtd').textContent = '(' + lista.length + ' de ' + itens.length + ')';
      caixa.innerHTML = '';
      if (!lista.length) { const v = document.createElement('div'); v.className = 'mf-info'; v.textContent = itens.length ? 'Nenhum registro com esses filtros.' : 'Nenhum acordo registrado ainda. No Atendimento, use "Registrar no histórico".'; caixa.appendChild(v); }
      lista.slice(0, 150).forEach(r => caixa.appendChild(hsItem(r)));
      hsBadge();
      eqStatusUI();
    }
    const hsCopiar = (t, rot) => { if (!String(t || '').trim()) return msg('Nada para copiar em ' + rot + '.'); GM_setClipboard(t, 'text'); msg(rot + ' copiado.'); };
    function hsItem(r) {
      const el = document.createElement('div'); el.className = 'mf-hs-item ' + r.status;
      const l1 = document.createElement('div'); l1.className = 'mf-lb-l1';
      l1.textContent = 'Proposta ' + (r.cliente.proposta || '—') + (r.cliente.nome ? ' · ' + r.cliente.nome : '') + (r.cliente.contato ? ' · ' + r.cliente.contato : '');
      const l2 = document.createElement('div');
      l2.textContent = (HS_STATUS[r.status] || r.status) + ' · ' + ((NG_MODALIDADES[r.modalidade] || {}).nome || r.modalidade) + (r.tipo === 'renegociacao' ? ' · Renegociação' : '') +
        ' · ' + (r.criadoPorNome || '—') + ', ' + new Date(r.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ((r.revisoes || []).length ? ' · ' + r.revisoes.length + ' alteração(ões)' : '');
      el.append(l1, l2);
      el.onclick = () => { hsAberto = hsAberto === r.id ? null : r.id; hsCorrigindo = null; hsDesenhar(); };
      if (hsAberto !== r.id) return el;
      const det = document.createElement('div'); det.className = 'mf-hs-det';
      det.onclick = e => e.stopPropagation();
      const linhas = [];
      if (r.textos.pedido) linhas.push((r.tipo === 'renegociacao' ? 'Acordo Solicitado: ' : 'Pedido do cliente: ') + r.textos.pedido);
      if (r.textos.acordo) linhas.push('Acordo Realizado: ' + r.textos.acordo);
      if (r.textos.parcela) linhas.push('A partir de qual parcela: ' + r.textos.parcela);
      linhas.push(...hsResumoValores(r));
      if ((r.plano || []).length) linhas.push('Parcelas: ' + r.plano.length + ' (' + r.plano.slice(0, 3).map(l => l.acao + ' ' + ngReais(l.valor) + ' ' + ngData(l.venc)).join('; ') + (r.plano.length > 3 ? '…' : '') + ')');
      if (r.obs) linhas.push('Observações: ' + r.obs);
      linhas.push('Registrado por ' + (r.criadoPorNome || '—') + ' em ' + new Date(r.criadoEm).toLocaleString('pt-BR') + (r.rev > 1 ? ' · última alteração: ' + (r.atualizadoPorNome || '—') + ' em ' + new Date(r.atualizadoEm).toLocaleString('pt-BR') : ''));
      (r.revisoes || []).slice(-5).forEach(v => linhas.push('↳ ' + new Date(v.em).toLocaleString('pt-BR') + ' ' + (v.porNome || '') + (v.motivo ? ' (' + v.motivo + ')' : '') + ': ' + v.mudancas.map(m => m.campo + ' "' + (m.de || '—') + '" → "' + (m.para || '—') + '"').join('; ')));
      det.textContent = linhas.join('\n');
      const acoes = document.createElement('div'); acoes.className = 'mf-lb-acoes';
      const bt = (t, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = t; b.onclick = e => { e.stopPropagation(); fn(); }; acoes.appendChild(b); };
      bt('Copiar pedido', 'cinza', () => hsCopiar(r.textos.pedido, '"Pedido do cliente"'));
      bt('Copiar acordo', 'cinza', () => hsCopiar(r.textos.acordo, '"Acordo Realizado"'));
      if (r.cliente.contato) bt('Copiar telefone', 'cinza', () => hsCopiar(r.cliente.contato, 'Telefone'));
      bt('Copiar resumo', 'cinza', () => hsCopiar(['Proposta ' + r.cliente.proposta + ' · ' + r.cliente.nome + (r.cliente.contato ? ' · ' + r.cliente.contato : ''), HS_STATUS[r.status] + ' · ' + ((NG_MODALIDADES[r.modalidade] || {}).nome || ''), r.textos.pedido, r.textos.acordo].filter(Boolean).join('\n'), 'Resumo'));
      bt('Abrir no Atendimento', 'azul', () => hsAbrirNoAtendimento(r));
      if (r.status !== 'anulado') { bt('Corrigir', 'cinza', () => { hsCorrigindo = r.id; hsDesenhar(); }); bt('Anular', 'vermelho', () => hsAnular(r.id)); }
      el.append(det, acoes);
      if (hsCorrigindo === r.id) el.appendChild(hsEditor(r));
      return el;
    }
    function hsEditor(r) {
      const f = document.createElement('div'); f.className = 'mf-hs-det';
      f.onclick = e => e.stopPropagation();
      const campo = (rot, el) => { const l = document.createElement('label'); l.className = 'mf-lb-rot'; l.style.marginTop = '6px'; l.append(rot, el); f.appendChild(l); return el; };
      const sel = document.createElement('select');
      Object.entries(HS_STATUS).filter(([k]) => k !== 'anulado').forEach(([k, t]) => { const o = document.createElement('option'); o.value = k; o.textContent = t; sel.appendChild(o); });
      sel.value = r.status;
      campo('Situação', sel);
      const tel = campo('Número de contato', Object.assign(document.createElement('input'), { value: r.cliente.contato || '' }));
      const ped = campo(r.tipo === 'renegociacao' ? 'Acordo Solicitado' : 'Pedido do cliente', Object.assign(document.createElement('textarea'), { value: r.textos.pedido || '' }));
      const aco = campo('Acordo Realizado', Object.assign(document.createElement('textarea'), { value: r.textos.acordo || '' }));
      const obs = campo('Observações', Object.assign(document.createElement('textarea'), { value: r.obs || '' }));
      const mot = campo('Motivo da correção *', Object.assign(document.createElement('input'), { placeholder: 'Ex.: cliente mudou o dia de pagamento' }));
      const acoes = document.createElement('div'); acoes.className = 'mf-lb-acoes';
      const salvar = document.createElement('button'); salvar.className = 'verde'; salvar.textContent = 'Salvar correção';
      const cancelar = document.createElement('button'); cancelar.className = 'cinza'; cancelar.textContent = 'Cancelar';
      cancelar.onclick = e => { e.stopPropagation(); hsCorrigindo = null; hsDesenhar(); };
      salvar.onclick = e => {
        e.stopPropagation();
        if (!mot.value.trim()) { mot.classList.add('mf-erro'); return msg('Informe o motivo da correção (fica registrado).'); }
        if (tel.value.trim() && !telFormatar(tel.value)) { tel.classList.add('mf-erro'); return msg('Número de contato inválido (DDD + número) ou deixe em branco.'); }
        acRecarregar();
        const atual = acBase.itens.find(x => x.id === r.id);
        if (!atual) return msg('O registro não existe mais (pode ter passado de 30 dias).');
        const novo = hsRevisar(atual, { ...atual, status: sel.value, cliente: { ...atual.cliente, contato: telFormatar(tel.value) || '' }, textos: { ...atual.textos, pedido: ped.value.trim(), acordo: aco.value.trim() }, obs: obs.value.trim().slice(0, 1000) }, mot.value.trim().slice(0, 200));
        if (!novo) return msg('Nada foi alterado.');
        acBase.itens[acBase.itens.findIndex(x => x.id === r.id)] = novo;
        hsCorrigindo = null;
        if (acSalvar(novo)) msg('Correção salva (o valor anterior fica nas alterações).');
      };
      acoes.append(salvar, cancelar);
      f.appendChild(acoes);
      return f;
    }
    function hsAnular(id) {
      acRecarregar();
      const atual = acBase.itens.find(x => x.id === id);
      if (!atual) return;
      const motivo = prompt('Anular o registro da proposta ' + atual.cliente.proposta + '? Ele continua no histórico como "Anulado".\nMotivo:');
      if (motivo == null) return;
      if (!motivo.trim()) return msg('Informe o motivo para anular.');
      const novo = hsRevisar(atual, { ...atual, status: 'anulado' }, 'Anulado: ' + motivo.trim().slice(0, 200));
      acBase.itens[acBase.itens.findIndex(x => x.id === id)] = novo;
      if (acSalvar(novo)) msg('Registro anulado.');
    }
    function hsAbrirNoAtendimento(r) {
      if ((ngTemDados() || atPlano.length) && !confirm('Substituir os dados que estão no Atendimento pelos deste registro?')) return;
      Object.keys(ngValores).forEach(k => delete ngValores[k]);
      Object.assign(ngValores, r.valores || {});
      GM_setValue('negModalidade', r.modalidade); $('#mf-ng-modalidade').value = r.modalidade;
      atPlano = (r.plano || []).map(l => ({ ...l }));
      $('#mf-ng-f-pedido').value = r.textos.pedido || ''; $('#mf-ng-f-acordo').value = r.textos.acordo || ''; $('#mf-ng-f-parcela').value = r.textos.parcela || '';
      if (r.tipo !== 'renegociacao') $('#mf-ng-frase-tipo').value = { realizado: 'fechou', pendente: 'solicitou', nao_concluido: 'nao' }[r.status] || 'fechou';
      atTrocar(r.tipo === 'renegociacao' ? 'renegociacao' : 'negociacao');
      mostrarAba('neg');
      msg('Registro aberto no Atendimento. O CPF não fica no histórico: use "Aplicar cliente atual" se precisar dele na planilha.');
    }
    // contador da aba: registros de outros funcionários desde a última vez que o histórico foi aberto
    function hsBadge() {
      const visto = GM_getValue('hsVistoEm', 0) || 0;
      if (GM_getValue('abaPainel', 'neg') === 'his') GM_setValue('hsVistoEm', Date.now());
      const n = GM_getValue('abaPainel', 'neg') === 'his' ? 0 : acBase.itens.filter(r => r.atualizadoPor !== eqId() && (r.atualizadoEm || 0) > visto && !eqExpirado('ac', r)).length;
      const b = $('#mf-hs-badge'); b.textContent = n; b.style.display = n ? '' : 'none';
    }
    painel.querySelectorAll('[data-aba="his"]').forEach(b => b.addEventListener('click', () => setTimeout(hsDesenhar)));
    setInterval(hsBadge, 3000);
    eqLimpar();
    hsDesenhar();
    eqDesenharAvisos();
    eqCiclo();


    /* ================= BUSCA DE CLIENTE (central, somente leitura) =================
       Aceita CPF (11 dígitos), nº da proposta (3 a 9 dígitos) ou nome (parte). Fontes, todas do próprio sistema:
         · Mesa de Crédito: GET /MesaCredito/MesaCreditoLista?strDados={...strNomePesquisa} (busca no servidor por nº, CPF ou nome)
         · Fila de Propostas: a MESMA requisição que a tela da Fila faz ao pesquisar (qualquer data). O formato é aprendido
           quando você pesquisa na Fila (ou baixa CCBs) — nada é inventado; sem esse modelo, a Fila não é usada.
         · Proposta escolhida: aba Cliente (/MesaCredito/MesaAnaliseCliente) e detalhe (/MesaCredito/MesaAnaliseProposta)
         · Cobrança: Consulta CAC pelo CPF (conta master quando precisar; troca e volta como no módulo CAC)
       Identidade: nada é preenchido antes de existir UM cliente escolhido; os dados do CAC só entram se o CPF bate.
       O "cliente atual" fica no sessionStorage DESTA aba (some ao fechar a aba); nunca vai para o armazenamento do script. */
    const BUSCA_SS = 'mfBuscaCliente';
    const bsGet = () => { try { return JSON.parse(sessionStorage.getItem(BUSCA_SS) || 'null'); } catch (_) { return null; } };
    const bsSet = v => { try { if (v) sessionStorage.setItem(BUSCA_SS, JSON.stringify(v)); else sessionStorage.removeItem(BUSCA_SS); } catch (_) {} };
    const bsTipo = t => { const d = t.replace(/\D/g, ''); if (/^[\d.\-\s]+$/.test(t) && d.length === 11) return 'cpf'; if (/^\d{3,9}$/.test(t.trim())) return 'proposta'; return t.trim().length >= 3 ? 'nome' : ''; };
    const bsHojeBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    let bsOcupado = false, bsNavegando = false;
    const bsStatus = t => { $('#mf-bs-st').textContent = t; };

    // lista de propostas (Mesa ou Fila) a partir do HTML devolvido pelo servidor
    function bsLinhasMesa(doc) {
      const t = doc.querySelector('#tabMesaCreditoLista');
      if (!t) return null;
      const ths = [...t.querySelectorAll('thead th')].map(th => limpoTxt(th.textContent).toLowerCase());
      const col = n => ths.findIndex(x => x.startsWith(n));
      const ci = { id: col('proposta'), sit: col('situa'), dh: col('data/hora'), cli: col('cliente'), loja: col('pto') };
      return [...t.querySelectorAll('tbody tr')].map(tr => {
        const c = [...tr.children].map(td => limpoTxt(td.textContent));
        const td = tr.querySelector('td[onclick*="DetalheProposta"]');
        const idOc = td ? ((td.getAttribute('onclick') || '').match(/DetalheProposta\(\s*['"]?(\d+)/) || [])[1] : '';
        const proposta = idOc || (c[ci.id] || '').replace(/\D/g, '');
        return proposta ? { proposta, situacao: c[ci.sit] || '', data: c[ci.dh] || '', nome: c[ci.cli] || '', loja: c[ci.loja] || '', fonte: 'Mesa de Crédito' } : null;
      }).filter(Boolean);
    }
    function bsLinhasFila(doc) {
      const tab = doc.querySelector('#tabPropostasLista') || doc.querySelector('table');
      if (!tab) return null;
      const ci = colunasFila(tab);
      return [...tab.querySelectorAll('tbody tr')].map(tr => {
        const c = [...tr.cells].map(td => limpoTxt(td.textContent));
        const numero = c.find(x => /^\d{3,9}$/.test(x)) || '';
        return numero ? { proposta: numero, situacao: c[ci.sit] || '', data: '', nome: c[ci.cli] || '', loja: '', fonte: 'Fila de Propostas' } : null;
      }).filter(Boolean);
    }
    async function bsMesa(termo) {
      const pg = s => { const el = document.querySelector(s); return el ? el.value : null; };
      // filtros como a tela manda; período amplo (desde 2020) para achar propostas antigas
      const dados = {
        strDataInicial: '01/01/2020', strDataFinal: bsHojeBR(), strProduto: '', strSituacao: pg('select#txtSituacao') || '00', strReanalise: 'T', strMesa: '',
        strVisualizacao: 'N', strNomePesquisa: termo, strPromotora: '', strPromotoraFilial: '', strLojista: '', strLoja: '', strPontoAtendimento: '', strConveniada: '',
        strParceiro: '', lstPlanos: [], strCodigoEmprestimo: '', strTipoData: 'INCLUSAO', strDataVencimentoLiberacaoInicial: '', strDataVencimentoLiberacaoFinal: '',
      };
      const r = await cacReq('/MesaCredito/MesaCreditoLista', { strDados: JSON.stringify(dados) });
      if (!r.ok) return { erro: r.erro || 'Mesa de Crédito respondeu HTTP ' + r.status };
      const linhas = bsLinhasMesa(cacDoc(r.texto));
      if (!linhas && /n[ãa]o foi localizada nenhuma proposta/i.test(limpoTxt((cacDoc(r.texto).body || {}).textContent))) return { linhas: [] };   // sem resultado: o ER manda só o aviso, sem a tabela
      return linhas ? { linhas } : { erro: ehLogin(r.texto) ? 'sessão expirada' : 'resposta da Mesa sem a lista de propostas' };
    }
    // Fila: só com o modelo aprendido da própria tela da Fila
    async function bsFila(termo) {
      const mod = GM_getValue('filaReqModelo', null);
      if (!mod || !mod.url || !/\{\{termo\}\}/.test(mod.dados || '')) return { semModelo: true };
      const dados = mod.dados.replace('{{termo}}', encodeURIComponent(termo)).replace(/(^|&)_=\d+/, '$1_=' + Date.now());   // anti-cache do jQuery renovado
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_REDE * 1000);
      try {
        const url = cacBase() + mod.url;
        const r = await fetch(mod.metodo === 'POST' ? url : url + (url.includes('?') ? '&' : '?') + dados,
          mod.metodo === 'POST' ? { method: 'POST', credentials: 'include', signal: ctl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: dados }
            : { credentials: 'include', signal: ctl.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const t = await r.text();
        const linhas = r.ok ? bsLinhasFila(cacDoc(t)) : null;
        return linhas ? { linhas } : { erro: 'Fila respondeu HTTP ' + r.status };
      } catch (_) { return { erro: 'Fila: erro de rede' }; } finally { clearTimeout(tm); }
    }
    // aprende o formato da pesquisa da Fila quando VOCÊ pesquisa nela (o termo vira {{termo}}; nada pessoal é guardado)
    (() => {
      try {
        const jq = PAGINA.jQuery;
        if (!jq) return;   // a Fila pode ser aberta depois (o sistema troca de tela sem recarregar a página)
        jq(PAGINA.document).on('ajaxSend', (_e, _x, st) => {
          const url = String((st && st.url) || '');
          if (!/FilaPropostas\/FilaPropostasLista/i.test(url)) return;
          const campo = document.querySelector('#txtPropostasPesquisa');
          const termo = campo ? campo.value.trim() : '';
          if (!termo) return;
          const base = cacBase();
          let caminho = url.startsWith(base) ? url.slice(base.length) : url.replace(/^https?:\/\/[^/]+/, '').replace(/^.*?(\/FilaPropostas\/)/i, '$1');
          let dados = typeof st.data === 'string' ? st.data : '';
          if (!dados && caminho.includes('?')) { dados = caminho.split('?')[1]; caminho = caminho.split('?')[0]; }
          const variantes = [termo, encodeURIComponent(termo), encodeURIComponent(termo).replace(/%20/g, '+'), termo.toUpperCase(), encodeURIComponent(termo.toUpperCase())];
          const v = variantes.find(x => dados.includes(x));
          if (!v) return;
          GM_setValue('filaReqModelo', { url: caminho.split('?')[0], metodo: String(st.type || 'GET').toUpperCase(), dados: dados.replace(v, '{{termo}}'), aprendidoEm: Date.now() });
        });
      } catch (_) {}
    })();

    // dados da proposta escolhida (sem gravar nada no armazenamento do script)
    async function bsDetalheProposta(proposta) {
      const base = cacBase(), out = { campos: {}, origem: {} };
      const put = (k, v, s) => { if (v) { out.campos[k] = v; out.origem[k] = s; } };
      const cli = await dadosCliente(base, proposta);
      if (cli.ok) {
        put('nome', cli.nome, 'Mesa · aba Cliente'); put('cpf', cli.cpf ? cacCpfFmt(cli.cpf) : '', 'Mesa · aba Cliente');
        put('telefone', cli.telefone, 'Mesa · aba Cliente (Telefone 1/2)'); put('email', cli.email, 'Mesa · aba Cliente');
      } else out.avisoCliente = cli.motivo;
      const docs = [];
      for (const a of DETALHES) {
        const r = await cacReq(a.split('?')[0], { lngProposta: proposta });
        if (r.ok && r.texto) docs.push(cacDoc(r.texto));
      }
      if (docs.length) {
        const vend = docs.map(d => acharRotulo(d, 'Digitador')).find(Boolean);
        put('vendedor', vend ? vend.replace(/^\d+\s+/, '').replace(/\s+-\s+.*$/, '').trim() : '', 'Mesa · detalhe (Digitador)');
        put('valorCompra', dinheiro(primeiroRotulo(docs, ['Valor da Compra'], t => !!dinheiro(t))), 'Mesa · detalhe');
        const ent = primeiroRotulo(docs, ['Valor da Entrada'], t => !!dinheiro(t) || !!pctDe(t));
        if (ent) put('entrada', [dinheiro(ent), pctDe(ent)].filter(Boolean).join(' (') + (pctDe(ent) && dinheiro(ent) ? ')' : ''), 'Mesa · detalhe');
        const imei = primeiroRotulo(docs, ['IMEI'], t => /^\d{14,16}$/.test(t.replace(/\D/g, '')));
        put('imei', imei ? imei.replace(/\D/g, '') : '', 'Mesa · detalhe');
      }
      return out;
    }

    const BS_CAMPOS = [['nome', 'Nome'], ['cpf', 'CPF'], ['proposta', 'Proposta'], ['situacao', 'Situação da proposta'], ['telefone', 'Telefone do cadastro (proposta)'], ['email', 'E-mail'],
      ['valorParcela', 'Valor da parcela'], ['parcelaAtual', 'Parcela atual'], ['totalParcelas', 'Total de parcelas'], ['entrada', 'Entrada'], ['valorCompra', 'Valor da compra'], ['vendedor', 'Vendedor'], ['imei', 'IMEI'], ['loja', 'Loja'],
      ['dataProposta', 'Data da proposta'], ['filial', 'Filial (CAC)'], ['fpd', 'FPD'], ['parcelasAtraso', 'Parcelas em atraso'], ['diasAtraso', 'Dias de atraso'], ['vencMaisAntigo', 'Vencimento mais antigo']];
    function bsMostrar() {
      const st = bsGet(), caixa = $('#mf-bs-res');
      $('#mf-bs-usar').style.display = st && st.cliente ? '' : 'none';
      caixa.innerHTML = '';
      caixa.style.display = st && (st.cliente || st.candidatos) ? '' : 'none';
      if (!st) return;
      if (st.candidatos && !st.cliente) {
        const t = document.createElement('div'); t.className = 'mf-info'; t.textContent = st.candidatos.length + ' resultado(s) — escolha o cliente:'; caixa.appendChild(t);
        st.candidatos.slice(0, 25).forEach((c, i) => {
          const b = document.createElement('button'); b.className = 'cinza mf-bs-cand';
          b.textContent = c.nome + ' · proposta ' + c.proposta + (c.situacao ? ' · ' + c.situacao : '') + (c.data ? ' · ' + c.data : '');
          b.onclick = () => bsEscolher(i);
          caixa.appendChild(b);
        });
        return;
      }
      const c = st.cliente;
      if (!c) return;
      const h = document.createElement('div'); h.className = 'mf-bs-cab';
      h.textContent = (c.campos.nome || 'Cliente') + (c.campos.proposta ? ' · proposta ' + c.campos.proposta : '');
      caixa.appendChild(h);
      BS_CAMPOS.forEach(([k, rot]) => {
        const d = document.createElement('div'); d.className = 'mf-cac-lin';
        const a = document.createElement('span'); a.textContent = rot;
        const b = document.createElement('b'); b.textContent = c.campos[k] || 'Não localizado';
        if (!c.campos[k]) b.style.color = '#94a3b8'; else b.title = 'Origem: ' + (c.origem[k] || '') + ' · ' + c.consultadoEm;
        d.append(a, b); caixa.appendChild(d);
      });
      const i = document.createElement('div'); i.className = 'mf-info'; i.style.marginTop = '4px';
      i.textContent = 'Consultado em ' + c.consultadoEm + '. ' + (c.avisos || []).join(' ');
      caixa.appendChild(i);
    }

    async function bsBuscar(termoBruto) {
      if (bsOcupado || cacOcupado) return;
      if (executando || ccb.rodando) return msg('Há uma coleta ou download em andamento. Aguarde para buscar.');
      if (GM_getValue('trocaConta', null)) return msg('Há uma troca de conta em andamento. Aguarde.');
      const termo = limpoTxt(termoBruto).toUpperCase(), tipo = bsTipo(termo);
      if (!tipo) return msg('Digite o CPF, o nº da proposta ou pelo menos 3 letras do nome.');
      if (!TELAS.mesa.pronta()) {   // a busca usa a Mesa de Crédito: abre a tela pelo menu do sistema, se precisar
        if (bsNavegando) return;
        bsNavegando = true;
        try { if (!(await irParaTela('mesa'))) return; } finally { bsNavegando = false; }
      }
      const busca = tipo === 'cpf' ? termo.replace(/\D/g, '') : termo;
      bsSet({ termo: busca, tipo, quando: Date.now() });   // nova busca: descarta tudo da anterior
      cacSSSet(null);
      bsMostrar();
      bsOcupado = true; $('#mf-bs-buscar').disabled = true;
      try {
        bsStatus('Procurando ' + { cpf: 'o CPF', proposta: 'a proposta', nome: 'o nome' }[tipo] + ' na Mesa de Crédito...');
        let res = await bsMesa(busca), fonte = 'Mesa';
        let cands = res.linhas || [];
        if (tipo === 'proposta') cands = cands.filter(c => c.proposta === busca);
        if (!cands.length && tipo !== 'proposta') {
          bsStatus('Procurando na Fila de Propostas...');
          const f = await bsFila(busca);
          if (f.linhas && f.linhas.length) { cands = f.linhas; fonte = 'Fila'; }
        }
        // sem proposta encontrada: pelo CPF/nome, só o CAC (cadastro e cobrança)
        if (!cands.length) {
          if (tipo === 'proposta') { bsSet(null); bsStatus(''); return msg('Proposta ' + busca + ' não encontrada' + (res.erro ? ' (' + res.erro + ')' : '') + '.'); }
          if (!$('#mf-bs-cac').checked) { bsSet(null); bsStatus(''); return msg('Nenhum cliente encontrado na Mesa' + (GM_getValue('filaReqModelo', null) ? ' nem na Fila' : '') + ' para "' + termoBruto + '".'); }
          bsSet({ termo: busca, tipo, quando: Date.now(), etapa: 'cac', soCac: true, cacDesde: Date.now() });
          bsStatus('Nada na Mesa: consultando o CAC...');
          $('#mf-cac-termo').value = busca;
          await cacConsultar(busca, { origemBusca: true });
          if ($('#mf-cac-escolha').children.length) { mostrarAba('cac'); msg('O CAC achou mais de um cliente: escolha na aba CAC.'); }
          return;
        }
        const unicos = [...new Map(cands.map(c => [c.proposta, c])).values()];
        if (unicos.length === 1 && (tipo === 'proposta' || tipo === 'cpf')) { bsSet({ ...bsGet(), candidatos: unicos }); return bsEscolher(0, true); }
        bsSet({ ...bsGet(), candidatos: unicos, fonte });
        bsStatus('');
        bsMostrar();
      } finally { bsOcupado = false; $('#mf-bs-buscar').disabled = false; }
    }
    async function bsEscolher(i, dentro) {
      const st = bsGet();
      if (!st || !st.candidatos || !st.candidatos[i]) return;
      if (!dentro) { if (bsOcupado) return; bsOcupado = true; }
      const c = st.candidatos[i];
      try {
        bsStatus('Lendo a proposta ' + c.proposta + '...');
        const det = await bsDetalheProposta(c.proposta);
        const cpfDig = (det.campos.cpf || '').replace(/\D/g, '');
        if (st.tipo === 'cpf' && cpfDig && cpfDig !== st.termo) { bsStatus(''); return msg('A proposta ' + c.proposta + ' é de outro CPF. Nada foi preenchido.'); }
        const campos = { ...det.campos, proposta: c.proposta, situacao: c.situacao, loja: c.loja || '', dataProposta: (c.data.match(/\d{2}\/\d{2}\/\d{4}/) || [''])[0] };
        if (!campos.nome) campos.nome = c.nome;
        const origem = { ...det.origem, proposta: c.fonte, situacao: c.fonte, loja: c.fonte, dataProposta: c.fonte };
        if (!det.origem.nome) origem.nome = c.fonte;
        const cliente = { campos, origem, consultadoEm: new Date().toLocaleString('pt-BR'), avisos: det.avisoCliente ? ['Aba Cliente: ' + det.avisoCliente + '.'] : [] };
        bsSet({ ...st, candidatos: null, cliente });
        bsMostrar();
        // cobrança pelo CAC, com o CPF já confirmado
        if ($('#mf-bs-cac').checked && cpfDig) {
          bsSet({ ...bsGet(), etapa: 'cac', cacDesde: Date.now() });
          bsStatus('Consultando a cobrança no CAC...');
          $('#mf-cac-termo').value = cpfDig;
          cacConsultar(cpfDig, { origemBusca: true });
        } else { bsStatus(''); msg('Cliente localizado: ' + (campos.nome || '') + '.'); }
      } finally { if (!dentro) bsOcupado = false; }
    }
    // quando o CAC termina (agora ou depois da troca de conta), junta a cobrança ao cliente atual — só se o CPF bate
    function bsJuntarCac() {
      const st = bsGet(), cs = cacSS();
      if (!st || st.etapa !== 'cac') return;
      if (cs && cs.etapa === 'aviso') { bsSet({ ...st, etapa: '' }); bsStatus(''); return; }
      // o CAC terminou sem resultado (ex.: CPF não encontrado) e não há troca de conta pendente
      if (!cs && !cacOcupado && !GM_getValue('trocaConta', null) && !campoSenha() && Date.now() - (st.cacDesde || 0) > 3000) {
        bsSet({ ...st, etapa: '' }); bsStatus('');
        return msg(st.cliente ? 'Cliente localizado na Mesa; o CAC não trouxe dados de cobrança para este CPF.' : 'Nenhum cliente encontrado.');
      }
      if (!cs || cs.etapa !== 'resultado' || !cs.resultado) return;
      const res = cs.resultado, cpfCac = (res.cliente.cpf || '').replace(/\D/g, '');
      const cliente = st.cliente || { campos: {}, origem: {}, consultadoEm: res.consultadoEm, avisos: [] };
      const cpfCli = (cliente.campos.cpf || '').replace(/\D/g, '') || (st.tipo === 'cpf' ? st.termo : '');
      if (cpfCli && cpfCac && cpfCli !== cpfCac) { bsSet({ ...st, etapa: '' }); bsStatus(''); return msg('O CAC devolveu outro CPF: os dados de cobrança NÃO foram usados.'); }
      const put = (k, v, s) => { if (v && !cliente.campos[k]) { cliente.campos[k] = v; cliente.origem[k] = s; } };
      put('nome', res.cliente.nome, 'CAC'); put('cpf', res.cliente.cpf, 'CAC');
      Object.entries(res.campos).forEach(([k, v]) => put(k, v, 'CAC · ' + (res.origem[k] || '')));
      cliente.avisos = [...(cliente.avisos || []), 'Cobrança: CAC (' + res.consultadoEm + (res.conta ? ', conta ' + res.conta : '') + ').'];
      bsSet({ ...st, etapa: '', cliente });
      bsStatus('');
      bsMostrar();
      msg('Cliente localizado: ' + (cliente.campos.nome || '') + ' (Mesa' + (st.soCac ? '' : ' + CAC') + ').');
    }
    setInterval(bsJuntarCac, 1000);

    /* ---- "Usar cliente atual" nos outros módulos (pergunta antes de trocar o que já foi digitado) ---- */
    function bsPreencher(alvos) {
      const st = bsGet();
      if (!st || !st.cliente) return msg('Busque um cliente antes (campo "Buscar cliente" no topo).');
      const c = st.cliente.campos, conflitos = [], aplicar = [];
      alvos.forEach(([el, v]) => {
        if (!el || !v) return;
        const atual = el.value.trim();
        if (atual && atual !== v) conflitos.push(el); aplicar.push([el, v]);
      });
      if (!aplicar.length) return msg('O cliente atual não tem dados para estes campos.');
      if (conflitos.length && !confirm(conflitos.length + ' campo(s) já preenchido(s) serão substituídos pelos dados do cliente atual. Continuar?')) return;
      aplicar.forEach(([el, v]) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); });
      msg('Dados de ' + (c.nome || 'cliente') + ' aplicados (' + aplicar.length + ' campo(s)).');
    }
    const bsReais = v => { const n = ngCentavos(String(v || '').replace(/\s*\(.*$/, '')); return n == null ? '' : (n / 100).toFixed(2).replace('.', ','); };
    // Atendimento: parcela atual = referência; "a partir da parcela" só é sugerida se estiver vazia. Telefone da proposta NUNCA.
    $('#mf-bs-usar-neg').onclick = atAplicarCliente;
    // CAC: abre a Consulta CAC (Mais) com o CPF do cliente; mostra o resultado que a busca já trouxe ou consulta agora
    $('#mf-bs-usar-cac').onclick = () => {
      const c = (bsGet() || {}).cliente; if (!c) return bsPreencher([]);
      const cpf = String(c.campos.cpf || '').replace(/\D/g, '');
      mostrarAba('cac');
      if (!cpf) return msg('O cliente atual não tem CPF: informe o CPF ou o nome na Consulta CAC.');
      $('#mf-cac-termo').value = cpf;
      const cs = cacSS();
      if (cs && cs.resultado && String(cs.resultado.cliente.cpf || '').replace(/\D/g, '') === cpf) { cacMostrar(cs.resultado); return msg('Consulta CAC do cliente atual (feita em ' + cs.resultado.consultadoEm + ').'); }
      $('#mf-cac-buscar').click();
    };
    $('#mf-bs-usar-lem').onclick = () => {
      const c = (bsGet() || {}).cliente; if (!c) return bsPreencher([]);
      $('#mf-lb-form-grupo').open = true;
      bsPreencher([[$('#mf-lb-cliente'), c.campos.nome], [$('#mf-lb-proposta'), c.campos.proposta]]);
    };

    // campo de busca: botão, Enter, ou pausa na digitação (só CPF completo ou nº de proposta; nome só pelo botão)
    let bsPausa = null;
    $('#mf-bs-termo').addEventListener('input', () => {
      clearTimeout(bsPausa);
      const t = $('#mf-bs-termo').value, tp = bsTipo(t);
      $('#mf-bs-tipo').textContent = tp ? { cpf: 'CPF', proposta: 'Proposta', nome: 'Nome' }[tp] : '';
      if (tp === 'cpf' || (tp === 'proposta' && t.trim().length >= 4)) bsPausa = setTimeout(() => bsBuscar(t), 800);
    });
    $('#mf-bs-termo').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(bsPausa); bsBuscar($('#mf-bs-termo').value); } });
    $('#mf-bs-buscar').onclick = () => { clearTimeout(bsPausa); bsBuscar($('#mf-bs-termo').value); };
    $('#mf-bs-limpar').onclick = () => { bsSet(null); cacSSSet(null); cacMostrar(null); $('#mf-bs-termo').value = ''; $('#mf-bs-tipo').textContent = ''; bsStatus(''); bsMostrar(); msg('Cliente atual limpo.'); };
    $('#mf-bs-cac').checked = GM_getValue('buscaComCac', true);
    $('#mf-bs-cac').addEventListener('change', () => GM_setValue('buscaComCac', $('#mf-bs-cac').checked));
    $('#mf-bs-tit').onclick = () => { const a = $('#mf-bs-corpo').style.display === 'none'; $('#mf-bs-corpo').style.display = a ? '' : 'none'; $('#mf-bs-tit').classList.toggle('aberta', a); GM_setValue('buscaAberta', a); };
    if (!GM_getValue('buscaAberta', true)) { $('#mf-bs-corpo').style.display = 'none'; $('#mf-bs-tit').classList.remove('aberta'); }
    const bsIni = bsGet();
    if (bsIni) { $('#mf-bs-termo').value = bsIni.termo || ''; bsMostrar(); }

    /* ================= NAVEGAÇÃO AUTOMÁTICA =================
       Quando a função precisa de uma tela do sistema que não está aberta, o script faz o que o item do menu do PRÓPRIO
       sistema faz (MostraConsulta('MesaCredito') / ('FilaPropostas'), que troca a tela sem recarregar a página) e espera
       a tela ficar pronta. Só quando o item existe no menu desta conta. Sem o item no menu (conta sem acesso) ou na tela de login, nada
       é feito e a mensagem explica. Desligável em Configurações > Painel, navegação e diagnóstico. */
    ligarOpcao('#mf-nav-auto', 'navAuto');
    ligarOpcao('#mf-mesa-hoje', 'mesaHoje');

    /* ================= MESA DE CRÉDITO: DATAS DO DIA =================
       Ao abrir a Mesa (pelo menu ou pelo painel), o sistema traz as datas padrão dele (ex.: dois dias para trás). O painel
       põe as datas do dia nos campos do próprio filtro (#txtDataInicial / #txtDataFinal, na janela de filtros) e refiltra
       como o botão "Filtrar" (waitingDialog.show() + objMesaCredito.MesaCredito()). Se o funcionário mudar as datas, elas
       ficam guardadas para o mesmo dia (GM 'mesaDatas' = { dia, ini, fim }); no dia seguinte volta para hoje.
       Cada abertura da Mesa recria os campos: o painel aplica uma vez por campo novo. Enquanto refiltra, a tela da Mesa
       não conta como pronta (as funções que leem a lista esperam a lista nova). Desligável em Configurações. */
    const mesaHojeBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const mesaVistos = new WeakSet();
    function mesaDatasDoDia() {
      const h = mesaHojeBR(), s = GM_getValue('mesaDatas', null);
      return s && s.dia === h && s.ini && s.fim ? { ini: s.ini, fim: s.fim } : { ini: h, fim: h };
    }
    const mesaAjaxLivre = async () => {
      const ate = Date.now() + CONFIG.MESA_HOJE_ESPERA_MS;
      while (Date.now() < ate) { let n = 0; try { n = PAGINA.jQuery ? PAGINA.jQuery.active : 0; } catch (_) {} if (!n) return; await sleep(200); }
    };
    async function mesaAplicarDatas() {
      const di = document.querySelector('#txtDataInicial'), df = document.querySelector('#txtDataFinal');
      if (!di || !df || mesaVistos.has(di) || painel.contains(di) || !document.querySelector('#divMesaCredito')) return;
      mesaVistos.add(di);
      // mudança feita pelo funcionário (não pelo painel) = escolha do dia
      const guardar = () => { if (!mesaFiltrando) GM_setValue('mesaDatas', { dia: mesaHojeBR(), ini: di.value.trim(), fim: df.value.trim() }); };
      [di, df].forEach(x => { x.addEventListener('change', guardar); x.addEventListener('input', guardar); });
      if (!cfg('mesaHoje')) return;
      const alvo = mesaDatasDoDia();
      if (di.value.trim() === alvo.ini && df.value.trim() === alvo.fim) return;
      mesaFiltrando = true;
      try {
        await sleep(300); await mesaAjaxLivre();   // a lista padrão termina de carregar antes (sem duas respostas disputando a tela)
        if (!di.isConnected) return;
        di.value = alvo.ini; df.value = alvo.fim;
        const o = PAGINA.objMesaCredito;
        if (!o || typeof o.MesaCredito !== 'function') return;
        try { if (PAGINA.waitingDialog) PAGINA.waitingDialog.show(); } catch (_) {}
        o.MesaCredito();
        await sleep(300); await mesaAjaxLivre();
        const ok = alvo.ini === alvo.fim && alvo.ini === mesaHojeBR();
        msg('Mesa de Crédito filtrada ' + (ok ? 'no dia de hoje (' + alvo.ini + ').' : 'de ' + alvo.ini + ' a ' + alvo.fim + ' (as datas que você escolheu hoje).'));
      } catch (_) {} finally { mesaFiltrando = false; }
    }
    setInterval(() => { mesaAplicarDatas(); }, CONFIG.MESA_HOJE_CONFERE_MS);
    const exigirTela = (sel, t) => {
      const el = $(sel), orig = el.onclick;
      el.onclick = async e => { if (TELAS[t].pronta() || await irParaTela(t)) return orig.call(el, e); };
    };
    exigirTela('#mf-tela', 'mesa');
    exigirTela('#mf-ini', 'mesa');
    exigirTela('#mf-ccb-ler', 'fila');
    exigirTela('#mf-ccb-baixar', 'fila');

    // ao recarregar a página, restaura a fila salva (permite continuar depois de fechar/recarregar)
    if (fila().length) $('#mf-lista').value = fila().join('\n');
    atualizarUI();
  }

  /* ================= RD ATENDIMENTO: ENCERRAMENTO COM IA (app.tallos.com.br) =================
     Encerra os atendimentos vencidos da lista "Meus atendimentos": com cadeado ("Janela de 24 horas fechada") e, se
     ligado, os sem cadeado parados há mais de CONFIG.RD_HORAS_JANELA (pela data da última mensagem na lista).
     Duas etapas, sempre nesta ordem:
       1) Analisar: abre cada conversa com cadeado, lê as mensagens (sem enviar nada ao cliente), tira CPF, telefone e
          e-mail do texto e pede ao Gemini a tabulação (SÓ as categorias PaymobiFin de RD_CATEGORIAS) e os campos da
          planilha de encerramento. Nada é encerrado nesta etapa.
       2) Encerrar: depois de o funcionário revisar (e poder trocar a categoria), encerra os marcados pelo fluxo da
          própria tela (Encerrar > categoria > Encerrar) e guarda a linha da planilha (A–M) para copiar.
     Chave do Gemini: só neste navegador (GM 'geminiChave'), nunca no código. Modelo: escolhido sozinho entre os
     "flash" disponíveis para a chave a cada vez que a página abre (sempre automático; não há campo de modelo).
     */
  const RD_CATEGORIAS = [
    'PaymobiFin - Alteração Data de Vencimento de Parcela', 'PaymobiFin - Antecipação de parcela', 'PaymobiFin - Cancelamento',
    'PaymobiFin - Desbloqueio do aparelho por pagamento', 'PaymobiFin - Dúvidas e esclarecimentos', 'PaymobiFin - Encaminhado para Loja',
    'PaymobiFin - Encerrado por Inatividade', 'PaymobiFin - Informações de Pagamento', 'PaymobiFin - Migração de Boleto Bradesco',
    'PaymobiFin - Negociação de parcela/contrato', 'PaymobiFin - Pagamentos', 'PaymobiFin - Quitação de Contrato',
    'PaymobiFin - Reversão de Parcela', 'PaymobiFin - Roubo', 'PaymobiFin - Segunda via de boleto', 'PaymobiFin - Segunda via de contrato',
    'PaymobiFin - Solicitação Indevida', 'Paymobifin - venda realizada com erro de loja',
  ];   // "PaymobiFin - Teste" fica de fora de propósito
  const RD_CADEADO = 'Janela de 24 horas fechada';
  const RD_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function iniciarRD() {
    if (document.getElementById('mf-rd')) return;
    const rdNorm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const rdHoje = () => new Date().toLocaleDateString('pt-BR');
    let rdParar = false, rdRodando = false;
    // análises pelo botão "Analisar (IA)" rodam em segundo plano e podem ser várias ao mesmo tempo (uma por conversa);
    // só a leitura da conversa é uma por vez (rdLendo). rdRodando continua sendo a análise das vencidas e o encerramento.
    let rdAbertas = 0, rdLendo = false;
    const emAnalise = new Set();

    /* ---- segundo plano: a automação não fica lenta com a aba do RD escondida ----
       Com a aba escondida, o Chrome segura os temporizadores da PÁGINA (1 s no mínimo; depois de ~5 min, um por minuto) e
       pode congelar a aba. As esperas do nosso código já usam o sleep do Web Worker, mas a tela do RD (janela de encerrar,
       lista de categorias, carregamento da conversa) usa os temporizadores da página, e é isso que atrasava o encerramento.
       Enquanto a nossa automação roda (rdRodando ou rdAbertas) E a aba está escondida, os setTimeout/setInterval/
       requestAnimationFrame da página passam a ser contados por um Web Worker (não é segurado). Fora disso a página usa os
       temporizadores normais dela: nada muda no uso comum do RD. Os ids dos temporizadores do worker começam em 1e9 (os do
       navegador são bem menores), então clearTimeout/clearInterval sabem de quem é cada um.
       A troca é feita na própria página (script injetado: o RD não restringe scripts) e ligada pelo atributo
       data-mf-segundo-plano no <html>. Enquanto roda, o painel também segura um Web Lock, que impede o Chrome de congelar a aba. */
    function rdTemporizadoresDaPagina() {
      if (window.__mfTemporizadores) return;
      window.__mfTemporizadores = true;
      const nat = { st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window), si: window.setInterval.bind(window), ci: window.clearInterval.bind(window),
        raf: window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null, caf: window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null };
      let w = null;
      try {
        w = new Worker(URL.createObjectURL(new Blob(['const t={};onmessage=e=>{const d=e.data;if(d.c==="s"){t[d.i]=(d.r?setInterval:setTimeout)(()=>{postMessage(d.i);if(!d.r)delete t[d.i]},d.ms)}else{clearTimeout(t[d.i]);clearInterval(t[d.i]);delete t[d.i]}}'])));
      } catch (_) { return; }
      const BASE = 1e9, cbs = new Map();
      let n = BASE;
      const ativo = () => document.hidden && document.documentElement.getAttribute('data-mf-segundo-plano') === '1';
      w.onmessage = e => {
        const x = cbs.get(e.data);
        if (!x) return;
        if (!x.r) cbs.delete(e.data);
        try { if (typeof x.f === 'function') x.f.apply(window, x.a); else (0, eval)(String(x.f)); } catch (err) { nat.st(() => { throw err; }, 0); }
      };
      const criar = r => function (f, ms, ...a) {
        if (!ativo()) return (r ? nat.si : nat.st)(f, ms, ...a);
        const i = ++n;
        cbs.set(i, { f, a, r });
        w.postMessage({ c: 's', i, ms: Math.max(0, Number(ms) || 0), r });
        return i;
      };
      const limpar = nativo => function (i) {
        if (typeof i === 'number' && i > BASE) { cbs.delete(i); w.postMessage({ c: 'x', i }); return; }
        return nativo(i);
      };
      window.setTimeout = criar(false); window.setInterval = criar(true);
      window.clearTimeout = limpar(nat.ct); window.clearInterval = limpar(nat.ci);
      if (nat.raf) {
        window.requestAnimationFrame = function (f) { return ativo() ? window.setTimeout(() => f(performance.now()), 16) : nat.raf(f); };
        window.cancelAnimationFrame = function (i) { return typeof i === 'number' && i > BASE ? window.clearTimeout(i) : nat.caf(i); };
      }
    }
    try {
      const sc = document.createElement('script');
      sc.textContent = '(' + rdTemporizadoresDaPagina.toString() + ')();';
      (document.head || document.documentElement).appendChild(sc); sc.remove();
    } catch (_) {}
    // liga/desliga conforme a automação (chamado pelo status(), no fim de cada análise/encerramento e periodicamente)
    let rdTrava = null, rdTravaPedida = false;   // rdTrava = função que solta o Web Lock (nome próprio desta aba)
    const rdTravaNome = 'paymobifin-rd-' + Math.random().toString(36).slice(2, 8);
    const rdMarcarSegundoPlano = () => {
      const roda = !!(rdRodando || rdAbertas);
      const html = document.documentElement;
      if (roda !== (html.getAttribute('data-mf-segundo-plano') === '1')) html.setAttribute('data-mf-segundo-plano', roda ? '1' : '0');
      try {
        if (roda && !rdTravaPedida && navigator.locks) {
          rdTravaPedida = true;
          navigator.locks.request(rdTravaNome, () => new Promise(solta => {
            rdTrava = solta;
            if (!(rdRodando || rdAbertas)) { solta(); rdTrava = null; rdTravaPedida = false; }   // já terminou enquanto pedia
          })).catch(() => { rdTravaPedida = false; });
        }
        if (!roda && rdTrava) { rdTrava(); rdTrava = null; rdTravaPedida = false; }
      } catch (_) {}
    };

    /* ---- interface (estilos pelo CSSOM: não depende de <style> liberado pelo site) ----
       Tema claro/escuro só do painel (o RD não muda): cada elemento fixo guarda a função que monta o estilo a partir das
       cores do tema (estilo()); trocar o tema reaplica tudo (repintar) e redesenha a lista. Preferência em GM 'rdTema'. */
    const el = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
    const RD_TEMAS = {
      claro: { fundo: '#f4f6fa', sup: '#ffffff', sup2: '#f8fafc', borda: '#e4e9f0', borda2: '#d3dbe6', txt: '#0f172a', txt2: '#334155', txt3: '#64748b', campo: '#ffffff',
        pri: '#2563eb', priHover: '#1d4ed8', priSuave: '#eff6ff', priBorda: '#bfdbfe', priTxt: '#1d4ed8', ok: '#16a34a', okTxt: '#15803d', okSuave: '#f0fdf4', okBorda: '#bbf7d0',
        alerta: '#d97706', alertaTxt: '#92400e', alertaSuave: '#fffbeb', alertaBorda: '#fde68a', perigo: '#dc2626', perigoHover: '#b91c1c', perigoTxt: '#b91c1c', perigoSuave: '#fef2f2', perigoBorda: '#fecaca',
        topo: 'linear-gradient(180deg,#1e293b,#0f172a)', topoIcone: '#cbd5e1', sombra: '0 24px 48px -16px rgba(15,23,42,.35),0 4px 12px rgba(15,23,42,.08)', sombraBt: '0 1px 2px rgba(15,23,42,.06)' },
      escuro: { fundo: '#0b1220', sup: '#111c33', sup2: '#16223b', borda: '#263349', borda2: '#334155', txt: '#e2e8f0', txt2: '#cbd5e1', txt3: '#94a3b8', campo: '#0f1a2e',
        pri: '#3b82f6', priHover: '#2563eb', priSuave: '#172554', priBorda: '#1e3a8a', priTxt: '#93c5fd', ok: '#22c55e', okTxt: '#4ade80', okSuave: '#052e16', okBorda: '#166534',
        alerta: '#f59e0b', alertaTxt: '#fbbf24', alertaSuave: '#2a1f0a', alertaBorda: '#78350f', perigo: '#ef4444', perigoHover: '#dc2626', perigoTxt: '#fca5a5', perigoSuave: '#2a1215', perigoBorda: '#7f1d1d',
        topo: 'linear-gradient(180deg,#111c33,#0b1220)', topoIcone: '#94a3b8', sombra: '0 24px 48px -16px rgba(0,0,0,.75),0 4px 12px rgba(0,0,0,.35)', sombraBt: 'none' },
    };
    let rdTema = GM_getValue('rdTema', 'claro') === 'escuro' ? 'escuro' : 'claro';
    const C = () => RD_TEMAS[rdTema];
    const FONTE = 'system-ui,"Segoe UI",Roboto,Arial,sans-serif';
    const TRANS = 'transition:background-color .2s,color .2s,border-color .2s,box-shadow .2s';
    const fixos = [];
    // estilo de um elemento fixo do painel (reaplicado ao trocar de tema; o display de mostrar/esconder é preservado)
    const estilo = (e, f) => { fixos.push([e, f]); e.style.cssText = f(C()); return e; };
    const hover = (e, f) => { e.addEventListener('mouseenter', () => { if (!e.disabled) Object.assign(e.style, f(C())); }); e.addEventListener('mouseleave', () => { const d = e.style.display; e.style.cssText = (e._mfCss || (() => ''))(C()); e.style.display = d; }); return e; };
    // botões: principal (azul), perigo (vermelho), secundário (contorno), pequeno (ações auxiliares)
    const btCss = (tipo, extra) => c => {
      const base = 'box-sizing:border-box;border-radius:8px;padding:8px 10px;font:600 12.5px/1.2 ' + FONTE + ';cursor:pointer;white-space:nowrap;' + TRANS + ';';
      const t = { pri: 'border:1px solid ' + c.pri + ';background:' + c.pri + ';color:#fff;box-shadow:' + c.sombraBt,
        perigo: 'border:1px solid ' + c.perigo + ';background:' + c.perigo + ';color:#fff;box-shadow:' + c.sombraBt,
        sec: 'border:1px solid ' + c.borda2 + ';background:' + c.sup + ';color:' + c.txt + ';box-shadow:' + c.sombraBt,
        mini: 'border:1px solid ' + c.borda2 + ';background:' + c.sup + ';color:' + c.txt2 + ';padding:6px 10px;font-size:12px',
        miniPerigo: 'border:1px solid ' + c.borda2 + ';background:' + c.sup + ';color:' + c.perigoTxt + ';padding:6px 10px;font-size:12px' }[tipo];
      return base + t + (extra ? ';' + extra : '');
    };
    const botao = (tipo, txt, extra) => {
      const b = el('button', null, txt); const f = btCss(tipo, extra); b._mfCss = f; estilo(b, f);
      const sobre = { pri: c => ({ background: c.priHover, borderColor: c.priHover }), perigo: c => ({ background: c.perigoHover, borderColor: c.perigoHover }),
        sec: c => ({ background: c.sup2, borderColor: c.txt3 }), mini: c => ({ background: c.sup2, color: c.txt }), miniPerigo: c => ({ background: c.perigoSuave, borderColor: c.perigoBorda }) }[tipo];
      return hover(b, sobre);
    };
    const raiz = el('div', 'position:fixed;left:84px;bottom:16px;z-index:2147483646;font:13px/1.45 ' + FONTE + ';color:#0f172a');
    raiz.id = 'mf-rd';
    const abrir = el('button', null, '🔒 Encerrar com IA');
    abrir._mfCss = c => btCss('pri', 'box-shadow:0 6px 18px rgba(15,23,42,.25);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')(c);
    estilo(abrir, abrir._mfCss); hover(abrir, c => ({ background: c.priHover, borderColor: c.priHover }));
    const ROTULO_ABRIR = '🔒 Encerrar com IA', TITULO_ABRIR = 'PaymobiFin: encerrar os atendimentos vencidos (clique para abrir o painel)';
    abrir.title = TITULO_ABRIR;
    const card = estilo(el('div'), c => 'display:none;width:560px;max-width:calc(100vw - 100px);max-height:calc(100vh - 40px);overflow:auto;background:' + c.fundo + ';border:1px solid ' + c.borda + ';border-radius:14px;box-shadow:' + c.sombra + ';color:' + c.txt + ';color-scheme:' + (rdTema === 'escuro' ? 'dark' : 'light') + ';' + TRANS);
    const topo = estilo(el('div'), c => 'display:flex;align-items:center;gap:6px;padding:9px 10px 9px 14px;background:' + c.topo + ';color:#f8fafc;border-radius:13px 13px 0 0;position:sticky;top:0;z-index:2');
    const titulo = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.2');
    titulo.append(el('b', 'font-size:13.5px;font-weight:650;letter-spacing:-.005em', 'PaymobiFin · Encerramento com IA'), el('span', 'font-size:11px;color:#94a3b8;font-weight:500', 'RD Atendimento · tabulação e planilha'));
    topo.append(titulo);
    // botões de ícone do topo (28×28, ícone desenhado em SVG)
    const SVG = 'http://www.w3.org/2000/svg';
    const icone = desenho => { const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
      desenho.forEach(([t, a]) => { const n = document.createElementNS(SVG, t); Object.entries(a).forEach(([k, v]) => n.setAttribute(k, v)); s.appendChild(n); }); return s; };
    const ICONE_SOL = [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' }]];
    const ICONE_LUA = [['path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }]];
    const ICONE_X = [['path', { d: 'M18 6 6 18M6 6l12 12' }]];
    const btTopo = (desenho, dica) => {
      const b = el('button'); b.title = dica; b.setAttribute('aria-label', dica); b.appendChild(icone(desenho));
      b._mfCss = c => 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:' + c.topoIcone + ';cursor:pointer;flex:none;' + TRANS;
      estilo(b, b._mfCss); return hover(b, () => ({ background: 'rgba(255,255,255,.1)', color: '#f8fafc' }));
    };
    // tema: sol = modo claro, lua = modo escuro (o ícone mostra o modo atual; o clique troca)
    const btTema = btTopo(ICONE_SOL, '');
    const pintarBotaoTema = () => {
      btTema.replaceChildren(icone(rdTema === 'escuro' ? ICONE_LUA : ICONE_SOL));
      btTema.title = rdTema === 'escuro' ? 'Modo escuro (clique para o modo claro)' : 'Modo claro (clique para o modo escuro)';
      btTema.setAttribute('aria-label', btTema.title);
    };
    // fechar só esconde o painel no botão do canto: a análise e o encerramento continuam (só o botão Parar interrompe).
    // (havia também um "minimizar", que fazia exatamente o mesmo; ficou só o fechar)
    const fechar = btTopo(ICONE_X, 'Fechar (a automação continua; o andamento aparece no botão do canto)');
    topo.append(btTema, fechar);
    const corpo = estilo(el('div'), c => 'padding:12px;display:flex;flex-direction:column;gap:10px;background:' + c.fundo + ';' + TRANS);
    card.append(topo, corpo);
    raiz.append(card, abrir);
    document.body.appendChild(raiz);
    // reabrir no meio da automação não troca o andamento pela contagem da lista
    const abrirPainel = manter => {
      card.style.display = 'block'; abrir.style.display = 'none'; pintarCfg(); pintarCopiar();
      // em andamento ou com resultado ainda não visto: mantém o texto; senão mostra a contagem da lista
      if (manter || rdRodando || rdAbertas || /^(Análise|Encerrados|Parei)/.test(st.textContent)) desenhar(); else rdContar();
      abrir.textContent = ROTULO_ABRIR; abrir.title = TITULO_ABRIR;
    };
    abrir.onclick = () => abrirPainel(false);
    const recolher = () => {
      card.style.display = 'none'; abrir.style.display = '';
      const t = (st && st.textContent) || '';
      abrir.textContent = (rdRodando || rdAbertas) && t ? '🔒 ' + t.split('\n')[0] : ROTULO_ABRIR;
      abrir.title = (rdRodando || rdAbertas) && t ? t + '\n\n(clique para abrir o painel; a automação continua)' : TITULO_ABRIR;
    };
    fechar.onclick = recolher;
    // superfície (cartão) do painel: blocos de configuração, ações e cada conversa
    const supCss = (extra) => c => 'background:' + c.sup + ';border:1px solid ' + c.borda + ';border-radius:12px;' + TRANS + (extra ? ';' + extra : '');

    // configuração: só a chave do Gemini (o modelo é sempre escolhido sozinho, ver modeloGemini)
    const cfgBox = estilo(el('details'), supCss('padding:0 12px'));
    const cfgSum = estilo(el('summary'), c => 'cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 0;font-weight:650;font-size:13px;color:' + c.txt);
    const cfgSeta = el('span', 'display:inline-block;transition:transform .18s;font-size:11px', '▸');
    const cfgChip = el('span');
    cfgSum.append(cfgSeta, el('span', 'flex:1', 'Configuração do Gemini'), cfgChip);
    cfgBox.appendChild(cfgSum);
    cfgBox.addEventListener('toggle', () => { cfgSeta.style.transform = cfgBox.open ? 'rotate(90deg)' : ''; });
    const cfgCorpo = el('div', 'padding:0 0 12px');
    const rotChave = estilo(el('label', null, 'Chave da API do Gemini'), c => 'display:block;font-size:12px;font-weight:600;color:' + c.txt2 + ';margin-bottom:5px');
    const chave = estilo(el('input'), c => 'flex:1;min-width:0;box-sizing:border-box;padding:8px 10px;border:1px solid ' + c.borda2 + ';border-radius:8px;background:' + c.campo + ';color:' + c.txt + ';font:13px ' + FONTE + ';outline:none;' + TRANS);
    chave.type = 'password'; chave.placeholder = 'Chave da API do Gemini (Google AI Studio)'; chave.autocomplete = 'new-password';
    chave.addEventListener('focus', () => { chave.style.borderColor = C().pri; chave.style.boxShadow = '0 0 0 3px ' + (rdTema === 'escuro' ? 'rgba(59,130,246,.35)' : 'rgba(37,99,235,.18)'); });
    chave.addEventListener('blur', () => { chave.style.borderColor = C().borda2; chave.style.boxShadow = 'none'; });
    const salvar = botao('sec', 'Salvar');
    const linhaChave = el('div', 'display:flex;gap:6px;align-items:center');
    linhaChave.append(chave, salvar);
    const aviso = estilo(el('div', null, 'A chave fica só neste navegador (armazenamento do Tampermonkey, sem criptografia); nunca vai para o código, o GitHub ou outros funcionários. O modelo do Gemini é escolhido sozinho (e trocado quando um não responde ou fica sem cota). O texto das conversas vai para o Google sem CPF, telefone e e-mail; no plano grátis o Google pode usar esse texto para melhorar os produtos dele.'),
      c => 'font-size:11.5px;line-height:1.5;color:' + c.txt3 + ';margin-top:8px');
    const chaveInfo = el('div', 'font-size:12px;margin-top:6px;font-weight:600');
    cfgCorpo.append(rotChave, linhaChave, chaveInfo, aviso);
    cfgBox.append(cfgCorpo);
    // modelo: sempre automático (escolhido nesta página). Modelo salvo por versões anteriores (13.4–13.10) é descartado.
    let modeloAuto = '';
    GM_deleteValue('geminiModelo'); GM_deleteValue('geminiModeloManual');
    GM_deleteValue('rdEscurecerPagina');   // opção de escurecer a página do RD (13.23–13.24), que saiu: limpa o que ficou salvo
    // A chave é salva ao colar/digitar (ao sair do campo ou com Enter), sem depender do botão Salvar.
    // Só esta parte mexe na configuração: limpar a lista ou recontar os atendimentos nunca apaga nem esconde a chave.
    const chipCss = (cor, fundo, borda) => 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:650;white-space:nowrap;color:' + cor + ';background:' + fundo + ';border:1px solid ' + borda;
    const pintarChave = () => {
      const k = GM_getValue('geminiChave', ''), c = C();
      if (document.activeElement !== chave) chave.value = k ? '••••••••' : '';
      chaveInfo.textContent = k ? 'Chave salva ✓ (termina em …' + k.slice(-4) + ')' : 'Nenhuma chave salva: cole a chave da API do Gemini acima.';
      chaveInfo.style.color = k ? c.okTxt : c.alertaTxt;
      // o mesmo estado no título (dá para ver sem abrir a configuração)
      cfgChip.textContent = k ? '● Chave salva · …' + k.slice(-4) : '● Sem chave';
      cfgChip.style.cssText = k ? chipCss(c.okTxt, c.okSuave, c.okBorda) : chipCss(c.alertaTxt, c.alertaSuave, c.alertaBorda);
    };
    const salvarChave = () => { const k = chave.value.trim(); if (k && k !== '••••••••') GM_setValue('geminiChave', k); chave.blur(); pintarChave(); };
    let cfgPintada = false;
    const pintarCfg = () => { pintarChave(); if (!cfgPintada) cfgBox.open = !GM_getValue('geminiChave', ''); cfgPintada = true; };
    chave.addEventListener('focus', () => { if (chave.value === '••••••••') chave.value = ''; });
    chave.addEventListener('change', salvarChave);
    chave.addEventListener('blur', () => { if (!chave.value.trim()) pintarChave(); });   // saiu sem digitar: a chave salva continua lá
    chave.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salvarChave(); } });
    salvar.onclick = () => {
      salvarChave();
      status(GM_getValue('geminiChave', '') ? 'Chave salva.' : 'Informe a chave do Gemini.');
    };

    const st = estilo(el('div'), c => 'padding:9px 12px;background:' + c.priSuave + ';border:1px solid ' + c.priBorda + ';border-radius:10px;font-size:12.5px;line-height:1.5;color:' + c.txt + ';white-space:pre-wrap;' + TRANS);
    // com o painel recolhido, o andamento aparece no botão do canto (e o texto completo ao passar o mouse)
    const status = t => {
      rdMarcarSegundoPlano();
      st.textContent = t;
      if (card.style.display === 'none' && (rdRodando || rdAbertas || /^(Análise|Encerrados|Parei)/.test(t))) {
        abrir.textContent = '🔒 ' + String(t).split('\n')[0];
        abrir.title = t + '\n\n(clique para abrir o painel' + (rdRodando || rdAbertas ? '; a automação continua)' : ')');
      }
    };
    // ações: as principais (analisar, analisar a aberta, encerrar) em cima; as auxiliares (copiar, parar, limpar) embaixo
    const acoes = estilo(el('div'), supCss('padding:10px 12px;display:flex;flex-direction:column;gap:9px'));
    // etapa 1 (analisar) lado a lado; etapa 2 (encerrar) embaixo, na largura toda, em vermelho
    const linhaPrincipal = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px');
    const btAnalisar = botao('pri', '1. Analisar conversas vencidas', 'width:100%');
    const btAberta = botao('sec', '+ Analisar a conversa aberta', 'width:100%');
    btAberta.title = 'Para encerrar antes das 24 h um atendimento já resolvido: abra a conversa no RD e clique aqui (entra na lista abaixo para revisar e encerrar)';
    const btEncerrar = botao('perigo', '2. Encerrar marcados', 'grid-column:1/-1;width:100%;padding:9px 12px;font-size:13px');
    btEncerrar.title = 'Encerra no RD as conversas marcadas, uma a uma, com a categoria escolhida (pede confirmação antes)';
    linhaPrincipal.append(btAnalisar, btAberta, btEncerrar);
    // incluir as conversas SEM cadeado que estão paradas há mais de RD_HORAS_JANELA (ligado por padrão)
    const opParadas = estilo(el('label'), c => 'display:flex;align-items:center;gap:7px;font-size:12px;color:' + c.txt2 + ';cursor:pointer');
    const chkParadas = el('input'); chkParadas.type = 'checkbox'; chkParadas.checked = GM_getValue('rdIncluirParadas', true);
    chkParadas.onchange = () => { GM_setValue('rdIncluirParadas', chkParadas.checked); rdContar(); };
    opParadas.append(chkParadas, el('span', '', 'Incluir conversas sem cadeado paradas há mais de ' + CONFIG.RD_HORAS_JANELA + ' h (pela data da última mensagem na lista)'));
    const linhaAux = estilo(el('div'), c => 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding-top:9px;border-top:1px solid ' + c.borda);
    const btCopiar = botao('mini', 'Copiar linhas da planilha');
    btCopiar.title = 'Copia as linhas (colunas A a M) dos atendimentos encerrados hoje que ainda não foram copiados';
    const btParar = botao('mini', 'Parar');
    btParar.title = 'Para a análise ou o encerramento depois da conversa atual';
    const btLimpar = botao('miniPerigo', 'Limpar lista', 'margin-left:auto');
    btLimpar.title = 'Apaga a lista de conversas analisadas hoje e as linhas da planilha (pede confirmação)';
    linhaAux.append(btCopiar, btParar, btLimpar);
    acoes.append(linhaPrincipal, opParadas, linhaAux);
    // lista: título com os contadores do dia e os cartões das conversas
    const cabLista = el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 2px 0');
    const tabela = el('div', 'display:flex;flex-direction:column;gap:8px');
    corpo.append(cfgBox, st, acoes, cabLista, tabela);
    // troca de tema (só o painel): reaplica as cores de todos os elementos e redesenha a lista
    const repintar = () => {
      fixos.forEach(([e, f]) => { const d = e.style.display; e.style.cssText = f(C()); if (d) e.style.display = d; });
      pintarBotaoTema(); pintarChave(); desenhar();
    };
    btTema.onclick = () => { rdTema = rdTema === 'escuro' ? 'claro' : 'escuro'; GM_setValue('rdTema', rdTema); repintar(); };
    pintarBotaoTema();

    /* ---- dados guardados (sobrevivem a recarregar a página; ficam só os de hoje) ---- */
    const analises = () => { const a = GM_getValue('rdAnalises', null); return a && a.dia === rdHoje() ? a.itens : []; };
    // a 13.8 gravava a falha ao encerrar como erro da análise ("Não encerrado: ..."): volta a ser analisada e marcada
    try {
      const a = GM_getValue('rdAnalises', null);
      if (a && a.itens && a.itens.some(x => /^Não encerrado: /.test(x.erro || '') && x.tabulacao)) {
        a.itens.forEach(x => { if (/^Não encerrado: /.test(x.erro || '') && x.tabulacao) { x.erroEncerrar = x.erro.replace(/^Não encerrado: /, ''); delete x.erro; x.marcado = true; } });
        GM_setValue('rdAnalises', a);
      }
    } catch (_) {}
    const guardarAnalises = itens => GM_setValue('rdAnalises', { dia: rdHoje(), itens });
    // linhas da planilha dos encerrados do dia: { cols: [A..M], copiada }. "Copiar" leva só as ainda não copiadas
    // (antes copiava todas a cada clique e repetia na planilha). Linhas no formato antigo (só a lista de colunas) contam
    // como já copiadas.
    const linhasHoje = () => {
      const l = GM_getValue('rdLinhas', null);
      return l && l.dia === rdHoje() ? (l.linhas || []).map(x => (Array.isArray(x) ? { cols: x, copiada: true } : x)) : [];
    };
    const gravarLinhas = linhas => GM_setValue('rdLinhas', { dia: rdHoje(), linhas });
    const guardarLinha = cols => gravarLinhas([...linhasHoje(), { cols, copiada: false }]);
    const pintarCopiar = () => { const n = linhasHoje().filter(x => !x.copiada).length; btCopiar.textContent = 'Copiar linhas da planilha' + (n ? ' (' + n + (n === 1 ? ' nova)' : ' novas)') : ''); };

    // avisos da análise (juntos por " · " em it.aviso) separados e classificados para o cartão. Nada é escondido:
    // cada aviso continua com o texto inteiro, só ganha cor e ordem (divergências primeiro).
    const avisosDe = texto => {
      const partes = [], s = String(texto || '');
      let atual = '', nivel = 0;   // separa no " · " de fora dos parênteses (o diagnóstico do ER tem " · " dentro deles)
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '(') nivel++; else if (ch === ')') nivel = Math.max(0, nivel - 1);
        if (!nivel && s.startsWith(' · ', i)) { partes.push(atual); atual = ''; i += 2; continue; }
        atual += ch;
      }
      if (atual.trim()) partes.push(atual);
      return partes.map(t => t.trim()).filter(Boolean).map(t => ({ texto: t,
        // divergência = identidade (CPF, nome, cliente não confirmado, telefone repetido); proposta diferente da citada = atenção
        tipo: /não consegui confirmar|^CPF d.* é diferente|^o CPF do Perfil|^nome no ER .* é diferente|diferente do cadastro|não bate|é o mesmo de/i.test(t) ? 'divergencia'
          : /^ER: (abra o ER|sessão do ER|o ER não respondeu|resposta do ER sem|a conta )/.test(t) ? 'er'
          : /^ER: \d+ propostas|^ER: não deu pelo|usei a mais recente/.test(t) ? 'info'
          : 'atencao' }))
        .sort((a, b) => ['divergencia', 'er', 'atencao', 'info'].indexOf(a.tipo) - ['divergencia', 'er', 'atencao', 'info'].indexOf(b.tipo));
    };
    const corAviso = (tipo, c) => ({ divergencia: [c.perigoTxt, c.perigoSuave, c.perigoBorda, '⛔', 'Divergência'], er: [c.alertaTxt, c.alertaSuave, c.alertaBorda, '⚠', 'ER'],
      atencao: [c.alertaTxt, c.alertaSuave, c.alertaBorda, '⚠', 'Atenção'], info: [c.txt2, c.sup2, c.borda, 'ℹ', 'Info'] }[tipo]);
    // situação do cartão: o resultado da análise não é autorização para encerrar (quem encerra é o "2. Encerrar marcados")
    // conversa que não estava mais na lista do RD na hora de encerrar (inclui as gravadas antes desta versão só com o aviso)
    const saiuDoRD = it => !it.encerrado && (it.sumiu || /não está mais na lista de atendimentos/.test(it.erroEncerrar || ''));
    const situacaoDe = (it, avs) => {
      if (it.encerrado) return ['ok', 'Encerrado'];
      if (it.erro) return ['perigo', 'Erro na análise'];
      if (saiuDoRD(it)) return ['alerta', 'Saiu da lista do RD'];
      if (it.erroEncerrar) return ['perigo', 'Não encerrado'];
      if (avs.some(a => a.tipo === 'divergencia')) return ['perigo', 'Divergência: revise'];
      if (avs.some(a => a.tipo === 'er' || a.tipo === 'atencao') || !it.erConfirmado) return ['alerta', 'Revise antes de encerrar'];
      return ['ok', 'Analisado · dados conferidos'];
    };
    const corSit = (tipo, c) => ({ ok: [c.okTxt, c.okSuave, c.okBorda], perigo: [c.perigoTxt, c.perigoSuave, c.perigoBorda], alerta: [c.alertaTxt, c.alertaSuave, c.alertaBorda], pri: [c.priTxt, c.priSuave, c.priBorda] }[tipo]);
    const motivoTxt = it => (it.motivo ? (it.motivo === 'cadeado' ? '🔒 cadeado' : /^escolhida/.test(it.motivo) ? '✋ ' + it.motivo : '⏱ ' + it.motivo) : '');

    function desenhar() {
      const c = C();
      tabela.innerHTML = '';
      cabLista.innerHTML = '';
      const itens = analises();
      // título da lista com os números do dia
      const n = { tot: itens.length, marc: itens.filter(x => x.marcado && !x.encerrado && !x.erro).length, enc: itens.filter(x => x.encerrado).length, erro: itens.filter(x => x.erro || (x.erroEncerrar && !x.encerrado)).length };
      cabLista.append(el('span', 'font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:' + c.txt3 + ';margin-right:4px', 'Conversas de hoje'));
      if (n.tot) {
        cabLista.append(el('span', chipCss(c.txt2, c.sup, c.borda2), n.tot + ' analisada' + (n.tot > 1 ? 's' : '')), el('span', chipCss(c.priTxt, c.priSuave, c.priBorda), n.marc + ' marcada' + (n.marc === 1 ? '' : 's')));
        if (n.enc) cabLista.append(el('span', chipCss(c.okTxt, c.okSuave, c.okBorda), n.enc + ' encerrada' + (n.enc > 1 ? 's' : '')));
        if (n.erro) cabLista.append(el('span', chipCss(c.perigoTxt, c.perigoSuave, c.perigoBorda), n.erro + ' com erro'));
      }
      if (!itens.length) { tabela.append(el('div', 'font-size:12px;color:' + c.txt3 + ';padding:14px;text-align:center;border:1px dashed ' + c.borda2 + ';border-radius:12px', 'Nenhuma conversa analisada hoje. Clique em "1. Analisar".')); return; }
      const rot = t => el('span', 'flex:none;width:84px;font-size:11px;font-weight:650;text-transform:uppercase;letter-spacing:.03em;color:' + c.txt3 + ';padding-top:1px', t);
      const linhaInfo = (titulo, valor) => { const d = el('div', 'display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.45;color:' + c.txt); d.append(rot(titulo), el('span', 'flex:1;min-width:0;word-break:break-word', valor)); return d; };
      const campoCss = 'box-sizing:border-box;padding:7px 9px;border:1px solid ' + c.borda2 + ';border-radius:8px;background:' + c.campo + ';color:' + c.txt + ';font:12.5px ' + FONTE;
      itens.forEach((it, i) => {
        const avs = avisosDe(it.aviso);
        const [sitTipo, sitTxt] = situacaoDe(it, avs);
        const [sc, sf, sb] = corSit(sitTipo, c);
        const lin = el('div', 'background:' + c.sup + ';border:1px solid ' + c.borda + ';border-left:3px solid ' + sc + ';border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;' + TRANS + (it.encerrado ? ';opacity:.82' : ''));
        // cabeçalho: seleção, nome e telefone; à direita o motivo (cadeado, parada, escolhida) e a situação
        const cab = el('div', 'display:flex;align-items:flex-start;gap:9px');
        const marca = el('input', 'margin:3px 0 0;width:15px;height:15px;flex:none;accent-color:' + c.pri + ';cursor:pointer'); marca.type = 'checkbox'; marca.checked = !!it.marcado && !it.encerrado && !it.erro; marca.disabled = !!it.encerrado || !!it.erro;
        marca.title = marca.disabled ? (it.encerrado ? 'Já encerrada' : 'Com erro na análise: não entra no encerramento') : 'Marcada = entra no "2. Encerrar marcados"';
        marca.onchange = () => { const x = analises(); x[i].marcado = marca.checked; guardarAnalises(x); desenhar(); };
        const quem = el('div', 'flex:1;min-width:0');
        quem.append(el('div', 'font-weight:650;font-size:13px;color:' + c.txt + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap', it.nome),
          el('div', 'font-size:11.5px;color:' + c.txt3 + ';font-variant-numeric:tabular-nums', it.telefone || 'sem telefone'));
        const lado = el('div', 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none;max-width:52%');
        lado.append(el('span', chipCss(sc, sf, sb), sitTxt));
        if (motivoTxt(it)) lado.append(el('span', 'font-size:11px;color:' + c.txt3 + ';text-align:right', motivoTxt(it)));
        cab.append(marca, quem, lado);
        lin.append(cab);
        if (it.erro) { lin.append(el('div', 'font-size:12.5px;color:' + c.perigoTxt + ';background:' + c.perigoSuave + ';border:1px solid ' + c.perigoBorda + ';border-radius:8px;padding:7px 9px', it.erro)); tabela.append(lin); return; }
        // tabulação e tipo (dá para corrigir antes de encerrar)
        const sel = el('select', 'width:100%;' + campoCss);
        RD_CATEGORIAS.forEach(cat => { const o = document.createElement('option'); o.value = cat; o.textContent = cat; sel.appendChild(o); });
        sel.value = it.tabulacao; sel.disabled = !!it.encerrado; sel.title = 'Tabulação (categoria de encerramento no RD)';
        sel.onchange = () => { const x = analises(); x[i].tabulacao = sel.value; guardarAnalises(x); };
        // tipo do atendimento (coluna M): dá para corrigir antes de encerrar
        const selTipo = el('select', campoCss + ';padding:5px 8px');
        ['Cliente', 'Lojista'].forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; selTipo.appendChild(o); });
        selTipo.value = it.tipo || 'Cliente'; selTipo.disabled = !!it.encerrado; selTipo.title = 'Tipo do atendimento (coluna M da planilha)';
        selTipo.onchange = () => { const x = analises(); x[i].tipo = selTipo.value; x[i].tipoPor = 'escolhido na revisão'; guardarAnalises(x); desenhar(); };
        const linTipo = el('div', 'display:flex;align-items:center;gap:8px;font-size:11.5px;color:' + c.txt3);
        linTipo.append(selTipo, el('span', '', it.tipoPor ? 'tipo ' + it.tipoPor : ''));
        lin.append(sel, linTipo);
        // resultado da IA
        const ia = el('div', 'display:flex;flex-direction:column;gap:3px');
        ia.append(linhaInfo('Solicitação', it.solicitacao || 'N/A'));
        if (it.observacoes && it.observacoes !== 'N/A') ia.append(linhaInfo('Observação', it.observacoes));
        lin.append(ia);
        // dados do ER: confirmado (verde), achado sem confirmar (atenção) ou sem dados do ER
        const er = el('div', 'border-radius:9px;padding:7px 9px;display:flex;flex-direction:column;gap:4px;font-size:12px;background:' + c.sup2 + ';border:1px solid ' + c.borda);
        const [ec, ef, eb, et] = it.erConfirmado ? [c.okTxt, c.okSuave, c.okBorda, '✓ Confirmado no ER'] : it.erAchadoPor ? [c.alertaTxt, c.alertaSuave, c.alertaBorda, '⚠ Achado no ER, não confirmado'] : [c.txt3, c.sup, c.borda2, '— Sem dados do ER'];
        const erCab = el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap');
        erCab.append(el('span', chipCss(ec, ef, eb), et));
        if (it.erAchadoPor) erCab.append(el('span', 'font-size:11.5px;color:' + c.txt3, 'achado pelo ' + it.erAchadoPor));
        const dados = el('div', 'display:flex;flex-wrap:wrap;gap:4px 14px;color:' + c.txt2);
        const dado = (r, v) => { const s = el('span'); s.append(el('span', 'color:' + c.txt3, r + ' '), el('b', 'font-weight:600;color:' + (v ? c.txt : c.txt3), v || 'N/A')); return s; };
        dados.append(dado('Proposta', it.proposta), dado('CPF', it.cpf ? 'ok' : ''), dado('Vendedor', it.vendedor), dado('Filial', it.filial));
        if (it.situacaoER) dados.append(dado('Situação', it.situacaoER.replace(/^\d+\s*-\s*/, '')));
        er.append(erCab, dados);
        lin.append(er);
        // avisos (todos, com o texto inteiro), das divergências para as informações
        if (avs.length) {
          const lista = el('div', 'display:flex;flex-direction:column;gap:4px');
          avs.forEach(a => {
            const [ac, af, ab, aic, art] = corAviso(a.tipo, c);
            const d = el('div', 'display:flex;gap:7px;align-items:flex-start;font-size:12px;line-height:1.45;color:' + ac + ';background:' + af + ';border:1px solid ' + ab + ';border-radius:8px;padding:6px 9px' + (a.tipo === 'divergencia' ? ';font-weight:600' : ''));
            d.append(el('span', 'flex:none', aic), el('span', 'flex:1;min-width:0;word-break:break-word', a.texto));
            d.title = art; lista.append(d);
          });
          lin.append(lista);
        }
        if (saiuDoRD(it)) {
          // não está mais na lista "Meus atendimentos": o funcionário decide (nada é gerado sozinho)
          const caixa = el('div', 'display:flex;flex-direction:column;gap:7px;font-size:12px;line-height:1.45;color:' + c.alertaTxt + ';background:' + c.alertaSuave + ';border:1px solid ' + c.alertaBorda + ';border-radius:8px;padding:8px 10px');
          caixa.append(el('div', 'font-weight:600', 'Esta conversa não está mais na lista "Meus atendimentos" do RD.'),
            el('div', '', 'Pode ter sido encerrada (por fora ou numa tentativa anterior em que a janela demorou a fechar), transferida, ou só estar escondida por uma busca ou filtro do RD. Ela saiu do "2. Encerrar marcados".'));
          const bts = el('div', 'display:flex;flex-wrap:wrap;gap:6px');
          const btPlanilha = botao('mini', 'Já foi encerrada: incluir na planilha');
          btPlanilha.title = 'Grava a linha desta conversa na planilha (com a categoria e os dados acima) e marca como encerrada. Use só se ela foi encerrada no RD.';
          btPlanilha.onclick = () => {
            if (!confirm('Incluir a linha de ' + it.nome + ' na planilha de encerramento como encerrada?\n\nCategoria: ' + it.tabulacao + '\n\nUse só se a conversa foi mesmo encerrada no RD.')) return;
            const x = analises(), j = x.findIndex(y => y.chave === it.chave);
            if (j < 0) return;
            guardarLinha(linhaPlanilha(x[j])); pintarCopiar();
            x[j].encerrado = true; x[j].encerradoFora = true; x[j].marcado = false; delete x[j].sumiu; delete x[j].erroEncerrar;
            guardarAnalises(x); desenhar();
            status('Linha de ' + it.nome + ' incluída na planilha. Clique em "Copiar linhas da planilha" para levar à planilha.');
          };
          const btDeNovo = botao('mini', 'Tentar de novo');
          btDeNovo.title = 'Marca de novo para o "2. Encerrar marcados" (use se ela estava só escondida por uma busca ou filtro do RD)';
          btDeNovo.onclick = () => {
            const x = analises(), j = x.findIndex(y => y.chave === it.chave);
            if (j < 0) return;
            x[j].marcado = true; delete x[j].sumiu; delete x[j].erroEncerrar;
            guardarAnalises(x); desenhar();
          };
          bts.append(btPlanilha, btDeNovo);
          caixa.append(bts);
          lin.append(caixa);
        } else if (it.erroEncerrar && !it.encerrado) lin.append(el('div', 'font-size:12px;font-weight:600;color:' + c.perigoTxt + ';background:' + c.perigoSuave + ';border:1px solid ' + c.perigoBorda + ';border-radius:8px;padding:6px 9px',
          'Não encerrado: ' + it.erroEncerrar + ' (continua marcado: clique em "2. Encerrar marcados" para tentar de novo)'));
        tabela.append(lin);
      });
    }

    /* ---- página do RD Atendimento ---- */
    const lista = () => document.querySelector('[data-testid=calls-list]');
    // Conversa vencida: com cadeado ("Janela de 24 horas fechada") OU, sem cadeado, parada há mais de RD_HORAS_JANELA.
    // A lista mostra a data da ÚLTIMA mensagem (de qualquer lado): "11:23 AM" = hoje, "Ontem", ou "30/09/2026".
    // Só a data completa conta (conta-se a partir do fim daquele dia, para nunca pegar uma conversa ainda dentro da janela);
    // como a janela do WhatsApp corre desde a última mensagem do CLIENTE, essas já passaram das 24 h com certeza.
    const temCadeado = it => [...it.querySelectorAll('svg title')].some(t => t.textContent.trim() === RD_CADEADO);
    const dataDoItem = it => {
      for (const e of it.querySelectorAll('span, p')) {
        if (e.childElementCount) continue;
        const m = e.textContent.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return { texto: m[0], fimDoDia: new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59) };
      }
      return null;
    };
    const incluirParadas = () => GM_getValue('rdIncluirParadas', true);
    const motivoDoItem = it => {
      if (temCadeado(it)) return 'cadeado';
      const d = incluirParadas() && dataDoItem(it);
      return d && (Date.now() - d.fimDoDia) / 36e5 >= CONFIG.RD_HORAS_JANELA ? 'parada desde ' + d.texto : '';
    };
    const itensExpirados = () => {
      const l = lista(); if (!l) return [];
      return [...l.children].filter(it => !!motivoDoItem(it));
    };
    const nomeDoItem = it => rdNorm((it.querySelector('p') || {}).textContent);
    const etiquetasDoItem = it => [...it.querySelectorAll('[class*="Tag__Display"]')].map(s => s.textContent.trim()).filter(t => !/^\+\d+$/.test(t));
    // setor do atendimento, mostrado no pé do item ("PaymobiFin Clientes", "PaymobiFin Lojista"...); a tela corta o texto
    // com reticências, mas o texto completo está na página
    const setorDoItem = it => {
      for (const e of it.querySelectorAll('span, p, div')) {
        if (e.childElementCount || e.closest('[class*="Tag__"]')) continue;
        const t = String(e.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^paymobi\s*fin\b/i.test(t) && t.length <= 60) return t;
      }
      return '';
    };
    // Lojista sem depender da IA: setor de lojista, ou nome do contato com cara de loja
    // ("iphone"/"apple" ficam de fora: cliente às vezes usa "iPhone de Fulano" como nome no WhatsApp)
    const RD_NOME_LOJA = /\b(loja|lojas|lojista|xpanse|mundo amarelo|shop|store|celulares?|cell|smartphones?|assist[eê]ncia|com[eé]rcio|ltda|eireli|realme|samsung|motorola|xiaomi)\b/i;
    const tipoPeloRD = (setor, nomeContato) =>
      /lojist/i.test(setor || '') ? { tipo: 'Lojista', por: 'setor ' + setor }
      : RD_NOME_LOJA.test(nomeContato || '') ? { tipo: 'Lojista', por: 'nome do contato' }
      : null;
    function rdContar() {
      desenhar();
      const itens = itensExpirados(), cad = itens.filter(temCadeado).length;
      status(lista() ? itens.length + ' atendimento(s) vencido(s) em "Meus atendimentos": ' + cad + ' com cadeado' +
        (incluirParadas() ? ' e ' + (itens.length - cad) + ' sem cadeado parado(s) há mais de ' + CONFIG.RD_HORAS_JANELA + ' h.' : ' (as paradas sem cadeado estão desligadas).')
        : 'Abra a tela de atendimentos (lista "Meus atendimentos").');
    }
    async function esperar(fn, s) {
      const fim = Date.now() + (s || CONFIG.RD_ESPERA) * 1000;
      while (Date.now() < fim) { try { const r = fn(); if (r) return r; } catch (_) {} await sleep(CONFIG.POLL_PRINCIPAL); }
      return null;
    }
    // topo da conversa aberta. O RD pode deixar mais de um montado (ex.: o de outra conversa, escondido): vale o visível,
    // de preferência o que tem o botão Encerrar (e sempre o bloco de fora, não um pedaço de dentro dele)
    const cabecalho = () => {
      const todos = [...document.querySelectorAll('[data-front-hub*="call-header"]')];
      const fora = todos.filter(h => !todos.some(o => o !== h && o.contains(h)));
      const vis = fora.filter(h => h.getBoundingClientRect().height > 0);
      const comEncerrar = h => [...h.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Encerrar' || /^encerrar$/i.test(b.textContent.trim()));
      return vis.find(comEncerrar) || vis[0] || fora[0] || null;
    };
    // telefones escritos no topo, só números (5511945448365) ou formatados (+55 (11) 94544-8365)
    const telefonesAbertos = () => {
      const h = cabecalho(), t = h ? h.innerText : '';
      const achados = [...(t.match(/\b\d{10,13}\b/g) || []), ...(t.match(/(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g) || [])];
      return [...new Set(achados.map(x => x.replace(/\D/g, '')).filter(x => x.length >= 10 && x.length <= 13))];
    };
    const telefoneAberto = () => telefonesAbertos()[0] || '';
    // a conversa aberta tem o telefone analisado? (compara os 8 últimos dígitos: com ou sem 55/DDD/9)
    // Sem telefone no topo vale o nome, que a abertura da conversa já conferiu.
    const fim8Tel = t => String(t || '').replace(/\D/g, '').slice(-8);
    const telefoneConfere = tel => { const abertos = telefonesAbertos(); return !tel || !abertos.length || abertos.some(x => fim8Tel(x) === fim8Tel(tel)); };
    // Telefone da conversa que acabou de abrir. Ao trocar de conversa o RD mostra o nome novo antes do telefone (o da
    // anterior fica alguns instantes no topo): espera sair o telefone que estava no topo antes da troca e o de outra
    // conversa já analisada. Se não sair, fica o do topo, com aviso para conferir.
    let telsAntesDaAbertura = [];
    // o topo é acompanhado o tempo todo (no mesmo ritmo do botão "Analisar (IA)"): quando o nome no topo muda, os
    // telefones vistos com o nome anterior são da conversa anterior. Cobre a conversa aberta pelo próprio funcionário.
    let topoAtual = { nome: '', tels: [] }, topoAnterior = { nome: '', tels: [] };
    const nomeNoTopo = () => {
      const h = cabecalho(), l = lista();
      if (!h || !l) return '';
      const nomes = new Set([...l.children].map(nomeDoItem).filter(Boolean));
      return h.innerText.split('\n').map(rdNorm).find(x => nomes.has(x)) || '';
    };
    const vigiarTopo = () => {
      try {
        const nome = nomeNoTopo();
        if (!nome) return;
        if (nome !== topoAtual.nome) { if (topoAtual.nome) topoAnterior = topoAtual; topoAtual = { nome, tels: [] }; }
        // os que ainda são da conversa anterior não contam como desta
        const novos = telefonesAbertos().filter(t => !topoAnterior.tels.includes(t));
        if (novos.length) topoAtual.tels = novos;
      } catch (_) {}
    };
    setInterval(vigiarTopo, CONFIG.RD_BOTAO_MS);
    async function telefoneDaConversa(nome) {
      vigiarTopo();
      const daAnterior = () => (topoAnterior.nome && topoAnterior.nome !== nome ? topoAnterior.tels : []);
      const outra = x => [...telsAntesDaAbertura, ...daAnterior()].some(t => fim8Tel(t) === fim8Tel(x)) ? 'a conversa aberta antes'
        : ((analises().find(a => a.chave !== nome && a.telefone && fim8Tel(a.telefone) === fim8Tel(x)) || {}).nome || '');
      // (para na hora se o funcionário abrir outra conversa: quem chamou confere e avisa)
      const bom = await esperar(() => { vigiarTopo(); if (!abertaE(nome)) return '-'; return telefonesAbertos().find(x => !outra(x)); }, CONFIG.RD_ESPERA_TELEFONE);
      if (bom === '-') return { telefone: '' };
      if (bom) return { telefone: bom };
      const t = telefoneAberto();
      return { telefone: t, aviso: t ? 'o telefone do topo (…' + t.slice(-4) + ') é o mesmo de ' + outra(t) + '; confira o número antes de encerrar' : '' };
    }
    // a conversa aberta é a do contato quando uma das linhas do cabeçalho é exatamente o nome dele
    const abertaE = nome => { const h = cabecalho(); return !!h && h.innerText.split('\n').some(x => rdNorm(x) === nome); };
    // o item é procurado de novo a cada passo: a lista é redesenhada quando uma conversa abre ou é encerrada
    const itemPorNome = nome => { const l = lista(); return l ? [...l.children].find(y => nomeDoItem(y) === nome) || null : null; };
    async function abrirConversa(it) {
      const nome = nomeDoItem(it);
      telsAntesDaAbertura = [];
      // já está aberta (ex.: conversa escolhida pelo funcionário): não clica de novo no item, que pode fechar a conversa
      if (abertaE(nome) && document.querySelector('#chat-show-messages .card')) return true;
      telsAntesDaAbertura = telefonesAbertos();   // os da conversa que estava aberta (não são desta)
      const antes = (document.querySelector('#chat-show-messages') || {}).innerText || '';
      (it.querySelector('div') || it).click();
      const ok = await esperar(() => abertaE(nome) && document.querySelector('#chat-show-messages .card'));
      if (!ok) return false;
      // espera as mensagens desta conversa (o texto muda e para de mudar)
      let ult = null;
      await esperar(() => { const t = document.querySelector('#chat-show-messages').innerText; const pronto = t !== antes && t === ult; ult = t; return pronto; }, 6);
      return true;
    }
    // todas = sem o corte das últimas RD_MAX_MENSAGENS (o corte é só para o texto que vai à IA; o CPF e a proposta são
    // procurados na conversa inteira, porque o cliente costuma mandar o CPF no começo, antes dos menus do robô)
    function lerMensagens(todas) {
      const caixa = document.querySelector('#chat-show-messages');
      if (!caixa) return [];
      return [...caixa.querySelectorAll('.card')].map(card => {
        const quem = card.querySelector('.bg-message-from-customer') ? 'Cliente' : card.querySelector('.bg-message-from-employee') ? 'Atendente' : 'Sistema';
        const bloco = card.closest('.flex-column') || card;
        const texto = card.innerText.replace(/\s+\n/g, '\n').trim();
        const meta = bloco.innerText.replace(card.innerText, '').replace(/\s+/g, ' ').trim();   // "Arthur - 7 novembro, 2026 10:33"
        return { quem, texto, meta };
      }).filter(m => m.texto).slice(todas ? 0 : -CONFIG.RD_MAX_MENSAGENS);
    }
    // dados pessoais saem do texto antes de ir para o Gemini (o script os lê localmente para a planilha)
    const mascarar = t => String(t)
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
      .replace(/(?<!\d)\d{3}[\s.\-_/]{0,3}\d{3}[\s.\-_/]{0,3}\d{3}[\s.\-_/]{0,3}\d{2}(?!\d)/g, '[CPF]')   // os mesmos formatos que cpfDe aceita
      .replace(/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE]');
    // Perfil do contato (painel à direita da conversa: Nome, Email, CPF...). Abre o painel se estiver fechado.
    async function lerPerfil() {
      const painelPerfil = () => document.querySelector('#chat-full-container-right-show');
      if (!painelPerfil()) {
        const aba = [...document.querySelectorAll('#chat-full-container-center-buttons span')].find(s => s.textContent.trim() === 'Perfil');
        if (aba) { aba.click(); await esperar(painelPerfil, 4); }
      }
      const p = painelPerfil(); if (!p) return {};
      await esperar(() => p.querySelector('[data-cy=cy-simple-form-name]'), 4);
      const campo = cy => { const i = p.querySelector('[data-cy=cy-simple-form-' + cy + ']'); return i ? String(i.value || '').trim() : ''; };
      return { nome: campo('name'), cpf: campo('cpf'), email: campo('email') };
    }
    const fmtCpf = t => { const d = String(t || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : ''; };
    // CPF válido (dígitos verificadores): evita pegar um telefone de 11 dígitos ("11987654321") como CPF
    const cpfValido = d => {
      d = String(d || '').replace(/\D/g, '');
      if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
      const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
      return dv(9) === +d[9] && dv(10) === +d[10];
    };
    // CPF escrito na conversa: aceita 123.456.789-09, 12345678909, "123 456 789 09", "123.456.789.09", "cpf12345678909"
    // (separadores ponto, traço, barra, espaço ou sublinhado entre os grupos). Só vale se os dígitos verificadores
    // baterem; o primeiro CPF válido das mensagens passadas (na ordem da conversa).
    const RX_CPF = /(?<!\d)(\d{3})[\s.\-_/]{0,3}(\d{3})[\s.\-_/]{0,3}(\d{3})[\s.\-_/]{0,3}(\d{2})(?!\d)/g;
    const cpfDe = msgs => {
      for (const m of msgs) for (const x of String(m.texto || '').matchAll(RX_CPF)) {
        const d = x[1] + x[2] + x[3] + x[4];
        if (cpfValido(d)) return x[1] + '.' + x[2] + '.' + x[3] + '-' + x[4];
      }
      return '';
    };
    // números de 11 dígitos com cara de CPF mas com o dígito verificador errado (cliente digitou errado, ex.: 18448492370):
    // também vão para o ER, depois dos CPFs válidos. Ficam de fora os que parecem celular (DDD + 9...), a não ser que a
    // mensagem fale em "cpf"; e os pedaços de números maiores (linha digitável de boleto, código de barras, protocolo:
    // dígitos colados antes ou depois por ponto/espaço). No máximo 3, sem repetir.
    const cpfsSemDvDe = msgs => {
      const r = [];
      for (const m of msgs) for (const x of String(m.texto || '').matchAll(RX_CPF)) {
        const d = x[1] + x[2] + x[3] + x[4];
        if (cpfValido(d) || r.includes(d) || /^(\d)\1{10}$/.test(d)) continue;
        if (/^\d{2}9/.test(d) && !/cpf/i.test(m.texto)) continue;   // celular
        const antes = m.texto.slice(Math.max(0, x.index - 4), x.index), depois = m.texto.slice(x.index + x[0].length, x.index + x[0].length + 4);
        if (/\d[\s.\-_/]{1,3}$/.test(antes) || /^[\s.\-_/]{1,3}\d/.test(depois)) continue;   // parte de um número maior
        r.push(d);
        if (r.length >= 3) return r;
      }
      return r;
    };
    const propostaDe = msgs => { for (const m of msgs) { const x = m.texto.match(/proposta\D{0,20}(\d{4,6})\b/i); if (x) return x[1]; } return ''; };
    const dataDe = msgs => {
      for (let i = msgs.length - 1; i >= 0; i--) {
        const x = rdNorm(msgs[i].meta).match(/(\d{1,2})\s+([a-zç]+),?\s+(\d{4})/);
        const mes = x ? RD_MESES.indexOf(x[2]) : -1;
        if (mes >= 0) return String(x[1]).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0') + '/' + x[3];
      }
      return rdHoje();
    };

    /* ---- Gemini ---- */
    function gemini(metodo, caminho, corpo) {
      return new Promise(resolve => {
        GM_xmlhttpRequest({
          method: metodo, url: 'https://generativelanguage.googleapis.com/v1beta/' + caminho, timeout: CONFIG.RD_TIMEOUT_IA * 1000,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GM_getValue('geminiChave', '') },
          data: corpo ? JSON.stringify(corpo) : undefined,
          onload: r => { let j = null; try { j = JSON.parse(r.responseText); } catch (_) {} resolve({ status: r.status, json: j }); },
          onerror: () => resolve({ status: 0, json: null }), ontimeout: () => resolve({ status: -1, json: null }),
        });
      });
    }
    // escolha automática: lista dos "flash" da chave, em ordem de preferência (refeita a cada vez que a página abre, não fica
    // salva). Modelo que não responde (sem resposta / sobrecarregado) sai da vez nesta página e o próximo da lista é usado.
    let modelosLista = null;
    const modelosRuins = new Set();
    async function modeloGemini() {
      if (modeloAuto && !modelosRuins.has(modeloAuto)) return modeloAuto;
      if (!modelosLista) {
        const r = await gemini('GET', 'models?pageSize=200');
        if (r.status !== 200 || !r.json) throw new Error(r.status === 400 || r.status === 403 ? 'chave do Gemini recusada (confira em Configuração do Gemini)' : 'não consegui listar os modelos do Gemini (HTTP ' + r.status + ')');
        // ordem: "lite" estáveis primeiro (no plano grátis têm bem mais pedidos por dia e respondem mais rápido; para
        // classificar bastam), depois os "flash" cheios estáveis; preview/experimental por último. Em cada grupo, a mais nova.
        const nota = n => { const v = parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0); return v * 10 + (/lite/.test(n) ? 500 : 0) - (/preview|exp/.test(n) ? 1000 : 0); };
        modelosLista = (r.json.models || []).map(m => ({ n: String(m.name).replace(/^models\//, ''), g: m.supportedGenerationMethods || [] }))
          .filter(m => m.g.includes('generateContent') && /^gemini-[\d.]+-flash/.test(m.n) && !/image|tts|audio|live|thinking/.test(m.n))
          .sort((a, b) => nota(b.n) - nota(a.n)).map(m => m.n);
        if (!modelosLista.length) { modelosLista = null; throw new Error('nenhum modelo "flash" do Gemini disponível para esta chave'); }
      }
      modeloAuto = modelosLista.find(n => !modelosRuins.has(n)) || '';
      if (!modeloAuto) throw new Error('nenhum modelo do Gemini respondeu (' + [...modelosRuins].join(', ') + '); tente de novo em alguns minutos');
      return modeloAuto;
    }
    const INSTRUCOES = [
      'Você classifica atendimentos de WhatsApp da PaymobiFin (financiamento de celulares com aparelho bloqueável) que vão ser encerrados.',
      'Leia a conversa entre Cliente, Atendente e Sistema (mensagens automáticas, régua de cobrança e lembretes) e responda SÓ o JSON pedido.',
      'tabulacao: exatamente uma destas categorias, escrita igual: ' + RD_CATEGORIAS.join(' | ') + '.',
      'Use "PaymobiFin - Encerrado por Inatividade" quando o cliente não respondeu, só recebeu mensagens automáticas ou parou de responder antes de dizer o que queria.',
      'Quando o cliente disse o que queria (mesmo sem resolver), use a categoria do assunto principal.',
      'solicitacao: o pedido do cliente em 2 a 6 palavras, no estilo "Informou pagamento", "Desbloqueio por pagamento", "2º via de boleto", "Negociação", "Dúvida sobre bloqueio"; "N/A" se não houve pedido.',
      'observacoes: no máximo uma frase curta com algo útil para o histórico (ex.: "Informado sobre o App"); "N/A" se não houver.',
      'Tom de solicitacao e observacoes: neutro, profissional e só com fatos do assunto da conversa (o que o cliente pediu, informou ou o que foi orientado).',
      'NUNCA diga nem insinue que a equipe, o atendente ou a PaymobiFin deixou de responder, demorou, esqueceu, falhou ou é responsável por o atendimento não ter sido concluído (não escreva coisas como "atendente não respondeu", "cliente ficou sem retorno", "sem resposta da equipe", "atendimento não finalizado pelo atendente").',
      'Mesmo que a última mensagem seja do cliente e o atendente não tenha respondido, descreva o contexto da conversa: o pedido ou o assunto do cliente (ex.: "Cliente solicitou segunda via do boleto", "Cliente informou o pagamento da parcela"). A tabulação segue o assunto da conversa.',
      'tipo_atendimento: "Lojista" se quem conversa com a PaymobiFin é uma loja, vendedor, gerente ou parceiro (fala em nome da loja, de "meu cliente"/"o cliente", de uma venda, cadastro, IMEI, ativação ou aparelho de um cliente, ou o setor do atendimento é de lojista); "Cliente" se é a própria pessoa que comprou/financiou falando do contrato, boleto, parcela ou aparelho dela.',
      'nome_cliente: o nome completo do cliente se aparecer escrito na conversa; senão "".',
      'Dados pessoais aparecem trocados por [CPF], [TELEFONE] e [EMAIL]: não tente adivinhá-los.',
    ].join('\n');
    // trava: texto que culpa o atendimento pela falta de resposta não vai para a planilha (o prompt já proíbe; isto é a reserva)
    // só pega quando a "falha" é do lado da equipe: "sem respostas do cliente", "falha no app" e "sem resposta no RD" passam
    const RD_CULPA_ATENDIMENTO = /(atendente|atendimento|equipe|time|empresa|paymobi\w*|n[óo]s)\b[^.]{0,40}\b(n[ãa]o (respond|retorn|deu retorno|finaliz|conclu|atendeu)|demorou|esqueceu|falhou|ignorou|deixou de (respond|retorn|atend))|(sem|n[ãa]o (teve|houve|obteve|recebeu)) (resposta|retorno|atendimento) (do|da|de) (atendente|atendimento|equipe|empresa|paymobi\w*)|ficou sem (resposta|retorno|atendimento)|aguardando (resposta|retorno) (do|da) (atendente|equipe)|falta de (resposta|retorno)(?! d[oa]s? clientes?)/i;
    const rdTextoNeutro = (texto, reserva) => (RD_CULPA_ATENDIMENTO.test(texto || '') ? { texto: reserva, trocado: true } : { texto, trocado: false });
    async function analisarTexto(nomeContato, msgs, setor) {
      const conversa = mascarar(msgs.map(m => m.quem + ' (' + m.meta + '): ' + m.texto).join('\n')).slice(-CONFIG.RD_MAX_CARACTERES);
      const corpoReq = {
        systemInstruction: { parts: [{ text: INSTRUCOES }] },
        contents: [{ role: 'user', parts: [{ text: 'Nome do contato no RD: ' + mascarar(nomeContato) + (setor ? '\nSetor do atendimento no RD: ' + setor : '') + '\n\nConversa:\n' + conversa }] }],
        generationConfig: {
          temperature: 0, responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', required: ['tabulacao', 'solicitacao', 'observacoes', 'tipo_atendimento', 'nome_cliente'], properties: {
            tabulacao: { type: 'STRING', enum: RD_CATEGORIAS }, solicitacao: { type: 'STRING' }, observacoes: { type: 'STRING' },
            tipo_atendimento: { type: 'STRING', enum: ['Cliente', 'Lojista'] }, nome_cliente: { type: 'STRING' } } },
        },
      };
      // modelo sem resposta: no automático, passa para o próximo da lista e repete a mesma conversa
      for (;;) {
        const mod = await modeloGemini();
        try { return await pedirAoModelo(mod, JSON.parse(JSON.stringify(corpoReq))); }
        catch (e) {
          if (!e.semResposta) throw e;
          modelosRuins.add(mod);
          const prox = (modelosLista || []).find(n => !modelosRuins.has(n));
          if (!prox) {
            if (/limite diário/.test(e.message)) throw new Error('limite diário do Gemini esgotado em todos os modelos (' + [...modelosRuins].join(', ') + '); volta à meia-noite do horário do Pacífico, por volta das 4 h–5 h de Brasília');
            throw e;
          }
          status((/limite/.test(e.message) ? 'Acabou o limite do modelo ' + mod : 'O Gemini (' + mod + ') não está respondendo') + '; trocando para ' + prox + '...');
        }
      }
    }
    const msgGoogle = r => String((((r.json || {}).error || {}).message) || '').slice(0, 160);
    const modelosSemThinking = new Set();   // modelos que recusaram o ajuste de "pensamento" (nesta página)
    async function pedirAoModelo(mod, corpoReq) {
      // "pensamento" reduzido: para classificar não precisa, e assim o modelo responde bem mais rápido.
      // Se o modelo não aceitar o ajuste (HTTP 400), o pedido é repetido sem ele e o modelo é lembrado.
      if (modelosSemThinking.has(mod)) { /* sem ajuste */ }
      else if (/^gemini-2\.5-flash/.test(mod)) corpoReq.generationConfig.thinkingConfig = { thinkingBudget: 0 };
      else if (/^gemini-([3-9]|\d{2,})/.test(mod)) corpoReq.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
      for (let t = 1; t <= CONFIG.RD_TENTATIVAS_IA; t++) {
        const r = await gemini('POST', 'models/' + encodeURIComponent(mod) + ':generateContent', corpoReq);
        const ultima = t >= CONFIG.RD_TENTATIVAS_IA;
        // limite por minuto: espera e tenta de novo; limite do DIA esgotado: não adianta esperar (o automático troca de modelo,
        // cada modelo tem a sua cota)
        const diario = r.status === 429 && /per ?day|perday|daily|por dia/i.test(msgGoogle(r) + JSON.stringify((r.json || {}).error || {}));
        if (r.status === 429 && !diario && !ultima) { status('Limite por minuto do Gemini (' + mod + '): aguardando ' + CONFIG.RD_ESPERA_LIMITE + ' s...'); await sleep(CONFIG.RD_ESPERA_LIMITE * 1000); continue; }
        // sem resposta, erro de rede ou servidor sobrecarregado: tenta de novo
        if ((r.status <= 0 || r.status >= 500) && !ultima) { status('O Gemini (' + mod + ') não respondeu; tentando de novo (' + (t + 1) + ' de ' + CONFIG.RD_TENTATIVAS_IA + ')...'); await sleep(CONFIG.RD_ESPERA_FALHA * 1000); continue; }
        // pedido recusado por causa do ajuste de "pensamento": repete sem ele
        if (r.status === 400 && corpoReq.generationConfig.thinkingConfig && /think/i.test(msgGoogle(r))) { delete corpoReq.generationConfig.thinkingConfig; modelosSemThinking.add(mod); t--; continue; }
        if (r.status === 404) {
          const e = new Error('modelo ' + mod + ' indisponível para esta chave'); e.semResposta = true; throw e;   // o automático passa para o próximo
        }
        if (r.status !== 200) {
          const e = new Error(
            r.status === 401 || r.status === 403 || (r.status === 400 && /api key|API_KEY/i.test(msgGoogle(r))) ? 'chave do Gemini recusada'
            : r.status === 429 ? (diario ? 'limite diário do modelo ' + mod + ' esgotado (volta à meia-noite do horário do Pacífico, por volta das 4 h–5 h de Brasília)' : 'limite de uso do Gemini atingido no modelo ' + mod + '; tente mais tarde')
            : r.status === 400 ? 'o Gemini recusou o pedido: ' + (msgGoogle(r) || 'HTTP 400')
            : 'o Gemini (' + mod + ') não respondeu' + (r.status === -1 ? ' em ' + CONFIG.RD_TIMEOUT_IA + ' s' : ' (HTTP ' + r.status + ')'));
          e.semResposta = r.status <= 0 || r.status >= 500 || r.status === 429;   // o automático passa para o próximo modelo
          throw e;
        }
        const txt = (((((r.json || {}).candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
        let j; try { j = JSON.parse(txt); } catch (_) { throw new Error('resposta do Gemini fora do formato'); }
        if (!RD_CATEGORIAS.includes(j.tabulacao)) throw new Error('o Gemini devolveu uma categoria fora da lista PaymobiFin: ' + j.tabulacao);
        return j;
      }
      throw new Error('limite de uso do Gemini atingido; tente mais tarde');
    }

    /* ---- ER (Mesa de Crédito), com a sessão do ER deste navegador ----
       Mesmas consultas da busca de cliente do painel: MesaCreditoLista (pelo CPF ou nº da proposta) e o detalhe da
       proposta (Digitador = vendedor). O endereço do ER é guardado pelo painel do ER (GM 'erBase'). */
    const semAcento = t => rdNorm(t).normalize('NFD').replace(/[̀-ͯ]/g, '');
    function erReq(caminho, params) {
      const base = GM_getValue('erBase', '');
      return new Promise(resolve => {
        if (!base) return resolve({ ok: false, status: 0, texto: '', semBase: true });
        GM_xmlhttpRequest({
          method: 'GET', url: base + caminho + '?' + new URLSearchParams(params).toString(), timeout: CONFIG.TIMEOUT_REDE * 1000,
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          onload: r => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, texto: r.responseText || '', urlFinal: r.finalUrl || '' }),
          onerror: () => resolve({ ok: false, status: 0, texto: '' }), ontimeout: () => resolve({ ok: false, status: -1, texto: '' }),
        });
      });
    }
    const erDoc = t => new DOMParser().parseFromString(t, 'text/html');
    const erLogin = erSemSessao;   // tela de login ou aviso de sessão expirada (ver erSemSessao)
    const erTxt = t => String(t || '').replace(/[\s ]+/g, ' ').trim();
    const erProprio = e => erTxt([...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''));
    // valor que vem logo depois do rótulo (ex.: "Digitador"), como na leitura do detalhe da proposta no painel
    const erRotulo = (doc, rotulo) => {
      for (const e of doc.querySelectorAll('body *')) {
        if (erProprio(e).replace(/:$/, '').trim().toLowerCase() !== rotulo) continue;
        let n = e.nextSibling;
        while (n && ((n.nodeType === 3 && !n.textContent.trim()) || n.nodeName === 'BR')) n = n.nextSibling;
        let t = n ? erTxt(n.textContent) : '';
        if (!t && e.parentElement && e.parentElement.nextElementSibling) t = erTxt(e.parentElement.nextElementSibling.textContent);
        if (t) return t;
      }
      return '';
    };
    // tabela da Mesa: no HTML da resposta, ou dentro de um JSON (algumas telas do sistema devolvem o HTML num campo do JSON)
    function erTabelaMesa(texto) {
      const doc = erDoc(texto), t = doc.querySelector('#tabMesaCreditoLista');
      if (t) return t;
      if (!/^\s*[{[]/.test(texto || '')) return null;
      try {
        const achar = v => { if (typeof v === 'string') return /tabMesaCreditoLista/.test(v) ? v : null; if (v && typeof v === 'object') for (const k in v) { const x = achar(v[k]); if (x) return x; } return null; };
        const html = achar(JSON.parse(texto));
        return html ? erDoc(html).querySelector('#tabMesaCreditoLista') : null;
      } catch (_) { return null; }
    }
    // o que o ER devolveu quando não veio a lista (para o aviso; números trocados por # para não expor CPF/telefone)
    function erDiagnostico(r) {
      const doc = erDoc(r.texto);
      const titulo = erTxt((doc.querySelector('title') || {}).textContent).slice(0, 60);
      const cab = erTxt((doc.querySelector('h1, h2, h3, h4, .modal-title, .alert, .error, .erro') || {}).textContent).slice(0, 80);
      const tabelas = [...doc.querySelectorAll('table[id], form[id]')].map(e => e.tagName.toLowerCase() + '#' + e.id).slice(0, 4);
      const texto = erTxt(doc.body ? doc.body.textContent : r.texto).replace(/\d/g, '#').slice(0, 140);
      let caminho = ''; try { caminho = r.urlFinal ? new URL(r.urlFinal).pathname : ''; } catch (_) {}
      return ['HTTP ' + r.status, (r.texto || '').length + ' caracteres', /^\s*[{[]/.test(r.texto || '') ? 'JSON' : '', caminho && !/MesaCreditoLista/i.test(caminho) ? 'redirecionou para ' + caminho : '',
        titulo ? 'título "' + titulo + '"' : '', cab ? 'aviso "' + cab + '"' : '', tabelas.length ? tabelas.join(', ') : 'sem tabelas', texto ? 'texto "' + texto + '"' : 'resposta vazia'].filter(Boolean).join(' · ');
    }
    const erData = s => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/); return m ? +new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : 0; };
    async function erMesa(termo) {
      const dados = {
        strDataInicial: '01/01/2020', strDataFinal: rdHoje(), strProduto: '', strSituacao: '00', strReanalise: 'T', strMesa: '',
        strVisualizacao: 'N', strNomePesquisa: termo, strPromotora: '', strPromotoraFilial: '', strLojista: '', strLoja: '', strPontoAtendimento: '', strConveniada: '',
        strParceiro: '', lstPlanos: [], strCodigoEmprestimo: '', strTipoData: 'INCLUSAO', strDataVencimentoLiberacaoInicial: '', strDataVencimentoLiberacaoFinal: '',
      };
      const r = await erReq('/MesaCredito/MesaCreditoLista', { strDados: JSON.stringify(dados) });
      if (r.semBase) return { erro: 'abra o ER (Paymobi) uma vez neste navegador para o painel saber o endereço' };
      if (!r.ok) return { erro: 'o ER não respondeu (HTTP ' + r.status + ')' };
      if (erLogin(r.texto)) return { erro: 'sessão do ER expirada: entre no ER neste navegador' };
      // a Mesa de Crédito só responde para usuário cadastrado como aprovador ("Aprovador FULANO não cadastrado.")
      // o texto do aviso é lido já decodificado (o ER pode mandar o "ã" como &#227; no HTML)
      const avisoER = erTxt((erDoc(r.texto).body || {}).textContent || '');
      const semAprovador = avisoER.match(/Aprovador\s+(\S+)\s+n[ãa]o\s+cadastrad/i);
      if (semAprovador) return { erro: 'a conta ' + semAprovador[1] + ', que está logada no ER deste navegador, não é aprovadora da Mesa de Crédito: entre no ER com a conta da Mesa (no painel do ER: Trocar de conta) e clique em "1. Analisar" de novo' };
      const t = erTabelaMesa(r.texto);
      // busca sem resultado: o ER devolve só o aviso, sem a tabela (não é erro; os outros caminhos continuam)
      if (!t && /n[ãa]o foi localizada nenhuma proposta/i.test(avisoER)) return { linhas: [] };
      if (!t) return { erro: 'resposta do ER sem a lista de propostas (' + erDiagnostico(r) + ')' };
      const ths = [...t.querySelectorAll('thead th')].map(th => erTxt(th.textContent).toLowerCase());
      const col = n => ths.findIndex(x => x.startsWith(n));
      const ci = { id: col('proposta'), sit: col('situa'), dh: col('data/hora'), cli: col('cliente'), loja: col('pto') };
      const linhas = [...t.querySelectorAll('tbody tr')].map(tr => {
        const c = [...tr.children].map(td => erTxt(td.textContent));
        const td = tr.querySelector('td[onclick*="DetalheProposta"]');
        const idOc = td ? ((td.getAttribute('onclick') || '').match(/DetalheProposta\(\s*['"]?(\d+)/) || [])[1] : '';
        const proposta = idOc || (c[ci.id] || '').replace(/\D/g, '');
        return proposta ? { proposta, situacao: c[ci.sit] || '', data: c[ci.dh] || '', nome: c[ci.cli] || '', filial: c[ci.loja] || '' } : null;
      }).filter(Boolean);
      return { linhas };
    }
    // Antes de analisar: o ER está respondendo com uma sessão que consulta a Mesa? (busca por um nome que não existe:
    // "nenhuma proposta" = ok). Sem isso a análise segue sem proposta, vendedor e filial, por isso não analisa.
    // O ok vale CONFIG.RD_ER_OK_S segundos (o "Analisar (IA)" de várias conversas seguidas não repete a conferência).
    let erOkAte = 0;
    async function erConferir() {
      if (Date.now() < erOkAte) return '';
      const r = await erMesa('ZZZZ PAYMOBIFIN CONFERENCIA');
      if (r.erro) { erOkAte = 0; return 'o ER não está disponível (' + r.erro + '). Sem o ER a planilha fica sem proposta, vendedor e filial; abra o ER, entre com a conta da Mesa e analise de novo.'; }
      erOkAte = Date.now() + CONFIG.RD_ER_OK_S * 1000;
      return '';
    }
    // aviso de uma análise que ficou sem o ER por ele estar fora (não por não achar o cliente)
    const erForaDoAr = a => /ER: (abra o ER|sessão do ER expirada|o ER não respondeu|resposta do ER sem a lista|a conta \S+, que está logada no ER)/.test((a && a.aviso) || '');
    async function erVendedor(proposta) {
      for (const a of ['/MesaCredito/DetalheProposta', '/MesaCredito/MesaAnaliseProposta']) {
        const r = await erReq(a, { lngProposta: proposta });
        if (!r.ok || !r.texto || erLogin(r.texto)) continue;
        const v = erRotulo(erDoc(r.texto), 'digitador');
        if (v) return v.replace(/^\d+\s+/, '').replace(/\s+-\s+.*$/, '').trim();   // "4144175588 LUCAS S. LINERES - XP ..." -> "LUCAS S. LINERES"
      }
      return '';
    }
    // aba Cliente da proposta no ER (a mesma que a Mesa abre): nome, CPF e telefones do cadastro, para confirmar quem é
    async function erCadastro(proposta) {
      const r = await erReq('/MesaCredito/MesaAnaliseCliente', { lngProposta: proposta });
      if (!r.ok || !r.texto || erLogin(r.texto)) return null;
      const doc = erDoc(r.texto), bloco = doc.querySelector('#divDetalhePropostaCadastro') || doc.body;
      const campo = rot => {   // valor = <b> da mesma célula do <small> com o rótulo exato
        const sm = [...bloco.querySelectorAll('small')].find(x => erTxt(x.textContent).toLowerCase() === rot.toLowerCase());
        const cel = sm && (sm.closest('td') || sm.parentElement), b = cel && cel.querySelector('b');
        return b ? erTxt(b.textContent) : '';
      };
      const nome = campo('Nome do Cliente'), cpf = campo('CPF').replace(/\D/g, '');
      if (!nome && !cpf) return null;
      return { nome, cpf, telefones: [campo('Telefone 1'), campo('Telefone 2'), campo('Celular')].map(t => t.replace(/\D/g, '')).filter(t => t.length >= 8) };
    }
    // proposta de uma lista: a EFETIVADA (a mais recente, se houver mais de uma); sem efetivada, a citada na conversa;
    // senão a mais recente que não está cancelada
    function escolherProposta(cands, propostaConversa) {
      const unicas = [...new Map(cands.map(c => [c.proposta, c])).values()].sort((a, b) => erData(b.data) - erData(a.data));
      const efetivadas = unicas.filter(c => /efetivad/i.test(c.situacao) && !/n[ãa]o\s+efetivad/i.test(c.situacao));
      const citada = propostaConversa && unicas.find(c => c.proposta === propostaConversa);
      const p = efetivadas[0] || citada || unicas.find(c => !/cancelad/i.test(c.situacao)) || unicas[0];
      const sit = c => c.proposta + (c.situacao ? ' (' + c.situacao.replace(/^\d+\s*-\s*/, '') + ')' : '');
      const avisos = [];
      if (unicas.length > 1) avisos.push('ER: ' + unicas.length + ' propostas: ' + unicas.map(sit).join(', ') + '; usei a ' + p.proposta + (efetivadas[0] === p ? ' (efetivada)' : ''));
      if (efetivadas.length > 1) avisos.push('ER: ' + efetivadas.length + ' propostas efetivadas; usei a mais recente');
      if (!efetivadas.length) avisos.push('ER: nenhuma proposta efetivada');
      if (citada && citada !== p) avisos.push('a conversa cita a proposta ' + citada.proposta + ', mas a efetivada é a ' + p.proposta);
      return { p, avisos };
    }
    // Procura o cliente no ER por vários caminhos, porque o CPF do Perfil pode estar errado (ou ser de outra pessoa):
    //   1) CPF do Perfil  2) CPF que o cliente escreveu  3) proposta citada na conversa  4) nome completo (só nome igual)
    // Cada achado é CONFIRMADO na aba Cliente da proposta: o telefone do RD ou o nome conhecido têm de bater com o cadastro.
    // Fica o primeiro confirmado; sem nenhum confirmado, o primeiro achado, com aviso para conferir.
    async function cruzarER(d) {
      const tentativas = [];
      const add = (tipo, valor, rotulo) => { if (valor && !tentativas.some(t => t.tipo === tipo && t.valor === valor)) tentativas.push({ tipo, valor, rotulo }); };
      add('cpf', String(d.cpfPerfil || '').replace(/\D/g, ''), 'CPF do Perfil');
      add('cpf', String(d.cpfConversa || '').replace(/\D/g, ''), 'CPF escrito na conversa');
      // CPF escrito com o dígito verificador errado: tentado mesmo assim (a confirmação no cadastro continua valendo)
      (d.cpfsSemDv || []).forEach(c => { add('cpf', c, 'CPF escrito na conversa (' + fmtCpf(c) + ', dígito verificador não confere)'); const t = tentativas.find(x => x.tipo === 'cpf' && x.valor === c); if (t) t.semDv = true; });
      add('proposta', d.propostaConversa, 'proposta citada na conversa');
      (d.nomes || []).filter(n => /\S+\s+\S+/.test(n || '')).forEach(n => add('nome', n.trim(), 'nome ' + n.trim()));
      tentativas.forEach(t => { if (t.tipo === 'cpf' && !t.semDv && !cpfValido(t.valor)) t.invalida = true; });   // inclui o dígito verificador
      const validas = tentativas.filter(t => !t.invalida);
      if (!validas.length) return { avisos: [d.lojista ? 'lojista: a conversa não cita CPF, proposta nem nome completo do cliente para consultar o ER' : 'sem CPF, proposta ou nome completo para consultar o ER'] };
      const nomesConhecidos = (d.nomes || []).filter(Boolean).map(semAcento);
      const fim8 = t => String(t || '').replace(/\D/g, '').slice(-8);
      const telRD = fim8(d.telefone);
      const naoAchou = [];
      let reserva = null;
      for (const t of validas) {
        const res = await erMesa(t.valor);
        // CPF com dígito errado que o ER recusa como busca: só esse caminho falha, os outros continuam
        if (res.erro && t.semDv && /sem a lista/.test(res.erro)) { naoAchou.push(t.rotulo + ': o ER recusou a busca'); continue; }
        if (res.erro) return { avisos: ['ER: ' + res.erro] };   // sem endereço / sessão expirada: nada adianta tentar
        let cands = res.linhas;
        if (t.tipo === 'proposta') cands = cands.filter(c => c.proposta === t.valor);
        if (t.tipo === 'nome') cands = cands.filter(c => semAcento(c.nome) === semAcento(t.valor));
        if (!cands.length) { naoAchou.push(t.rotulo); continue; }
        const esc = escolherProposta(cands, d.propostaConversa);
        const cad = await erCadastro(esc.p.proposta);
        const porTelefone = !!(cad && telRD && cad.telefones.some(x => fim8(x) === telRD));
        const porNome = !!((cad && cad.nome && nomesConhecidos.includes(semAcento(cad.nome))) || nomesConhecidos.includes(semAcento(esc.p.nome)));
        // lojista: o telefone e o nome do contato são da loja; o CPF ou a proposta que o lojista escreveu identificam o cliente
        // (o CPF com dígito errado não conta: precisa do telefone ou do nome para confirmar)
        const peloLojista = !!d.lojista && ((t.tipo === 'cpf' && !t.semDv) || t.tipo === 'proposta');
        const achado = { t, esc, cad, confirmado: porTelefone || porNome || peloLojista, como: porTelefone ? 'telefone' : porNome ? 'nome' : peloLojista ? 'dado citado pelo lojista' : '' };
        if (achado.confirmado) { reserva = achado; break; }
        if (!reserva) reserva = achado;
        naoAchou.push(t.rotulo + ' (achou ' + (esc.p.nome || 'outra pessoa') + ', que não bate com o telefone nem com o nome do RD)');
      }
      if (!reserva) return { avisos: ['ER: nenhuma proposta encontrada (' + naoAchou.join('; ') + ')'] };
      const { t, esc, cad } = reserva;
      const avisos = [...esc.avisos];
      if (naoAchou.length) avisos.unshift('ER: não deu pelo ' + naoAchou.join('; ') + '. Achei pelo ' + t.rotulo);
      if (!reserva.confirmado) avisos.unshift('⚠ ER: não consegui confirmar que é o mesmo cliente (telefone e nome do RD não batem com o cadastro da proposta ' + esc.p.proposta + '); confira antes de encerrar');
      const cpfER = cad && cad.cpf && cad.cpf.length === 11 ? fmtCpf(cad.cpf) : '';
      if (cpfER && d.cpfPerfil && fmtCpf(d.cpfPerfil) !== cpfER) avisos.push('o CPF do Perfil do RD (' + fmtCpf(d.cpfPerfil) + ') está diferente do cadastro no ER (' + cpfER + ')');
      if (t.semDv) avisos.push('o CPF escrito na conversa (' + fmtCpf(t.valor) + ') tem o dígito verificador errado' + (cpfER ? '; na planilha vai o do cadastro no ER (' + cpfER + ')' : ''));
      const vendedor = await erVendedor(esc.p.proposta);
      if (!vendedor) avisos.push('ER: vendedor não encontrado no detalhe da proposta ' + esc.p.proposta);
      return { proposta: esc.p.proposta, nome: (cad && cad.nome) || esc.p.nome, cpf: cpfER, filial: esc.p.filial, situacao: esc.p.situacao, vendedor,
        confirmado: reserva.confirmado, achadoPor: t.rotulo, avisos };
    }

    /* ---- analisar UMA conversa (usado pela lista de vencidas e pelo botão "Analisar a conversa aberta") ---- */
    // abre a conversa, lê mensagens e Perfil, pede ao Gemini, cruza com o ER; devolve o registro da revisão (com erro, se falhar)
    // aoLer: avisado quando a leitura da conversa terminou (dali em diante o funcionário já pode abrir outra conversa)
    async function analisarItem(it, nome, rotulo, motivo, aoLer) {
      const reg = { chave: nome, nome: (it.querySelector('p') || {}).textContent.trim(), etiquetas: etiquetasDoItem(it), marcado: true, motivo: motivo || motivoDoItem(it) };
      try {
        if (!(await abrirConversa(it))) throw new Error('a conversa não abriu');
        // leitura (tudo que depende da conversa aberta): mensagens, telefone e Perfil. Se a conversa for trocada no meio,
        // para em vez de misturar dados de dois contatos
        const trocou = () => !abertaE(nome);
        const msgs = lerMensagens();
        const todasMsgs = lerMensagens(true);   // a conversa inteira, só para achar o CPF e a proposta citados
        if (!msgs.length) throw new Error('não encontrei mensagens na conversa');
        const tel = await telefoneDaConversa(nome);
        if (trocou()) throw new Error('a conversa foi trocada antes de terminar a leitura; abra de novo e clique em Analisar (IA)');
        reg.telefone = tel.telefone;
        const perfil = await lerPerfil();
        if (trocou()) throw new Error('a conversa foi trocada antes de terminar a leitura; abra de novo e clique em Analisar (IA)');
        reg.setor = setorDoItem(it);
        if (aoLer) aoLer();
        const j = await analisarTexto(reg.nome, msgs, reg.setor);
        // Lojista: o setor do RD ou o nome do contato decidem antes da IA; sem esses sinais, vale a leitura da IA
        const peloRD = tipoPeloRD(reg.setor, reg.nome);
        if (peloRD) j.tipo_atendimento = 'Lojista';
        const lojista = j.tipo_atendimento === 'Lojista';
        reg.tipoPor = peloRD ? 'pelo ' + peloRD.por : 'pela conversa (IA)';
        // cruzamento: CPF e nome do Perfil do RD têm prioridade; o que o cliente escreveu na conversa confere.
        // Lojista: o Perfil e o telefone são da LOJA; o cliente sai do CPF/proposta que o lojista citou na conversa.
        // CPF da conversa inteira: primeiro o que o cliente escreveu; sem nenhum, o que o atendente escreveu (ex.: confirmando)
        const cpfConversa = cpfDe(todasMsgs.filter(m => m.quem === 'Cliente')) || cpfDe(todasMsgs.filter(m => m.quem === 'Atendente'));
        // números com cara de CPF mas com o dígito verificador errado: consultados no ER depois dos CPFs válidos
        const cpfsSemDv = [...new Set([...cpfsSemDvDe(todasMsgs.filter(m => m.quem === 'Cliente')), ...cpfsSemDvDe(todasMsgs.filter(m => m.quem === 'Atendente'))])].slice(0, 3);
        const cpfPerfil = lojista ? '' : fmtCpf(perfil.cpf);
        const nomePerfil = !lojista && /\S+\s+\S+/.test(perfil.nome || '') ? perfil.nome.trim() : '';
        // Nome do cliente na planilha: o do ER quando o cruzamento acha o cliente (logo abaixo); senão é SEMPRE o nome do
        // contato no RD (o do Perfil; sem Perfil, o da lista), mesmo que o cliente não tenha dito o nome na conversa
        const nomeContato = String(perfil.nome || '').trim() || reg.nome || '';
        const avisos = tel.aviso ? [tel.aviso] : [];
        if (cpfPerfil && cpfConversa && cpfPerfil !== cpfConversa) avisos.push('CPF da conversa (' + cpfConversa + ') é diferente do CPF do Perfil (' + cpfPerfil + ')');
        // Solicitação/Observações que culpam o atendimento: a observação vira a própria solicitação (o pedido do cliente)
        const sol = rdTextoNeutro((j.solicitacao || 'N/A').trim(), 'N/A');
        const obs = rdTextoNeutro((j.observacoes || 'N/A').trim(), sol.texto !== 'N/A' ? sol.texto : 'N/A');
        if (sol.trocado || obs.trocado) avisos.push('a IA escreveu que o atendimento não respondeu; troquei pelo assunto da conversa (confira a solicitação e a observação)');
        j.solicitacao = sol.texto; j.observacoes = obs.texto;
        Object.assign(reg, { tabulacao: j.tabulacao, solicitacao: (j.solicitacao || 'N/A').trim(), observacoes: (j.observacoes || 'N/A').trim(), tipo: j.tipo_atendimento || 'Cliente',
          nomeCliente: nomeContato, cpf: cpfPerfil || cpfConversa || fmtCpf(cpfsSemDv[0]), proposta: propostaDe(todasMsgs), data: dataDe(msgs) });
        // cruzamento com o ER (Mesa de Crédito): proposta, nome, filial e vendedor
        status(rotulo + ' (consultando o ER)...');
        const nomeIA = (j.nome_cliente || '').trim();
        const er = await cruzarER({ cpfPerfil, cpfConversa, cpfsSemDv, propostaConversa: reg.proposta, telefone: lojista ? '' : reg.telefone, lojista,
          nomes: [...new Set([nomePerfil, nomeIA, !lojista && /\S+\s+\S+/.test(reg.nome) ? reg.nome : ''].filter(Boolean))] });
        if (er.proposta) {
          const nomeER = er.nome || '';
          if (!lojista && er.confirmado && nomeER && reg.nomeCliente && semAcento(nomeER) !== semAcento(reg.nomeCliente)) avisos.push('nome no ER (' + nomeER + ') é diferente do RD (' + reg.nomeCliente + ')');
          if (reg.proposta && reg.proposta !== er.proposta && !(er.avisos || []).some(a => /a conversa cita/.test(a))) avisos.push('a conversa cita a proposta ' + reg.proposta + ', que não é a do cliente no ER (usei a ' + er.proposta + ')');
          // o CPF da planilha passa a ser o do cadastro no ER (corrige o CPF errado do Perfil)
          Object.assign(reg, { proposta: er.proposta, nomeCliente: nomeER || reg.nomeCliente, cpf: er.cpf || reg.cpf, filial: er.filial || '', vendedor: er.vendedor || '',
            situacaoER: er.situacao || '', erConfirmado: !!er.confirmado, erAchadoPor: er.achadoPor || '' });
          // não confirmado: continua marcado (padrão), só com o aviso para conferir
        }
        avisos.push(...(er.avisos || []));
        reg.aviso = avisos.join(' · ');
      } catch (e) { reg.erro = e.message; reg.marcado = false; }
      return reg;
    }

    /* ---- etapa 1: analisar ---- */
    btAnalisar.onclick = async () => {
      if (rdRodando) return;
      if (rdAbertas) return status('Aguarde: ' + rdAbertas + ' análise(s) do botão "Analisar (IA)" ainda em andamento.');
      if (!GM_getValue('geminiChave', '')) { cfgBox.open = true; return status('Informe a chave do Gemini em "Configuração do Gemini".'); }
      // sem o ER respondendo, a planilha sairia sem proposta, vendedor e filial: não começa
      rdRodando = true; status('Conferindo se o ER está disponível...');
      let erFora = ''; try { erFora = await erConferir(); } finally { rdRodando = false; }
      if (erFora) return status('Não analisei: ' + erFora);
      // as que deram erro voltam para a fila (as encerradas e as analisadas sem erro ficam como estão)
      // também voltam as que ficaram sem os dados do ER porque o ER não estava disponível (endereço, sessão ou rede)
      const refazer = a => !a.encerrado && (a.erro || /ER: (abra o ER|sessão do ER expirada|o ER não respondeu|resposta do ER sem a lista|a conta \S+, que está logada no ER)/.test(a.aviso || ''));
      // as escolhidas antes das 24 h não estão entre as vencidas: voltam para a fila pelo nome, com o mesmo motivo
      const refeitas = analises().filter(refazer);
      if (refeitas.length) guardarAnalises(analises().filter(a => !refazer(a)));
      const motivoAntes = new Map(refeitas.map(a => [a.chave, a.motivo]));
      const jaFeitos = new Set(analises().map(a => a.chave));
      const fila = [...new Set([...itensExpirados().map(nomeDoItem), ...refeitas.map(a => a.chave)])].filter(n => n && !jaFeitos.has(n));
      if (!fila.length) return status('Nenhum atendimento vencido novo para analisar (os já analisados hoje estão abaixo).');
      rdRodando = true; rdParar = false;
      let feitos = 0, semResposta = 0;
      try {
        for (const nome of fila) {
          if (rdParar) break;
          const it = itemPorNome(nome);
          if (!it) continue;
          const mod = modeloAuto;
          status('Analisando ' + (feitos + 1) + ' de ' + fila.length + ': ' + nome + '...' + (mod ? '\nModelo: ' + mod : ''));
          const reg = await analisarItem(it, nome, 'Analisando ' + (feitos + 1) + ' de ' + fila.length + ': ' + nome, motivoAntes.get(nome));
          guardarAnalises([...analises(), reg]);
          desenhar();
          feitos++;
          // o ER caiu no meio (sessão expirou, conta trocada...): para em vez de seguir sem proposta, vendedor e filial
          if (erForaDoAr(reg)) { erOkAte = 0; rdParar = true; guardarAnalises(analises().map(a => (a.chave === reg.chave ? { ...a, marcado: false } : a))); desenhar(); status('Parei: o ER deixou de responder no meio da análise. Entre no ER com a conta da Mesa e clique em "1. Analisar" de novo (as conversas que ficaram sem o ER são refeitas).'); break; }
          if (/chave do Gemini recusada|limite de uso|limite diário|recusou o pedido|nenhum modelo do Gemini/.test(reg.erro || '')) { rdParar = true; status('Parei: ' + reg.erro + '.'); break; }
          // o Gemini não está respondendo: para em vez de esperar em cada uma das próximas conversas
          semResposta = /não respondeu/.test(reg.erro || '') ? semResposta + 1 : 0;
          if (semResposta >= CONFIG.RD_FALHAS_SEGUIDAS) {
            rdParar = true;
            status('Parei: o Gemini não respondeu em ' + semResposta + ' conversas seguidas (modelo ' + (modeloAuto || '?') + '). ' +
              'Tente de novo em alguns minutos.');
            break;
          }
          await sleep(CONFIG.RD_PAUSA_IA);
        }
      } finally {
        rdRodando = false; rdMarcarSegundoPlano();
        // as que iam ser refeitas e não foram (parou antes ou saíram da lista) voltam como estavam
        const agora = new Set(analises().map(a => a.chave)), faltam = refeitas.filter(a => !agora.has(a.chave));
        if (faltam.length) { guardarAnalises([...analises(), ...faltam]); desenhar(); }
      }
      const x = analises();
      if (!/^Parei/.test(st.textContent)) status((rdParar ? 'Análise interrompida. ' : 'Análise concluída. ') + x.filter(a => !a.erro && !a.encerrado).length + ' prontos para encerrar, ' + x.filter(a => a.erro).length + ' com erro. Revise as categorias e clique em "2. Encerrar marcados".');
    };

    /* ---- conversa escolhida pelo funcionário (antes das 24 h): a que está aberta no RD agora ---- */
    // usada pelo botão do painel e pelo botão "Analisar (IA)" do topo do atendimento
    // (as mensagens começam com "Análise" para o painel não trocá-las pela contagem da lista ao abrir)
    // Roda em segundo plano: só a LEITURA da conversa (mensagens, telefone, Perfil) segura o botão; depois disso o
    // funcionário já pode abrir outra conversa e analisar, enquanto a IA e o ER terminam a anterior.
    async function analisarConversaAberta(opc) {
      opc = opc || {};
      if (rdRodando) return status('Análise: já tem uma análise das vencidas ou um encerramento em andamento; aguarde terminar.');
      if (rdLendo) return status('Análise: ainda estou lendo a conversa anterior; aguarde um instante e clique de novo.');
      if (!GM_getValue('geminiChave', '')) { cfgBox.open = true; return status('Análise: informe a chave do Gemini em "Configuração do Gemini".'); }
      // sem o ER respondendo não analisa (a linha sairia sem proposta, vendedor e filial); a conferência vale alguns segundos
      rdLendo = true; let erFora = ''; try { erFora = await erConferir(); } finally { rdLendo = false; }
      if (erFora) return status('Análise: não analisei, ' + erFora);
      const l = lista();
      const it = l && [...l.children].find(y => { const n = nomeDoItem(y); return n && abertaE(n); });
      if (!it) return status('Análise: abra no RD a conversa que quer encerrar (ela precisa estar na lista "Meus atendimentos") e clique de novo.');
      const nome = nomeDoItem(it);
      if (emAnalise.has(nome)) return status('Análise da conversa aberta: ' + nome + ' já está sendo analisada.');
      const ja = analises().find(a => a.chave === nome);
      if (ja && !ja.erro) return status('Análise da conversa aberta: ' + (ja.encerrado ? 'esta conversa já foi encerrada hoje pelo painel.' : 'esta conversa já está na lista, pronta para revisar e encerrar.'));
      if (ja) guardarAnalises(analises().filter(a => a.chave !== nome));   // tinha dado erro: analisa de novo
      rdAbertas++; rdLendo = true; emAnalise.add(nome);
      const fimLeitura = () => { if (!rdLendo) return; rdLendo = false; if (opc.aoLer) opc.aoLer(); };
      status('Analisando a conversa aberta: ' + nome + '...');
      try {
        const reg = await analisarItem(it, nome, 'Analisando a conversa aberta: ' + nome, motivoDoItem(it) || 'escolhida antes das 24 h', fimLeitura);
        fimLeitura();
        guardarAnalises([...analises(), reg]);
        desenhar();
        status('Análise da conversa aberta: ' + (reg.erro ? 'não deu para analisar ' + reg.nome + ': ' + reg.erro + '.' : reg.nome + ' entrou na lista (marcada). Revise e clique em "2. Encerrar marcados".'));
      } finally { fimLeitura(); rdAbertas--; emAnalise.delete(nome); rdMarcarSegundoPlano(); }
    }
    btAberta.onclick = () => analisarConversaAberta();

    /* ---- botão "Analisar (IA)" no topo do atendimento, junto de Transferir / Encerrar ----
       Fica FORA da árvore do React do RD: posição fixa calculada a partir dos botões do topo (à esquerda deles), para
       não quebrar a tela quando o RD redesenha o cabeçalho. Some quando não há conversa aberta ou há uma janela aberta.
       Não abre o painel: o texto do botão mostra a situação da conversa aberta e o botão do canto, o resultado. */
    const btIA = el('button', 'position:fixed;z-index:2147483645;display:none;align-items:center;gap:6px;border:0;border-radius:8px;padding:0 16px;background:#bdf2ff;color:#0b4a6b;font:700 15px/1 system-ui,Segoe UI,Arial;cursor:pointer;white-space:nowrap', '✨ Analisar (IA)');
    const BT_IA_DICA = 'PaymobiFin: analisa esta conversa com a IA e coloca na lista para encerrar (mesmo antes das 24 h). A análise continua em segundo plano: pode abrir a próxima conversa assim que o botão sair de "Lendo a conversa".';
    btIA.title = BT_IA_DICA;
    document.body.appendChild(btIA);
    // situação da conversa aberta: lendo (espere) · em análise · já na lista / encerrada · com erro · livre
    const pintarBotaoIA = () => {
      const nome = nomeNoTopo(), a = nome ? analises().find(x => x.chave === nome) : null;
      const [txt, ocupado, dica] = rdLendo ? ['⏳ Lendo a conversa…', true, 'Lendo as mensagens e o Perfil: espere terminar antes de trocar de conversa.']
        : nome && emAnalise.has(nome) ? ['⏳ Analisando…', true, 'A IA está analisando esta conversa. Pode abrir outra conversa enquanto isso.']
        : a && a.encerrado ? ['✓ Encerrada hoje', false, 'Esta conversa já foi encerrada hoje pelo painel.']
        : a && !a.erro ? ['✓ Na lista', false, 'Esta conversa já está na lista do painel, pronta para revisar e encerrar (botão do canto).']
        : a && a.erro ? ['⚠ Analisar de novo', false, 'A última análise deu erro: ' + a.erro + '. Clique para analisar de novo.']
        : ['✨ Analisar (IA)', false, BT_IA_DICA];
      const extra = rdAbertas > (nome && emAnalise.has(nome) ? 1 : 0) ? ' · ⏳' + rdAbertas : '';
      if (btIA.textContent !== txt + extra) btIA.textContent = txt + extra;
      btIA.dataset.ocupado = ocupado ? '1' : ''; btIA.style.cursor = ocupado ? 'progress' : 'pointer'; btIA.style.opacity = ocupado ? '.85' : '1';
      btIA.title = dica + (rdAbertas ? '\n\nEm análise agora: ' + [...emAnalise].join(', ') : '');
    };
    const posicionarBotaoIA = () => {
      const enc = document.querySelector('button[aria-label=Encerrar]');
      const r = enc && enc.getBoundingClientRect();
      if (!r || !r.height || dialogos().length) { btIA.style.display = 'none'; return; }
      try { pintarBotaoIA(); } catch (_) {}
      // botões do topo na mesma linha do Encerrar (⋮, telefone, Transferir, Encerrar): o nosso fica à esquerda de todos
      const linha = [...((cabecalho() || document).querySelectorAll('button'))].filter(b => { const q = b.getBoundingClientRect(); return q.height && Math.abs(q.top - r.top) < 12 && q.right <= r.right + 1; });
      const esq = Math.min(r.left, ...linha.map(b => b.getBoundingClientRect().left));
      btIA.style.display = 'inline-flex';
      btIA.style.height = r.height + 'px';
      btIA.style.top = r.top + 'px';
      btIA.style.left = Math.max(0, esq - btIA.offsetWidth - 12) + 'px';
    };
    setInterval(posicionarBotaoIA, CONFIG.RD_BOTAO_MS);
    setInterval(rdMarcarSegundoPlano, CONFIG.RD_BOTAO_MS);   // reserva: desliga o modo de segundo plano se algo terminar sem passar pelo status
    window.addEventListener('resize', posicionarBotaoIA);
    btIA.onclick = async () => {
      // confere a situação na hora do clique (o texto do botão pode estar atrasado alguns instantes depois de trocar de conversa)
      pintarBotaoIA();
      if (btIA.dataset.ocupado) return;
      const feito = analisarConversaAberta({ aoLer: posicionarBotaoIA });
      posicionarBotaoIA();
      await feito;
      posicionarBotaoIA();
    };

    /* ---- etapa 2: encerrar (fluxo da própria tela) ---- */
    // sem "view": no Tampermonkey o "window" do script não é a janela da página e o navegador recusa o evento
    const clicar = e => { ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => e.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }))); };
    // janela de encerrar: o modal que abre ao clicar em Encerrar. Com a janela do WhatsApp ainda aberta (conversa
    // escolhida antes das 24 h) o RD pode mostrar o modal com outro título, mais campos ou outro botão de confirmar.
    const visivelRD = e => !!e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dialogos = () => [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true]')].filter(visivelRD);
    const janela = () => dialogos().find(d => /Encerrar atendimento|encerrar|finalizar/i.test(d.textContent) && d.querySelector('button'));
    const fecharJanela = async d => {
      const x = d && (d.querySelector('button[aria-label=close]') || [...d.querySelectorAll('button')].find(b => /^(cancelar|fechar|voltar)$/i.test(b.textContent.trim())));
      if (x) { x.click(); await esperar(() => !visivelRD(d) || !d.isConnected, 3); }
    };
    const habilitado = b => b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
    // botão que confirma o encerramento (não o de fechar/cancelar)
    const botaoConfirmar = d => [...d.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') !== 'close' && !/^(cancelar|fechar|voltar|close icon)$/i.test(b.textContent.trim()))
      .find(b => /^(encerrar|finalizar|confirmar|concluir|sim)\b/i.test(b.textContent.trim()));
    // o que a janela tem, para o aviso quando não dá para encerrar (sem dados do cliente)
    const resumoJanela = d => {
      if (!d) return 'nenhuma janela aberta';
      const tit = String((d.querySelector('[id*=itle], h1, h2, h3, h4, [class*=Title], [class*=Header]') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const bts = [...d.querySelectorAll('button')].map(b => b.textContent.trim() + (habilitado(b) ? '' : ' (desativado)')).filter(t => t && t !== 'Close Icon').slice(0, 6);
      const campos = [...d.querySelectorAll('label, legend')].map(l => l.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5);
      const obrig = [...d.querySelectorAll('input, textarea, select')].filter(i => (i.required || i.getAttribute('aria-required') === 'true') && !String(i.value || '').trim()).length;
      return 'janela "' + tit + '" · botões: ' + (bts.join(', ') || 'nenhum') + (campos.length ? ' · campos: ' + campos.join(', ') : '') + (obrig ? ' · ' + obrig + ' campo(s) obrigatório(s) vazio(s)' : '');
    };
    // qualquer falha no meio do caminho fecha a janela (nada fica aberto por cima da próxima conversa) e diz o que ela tinha
    // nome: a conversa que está sendo encerrada (a lista do RD tirar o item dela também confirma o encerramento)
    async function encerrarAberto(categoria, nome) {
      try { await encerrarPassos(categoria, nome); }
      catch (e) {
        const d = janela();
        if (!/\(janela "/.test(e.message)) e.message += ' (' + resumoJanela(d) + ')';
        await fecharJanela(d);
        throw e;
      }
    }
    async function encerrarPassos(categoria, nome) {
      const bt = document.querySelector('button[aria-label=Encerrar]') || [...((cabecalho() || document).querySelectorAll('button'))].find(b => /^encerrar$/i.test(b.textContent.trim()));
      if (!bt) throw new Error('botão Encerrar não encontrado');
      const antes = new Set(dialogos());
      bt.click();
      // a janela nova (a que apareceu depois do clique); se não der para saber, a que fala em encerrar
      const d = await esperar(() => dialogos().find(x => !antes.has(x) && x.querySelector('button')) || janela());
      if (!d) throw new Error('a janela de encerrar não abriu');
      // categoria: abre cada lista da janela até achar a que tem as categorias PaymobiFin (o dropdown pode estar fora do modal)
      const listaDe = g => [d, document.getElementById(g.getAttribute('aria-owns') || g.getAttribute('aria-controls') || '')].filter(Boolean);
      const acharOpcao = g => { for (const raiz of listaDe(g)) { const o = [...raiz.querySelectorAll('[role=option]')].find(x => rdNorm(x.textContent) === rdNorm(categoria)); if (o) return o; } return null; };
      const gatilhos = [...d.querySelectorAll('[aria-haspopup=listbox], [role=combobox]')];
      if (!gatilhos.length) throw new Error('a janela não tem a lista de categorias');
      let op = null;
      for (const g of gatilhos) {
        if (g.getAttribute('aria-expanded') !== 'true') clicar(g);
        op = await esperar(() => acharOpcao(g), 5);
        if (op) break;
        if (g.getAttribute('aria-expanded') === 'true') clicar(g);   // não era esta lista: fecha e tenta a próxima
      }
      if (!op) throw new Error('categoria não encontrada na lista do RD: ' + categoria);
      op.scrollIntoView({ block: 'nearest' }); clicar(op);
      const conf = await esperar(() => { const b = botaoConfirmar(d); return habilitado(b) ? b : null; });
      if (!conf) throw new Error('o botão de confirmar da janela não liberou');
      const abertasAntes = new Set(dialogos());
      conf.click();
      // segunda confirmação ("Tem certeza?"), se o RD pedir: confirma uma vez
      let confirmouDeNovo = false;
      // encerrou = a janela fechou OU a conversa saiu da lista "Meus atendimentos" (o RD encerrou; a janela é que demora a
      // sumir, ex.: animação ou aba em segundo plano). Antes só a janela contava, e uma conversa já encerrada no RD ficava
      // como "não encerrado" e sem a linha da planilha.
      const saiuDaLista = () => !!nome && !!lista() && !itemPorNome(nome);
      const fechou = await esperar(() => {
        if (!confirmouDeNovo) {
          const nova = dialogos().find(x => !abertasAntes.has(x) && x !== d);
          const b2 = nova && botaoConfirmar(nova);
          if (habilitado(b2)) { b2.click(); confirmouDeNovo = true; }
        }
        return !visivelRD(d) || !d.isConnected || saiuDaLista();
      });
      if (!fechou) { const e = new Error('a janela de encerrar não fechou'); e.depoisDeConfirmar = true; throw e; }
      if (visivelRD(d) && d.isConnected) await fecharJanela(d);   // encerrou com a janela ainda na tela: fecha a que sobrou
    }
    const linhaPlanilha = a => {
      const etiqueta = (a.etiquetas || []).find(t => /^(xpanse|mundo amarelo)/i.test(t)) || 'N/A';
      const tel = String(a.telefone || '').replace(/^55(?=\d{10,11}$)/, '');
      return [tel || 'N/A', a.data || rdHoje(), etiqueta, a.solicitacao || 'N/A', a.proposta || 'N/A', a.nomeCliente || 'N/A', a.cpf || 'N/A', a.vendedor || 'N/A', a.filial || 'N/A', 'RD', a.observacoes || 'N/A', a.tabulacao, a.tipo || 'Cliente'];
    };
    btEncerrar.onclick = async () => {
      if (rdRodando) return;
      if (rdAbertas) return status('Aguarde: ' + rdAbertas + ' análise(s) do botão "Analisar (IA)" ainda em andamento.');
      const alvo = analises().filter(a => a.marcado && !a.erro && !a.encerrado);
      if (!alvo.length) return status('Nenhum atendimento marcado para encerrar.');
      const resumo = {}; alvo.forEach(a => { resumo[a.tabulacao] = (resumo[a.tabulacao] || 0) + 1; });
      if (!confirm('Encerrar ' + alvo.length + ' atendimento(s)?\n\n' + Object.entries(resumo).map(([c, n]) => n + ' × ' + c).join('\n') + '\n\nNão dá para retomar um atendimento encerrado.')) return;
      rdRodando = true; rdParar = false;
      let ok = 0, falhas = 0;
      try {
        for (const a of alvo) {
          if (rdParar) break;
          status('Encerrando ' + (ok + falhas + 1) + ' de ' + alvo.length + ': ' + a.nome + '...');
          const x = analises(), i = x.findIndex(y => y.chave === a.chave);
          try {
            const it = itemPorNome(a.chave);
            // já não está na lista (encerrada por fora ou numa tentativa anterior, transferida, ou escondida por busca/filtro
            // do RD): não adianta tentar de novo sozinho. Desmarca e o cartão oferece "incluir na planilha" ou "tentar de novo".
            if (!it) { const e = new Error('não está mais na lista de atendimentos'); e.sumiu = true; throw e; }
            if (!(await abrirConversa(it))) throw new Error('a conversa não abriu');
            // o RD troca o nome no topo antes do telefone (o da conversa anterior fica alguns instantes): espera o telefone certo
            if (!(await esperar(() => { vigiarTopo(); return telefoneConfere(a.telefone); }))) throw new Error('a conversa aberta não é a analisada (telefone no topo …' + telefonesAbertos().map(t => t.slice(-4)).join(', …') + '; analisada …' + String(a.telefone).slice(-4) + ')');
            await encerrarAberto(a.tabulacao, a.chave);
            guardarLinha(linhaPlanilha(a)); pintarCopiar();
            x[i].encerrado = true; delete x[i].erroEncerrar; delete x[i].sumiu; ok++;
          } catch (e) {
            if (e.depoisDeConfirmar && !itemPorNome(a.chave)) {
              // confirmou e a conversa saiu da lista: o RD encerrou (só a janela demorou a fechar) — conta e vai para a planilha
              guardarLinha(linhaPlanilha(a)); pintarCopiar();
              x[i].encerrado = true; delete x[i].erroEncerrar; delete x[i].sumiu; ok++;
            } else if (e.sumiu) { x[i].sumiu = true; x[i].marcado = false; x[i].erroEncerrar = e.message; falhas++; }
            else { x[i].erroEncerrar = e.message; falhas++; }   // continua analisada e marcada: dá para tentar encerrar de novo
          }
          guardarAnalises(x); desenhar();
          await sleep(CONFIG.PAUSA * 10);
        }
      } finally { rdRodando = false; rdMarcarSegundoPlano(); }
      status('Encerrados: ' + ok + (falhas ? ' · com erro: ' + falhas : '') + '. Clique em "Copiar linhas da planilha" e cole com Ctrl+Shift+V na planilha de encerramento.');
    };
    btParar.onclick = () => { rdParar = true; status('Parando depois da conversa atual...'); };
    const tsv = linhas => linhas.map(x => x.cols.map(v => String(v).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
    btCopiar.onclick = () => {
      const todas = linhasHoje();
      if (!todas.length) return status('Nenhum atendimento encerrado hoje por aqui.');
      const novas = todas.filter(x => !x.copiada);
      if (!novas.length) {
        // nada novo: só copia de novo se o funcionário pedir (ex.: perdeu a colagem)
        if (!confirm('Nenhuma linha nova desde a última cópia (as ' + todas.length + ' de hoje já foram copiadas).\n\nCopiar de novo as ' + todas.length + ' linhas de hoje? Se já colou na planilha, elas vão ficar repetidas.')) return status('Nada copiado: as linhas de hoje já tinham sido copiadas.');
        GM_setClipboard(tsv(todas), 'text');
        return status(todas.length + ' linha(s) de hoje copiada(s) de novo (A a M). Atenção para não colar repetido.');
      }
      GM_setClipboard(tsv(novas), 'text');
      gravarLinhas(todas.map(x => ({ ...x, copiada: true })));
      pintarCopiar();
      status(novas.length + ' linha(s) nova(s) copiada(s) (colunas A a M da planilha de encerramento). Cole com Ctrl+Shift+V abaixo da última linha.' +
        (todas.length > novas.length ? ' As ' + (todas.length - novas.length) + ' que já tinham sido copiadas não foram de novo.' : ''));
    };
    btLimpar.onclick = () => {
      if (rdRodando) return;
      if (rdAbertas) return status('Aguarde: ' + rdAbertas + ' análise(s) do botão "Analisar (IA)" ainda em andamento.');
      const pendentes = linhasHoje().filter(x => !x.copiada).length;
      if (!confirm('Limpar a lista de conversas analisadas hoje e as linhas da planilha?' +
        (pendentes ? '\n\nAtenção: ' + pendentes + ' linha(s) de atendimentos encerrados ainda NÃO foram copiadas e vão ser perdidas. Clique em Cancelar e use "Copiar linhas da planilha" antes.' : ''))) return;
      GM_deleteValue('rdAnalises'); GM_deleteValue('rdLinhas'); desenhar(); pintarCopiar(); rdContar();
    };
  }

  /* ================= INÍCIO ================= */
  if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
  else if (location.hostname === 'app.tallos.com.br') { if (window.top === window) iniciarRD(); }
  else if (window.top === window) iniciarPainel();
})();
