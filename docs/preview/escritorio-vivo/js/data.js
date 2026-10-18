/* Dados do preview "Escritório vivo": agentes, estados, opiniões e textos. Tudo fictício (simulação, dinheiro fictício). */
(function () {
  'use strict';
  var AV = (window.AV = window.AV || {});

  /* Ícones (24x24, preenchidos com currentColor). Estado nunca só por cor: ícone + palavra + cor. */
  AV.ICON = {
    up: '<path d="M12 5 21 19H3z"/>',
    down: '<path d="M12 19 3 5h18z"/>',
    pause: '<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/>',
    shield: '<path d="M12 2.5 19.8 5.8v5.9c0 4.8-3.3 8.4-7.8 10.3-4.5-1.9-7.8-5.5-7.8-10.3V5.8z"/>',
    check: '<path d="m5 12.6 4.5 4.5L19.2 7.3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    warn: '<path d="M12 2.6 22.4 20.6H1.6z"/><path d="M12 9.2v5.4M12 17.1v.1" fill="none" stroke="var(--chip-bg,#fff)" stroke-width="2.4" stroke-linecap="round"/>',
    diamond: '<path d="M12 2 21 12 12 22 3 12z"/>',
  };
  AV.icon = function (name, size) {
    var s = size || 14;
    return '<svg class="ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="currentColor" aria-hidden="true" focusable="false">' + AV.ICON[name] + '</svg>';
  };

  /* Votos: palavra + ícone + tom (o tom vira cor no CSS). */
  AV.VOTE = {
    buy: { word: 'Comprar', short: 'Comp.', icon: 'up', tone: 'buy' },
    sell: { word: 'Vender', short: 'Vend.', icon: 'down', tone: 'sell' },
    wait: { word: 'Esperar', short: 'Esp.', icon: 'pause', tone: 'wait' },
    protect: { word: 'Proteção', short: 'Prot.', icon: 'shield', tone: 'warn' },
    ok: { word: 'Conferido', short: 'Conf.', icon: 'check', tone: 'wait' },
    nokey: { word: 'Sem chave', short: 'S/chave', icon: 'warn', tone: 'warn' },
  };

  /* Estados da simulação (o que o usuário controla no topo). */
  AV.STATES = {
    wait: { key: 'wait', label: 'Esperar', vote: 'wait', plaque: 'ESPERAR · sem sinal', sr: 'A equipe recomenda esperar: não há sinal claro agora.' },
    buy: { key: 'buy', label: 'Compra recomendada', vote: 'buy', plaque: 'COMPRA · ganho líquido +2,4%', sr: 'Compra recomendada: entrada em 0,00001240, alvo em 0,00001275 e proteção em 0,00001221, com ganho líquido estimado de 2,4%.' },
    sell: { key: 'sell', label: 'Venda recomendada', vote: 'sell', plaque: 'VENDA · ganho líquido +2,2%', sr: 'Venda recomendada: saída perto de 0,00001272, com ganho líquido de 2,2% sobre a entrada em 0,00001240.' },
    protect: { key: 'protect', label: 'Proteção ativada', vote: 'protect', plaque: 'PROTEÇÃO · perda limitada a −1,5%', sr: 'Proteção ativada: saída automática em 0,00001221, limitando a perda a 1,5%.' },
  };
  AV.STATE_ORDER = ['wait', 'buy', 'sell', 'protect'];

  /* Agentes de regra. deskU/row: lugar na planta. screen: tipo de gráfico no monitor. */
  AV.RULE = [
    { id: 'tiago', kind: 'rule', name: 'Tiago', role: 'Tendência', full: 'Tiago-Tendência', shirt: '--shirt-trend', skin: 1, hair: 1, hairStyle: 'short', deskU: 7.0, row: 'A', screen: 'candles', decor: 'plant' },
    { id: 'renata', kind: 'rule', name: 'Renata', role: 'Reversão', full: 'Renata-Reversão', shirt: '--shirt-reversion', skin: 4, hair: 2, hairStyle: 'long', deskU: 9.4, row: 'A', screen: 'rsi', decor: 'mug' },
    { id: 'vitor', kind: 'rule', name: 'Vitor', role: 'Volume', full: 'Vitor-Volume', shirt: '--shirt-volume', skin: 2, hair: 4, hairStyle: 'short', deskU: 11.8, row: 'A', screen: 'volume', decor: 'papers' },
    { id: 'sofia', kind: 'rule', name: 'Sofia', role: 'Sentimento', full: 'Sofia-Sentimento', shirt: '--shirt-sentiment', skin: 3, hair: 3, hairStyle: 'bun', deskU: 7.0, row: 'B', screen: 'mood', decor: 'mug' },
    { id: 'alice', kind: 'rule', name: 'Alice', role: 'Analista de risco', full: 'Alice-Analista de Risco', shirt: '--shirt-analyst', skin: 1, hair: 5, hairStyle: 'long', deskU: 9.4, row: 'B', screen: 'risk', decor: 'plaque' },
    { id: 'otavio', kind: 'rule', name: 'Otávio', role: 'Auditor', full: 'Otávio-Auditor', shirt: '--shirt-auditor', skin: 4, hair: 2, hairStyle: 'glasses', deskU: 11.8, row: 'B', screen: 'audit', decor: 'papers' },
  ];
  /* Equipes de modelo (◆). */
  AV.MODEL = [
    { id: 'nina', kind: 'model', name: 'Nina', provider: 'Gemini', role: 'Gemini', full: 'Nina (Gemini)', skin: 3, hair: 3, hairStyle: 'bun', deskU: 1.5, row: 'M', slot: 0, screen: 'candles', decor: 'mug' },
    { id: 'lucas', kind: 'model', name: 'Lucas', provider: 'Claude', role: 'Claude', full: 'Lucas (Claude)', skin: 2, hair: 1, hairStyle: 'short', deskU: 4.2, row: 'M', slot: 1, screen: 'candles', decor: 'papers' },
    { id: 'olivia', kind: 'model', name: 'Olívia', provider: 'GPT', role: 'GPT', full: 'Olívia (GPT)', skin: 1, hair: 2, hairStyle: 'long', deskU: 6.9, row: 'M', slot: 2, screen: 'candles', decor: 'plant' },
  ];
  AV.ALL = AV.RULE.concat(AV.MODEL);
  AV.byId = {};
  AV.ALL.forEach(function (a) { AV.byId[a.id] = a; });

  /* Opiniões das regras por estado: [voto, frase curta]. */
  AV.OPIN = {
    wait: {
      tiago: ['wait', 'Tendência lateral, sem direção'],
      renata: ['wait', 'RSI neutro (52)'],
      vitor: ['wait', 'Volume abaixo da média'],
      sofia: ['wait', 'Humor morno nas redes'],
      alice: ['wait', 'Sem entrada, risco em dia'],
      otavio: ['ok', 'Nada a auditar ainda'],
    },
    buy: {
      tiago: ['buy', 'Média curta cruzou para cima'],
      renata: ['wait', 'RSI 68: um pouco esticado'],
      vitor: ['buy', 'Volume 2× a média'],
      sofia: ['buy', 'Humor positivo e crescente'],
      alice: ['buy', 'Risco ok, proteção em −1,5%'],
      otavio: ['ok', 'Custos e taxas conferidos'],
    },
    sell: {
      tiago: ['sell', 'Cruzamento para baixo'],
      renata: ['sell', 'RSI 74: sobrecomprado'],
      vitor: ['wait', 'Volume normal, sem pressa'],
      sofia: ['sell', 'Humor eufórico: cuidado'],
      alice: ['sell', 'Realizar: +2,2% líquido'],
      otavio: ['ok', 'Ganho líquido conferido'],
    },
    protect: {
      tiago: ['protect', 'Perdeu a mínima do dia'],
      renata: ['protect', 'RSI despencou rápido'],
      vitor: ['protect', 'Volume de pânico'],
      sofia: ['protect', 'Humor virou negativo'],
      alice: ['protect', 'Saída em −1,5% ativada'],
      otavio: ['ok', 'Proteção registrada'],
    },
  };
  /* Opiniões das equipes de modelo: [voto, %]. Texto montado: "Olívia: esperar, 65%". */
  AV.OPIN_MODEL = {
    wait: { nina: ['wait', 58], lucas: ['wait', 66], olivia: ['wait', 71] },
    buy: { nina: ['buy', 62], lucas: ['buy', 71], olivia: ['wait', 65] },
    sell: { nina: ['sell', 60], lucas: ['sell', 68], olivia: ['wait', 54] },
    protect: { nina: ['protect', 74], lucas: ['protect', 81], olivia: ['protect', 69] },
  };
  var VERB = { buy: 'comprar', sell: 'vender', wait: 'esperar', protect: 'proteger', ok: 'conferido' };

  /* Estado das equipes de modelo no preview: 'off' | 'on' | 'nokey'. */
  AV.modelMode = { nina: 'on', lucas: 'nokey', olivia: 'on' };

  /* Opinião efetiva de um agente no estado atual: {vote, text, pct}. */
  AV.opinion = function (agent, state) {
    if (agent.kind === 'model') {
      if (AV.modelMode[agent.id] === 'nokey') return { vote: 'nokey', text: agent.name + ': sem chave, não opina', pct: null };
      var o = AV.OPIN_MODEL[state][agent.id];
      return { vote: o[0], text: agent.name + ': ' + VERB[o[0]] + ', ' + o[1] + '%', pct: o[1] };
    }
    var r = AV.OPIN[state][agent.id];
    return { vote: r[0], text: r[1], pct: null };
  };
  AV.active = function () {
    return AV.RULE.concat(AV.MODEL.filter(function (m) { return AV.modelMode[m.id] !== 'off'; }));
  };
  AV.rand = function (a, b) { return a + Math.random() * (b - a); };
})();
