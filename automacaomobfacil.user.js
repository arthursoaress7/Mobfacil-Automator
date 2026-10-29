// ==UserScript==
// @name         PaymobiFin - Relatório
// @name:pt-BR   PaymobiFin - Assistente
// @name:pt      PaymobiFin - Assistente
// @namespace    mobfacil-planilha
// @version      11.35
// @author       Arthur
// @description  PaymobiFin - Assistente: auditoria de crédito, relatórios para planilhas, download de CCBs e troca rápida de contas
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
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // versão: lida do cabeçalho (@version) pelo Tampermonkey; o número só existe num lugar
  const VERSAO = 'v' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '11.35');
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
    copiarAoConcluir: true,          // copia o resultado sozinho quando a fila termina
    trocaSemConfirmacao: true,
    lerAbaCliente: true, 
    tmExpedienteAuto: true,          // Timers: inicia os agendamentos "próximo expediente" ao entrar no ER
    cacTrocaAuto: true,              // Consulta CAC: troca sozinho para a conta master quando a atual não tem acesso
    cacVoltarConta: true,            // Consulta CAC: volta para a conta anterior depois da consulta
    cacPosicaoGeral: true,           // Consulta CAC: abre a Posição Geral (o sistema registra protocolo, como na tela)            // auditoria completa: telefone e e-mail pela aba Cliente da análise       // trocar de conta sem a janela de confirmação do script
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
          border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 28px #0005;font:14px/1.4 system-ui,Segoe UI,Arial,sans-serif;overflow:hidden}
        #mf-p *{box-sizing:border-box;font-family:inherit}
        #mf-p .mf-top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;color:#fff;font-size:15px;
          cursor:move;user-select:none;touch-action:none}
        #mf-p .mf-top small{opacity:.6;margin-left:6px;font-size:12px;font-weight:400}
        #mf-p.mf-min .mf-top{border-radius:11px}
        #mf-p.mf-arrastando{opacity:.93;box-shadow:0 14px 40px #0007}
        #mf-p .mf-abas{display:flex;flex-wrap:wrap;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
        #mf-p .mf-abas button{flex:1 0 25%;background:transparent;color:#64748b;border-radius:0;padding:9px 2px;font-size:12.5px;border-bottom:2px solid transparent}
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
        #mf-p .mf-corpo{max-height:calc(100vh - 140px);overflow-y:auto;overscroll-behavior:contain}
        #mf-p .mf-corpo::-webkit-scrollbar{width:8px}
        #mf-p .mf-corpo::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}
      </style>
      <div class="mf-top" title="Arraste para mover o painel"><div><b>${TITULO}</b><small id="mf-versao" title="Clique 7 vezes para a mensagem secreta">${VERSAO}</small><span id="mf-lb-badge-topo" class="mf-badge" style="display:none;cursor:pointer;margin-left:6px"></span><span id="mf-tm-topo" style="display:none;cursor:pointer;margin-left:6px;font-size:12px;background:#334155;border-radius:9px;padding:1px 7px"></span></div>
        <button id="mf-min" class="mf-mini" title="Minimizar / expandir">—</button></div>
      <div class="mf-corpo">
        <div class="mf-abas">
          <button data-aba="rel">Relatórios</button>
          <button data-aba="ccb">CCBs</button>
          <button data-aba="cac">CAC</button>
          <button data-aba="cta">Contas</button>
          <button data-aba="neg">Negociações</button>
          <button data-aba="lem">Lembretes <span id="mf-lb-badge" class="mf-badge" style="display:none"></span></button>
          <button data-aba="tim">Timers <span id="mf-tm-badge" class="mf-badge" style="display:none"></span></button>
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
            <div class="mf-tit" style="margin-top:10px">Preenchimento manual</div>
            <div class="mf-grade">
              <label class="mf-lb-rot">Proposta<input id="mf-cac-proposta" type="text" autocomplete="off"></label>
              <label class="mf-lb-rot">IMEI<input id="mf-cac-imei" type="text" autocomplete="off"></label>
              <label class="mf-lb-rot">Atendente<input id="mf-cac-atendente" type="text" autocomplete="off"></label>
              <label class="mf-lb-rot">Número Contato (RD Station)<input id="mf-cac-contato" type="text" autocomplete="off"></label>
              <label class="mf-lb-rot">Quem negociou<input id="mf-cac-quem" type="text" autocomplete="off" placeholder="Paymobi / Recupere"></label>
              <label class="mf-lb-rot">Data do Contato<input id="mf-cac-data" type="date"></label>
            </div>
            <div class="mf-grade" style="margin-top:8px">
              <button id="mf-cac-copiar" class="verde mf-cheia">Copiar linha (Proposta → Vencimento Mais Antigo)</button>
              <button id="mf-cac-limpar" class="cinza mf-cheia">Nova consulta</button>
            </div>
            <div class="mf-info" style="margin-top:6px">O resultado fica só nesta aba do navegador (some ao fechar a aba) e não é enviado a lugar nenhum.</div>
          </div>
        </div>

        <div data-pag="neg">
          <div class="mf-sec">
            <div class="mf-tit">Gerador de negociações</div>
            <select id="mf-ng-modelo"></select>
            <div id="mf-ng-desc" class="mf-info" style="margin-top:6px"></div>
          </div>
          <details class="mf-grupo" id="mf-ng-dados" open><summary>Dados</summary>
            <div id="mf-ng-campos"></div>
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
            <div class="mf-info" style="margin-top:6px">Os dados digitados ficam só nesta página: não são salvos nem enviados.</div>
          </details>
          <details class="mf-grupo"><summary>Frases para a planilha</summary>
            <div class="mf-linha">
              <select id="mf-ng-frase-tipo" style="flex:1">
                <option value="fechou">Cliente fechou o acordo</option>
                <option value="solicitou">Simulação (cliente solicitou)</option>
              </select>
              <button id="mf-ng-frases" class="azul" style="padding:8px 10px">Gerar frases</button>
            </div>
            <label class="mf-lb-rot">Pedido do cliente<textarea id="mf-ng-f-pedido" style="height:54px"></textarea></label>
            <button id="mf-ng-copiar-pedido" class="cinza" style="width:100%;margin:4px 0 8px">Copiar "Pedido do cliente"</button>
            <label class="mf-lb-rot">Acordo Realizado<textarea id="mf-ng-f-acordo" style="height:54px"></textarea></label>
            <button id="mf-ng-copiar-acordo" class="cinza" style="width:100%;margin-top:4px">Copiar "Acordo Realizado"</button>
          </details>
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
            <input id="mf-lb-busca" type="text" placeholder="Buscar por proposta ou cliente" autocomplete="off" style="margin-top:8px">
            <div id="mf-lb-lista" style="margin-top:8px"></div>
          </div>
          <details class="mf-grupo" id="mf-lb-form-grupo"><summary id="mf-lb-form-tit">Novo lembrete</summary>
            <div class="mf-grade">
              <input id="mf-lb-cliente" type="text" placeholder="Cliente (opcional)" autocomplete="off">
              <input id="mf-lb-proposta" type="text" placeholder="Nº da proposta" autocomplete="off">
              <label class="mf-lb-rot">Valor total<input id="mf-lb-total" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
              <label class="mf-lb-rot"><span id="mf-lb-pago-rot">Valor pago agora</span><input id="mf-lb-pago" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
              <label class="mf-lb-rot">Data do pagamento<input id="mf-lb-data-pag" type="date"></label>
              <label class="mf-lb-rot">Próximo acompanhamento<input id="mf-lb-proxima" type="date"></label>
            </div>
            <div id="mf-lb-saldo" class="mf-info" style="margin:6px 0"></div>
            <textarea id="mf-lb-obs" style="height:54px" placeholder="Observações"></textarea>
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
            <div class="mf-info" style="margin-top:6px">Os lembretes ficam só neste navegador (armazenamento do Tampermonkey) e continuam após atualizar o script. Não são sincronizados entre computadores ou perfis: use o backup para levar a outro lugar. Os avisos só aparecem com uma página do sistema aberta.</div>
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
          <details class="mf-grupo" data-grupo="painel"><summary>Painel e diagnóstico</summary>
            <button id="mf-pos" class="cinza" style="width:100%" title="Arraste o painel pela barra escura do título; a posição fica salva.">Restaurar posição original do painel</button>
            <div class="mf-grade" style="margin-top:8px">
              <button id="mf-fal" class="cinza">Faltantes</button>
              <button id="mf-dbg" class="cinza">Diagnóstico</button>
            </div>
          </details>
        </div>
        <div id="mf-msg"></div>
      </div>
