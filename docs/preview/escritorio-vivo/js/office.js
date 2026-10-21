/* Escritório vivo (versão cheia): cena isométrica leve em SVG, agentes que andam, telas animadas e camada HTML (crachás, balões). */
(function () {
  'use strict';
  var AV = window.AV;
  var CANCEL = { cancel: true };
  var A = 34, B = 17, U = 14, V = 11, WH = 124, OX = 404, OY = 154, W = 910, H = 605;

  /* ---------- geometria ---------- */
  function P(u, v, z) { return [OX + (u - v) * A, OY + (u + v) * B - (z || 0)]; }
  function n1(n) { return (Math.round(n * 10) / 10).toString(); }
  function pts(arr) { return arr.map(function (p) { var q = P(p[0], p[1], p[2]); return n1(q[0]) + ',' + n1(q[1]); }).join(' '); }
  function poly(arr, cls, style) { return '<polygon points="' + pts(arr) + '" class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '/>'; }
  function box(u, v, z, du, dv, dz, cls, style) {
    var t = z + dz;
    return poly([[u, v, t], [u + du, v, t], [u + du, v + dv, t], [u, v + dv, t]], cls + ' t', style) +
      poly([[u, v + dv, z], [u + du, v + dv, z], [u + du, v + dv, t], [u, v + dv, t]], cls + ' f', style) +
      poly([[u + du, v, z], [u + du, v + dv, z], [u + du, v + dv, t], [u + du, v, t]], cls + ' s', style);
  }
  function mR(u, z) { var p = P(u, 0, z); return 'matrix(1 .5 0 1 ' + n1(p[0]) + ' ' + n1(p[1]) + ')'; } // parede direita (v=0), x cresce com u
  function mL(v, z) { var p = P(0, v, z); return 'matrix(1 -.5 0 1 ' + n1(p[0]) + ' ' + n1(p[1]) + ')'; } // parede esquerda (u=0), x cresce com v decrescente
  function mF(u, v, z) { var p = P(u, v, z); return 'matrix(1 .5 0 1 ' + n1(p[0]) + ' ' + n1(p[1]) + ')'; } // plano de v constante virado para +v
  function pc(c) { return c.toString().replace('.', ','); }
  function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* ---------- planta: lugares, nós de corredor, pontos de parada ---------- */
  var ROWV = { A: 2.3, B: 5.7, M: 8.9 };
  AV.ALL.forEach(function (a) {
    a.deskV = ROWV[a.row];
    var su = a.deskU + 1.2, sv = a.deskV + 1.25;
    a.seat = { u: su, v: sv };
    if (a.row === 'A') { a.exit = [{ u: su, v: 4.3 }]; a.node = { u: su, v: 5.0 }; a.visit = { u: su + 0.6, v: 4.55 }; }
    else if (a.row === 'B') { a.exit = [{ u: su, v: 7.55 }]; a.node = { u: su, v: 8.2 }; a.visit = { u: su + 0.6, v: 8.0 }; }
    else { a.exit = [{ u: a.deskU - 0.35, v: sv }]; a.node = { u: a.deskU - 0.35, v: 8.2 }; a.visit = { u: su + 0.6, v: 8.45 }; }
  });
  var NODES = [];
  function addNode(u, v) { NODES.push({ id: NODES.length, u: u, v: v, links: [] }); return NODES.length - 1; }
  function nodeAt(u, v) { for (var i = 0; i < NODES.length; i++) if (Math.abs(NODES[i].u - u) < 0.01 && Math.abs(NODES[i].v - v) < 0.01) return NODES[i].id; return addNode(u, v); }
  function link(a, b) { if (a === b) return; if (NODES[a].links.indexOf(b) < 0) { NODES[a].links.push(b); NODES[b].links.push(a); } }
  (function buildGraph() {
    var lines = { 1.0: [6.2, 8.8, 10.8, 12.8], 5.0: [2.4, 6.2, 8.2, 10.6, 13.0], 8.2: [1.15, 3.85, 6.2, 6.55, 8.2, 10.6, 13.0] };
    Object.keys(lines).forEach(function (vk) {
      var ids = lines[vk].map(function (u) { return nodeAt(u, parseFloat(vk)); });
      for (var i = 0; i < ids.length - 1; i++) link(ids[i], ids[i + 1]);
    });
    link(nodeAt(6.2, 1.0), nodeAt(6.2, 5.0)); link(nodeAt(6.2, 5.0), nodeAt(6.2, 8.2));
  })();
  function nearestNode(u, v) {
    var best = 0, bd = 1e9;
    NODES.forEach(function (n) { var d = Math.hypot(n.u - u, n.v - v); if (d < bd) { bd = d; best = n.id; } });
    return best;
  }
  function route(from, to) { // Dijkstra entre nós
    var dist = {}, prev = {}, open = [from];
    dist[from] = 0;
    while (open.length) {
      open.sort(function (x, y) { return dist[x] - dist[y]; });
      var c = open.shift();
      if (c === to) break;
      NODES[c].links.forEach(function (n) {
        var d = dist[c] + Math.hypot(NODES[c].u - NODES[n].u, NODES[c].v - NODES[n].v);
        if (dist[n] === undefined || d < dist[n]) { dist[n] = d; prev[n] = c; if (open.indexOf(n) < 0) open.push(n); }
      });
    }
    var out = [], k = to;
    while (k !== undefined) { out.unshift({ u: NODES[k].u, v: NODES[k].v }); k = prev[k]; }
    return out;
  }
  var MEET = {
    /* espalhados no sentido horizontal da tela (u − v diferente) para os crachás e balões não se empilharem */
    nina: [1.4, 7.4], renata: [1.4, 6.25], otavio: [3.2, 6.9], alice: [1.4, 3.95], sofia: [3.2, 4.6],
    tiago: [1.6, 1.85], lucas: [3.4, 2.5], vitor: [3.6, 1.6], olivia: [4.1, 1.0],
  };
  var BOARD_SPOTS = [[8.8, 1.0], [10.8, 1.0], [12.8, 1.0]];
  var ALICE_SPOTS = [[9.9, 5.15], [11.3, 5.15]];
  var LOUSA_SPOTS = [[1.5, 2.5], [1.5, 4.9]];

  /* ---------- cena estática ---------- */
  function city() {
    var r = seeded(7), s = '', x = 0, i, h, w;
    for (i = 0; x < 160; i++) { w = 9 + r() * 12; h = 14 + r() * 22; s += '<rect x="' + n1(x) + '" y="' + n1(66 - h) + '" width="' + n1(w) + '" height="' + n1(h + 4) + '" style="fill:var(--city-far)"/>'; x += w + 1.2; }
    x = -3;
    for (i = 0; x < 160; i++) {
      w = 10 + r() * 14; h = 12 + r() * 30;
      s += '<rect x="' + n1(x) + '" y="' + n1(66 - h) + '" width="' + n1(w) + '" height="' + n1(h + 4) + '" style="fill:var(--city-near)"/>';
      for (var wy = 66 - h + 4; wy < 62; wy += 6) for (var wx = x + 2; wx < x + w - 3; wx += 5) {
        if (r() > 0.55) s += '<rect class="win' + (r() > 0.8 ? ' tw' : '') + '" style="animation-delay:' + n1(r() * 6) + 's" x="' + n1(wx) + '" y="' + n1(wy) + '" width="2.2" height="2.6"/>';
      }
      x += w + 1.5;
    }
    return s;
  }
  function screenSlot(a) { return '<g class="scr" data-scr="' + a.id + '"></g>'; }

  function deskGroup(a) {
    var u0 = a.deskU, v0 = a.deskV, model = a.kind === 'model', s = '';
    var c = model ? 'var(--model-desk)' : 'var(--desk-front)';
    [[0.08, 0.08], [1.78, 0.08], [0.08, 0.88], [1.78, 0.88]].forEach(function (p) { s += box(u0 + p[0], v0 + p[1], 0, 0.14, 0.14, 13.2, 'bx', '--c:var(--desk-edge)'); });
    s += box(u0, v0, 13, 2.0, 1.1, 2.4, 'bx', '--c:' + c);
    s += poly([[u0 + 0.7, v0 + 0.62, 15.5], [u0 + 1.7, v0 + 0.62, 15.5], [u0 + 1.7, v0 + 0.92, 15.5], [u0 + 0.7, v0 + 0.92, 15.5]], 'kbd');
    s += box(u0 + 0.95, v0 + 0.3, 15.4, 0.5, 0.28, 1.2, 'bx', '--c:var(--bezel)');
    s += box(u0 + 1.12, v0 + 0.36, 15.4, 0.16, 0.16, 6.4, 'bx', '--c:var(--bezel)');
    s += '<g transform="' + mF(u0 + 0.45, v0 + 0.45, 51) + '"><rect width="51" height="29.5" rx="2.2" style="fill:var(--bezel)"/><g transform="translate(2.5 2.5)"><rect width="46" height="24.5" rx="1" style="fill:var(--screen)"/>' + screenSlot(a) + '</g></g>';
    s += '<g transform="' + mF(u0 + 0.12, v0 + 1.1, 11.6) + '"><rect width="38" height="8" rx="1.5" style="fill:' + (model ? 'var(--model)' : 'var(--bezel)') + '"/><text x="19" y="6" text-anchor="middle" class="np">' + (model ? '◆ ' : '') + a.name.toUpperCase() + '</text></g>';
    if (a.decor === 'mug') s += box(u0 + 1.72, v0 + 0.66, 15.4, 0.2, 0.2, 4, 'bx', '--c:var(--accent)');
    if (a.decor === 'papers') s += poly([[u0 + 0.12, v0 + 0.5, 15.5], [u0 + 0.55, v0 + 0.44, 15.5], [u0 + 0.6, v0 + 0.88, 15.5], [u0 + 0.16, v0 + 0.94, 15.5]], 'paperp') + poly([[u0 + 0.18, v0 + 0.46, 16.4], [u0 + 0.6, v0 + 0.42, 16.4], [u0 + 0.64, v0 + 0.84, 16.4], [u0 + 0.2, v0 + 0.9, 16.4]], 'paperp');
    if (a.decor === 'plant') { var pp = P(u0 + 0.3, v0 + 0.55, 15.4); s += box(u0 + 0.2, v0 + 0.45, 15.4, 0.22, 0.22, 4, 'bx', '--c:var(--pot)') + '<g transform="translate(' + n1(pp[0] + 2) + ' ' + n1(pp[1] - 5) + ')"><ellipse cx="-3" cy="-4" rx="2.2" ry="5" transform="rotate(-25)" style="fill:var(--plant)"/><ellipse cx="3" cy="-4" rx="2.2" ry="5" transform="rotate(25)" style="fill:var(--plant-2)"/><ellipse cx="0" cy="-6" rx="2" ry="5.5" style="fill:var(--plant)"/></g>'; }
    if (a.decor === 'plaque') s += box(u0 + 1.82, v0 + 0.5, 15.4, 0.1, 0.1, 13, 'bx', '--c:var(--bezel)');
    var d = { key: u0 + 1 + v0 + 0.55, u0: u0, u1: u0 + 2, v0: v0, v1: v0 + 1.1 };
    var chair = box(u0 + 1.17, v0 + 1.2, 0, 0.1, 0.1, 7.5, 'bx', '--c:var(--bezel)') + box(u0 + 0.93, v0 + 1.0, 7.5, 0.54, 0.54, 2.6, 'bx', '--c:var(--chair)') + box(u0 + 0.93, v0 + 1.5, 9, 0.54, 0.1, 15, 'bx', '--c:var(--chair)');
    return { desk: { html: s, b: d, id: a.id }, chair: { html: chair, b: { u0: u0 + 0.9, u1: u0 + 1.5, v0: v0 + 1.0, v1: v0 + 1.6, key: u0 + 1.2 + v0 + 1.25 - 0.1 }, id: a.id } };
  }

  function plant(u, v, big) {
    var p = P(u, v, 0), h = big ? 1 : 0.8, s = '';
    s += box(u - 0.28, v - 0.28, 0, 0.56, 0.56, 12 * h, 'bx', '--c:var(--pot)');
    s += '<g transform="translate(' + n1(p[0]) + ' ' + n1(p[1] - 12 * h) + ') scale(' + h + ')">';
    [[-10, -18, -35], [10, -20, 35], [0, -28, 0], [-6, -12, -60], [7, -12, 60]].forEach(function (l, i) { s += '<ellipse cx="' + l[0] + '" cy="' + l[1] + '" rx="4.6" ry="14" transform="rotate(' + l[2] + ' ' + l[0] + ' ' + l[1] + ')" style="fill:var(--plant' + (i % 2 ? '-2' : '') + ')"/>'; });
    return s + '</g>';
  }

  function buildStatic() {
    var f = [], i, j, s;
    s = '<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky-a)"/><stop offset="1" style="stop-color:var(--sky-b)"/></linearGradient>' +
      '<clipPath id="clipWin"><rect width="155" height="66"/></clipPath><clipPath id="clipBoard"><rect width="171" height="56"/></clipPath>' +
      '<filter id="shadowBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>';
    var back = s;
    back += poly([[0, 0, 0], [U, 0, 0], [U, V, 0], [0, V, 0]], 'floor');
    var tp = '';
    for (i = 1; i < U; i++) { var a1 = P(i, 0, 0), a2 = P(i, V, 0); tp += 'M' + n1(a1[0]) + ' ' + n1(a1[1]) + 'L' + n1(a2[0]) + ' ' + n1(a2[1]); }
    for (j = 1; j < V; j++) { var b1 = P(0, j, 0), b2 = P(U, j, 0); tp += 'M' + n1(b1[0]) + ' ' + n1(b1[1]) + 'L' + n1(b2[0]) + ' ' + n1(b2[1]); }
    back += '<path d="' + tp + '" class="tiles"/>';
    back += poly([[0.3, 0.9, 0], [5.9, 0.9, 0], [5.9, 7.7, 0], [0.3, 7.7, 0]], 'rug rug-m');
    back += '<g class="rug-x-wrap">' + poly([[0.9, 8.5, 0], [9.5, 8.5, 0], [9.5, 10.9, 0], [0.9, 10.9, 0]], 'rug rug-x') + '</g>';
    back += poly([[0, V, 0], [U, V, 0], [U, V, -10], [0, V, -10]], 'slab f') + poly([[U, 0, 0], [U, V, 0], [U, V, -10], [U, 0, -10]], 'slab s');
    back += poly([[0, 0, 0], [U, 0, 0], [U, 0, WH], [0, 0, WH]], 'wall wr') + poly([[0, 0, 0], [0, V, 0], [0, V, WH], [0, 0, WH]], 'wall wl');
    back += poly([[0, 0, WH], [U, 0, WH], [U, 0, WH - 0.01], [0, 0, WH - 0.01]], 'hide');
    back += poly([[0, 0, 0], [U, 0, 0], [U, 0, 7], [0, 0, 7]], 'base') + poly([[0, 0, 0], [0, V, 0], [0, V, 7], [0, 0, 7]], 'base d');
    back += poly([[0, 0, 50], [U, 0, 50], [U, 0, 51.4], [0, 0, 51.4]], 'rail') + poly([[0, 0, 50], [0, V, 50], [0, V, 51.4], [0, 0, 51.4]], 'rail d');
    back += '<g class="led-wrap">' + poly([[0, 0, WH - 7], [U, 0, WH - 7], [U, 0, WH - 3.5], [0, 0, WH - 3.5]], 'led') + poly([[0, 0, WH - 7], [0, V, WH - 7], [0, V, WH - 3.5], [0, 0, WH - 3.5]], 'led') + '</g>';
    /* janela com a cidade (parede direita) */
    back += '<g transform="' + mR(1.0, 108) + '"><rect x="-4" y="-4" width="163" height="74" rx="3" style="fill:var(--win-frame)"/><g clip-path="url(#clipWin)" transform="translate(0 0)"><rect width="155" height="66" fill="url(#skyg)"/>' +
      '<circle cx="124" cy="17" r="7.5" style="fill:var(--sun)"/><g class="cloud c1"><ellipse cx="30" cy="16" rx="13" ry="3.4"/><ellipse cx="38" cy="13" rx="8" ry="3.4"/></g><g class="cloud c2"><ellipse cx="90" cy="27" rx="10" ry="2.8"/><ellipse cx="96" cy="24.6" rx="6" ry="2.8"/></g>' +
      city() + '<path d="M0 66 L155 66" style="stroke:var(--city-near)" stroke-width="1"/><polygon points="0,0 70,0 20,66 0,66" style="fill:#fff;opacity:.09"/><polygon points="96,0 112,0 62,66 46,66" style="fill:#fff;opacity:.07"/></g>' +
      '<path d="M77.5 0v66M0 33h155" style="stroke:var(--win-frame)" stroke-width="2.6"/></g>';
    /* relógio */
    back += '<g transform="' + mR(7.3, 98) + '"><circle r="12.6" style="fill:var(--board);stroke:var(--desk-edge)" stroke-width="2"/>';
    for (i = 0; i < 12; i++) { var an = i * Math.PI / 6; back += '<path d="M' + n1(Math.sin(an) * 9.6) + ' ' + n1(-Math.cos(an) * 9.6) + 'L' + n1(Math.sin(an) * 11) + ' ' + n1(-Math.cos(an) * 11) + '" style="stroke:var(--ink-2)" stroke-width="1"/>'; }
    back += '<line id="clkH" x1="0" y1="0" x2="0" y2="-6" style="stroke:var(--ink)" stroke-width="2" stroke-linecap="round"/><line id="clkM" x1="0" y1="0" x2="0" y2="-9" style="stroke:var(--ink)" stroke-width="1.4" stroke-linecap="round"/><line id="clkS" x1="0" y1="2" x2="0" y2="-10" style="stroke:var(--sell)" stroke-width=".8"/><circle r="1.4" style="fill:var(--ink)"/></g>';
    /* quadro de cotações */
    back += '<g transform="' + mR(8.2, 114) + '"><rect x="-3" y="-3" width="183" height="62" rx="3.5" style="fill:var(--bezel)"/><g transform="translate(3 0)"><rect width="171" height="56" rx="1.6" style="fill:var(--screen)"/><g id="bContent"></g></g></g>';
    /* lousa (parede esquerda) */
    back += '<g transform="' + mL(6.6, 112) + '"><rect x="-4" y="-4" width="185" height="82" rx="3" style="fill:var(--desk-edge)"/><rect width="177" height="74" rx="1.5" style="fill:var(--board)"/><g id="lousaContent"></g><rect x="14" y="74" width="149" height="3.4" rx="1.4" style="fill:var(--desk-edge)"/></g>';
    /* estante com pastas (ala dos modelos) */
    back += box(0, 8.6, 0, 0.6, 2.1, 52, 'bx', '--c:var(--desk-front)');
    var shelf = '<g transform="' + mL(10.7, 0) + '">';
    [10, 27, 44].forEach(function (zz, k) {
      shelf += '<rect x="0" y="' + (-zz - 12) + '" width="' + (2.1 * A) + '" height="1.6" style="fill:var(--desk-edge)"/>';
      for (var q = 0; q < 10; q++) shelf += '<rect x="' + (3 + q * 6.3) + '" y="' + (-zz - 11 + (q % 3)) + '" width="4.6" height="' + (11 - (q % 3)) + '" style="fill:' + ['var(--accent)', 'var(--model)', 'var(--shirt-volume)', 'var(--shirt-trend)'][(q + k) % 4] + ';opacity:.85"/>';
    });
    back += shelf.replace(/translate/g, 'translate') + '</g>';

    /* objetos ordenáveis */
    var items = [];
    AV.ALL.forEach(function (a) { var g = deskGroup(a); g.desk.cls = 'desk-' + a.id; g.chair.cls = 'desk-' + a.id; items.push(g.desk, g.chair); });
    [[0.6, 0.6, true], [13.4, 0.55, true], [0.55, 7.9, false], [13.5, 9.8, true]].forEach(function (p) { items.push({ html: plant(p[0], p[1], p[2]), b: { u0: p[0] - 0.3, u1: p[0] + 0.3, v0: p[1] - 0.3, v1: p[1] + 0.3, key: p[0] + p[1] } }); });
    var mt = P(5.6, 3.0, 0);
    items.push({ html: '<ellipse cx="' + n1(mt[0]) + '" cy="' + n1(mt[1] - 2) + '" rx="48" ry="24" style="fill:rgba(0,0,0,.14)"/><rect x="' + n1(mt[0] - 4) + '" y="' + n1(mt[1] - 14) + '" width="8" height="14" style="fill:var(--desk-edge)"/><ellipse cx="' + n1(mt[0]) + '" cy="' + n1(mt[1] - 12) + '" rx="46" ry="23" style="fill:var(--table-front)"/><ellipse cx="' + n1(mt[0]) + '" cy="' + n1(mt[1] - 16) + '" rx="46" ry="23" style="fill:var(--table-top)"/><path d="M' + n1(mt[0] - 20) + ' ' + n1(mt[1] - 17) + 'q16 -9 36 -1" fill="none" style="stroke:var(--accent)" stroke-width="1.4" opacity=".5"/><rect x="' + n1(mt[0] - 9) + '" y="' + n1(mt[1] - 25) + '" width="14" height="9" rx="1" style="fill:#fff;stroke:var(--ink-3)" stroke-width=".7"/>', b: { u0: 4.6, u1: 6.6, v0: 2.0, v1: 4.0, key: 8.6 } });
    [[5.6, 4.4], [6.9, 3.0], [4.2, 3.4]].forEach(function (c) { items.push({ html: box(c[0] - 0.22, c[1] - 0.22, 0, 0.44, 0.44, 9, 'bx', '--c:var(--chair)'), b: { u0: c[0] - 0.25, u1: c[0] + 0.25, v0: c[1] - 0.25, v1: c[1] + 0.25, key: c[0] + c[1] } }); });
    items.push({ html: box(13.1, 1.7, 0, 0.6, 0.6, 38, 'bx', '--c:var(--glass-solid)') + box(13.15, 1.75, 38, 0.5, 0.5, 8, 'bx', '--c:var(--accent)'), b: { u0: 13.1, u1: 13.7, v0: 1.7, v1: 2.3, key: 15 }, id: 'cooler' });
    return { back: back, items: items };
  }

  /* ---------- telas dos monitores ---------- */
  function Screen(a) { this.a = a; this.series = []; for (var i = 0; i < 12; i++) this.series.push(0.5 + Math.sin(i * 0.8 + a.name.length) * 0.18); this.tick = 0; this.mood = 0; this.audit = [1, 1, 0, 0]; }
  Screen.prototype.step = function (state, nokey) {
    var bias = { wait: 0, buy: 0.045, sell: -0.035, protect: -0.09 }[state];
    var last = this.series[this.series.length - 1], nx = last + (Math.random() - 0.5) * 0.17 + bias;
    nx = Math.max(0.08, Math.min(0.92, nx));
    this.series.push(nx); if (this.series.length > 12) this.series.shift();
    this.tick++;
    if (this.tick % 2 === 0) { var k = Math.floor(Math.random() * 4); this.audit[k] = this.audit[k] ? (Math.random() > 0.6 ? 0 : 1) : 1; }
    return this.render(state, nokey);
  };
  Screen.prototype.render = function (state, nokey) {
    var s = this.series, t = this.a.screen, o = '', i;
    if (nokey) return '<path d="M23 4 33 20H13z" style="fill:var(--screen-warn)"/><path d="M23 9v5.5M23 17v.1" style="stroke:var(--screen)" stroke-width="2" stroke-linecap="round"/><text x="23" y="23.2" text-anchor="middle" class="sc-t" style="fill:var(--screen-warn)">SEM CHAVE</text>';
    if (t === 'candles') {
      var mn = Math.min.apply(null, s) - 0.08, mx = Math.max.apply(null, s) + 0.08;
      var y = function (v) { return 21 - ((v - mn) / (mx - mn)) * 18; };
      for (i = 1; i < s.length; i++) {
        var op = s[i - 1], cl = s[i], hi = Math.max(op, cl) + 0.035, lo = Math.min(op, cl) - 0.035, up = cl >= op, col = up ? 'var(--screen-up)' : 'var(--screen-down)', x = 2 + (i - 1) * 4;
        o += '<path d="M' + (x + 1.4) + ' ' + n1(y(hi)) + 'V' + n1(y(lo)) + '" style="stroke:' + col + '" stroke-width=".7"/><rect x="' + x + '" y="' + n1(y(Math.max(op, cl))) + '" width="2.8" height="' + n1(Math.max(1, Math.abs(y(op) - y(cl)))) + '" style="fill:' + col + '"/>';
      }
      return o + (this.a.kind === 'model' ? '<path d="M41 3.4 43.4 6 41 8.6 38.6 6z" style="fill:var(--screen-accent)"/>' : '');
    }
    if (t === 'rsi') {
      var tg = { wait: 0.5, buy: 0.68, sell: 0.78, protect: 0.2 }[state], d = '';
      for (i = 0; i < s.length; i++) d += (i ? 'L' : 'M') + n1(3 + i * 3.7) + ' ' + n1(21 - (s[i] * 0.4 + tg * 0.6) * 18);
      return '<path d="M0 6.5H46M0 17.5H46" style="stroke:var(--screen-grid)" stroke-dasharray="2 2" stroke-width=".7"/><path d="' + d + '" fill="none" style="stroke:var(--screen-accent)" stroke-width="1.4" stroke-linejoin="round"/>';
    }
    if (t === 'volume') {
      var lv = { wait: 0.3, buy: 0.8, sell: 0.5, protect: 0.95 }[state];
      for (i = 0; i < s.length; i++) { var hh = 3 + (s[i] * 0.6 + lv * 0.9) * 10; o += '<rect x="' + (2 + i * 3.7) + '" y="' + n1(22 - hh) + '" width="2.6" height="' + n1(hh) + '" style="fill:' + (s[i] > 0.5 ? 'var(--screen-up)' : 'var(--screen-down)') + '"/>'; }
      return o;
    }
    if (t === 'mood') {
      var target = { wait: 0, buy: 40, sell: 68, protect: -62 }[state];
      this.mood += (target - this.mood) * 0.5 + (Math.random() - 0.5) * 8;
      return '<path d="M7 20A16 16 0 0 1 39 20" fill="none" style="stroke:var(--screen-down)" stroke-width="3" stroke-dasharray="17 100"/><path d="M7 20A16 16 0 0 1 39 20" fill="none" style="stroke:var(--screen-warn)" stroke-width="3" stroke-dasharray="17 100" stroke-dashoffset="-17"/><path d="M7 20A16 16 0 0 1 39 20" fill="none" style="stroke:var(--screen-up)" stroke-width="3" stroke-dasharray="17 100" stroke-dashoffset="-34"/><g transform="translate(23 20) rotate(' + n1(this.mood) + ')"><path d="M0 0V-13" style="stroke:var(--screen-ink)" stroke-width="1.5" stroke-linecap="round"/></g><circle cx="23" cy="20" r="2" style="fill:var(--screen-ink)"/>';
    }
    if (t === 'risk') {
      var d2 = '';
      for (i = 0; i < s.length; i++) d2 += (i ? 'L' : 'M') + n1(3 + i * 3.7) + ' ' + n1(19 - s[i] * 14);
      return '<path d="M0 20.4H46" style="stroke:var(--screen-down)" stroke-dasharray="3 2" stroke-width="1"/><path d="M0 12H46" style="stroke:var(--screen-warn)" stroke-dasharray="1.5 2" stroke-width=".8"/><path d="' + d2 + '" fill="none" style="stroke:var(--screen-ink)" stroke-width="1.3"/><circle cx="' + n1(3 + 11 * 3.7) + '" cy="' + n1(19 - s[11] * 14) + '" r="1.8" style="fill:var(--screen-accent)"/>';
    }
    for (i = 0; i < 4; i++) o += '<circle cx="6" cy="' + (4.5 + i * 5.3) + '" r="2" style="fill:' + (this.audit[i] ? 'var(--screen-up)' : 'var(--screen-grid)') + '"/><rect x="11" y="' + (3.4 + i * 5.3) + '" width="' + (20 + i * 4) + '" height="2.2" rx="1" style="fill:var(--screen-ink-2)"/>';
    return o;
  };

  /* ---------- agente ---------- */
  function Agent(def, sim) {
    this.def = def; this.sim = sim; this.gen = 0; this.timers = []; this.pend = []; this.walk = null;
    this.u = def.seat.u; this.v = def.seat.v; this.speed = 1.9 + Math.random() * 0.5;
    this.pose = 'sit type'; this.back = true; this.fl = false; this.active = true; this.next = null; this.doing = 'digitando no computador';
    this.carry = false; this.speakUntil = 0;
  }
  Agent.prototype.setPose = function (p, doing) {
    this.pose = p; this.paint();
    if (doing && doing !== this.doing) { this.doing = doing; this.sim.emit('doing', this); }
  };
  Agent.prototype.paint = function () {
    if (!this.el) return;
    this.el.setAttribute('class', 'agent fig ' + this.pose + (this.carry ? ' paper' : '') + (this.back ? ' back' : '') + (this.fl ? ' fl' : '') + (this.active ? '' : ' gone') + (this.def.kind === 'model' && AV.modelMode[this.def.id] === 'nokey' ? ' quiet' : '') + (this.sim.selected === this.def.id ? ' sel' : ''));
  };
  Agent.prototype.face = function (du, dv) { // direção no chão -> costas/frente e espelho
    var sx = du - dv, sy = du + dv;
    if (Math.abs(sx) > 0.01) this.fl = sx < 0;
    if (Math.abs(sy) > 0.01) this.back = sy < 0;
    this.paint();
  };
  Agent.prototype.interrupt = function (task) {
    this.gen++; this.next = task || null;
    this.timers.forEach(clearTimeout); this.timers = [];
    var p = this.pend; this.pend = []; this.walk = null;
    p.forEach(function (r) { r(CANCEL); });
    this.sim.release(this.def.id);
  };
  Agent.prototype.sleep = function (ms) {
    var me = this;
    if (this.sim.reduced) return new Promise(function (res, rej) { me.pend.push(rej); });
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { me.pend = me.pend.filter(function (x) { return x !== rej; }); res(); }, ms);
      me.timers.push(t); me.pend.push(rej);
    });
  };
  Agent.prototype.go = function (path) { // percorre os pontos
    var me = this;
    return new Promise(function (res, rej) {
      me.pend.push(rej);
      me.walk = { path: path, i: 0, res: function () { me.pend = me.pend.filter(function (x) { return x !== rej; }); res(); } };
    });
  };
  Agent.prototype.pathTo = function (dest) { // dest {u,v,node:{u,v}}
    var me = this, def = this.def, out = [];
    var atSeat = Math.hypot(this.u - def.seat.u, this.v - def.seat.v) < 0.05 && this.pose.indexOf('sit') >= 0;
    var startNode;
    if (atSeat) { def.exit.forEach(function (p) { out.push(p); }); out.push(def.node); startNode = nearestNode(def.node.u, def.node.v); }
    else startNode = nearestNode(this.u, this.v);
    var endNode = nearestNode(dest.node.u, dest.node.v);
    var r = route(startNode, endNode);
    r.forEach(function (p) { if (!out.length || Math.hypot(out[out.length - 1].u - p.u, out[out.length - 1].v - p.v) > 0.05) out.push(p); });
    out.push({ u: dest.u, v: dest.v });
    return out;
  };
  Agent.prototype.walkTo = async function (dest, doing) {
    this.setPose('walk', doing || 'andando');
    await this.go(this.pathTo(dest));
  };
  Agent.prototype.goHome = async function () {
    var d = this.def;
    this.carry = false;
    var path = this.pathTo({ u: d.node.u, v: d.node.v, node: d.node });
    if (this.sim.reduced) path = [];
    this.setPose('walk', 'voltando para a mesa');
    if (path.length) await this.go(path);
    var back = d.exit.slice().reverse().concat([{ u: d.seat.u, v: d.seat.v }]);
    await this.go(back);
    this.face(0, -1);
    this.setPose('sit type', 'digitando no computador');
  };
  Agent.prototype.run = async function () {
    for (;;) {
      var task = this.next; this.next = null;
      try { await (task ? task.call(this) : this.ambient()); } catch (e) { if (e !== CANCEL) console.error(e); }
      if (!task && this.next === null) await new Promise(function (r) { setTimeout(r, 30); });
    }
  };
  function pick(weights) {
    var sum = 0, k; for (k in weights) sum += weights[k];
    var r = Math.random() * sum;
    for (k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return Object.keys(weights)[0];
  }
  Agent.prototype.spot = function (list, key) {
    var me = this;
    for (var i = 0; i < list.length; i++) {
      var k = key + i;
      if (this.sim.claim(k, this.def.id)) {
        var s = list[i], n = nearestNode(s[0], s[1]);
        return { u: s[0], v: s[1], node: { u: NODES[n].u, v: NODES[n].v } };
      }
    }
    return null;
  };
  Agent.prototype.visit = async function (spot, faceDir, pose, ms, doing, carry) {
    this.carry = !!carry;
    await this.walkTo(spot, doing[0]);
    this.face(faceDir[0], faceDir[1]);
    this.setPose(pose, doing[1]);
    await this.sleep(ms);
  };
  Agent.prototype.ambient = async function () {
    var d = this.def, s = this.sim, me = this;
    var k = d.kind === 'model' ? 1.35 : 1;
    await this.sleep(AV.rand(2200, 8500) * k);
    if (s.meeting || !this.active) return;
    var w = d.id === 'alice' ? { hand: 2, visit: 4, board: 2, lousa: 2 }
      : d.id === 'otavio' ? { hand: 1, tour: 5, board: 1, lousa: 1.5, alice: 2 }
        : d.kind === 'model' ? { hand: 2.5, neighbor: 1.2, alice: 1.2, board: 0.5 }
          : { hand: 2, alice: 3, board: 1.6, lousa: 1.4, neighbor: 2 };
    var act = pick(w), spot, o;
    if (act === 'hand') {
      this.setPose('sit hand', 'levantou a mão');
      await this.sleep(AV.rand(1700, 2700));
      this.setPose('sit type', 'digitando no computador');
    } else if (act === 'alice') {
      spot = this.spot(ALICE_SPOTS, 'alice');
      if (!spot) return;
      await this.visit(spot, [0, 1], 'stand paper', AV.rand(1700, 2600), ['levando papéis para a Alice', 'trocando papéis com a Alice'], true);
      this.carry = false; await this.goHome();
    } else if (act === 'board') {
      spot = this.spot(BOARD_SPOTS, 'board');
      if (!spot) return;
      await this.visit(spot, [0, -1], 'stand point', AV.rand(3200, 5200), ['indo ao quadro de cotações', 'olhando o quadro de cotações']);
      await this.goHome();
    } else if (act === 'lousa') {
      spot = this.spot(LOUSA_SPOTS, 'lousa');
      if (!spot) return;
      await this.visit(spot, [-1, 0], 'stand point', AV.rand(3000, 4600), ['indo à lousa', 'conferindo a lousa']);
      await this.goHome();
    } else if (act === 'visit' || act === 'tour' || act === 'neighbor') {
      var all = s.agents.filter(function (x) { return x !== me && x.active; });
      var n = act === 'tour' ? 2 : 1;
      for (var i = 0; i < n; i++) {
        o = all.splice(Math.floor(Math.random() * all.length), 1)[0];
        if (!o) break;
        spot = { u: o.def.visit.u, v: o.def.visit.v, node: o.def.node };
        if (!this.sim.claim('v:' + o.def.id, d.id)) continue;
        var clip = act === 'tour';
        await this.visit(spot, o.def.row === 'M' ? [0, 1] : (o.def.row === 'A' ? [0, -1] : [0, -1]), clip ? 'stand clip' : 'stand paper', AV.rand(1800, 2800), [clip ? 'auditando a mesa de ' + o.def.name : 'indo falar com ' + o.def.name, clip ? 'auditando a mesa de ' + o.def.name : 'trocando papéis com ' + o.def.name], !clip);
        this.sim.release2('v:' + o.def.id);
      }
      this.carry = false; await this.goHome();
    }
  };
  Agent.prototype.meetTask = async function (order) {
    var d = this.def, s = this.sim, lead = d.id === 'alice';
    this.doing = 'a caminho da reunião';
    if (lead) { this.setPose('sit hand', 'chamou a equipe para a reunião'); await this.sleep(1500); }
    else await this.sleep(1000 + order * 260 + AV.rand(0, 280));
    var m = MEET[d.id], n = nearestNode(2.4, 5.0);
    await this.walkTo({ u: m[0], v: m[1], node: { u: NODES[n].u, v: NODES[n].v } }, 'indo para a reunião');
    this.face(-1, 0);
    this.setPose(lead ? 'stand point' : 'stand', 'em reunião na lousa');
    while (s.meeting) {
      await this.sleep(AV.rand(1500, 3200));
      var r = Math.random();
      if (r < 0.28) { this.setPose('stand hand', 'pediu a palavra'); await this.sleep(1700); this.setPose('stand', 'em reunião na lousa'); }
      else if (r < 0.5) { this.face(-1, 0); this.setPose('stand point', 'apontando a lousa'); await this.sleep(1700); this.setPose('stand', 'em reunião na lousa'); }
      else if (r < 0.62) { this.carry = true; this.face(0, 1); this.setPose('stand paper', 'passando papéis'); await this.sleep(1500); this.carry = false; this.face(-1, 0); this.setPose('stand', 'em reunião na lousa'); }
    }
    await this.goHome();
  };

  /* ---------- simulação / montagem ---------- */
  function Sim(root) {
    this.root = root; this.reduced = false; this.state = 'wait'; this.meeting = false; this.listeners = {};
    this.claims = {}; this.agents = []; this.screens = {}; this.selected = null; this.scale = 1; this.compact = false;
    this.speakers = {}; this.lastFrame = 0; this.dirty = true; this.order = [];
    this.build();
  }
  Sim.prototype.on = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
  Sim.prototype.emit = function (ev, a) { (this.listeners[ev] || []).forEach(function (f) { f(a); }); };
  Sim.prototype.claim = function (k, id) { if (this.claims[k] && this.claims[k] !== id) return false; this.claims[k] = id; return true; };
  Sim.prototype.release = function (id) { for (var k in this.claims) if (this.claims[k] === id) delete this.claims[k]; };
  Sim.prototype.release2 = function (k) { delete this.claims[k]; };

  Sim.prototype.build = function () {
    var me = this, st = buildStatic();
    this.svg = this.root.querySelector('svg.scene');
    this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    this.svg.innerHTML = st.back + '<g class="stage"></g>';
    this.stage = this.svg.querySelector('.stage');
    this.items = [];
    st.items.forEach(function (it) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = it.html;
      if (it.cls) g.setAttribute('class', 'obj ' + it.cls);
      me.stage.appendChild(g);
      me.items.push({ el: g, b: it.b, id: it.id });
    });
    this.agents = AV.ALL.map(function (def) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = '<g class="agent-in" transform="scale(1.18)">' + AV.figure(def) + '</g>';
      var a = new Agent(def, me);
      a.el = g; a.inner = g.firstChild;
      a.item = { el: g, agent: a };
      me.stage.appendChild(g);
      me.screens[def.id] = new Screen(def);
      a.screenEl = me.svg.querySelector('[data-scr="' + def.id + '"]');
      a.paint();
      return a;
    });
    this.byId = {}; this.agents.forEach(function (a) { me.byId[a.def.id] = a; });
    this.buildOverlay();
    this.board = { price: 0.00001240, series: [] };
    for (var i = 0; i < 24; i++) this.board.series.push(0.5 + Math.sin(i * 0.5) * 0.2);
    this.drawBoard(); this.drawLousa(); this.tickScreens(true);
    this.agents.forEach(function (a) { a.run(); });
    this.resortAll(); this.placeAll();
  };

  Sim.prototype.buildOverlay = function () {
    var me = this, ov = this.root.querySelector('.ov');
    this.ov = ov;
    this.leaders = ov.querySelector('svg.leaders');
    this.zone = {};
    ov.insertAdjacentHTML('beforeend',
      '<div class="zone z-meet">Sala de reunião</div><div class="zone z-an">Mesas de análise</div><div class="zone z-mod">Equipes de modelo ◆</div><div class="zone z-none" hidden>Nenhuma equipe de modelo ligada</div>' +
      '<div class="plaque-ov" hidden><span class="pl-ic"></span><span class="pl-t"></span></div>');
    this.plaque = ov.querySelector('.plaque-ov');
    this.zonesEl = { meet: ov.querySelector('.z-meet'), an: ov.querySelector('.z-an'), mod: ov.querySelector('.z-mod'), none: ov.querySelector('.z-none') };
    this.agents.forEach(function (a) {
      var d = a.def;
      a.tag = document.createElement('div'); a.tag.className = 'tag ' + d.kind;
      a.tag.innerHTML = '<b>' + (d.kind === 'model' ? AV.icon('diamond', 10) + ' ' : '') + d.name + '</b><span>' + d.role + '</span>';
      a.say = document.createElement('div'); a.say.className = 'say';
      a.hit = document.createElement('button'); a.hit.type = 'button'; a.hit.className = 'hit'; a.hit.tabIndex = -1; a.hit.setAttribute('aria-hidden', 'true');
      a.hit.addEventListener('click', function () { me.emit('select', a.def.id); });
      ov.appendChild(a.hit); ov.appendChild(a.tag); ov.appendChild(a.say);
    });
  };

  Sim.prototype.resortAll = function () {
    var list = this.items.map(function (i) { return { el: i.el, b: i.b }; });
    this.agents.forEach(function (a) { if (a.active) list.push({ el: a.el, b: { u0: a.u - 0.2, u1: a.u + 0.2, v0: a.v - 0.2, v1: a.v + 0.2, key: a.u + a.v + 0.001 } }); });
    var n = list.length, seen = new Array(n), out = [];
    function behind(x, y) { // x atrás de y? (só vale o eixo separador quando o outro eixo se sobrepõe)
      var a = x.b, b = y.b, e = 0.001;
      var uo = a.u0 < b.u1 - e && b.u0 < a.u1 - e, vo = a.v0 < b.v1 - e && b.v0 < a.v1 - e;
      if (!uo && !vo) {
        if (a.u1 <= b.u0 + e && a.v1 <= b.v0 + e) return true;
        if (b.u1 <= a.u0 + e && b.v1 <= a.v0 + e) return false;
        return a.key < b.key;
      }
      if (!uo) return a.u1 <= b.u0 + e;
      if (!vo) return a.v1 <= b.v0 + e;
      return a.key < b.key;
    }
    function visit(i) {
      if (seen[i]) return; seen[i] = 1;
      for (var j = 0; j < n; j++) if (j !== i && !seen[j] && behind(list[j], list[i])) visit(j);
      out.push(list[i].el);
    }
    var idx = list.map(function (_, i) { return i; }).sort(function (a, b) { return list[a].b.key - list[b].b.key; });
    idx.forEach(visit);
    var changed = false, cur = this.stage.children;
    for (var i = 0; i < out.length; i++) if (cur[i] !== out[i]) { changed = true; break; }
    if (changed) out.forEach(function (el) { this.stage.appendChild(el); }, this);
  };

  Sim.prototype.placeAll = function () {
    var me = this;
    this.agents.forEach(function (a) {
      var p = P(a.u, a.v, 0);
      a.sx = p[0]; a.sy = p[1];
      a.el.setAttribute('transform', 'translate(' + n1(p[0]) + ' ' + n1(p[1]) + ')');
    });
    this.dirty = true;
  };

  /* quadro de cotações */
  Sim.prototype.drawBoard = function () {
    var b = this.board, s = b.series, d = '', i, st = this.state;
    for (i = 0; i < s.length; i++) d += (i ? 'L' : 'M') + n1(95 + i * 3.2) + ' ' + n1(46 - s[i] * 30);
    var up = s[s.length - 1] >= s[s.length - 8], col = up ? 'var(--screen-up)' : 'var(--screen-down)';
    var price = '0,' + String(Math.round(b.price * 1e8)).padStart(8, '0');
    var pct = (1.8 + (s[s.length - 1] - 0.5) * 2).toFixed(1).replace('.', ',');
    var g = this.root.querySelector('#bContent');
    g.innerHTML = '<text x="9" y="14" class="bt">PEPE/USDT</text><text x="9" y="26" class="bs">simulação · 5 min</text><text x="9" y="43" class="bp">' + price + '</text>' +
      '<g transform="translate(9 47)" style="color:' + col + '"><path d="' + (up ? 'M4 0 8 7H0z' : 'M4 7 8 0H0z') + '" fill="currentColor"/><text x="12" y="7" class="bc" style="fill:' + col + '">' + (up ? 'alta +' : 'queda −') + pct + '%</text></g>' +
      '<path d="M90 8H168M90 27H168M90 46H168" style="stroke:var(--screen-grid)" stroke-width=".6"/><path d="' + d + '" fill="none" style="stroke:' + col + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      (st !== 'wait' ? '<path d="M90 ' + (st === 'protect' ? 50 : 40) + 'H168" style="stroke:' + (st === 'protect' ? 'var(--screen-warn)' : st === 'buy' ? 'var(--screen-up)' : 'var(--screen-down)') + '" stroke-dasharray="3 2" stroke-width=".9"/>' : '');
  };
  Sim.prototype.stepBoard = function () {
    var b = this.board, bias = { wait: 0, buy: 0.03, sell: -0.02, protect: -0.06 }[this.state];
    var nx = b.series[b.series.length - 1] + (Math.random() - 0.5) * 0.14 + bias;
    nx = Math.max(0.1, Math.min(0.92, nx)); b.series.push(nx); b.series.shift();
    b.price = 0.0000124 * (1 + (nx - 0.5) * 0.04);
    this.drawBoard();
  };

  /* lousa */
  Sim.prototype.drawLousa = function () {
    var st = this.state, g = this.root.querySelector('#lousaContent'), o = '';
    var t = function (x, y, txt, cls, fill) { return '<text x="' + x + '" y="' + y + '" class="' + cls + '"' + (fill ? ' style="fill:' + fill + '"' : '') + '>' + txt + '</text>'; };
    if (st === 'wait') {
      o = t(10, 18, 'Plano da operação', 'lot') + t(10, 38, 'Sem sinal por enquanto.', 'ls') + t(10, 53, 'A equipe segue de olho', 'ls') + t(10, 66, 'no quadro de cotações.', 'ls') +
        '<g class="doodle"><path d="M120 62q10-14 18-4t16-12 14 4" fill="none" style="stroke:var(--ink-3)" stroke-width="1.6" stroke-dasharray="3 3"/></g>';
    } else {
      var title = { buy: 'COMPRA', sell: 'VENDA', protect: 'PROTEÇÃO' }[st], col = { buy: 'var(--buy)', sell: 'var(--sell)', protect: 'var(--warn)' }[st];
      o = t(10, 16, 'Plano · ' + title, 'lot', col) + '<g class="lv">';
      var rows = st === 'buy' ? [['Entrada', '0,00001240', 'var(--accent)'], ['Alvo', '0,00001275', 'var(--buy)'], ['Proteção', '0,00001221', 'var(--warn)']]
        : st === 'sell' ? [['Entrada', '0,00001240', 'var(--accent)'], ['Saída', '0,00001272', 'var(--sell)'], ['Proteção', '0,00001221', 'var(--warn)']]
          : [['Entrada', '0,00001240', 'var(--accent)'], ['Preço', '0,00001228', 'var(--sell)'], ['Proteção', '0,00001221', 'var(--warn)']];
      rows.forEach(function (r, i) {
        o += '<g class="lvrow" style="animation-delay:' + (i * 220) + 'ms"><circle cx="13" cy="' + (30 + i * 14) + '" r="3.4" style="fill:' + r[2] + '"/>' + t(21, 33.5 + i * 14, r[0], 'ls') + t(76, 33.5 + i * 14, r[1], 'lm') + '</g>';
      });
      o += '</g>';
      var gain = { buy: '+2,4% líquido', sell: '+2,2% líquido', protect: 'perda máx. −1,5%' }[st];
      o += t(10, 72, gain, 'lg', col);
      /* mini-esboço de preço com os níveis */
      var y = st === 'buy' ? [34, 18, 54] : st === 'sell' ? [48, 18, 60] : [30, 36, 54];
      o += '<g class="sketch"><path d="M132 14V66" style="stroke:var(--line)"/><path d="M128 ' + y[0] + 'H172" style="stroke:var(--accent)" stroke-dasharray="3 2"/><path d="M128 ' + y[1] + 'H172" style="stroke:' + (st === 'sell' ? 'var(--sell)' : 'var(--buy)') + '" stroke-dasharray="3 2"/><path d="M128 ' + y[2] + 'H172" style="stroke:var(--warn)" stroke-dasharray="3 2"/>' +
        '<path class="spath" d="M134 ' + (st === 'protect' ? 24 : 58) + 'q8 -12 14 -4t12 -12 12 ' + (st === 'protect' ? 26 : -8) + '" fill="none" style="stroke:var(--ink)" stroke-width="1.8" stroke-linecap="round"/></g>';
    }
    o += t(172, 71, 'exemplo', 'lx');
    g.innerHTML = o;
  };

  Sim.prototype.tickScreens = function (all) {
    var me = this, n = 0;
    this.agents.forEach(function (a, i) {
      if (!a.active) return;
      var nokey = a.def.kind === 'model' && AV.modelMode[a.def.id] === 'nokey';
      if (all || me.reduced) { a.screenEl.innerHTML = me.screens[a.def.id].render(me.state, nokey); return; }
      if (((me.frameCount || 0) + i) % 3 === 0) a.screenEl.innerHTML = me.screens[a.def.id].step(me.state, nokey);
    });
    this.frameCount = (this.frameCount || 0) + 1;
  };

  /* ---------- estado ---------- */
  Sim.prototype.setState = function (key, force) {
    var changed = key !== this.state;
    this.state = key;
    this.svg.setAttribute('data-state', key);
    this.drawLousa(); this.drawBoard(); this.tickScreens(true);
    this.refreshSay(); this.updatePlaque();
    if (key === 'wait') { if (this.meeting) this.endMeeting(); }
    else if (changed || force || !this.meeting) this.startMeeting();
    this.emit('state', key);
  };
  Sim.prototype.startMeeting = function () {
    var me = this;
    this.meeting = true; this.meetingTimer && clearTimeout(this.meetingTimer);
    this.ov.classList.add('meet');
    this.emit('meeting', true);
    var act = this.agents.filter(function (a) { return a.active; });
    if (this.reduced) {
      act.forEach(function (a) { var m = MEET[a.def.id]; a.u = m[0]; a.v = m[1]; a.face(-1, 0); a.carry = false; a.setPose(a.def.id === 'alice' ? 'stand point' : 'stand', 'em reunião na lousa'); });
      this.placeAll(); this.resortAll(); return;
    }
    var order = 0;
    act.sort(function (x, y) { return (y.def.id === 'alice') - (x.def.id === 'alice'); });
    act.forEach(function (a) { var o = order++; a.interrupt(function () { return a.meetTask(o); }); });
    this.meetingTimer = setTimeout(function () { me.meeting = false; me.ov.classList.remove('meet'); me.emit('meeting', false); }, 21000);
  };
  Sim.prototype.endMeeting = function () {
    this.meeting = false; this.meetingTimer && clearTimeout(this.meetingTimer);
    this.ov.classList.remove('meet');
    this.emit('meeting', false);
    if (this.reduced) { this.seatAll(); }
  };
  Sim.prototype.seatAll = function () {
    this.agents.forEach(function (a) {
      if (!a.active) return;
      a.u = a.def.seat.u; a.v = a.def.seat.v; a.carry = false; a.face(0, -1); a.setPose('sit type', 'digitando no computador');
    });
    this.placeAll(); this.resortAll();
  };
  Sim.prototype.setModelActive = function (id, on) {
    var a = this.byId[id], me = this;
    if (a.active === on) { this.updateModelLook(); this.refreshSay(); return; }
    a.active = on; a.interrupt(null);
    if (!on) { a.u = a.def.seat.u; a.v = a.def.seat.v; a.setPose('sit type', 'desligada'); }
    else { a.u = a.def.seat.u; a.v = a.def.seat.v; a.face(0, -1); a.setPose('sit type', 'digitando no computador'); if (this.meeting && !this.reduced) { var o = 8; a.interrupt(function () { return a.meetTask(o); }); } else if (this.meeting && this.reduced) { var m = MEET[id]; a.u = m[0]; a.v = m[1]; a.face(-1, 0); a.setPose('stand', 'em reunião na lousa'); } }
    a.paint(); this.placeAll(); this.updateModelLook(); this.refreshSay(); this.resortAll(); this.tickScreens(true);
  };
  Sim.prototype.updateModelLook = function () {
    var me = this, any = false;
    AV.MODEL.forEach(function (m) {
      var on = AV.modelMode[m.id] !== 'off';
      any = any || on;
      me.svg.querySelectorAll('.desk-' + m.id).forEach(function (g) { g.style.display = on ? '' : 'none'; });
      var a = me.byId[m.id];
      a.tag.style.display = on ? '' : 'none'; a.hit.style.display = on ? '' : 'none';
      a.tag.classList.toggle('nokey', AV.modelMode[m.id] === 'nokey');
      a.paint();
      a.el.style.display = on ? '' : 'none';
    });
    this.svg.querySelector('.rug-x-wrap').style.display = any ? '' : 'none';
    this.zonesEl.mod.hidden = !any; this.zonesEl.none.hidden = any;
    this.dirty = true;
  };
  Sim.prototype.updatePlaque = function () {
    var S = AV.STATES[this.state], v = AV.VOTE[S.vote];
    this.plaque.hidden = false;
    this.plaque.className = 'plaque-ov tone-' + v.tone + ' pl-' + this.state;
    this.plaque.querySelector('.pl-ic').innerHTML = AV.icon(v.icon, 14);
    this.plaque.querySelector('.pl-t').textContent = S.plaque;
    this.dirty = true;
  };

  /* balões: fala em turnos + chips de estado */
  Sim.prototype.refreshSay = function () {
    var me = this, st = this.state;
    this.agents.forEach(function (a) {
      if (!a.active) { a.say.style.display = 'none'; return; }
      var o = AV.opinion(a.def, st), v = AV.VOTE[o.vote];
      var speaking = a.speakUntil > Date.now() || me.reduced && a.def.id === 'alice' && st !== 'wait';
      var showChip = st !== 'wait' || o.vote === 'nokey';
      a.opin = o;
      var d = a.def, key = (showChip ? o.vote : '-') + (d.kind === 'model' ? AV.modelMode[d.id] : '');
      if (a.tagKey !== key) { // chip dentro do crachá: nome, cargo e estado juntos, sem cobrir a lousa
        a.tagKey = key;
        a.tag.innerHTML = '<b>' + (d.kind === 'model' ? AV.icon('diamond', 10) + ' ' : '') + d.name + '</b>' + (showChip ? '<i class="tchip tone-' + v.tone + '">' + AV.icon(v.icon, 11) + '<span class="w-long">' + v.word + '</span><span class="w-short">' + v.short + '</span></i>' : '<span>' + d.role + '</span>');
        a.tag.classList.toggle('has-chip', showChip); a.tag._w = 0;
      }
      if (!speaking) { a.say.style.display = 'none'; return; }
      a.say.style.display = '';
      a.say.className = 'say full tone-' + v.tone;
      a.say.innerHTML = '<span class="s-chip">' + AV.icon(v.icon, 12) + '<span class="w-long">' + v.word + '</span><span class="w-short">' + v.short + '</span></span><span class="s-text">' + o.text + '</span>';
      a.say._w = 0;
    });
    this.dirty = true;
  };
  Sim.prototype.speakLoop = function () {
    var me = this;
    if (this.speakTimer) clearTimeout(this.speakTimer);
    if (this.reduced) { this.refreshSay(); return; }
    var go = function () {
      var act = me.agents.filter(function (a) { return a.active && AV.opinion(a.def, me.state).vote !== 'nokey' || a.active; });
      var a = act[Math.floor(Math.random() * act.length)];
      var now = Date.now();
      me.agents.forEach(function (x) { if (x.speakUntil && x.speakUntil < now) x.speakUntil = 0; });
      var live = me.agents.filter(function (x) { return x.speakUntil > now; }).length;
      if (a && live < (me.state === 'wait' ? 2 : 2)) a.speakUntil = now + 4200;
      me.refreshSay();
      me.speakTimer = setTimeout(go, 2300 + Math.random() * 1200);
    };
    go();
  };

  /* ---------- movimento por quadro ---------- */
  Sim.prototype.frame = function (t) {
    var dt = Math.min(0.05, (t - this.lastFrame) / 1000 || 0.016); this.lastFrame = t;
    var moved = false, me = this;
    this.agents.forEach(function (a) {
      var w = a.walk; if (!w) return;
      var left = a.speed * dt;
      while (left > 0 && w) {
        var tgt = w.path[w.i];
        if (!tgt) { a.walk = null; w.res(); w = null; break; }
        var du = tgt.u - a.u, dv = tgt.v - a.v, dist = Math.hypot(du, dv);
        if (dist < 0.001) { w.i++; continue; }
        if (dist <= left) { a.u = tgt.u; a.v = tgt.v; left -= dist; w.i++; if (w.i >= w.path.length) { a.walk = null; w.res(); w = null; } }
        else { a.u += du / dist * left; a.v += dv / dist * left; left = 0; }
        if (w) { var nx = w.path[w.i]; if (nx) { var ddu = nx.u - a.u, ddv = nx.v - a.v; if (Math.abs(ddu) + Math.abs(ddv) > 0.01) a.face(ddu, ddv); } }
      }
      moved = true;
    });
    if (moved) { this.placeAll(); this.resortAll(); }
    if (this.dirty || moved) this.layout();
  };

  Sim.prototype.measure = function () {
    var r = this.ov.getBoundingClientRect(); this.scale = r.width / W; this.compact = r.width < 560;
    this.ov.classList.toggle('compact', this.compact);
    this.ov.style.setProperty('--k', Math.max(0.8, Math.min(1, this.scale)).toFixed(2));
    this.agents.forEach(function (a) { a.say._w = 0; a.tag._w = 0; });
    this.dirty = true;
  };
  function put(el, x, y, ax, ay) { el.style.transform = 'translate(' + n1(x) + 'px,' + n1(y) + 'px) translate(' + ax + ',' + ay + ')'; }
  Sim.prototype.layout = function () {
    this.dirty = false;
    var k = this.scale, placed = [], ll = '', me = this, list = [];
    this.agents.forEach(function (a) {
      if (!a.active) return;
      var x = a.sx * k, y = a.sy * k, sit = a.pose.indexOf('sit') >= 0, top = y - (sit ? 60 : 70) * k;
      a.hit.style.transform = 'translate(' + n1(x) + 'px,' + n1(y - 26 * k) + 'px) translate(-50%,-50%)';
      put(a.tag, x, y + 3 * k, '-50%', '0');
      if (a.say.style.display === 'none') return;
      if (!sit && me.meeting && me.state !== 'wait') { put(a.say, x + 20 * k, y - 36 * k, '0', '-50%'); return; } // na reunião, o balão vai para o lado da sala
      list.push({ a: a, x: x, base: top, y: y });
    });
    list.sort(function (p, q) { return q.y - p.y; });
    list.forEach(function (it) {
      var el = it.a.say;
      if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
      var w = el._w, h = el._h, by = it.base, cx = it.x, found = false, lift, di, dxs = [0, 0.55, -0.55, 1.1, -1.1];
      var free = function (x, y) {
        for (var i = 0; i < placed.length; i++) {
          var p = placed[i];
          if (Math.abs(x - p.x) < (w + p.w) / 2 + 2 && y > p.top - 2 && y - h < p.bottom + 2) return false;
        }
        return true;
      };
      for (lift = 0; lift < 9 && !found; lift++) {
        for (di = 0; di < dxs.length && !found; di++) {
          var tx = Math.max(w / 2 + 2, Math.min(W * k - w / 2 - 2, it.x + dxs[di] * w)), ty = it.base - lift * (h + 3);
          if (ty - h < 2) continue;
          if (free(tx, ty)) { cx = tx; by = ty; found = true; }
        }
      }
      if (!found) { cx = Math.max(w / 2 + 2, Math.min(W * k - w / 2 - 2, it.x)); by = Math.max(h + 2, it.base); }
      placed.push({ x: cx, w: w, top: by - h, bottom: by });
      put(el, cx, by, '-50%', '-100%');
      if (Math.abs(by - it.base) > 6 || Math.abs(cx - it.x) > 12) ll += '<line x1="' + n1(it.x) + '" y1="' + n1(it.base + 2) + '" x2="' + n1(cx) + '" y2="' + n1(by) + '"/>';
    });
    this.leaders.innerHTML = ll;
    var z = this.zonesEl, at = function (el, u, v, zz) {
      var p = P(u, v, zz || 0), w = el.offsetWidth || 120, x = Math.max(w / 2 + 2, Math.min(W * k - w / 2 - 2, p[0] * k));
      put(el, x, p[1] * k, '-50%', '-50%');
    };
    at(z.meet, 5.6, 5.3, 0); at(z.an, 9.6, 9.9, 0); at(z.mod, 0, 8.9, 74); at(z.none, 0, 8.9, 74);
    var pp = P(6.6, 3.7, 0); put(this.plaque, pp[0] * k, pp[1] * k, '-50%', '-100%');
  };

  /* relógio */
  Sim.prototype.tickClock = function () {
    var d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    var set = function (id, deg) { var e = document.getElementById(id); if (e) e.setAttribute('transform', 'rotate(' + n1(deg) + ')'); };
    set('clkH', h * 30); set('clkM', m * 6); set('clkS', this.reduced ? 0 : s * 6);
  };

  Sim.prototype.setReduced = function (r) {
    var me = this;
    this.reduced = r;
    this.agents.forEach(function (a) { a.speakUntil = 0; });
    document.documentElement.setAttribute('data-motion', r ? 'reduced' : 'full');
    this.agents.forEach(function (a) { a.interrupt(null); });
    if (r) { if (this.meeting) { this.startMeeting(); } else this.seatAll(); this.tickScreens(true); }
    else {
      this.agents.forEach(function (a) { if (a.active) { var m = me.meeting; a.u = m ? a.u : a.def.seat.u; } });
      if (this.meeting) this.startMeeting(); else this.seatAll();
    }
    this.speakLoop(); this.refreshSay(); this.tickClock();
  };

  Sim.prototype.start = function () {
    var me = this;
    this.measure();
    if (window.ResizeObserver) new ResizeObserver(function () { me.measure(); }).observe(this.ov);
    window.addEventListener('resize', function () { me.measure(); });
    var loop = function (t) { me.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    setInterval(function () { if (!me.reduced && !document.hidden) { me.tickScreens(false); } }, 650);
    setInterval(function () { if (!me.reduced && !document.hidden) me.stepBoard(); }, 1300);
    setInterval(function () { me.tickClock(); }, 1000);
    this.updateModelLook(); this.updatePlaque(); this.refreshSay(); this.speakLoop(); this.tickClock();
  };
  Sim.prototype.select = function (id) {
    this.selected = id;
    this.agents.forEach(function (a) { a.paint(); a.tag.classList.toggle('sel', a.def.id === id); });
  };

  AV.Office = Sim;
})();
