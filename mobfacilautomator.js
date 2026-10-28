// ==UserScript==
// @name         MobFacil -> Planilha (automático)
// @namespace    mobfacil-planilha
// @version      11.23
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

  // sleep via Web Worker: abas em segundo plano deixam setTimeout lento