// ==UserScript==
// @name         MobFacil -> Planilha (automático)
// @namespace    mobfacil-planilha
// @version      11.23
// @author       Arthur
// @description  Coleta restritivos, score e consultas do MobFacil e copia para a planilha
// @include      /^https?:\/\/paymobi\.ercard\.com\.br(:\d+)?\/.*/
// @include      https://enviamotor.mobfacil.com.br/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const VERSAO = 'v11.23';
  const CONFIG = {
    TEMPO_MAX: 120,         // s máximos por proposta (janela principal)
    MARGEM: 8,              // s: o iframe encerra sozinho antes do limite acima
    ESPERA_ARVORE: 25,      // s esperando o ID/árvore aparecer no iframe
    CAMINHO_SEG: 35,        // s máximos para abrir cada caminho da árvore até o dado
    SCORE_SEG: 30,          // s máximos para o caminho do score + exploração dos filhos
    BUSCA_SEG: 15,          // s máximos para cada caminho depois de uma pesquisa (plano B)
    ESPERA_NO: 4,           // s esperando um nó aparecer (renderizar) antes de concluir que ele não existe
    MAX_CLIQUES_NO: 6,      // cliques máximos num mesmo nó que não abre (antes 12)
    CLIQUES_VAZIO: 4,       // cliques num nó FINAL do caminho que continua fechado: considera o nó vazio (ex.: pendenciaFinanceira sem pendências)
    PAUSA_BUSCA: 700,       // ms esperando a pesquisa filtrar a árvore
    PASSO_ROLAGEM: 0.4,     // fração da altura visível que a rolagem avança por passo
    PASSO_MS: 150,          // ms de espera depois de cada passo de rolagem (antes 200; aumente se falhar a leitura)
    ESPERA_CLIQUE: 120,     // ms de espera depois de clicar nos nós (antes 250; aumente se falhar a leitura)
    INTERVALO_CLIQUE: 900,  // ms mínimos antes de clicar DE NOVO no mesmo nó (evita abrir e fechar; não mudou)
    GAP_NOVO_NO: 150,       // ms mínimos entre cliques em nós DIFERENTES (o anterior já abriu; antes era 900 para todos)
    ESPERA_RENDER: 500,     // ms esperando o próximo nó aparecer antes de começar a rolar a árvore
    POLL_MOTOR: 150,        // ms entre verificações no iframe (antes 300)
    POLL_PRINCIPAL: 100,    // ms entre verificações na janela principal (antes 250)
    PAUSA: 100,             // ms entre propostas (antes 300)
    TIMEOUT_REDE: 30,       // s máximos do fetch da página do motor
    BATIDA: 5,              // s: tempo para considerar que a coleta de outra aba ainda está viva
    CORTE_SCORE: 390,       // reprova se score < 390
    CORTE_VALOR: 4000,      // reprova se valor de restrições > 4000
    CORTE_QTD: 10,          // reprova se quantidade de restrições > 10
    VAZIAS_APOS_ID: 3,      // colunas entre a Proposta e a Qtd Restritivos (Nome, CPF, IMEI)
  };

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
  // motivos de reprovação que exigem ler a árvore (qtd e valor de restrições); nos outros (renda, score, idade...) a mensagem basta
  const PRECISA_ARVORE = /restri|pend|negativ/i;
  const NOMES = { qtd: 'qtd restritivos', val: 'valor restritivos', score: 'score', consultas: 'consultas', cpf: 'cpf', reprov: 'motivo da reprovação' };
  // o que falta coletar depende do modo: aprovadas = só CPF; reprovadas = mensagem de reprovação (+ qtd/valor/score se for o caso)
  const campos = d => {
    const m = GM_getValue('modo', 'coleta');
    if (m === 'aprovadas') return ['cpf'];
    if (m === 'reprovadas') return ['reprov'];   // a mensagem de reprovação traz todos os motivos e valores; não precisa abrir a árvore
    return ['qtd', 'val', 'score', 'consultas'];
  };
  const completo = d => d && campos(d).every(k => d[k] != null);
  const faltaCampos = d => !d ? ['tudo'] : campos(d).filter(k => d[k] == null).map(k => NOMES[k]);

  /* ================= LEITURA DA ÁRVORE ================= */

  // tira o ": null" (e similares) do título dos nós-objeto: "calculaRisco: null" -> "calculaRisco"
  const limpa = s => s.replace(/\s*:\s*(null|undefined|Object|Array\(\d*\)|\{.*\}|\[.*\])?\s*$/i, '').trim();

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

  function extrair() {
    const texto = document.body.textContent.replace(/\s+/g, ' ');
    const id = (texto.match(/ID da proposta:\s*(\d+)/i) || [])[1];
    if (!id) return null;
    const todos = nos();

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
    let score =
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
    // Mensagem de reprovação do MobFacil: "(P1) Reprovar: renda inferior a mínima permitida (1621 reais) (atual=R$1300)"
    // null = cartão de resultado ainda não carregou; '' = carregou e não tem mensagem de reprovação
    let reprov = null;
    if (/Fluxo processado\s*:/i.test(texto)) {
      let ms = texto.match(/\(P\d+\)\s*Reprovar\s*:.{0,200}?\(atual\s*=\s*[^)]*\)/gi);
      if (!ms) ms = texto.match(/\(P\d+\)\s*Reprovar\s*:.{0,150}?(?=\s*\(P\d+\)|\s*Exibir|\s*$)/gi);
      reprov = [...new Set((ms || []).map(x => x.trim()))].join(' ¦ ');
    }
    // reprovada por score: a própria mensagem traz o valor, ex.: "(score=351)"
    if (score == null && reprov) {
      const ms = reprov.match(/score\s*=\s*(\d+(?:[.,]\d+)?)/i);
      if (ms) score = num(ms[1]);
    }
    return { id, qtd, val, score, consultas, cpf, reprov };
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
    console.log('[MobFacil]', r.id, atual);
  }

  /* ================= IFRAME DO MOTOR (enviamotor.mobfacil.com.br) ================= */
  function iniciarMotor() {
    // Em aba escondida o navegador não executa requestAnimationFrame, e a árvore (antd) usa isso para abrir os nós.
    // Só enquanto a aba estiver escondida, troca por um setTimeout equivalente. Com a aba visível nada muda.
    try {
      const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
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
        dadosAteAgora,
        linhas: semToken.filter(n =>
          /restritiv|score|quantidadeTotal|valorTotal|^Fluxos|calculaRisco|pendencia|consultaRealizada|^resumo$|^Exibir|^\d{2}\/\d{2}\/\d{4}/i.test(n.t)
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
      const rxData = /^(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2}):(\d{2})(?::(\d{2}))?/;
      const chaveData = txt => {
        const m = txt.match(rxData);
        return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5] + (m[6] || '00')) : -1;
      };
      const FLUXO = [{ re: /^exibir fluxos$/i }, { re: /^fluxos p1\b/i }, { data: true }];  // data = a execução mais recente
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
          let alvo = -1;
          for (let j = ini; j < fim; j++) {
            const n = lista[j];
            if (k > 0 && n.d !== dPai + 1) continue;                    // só filhos diretos do nó anterior
            if (!(p.data ? rxData.test(n.nome) : p.re.test(n.nome))) continue;
            if (alvo < 0 || (p.data && chaveData(n.txt) > chaveData(lista[alvo].txt))) alvo = j;
            if (!p.data) break;
          }
          if (alvo < 0) {
            if (p.opc && pai && !pai.fechado && fim - ini > 0) return { estado: 'ok' };   // passo opcional que não existe
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
              // nó final que não abre depois de alguns cliques = nó vazio (lista sem itens), não é erro
              if (s.passo === ultimoObrig && (cliques[chave] || 0) >= CONFIG.CLIQUES_VAZIO) return { res: 'vazio', nome: s.no.nome.slice(0, 40), passo: s.passo };
              cliques[chave] = (cliques[chave] || 0) + 1;
              if (cliques[chave] > CONFIG.MAX_CLIQUES_NO) return { res: 'travou', nome: s.no.nome.slice(0, 40), passo: s.passo };
              const sw = s.no.no.querySelector(':scope > .ant-tree-switcher_close');
              if (sw) { sw.click(); ultimoClique = Date.now(); ultimaChave = chave; }
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

      // Com o scoreCadastroPositivo aberto, abre os filhos fechados dela, UM por vez
      // (sanfona: abrir um fecha o irmão) e lê o score depois de cada clique.
      const explorarScore = async maxSeg => {
        const limite = Math.min(Date.now() + maxSeg * 1000, prazo);
        const tentados = {};
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
              const n = lista[f];
              if (n.fechado && (tentados[n.d + '|' + n.txt] || 0) < 3) { alvo = n; break; }
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
            const chave = chaveA;
            tentados[chave] = (tentados[chave] || 0) + 1;
            const sw = alvo.no.querySelector(':scope > .ant-tree-switcher_close');
            if (sw) { sw.click(); ultimoClique = Date.now(); ultimaChave = chave; }
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
      if (GM_getValue('modo', 'coleta') === 'aprovadas') {
        await rodar('fluxo', CONFIG.CAMINHO_SEG);
        snapshot(r.id, 'fim (' + log.join(' | ') + ')', null);
        GM_setValue('fim', r.id);
        return;
      }

      // 1) restritivos (qtd e valor)
      let d = dadosAtuais();
      if (d.qtd == null || d.val == null) await rodar('risco', CONFIG.CAMINHO_SEG);

      // 2) consultas
      d = dadosAtuais();
      let rrCons = null;
      if (modoAtual !== 'reprovadas' && d.consultas == null && Date.now() < prazo) rrCons = await rodar('consultas', CONFIG.CAMINHO_SEG);

      // 3) score (scoreCadastroPositivo, depois de ler as consultas)
      d = dadosAtuais();
      if (d.score == null && Date.now() < prazo) await rodar('score', CONFIG.SCORE_SEG);

      // 0 consultas SÓ se o caminho chegou em "resultado" aberto, com filhos,
      // o nó consultaRealizada não existe, e os outros dados já foram lidos.
      const x0 = dadosAtuais();
      if (rrCons && x0.consultas == null && rrCons.res === 'ausente' && rrCons.passo === IDX_CONSULTA &&
          rrCons.paiAberto && rrCons.nFilhos > 0 && x0.qtd != null && x0.val != null && x0.score != null) {
        salvar({ id: r.id, consultas: '0' });
      }

      // 4) reserva: restritivos pelo SPC (pendenciaFinanceira)
      d = dadosAtuais();
      if ((d.qtd == null || d.val == null) && Date.now() < prazo) await rodar('pendencia', CONFIG.CAMINHO_SEG);

      // 4b) consultas de novo: depois do passo anterior o caminho do SPC já está aberto
      d = dadosAtuais();
      if (modoAtual !== 'reprovadas' && d.consultas == null && Date.now() < prazo) await rodar('consultas', CONFIG.CAMINHO_SEG);

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
        buscaOk = pesquisar(termo);
        await sleep(CONFIG.PAUSA_BUSCA);
        await rodar(caminho, caminho === 'score' ? CONFIG.SCORE_SEG : CONFIG.BUSCA_SEG);
      }

      snapshot(r.id, 'fim (' + log.join(' | ') + ')', buscaOk);
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
    const pendentes = () => { const f = new Set(feitas()); return fila().filter(id => !f.has(id)); };
    const linha = d => (d ? [d.qtd, d.val, d.score, d.consultas].map(x => (x == null ? '' : x)).join('\t') : '\t\t\t');

    /* ---------- interface ---------- */
    const painel = document.createElement('div');
    painel.id = 'mf-p';
    painel.innerHTML = `
      <style>
        #mf-p{position:fixed;bottom:60px;left:10px;z-index:2147483647;width:340px;background:#fff;color:#1f2937;
          border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 28px #0005;font:14px/1.4 system-ui,Segoe UI,Arial,sans-serif;overflow:hidden}
        #mf-p *{box-sizing:border-box;font-family:inherit}
        #mf-p .mf-top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;color:#fff;font-size:15px}
        #mf-p .mf-top small{opacity:.6;margin-left:6px;font-size:12px}
        #mf-p .mf-sec{padding:10px 14px;border-bottom:1px solid #e2e8f0}
        #mf-p .mf-tit{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px}
        #mf-p #mf-st{font-size:15px;font-weight:600;margin-bottom:6px}
        #mf-p .mf-barra{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden}
        #mf-p #mf-prog{height:100%;width:0;background:#16a34a;transition:width .3s}
        #mf-p .mf-linha{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        #mf-p .mf-linha label{font-size:13px;color:#475569;cursor:pointer;display:flex;align-items:center;gap:4px}
        #mf-p textarea{width:100%;height:80px;resize:vertical;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:13px;color:#1f2937;background:#fff}
        #mf-p .mf-grade{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        #mf-p button{cursor:pointer;border:0;border-radius:8px;padding:10px 8px;font-size:14px;font-weight:600;color:#fff;background:#475569;line-height:1.2}
        #mf-p button:hover:not(:disabled){filter:brightness(1.1)}
        #mf-p button:disabled{opacity:.35;cursor:not-allowed}
        #mf-p .verde{background:#16a34a}
        #mf-p .laranja{background:#ea580c}
        #mf-p .azul{background:#2563eb}
        #mf-p .vermelho{background:#dc2626}
        #mf-p .cinza{background:#e2e8f0;color:#1e293b}
        #mf-p .mf-mini{background:transparent;color:#fff;padding:2px 10px;font-size:18px}
        #mf-p details{padding:10px 14px;border-bottom:1px solid #e2e8f0}
        #mf-p summary{cursor:pointer;font-size:13px;color:#64748b;font-weight:600;margin-bottom:8px}
        #mf-p #mf-msg{margin:10px 14px 14px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:13px;max-height:130px;overflow:auto;white-space:pre-wrap}
        #mf-p #mf-msg:empty{display:none}
        #mf-p .mf-corpo{max-height:calc(100vh - 140px);overflow-y:auto;overscroll-behavior:contain}
        #mf-p .mf-corpo::-webkit-scrollbar{width:8px}
        #mf-p .mf-corpo::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}
      </style>
      <div class="mf-top"><div><b>Coleta MobFacil</b><small>${VERSAO}</small></div>
        <button id="mf-min" class="mf-mini" title="Minimizar / expandir">—</button></div>
      <div class="mf-corpo">
        <div class="mf-sec">
          <div class="mf-tit">Status</div>
          <div id="mf-st">Pronto</div>
          <div class="mf-barra"><div id="mf-prog"></div></div>
        </div>
        <div class="mf-sec">
          <div class="mf-tit">Propostas <span id="mf-qtd"></span></div>
          <select id="mf-modo" style="width:100%;margin-bottom:8px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;color:#1f2937">
            <option value="coleta">Coleta simples (qtd, valor, score, consultas)</option>
            <option value="reprovadas">Relatório: Reprovadas</option>
            <option value="efetivadas">Relatório: Efetivadas (Boleto+)</option>
            <option value="aprovadas">Relatório: Aprovadas não efetivadas</option>
            <option value="valortransacao">Valor de transação (só a coluna, p/ Excel)</option>
          </select>
          <div class="mf-linha">
            <button id="mf-tela" class="cinza">Ler da tela</button>
            <label><input type="checkbox" id="mf-canc"> ignorar canceladas e testes</label>
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
          <div class="mf-tit">Copiar para a planilha</div>
          <div class="mf-grade">
            <button id="mf-cop">Copiar resultado</button>
            <button id="mf-cid">Copiar c/ proposta</button>
            <button id="mf-colr" class="cinza" style="grid-column:1/-1" title="Só a coluna do motivo de reprovação, para colar na coluna R">Copiar motivo (coluna R)</button>
          </div>
        </div>
        <details>
          <summary>Ferramentas</summary>
          <div class="mf-grade">
            <button id="mf-fal" class="cinza">Faltantes</button>
            <button id="mf-dbg" class="cinza">Diagnóstico</button>
          </div>
          <div style="margin-top:10px;font-size:13px;color:#475569">Colar em (formato da cópia dos relatórios):
            <select id="mf-estilo" style="width:100%;margin-top:4px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;color:#1f2937">
              <option value="canva">Canva (tabela com parágrafos)</option>
              <option value="canvaxl">Canva (tabela estilo Excel)</option>
              <option value="canvabr">Canva (tabela com quebra br)</option>
              <option value="canvadiv">Canva (tabela com blocos div)</option>
              <option value="canva2col">Canva (valor e quantidade em 2 colunas)</option>
              <option value="excel">Excel (texto com tabulação)</option>
              <option value="sheets">Google Sheets (texto com tabulação)</option>
            </select>
          </div>
        </details>
        <div id="mf-msg"></div>
      </div>`;
    document.body.appendChild(painel);
    const $ = s => painel.querySelector(s);
    const msg = t => ($('#mf-msg').textContent = t);
    const idsDaCaixa = () => $('#mf-lista').value.split(/\s+/).filter(Boolean);

    // "completas" = propostas com todos os dados do modo atual; mesma regra no status e na cópia parcial
    // conta só entre as já PROCESSADAS (a proposta em andamento ainda não entra), então nunca passa do número de processadas
    function completas() {
      const f = fila(), fe = new Set(feitas());
      if (modo() !== 'coleta') {
        const falt = new Set(faltantes().map(x => x.split(' ')[0]));
        return f.filter(id => fe.has(id) && !falt.has(id)).length;
      }
      const dd = GM_getValue('dados', {});
      return f.filter(id => fe.has(id) && completo(dd[id])).length;
    }

    function atualizarUI() {
      const total = fila().length;
      const pend = pendentes().length;
      const f = total - pend;
      let st;
      if (executando) st = 'Rodando: ' + f + ' de ' + total + ' processadas · ' + completas() + ' completas' + (atual ? ' (em andamento: ' + atual + ')' : '');
      else if (!total) st = 'Pronto';
      else if (!pend) st = 'Concluído: ' + f + ' de ' + total;
      else st = 'Parado: ' + f + ' de ' + total + ' coletadas';
      $('#mf-st').textContent = st;
      $('#mf-prog').style.width = (total ? Math.round(f / total * 100) : 0) + '%';
      $('#mf-qtd').textContent = idsDaCaixa().length ? '(' + idsDaCaixa().length + ')' : '';
      $('#mf-ini').disabled = executando;
      $('#mf-par').disabled = !executando;
      $('#mf-cont').disabled = executando || !pend || !total;
      $('#mf-tela').disabled = executando;
      $('#mf-res').disabled = false;
    }

    const aplicarMin = m => {
      $('.mf-corpo').style.display = m ? 'none' : 'block';
      $('#mf-min').textContent = m ? '+' : '—';
    };
    $('#mf-min').onclick = () => { const m = !GM_getValue('min', false); GM_setValue('min', m); aplicarMin(m); };
    aplicarMin(GM_getValue('min', false));

    /* ---------- leitura da tela ---------- */
    let confCadIgnoradas = 0;   // propostas "20 - CONF CAD" (em digitação) deixadas de fora na última leitura
    function lerTela(ignorarCanc) {
      const ids = [];
      confCadIgnoradas = 0;

      // 1) Tabela da Mesa de Crédito (#tabMesaCreditoLista): o número da proposta vem do
      //    onclick da célula, ex.: objMesaCredito.DetalheProposta('4672')
      document.querySelectorAll('#tabMesaCreditoLista tbody tr').forEach(tr => {
        if (painel.contains(tr)) return;
        if (ehConfCad(tr.textContent)) { confCadIgnoradas++; return; }   // em digitação: nunca entra
        if (ignorarCanc && (/cancelad/i.test(tr.textContent) || ehTeste(tr.textContent))) return;
        const td = tr.querySelector('td[onclick*="DetalheProposta"]');
        const m = td && (td.getAttribute('onclick') || '').match(/DetalheProposta\(\s*['"]?(\d+)/);
        if (m) ids.push(m[1]);
      });
      if (ids.length) return [...new Set(ids)];

      // 2) Reserva (lógica anterior): primeira célula só com 3 a 8 dígitos em qualquer linha
      confCadIgnoradas = 0;
      document.querySelectorAll('tr').forEach(tr => {
        if (painel.contains(tr)) return;
        const c = [...tr.querySelectorAll('td')]
          .find(td => /^\d{3,8}$/.test(td.textContent.replace(/\s+/g, '')));
        if (!c) return;
        if (ehConfCad(tr.textContent)) { confCadIgnoradas++; return; }
        if (ignorarCanc && (/cancelad/i.test(tr.textContent) || ehTeste(tr.textContent))) return;
        ids.push(c.textContent.replace(/\s+/g, ''));
      });
      if (!ids.length) {
        document.querySelectorAll('a').forEach(a => {
          if (painel.contains(a)) return;
          const t = a.textContent.replace(/\s+/g, '');
          if (/^\d{4,8}$/.test(t)) ids.push(t);
        });
      }
      return [...new Set(ids)];
    }

    /* ---------- relatórios (ordem das colunas dos slides) ---------- */
    const modo = () => $('#mf-modo').value;
    const ehTeste = txt => /\bPA\s*-\s*PAYMOBI\b/i.test(txt || '');   // propostas de teste (loja PA - PAYMOBI)
    const ehConfCad = txt => /\bCONF\s*CAD\b/i.test(txt || '');         // situação "20 - CONF CAD": proposta em digitação, não concluída
    $('#mf-modo').value = GM_getValue('modo', 'coleta');
    $('#mf-modo').addEventListener('change', () => GM_setValue('modo', modo()));
    // destino da cópia dos relatórios: cada programa usa o formato mais confiável para ele
    //   canva  -> tabela HTML, um parágrafo por linha ('p'; se o Canva juntar as linhas, teste 'div' ou 'br')
    //   excel / sheets -> texto com tabulação ('tsv'; células com quebra de linha vão entre aspas)
    const DESTINOS = { canva: 'p', canvaxl: 'xl', canvabr: 'br', canvadiv: 'div', canva2col: 'p2col', excel: 'tsv', sheets: 'tsv' };
    $('#mf-estilo').value = GM_getValue('estiloCopia', 'canva');
    if (!$('#mf-estilo').value) $('#mf-estilo').value = 'canva';   // valor antigo salvo (p/div/br/tsv)
    $('#mf-estilo').addEventListener('change', () => GM_setValue('estiloCopia', $('#mf-estilo').value));
    const estilo = () => DESTINOS[$('#mf-estilo').value] || 'p';

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
      const ci = { id: col('proposta'), sit: col('situa'), dh: col('data/hora'), cli: col('cliente'), ana: col('analista'), loja: col('pto') };
      const out = [];
      t.querySelectorAll('tbody tr').forEach(tr => {
        const c = [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim());
        const id = (c[ci.id] || '').replace(/\D/g, '');
        if (!id) return;
        out.push({ id, sit: c[ci.sit] || '', dh: c[ci.dh] || '', cli: c[ci.cli] || '', ana: c[ci.ana] || '', loja: c[ci.loja] || '' });
      });
      return out;
    }

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
    // Motivo de reprovação da coleta simples (coluna R), calculado pelos cortes do CONFIG.
    // Não reprovada / sem dados = vazio. "Divergência Documentação" não dá para saber pelos dados: fica à mão.
    const motivoColunaR = d => {
      if (!d) return '';
      const val = d.val != null ? aNum(d.val) : null;
      const qtd = d.qtd != null ? aNum(d.qtd) : null;
      const sc = d.score != null ? aNum(d.score) : null;
      const v = val != null && val > CONFIG.CORTE_VALOR;
      const q = qtd != null && qtd > CONFIG.CORTE_QTD;
      const m = [];
      if (v && q) m.push('Valor e quantidade de restrições acima do limite');
      else if (v) m.push('Valor de restrições acima do limite');
      else if (q) m.push('Quantidade de restrições acima do limite');
      if (sc != null && sc < CONFIG.CORTE_SCORE) m.push('Score Baixo');
      return m.join(' / ');
    };
    const fmtAtual = a => (/^R\$/.test(a) && num(a) != null ? moeda(num(a)) : a);

    function relatorioCols(m, id, d) {
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
        cols = [nv ? nv.split(',')[0] + ',' + (((nv.split(',')[1] || '') + '00').slice(0, 2)) : ''];
      } else if (m === 'efetivadas') {
        cols = [id, x.cli || '', e.vendedor || '', '', hh, loja.toUpperCase()];   // Acesso ao APP: à mão
      } else {
        const c = d && d.cpf ? d.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
        cols = [id, x.cli || '', c, 'XPANSE - ' + loja.toUpperCase(), e.vendedor || '', e.valor || '', 'Aprovada, não efetivada'];
      }
      return cols;
    }
    const relatorioLinha = (m, id, d) => relatorioCols(m, id, d).map(cel).join('\t');

    // tabela HTML: o Canva/Excel/Sheets mantêm cada coluna separada e a quebra de linha dentro da célula (valor em cima, quantidade embaixo)
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // a quebra de linha dentro da célula (valor em cima, quantidade embaixo) muda conforme o estilo:
    // 'br' = <br>; 'p' = um parágrafo por linha; 'div' = um bloco por linha
    const celulaHtml = (c, est) => {
      const ls = String(c).split('\n');
      if (est === 'xl') return ls.map(esc).join('<br style="mso-data-placement:same-cell;">');
      if (est === 'p' || est === 'div') return ls.map(l => '<' + est + '>' + esc(l) + '</' + est + '>').join('');
      return ls.map(esc).join('<br>');
    };
    const htmlTabela = (linhas, est) => '<table border="1" cellspacing="0" cellpadding="4">' + linhas.map(cols =>
      '<tr>' + cols.map(c => '<td>' + celulaHtml(c, est) + '</td>').join('') + '</tr>').join('') + '</table>';

    /* ---------- detalhe da proposta (Vendedor e Valor) ---------- */
    const DETALHES = ['/MesaCredito/MesaAnaliseProposta?lngProposta=', '/MesaCredito/DetalheProposta?lngProposta='];
    const proprio = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    const normRot = t => t.replace(/:$/, '').trim().toLowerCase();

    // acha o "rótulo" (ex.: Digitador) e devolve o texto do valor que vem logo depois dele
    function acharRotulo(doc, rotulo, depoisDeTitulo) {
      const todos = [...doc.querySelectorAll('body *')];
      let cands = todos.filter(el => normRot(proprio(el)) === rotulo.toLowerCase());
      if (depoisDeTitulo) {
        const tit = todos.find(el => normRot(proprio(el)) === depoisDeTitulo.toLowerCase());
        if (tit) cands = cands.filter(c => tit.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      }
      for (const el of cands) {
        let n = el.nextSibling;
        while (n && ((n.nodeType === 3 && !n.textContent.trim()) || n.nodeName === 'BR')) n = n.nextSibling;
        let t = n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
        if (!t && el.parentElement) {
          let q = el.parentElement.nextElementSibling;
          t = q ? q.textContent.replace(/\s+/g, ' ').trim() : '';
        }
        if (t) return t;
      }
      return null;
    }

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
            if (t.length < 30 && /digitador|vendedor|valor|imei|garantia/i.test(t)) rotulos.add(t);
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
      const extra = GM_getValue('extra', {});
      extra[id] = { vendedor: vendedor || null, valor: valor || null };
      GM_setValue('extra', extra);
      const dbg = GM_getValue('extraDbg', {});
      dbg[id] = { paginas: info, achouVendedor: !!vendedor, achouValor: !!valor, rotulosVistos: [...rotulos].slice(0, 25) };
      GM_setValue('extraDbg', dbg);
    }

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
    function copiar(comId) {
      const dados = GM_getValue('dados', {});
      if (modo() !== 'coleta') {
        if (estilo() !== 'tsv') {
          // todos os relatórios (reprovadas, efetivadas, aprovadas, valor de transação) saem como tabela
          const linhasRel = fila().map(id => relatorioCols(modo(), id, dados[id]));
          if (estilo() === 'xl') copiarHtmlETexto(htmlTabela(linhasRel, 'xl'), linhasRel.map(c => c.map(cel).join('\t')).join('\n'));
          else GM_setClipboard(htmlTabela(linhasRel, estilo()), { type: 'html', mimetype: 'text/html' });
        } else {
          GM_setClipboard(fila().map(id => relatorioLinha(modo(), id, dados[id])).join('\n'), 'text');
        }
        return false;
      }
      const usarId = comId !== undefined ? comId : GM_getValue('origem', 'manual') === 'tela';
      const sep = '\t'.repeat(CONFIG.VAZIAS_APOS_ID + 1);   // id + colunas vazias até a coluna E
      GM_setClipboard(fila().map(id => (usarId ? id + sep : '') + linha(dados[id])).join('\n'), 'text');
      return usarId;
    }

    const avisoCopia = usouId => modo() === 'valortransacao'
      ? 'Cole na coluna Valor de transação, na mesma ordem da lista (linha em branco = sem valor).'
      : modo() !== 'coleta'
      ? (estilo() !== 'tsv' ? 'Copiado como TABELA (uma coluna por campo), na ordem do slide do Canva.' : 'Colunas na ordem do slide do Canva.')
      : usouId
      ? 'Cole na coluna A (proposta). Atenção: Nome, CPF e IMEI das linhas coladas serão sobrescritos por células vazias.'
      : 'Cole na coluna E.';

    function faltantes() {
      const dados = GM_getValue('dados', {});
      const ex = GM_getValue('extra', {});
      const m = modo();
      if (m === 'reprovadas') {
        return fila().map(id => {
          const rp = dados[id] && dados[id].reprov;
          if (rp == null) return id + ' (falta: motivo da reprovação)';
          if (rp === '') return id + ' (o MobFacil NÃO mostrou mensagem de reprovação: conferir à mão)';
          const mt = GM_getValue('meta', {})[id];
          if (!mt || !mt.dh || !mt.loja) return id + ' (falta: horário/loja da tabela da tela)';
          return null;
        }).filter(Boolean);
      }
      if (m === 'valortransacao') return fila().filter(id => !(ex[id] && ex[id].valor)).map(id => id + ' (sem valor de transação)');
      if (m === 'efetivadas') return fila().filter(id => !(ex[id] && ex[id].vendedor)).map(id => id + ' (falta: vendedor)');
      if (m === 'aprovadas') {
        return fila().map(id => {
          const f = [];
          if (!(dados[id] && dados[id].cpf)) f.push('cpf');
          if (!(ex[id] && ex[id].vendedor)) f.push('vendedor');
          if (!(ex[id] && ex[id].valor)) f.push('valor');
          return f.length ? id + ' (falta: ' + f.join(', ') + ')' : null;
        }).filter(Boolean);
      }
      return fila().filter(id => !completo(dados[id]))
        .map(id => id + ' (falta: ' + faltaCampos(dados[id]).join(', ') + ')');
    }

    /* ---------- coleta ---------- */
    async function coletar(id) {
      const base = (document.getElementById('txtCaminhoSistema') || {}).value || '';
      const url = base.replace(/\/$/, '') + '/MesaCredito/MesaAnaliseMobFacil?lngProposta=' + id;

      if (modo() === 'efetivadas' || modo() === 'aprovadas' || modo() === 'valortransacao') {
        await buscarDetalhe(base, id);          // Vendedor e Valor (aba Garantias)
        if (modo() !== 'aprovadas') return null; // só as aprovadas precisam do MobFacil (CPF)
      }

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
          const erro = await coletar(id);
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
      const usouId = copiar(false);   // sem número da proposta: só as 4 colunas, para a coluna E
      const f = faltantes();
      const ef = Object.keys(falhas);
      msg('Fila concluída e resultado COPIADO. ' + avisoCopia(usouId) +
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
      let ids;
      if (m === 'coleta') {
        ids = lerTela($('#mf-canc').checked);
        if (!ids.length) return msg('Não achei propostas na tela. Abra a Mesa de Crédito com a lista visível.');
      } else {
        const ign = $('#mf-canc').checked;
        const todasLinhas = lerLinhas();
        const semConf = todasLinhas.filter(l => !ehConfCad(l.sit));   // CONF CAD fora de todos os relatórios
        confCadIgnoradas = todasLinhas.length - semConf.length;
        const linhas = semConf.filter(l => FILTROS[m](l.sit) && !(ign && (/cancelad/i.test(l.sit) || ehTeste(l.loja))));
        if (!linhas.length) return msg('Nenhuma proposta desse tipo na lista da tela. Confira o filtro de data/situação da Mesa de Crédito.');
        const meta = {};
        linhas.forEach(l => (meta[l.id] = l));
        GM_setValue('meta', meta);
        ids = [...new Set(linhas.map(l => l.id))];
      }
      $('#mf-lista').value = ids.join('\n');
      GM_setValue('origem', 'tela');
      atualizarUI();
      msg(ids.length + ' propostas lidas da tela. Confira com o contador do sistema e clique em Iniciar.' +
        (confCadIgnoradas ? '\n' + confCadIgnoradas + ' em "CONF CAD" (em digitação) ficaram de fora.' : ''));
    };

    $('#mf-ini').onclick = () => {
      if (executando) return;
      if (outraAbaRodando()) return msg('Já existe uma coleta rodando em outra aba.');
      const ids = [...new Set(idsDaCaixa())];
      if (!ids.length) return msg('Clique em "Ler da tela" ou cole a lista de propostas.');
      const dados = GM_getValue('dados', {});
      ids.forEach(id => delete dados[id]);
      GM_setValue('dados', dados);
      const ex0 = GM_getValue('extra', {});
      ids.forEach(id => delete ex0[id]);
      GM_setValue('extra', ex0);
      GM_deleteValue('extraDbg');
      GM_deleteValue('debug');
      // relatórios: garante horário, loja e tipo mesmo com a lista colada à mão
      // (esses dados vêm da tabela da Mesa de Crédito que está na tela, não do MobFacil)
      let avisoMeta = '';
      if (modo() !== 'coleta') {
        const meta = GM_getValue('meta', {});
        lerLinhas().forEach(l => { if (ids.includes(l.id)) meta[l.id] = l; });
        GM_setValue('meta', meta);
        const sem = ids.filter(id => !meta[id]);
        if (sem.length) avisoMeta = '\nSem horário/loja (não estão na tabela da tela): ' + sem.join(', ') +
          '. Deixe a lista da Mesa de Crédito visível e clique em Iniciar de novo.';
      }
      GM_setValue('fila', ids);
      GM_setValue('feitas', []);
      GM_setValue('rodando', true);
      Object.keys(falhas).forEach(k => delete falhas[k]);
      executando = true;
      iniciarBatida();
      msg('Rodando... deixe esta aba aberta e visível.' + avisoMeta);
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
      ['dados', 'fila', 'feitas', 'fim', 'debug', 'origem', 'atualId', 'meta', 'extra', 'extraDbg'].forEach(k => GM_deleteValue(k));
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
    $('#mf-colr').onclick = () => {
      atualizarFila();
      const dados = GM_getValue('dados', {});
      const f = fila();
      if (!f.length) return msg('Não há propostas na fila. Leia a tela ou cole a lista e faça a coleta antes.');
      GM_setClipboard(f.map(id => motivoColunaR(dados[id])).join('\n'), 'text');
      const sem = f.filter(id => !completo(dados[id])).length;
      const com = f.filter(id => motivoColunaR(dados[id])).length;
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
        debug[id] = (incompleta && n++ < 3) ? d : { ...d, esqueleto: undefined, dentroDasRaizes: undefined, historico: undefined };
      });
      if (dbg['sem-id']) debug['sem-id'] = dbg['sem-id'];
      GM_setClipboard(JSON.stringify({
        versao: VERSAO, dados, fila: fila(), faltam: faltantes(), falhas, extraDbg: GM_getValue('extraDbg', {}),
        // horário/loja/analista da tabela da tela: só mostra se o campo existe (sem nomes de clientes)
        meta: Object.fromEntries(fila().map(id => { const m = GM_getValue('meta', {})[id]; return [id, m ? { dh: !!m.dh, loja: !!m.loja, ana: !!m.ana } : null]; })),
        debug,
      }, null, 1), 'text');
      msg('Diagnóstico copiado.');
    };

    // ao recarregar a página, restaura a fila salva (permite continuar depois de fechar/recarregar)
    if (fila().length) $('#mf-lista').value = fila().join('\n');
    atualizarUI();
  }

  /* ================= INÍCIO ================= */
  if (location.hostname.endsWith('mobfacil.com.br')) iniciarMotor();
  else if (window.top === window) iniciarPainel();
})();
