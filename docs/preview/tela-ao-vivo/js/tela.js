(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var fmtN = function (v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var PRICE_D = 8;
  var price = function (v) { return fmtN(v, PRICE_D); };
  var signed = function (v, d) { return (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), d); };

  var ICON = {
    buy: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1l5 9H1z" fill="currentColor"/></svg>',
    sell: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 11L1 2h10z" fill="currentColor"/></svg>',
    flat: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5" width="10" height="2" rx="1" fill="currentColor"/></svg>'
  };
  var VOTE = { buy: ['buy', 'Comprar'], sell: ['sell', 'Sair'], flat: ['', 'Neutro'] };
  var SHIRT = { Tendência: '#2a7f95', Reversão: '#6f61c9', Volume: '#9a6a14', Sentimento: '#b24572', Auditor: '#5a6580', Alfa: '#7e2f9a', Beta: '#7e2f9a' };

  // ---- dados mock ----------------------------------------------------------
  var BASE = 0.00001234, INITIAL = 1000, FLOOR = 800, DOUBLE = 2000;
  var RULES = function (v) {
    return [
      ['Tendência', 'EMA 9/21 e MACD', v[0], v[0] === 'buy' ? 'Média curta cruzou acima da longa' : v[0] === 'sell' ? 'Média curta cruzou abaixo' : 'Sem cruzamento'],
      ['Reversão', 'RSI 14 e Bollinger', v[1], v[1] === 'buy' ? 'RSI 34, perto da banda inferior' : v[1] === 'sell' ? 'RSI 74, esticado' : 'RSI 51, no meio'],
      ['Volume', 'OBV', v[2], v[2] === 'buy' ? 'Volume acumulado subindo' : v[2] === 'sell' ? 'Volume acumulado caindo' : 'Volume parado'],
      ['Sentimento', 'Medo e Ganância', v[3], v[3] === 'buy' ? 'Índice 28, medo' : v[3] === 'sell' ? 'Índice 81, ganância' : 'Índice 52, neutro']
    ];
  };
  var STATES = {
    bought: {
      pill: ['live', 'Ao vivo · rodando'], note: 'PEPE/USDT ao vivo · há 1 s · próxima decisão às 15:00, em 23:12',
      verb: ['hold', 'Esperar a saída'], kicker: 'A simulação está comprada',
      why: 'Posição simulada aberta. A saída acontece sozinha quando o preço tocar o alvo ou o stop.',
      levels: [['Entrada paga', 0.00001198, 'ontem às 21:00'], ['Alvo', 0.00001316, '+9,9% desde a entrada', 't'], ['Stop', 0.00001141, '−4,8% desde a entrada', 's']],
      result: 62.4, hold: 38.9, equity: 1062.4, now: 0.00001262, tally: ['buy', '3 de 4 regras: comprar'],
      votes: ['buy', 'flat', 'buy', 'buy'], auditor: 'Acertou 54% fora da amostra (moeda ao ar: 50%)',
      models: [['Alfa', 'buy', 'Mantém: momentum ainda forte'], ['Beta', 'flat', 'Neutra: volume fraco']],
      pos: 'open'
    },
    waiting: {
      pill: ['wait', 'Ao vivo · aguardando compra'], note: 'PEPE/USDT ao vivo · há 2 s · próxima decisão às 15:00, em 23:12',
      verb: ['wait', 'Aguardar'], kicker: 'O que a simulação faria agora',
      why: 'Nenhuma compra simulada. Compraria se a vela de 1 hora fechar acima da entrada planejada.',
      levels: [['Entrada planejada', 0.00001285, 'fechamento acima de'], ['Alvo', 0.00001412, '+9,9% desde a entrada', 't'], ['Stop', 0.00001223, '−4,8% desde a entrada', 's']],
      result: -12.3, hold: -21.4, equity: 987.7, now: 0.00001241, tally: ['', '1 de 4 regras: comprar'],
      votes: ['flat', 'buy', 'flat', 'flat'], auditor: 'Acertou 54% fora da amostra (moeda ao ar: 50%)',
      models: [['Alfa', 'flat', 'Espera: sem rompimento'], ['Beta', 'buy', 'Vê reversão de curto prazo']],
      pos: 'none'
    },
    nodata: {
      pill: ['wait', 'Esperando dado'], note: 'Sem vela nova desde 13:00 · recuperando o intervalo (2 de 3 leituras limpas)',
      verb: ['wait', 'Aguardar o dado'], kicker: 'A decisão está pausada',
      why: 'A Binance não entregou as últimas velas. A simulação não decide no escuro; quando o dado voltar, retoma sozinha.',
      levels: null, levelsMsg: 'Valores congelados na última vela decidida (13:00): entrada planejada 0,00001285 · alvo 0,00001412 · stop 0,00001223.',
      result: -12.3, hold: -21.4, equity: 987.7, now: 0.00001241, tally: ['', 'Equipe em pausa'],
      votes: ['flat', 'flat', 'flat', 'flat'], paused: true, auditor: 'Aguarda dado novo para conferir',
      models: [['Alfa', 'flat', 'Em pausa'], ['Beta', 'flat', 'Em pausa']], pos: 'none', gapFrom: 82
    },
    ended: {
      pill: ['done', 'Encerrada · meta atingida'], note: 'Terminou hoje às 11:00 · a posição simulada foi fechada no alvo',
      verb: ['done', 'Meta atingida'], kicker: 'Simulação encerrada',
      why: 'O saldo fictício chegou à meta de +3% em 7 dias. Nenhuma ordem nova será simulada. Nada disso garante resultado futuro.',
      levels: [['Entrada paga', 0.00001198, '17/10 às 21:00'], ['Saída no alvo', 0.00001316, 'hoje às 11:00', 't'], ['Stop (não tocado)', 0.00001141, 'permaneceu abaixo', 's']],
      result: 99.4, hold: 61.2, equity: 1099.4, now: 0.00001316, tally: ['', 'Equipe dispensada'],
      votes: ['flat', 'flat', 'flat', 'flat'], paused: true, auditor: 'Conferência final: 3 acertos em 4 operações',
      models: [['Alfa', 'flat', 'Sem opinião: simulação encerrada'], ['Beta', 'flat', 'Sem opinião: simulação encerrada']], pos: 'closed'
    }
  };

  // ---- gráfico ---------------------------------------------------------------
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function candles(n) {
    var r = rng(7), p = BASE * 0.97, out = [];
    for (var i = 0; i < n; i++) {
      var trend = i > 40 && i < 62 ? 0.0006 : i > 62 ? 0.00025 : -0.0001;
      var o = p, c = o * (1 + (r() - 0.5) * 0.028 + trend);
      var h = Math.max(o, c) * (1 + r() * 0.008), l = Math.min(o, c) * (1 - r() * 0.008);
      out.push({ o: o, h: h, l: l, c: c, t: i }); p = c;
    }
    var k = out[out.length - 1].c; // reescala o fim para o preço do estado
    return out.map(function (x) { return { o: x.o, h: x.h, l: x.l, c: x.c, t: x.t }; }).map(function (x) { x.k = k; return x; });
  }
  var N = 96, DATA = candles(N), cur, hoverI = null;
  function stamp(i) {
    var m = (i - (N - 1)) + 15 * 1; // 15:00 é a última vela
    var hh = ((15 + (i - (N - 1))) % 24 + 24) % 24;
    var daysBack = Math.ceil(((N - 1) - i - 15) / 24);
    var d = new Date(2026, 9, 19 - Math.max(0, daysBack), hh);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + String(hh).padStart(2, '0') + ':00';
  }
  function series(s) {
    var last = s.now, scale = last / DATA[N - 1].c, end = s.gapFrom || N;
    return DATA.slice(0, end).map(function (x) { return { o: x.o * scale, h: x.h * scale, l: x.l * scale, c: x.c * scale, t: x.t }; });
  }
  function svgEl(name, attrs, txt) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (txt != null) e.textContent = txt; return e;
  }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function drawChart() {
    var svg = $('#chart'), box = $('#chart-box'), W = box.clientWidth, H = box.clientHeight, s = cur;
    if (!W || !H) return;
    svg.textContent = ''; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var data = series(s), mob = W < 560, padL = 6, padR = mob ? 62 : 84, padT = 10, padB = 24;
    var lv = s.levels && s.levels.filter(function (l) { return l[1]; }).map(function (l) { return l[1]; }) || [];
    var all = data.reduce(function (a, c) { return a.concat([c.h, c.l]); }, []).concat(lv);
    var hi = Math.max.apply(null, all) * 1.01, lo = Math.min.apply(null, all) * 0.99;
    var iw = W - padL - padR, ih = H - padT - padB, step = iw / (N + 1);
    var X = function (i) { return padL + step * (i + 0.5); }, Y = function (v) { return padT + (hi - v) / (hi - lo) * ih; };
    var g = svgEl('g', {}); svg.appendChild(g);
    for (var k = 0; k <= 4; k++) {
      var v = lo + (hi - lo) * k / 4, y = Y(v);
      g.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: css('--grid'), 'stroke-width': 1 }));
      g.appendChild(svgEl('text', { x: W - padR + 6, y: y + 4, fill: css('--ink-3'), 'font-size': 11, 'font-family': 'ui-monospace,monospace' }, fmtN(v * 1e5, 3) + 'e-5'));
    }
    var every = mob ? 24 : 12;
    for (var i = 0; i < N; i += every) g.appendChild(svgEl('text', { x: X(i), y: H - 6, fill: css('--ink-3'), 'font-size': 11, 'text-anchor': 'middle' }, stamp(i).slice(6)));
    if (s.gapFrom) { // intervalo sem dados
      var gx = X(s.gapFrom) - step / 2;
      var pat = svgEl('pattern', { id: 'hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: css('--warn'), 'stroke-width': 1, opacity: 0.35 }));
      svg.appendChild(pat);
      svg.appendChild(svgEl('rect', { x: gx, y: padT, width: W - padR - gx, height: ih, fill: 'url(#hatch)' }));
      svg.appendChild(svgEl('text', { x: gx + 8, y: padT + 18, fill: css('--warn'), 'font-size': 12, 'font-weight': 700 }, 'Sem dados desde 13:00'));
    }
    var bw = Math.max(2, step * 0.62);
    data.forEach(function (c, i) {
      var up = c.c >= c.o, col = up ? css('--candle-up') : css('--candle-down');
      g.appendChild(svgEl('line', { x1: X(i), x2: X(i), y1: Y(c.h), y2: Y(c.l), stroke: col, 'stroke-width': 1 }));
      g.appendChild(svgEl('rect', { x: X(i) - bw / 2, y: Math.min(Y(c.o), Y(c.c)), width: bw, height: Math.max(1.5, Math.abs(Y(c.o) - Y(c.c))), fill: up ? 'none' : col, stroke: col, 'stroke-width': 1.2 }));
    });
    levelLines(svg, s, Y, padL, W - padR, mob, W);
    markers(svg, s, X, Y, data);
    var lastC = data[data.length - 1];
    var ly = Y(lastC.c);
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: ly, y2: ly, stroke: css('--accent'), 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
    var tag = svgEl('g', {});
    tag.appendChild(svgEl('rect', { x: W - padR + 2, y: ly - 10, width: padR - 4, height: 20, rx: 4, fill: css('--accent') }));
    tag.appendChild(svgEl('text', { x: W - padR + 6, y: ly + 4, fill: css('--on-accent'), 'font-size': 10.5, 'font-weight': 700, 'font-family': 'ui-monospace,monospace' }, fmtN(lastC.c * 1e5, 3) + 'e-5'));
    svg.appendChild(tag);
    if (hoverI != null && data[hoverI]) {
      var hx = X(hoverI);
      svg.appendChild(svgEl('line', { x1: hx, x2: hx, y1: padT, y2: H - padB, stroke: css('--ink-3'), 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    }
    svg._geo = { X: X, N: data.length, padL: padL, step: step, data: data };
  }
  function levelLines(svg, s, Y, x1, x2, mob, W) {
    if (!s.levels) return;
    var spec = { t: ['--buy', '5 4', 'Alvo'], s: ['--sell', '5 4', 'Stop'] };
    s.levels.forEach(function (l, idx) {
      var key = l[3] || (idx === 0 ? 'e' : ''), y = Y(l[1]);
      var col = key === 't' ? '--buy' : key === 's' ? '--sell' : '--accent', dash = key === 'e' ? (s.pos === 'none' ? '2 4' : '0') : '5 4';
      svg.appendChild(svgEl('line', { x1: x1, x2: x2, y1: y, y2: y, stroke: css(col), 'stroke-width': 1.5, 'stroke-dasharray': dash }));
      var name = key === 't' ? 'Alvo' : key === 's' ? 'Stop' : (s.pos === 'none' ? 'Entrada' : 'Entrada');
      svg.appendChild(svgEl('text', { x: x1 + 6, y: y - 5, fill: css(col), 'font-size': 11.5, 'font-weight': 700 }, name + ' ' + fmtN(l[1] * 1e5, 3) + 'e-5'));
    });
    if (s.pos === 'open') { // zonas de ganho e perda
      var e = Y(s.levels[0][1]);
      svg.insertBefore(svgEl('rect', { x: x1, y: Y(s.levels[1][1]), width: x2 - x1, height: e - Y(s.levels[1][1]), fill: css('--buy'), opacity: 0.07 }), svg.firstChild.nextSibling);
      svg.insertBefore(svgEl('rect', { x: x1, y: e, width: x2 - x1, height: Y(s.levels[2][1]) - e, fill: css('--sell'), opacity: 0.07 }), svg.firstChild.nextSibling);
    }
  }
  function markers(svg, s, X, Y, data) {
    var m = [];
    if (s.pos === 'open') m.push([68, 'buy', 'Compra']);
    if (s.pos === 'closed') { m.push([44, 'buy', 'Compra']); m.push([90, 'sell', 'Meta']); }
    m.forEach(function (mk) {
      var c = data[mk[0]]; if (!c) return;
      var up = mk[1] === 'buy', x = X(mk[0]), y = up ? Y(c.l) + 16 : Y(c.h) - 16, col = css(up ? '--buy' : '--sell');
      svg.appendChild(svgEl('path', { d: up ? 'M' + x + ' ' + (y - 9) + 'l8 14h-16z' : 'M' + x + ' ' + (y + 9) + 'l8 -14h-16z', fill: col, stroke: css('--surface'), 'stroke-width': 1.5 }));
      svg.appendChild(svgEl('text', { x: x, y: up ? y + 20 : y - 14, fill: col, 'font-size': 11.5, 'font-weight': 700, 'text-anchor': 'middle' }, mk[2]));
    });
  }
  function setReadout(i) {
    var d = $('#chart')._geo && $('#chart')._geo.data[i]; if (!d) return;
    $('#readout').textContent = stamp(i) + '  A ' + fmtN(d.o * 1e5, 3) + '  M ' + fmtN(d.h * 1e5, 3) + '  m ' + fmtN(d.l * 1e5, 3) + '  F ' + fmtN(d.c * 1e5, 3) + ' (e-5)';
  }
  function bindChart() {
    var svg = $('#chart');
    svg.addEventListener('pointermove', function (ev) {
      var g = svg._geo; if (!g) return; var r = svg.getBoundingClientRect();
      var i = Math.round((ev.clientX - r.left - g.padL) / g.step - 0.5);
      hoverI = Math.max(0, Math.min(g.N - 1, i)); setReadout(hoverI); drawChart();
    });
    svg.addEventListener('pointerleave', function () { hoverI = null; $('#readout').textContent = 'passe o mouse ou use as setas no gráfico'; drawChart(); });
    svg.addEventListener('keydown', function (ev) {
      var g = svg._geo; if (!g) return;
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return; ev.preventDefault();
      var i = hoverI == null ? g.N - 1 : hoverI; i += ev.key === 'ArrowLeft' ? -1 : 1;
      hoverI = Math.max(0, Math.min(g.N - 1, i)); setReadout(hoverI); drawChart();
    });
  }

  // ---- blocos de texto ----------------------------------------------------------
  function render(key) {
    cur = STATES[key]; var s = cur; hoverI = null;
    document.body.dataset.state = key;
    $('#status').innerHTML = '<span class="pill ' + s.pill[0] + '"><span class="dot"></span>' + s.pill[1] + '</span><span class="status-note">' + s.note + '</span>';
    var v = $('#now-h'); v.className = 'verb ' + s.verb[0]; v.textContent = s.verb[1];
    $('#now-kicker').textContent = s.kicker; $('#now-why').textContent = s.why;
    var L = $('#levels'); L.textContent = '';
    if (!s.levels) { L.innerHTML = '<li class="levels-empty">' + s.levelsMsg + '</li>'; }
    else s.levels.forEach(function (l) {
      var li = document.createElement('li'); li.className = 'lvl ' + (l[3] || '');
      li.innerHTML = '<span class="lvl-name">' + l[0] + '</span><span class="lvl-val">' + price(l[1]) + '</span><span class="lvl-sub">' + l[2] + '</span>' +
        '<button type="button" class="copy" data-copy="' + price(l[1]) + '" aria-label="Copiar ' + l[0] + ' ' + price(l[1]) + '">Copiar</button>';
      L.appendChild(li);
    });
    kpis(s); team(s); tabs(key, s); drawChart();
    $('#chart-desc').textContent = 'Gráfico de velas de 1 hora de PEPE/USDT, últimas 96 velas. Último preço ' + price(s.now) + '. ' + (s.pos === 'open' ? 'Posição simulada aberta, com linhas de entrada, alvo e stop.' : s.pos === 'closed' ? 'Posição simulada fechada no alvo.' : s.gapFrom ? 'Faixa hachurada marca o intervalo sem dados.' : 'Sem posição; linhas pontilhadas mostram os valores planejados.');
    $('#legend').innerHTML = '<span class="lg" style="color:var(--buy)"><i class="dash"></i>Alvo</span><span class="lg" style="color:var(--sell)"><i class="dash"></i>Stop</span><span class="lg" style="color:var(--accent)"><i class="ref"></i>Entrada / preço atual</span>';
  }
  function kpis(s) {
    var pos = s.result >= 0, k = $('#kpis'), pct = s.result / INITIAL * 100, hp = s.hold / INITIAL * 100;
    var p = (s.equity - 0) , place = Math.max(0, Math.min(100, (s.equity - 600) / (2200 - 600) * 100));
    var floorPct = (FLOOR - 600) / 1600 * 100, dblPct = (DOUBLE - 600) / 1600 * 100;
    k.innerHTML =
      '<div class="kpi"><div class="kpi-l">Resultado da simulação</div><div class="kpi-v ' + (pos ? 'pos' : 'neg') + '">' + signed(s.result, 2) + ' <small>USDT fict.</small></div><div class="kpi-s">' + signed(pct, 1) + '% sobre o saldo inicial de ' + fmtN(INITIAL, 0) + '</div></div>' +
      '<div class="kpi"><div class="kpi-l">Comprar e segurar</div><div class="kpi-v ' + (hp >= 0 ? 'pos' : 'neg') + '">' + signed(hp, 1) + '%</div><div class="kpi-s">' + (pct >= hp ? 'Simulação à frente por ' : 'Simulação atrás por ') + fmtN(Math.abs(pct - hp), 1) + ' p.p.</div></div>' +
      '<div class="kpi wide"><div class="kpi-l">Sobrevivência do saldo · piso ' + fmtN(FLOOR, 0) + ' · meta de dobro ' + fmtN(DOUBLE, 0) + '</div>' +
      '<div class="surv" role="img" aria-label="Saldo fictício ' + fmtN(s.equity, 2) + ' entre o piso de ' + FLOOR + ' e a meta de ' + DOUBLE + '"><i style="left:' + place + '%"></i></div>' +
      '<div class="surv-l"><span>Piso ' + fmtN(FLOOR, 0) + '</span><strong class="num" style="color:var(--ink)">Saldo ' + fmtN(s.equity, 2) + '</strong><span>Dobro ' + fmtN(DOUBLE, 0) + '</span></div></div>';
  }
  function team(s) {
    var rules = RULES(s.votes), body = '', mini = '', buys = 0;
    body += '<div class="group-t">Regras da estratégia</div>';
    rules.forEach(function (r) {
      var vt = s.paused ? 'flat' : r[2]; if (vt === 'buy') buys++;
      var lab = s.paused ? 'Em pausa' : VOTE[vt][1];
      body += member(r[0], r[1], s.paused ? 'Sem leitura nova' : r[3], vt, lab, SHIRT[r[0]], r[0][0]);
      mini += '<span class="mv ' + VOTE[vt][0] + '"><span class="avatar" style="background:' + SHIRT[r[0]] + '">' + r[0][0] + '</span>' + ICON[vt] + lab + '</span>';
    });
    body += member('Auditor', 'Confere os acertos', s.auditor, 'flat', 'Confere', SHIRT.Auditor, 'A');
    body += '<div class="group-t">Equipes de modelo (ligadas)</div>';
    s.models.forEach(function (m) { body += member('Equipe ' + m[0], 'Opinião de modelo', m[2], m[1], m[1] === 'buy' ? 'Comprar' : m[1] === 'sell' ? 'Sair' : 'Neutro', SHIRT[m[0]], m[0][0], true); });
    $('#team-mini').innerHTML = mini; $('#team-body').innerHTML = body;
    var t = $('#tally'); t.textContent = s.paused ? s.tally[1] : buys + ' de 4 regras: comprar'; t.className = 'tally ' + (s.paused ? '' : buys >= 3 ? 'buy' : '');
  }
  function member(name, sub, desc, vt, lab, color, init, model) {
    return '<div class="mem"><span class="avatar" style="background:' + color + '" aria-hidden="true">' + init + '</span><div><div class="mem-n">' + name + '</div><div class="mem-d">' + desc + '</div></div>' +
      '<span class="vote ' + (model && vt !== 'flat' ? 'model' : VOTE[vt][0]) + '">' + ICON[vt] + lab + '</span></div>';
  }
  function tabs(key, s) {
    var defs = [['ops', 'Operações', s.pos === 'none' ? 0 : s.pos === 'closed' ? 4 : 5], ['sig', 'Sinais', 38], ['alerts', 'Alertas', 3], ['plan', 'Plano', ''], ['csv', 'Registro CSV', '']];
    var bar = $('#tabs'), pan = $('#tab-panels'); bar.textContent = ''; pan.textContent = '';
    defs.forEach(function (d, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.id = 'tab-' + d[0]; b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'pn-' + d[0]); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); b.tabIndex = i === 0 ? 0 : -1;
      b.innerHTML = d[1] + (d[2] !== '' ? '<span class="count">' + d[2] + '</span>' : ''); bar.appendChild(b);
      var p = document.createElement('div'); p.className = 'panel'; p.id = 'pn-' + d[0]; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', b.id); p.hidden = i !== 0; p.tabIndex = 0;
      p.innerHTML = PANEL[d[0]](s); pan.appendChild(p);
    });
  }
  var PANEL = {
    ops: function (s) {
      if (s.pos === 'none') return '<div class="empty">Nenhuma operação simulada ainda. Quando a estratégia comprar, ela aparece aqui.</div>';
      var rows = s.pos === 'closed' ? [['17/10 21:00', 'Compra', 0.00001198, 3.1, '+9,9%'], ['18/10 04:00', 'Venda', 0.00001316, 3.1, '+9,9%']] : [['18/10 21:00', 'Compra', 0.00001198, 3.1, 'aberta']];
      var h = '<h3>Operações da simulação</h3><table class="stack"><thead><tr><th>Quando</th><th>Lado</th><th class="r">Preço</th><th class="r">Quantidade (mi)</th><th class="r">Resultado</th></tr></thead><tbody>';
      rows.forEach(function (r) { h += '<tr><td data-l="Quando">' + r[0] + '</td><td data-l="Lado"><span class="chip ' + (r[1] === 'Compra' ? 'buy' : 'sell') + '">' + r[1] + '</span></td><td class="r num" data-l="Preço">' + price(r[2]) + '</td><td class="r num" data-l="Quantidade">' + r[3] + '</td><td class="r num" data-l="Resultado">' + r[4] + '</td></tr>'; });
      return h + '</tbody></table>';
    },
    sig: function () {
      return '<h3>Histórico de sinais</h3><p class="hint">Mostra os últimos sinais; o neutro fica escondido.</p><table class="stack"><thead><tr><th>Vela</th><th>Sinal</th><th>Por quê</th></tr></thead><tbody>' +
        '<tr><td data-l="Vela">15:00</td><td data-l="Sinal"><span class="chip buy">Comprar</span></td><td data-l="Por quê">Placar 3 de 4 acima do limiar</td></tr>' +
        '<tr><td data-l="Vela">09:00</td><td data-l="Sinal"><span class="chip sell">Sair</span></td><td data-l="Por quê">RSI esticado, volume caindo</td></tr>' +
        '<tr><td data-l="Vela">ontem 21:00</td><td data-l="Sinal"><span class="chip buy">Comprar</span></td><td data-l="Por quê">Cruzamento EMA e medo no índice</td></tr></tbody></table>';
    },
    alerts: function () {
      return '<h3>Alertas</h3><p class="hint">Avisos no Telegram e alertas de preço desta moeda.</p><table class="stack"><thead><tr><th>Tipo</th><th>Condição</th><th>Estado</th></tr></thead><tbody>' +
        '<tr><td data-l="Tipo">Sinal</td><td data-l="Condição">Compra ou saída simulada</td><td data-l="Estado"><span class="chip buy">Ligado</span></td></tr>' +
        '<tr><td data-l="Tipo">Preço</td><td data-l="Condição">Cruzar acima de 0,00001300</td><td data-l="Estado"><span class="chip">Aguardando</span></td></tr>' +
        '<tr><td data-l="Tipo">Meta</td><td data-l="Condição">+3% em 7 dias</td><td data-l="Estado"><span class="chip warn">Em curso</span></td></tr></tbody></table>';
    },
    plan: function (s) {
      return '<h3>Plano de operação</h3><p class="hint">Estimativa do que a regra precisa para votar. É simulação, não promessa.</p><div class="plan-grid">' +
        '<div class="kpi"><div class="kpi-l">Fecharia acima de</div><div class="kpi-v num">0,00001285</div><div class="kpi-s">para o placar fechar em compra</div></div>' +
        '<div class="kpi"><div class="kpi-l">Risco por operação</div><div class="kpi-v num">1,0%</div><div class="kpi-s">do saldo fictício</div></div>' +
        '<div class="kpi"><div class="kpi-l">Custos simulados</div><div class="kpi-v num">0,10%</div><div class="kpi-s">taxa + deslize por lado</div></div></div>';
    },
    csv: function () {
      return '<h3>Registro cronológico</h3><p class="hint">Todas as decisões desta simulação: sinais, ordens e preenchimentos, em CSV com 21 colunas.</p><a class="btn" href="#main" onclick="return false">Baixar registro (CSV)</a>';
    }
  };

  // ---- eventos ------------------------------------------------------------------
  var toastTimer;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600); }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-copy]');
    if (b) {
      var v = b.getAttribute('data-copy');
      var done = function () { toast('Copiado: ' + v); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, done); else done();
    }
    var st = ev.target.closest('[data-state]');
    if (st) {
      document.querySelectorAll('#state-seg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === st)); });
      render(st.dataset.state);
    }
    var tb = ev.target.closest('.tab'); if (tb) selectTab(tb);
    if (ev.target.closest('.team-toggle')) { var tm = $('.team'), c = tm.classList.toggle('collapsed'); ev.target.closest('.team-toggle').setAttribute('aria-expanded', String(!c)); ev.target.closest('.team-toggle').textContent = c ? 'Ver detalhes' : 'Recolher'; }
  });
  function selectTab(tb) {
    document.querySelectorAll('.tab').forEach(function (t) { var on = t === tb; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.id !== tb.getAttribute('aria-controls'); });
  }
  document.addEventListener('keydown', function (ev) {
    var tb = ev.target.closest && ev.target.closest('.tab'); if (!tb) return;
    var all = Array.prototype.slice.call(document.querySelectorAll('.tab')), i = all.indexOf(tb);
    if (ev.key === 'ArrowRight') i = (i + 1) % all.length; else if (ev.key === 'ArrowLeft') i = (i - 1 + all.length) % all.length; else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = all.length - 1; else return;
    ev.preventDefault(); all[i].focus(); selectTab(all[i]);
  });
  $('#theme-btn').addEventListener('click', function () {
    var dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'; this.setAttribute('aria-pressed', String(dark)); this.textContent = dark ? 'Tema claro' : 'Tema escuro'; drawChart();
  });
  // botão de recolher a equipe (só aparece em tela estreita)
  var th = $('.team-head'), tg = document.createElement('button'); tg.type = 'button'; tg.className = 'team-toggle'; tg.setAttribute('aria-expanded', 'false'); tg.textContent = 'Ver detalhes'; th.appendChild(tg);
  var narrow = window.matchMedia('(max-width:640px)');
  function syncTeam() { $('.team').classList.toggle('collapsed', narrow.matches); }
  syncTeam(); narrow.addEventListener('change', syncTeam);
  if (window.matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.dataset.theme) { document.documentElement.dataset.theme = 'light'; }
  var qp = new URLSearchParams(location.search);
  if (qp.get('tema') === 'escuro') { document.documentElement.dataset.theme = 'dark'; $('#theme-btn').setAttribute('aria-pressed', 'true'); $('#theme-btn').textContent = 'Tema claro'; }
  bindChart();
  new ResizeObserver(drawChart).observe($('#chart-box'));
  var first = qp.get('estado') || 'bought';
  document.querySelectorAll('#state-seg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.state === first)); });
  render(first);
})();
