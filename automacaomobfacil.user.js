// ==UserScript==
// @name         PaymobiFin - Relatório
// @name:pt-BR   PaymobiFin - Assistente
// @name:pt      PaymobiFin - Assistente
// @namespace    mobfacil-planilha
// @version      12.2
// @author       Arthur
// @description  PaymobiFin - Assistente: atendimento (negociação e renegociação), histórico da equipe, lembretes, relatórios, CCBs e troca rápida de contas
// @include      /^https?:\/\/paymobi\.ercard\.com\.br(:\d+)?\/.*/
// @include      https://enviamotor.mobfacil.com.br/*
// @homepageURL  https://github.com/arthursoaress7/Mobfacil-Automator/tree/main
// @downloadURL  https://github.com/arthursoaress7/Mobfacil-Automator/raw/refs/heads/main/automacaomobfacil.user.js
// @updateURL    https://github.com/arthursoaress7/Mobfacil-Automator/raw/refs/heads/main/automacaomobfacil.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      api-sa1.pusher.com
// @require      https://js.pusher.com/8.4.0/pusher.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // versão: lida do cabeçalho (@version) pelo Tampermonkey; o número só existe num lugar
  const VERSAO = 'v' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '12.2');
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
  };

  // janela da página (fora da sandbox do Tampermonkey): dá acesso aos objetos do próprio site
  const PAGINA = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // Preferências (aba Configurações). Valor padrão usado quando o usuário nunca alterou.
  const PADRAO = {
    auditoriaCompleta: true,         // CPF, motivo e dados da proposta (modelo Auditoria 2 Completo)
    ignorarCanceladasTestes: true,   // canceladas e testes nunca são processadas
    formatoAuto: true,               // formato de cópia escolhido pelo modo
    formatosAntigos: false,          // mostra os formatos antigos na escolha manual
    aparencia: 'nova',               // 'nova' (padrão) ou 'antiga'
    tema: 'claro',                   // 'claro' (padrão) ou 'escuro' (só cores; vale nas duas aparências)
    copiarAoConcluir: true,          // copia o resultado sozinho quando a fila termina
    trocaSemConfirmacao: true,
    lerAbaCliente: true, 
    tmExpedienteAuto: true,          // Timers: inicia os agendamentos "próximo expediente" ao entrar no ER
    cacTrocaAuto: true,              // Consulta CAC: troca sozinho para a conta master quando a atual não tem acesso
    cacVoltarConta: true,            // Consulta CAC: volta para a conta anterior depois da consulta
    cacPosicaoGeral: true,           // Consulta CAC: abre a Posição Geral (o sistema registra protocolo, como na tela)            // auditoria completa: telefone e e-mail pela aba Cliente da análise       // trocar de conta sem a janela de confirmação do script
    navAuto: true,                   // abre sozinho a tela do sistema que a função precisa (Mesa de Crédito, Fila de Propostas)
    equipeAtiva: false,              // sincronização da equipe (Pusher): só liga quando o funcionário configura
  };
  const cfg = k => GM_getValue(k, PADRAO[k]);

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
  const NOMES = { qtd: 'qtd restritivos', val: 'valor restritivos', score: 'score', consultas: 'consultas', cpf: 'cpf', reprov: 'motivo da reprovação' };
  // Auditoria completa inclui CPF e motivo; os dados de crédito são SEMPRE coletados.
  const campos = () => {
    const m = GM_getValue('modo', 'coleta');
    if (m === 'aprovadas') return ['cpf'];
    if (m === 'reprovadas') return ['reprov'];
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
    ['qtd', 'val', 'score', 'consultas', 'cpf', 'reprov'].forEach(k => {
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
        #mf-p[data-ui=nova] #mf-ccb-baixar,#mf-p[data-ui=nova] #mf-conta-trocar,#mf-p[data-ui=nova] #mf-ng-frases,#mf-p[data-ui=nova] #mf-at-registrar,#mf-p[data-ui=nova] #mf-at-plano-gerar,#mf-p[data-ui=nova] #mf-eq-salvar,#mf-p[data-ui=nova] #mf-bs-buscar{background:#2563eb;color:#fff;border-color:#2563eb}
        #mf-p[data-ui=nova] #mf-cop,#mf-p[data-ui=nova] #mf-ng-copiar,#mf-p[data-ui=nova] #mf-at-copiar,#mf-p[data-ui=nova] #mf-at-msg-copiar,#mf-p[data-ui=nova] #mf-dval,#mf-p[data-ui=nova] #mf-dlin{background:#16a34a;color:#fff;border-color:#16a34a}
        #mf-p[data-ui=nova] #mf-ini:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-gerar:hover,#mf-p[data-ui=nova] #mf-cac-buscar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-tm-criar:hover,
        #mf-p[data-ui=nova] #mf-lb-salvar:hover,#mf-p[data-ui=nova] #mf-ccb-baixar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-conta-trocar:hover:not(:disabled),#mf-p[data-ui=nova] #mf-ng-frases:hover,#mf-p[data-ui=nova] #mf-bs-buscar:hover:not(:disabled){background:#1d4ed8}
        #mf-p[data-ui=nova] #mf-cop:hover,#mf-p[data-ui=nova] #mf-ng-copiar:hover,#mf-p[data-ui=nova] #mf-at-copiar:hover,#mf-p[data-ui=nova] #mf-at-msg-copiar:hover,#mf-p[data-ui=nova] #mf-dval:hover,#mf-p[data-ui=nova] #mf-dlin:hover{background:#15803d}
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
        html[data-mf-tema=escuro] .box,html[data-mf-tema=escuro] .box-header,html[data-mf-tema=escuro] .box-body,html[data-mf-tema=escuro] .box-footer,html[data-mf-tema=escuro] .nav-tabs-custom,html[data-mf-tema=escuro] .nav-tabs-custom>.tab-content,html[data-mf-tema=escuro] .nav-tabs-custom>.nav-tabs,html[data-mf-tema=escuro] .panel,html[data-mf-tema=escuro] .panel-body,html[data-mf-tema=escuro] .panel-heading,html[data-mf-tema=escuro] .panel-footer,html[data-mf-tema=escuro] .well,html[data-mf-tema=escuro] .info-box,html[data-mf-tema=escuro] .modal-content,html[data-mf-tema=escuro] .modal-header,html[data-mf-tema=escuro] .modal-footer,html[data-mf-tema=escuro] .dropdown-menu,html[data-mf-tema=escuro] .popover,html[data-mf-tema=escuro] .list-group-item,html[data-mf-tema=escuro] .callout.callout-default,html[data-mf-tema=escuro] .jumbotron{background:#1e293b !important;color:#e2e8f0 !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .nav-tabs>li>a,html[data-mf-tema=escuro] .nav-tabs-custom>.nav-tabs>li>a,html[data-mf-tema=escuro] .nav-pills>li>a{color:#cbd5e1 !important}
        html[data-mf-tema=escuro] .nav-tabs>li.active>a,html[data-mf-tema=escuro] .nav-tabs>li.active>a:hover,html[data-mf-tema=escuro] .nav-tabs-custom>.nav-tabs>li.active>a{background:#1e293b !important;color:#93c5fd !important;border-color:#334155 !important}
        html[data-mf-tema=escuro] .dropdown-menu>li>a{color:#e2e8f0 !important}
        html[data-mf-tema=escuro] .dropdown-menu>li>a:hover,html[data-mf-tema=escuro] .dropdown-menu>.active>a{background:#334155 !important}
        html[data-mf-tema=escuro] .close,html[data-mf-tema=escuro] .modal-header .close{color:#e2e8f0 !important;text-shadow:none !important;opacity:.8}
        html[data-mf-tema=escuro] .table,html[data-mf-tema=escuro] .table>thead>tr>th,html[data-mf-tema=escuro] .table>tbody>tr>td,html[data-mf-tema=escuro] .table>tbody>tr>th,html[data-mf-tema=escuro] .table>tfoot>tr>td,html[data-mf-tema=escuro] .table>tfoot>tr>th,html[data-mf-tema=escuro] .table-bordered,html[data-mf-tema=escuro] .table-bordered>thead>tr>th,html[data-mf-tema=escuro] .table-bordered>tbody>tr>td{color:#e2e8f0 !important;border-color:#334155 !important}
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
      </style>
      <div class="mf-top" title="Arraste para mover o painel"><div><b>${TITULO}</b><small id="mf-versao" title="Clique 7 vezes para a mensagem secreta">${VERSAO}</small><span id="mf-lb-badge-topo" class="mf-badge" style="display:none;cursor:pointer;margin-left:6px"></span><span id="mf-tm-topo" style="display:none;cursor:pointer;margin-left:6px;font-size:12px;background:#334155;border-radius:9px;padding:1px 7px"></span></div>
        <button id="mf-tam" class="mf-mini" type="button" title="Ampliar o painel">⤢</button><button id="mf-tema" class="mf-mini" type="button" title="Ativar o modo escuro">🌙</button><button id="mf-min" class="mf-mini" title="Minimizar / expandir">—</button></div>
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
            <details class="mf-grupo" id="mf-at-g-cliente" open><summary>Cliente</summary>
              <div class="mf-linha" style="flex-wrap:wrap;gap:6px;margin:2px 0 6px">
                <button id="mf-at-aplicar" class="cinza mf-bs-mini" title="Preenche com o cliente da busca do topo. O número de contato nunca é preenchido pelo telefone da proposta.">Aplicar cliente atual</button>
              </div>
              <div id="mf-at-cliente" class="mf-grade"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-cobranca"><summary>Cobrança</summary>
              <div id="mf-at-cobranca" class="mf-grade"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-acordo" open><summary>Acordo</summary>
              <div class="mf-grade">
                <label class="mf-lb-rot" id="mf-at-resultado-rot">Resultado *<select id="mf-ng-frase-tipo">
                  <option value="fechou">Cliente fechou (acordo realizado)</option>
                  <option value="solicitou">Cliente solicitou (simulação / pendente)</option>
                  <option value="nao">Negociação não concluída</option>
                </select></label>
                <label class="mf-lb-rot">Modalidade *<select id="mf-at-modalidade"></select></label>
              </div>
              <div id="mf-at-modal" style="margin-top:6px"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-reneg" open><summary>Renegociação</summary>
              <div id="mf-at-reneg" class="mf-grade"></div>
              <div class="mf-tit" style="margin-top:10px">Plano de parcelas</div>
              <div id="mf-at-plano-cfg" class="mf-grade"></div>
              <button id="mf-at-plano-gerar" class="azul" style="width:100%;margin-top:6px">Montar parcelas</button>
              <div id="mf-at-plano" style="margin-top:6px"></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-textos" open><summary>Textos da planilha</summary>
              <button id="mf-ng-frases" class="azul" style="width:100%;margin-bottom:8px">Gerar textos</button>
              <label class="mf-lb-rot"><span id="mf-at-rot-pedido">Pedido do cliente</span><textarea id="mf-ng-f-pedido" style="height:54px"></textarea></label>
              <button id="mf-ng-copiar-pedido" class="cinza" style="width:100%;margin:4px 0 8px">Copiar</button>
              <label class="mf-lb-rot">Acordo Realizado<textarea id="mf-ng-f-acordo" style="height:54px"></textarea></label>
              <button id="mf-ng-copiar-acordo" class="cinza" style="width:100%;margin-top:4px">Copiar</button>
              <div class="mf-linha" id="mf-at-linha-parcela" style="margin-top:8px"><input id="mf-ng-f-parcela" type="text" placeholder="A partir de qual parcela" style="flex:1"><button id="mf-ng-copiar-parcela" class="cinza" style="padding:7px 9px">Copiar</button></div>
            </details>
            <details class="mf-grupo" id="mf-at-g-acomp"><summary>Acompanhamento (opcional)</summary>
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
            <details class="mf-grupo" id="mf-ng-dados" open><summary>Dados</summary>
              <div id="mf-ng-slot"><div id="mf-ng-campos"></div></div>
            </details>
            <details class="mf-grupo" id="mf-ng-saida" open><summary>Texto</summary>
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
          </details>
          <details class="mf-grupo" data-grupo="cac"><summary>Consulta CAC</summary>
            <label class="mf-lb-rot">Conta master (acessa o CAC)<select id="mf-cac-master"></select></label>
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
    painel.dataset.tema = cfg('tema') === 'escuro' ? 'escuro' : 'claro';   // tema aplicado antes de mostrar (sem "piscar")
    document.documentElement.dataset.mfTema = painel.dataset.tema;          // os avisos fora do painel (pop-ups) seguem o mesmo tema
    document.body.appendChild(painel);
    const $ = s => painel.querySelector(s);
    const msg = t => ($('#mf-msg').textContent = t);
    const idsDaCaixa = () => $('#mf-lista').value.split(/\s+/).filter(Boolean);

    /* ---------- abas ---------- */
    const mostrarAba = a => {
      if (!['rel', 'ccb', 'cac', 'cta', 'neg', 'his', 'lem', 'tim', 'cfg'].includes(a)) a = 'neg';
      painel.querySelectorAll('[data-pag]').forEach(p => { p.style.display = p.dataset.pag === a ? 'block' : 'none'; });
      painel.querySelectorAll('.mf-abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === a));
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

    /* ---- telas do sistema que algumas funções precisam (ver "NAVEGAÇÃO AUTOMÁTICA" no fim) ---- */
    const TELAS = {
      mesa: { nome: 'Mesa de Crédito', menu: 'MesaCredito', pronta: () => !!document.querySelector('#tabMesaCreditoLista') },
      fila: { nome: 'Fila de Propostas', menu: 'FilaPropostas', pronta: () => !!document.querySelector('#tabPropostasLista, #txtPropostasPesquisa') },
    };
    let navOcupado = false;
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
        while (!tela.pronta() && Date.now() < ate) await sleep(250);
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
    const MODOS = ['coleta', 'reprovadas', 'efetivadas', 'aprovadas', 'valortransacao'];
    // formato automático: cada modo usa o mais adequado ao destino
    const FORMATO_AUTO = { coleta: 'excel', reprovadas: 'canva', efetivadas: 'canva', aprovadas: 'canva', valortransacao: 'excel' };
    const NOME_MODO = { coleta: 'Auditoria', reprovadas: 'Reprovadas', efetivadas: 'Efetivadas', aprovadas: 'Aprovadas', valortransacao: 'Diário' };
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
      $('#mf-cop').style.display = $('#mf-cid').style.display = diario ? 'none' : '';
      $('#mf-cfull').style.display = coleta && cfg('auditoriaCompleta') ? '' : 'none';
      $('#mf-filtro').textContent = cfg('ignorarCanceladasTestes') ? 'Ignorando canceladas e testes' : 'Incluindo canceladas e testes';
    }
    $('#mf-modo').addEventListener('change', () => { GM_setValue('modo', modo()); atualizarConfigUI(); });
    const ligarOpcao = (sel, chave) => {
      $(sel).checked = cfg(chave);
      $(sel).addEventListener('change', () => { GM_setValue(chave, $(sel).checked); atualizarConfigUI(); });
    };
    ligarOpcao('#mf-audit-full', 'auditoriaCompleta');
    ligarOpcao('#mf-canc', 'ignorarCanceladasTestes');
    ligarOpcao('#mf-auto-copia', 'copiarAoConcluir');
    ligarOpcao('#mf-formato-auto', 'formatoAuto');
    ligarOpcao('#mf-formatos-antigos', 'formatosAntigos');
    ligarOpcao('#mf-troca-direta', 'trocaSemConfirmacao');
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
      aprovadas: sit => /\bapr\b|aprovad/i.test(sit) && !/efetivad/i.test(sit),
      valortransacao: () => true,   // todas as propostas da lista
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
      if ((/efetivad|\bapr\b|aprovad/i.test(mt.sit)) && manual) return 'Aprovado manual';
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
        const nv = e.valor ? num(e.valor) : null;                         // "R$1.864,00" -> "1864,00" (Excel pt-BR)
        cols = [na(nv ? nv.split(',')[0] + ',' + (((nv.split(',')[1] || '') + '00').slice(0, 2)) : '')];
      } else if (m === 'efetivadas') {
        cols = [id, na(x.cli), na(e.vendedor), '', na(hh), na(loja.toUpperCase())];   // Acesso ao APP: à mão (fica vazio)
      } else {
        const c = d && d.cpf ? d.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
        cols = [id, na(x.cli), na(c), 'XPANSE - ' + loja.toUpperCase(), na(e.vendedor), na(e.valor), 'Aprovada, não efetivada'];
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
      for (const a of DETALHES) {
        const nome = a.split('?')[0].split('/').pop();
        const ctl = new AbortController();
        const tm = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_REDE * 1000);
        try {
          const html = await (await fetch(raiz + a + id, { credentials: 'include', signal: ctl.signal })).text();
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
      if (e.situacao && /cancelad/i.test(e.situacao)) return 'cancelada';
      if (ehTeste([e.cliente, e.vendedor])) return 'teste';
      return null;
    }
    // depois de ler o detalhe (auditoria completa e relatórios): cliente ou digitador "TESTE" = proposta de teste
    const motivoDetalhe = e => (e && e.situacao && /cancelad/i.test(e.situacao) ? 'cancelada' : e && ehTeste([e.cliente, e.vendedor]) ? 'teste' : null);
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
      if (/efetivad|\bapr\b|aprovad/i.test(mt.sit)) return manual ? 'Aprovada Manual' : 'Aprovada Automática';
      return 'Pendente';
    };
    const linhaDiario = (id, mt, processada) => {
      const v = x => (x ? x : processada && !mt ? NA : '');
      const m = mt || {};
      return [m.acoes || '', id, v(m.sit), m.ind || '', v(m.dh), v(m.dts), v(m.cli), v(m.ana), v(m.prod), v(m.loja), v(statusDiario(mt)), ''];
    };
    // "R$1.864,00" -> "R$ 1.864,00" (o Excel em português reconhece como moeda)
    const valorDiario = (e, processada) => {
      const n = e && e.valor ? num(e.valor) : null;
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
      if (m === 'valortransacao') return ativos.filter(id => !(ex[id] && ex[id].valor)).map(id => id + ' (sem valor de transação)');
      if (m === 'efetivadas') return ativos.filter(id => !(ex[id] && ex[id].vendedor)).map(id => id + ' (falta: vendedor)');
      if (m === 'aprovadas') {
        return ativos.map(id => {
          const f = [];
          if (!(dados[id] && dados[id].cpf)) f.push('cpf');
          if (!(ex[id] && ex[id].vendedor)) f.push('vendedor');
          if (!(ex[id] && ex[id].valor)) f.push('valor');
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
        const pg = (GM_getValue('extraDbg', {})[id] || {}).paginas || [];
        etapa(id, 'detalhe da proposta', pg.some(x => /erro/.test(x)) ? 'erro ao abrir página' : 'ok');
      }
      if (m === 'coleta' && cfg('auditoriaCompleta') && cfg('lerAbaCliente')) {
        etapa(id, 'aba Cliente');
        const cli = await dadosCliente(base, id);
        etapa(id, 'aba Cliente', cli.ok ? 'ok' : cli.motivo);
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
        if (m === 'valortransacao' && !extra.valor && ((GM_getValue('extraDbg', {})[id] || {}).paginas || []).some(x => /erro/.test(x))) return 'página da proposta não carregou';
        if (m === 'efetivadas' && !extra.vendedor) return 'vendedor não localizado';
        if (m === 'aprovadas' && (!extra.vendedor || !extra.valor)) return 'vendedor ou valor não localizado';
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
      msg(aviso +
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
        const semConf = todasLinhas.filter(l => !ehConfCad(l.sit));   // CONF CAD fora de todos os relatórios
        confCadIgnoradas = todasLinhas.length - semConf.length;
        const elegiveis = semConf.filter(l => FILTROS[m](l.sit));
        const linhas = elegiveis.filter(l => !(ign && motivoIgnorar(l.cels)));
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
      if (ign) ids.forEach(id => { const l = porId[id]; const mot = l && motivoIgnorar(l.cels); if (mot) novasIgnoradas[id] = mot; });
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
      if (!confirm('Resetar tudo? Isso apaga os dados coletados, a fila e o progresso.')) return;
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
      if (/situa/.test(ths[2] || '') && /client|nome/.test(ths[3] || '')) return COLS_FILA;
      const sit = ths.findIndex(x => /situa/.test(x)), cli = ths.findIndex(x => /client|nome/.test(x)), ass = ths.findIndex(x => /assina/.test(x));
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
    const guardarSenha = (usuario, senha) => {
      const sx = senhas();
      if (senha) sx[usuario.toLowerCase()] = senha; else delete sx[usuario.toLowerCase()];
      if (Object.keys(sx).length) GM_setValue('senhasContas', sx); else GM_deleteValue('senhasContas');
    };
    $('#mf-conta-ver').onclick = () => { const i = $('#mf-conta-senha'); i.type = i.type === 'password' ? 'text' : 'password'; };
    // Mesa <-> Master: ao entrar numa das duas, a opção do seletor já vem na outra (só pré-seleciona; quem troca é o botão Trocar)
    let ultimaAtivaSug = null;
    const textoConta = c => (c.usuario + ' ' + (c.apelido || '')).toLowerCase();
    function sugerirContaDestino() {
      const lista = contas(), a = contaAtiva();
      if (!a || a.naoCadastrada || lista.length < 2) return;
      const mst = String(GM_getValue('cacContaMaster', '') || '').toLowerCase();
      const iMaster = lista.findIndex(c => mst ? c.usuario.toLowerCase() === mst : /master/.test(textoConta(c)));
      const iMesa = lista.findIndex((c, i) => i !== iMaster && /mesa/.test(textoConta(c)));
      if (iMaster < 0 || iMesa < 0) return;
      const ativa = a.usuario.toLowerCase();
      const alvo = ativa === lista[iMesa].usuario.toLowerCase() ? iMaster : ativa === lista[iMaster].usuario.toLowerCase() ? iMesa : -1;
      if (alvo >= 0) $('#mf-conta-sel').value = String(alvo);
    }
    function verificarContaSugerida() {
      const a = contaAtiva(), k = a ? a.usuario.toLowerCase() : '';
      if (k === ultimaAtivaSug) return;
      ultimaAtivaSug = k;
      sugerirContaDestino();
    }
    setInterval(verificarContaSugerida, 1500);
    function desenharContas() {
      const lista = contas();
      const sel = $('#mf-conta-sel');
      const escolhida = sel.value;   // mantém a escolha manual enquanto a conta ativa não mudar
      sel.innerHTML = '';
      lista.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = rotuloConta(c); sel.appendChild(o); });
      if (escolhida !== '' && sel.querySelector('option[value="' + escolhida + '"]')) sel.value = escolhida;
      setTimeout(verificarContaSugerida);
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
            msg('O login automático de ' + t.usuario + ' não foi concluído. Confira a mensagem do sistema e a senha salva (aba Contas) e entre manualmente.');
          }, 10000);
          return;
        }
        if (t.etapa === 'enviado') GM_setValue('trocaConta', { ...t, etapa: 'falhou' });
        msg(!u ? 'Tela de login: não achei o campo de usuário. Entre com ' + t.usuario + '.'
          : t.etapa === 'enviado' || t.etapa === 'falhou' ? 'O login automático de ' + t.usuario + ' não foi aceito. Confira a senha salva na aba Contas e entre manualmente (não tento de novo para não bloquear a conta).'
          : temCaptcha && pw ? 'Tela de login com verificação (captcha): usuário ' + t.usuario + ' preenchido; complete a verificação e entre.'
          : 'Tela de login: usuário ' + t.usuario + ' preenchido. Digite a senha (ou salve a senha na aba Contas para entrar sozinho).');
        return;
      }
      if (t.etapa === 'saindo' && Date.now() - t.quando < 3000) return;   // ainda é a página de onde saiu
      const a = contaAtiva();
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
      else lab.append(document.createTextNode(rot + (obrig ? ' *' : '')), inp);
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
    const ehLogin = t => /id=["']?frmLogin|id=["']?txtSenha/i.test(t || '');
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
        if (!r.ok || !tab) {
          const motivo = r.erro || (ehLogin(r.texto) ? 'a sessão expirou' : 'esta conta não tem acesso ao CAC (HTTP ' + r.status + ')');
          return cacSemAcesso(termo, motivo, extra);
        }
        let rows = [...tab.querySelectorAll('tbody tr[onclick*="Atendimento("]')].map(tr => {
          const m = tr.getAttribute('onclick').match(/Atendimento\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]/) || [];
          const td = [...tr.children].map(x => limpoTxt(x.textContent));
          return { produto: m[1] || '', conta: m[2] || '', cpf: (td[0] || '').replace(/\D/g, ''), nome: td[1] || '', produtoTxt: td[2] || '', situacao: td[4] || '', motivo: td[5] || '' };
        }).filter(x => x.produto && x.conta);
        const cpfBusca = /^\d{11}$/.test(termo) ? termo : '';
        if (cpfBusca) rows = rows.filter(x => x.cpf.startsWith(cpfBusca));
        if (!rows.length) { cacSSSet(null); cacStatus(''); return msg('CAC: nenhum cliente encontrado para "' + termo + '".'); }
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
      if (ngValores.contato && !telFormatar(ngValores.contato)) falta.push('Número de contato válido (DDD + número) ou deixe em branco');
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
      const relogin = document.querySelector('#dlgRelogin');
      if (relogin && (relogin.classList.contains('in') || getComputedStyle(relogin).display === 'block')) return null;   // sessão expirada
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

    /* ---- Tema claro / escuro: só troca data-tema (o CSS faz o resto); nenhuma função ou dado é tocado ---- */
    function aplicarTema(tema) {
      tema = tema === 'escuro' ? 'escuro' : 'claro';
      painel.dataset.tema = tema;
      document.documentElement.dataset.mfTema = tema;
      const bt = $('#mf-tema');
      bt.textContent = tema === 'escuro' ? '☀️' : '🌙';
      bt.title = tema === 'escuro' ? 'Voltar ao modo claro' : 'Ativar o modo escuro';
      $$ui('input[name="mf-ui-tema"]').forEach(r => { r.checked = r.value === tema; });
    }
    $('#mf-tema').onclick = () => { const novo = painel.dataset.tema === 'escuro' ? 'claro' : 'escuro'; GM_setValue('tema', novo); aplicarTema(novo); };
    $$ui('input[name="mf-ui-tema"]').forEach(r => r.addEventListener('change', () => { if (r.checked) { GM_setValue('tema', r.value); aplicarTema(r.value); } }));
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

  /* ================= INÍCIO ================= */
  if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
  else if (window.top === window) iniciarPainel();
})();
