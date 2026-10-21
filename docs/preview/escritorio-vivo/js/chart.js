/* Gráfico de velas simulado (aba Gráfico). Preço normalizado: 100 = entrada. */
(function () {
  'use strict';
  var AV = window.AV;
  var W = 480, H = 182, PADL = 8, PADR = 102, PADT = 14, PADB = 18, N = 38;
  var END = { wait: 100, buy: 100.4, sell: 102.5, protect: 98.9 };

  function Chart(svg) { this.svg = svg; this.state = 'wait'; this.reduced = false; this.seed(); this.draw(); }
  Chart.prototype.seed = function () {
    var st = this.state, end = END[st], start = { wait: 100, buy: 97.6, sell: 99.4, protect: 101.2 }[st], c = [], p = start, i;
    for (i = 0; i < N; i++) {
      var tgt = start + (end - start) * (i / (N - 1));
      var nx = p + (tgt - p) * 0.35 + (Math.random() - 0.5) * 0.9;
      c.push({ o: p, c: nx, h: Math.max(p, nx) + Math.random() * 0.35, l: Math.min(p, nx) - Math.random() * 0.35 });
      p = nx;
    }
    c[N - 1].c = end; c[N - 1].h = Math.max(c[N - 1].h, end + 0.1); c[N - 1].l = Math.min(c[N - 1].l, end - 0.1);
    this.c = c;
  };
  Chart.prototype.step = function () {
    var last = this.c[this.c.length - 1], bias = { wait: 0, buy: 0.12, sell: -0.1, protect: -0.2 }[this.state];
    var nx = last.c + (Math.random() - 0.5) * 0.8 + bias + (END[this.state] - last.c) * 0.1;
    this.c.push({ o: last.c, c: nx, h: Math.max(last.c, nx) + Math.random() * 0.3, l: Math.min(last.c, nx) - Math.random() * 0.3 });
    this.c.shift(); this.draw();
  };
  Chart.prototype.setState = function (st) { this.state = st; this.seed(); this.draw(); };
  Chart.prototype.draw = function () {
    var c = this.c, st = this.state, lv = st !== 'wait', i;
    var lo = Math.min.apply(null, c.map(function (x) { return x.l; })), hi = Math.max.apply(null, c.map(function (x) { return x.h; }));
    if (lv) { lo = Math.min(lo, 98.3); hi = Math.max(hi, 103.0); }
    lo -= 0.3; hi += 0.3;
    var y = function (p) { return PADT + (1 - (p - lo) / (hi - lo)) * (H - PADT - PADB); };
    var cw = (W - PADL - PADR) / N, o = '';
    for (i = 0; i <= 4; i++) { var gy = PADT + i * (H - PADT - PADB) / 4; o += '<line x1="0" x2="' + W + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" class="cg"/>'; }
    c.forEach(function (k, j) {
      var up = k.c >= k.o, x = PADL + j * cw + cw / 2, cls = up ? 'cu' : 'cd';
      o += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + y(k.h).toFixed(1) + '" y2="' + y(k.l).toFixed(1) + '" class="cw ' + cls + '"/><rect x="' + (x - cw * 0.33).toFixed(1) + '" y="' + y(Math.max(k.o, k.c)).toFixed(1) + '" width="' + (cw * 0.66).toFixed(1) + '" height="' + Math.max(1.5, Math.abs(y(k.o) - y(k.c))).toFixed(1) + '" class="cb ' + cls + '"/>';
    });
    var last = c[c.length - 1], lx = PADL + (N - 0.5) * cw, ly = y(last.c);
    var tag = function (yy, txt, cls) { return '<line x1="' + PADL + '" x2="' + (W - PADR + 4) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" class="lvl ' + cls + '"/><text x="' + (W - PADR + 8) + '" y="' + (yy + 3.5).toFixed(1) + '" class="lt ' + cls + '">' + txt + '</text>'; };
    if (st === 'buy') o += tag(y(100), 'Entrada', 'l-in') + tag(y(102.8), 'Alvo +2,8%', 'l-buy') + tag(y(98.5), 'Proteção −1,5%', 'l-warn');
    if (st === 'sell') o += tag(y(100), 'Entrada', 'l-in') + tag(y(102.5), 'Saída +2,5%', 'l-sell') + tag(y(98.5), 'Proteção', 'l-warn');
    if (st === 'protect') o += tag(y(100), 'Entrada', 'l-in') + tag(y(98.5), 'Proteção −1,5%', 'l-warn');
    o += '<line x1="' + PADL + '" x2="' + (W - PADR + 4) + '" y1="' + ly.toFixed(1) + '" y2="' + ly.toFixed(1) + '" class="lastp"/>';
    /* marcador com ícone + palavra */
    var v = AV.VOTE[AV.STATES[st].vote], mx = Math.max(10, Math.min(W - PADR - 112, lx - 120));
    var my = st === 'sell' ? Math.max(16, y(last.h) - 38) : Math.min(H - PADB - 24, y(last.l) + 16);
    o += '<g transform="translate(' + mx.toFixed(1) + ' ' + my.toFixed(1) + ')" class="mk tone-' + v.tone + '"><rect x="0" y="0" width="' + (st === 'protect' ? 104 : 80) + '" height="22" rx="11"/><g transform="translate(7 4)" style="color:inherit">' + AV.icon(v.icon, 14) + '</g><text x="26" y="15">' + (st === 'protect' ? 'Proteção ativada' : v.word) + '</text></g>';
    this.svg.innerHTML = o;
  };
  AV.Chart = Chart;
})();
