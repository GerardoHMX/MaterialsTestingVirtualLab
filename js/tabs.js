/* Registro de pestañas: cada ensayo se registra con LAB.register(id, def) */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const LAB = window.LAB = window.LAB || { active: 'tens' };
  const defs = LAB.tabs = {
    tens: { btn: 'tabTens', main: 'mainTens', hdr: 'hdrTens', title: 'Ensayo de tracción', grid: false,
      footer: { f: $('ftFormulas').innerHTML, v: $('ftVocab').innerHTML }, pause: () => LAB.pauseTens && LAB.pauseTens() },
  };
  const OFF = 'rounded-t-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800';
  const ON = 'rounded-t-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900';
  LAB.show = function (t) {
    if (LAB.active === t || !defs[t]) return;
    const prev = defs[LAB.active]; if (prev && prev.pause) prev.pause();
    LAB.active = t;
    Object.entries(defs).forEach(([id, d]) => {
      const on = id === t;
      $(d.main).classList.toggle('hidden', !on); if (d.grid) $(d.main).classList.toggle('grid', on);
      $(d.hdr).classList.toggle('hidden', !on); $(d.btn).className = on ? ON : OFF;
    });
    const d = defs[t];
    $('hTitle').textContent = d.title; $('ftFormulas').innerHTML = d.footer.f; $('ftVocab').innerHTML = d.footer.v;
    if (d.onShow) d.onShow();
  };
  LAB.register = (id, def) => { defs[id] = def; $(def.btn).onclick = () => LAB.show(id); };
  $('tabTens').onclick = () => LAB.show('tens');
})();
