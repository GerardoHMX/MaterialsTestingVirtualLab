/* Registro de pestañas: cada ensayo se registra con LAB.register(id, def) */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const LAB = window.LAB = window.LAB || { active: 'tens' };
  const defs = LAB.tabs = {
    tens: { dlg: 'cfg', btn: 'tabTens', main: 'mainTens', hdr: 'hdrTens', title: 'Ensayo de tracción', grid: false,
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

// Selector de ensayo en las cuatro ventanas de configuración
(function () {
  const $ = id => document.getElementById(id), LAB = window.LAB;
  const NAMES = [['tens', 'Tracción'], ['hard', 'Dureza'], ['res', 'Resiliencia'], ['fat', 'Fatiga']];
  [['cfg', 'tens'], ['cfgH', 'hard'], ['cfgR', 'res'], ['cfgF', 'fat']].forEach(([dlgId, cur]) => {
    const dlg = $(dlgId), form = dlg.querySelector('form'), header = form.firstElementChild;
    const bar = document.createElement('div');
    bar.className = 'flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs';
    bar.innerHTML = '<span class="mr-1 font-semibold uppercase tracking-wider text-slate-500">Ensayo</span>' + NAMES.map(([id, n]) =>
      `<button type="button" data-t="${id}" class="rounded-full border px-3 py-1 font-semibold transition ${id === cur ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}">${n}</button>`).join('');
    header.after(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('button[data-t]'); if (!b || b.dataset.t === cur) return;
      dlg.close(); LAB.show(b.dataset.t);
      const d = LAB.tabs[b.dataset.t], target = $(d.dlg);
      if (target && !target.open) target.showModal();
    });
  });
})();
