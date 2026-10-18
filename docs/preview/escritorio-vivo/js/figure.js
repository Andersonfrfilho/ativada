/* Personagem em SVG (pés na origem 0,0). Poses por classe em .fig: walk, sit, type, hand, paper, point, clip. */
(function () {
  'use strict';
  var AV = window.AV;

  function hairShape(a, back) {
    var c = 'fill:var(--hair-' + a.hair + ')';
    var s = a.hairStyle;
    var out = '';
    if (s === 'long') out += '<path d="M-7.6 -40 C-9 -30 -7 -27 -4.5 -28 L4.5 -28 C7 -27 9 -30 7.6 -40z" style="' + c + '"/>';
    if (s === 'bun') out += '<circle cx="0" cy="-48.6" r="3.4" style="' + c + '"/>';
    if (back === 'cap') return '<circle cx="0" cy="-40" r="7.6" style="' + c + '"/>';
    if (back === 'extras') return out;
    return '<path d="M-7.5 -41.2 A7.5 7.5 0 0 1 7.5 -41.2 C4.5 -44.6 -3 -44.6 -7.5 -41.2z" style="' + c + '"/>';
  }

  /* Retorna o <g> interno (sem transform de posição). */
  AV.figure = function (a) {
    var model = a.kind === 'model';
    var shirt = model ? 'var(--model)' : 'var(' + a.shirt + ')';
    var skin = 'fill:var(--skin-' + a.skin + ')';
    var sh = 'fill:' + shirt;
    var stripe = model ? 'var(--model)' : 'var(--accent)';
    var d = (0.32 + ((a.name.length * 7) % 9) / 40).toFixed(2); // duração do toque nas teclas varia por pessoa
    var glasses = a.hairStyle === 'glasses'
      ? '<g class="glasses" fill="none" style="stroke:var(--ink)" stroke-width="0.9"><circle cx="-2.8" cy="-39.2" r="2.3"/><circle cx="2.8" cy="-39.2" r="2.3"/><path d="M-0.5 -39.2h1"/></g>'
      : '';
    var arm = function (side) {
      var x = side === 'l' ? -8 : 8;
      return '<g transform="translate(' + x + ' -29)"><g class="arm ' + side + '"><rect x="-2.2" y="-1" width="4.4" height="14" rx="2.2" style="' + sh + '"/><circle cx="0" cy="13.6" r="2.5" style="' + skin + '"/></g></g>';
    };
    var leg = function (side) {
      var x = side === 'l' ? -3.4 : 3.4;
      return '<g transform="translate(' + x + ' -15)"><g class="leg ' + side + '"><rect x="-2.4" y="-1" width="4.8" height="13" rx="2.2" style="fill:var(--pants)"/><rect x="-3" y="11" width="6.6" height="4.2" rx="2.1" style="fill:var(--shoe)"/></g></g>';
    };
    return (
      '<g class="fig-flip"><g class="fig-body" style="--d:' + d + 's">' +
      '<ellipse class="fig-shadow" cx="0" cy="0.6" rx="11" ry="4"/>' +
      '<g class="legs">' + leg('l') + leg('r') + '</g>' +
      '<g class="upper">' +
      arm('l') +
      '<rect x="-8" y="-32" width="16" height="19" rx="6.2" style="' + sh + '"/>' +
      '<path d="M-3.6 -32 0 -26.4 3.6 -32" fill="none" style="stroke:var(--lanyard)" stroke-width="1.3"/>' +
      '<rect class="badge" x="-3.5" y="-26" width="7" height="9" rx="1.5" style="fill:#fff;stroke:' + stripe + '" stroke-width="0.9"/>' +
      '<rect x="-3.5" y="-26" width="7" height="2.8" rx="1" style="fill:' + stripe + '"/>' +
      (model ? '<path d="M0 -22.4 2.1 -20.1 0 -17.8 -2.1 -20.1z" style="fill:var(--model)"/>' : '<rect x="-2" y="-21" width="4" height="1" rx=".5" style="fill:var(--ink-3)"/><rect x="-2" y="-19" width="3" height="1" rx=".5" style="fill:var(--ink-3)"/>') +
      arm('r') +
      '<g class="paper"><rect x="-5.5" y="-24" width="11" height="14" rx="1" style="fill:#fff;stroke:var(--ink-3)" stroke-width="0.7"/><path d="M-3.4 -20h6.8M-3.4 -17.5h6.8M-3.4 -15h4.4" style="stroke:var(--accent)" stroke-width="0.9" fill="none"/></g>' +
      '<g class="head"><rect x="-1.8" y="-34" width="3.6" height="4" style="' + skin + '"/>' +
      '<g class="hair-extras">' + hairShape(a, 'extras') + '</g>' +
      '<circle cx="0" cy="-39.5" r="7.2" style="' + skin + '"/>' +
      '<g class="hair-front">' + hairShape(a, 'front') + '</g><g class="hair-cap">' + hairShape(a, 'cap') + '</g>' +
      '<g class="face"><circle cx="-2.7" cy="-39" r="0.95" style="fill:var(--ink)"/><circle cx="2.7" cy="-39" r="0.95" style="fill:var(--ink)"/><path d="M-2 -36.2q2 1.7 4 0" fill="none" style="stroke:var(--ink)" stroke-width="0.8" stroke-linecap="round"/></g>' +
      glasses +
      (model ? '<path class="halo" d="M0 -51.4 3.3 -48 0 -44.6 -3.3 -48z" style="fill:var(--model);stroke:var(--surface)" stroke-width=".8"/>' : '') +
      '</g></g></g></g>'
    );
  };
})();