`;
    document.body.appendChild(painel);
    const $ = s => painel.querySelector(s);
    const msg = t => ($('#mf-msg').textContent = t);
    const idsDaCaixa = () => $('#mf-lista').value.split(/\s+/).filter(Boolean);

    /* ---------- abas ---------- */
    const mostrarAba = a => {
      if (!['rel', 'ccb', 'cac', 'cta', 'neg', 'lem', 'tim', 'cfg'].includes(a)) a = 'rel';
      painel.querySelectorAll('[data-pag]').forEach(p => { p.style.display = p.dataset.pag === a ? 'block' : 'none'; });
      painel.querySelectorAll('.mf-abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === a));
      GM_setValue('abaPainel', a);
    };
    painel.querySelectorAll('.mf-abas button').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
    mostrarAba(GM_getValue('abaPainel', 'rel'));

    /* ---------- posição do painel (arrastar, salvar, restaurar) ---------- */
    const topo = $('.mf-top'), corpo = $('.mf-corpo');
    const aplicarPosicao = p => {
      if (!p) {   // posição original (definida no CSS: canto inferior esquerdo)
        painel.style.left = painel.style.top = painel.style.bottom = '';
        corpo.style.maxHeight = '';
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
    window.addEventListener('resize', () => aplicarPosicao(GM_getValue('posPainel', null)));
    aplicarPosicao(GM_getValue('posPainel', null));
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
      $('#mf-min').textContent = m ? '+' : '—';
      $('#mf-min').title = m ? 'Expandir' : 'Minimizar';
    };
    // ao expandir: se o painel ficou (parcial ou totalmente) fora da tela, sobe para dentro dela e salva a nova posição;
    // se já cabe, a posição não muda. Só se aplica à posição escolhida pelo usuário (a original já cresce para cima).
    const trazerParaTela = () => {
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
      if (!ls.length) return msg('Não achei a lista da Fila de Propostas nesta tela (#tabPropostasLista). Abra a Fila de Propostas.');
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
    function desenharContas() {
      const lista = contas();
      const sel = $('#mf-conta-sel');
      sel.innerHTML = '';
      lista.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = rotuloConta(c); sel.appendChild(o); });
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
    const ngValores = {};   // SÓ em memória: some ao recarregar a página
    const ngModelosSalvos = () => GM_getValue('negModelos', {}) || {};
    const ngTextoModelo = k => (typeof ngModelosSalvos()[k] === 'string' ? ngModelosSalvos()[k] : NG_MODELOS[k].texto);
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
      if (def.tipo === 'check') return v ? 'sim' : '';
      if (v == null || String(v).trim() === '') return '';
      if (def.tipo === 'moeda') { const c = ngCentavos(v); return c == null ? '' : ngReais(c); }
      if (def.tipo === 'data') return ngData(v);
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
    function ngDesenharCampos() {
      const k = ngModeloAtual(), m = NG_MODELOS[k];
      $('#mf-ng-desc').textContent = m.desc;
      const caixa = $('#mf-ng-campos');
      caixa.innerHTML = '';
      const grade = document.createElement('div');
      grade.className = 'mf-grade';
      m.campos.forEach(c => {
        const def = NG_CAMPOS[c];
        const rot = (m.rotulos && m.rotulos[c]) || def.rot;
        const obrig = m.obrig.includes(c);
        const lab = document.createElement('label');
        lab.className = 'mf-lb-rot' + (def.tipo === 'area' || def.tipo === 'check' ? ' mf-cheia' : '');
        let inp;
        if (def.tipo === 'area') { inp = document.createElement('textarea'); inp.style.height = '54px'; }
        else {
          inp = document.createElement('input');
          inp.type = def.tipo === 'data' ? 'date' : def.tipo === 'check' ? 'checkbox' : 'text';
          if (def.tipo === 'moeda') { inp.inputMode = 'decimal'; inp.placeholder = '0,00'; }
          if (def.tipo === 'num' || def.tipo === 'dia') inp.inputMode = 'numeric';
          inp.autocomplete = 'off';
        }
        inp.dataset.campo = c;
        if (def.tipo === 'check') inp.checked = ngValores[c] != null ? !!ngValores[c] : !!(ngPagamento().banco || ngPagamento().conta);
        else inp.value = ngValores[c] || '';
        if (def.tipo === 'check') ngValores[c] = inp.checked;
        inp.addEventListener(def.tipo === 'check' ? 'change' : 'input', () => {
          ngValores[c] = def.tipo === 'check' ? inp.checked : inp.value;
          inp.classList.remove('mf-erro');
        });
        if (def.tipo === 'check') { lab.style.flexDirection = 'row'; lab.style.alignItems = 'center'; lab.append(inp, document.createTextNode(' ' + rot)); }
        else lab.append(document.createTextNode(rot + (obrig ? ' *' : '')), inp);
        grade.appendChild(lab);
      });
      caixa.appendChild(grade);
    }
    // campos essenciais que faltam (nomes para mostrar ao usuário)
    function ngFaltando() {
      const m = NG_MODELOS[ngModeloAtual()], f = [];
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
    const ngTemDados = () => Object.entries(ngValores).some(([k, v]) => NG_CAMPOS[k] && NG_CAMPOS[k].tipo !== 'check' && String(v || '').trim()) || !!$('#mf-ng-texto').value.trim();
    const ngLimpar = () => { Object.keys(ngValores).forEach(k => delete ngValores[k]); ngDesenharCampos(); };
    const selNg = $('#mf-ng-modelo');
    Object.entries(NG_MODELOS).forEach(([k, m]) => { const o = document.createElement('option'); o.value = k; o.textContent = m.nome; selNg.appendChild(o); });
    selNg.value = ngModeloAtual();
    selNg.addEventListener('change', () => { GM_setValue('negModeloAtual', selNg.value); $('#mf-ng-texto').value = ''; ngDesenharCampos(); });
    $('#mf-ng-gerar').onclick = () => {
      const f = ngFaltando();
      painel.querySelectorAll('#mf-ng-campos [data-campo]').forEach(i => i.classList.toggle('mf-erro', f.some(x => x.startsWith((NG_MODELOS[ngModeloAtual()].rotulos || {})[i.dataset.campo] || NG_CAMPOS[i.dataset.campo].rot))));
      if (f.length) return msg('Preencha antes de gerar:\n- ' + f.join('\n- '));
      $('#mf-ng-texto').value = ngMontar(ngTextoModelo(ngModeloAtual()));
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
    Object.entries(NG_MODELOS).forEach(([k, m]) => { const o = document.createElement('option'); o.value = k; o.textContent = m.nome; selCfgNg.appendChild(o); });
    const ngCfgMostrar = () => {
      const k = selCfgNg.value, m = NG_MODELOS[k];
      $('#mf-ng-cfg-texto').value = ngTextoModelo(k);
      const vars = [...m.campos.filter(c => NG_CAMPOS[c].tipo !== 'check').map(c => '{{' + c + '}} ' + ((m.rotulos && m.rotulos[c]) || NG_CAMPOS[c].rot)),
        ...(/\{\{\s*(chave_pix|banco|agencia|conta)/.test(NG_MODELOS[k].texto) ? Object.entries(NG_VARS_PAGAMENTO).map(([v, r]) => '{{' + v + '}} ' + r + ' (dados para pagamento)') : [])];
      $('#mf-ng-cfg-vars').textContent = 'Variáveis deste modelo:\n' + vars.join('\n') + '\nLinha com variável vazia sai do texto; bloco que fica sem nenhum dado sai inteiro.' +
        (typeof ngModelosSalvos()[k] === 'string' ? '\n(modelo personalizado)' : '');
    };
    selCfgNg.addEventListener('change', ngCfgMostrar);
    $('#mf-ng-cfg-salvar').onclick = () => {
      const t = $('#mf-ng-cfg-texto').value;
      const desconhecidas = [...t.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map(x => x[1]).filter(v => !(v in NG_CAMPOS) && !(v in NG_VARS_PAGAMENTO));
      if (desconhecidas.length) return msg('Variáveis desconhecidas no modelo: ' + [...new Set(desconhecidas)].map(v => '{{' + v + '}}').join(', '));
      const mm = ngModelosSalvos(); mm[selCfgNg.value] = t; GM_setValue('negModelos', mm);
      ngCfgMostrar(); msg('Modelo "' + NG_MODELOS[selCfgNg.value].nome + '" salvo.');
    };
    $('#mf-ng-cfg-restaurar').onclick = () => {
      if (!confirm('Voltar o modelo "' + NG_MODELOS[selCfgNg.value].nome + '" ao texto original?')) return;
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
       - Datas sempre 'AAAA-MM-DD' no horário LOCAL do navegador (sem conversão de fuso). Valores em centavos. */
    const LB_VERSAO = 1, LB_CHAVE = 'mfLembretes';
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
        vistos.add(x.id); ok.push(x);
      });
      base.itens = ok;
      return base;
    }
    // versão 0 (lista simples): aceita { proposta, total, pago, proxima, ... } e converte sem perder campos
    function lbMigrar(x) {
      if (lbItemValido(x)) return x;
      if (!x || typeof x !== 'object') return null;
      const total = Number.isFinite(x.total) ? x.total : ngCentavos(x.total);
      if (total == null) return null;
      const pago = x.pago != null ? (Number.isFinite(x.pago) ? x.pago : ngCentavos(x.pago)) : 0;
      return {
        id: typeof x.id === 'string' ? x.id : lbNovoId(), cliente: String(x.cliente || ''), proposta: String(x.proposta || ''), total,
        pagamentos: pago ? [{ valor: pago, data: lbDataOk(x.dataPagamento) ? x.dataPagamento : '', registradoEm: Date.now() }] : [],
        proxima: lbDataOk(x.proxima) ? x.proxima : '', obs: String(x.obs || ''), status: ['pendente', 'concluido', 'cancelado'].includes(x.status) ? x.status : 'pendente',
        historico: [], criadoEm: x.criadoEm || Date.now(), atualizadoEm: Date.now(), original: x,
      };
    }
    let lbBase = lbCarregar();
    const lbSalvar = () => {
      if (lbBase.somenteLeitura) { msg('Os lembretes salvos são de uma versão mais nova do script: atualize o script antes de alterar.'); return false; }
      GM_setValue(LB_CHAVE, { versao: LB_VERSAO, itens: lbBase.itens, invalidos: lbBase.invalidos });
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
      if (busca) lista = lista.filter(it => (it.proposta + ' ' + it.cliente).toLowerCase().includes(busca));
      lista.sort((a, b) => (a.proxima || '9999') .localeCompare(b.proxima || '9999'));
      const caixa = $('#mf-lb-lista');
      caixa.innerHTML = '';
      if (!lista.length) { const v = document.createElement('div'); v.className = 'mf-info'; v.textContent = lbFiltro === 'atencao' ? 'Nenhum lembrete para hoje ou atrasado.' : 'Nenhum lembrete.'; caixa.appendChild(v); return; }
      lista.forEach(it => {
        const el = document.createElement('div');
        el.className = 'mf-lb-item' + (lbVencido(it) ? ' atrasado' : lbAtencao(it) ? ' hoje' : '') + (it.status !== 'pendente' ? ' encerrado' : '');
        const l1 = document.createElement('div'); l1.className = 'mf-lb-l1';
        l1.textContent = (it.proposta ? 'Proposta ' + it.proposta : 'Sem proposta') + (it.cliente ? ' · ' + it.cliente : '');
        const l2 = document.createElement('div'); l2.className = 'mf-lb-l2';
        const st = it.status === 'pendente' ? (lbVencido(it) ? 'ATRASADO' : lbAtencao(it) ? 'HOJE' : 'pendente') : it.status === 'concluido' ? 'concluído' : 'cancelado';
        l2.textContent = 'Saldo ' + ngReais(lbSaldo(it)) + ' de ' + ngReais(it.total) + ' · próx.: ' + (ngData(it.proxima) || '—') + ' · ' + st;
        el.append(l1, l2);
        if (lbAberto === it.id) {
          const det = document.createElement('div'); det.className = 'mf-lb-det';
          det.textContent = 'Pagamentos: ' + (it.pagamentos.length ? it.pagamentos.map(p => ngReais(p.valor) + (p.data ? ' em ' + ngData(p.data) : '')).join('; ') : 'nenhum') +
            (it.obs ? '\nObs.: ' + it.obs : '') + (it.historico && it.historico.length ? '\n' + it.historico.slice(-3).map(h => h.texto).join('\n') : '');
          const acoes = document.createElement('div'); acoes.className = 'mf-lb-acoes';
          const bt = (t, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = t; b.onclick = e => { e.stopPropagation(); fn(); }; acoes.appendChild(b); };
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
    const lbHist = (it, texto) => { it.historico = [...(it.historico || []), { em: Date.now(), texto: new Date().toLocaleDateString() + ': ' + texto }].slice(-30); };
    function lbMudarStatus(id, st) {
      lbRecarregar();
      const it = lbBase.itens.find(x => x.id === id);
      if (!it) return;
      const nome = { concluido: 'concluir', cancelado: 'cancelar', pendente: 'reabrir' }[st];
      if (!confirm('Confirma ' + nome + ' o lembrete' + (it.proposta ? ' da proposta ' + it.proposta : '') + '?')) return;
      it.status = st; it.atualizadoEm = Date.now(); lbHist(it, { concluido: 'concluído', cancelado: 'cancelado', pendente: 'reaberto' }[st]);
      if (lbSalvar()) msg('Lembrete ' + { concluido: 'concluído', cancelado: 'cancelado', pendente: 'reaberto' }[st] + '.');
    }
    function lbExcluir(id) {
      lbRecarregar();
      const it = lbBase.itens.find(x => x.id === id);
      if (!it || !confirm('EXCLUIR definitivamente o lembrete' + (it.proposta ? ' da proposta ' + it.proposta : '') + '? Esta ação não pode ser desfeita.')) return;
      lbBase.itens = lbBase.itens.filter(x => x.id !== id);
      if (lbSalvar()) msg('Lembrete excluído.');
    }
    // formulário: novo, editar ou registrar novo pagamento
    function lbAbrirForm(it, modoForm) {
      lbEditando = it ? { id: it.id, modo: modoForm } : null;
      $('#mf-lb-form-grupo').open = true;
      $('#mf-lb-form-tit').textContent = !it ? 'Novo lembrete' : modoForm === 'pagamento' ? 'Registrar pagamento (proposta ' + (it.proposta || '—') + ')' : 'Editar lembrete';
      $('#mf-lb-cliente').value = it ? it.cliente : ''; $('#mf-lb-proposta').value = it ? it.proposta : '';
      $('#mf-lb-total').value = it ? (it.total / 100).toFixed(2).replace('.', ',') : '';
      $('#mf-lb-pago').value = '';
      $('#mf-lb-pago-rot').textContent = it ? 'Novo pagamento (opcional)' : 'Valor pago agora';
      $('#mf-lb-data-pag').value = '';
      $('#mf-lb-proxima').value = it ? it.proxima : '';
      $('#mf-lb-obs').value = it ? it.obs : '';
      $('#mf-lb-status').value = it ? it.status : 'pendente';
      $('#mf-lb-status-rot').style.display = it && modoForm === 'editar' ? '' : 'none';
      ['#mf-lb-cliente', '#mf-lb-proposta', '#mf-lb-total'].forEach(s => { $(s).disabled = !!it && modoForm === 'pagamento'; });
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
      const erros = [];
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
        it = { id: lbNovoId(), cliente, proposta, total, pagamentos: [], proxima: '', obs: '', status: 'pendente', historico: [], criadoEm: Date.now(), atualizadoEm: Date.now() };
        lbBase.itens.push(it);
        lbHist(it, 'criado');
      } else if (!(lbEditando && lbEditando.modo === 'pagamento')) {
        it.cliente = cliente; it.proposta = proposta; it.total = total;
      }
      if (pago > 0) { it.pagamentos.push({ valor: pago, data: dataPag, registradoEm: Date.now() }); lbHist(it, 'pagamento de ' + ngReais(pago) + (dataPag ? ' em ' + ngData(dataPag) : '')); }
      if (lbDataOk(proxima) && proxima !== it.proxima) { if (it.proxima) lbHist(it, 'acompanhamento ' + ngData(it.proxima) + ' → ' + ngData(proxima)); it.proxima = proxima; }
      if ($('#mf-lb-obs').value.trim() !== it.obs) it.obs = $('#mf-lb-obs').value.trim().slice(0, 1000);
      if (st !== it.status) { it.status = st; lbHist(it, 'status: ' + st); }
      it.atualizadoEm = Date.now();
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
            lbHist(x, 'adiado de ' + ngData(x.proxima) + ' para ' + ngData(inp.value)); x.proxima = inp.value; x.atualizadoEm = Date.now();
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
      if (parcelas && parcelas.length) {
        const hoje = lbHoje();
        const p1 = parcelas.find(p => p.num === 1) || parcelas[0];
        if (p1.valor != null) put('valorParcela', ngReais(p1.valor), 'Parcelas (valor da parcela ' + p1.num + ')');
        const atraso = parcelas.filter(p => p.dias > 0 && (p.saldo == null || p.saldo > 0));
        put('parcelasAtraso', String(atraso.length), 'Parcelas (dias de atraso > 0 e saldo em aberto)');
        put('diasAtraso', String(atraso.length ? Math.max(...atraso.map(p => p.dias)) : 0), 'Parcelas (maior "Dias Atraso")');
        const antigo = atraso.map(p => p.venc).filter(Boolean).sort()[0];
        if (antigo) put('vencMaisAntigo', ngData(antigo), 'Parcelas (vencimento mais antigo em atraso)');
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
        cacSSSet({ etapa: 'resultado', resultado, voltar: extra.voltar || st.voltar || '', quando: Date.now(), abrirAba: true });
        cacMostrar(resultado);
        cacStatus('');
        msg('CAC: dados de ' + resultado.cliente.nome + ' lidos. Confira, preencha os campos manuais e copie a linha.');
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
      cacSSSet({ etapa: 'trocando', termo, voltar: atual ? atual.usuario : '', quando: Date.now() });
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
        cacConsultar(st.termo, { voltar: st.voltar, jaTrocou: true });
      } else if (st.etapa === 'trocando') {
        cacSSSet(null);
        msg('A troca para a conta master não foi confirmada (conta ativa: ' + (a ? rotuloConta(a) : 'não identificada') + '). Consulta CAC cancelada.');
      }
    }

    const CAC_LINHA = [   // aba "Negociação": colunas Proposta ... Vencimento Mais Antigo
      ['Proposta', 'm:proposta'], ['Nome', 'nome'], ['CPF', 'cpf'], ['IMEI', 'm:imei'], ['Data da Proposta', 'dataProposta'], ['Filial', 'filial'],
      ['Atendente', 'm:atendente'], ['Número Contato', 'm:contato'], ['Quem negociou', 'm:quem'], ['Data do Contato', 'm:data'],
      ['Valor parcela', 'valorParcela'], ['FPD', 'fpd'], ['Parcelas Em Atraso', 'parcelasAtraso'], ['Dias Atraso', 'diasAtraso'], ['Vencimento Mais Antigo', 'vencMaisAntigo'],
    ];
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
      CAC_LINHA.filter(([, k]) => !k.startsWith('m:') && k !== 'nome' && k !== 'cpf').forEach(([rot, k]) => add(rot, res.campos[k], res.origem[k]));
      const info = document.createElement('div'); info.className = 'mf-info'; info.style.marginTop = '4px';
      info.textContent = 'Consultado em ' + res.consultadoEm + (res.conta ? ' com a conta ' + res.conta : '') + (res.posicaoGeral ? ' · Posição Geral aberta (protocolo ' + (res.protocolo || 'do sistema') + ')' : ' · sem Posição Geral') + '. Passe o mouse no valor para ver a origem.';
      t.appendChild(info);
    }
    $('#mf-cac-buscar').onclick = () => { cacSSSet(null); cacConsultar($('#mf-cac-termo').value); };
    $('#mf-cac-termo').addEventListener('keydown', e => { if (e.key === 'Enter') $('#mf-cac-buscar').click(); });
    $('#mf-cac-copiar').onclick = () => {
      const st = cacSS();
      if (!st || !st.resultado) return msg('Faça uma consulta antes de copiar.');
      const res = st.resultado, man = k => limpoTxt($('#mf-cac-' + k).value);
      const linha = CAC_LINHA.map(([, k]) => {
        if (k === 'm:data') return ngData($('#mf-cac-data').value);
        if (k.startsWith('m:')) return man(k.slice(2));
        return res.campos[k] != null && res.campos[k] !== '' ? res.campos[k] : 'N/A';
      });
      GM_setClipboard(textoTab([linha]), 'text');
      msg('Linha copiada (' + CAC_LINHA.length + ' colunas: Proposta → Vencimento Mais Antigo). Cole na coluna Proposta da aba Negociação. Campos manuais vazios vão em branco.');
    };
    $('#mf-cac-limpar').onclick = () => {
      cacSSSet(null); cacMostrar(null); cacStatus('');
      ['termo', 'proposta', 'imei', 'atendente', 'contato', 'quem', 'data'].forEach(k => { $('#mf-cac-' + k).value = ''; });
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
      const m = ngModeloAtual(), v = ngValor;
      const verbo = tipo === 'fechou' ? 'fechou' : 'solicitou';
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
    $('#mf-ng-frases').onclick = () => {
      const r = ngFrases($('#mf-ng-frase-tipo').value);
      if (r.erro) return msg(r.erro);
      $('#mf-ng-f-pedido').value = r.pedido; $('#mf-ng-f-acordo').value = r.acordo;
      msg('Frases geradas. Copie cada uma para a coluna correspondente.');
    };
    $('#mf-ng-copiar-pedido').onclick = () => { const t = $('#mf-ng-f-pedido').value; if (!t.trim()) return msg('Gere as frases antes.'); GM_setClipboard(t, 'text'); msg('Frase do "Pedido do cliente" copiada.'); };
    $('#mf-ng-copiar-acordo').onclick = () => { const t = $('#mf-ng-f-acordo').value; if (!t.trim()) return msg('Gere as frases antes.'); GM_setClipboard(t, 'text'); msg('Frase do "Acordo Realizado" copiada.'); };
    // novo texto / limpar / trocar de modelo também apagam as frases (nada de uma negociação passa para outra)
    ['#mf-ng-novo', '#mf-ng-limpar'].forEach(s => $(s).addEventListener('click', () => {
      const vazio = !Object.entries(ngValores).some(([k, v]) => NG_CAMPOS[k] && NG_CAMPOS[k].tipo !== 'check' && String(v || '').trim());
      if (vazio) { $('#mf-ng-f-pedido').value = ''; $('#mf-ng-f-acordo').value = ''; }
    }));
    $('#mf-ng-modelo').addEventListener('change', () => { $('#mf-ng-f-pedido').value = ''; $('#mf-ng-f-acordo').value = ''; });


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

    // ao recarregar a página, restaura a fila salva (permite continuar depois de fechar/recarregar)
    if (fila().length) $('#mf-lista').value = fila().join('\n');
    atualizarUI();
  }

  /* ================= INÍCIO ================= */
  if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
  else if (window.top === window) iniciarPainel();
})();
