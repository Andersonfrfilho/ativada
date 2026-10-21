/* Liga controles, escritório, varanda, gráfico, legenda e descrição para leitor de tela. */
(function () {
  'use strict';
  var AV = window.AV;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var office = new AV.Office($('#officeRoot'));
  var bal = new AV.Balcony($('#balRoot'));
  var chart = new AV.Chart($('#chartSvg'));
  var state = 'wait', selected = null;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mq.matches;

  function chipHTML(vote) { var v = AV.VOTE[vote]; return '<span class="chip tone-' + v.tone + '">' + AV.icon(v.icon, 14) + '<span>' + v.word + '</span></span>'; }

  /* ----- legenda ----- */
  function buildLegend() {
    var ul = $('#legend'); ul.innerHTML = '';
    AV.active().forEach(function (d) {
      var o = AV.opinion(d, state), li = document.createElement('li');
      var a = office.byId[d.id];
      li.innerHTML = '<button type="button" class="lg-btn' + (selected === d.id ? ' on' : '') + '" data-id="' + d.id + '" aria-pressed="' + (selected === d.id) + '">' +
        '<span class="lg-av ' + d.kind + '" style="background:' + (d.kind === 'model' ? 'var(--model)' : 'var(' + d.shirt + ')') + '">' + (d.kind === 'model' ? AV.icon('diamond', 14) : d.name[0]) + '</span>' +
        '<span class="lg-main"><b>' + (d.kind === 'model' ? '◆ ' : '') + d.full + '</b><span class="lg-role">' + (d.kind === 'model' ? 'Equipe de modelo · ' + d.provider : d.role) + '</span>' +
        '<span class="lg-say">' + o.text + '</span><span class="lg-do" data-do="' + d.id + '">Agora: ' + (a ? a.doing : '') + '</span></span>' + chipHTML(o.vote) + '</button>';
      ul.appendChild(li);
    });
    $$('.lg-btn', ul).forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-id')); }); });
  }
  function select(id) {
    selected = selected === id ? null : id;
    office.select(selected); bal.select(selected);
    $$('.lg-btn').forEach(function (b) { var on = b.getAttribute('data-id') === selected; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    ficha();
  }
  function ficha() {
    var f = $('#ficha');
    if (!selected) { f.innerHTML = '<p>Toque em um personagem ou em um nome da lista para ver a ficha.</p>'; return; }
    var d = AV.byId[selected], o = AV.opinion(d, state), a = office.byId[selected];
    f.innerHTML = '<p><b>' + d.full + '</b> · ' + (d.kind === 'model' ? 'equipe de modelo ' + d.provider : 'agente de regra: ' + d.role) + '</p><p>' + chipHTML(o.vote) + ' <span>' + o.text + '</span></p><p class="mut">Agora: ' + a.doing + '.' + (d.kind === 'model' ? ' Opinião de modelo; não é recomendação.' : '') + '</p>';
  }
  var doTimer;
  office.on('doing', function (a) {
    var el = $('[data-do="' + a.def.id + '"]'); if (el) el.textContent = 'Agora: ' + a.doing;
    clearTimeout(doTimer); doTimer = setTimeout(function () { if (selected) ficha(); }, 250);
  });
  office.on('select', select);
  bal.onSelect = select;

  /* ----- status e descrição para leitor de tela ----- */
  function status() {
    var S = AV.STATES[state], v = AV.VOTE[S.vote];
    $('#stChip').className = 'chip big tone-' + v.tone;
    $('#stChip').innerHTML = AV.icon(v.icon, 18) + '<span>' + S.label + '</span>';
    $('#stPlaque').textContent = S.plaque;
  }
  function meetingText(b) {
    var el = $('#stMeet');
    if (state === 'wait') { el.innerHTML = AV.icon('pause', 13) + '<span>Equipe nas mesas, observando</span>'; return; }
    el.innerHTML = b ? '<span class="dot live"></span><span>Reunião em andamento na lousa</span>' : '<span class="dot"></span><span>Reunião encerrada · todos de volta às mesas</span>';
  }
  function sr() {
    var S = AV.STATES[state], on = AV.active(), parts = [];
    parts.push('Escritório de investimentos visto de cima, em perspectiva. Na parede direita há uma janela com a cidade, um relógio e o quadro de cotações de PEPE/USDT com um mini-gráfico. Na parede esquerda fica a lousa da sala de reunião. Cada analista tem mesa e computador com gráfico na tela.');
    parts.push('Situação atual: ' + S.label + '. ' + S.sr);
    var rules = AV.RULE.map(function (d) { var o = AV.opinion(d, state); return d.full + ' (' + d.role + '): ' + AV.VOTE[o.vote].word.toLowerCase() + ', ' + o.text.toLowerCase().replace(/^./, function (c) { return c; }) + '.'; });
    parts.push('Agentes de regra. ' + rules.join(' '));
    var models = AV.MODEL.map(function (d) {
      var m = AV.modelMode[d.id];
      if (m === 'off') return d.name + ' (' + d.provider + '): desligada, não aparece no escritório.';
      var o = AV.opinion(d, state);
      return d.name + ' (' + d.provider + '), equipe de modelo' + (m === 'nokey' ? ', ligada sem chave: aviso, não opina' : '') + ': ' + o.text + '.';
    });
    parts.push('Equipes de modelo. ' + models.join(' '));
    parts.push(state === 'wait' ? 'Os agentes trabalham nas mesas e, de vez em quando, um deles anda até a mesa da Alice, ao quadro de cotações ou à lousa, e volta.' : 'Os agentes se reuniram em frente à lousa, que mostra os níveis de entrada, alvo e proteção. Uma plaquinha na mesa da Alice diz: ' + S.plaque + '.');
    parts.push('Simulação com dinheiro fictício · tendência, não promessa.');
    $('#srText').innerHTML = parts.map(function (p) { return '<p>' + p + '</p>'; }).join('');
    $('#officeRoot svg.scene').setAttribute('aria-label', 'Escritório vivo: ' + S.label + '. ' + on.length + ' pessoas na equipe. Veja a descrição completa abaixo.');
  }

  /* ----- controles ----- */
  function setState(k) {
    state = k;
    office.setState(k, true); bal.setState(k); chart.setState(k);
    status(); meetingText(office.meeting); buildLegend(); ficha(); sr();
    $$('input[name=estado]').forEach(function (r) { r.checked = r.value === k; });
  }
  $$('input[name=estado]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) setState(r.value); }); });
  /* clicar de novo no estado ativo repete a reunião */
  $$('.st-pill').forEach(function (l) { l.addEventListener('click', function () { var r = $('input', l); if (r.checked && r.value === state) setState(state); }); });

  AV.MODEL.forEach(function (d) {
    var sel = $('#sel-' + d.id);
    sel.value = AV.modelMode[d.id];
    sel.addEventListener('change', function () {
      AV.modelMode[d.id] = sel.value;
      office.setModelActive(d.id, sel.value !== 'off');
      bal.layoutHomes(false); bal.refreshSay();
      buildLegend(); ficha(); sr(); office.refreshSay();
      $('#modelWarn').hidden = !AV.MODEL.some(function (m) { return AV.modelMode[m.id] === 'nokey'; });
    });
  });
  $('#modelWarn').hidden = !AV.MODEL.some(function (m) { return AV.modelMode[m.id] === 'nokey'; });

  office.on('meeting', function (b) { bal.setMeeting(b); meetingText(b); });

  function applyMotion() {
    var btn = $('#btnMotion');
    btn.setAttribute('aria-pressed', reduced);
    $('#motionTxt').textContent = reduced ? 'Movimento reduzido (poses fixas)' : 'Movimento ligado';
    office.setReduced(reduced); bal.setReduced(reduced); chart.reduced = reduced;
    meetingText(office.meeting); buildLegend();
  }
  $('#btnMotion').addEventListener('click', function () { reduced = !reduced; applyMotion(); });
  mq.addEventListener && mq.addEventListener('change', function (e) { reduced = e.matches; applyMotion(); });

  var themes = ['auto', 'light', 'dark'], tNames = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: escuro' }, ti = 0;
  $('#btnTheme').addEventListener('click', function () {
    ti = (ti + 1) % 3; var t = themes[ti];
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    $('#themeTxt').textContent = tNames[t];
  });
  var wide = false;
  $('#btnLayout').addEventListener('click', function () {
    wide = !wide; $('#grid').classList.toggle('stack', wide);
    $('#btnLayout').setAttribute('aria-pressed', wide);
    $('#layoutTxt').textContent = wide ? 'Disposição: empilhada' : 'Disposição: lado a lado';
    setTimeout(function () { office.measure(); bal.refreshSay(); measure(); }, 60);
  });

  /* altura da varanda + gráfico (prova de que cabe sem rolar em 720 px) */
  function measure() {
    var fr = $('#framePanel'), h = Math.round(fr.getBoundingClientRect().height);
    $('#hMeasure').textContent = h + ' px';
    $('#hLeft').textContent = h <= 680 ? '· em 720 px de tela sobram ' + (720 - h) + ' px para o cabeçalho do painel' : '· passa de 600 px';
  }
  window.addEventListener('resize', measure);

  office.start();
  applyMotion();
  setInterval(function () { if (!reduced && !document.hidden) chart.step(); }, 2600);
  setState('wait');
  setTimeout(measure, 300);
  if (location.hash && /^#(wait|buy|sell|protect)$/.test(location.hash)) setState(location.hash.slice(1));
  window.AVpreview = { setState: setState, office: office, bal: bal };
})();
