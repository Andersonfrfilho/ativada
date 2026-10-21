/* Varanda: versão compacta (faixa acima do gráfico). Bonecos atrás do balcão, com notebooks; andam de lado e se juntam no centro. */
(function () {
  'use strict';
  var AV = window.AV;

  function Balcony(root) {
    this.root = root; this.reduced = false; this.state = 'wait'; this.meeting = false; this.ag = {}; this.speakTimer = null; this.selected = null;
    this.build();
  }
  Balcony.prototype.build = function () {
    var me = this;
    this.root.innerHTML =
      '<div class="bal-sky" aria-hidden="true"><svg viewBox="0 0 600 60" preserveAspectRatio="none"><g class="bal-city"></g></svg></div>' +
      '<div class="bal-plaque" role="status"></div><div class="bal-row"></div><div class="bal-counter" aria-hidden="true"></div>';
    var r = 3, s = '', x = 0;
    var rnd = function () { r = (r * 16807) % 2147483647; return r / 2147483647; };
    while (x < 600) { var w = 14 + rnd() * 24, h = 12 + rnd() * 40; s += '<rect x="' + x.toFixed(0) + '" y="' + (60 - h).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '"/>'; x += w + 2; }
    this.root.querySelector('.bal-city').innerHTML = s;
    this.row = this.root.querySelector('.bal-row'); this.counter = this.root.querySelector('.bal-counter');
    this.plaque = this.root.querySelector('.bal-plaque');
    AV.ALL.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'bag ' + d.kind;
      el.innerHTML = '<div class="bsay" style="display:none"></div><svg class="bfig" viewBox="-17 -60 34 64" width="40" height="75" aria-hidden="true" focusable="false"><g class="fig stand type"><g>' + AV.figure(d) + '</g></g></svg><div class="bname">' + (d.kind === 'model' ? AV.icon('diamond', 8) + ' ' : '') + d.name + '</div>';
      me.row.appendChild(el);
      var a = { def: d, el: el, fig: el.querySelector('.fig'), say: el.querySelector('.bsay'), x: 50, home: 50, tk: 0, active: true, speakUntil: 0, timers: [] };
      a.fig.classList.add('back');
      a.fig.classList.remove('back');
      a.el.addEventListener('click', function () { if (me.onSelect) me.onSelect(d.id); });
      me.ag[d.id] = a;
    });
    this.layoutHomes(true);
  };
  Balcony.prototype.activeList = function () { return AV.ALL.filter(function (d) { return AV.modelMode[d.id] !== 'off' || d.kind === 'rule'; }); };
  Balcony.prototype.layoutHomes = function (instant) {
    var me = this, list = this.activeList(), n = list.length;
    AV.ALL.forEach(function (d) { var a = me.ag[d.id]; a.active = list.indexOf(d) >= 0; a.el.style.display = a.active ? '' : 'none'; });
    list.forEach(function (d, i) {
      var a = me.ag[d.id];
      a.home = 5 + (i / Math.max(1, n - 1)) * 90 + (i >= 6 ? 1.2 : 0);
      a.home = Math.min(95, a.home);
      a.idx = i;
      a.el.classList.toggle('quiet', AV.modelMode[d.id] === 'nokey');
      if (instant) { a.x = a.home; me.setX(a, a.home, 0); }
    });
    this.counter.innerHTML = list.map(function (d) { return '<i class="lap" style="left:' + me.ag[d.id].home + '%;--k:' + (d.name.length % 5) + '"></i>'; }).join('');
    if (this.meeting) this.gather(); else if (!instant) list.forEach(function (d) { me.goTo(me.ag[d.id], me.ag[d.id].home); });
    this.refreshSay();
  };
  Balcony.prototype.setX = function (a, x, ms) {
    a.el.style.transitionDuration = ms + 'ms'; a.el.style.left = x + '%'; a.x = x;
  };
  Balcony.prototype.pose = function (a, p) { a.fig.setAttribute('class', 'fig stand ' + p + (a.fl ? ' fl' : '') + (a.def.id === this.selected ? ' sel' : '')); a.pose = p; };
  Balcony.prototype.goTo = function (a, x, cb) {
    var me = this, tk = ++a.tk;
    a.timers.forEach(clearTimeout); a.timers = [];
    if (this.reduced || Math.abs(x - a.x) < 0.2) { this.setX(a, x, 0); this.pose(a, this.meeting ? 'stand' : 'type'); if (cb) cb(); return; }
    var dist = Math.abs(x - a.x), ms = Math.max(500, dist * 70 * (0.85 + (a.idx % 3) * 0.12));
    a.fl = x < a.x; this.pose(a, 'walk'); this.setX(a, x, ms);
    a.timers.push(setTimeout(function () { if (a.tk !== tk) return; me.pose(a, me.meeting ? 'stand' : 'type'); if (cb) cb(); }, ms + 30));
  };
  Balcony.prototype.gather = function () {
    var me = this, list = this.activeList(), n = list.length;
    list.forEach(function (d, i) {
      var a = me.ag[d.id], tx = 13 + (i / Math.max(1, n - 1)) * 74;
      setTimeout(function () { if (me.meeting) me.goTo(a, tx, function () { me.pose(a, d.id === 'alice' ? 'hand' : 'stand'); }); }, me.reduced ? 0 : (d.id === 'alice' ? 0 : 700 + i * 160));
    });
  };
  Balcony.prototype.setMeeting = function (b) {
    var me = this;
    this.meeting = b;
    if (b) this.gather();
    else this.activeList().forEach(function (d, i) { var a = me.ag[d.id]; setTimeout(function () { if (!me.meeting) me.goTo(a, a.home); }, me.reduced ? 0 : i * 140); });
    this.idle();
  };
  Balcony.prototype.idle = function () { // vida própria quando não há reunião
    var me = this;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.reduced) return;
    var step = function () {
      if (!me.meeting) {
        var list = me.activeList(), d = list[Math.floor(Math.random() * list.length)], a = me.ag[d.id], r = Math.random();
        if (r < 0.35) { me.pose(a, 'hand'); setTimeout(function () { if (!me.meeting) me.pose(a, 'type'); }, 2100); }
        else if (r < 0.7) { var off = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5); me.goTo(a, Math.max(4, Math.min(96, a.home + off)), function () { setTimeout(function () { if (!me.meeting) me.goTo(a, a.home); }, 1400 + Math.random() * 1400); }); }
        else { var nb = list[(a.idx + 1) % list.length], tx = me.ag[nb.id].home - 5; me.goTo(a, tx, function () { me.pose(a, 'paper'); a.fig.classList.add('paper'); setTimeout(function () { a.fig.classList.remove('paper'); if (!me.meeting) me.goTo(a, a.home); }, 1500); }); }
      }
      me.idleTimer = setTimeout(step, 2200 + Math.random() * 3200);
    };
    this.idleTimer = setTimeout(step, 1200);
  };
  Balcony.prototype.refreshSay = function () {
    var me = this, st = this.state, now = Date.now();
    this.activeList().forEach(function (d, i) {
      var a = me.ag[d.id], o = AV.opinion(d, st), v = AV.VOTE[o.vote];
      var speaking = a.speakUntil > now || (me.reduced && d.id === 'alice' && st !== 'wait');
      var chip = st !== 'wait' || o.vote === 'nokey';
      if (!speaking && !chip) { a.say.style.display = 'none'; return; }
      a.say.style.display = '';
      a.say.className = 'bsay tone-' + v.tone + (speaking ? ' full' : ' chip') + (i % 2 ? ' hi' : '');
      a.say.innerHTML = '<span class="s-chip">' + AV.icon(v.icon, 11) + '<span class="w-long">' + v.word + '</span><span class="w-short">' + v.short + '</span></span>' + (speaking ? '<span class="s-text">' + o.text + '</span>' : '');
      a.el.style.zIndex = speaking ? 5 : '';
      /* mantém o balão dentro da faixa */
      var off = 0;
      if (speaking) { a.say.style.setProperty('--shift', '0px'); var rowW = me.row.clientWidth, cx = a.x / 100 * rowW, w = 150; if (cx - w / 2 < 4) off = 4 - (cx - w / 2); if (cx + w / 2 > rowW - 4) off = (rowW - 4) - (cx + w / 2); }
      a.say.style.setProperty('--shift', Math.round(off) + 'px');
    });
  };
  Balcony.prototype.speakLoop = function () {
    var me = this;
    clearTimeout(this.speakTimer);
    if (this.reduced) { this.refreshSay(); return; }
    var go = function () {
      var list = me.activeList(), d = list[Math.floor(Math.random() * list.length)], now = Date.now();
      var live = list.filter(function (x) { return me.ag[x.id].speakUntil > now; }).length;
      if (live < 1) me.ag[d.id].speakUntil = now + 4300;
      me.refreshSay();
      me.speakTimer = setTimeout(go, 2600 + Math.random() * 1400);
    };
    go();
  };
  Balcony.prototype.setState = function (key) {
    this.state = key;
    var S = AV.STATES[key], v = AV.VOTE[S.vote];
    this.plaque.className = 'bal-plaque tone-' + v.tone;
    this.plaque.innerHTML = AV.icon(v.icon, 13) + '<span>' + S.plaque + '</span>';
    this.refreshSay();
  };
  Balcony.prototype.setReduced = function (r) {
    var me = this;
    this.reduced = r;
    AV.ALL.forEach(function (d) { me.ag[d.id].speakUntil = 0; });
    this.root.classList.toggle('still', r);
    this.activeList().forEach(function (d) { var a = me.ag[d.id]; a.timers.forEach(clearTimeout); a.tk++; });
    if (r) {
      this.activeList().forEach(function (d) { var a = me.ag[d.id]; me.pose(a, me.meeting ? 'stand' : 'type'); });
      if (this.meeting) this.gather(); else this.activeList().forEach(function (d) { me.setX(me.ag[d.id], me.ag[d.id].home, 0); });
    } else this.activeList().forEach(function (d) { me.pose(me.ag[d.id], me.meeting ? 'stand' : 'type'); });
    this.idle(); this.speakLoop();
  };
  Balcony.prototype.select = function (id) { this.selected = id; var me = this; AV.ALL.forEach(function (d) { var a = me.ag[d.id]; a.el.classList.toggle('sel', d.id === id); }); };

  AV.Balcony = Balcony;
})();
