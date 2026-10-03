/* Interfaz del ensayo de dureza: pestañas, configuración, simulación (canvas) y análisis */
(function () {
  'use strict';
  const { SCALES, MATERIALS, PHASE_META, buildHardness, hvToHRC, hvToHRB, hvToHRA, fnum } = window.HardnessModel;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 2);
  const fmt = (x, d = 1) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const LAB = window.LAB;

  const NORMS = { brinell: 'UNE 7-422-85', vickers: 'UNE 7-423-84', rockwell: 'UNE 7-424-89' };
  const METHOD_NAME = { brinell: 'Brinell (HBW)', vickers: 'Vickers (HV)', rockwell: 'Rockwell' };
  const DURATION = 30;
  const S = { model: null, p: 0, playing: false, dir: 1, speed: 1, mode: 'Ft', last: 0, started: false };

  /* =================================================================
     TEXTOS
  ================================================================= */
  function explainH(M, st) {
    const m = M.method, id = st.phase;
    const hrF = m === 'rockwell' ? (M.res.sc.name === 'HRB' ? 'HRB = 130 − e / 0,002' : `${M.res.sc.name} = 100 − e / 0,002`) : '';
    const T = {
      brinell: {
        approach: ['Aproximación', 'La bola de metal duro desciende hasta tocar la superficie pulida de la probeta. Todavía no hay fuerza aplicada.', 'k = 0,102·F / D²'],
        load: ['Aplicación de la carga', 'La fuerza crece de forma progresiva (2–8 s). Bajo la bola el material se deforma primero elásticamente y después plásticamente: aparece la zona plástica y, a su alrededor, la zona elástica.', 'F = k·D² / 0,102'],
        dwell: ['Mantenimiento de la carga', 'Se mantiene la carga constante 10–15 s para que la deformación plástica se estabilice y la medida sea repetible.', 'F = cte'],
        unload: ['Retirada de la carga', 'Al descargar se recupera la deformación elástica: la profundidad disminuye y queda la huella permanente (deformación plástica).', 'h_residual < h_máx'],
        withdraw: ['Retirada del penetrador', 'El penetrador se separa de la probeta. La huella residual es un casquete esférico de diámetro d y profundidad h.', 'h = (D − √(D² − d²)) / 2'],
        measure: ['Medida de la huella', 'Con el microscopio se miden dos diámetros perpendiculares d₁ y d₂ y se toma su media. La dureza es la relación entre la carga y el área del casquete esférico.', 'HBW = 0,102·2F / [π·D·(D − √(D² − d²))]'],
      },
      vickers: {
        approach: ['Aproximación', 'La pirámide de diamante (136° entre caras) desciende hasta la superficie pulida. Todavía no hay fuerza.', 'α = 136°'],
        load: ['Aplicación de la carga', 'La carga aumenta suavemente (2–8 s). El diamante se hunde y el material fluye plásticamente alrededor del vértice; la zona elástica rodea a la plástica.', 'F = 9,807·F(kgf)'],
        dwell: ['Mantenimiento de la carga', 'La carga se mantiene 10–15 s para estabilizar la deformación.', 'F = cte'],
        unload: ['Retirada de la carga', 'La recuperación elástica reduce la profundidad; la huella permanente es una pirámide invertida de base cuadrada.', 'h ≈ d / 7'],
        withdraw: ['Retirada del penetrador', 'El penetrador se retira. La huella tiene forma de cuadrado cuyas diagonales d₁ y d₂ se medirán.', 'S = d² / (2·sen 68°)'],
        measure: ['Medida de las diagonales', 'Con el microscopio se miden las dos diagonales d₁ y d₂ y se calcula su media d. HV es la carga dividida por la superficie lateral de la huella.', 'HV = 1,8544·F(kgf) / d²'],
      },
      rockwell: {
        approach: ['Aproximación', 'El penetrador (cono de diamante o bola de acero) se acerca a la superficie. Todavía no hay fuerza.', '—'],
        preload: ['Precarga F₀', 'Se aplica la precarga (98,07 N): elimina holguras y rugosidad. La profundidad alcanzada es el origen de medida y el reloj se pone a cero («SET»).', 'F₀ = 98,07 N'],
        major: ['Carga adicional F₁', 'Se añade la carga F₁: el penetrador profundiza y el reloj mide el aumento de profundidad respecto del origen.', 'F = F₀ + F₁'],
        dwell: ['Mantenimiento', 'Se mantiene la carga total unos segundos hasta que la profundidad se estabiliza.', 'F₀ + F₁ = cte'],
        release: ['Retirada de F₁', 'Se retira F₁ manteniendo F₀: se recupera la parte elástica y queda la profundidad permanente e (unidades de 0,002 mm).', 'e = h_F₀ (final) − h_F₀ (origen)'],
        reading: ['Lectura de la dureza', 'El reloj indica directamente la dureza: cuanto menos se hunde el penetrador, más duro es el material.', hrF],
        withdraw: ['Retirada del penetrador', 'Se retira la precarga y el penetrador. La lectura queda registrada.', hrF],
      },
    };
    return T[m][id];
  }

  const FORMULAS = [
    ['HBW = 0,102·2F / [π·D·(D − √(D² − d²))]', 'Dureza Brinell', ['F: fuerza de ensayo (N)', 'D: diámetro de la bola (mm)', 'd: diámetro medio de la huella (mm)', 'El denominador es el área del casquete esférico (mm²)']],
    ['k = 0,102·F / D²   ·   0,24·D ≤ d ≤ 0,6·D', 'Relación de carga y validez Brinell', ['k: 30 aceros · 10 Cu y latones · 5 aluminio · 1–2,5 metales blandos', 'Fuera del margen de d la medida no es válida']],
    ['HV = 0,1891·F / d²  =  1,8544·F(kgf) / d²', 'Dureza Vickers', ['F: fuerza (N); F(kgf) en kilogramos fuerza', 'd = (d₁ + d₂)/2: media de las diagonales (mm)', '136°: ángulo entre caras de la pirámide']],
    ['h ≈ d / 7   ·   S = d² / (2·sen 68°)', 'Geometría de la huella Vickers', ['h: profundidad de la huella (mm)', 'S: superficie lateral de la huella (mm²)']],
    ['HRC = HRA = 100 − e   ·   HRB = 130 − e', 'Dureza Rockwell', ['e: profundidad permanente expresada en unidades de 0,002 mm', 'Se mide entre el origen (con F₀) y la profundidad final (con F₀)']],
    ['F = F₀ + F₁', 'Cargas Rockwell', ['F₀ = 98,07 N (precarga, 10 kgf)', 'F₁: carga adicional (HRA 490,3 N · HRB 882,6 N · HRC 1373 N)']],
    ['Rm ≈ 3,45 · HB  (MPa)', 'Resistencia a tracción estimada', ['Solo orientativa, para aceros al carbono con HB ≤ 450', 'Relaciona la dureza con el ensayo de tracción']],
  ];
  const VOCAB = [
    ['Dureza', 'Resistencia de un material a ser penetrado o rayado por otro más duro.'],
    ['Penetrador', 'Elemento duro que se hunde en la probeta: bola, pirámide de diamante o cono de diamante.'],
    ['Huella', 'Marca permanente que deja el penetrador; su tamaño o profundidad da la dureza.'],
    ['Metal duro (HBW)', 'Carburo de volframio usado en la bola Brinell; permite medir hasta 650 HBW.'],
    ['Precarga F₀', 'Fuerza inicial en Rockwell: asienta el penetrador y define el origen de medida.'],
    ['Carga adicional F₁', 'Fuerza que se suma a F₀ para producir la deformación de medida.'],
    ['Profundidad residual e', 'Profundidad permanente tras retirar F₁ (Rockwell).'],
    ['Recuperación elástica', 'Parte de la profundidad que se recupera al retirar la carga.'],
    ['Zona plástica', 'Región bajo el penetrador con deformación permanente.'],
    ['Zona elástica', 'Región que rodea a la plástica, deformada solo de forma reversible.'],
    ['Escala Rockwell', 'Combinación de penetrador y cargas (HRA, HRB, HRC…) adecuada a un campo de durezas.'],
    ['Tiempo de mantenimiento', 'Segundos que se mantiene la carga total (10–15 s en Brinell y Vickers).'],
    ['Diagonales d₁, d₂', 'Dimensiones de la huella Vickers medidas con microscopio.'],
    ['Espesor mínimo', 'Espesor por debajo del cual la cara opuesta se deforma y la medida deja de ser válida.'],
    ['Distancia entre huellas', 'Separación mínima para que la zona endurecida de una huella no afecte a la siguiente.'],
    ['Acritud', 'Endurecimiento por deformación plástica en frío (afecta a la huella).'],
  ];

  /* =================================================================
     PESTAÑAS
  ================================================================= */
  const hardFooter = {
    f: FORMULAS.map(([f, t, items]) => `<div class="rounded-lg bg-slate-800/70 p-3"><div class="flex flex-wrap items-baseline gap-x-3"><span class="font-mono text-[15px] font-semibold text-blue-200">${f}</span><span class="text-xs uppercase tracking-wide text-slate-400">${t}</span></div><ul class="mt-1 list-inside list-disc text-[13px] text-slate-300">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join(''),
    v: VOCAB.map(([t, d]) => `<div><dt class="font-semibold text-emerald-200">${t}</dt><dd class="text-[13px] text-slate-300">${d}</dd></div>`).join(''),
  };
  LAB.register('hard', { btn: 'tabHard', main: 'mainHard', hdr: 'hdrHard', title: 'Ensayo de dureza', grid: true, footer: hardFooter,
    pause: () => setPlaying(false), onShow: () => { render(); if (!S.started) { S.started = true; dlg.showModal(); } } });

  /* =================================================================
     CONFIGURACIÓN
  ================================================================= */
  const dlg = $('cfgH');
  const mSel = $('hMatSel');
  Object.entries(MATERIALS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.name; mSel.appendChild(o); });
  const methodVal = () => document.querySelector('input[name=hmethod]:checked').value;

  function eqText() {
    const hv = +$('hHV').value, m = methodVal();
    if (!(hv > 0)) return '—';
    if (m === 'brinell') return fmt(hv * 0.95, 0) + ' HBW';
    if (m === 'vickers') return fmt(hv, 0) + ' HV';
    const sc = SCALES[$('hScale').value], v = sc.fn(hv);
    return v >= sc.min && v <= sc.max ? fmt(v, 0) + ' ' + sc.name : `fuera de campo de ${sc.name} (${fmt(v, 0)})`;
  }
  // Escala Rockwell recomendada para una dureza HV (preferencia C, B, A; si ninguna encaja, la más próxima)
  function suggestScale(hv) {
    for (const k of ['C', 'B', 'A']) { const sc = SCALES[k], v = sc.fn(hv); if (v >= sc.min && v <= sc.max) return k; }
    return hv < 125 ? 'B' : 'C';
  }
  function autoScale() { const hv = +$('hHV').value; if (hv > 0) $('hScale').value = suggestScale(hv); }
  function scaleHint() {
    const hv = +$('hHV').value, box = $('hScaleHint'); if (!(hv > 0)) { box.textContent = ''; return; }
    const rec = suggestScale(hv), cur = $('hScale').value, scr = SCALES[rec], vr = scr.fn(hv), sc = SCALES[cur], vc = sc.fn(hv);
    const okRec = vr >= scr.min && vr <= scr.max, okCur = vc >= sc.min && vc <= sc.max;
    if (cur === rec && okRec) { box.className = 'rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs leading-relaxed text-emerald-800'; box.textContent = `Escala adecuada para este material: ${scr.name} (≈ ${fmt(vr, 0)} ${scr.name}).`; }
    else if (okCur) { box.className = 'rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs leading-relaxed text-emerald-800'; box.textContent = `${sc.name} es válida para este material (≈ ${fmt(vc, 0)}). La recomendada es ${scr.name}.`; }
    else { box.className = 'rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs leading-relaxed text-amber-800'; box.textContent = `${sc.name} no es adecuada para este material (daría ≈ ${fmt(Math.max(0, vc), 0)}, fuera de ${sc.min} – ${sc.max}). Se puede ensayar igualmente, pero el ensayo no será válido. Recomendada: ${scr.name}${okRec ? ` (≈ ${fmt(vr, 0)})` : ''}.`; }
  }
  function syncForm() {
    const m = methodVal();
    $('hgBr').classList.toggle('hidden', m !== 'brinell'); $('hgVk').classList.toggle('hidden', m !== 'vickers'); $('hgRk').classList.toggle('hidden', m !== 'rockwell');
    const D = +$('hDia').value, k = +$('hK').value, Fk = k * D * D;
    $('hBrDes').textContent = `HBW ${fnum(D)}/${fnum(Fk)}`; $('hBrF').textContent = fmt(Fk * 9.80665, 0) + ' N';
    const fk = +$('hFk').value; $('hVkDes').textContent = `HV ${fnum(fk)}`; $('hVkF').textContent = fmt(fk * 9.80665, 1) + ' N';
    $('hHVeq').textContent = eqText(); scaleHint();
  }
  function fillMat(k) { $('hHV').value = MATERIALS[k].hv; autoScale(); if (methodVal() === 'brinell') $('hK').value = String(MATERIALS[k].kRec > 10 ? 30 : MATERIALS[k].kRec); syncForm(); }
  document.querySelectorAll('input[name=hmethod]').forEach(r => r.onchange = syncForm);
  ['hDia', 'hK', 'hFk', 'hScale', 'hHV'].forEach(id => $(id).addEventListener('input', syncForm));
  mSel.onchange = () => fillMat(mSel.value);
  $('hHV').addEventListener('input', () => { if (mSel.value !== 'custom') mSel.value = 'custom'; autoScale(); syncForm(); });
  $('hBtnCfg').onclick = () => { setPlaying(false); dlg.showModal(); };
  $('hClose').onclick = $('hCancel').onclick = () => dlg.close();

  function readCfg() {
    const mat = Object.assign({}, MATERIALS[mSel.value], { hv: +$('hHV').value });
    const cfg = { method: methodVal(), mat, D: +$('hDia').value, kfac: +$('hK').value, Fkgf: +$('hFk').value, scale: $('hScale').value,
      dwell: +$('hDwell').value, thickness: +$('hThk').value, edge: +$('hEdge').value, spacing: +$('hSpc').value };
    const errs = [];
    if (!(mat.hv >= 5 && mat.hv <= 1500)) errs.push('La dureza del material debe estar entre 5 y 1500 HV.');
    if (!(cfg.dwell >= 1)) errs.push('El tiempo de mantenimiento debe ser ≥ 1 s.');
    if (!(cfg.thickness > 0 && cfg.edge > 0 && cfg.spacing > 0)) errs.push('Espesor y distancias deben ser positivos.');
    return { cfg, errs };
  }
  $('hForm').addEventListener('submit', e => {
    e.preventDefault();
    const { cfg, errs } = readCfg(), box = $('hErr');
    if (errs.length) { box.textContent = errs.join(' '); box.classList.remove('hidden'); return; }
    box.classList.add('hidden'); dlg.close();
    apply(cfg); setPlaying(true, 1);
  });

  /* =================================================================
     APLICAR
  ================================================================= */
  let paramRows = [], lastRevealed = null;
  function apply(cfg) {
    const M = buildHardness(cfg), r = M.res;
    S.model = M; S.p = 0; S.dir = 1; lastRevealed = null;
    $('hhNorm').textContent = NORMS[cfg.method];
    $('hhMethod').textContent = METHOD_NAME[cfg.method] + (cfg.method === 'rockwell' ? ' · ' + r.sc.name : '');
    $('hhMat').textContent = cfg.mat.name + ` (${fmt(cfg.mat.hv, 0)} HV)`;
    $('hhInd').textContent = cfg.method === 'brinell' ? `Bola Ø ${fnum(r.D)} mm` : cfg.method === 'vickers' ? 'Pirámide 136°' : r.sc.desc;
    $('hhLoad').textContent = cfg.method === 'rockwell' ? `${fmt(r.F0, 1)} + ${fmt(r.F1, 1)} N` : `${fmt(r.F, 0)} N (${fnum(r.Fk)} kgf)`;
    $('hhDwell').textContent = cfg.method === 'rockwell' ? '≈ ' + cfg.dwell + ' s' : cfg.dwell + ' s';
    $('hhThk').textContent = `e = ${fnum(cfg.thickness)} mm`;
    $('hDLab').textContent = cfg.method === 'brinell' ? 'Diámetro d' : cfg.method === 'vickers' ? 'Diagonal d' : 'Lectura';
    buildChips(M); buildParams(M); buildChecks(M); buildEq(M); buildReco(M);
    $('hRelTitle').textContent = cfg.method === 'brinell' ? 'Dureza HBW frente al diámetro d' : cfg.method === 'vickers' ? 'Dureza HV frente a la diagonal d' : `Lectura ${r.sc.name} frente a la profundidad e`;
    render();
  }

  function buildChips(M) {
    const box = $('hChips'); box.innerHTML = '';
    M.phases.forEach(ph => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = ph.id;
      b.className = 'rounded-full border px-3 py-1 text-xs font-semibold transition'; b.textContent = PHASE_META[ph.id].short;
      b.onclick = () => { setPlaying(false); S.p = clamp(ph.p0 + 0.04 * (ph.p1 - ph.p0), 0, 1); render(); };
      box.appendChild(b);
    });
  }

  function buildParams(M) {
    const r = M.res, c = M.cfg, pr = M.pRead;
    let rows;
    if (c.method === 'brinell') rows = [
      ['Penetrador', `Bola de metal duro Ø ${fnum(r.D)} mm`, 0], ['Fuerza F', `${fmt(r.F, 0)} N (${fnum(r.Fk)} kgf)`, 0],
      ['k = 0,102·F / D²', fnum(r.k), 0], ['Mantenimiento', c.dwell + ' s', 0],
      ['Diámetros d₁ / d₂', `${fmt(r.d1, 3)} / ${fmt(r.d2, 3)} mm`, pr], ['Diámetro medio d', fmt(r.d, 3) + ' mm', pr], ['Relación d / D', fmt(r.ratio, 3), pr],
      ['Profundidad h', fmt(r.h, 3) + ' mm', pr], ['Área de contacto S = π·D·h', fmt(r.S, 2) + ' mm²', pr], ['Dureza = 0,102·F / S', r.designation, pr]];
    else if (c.method === 'vickers') rows = [
      ['Penetrador', 'Pirámide de diamante 136°', 0], ['Fuerza F', `${fmt(r.F, 1)} N (${fnum(r.Fk)} kgf)`, 0], ['Mantenimiento', c.dwell + ' s', 0],
      ['Diagonales d₁ / d₂', `${fmt(r.d1, 4)} / ${fmt(r.d2, 4)} mm`, pr], ['Diagonal media d', fmt(r.d, 4) + ' mm', pr],
      ['Profundidad h ≈ d / 7', fmt(r.h, 4) + ' mm', pr], ['Superficie S = d² / 1,8544', fmt(r.S, 4) + ' mm²', pr], ['Dureza = 1,8544·F(kgf) / d²', r.designation, pr]];
    else rows = [
      ['Escala', `${r.sc.name} · ${r.sc.desc}`, 0], ['Precarga F₀', fmt(r.F0, 2) + ' N', 0], ['Carga adicional F₁', fmt(r.F1, 1) + ' N', 0], ['Carga total', fmt(r.F, 1) + ' N', 0],
      ['Profundidad residual e', `${fmt(r.e, 4)} mm  (${fmt(r.e / 0.002, 1)} × 0,002 mm)`, pr], ['Ø de la huella', fmt(r.dImp, 3) + ' mm', pr],
      [`Dureza = ${r.N} − e/0,002`, r.designation, pr]];
    const box = $('hParams'); box.innerHTML = '';
    paramRows = rows.map(([l, v, rev]) => {
      const row = document.createElement('div'); row.className = 'flex items-center justify-between gap-3 py-1.5 transition-opacity duration-300';
      row.innerHTML = `<span class="text-slate-600">${l}</span><span class="text-right font-mono font-semibold text-slate-800">${v}</span>`;
      box.appendChild(row); return { row, rev };
    });
  }

  function buildChecks(M) {
    $('hChecks').innerHTML = M.checks.map(k => {
      const ic = k.ok === true ? ['✓', 'bg-emerald-600'] : k.ok === 'warn' ? ['!', 'bg-amber-500'] : ['✕', 'bg-red-600'];
      return `<div class="flex gap-2.5"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${ic[1]}">${ic[0]}</span>
        <div class="min-w-0"><div class="text-slate-800">${k.label}</div><div class="font-mono text-xs text-slate-500">${k.value} <span class="text-slate-400">·</span> exigido ${k.limit}</div>${k.ok !== true ? `<div class="text-xs ${k.ok === false ? 'text-red-600' : 'text-amber-600'}">${k.hint}</div>` : ''}</div></div>`;
    }).join('');
  }
  function buildEq(M) {
    const e = M.res.eq, cell = (l, v, u) => `<div class="rounded-lg bg-slate-50 p-2"><div class="text-[11px] text-slate-500">${l}</div><div class="font-mono text-base font-bold ${v == null ? 'text-slate-300' : 'text-slate-800'}">${v == null ? '—' : fmt(v, 0)} <small class="text-[10px] font-normal">${v == null ? '' : u}</small></div></div>`;
    $('hEq').innerHTML = cell('Vickers', e.HV, 'HV') + cell('Brinell', e.HB, 'HBW') + cell('Rockwell C', e.HRC, 'HRC') + cell('Rockwell B', e.HRB, 'HRB') + cell('Rockwell A', e.HRA, 'HRA') + cell('Rm estimada', e.Rm, 'MPa');
  }
  function buildReco(M) {
    $('hReco').innerHTML = M.reco.length ? M.reco.slice(0, 6).map(t => `<li>${t}</li>`).join('')
      : '<li class="list-none text-amber-700">Ninguna combinación normalizada cumple todas las condiciones con esta probeta: revisa el espesor y las distancias.</li>';
  }

  /* =================================================================
     BUCLE Y CONTROLES
  ================================================================= */
  function setPlaying(on, dir) {
    if (dir) S.dir = dir;
    if (on && S.p >= 1 && S.dir > 0) S.p = 0;
    if (on && S.p <= 0 && S.dir < 0) S.p = 1;
    S.playing = on; S.last = performance.now();
    const fwd = on && S.dir > 0;
    $('hTPlay').textContent = fwd ? 'Pausa' : 'Reproducir';
    $('hIcPlay').innerHTML = fwd ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M6 4l14 8-14 8z"/>';
    $('hbRev').classList.toggle('bg-blue-100', on && S.dir < 0);
    if (on) requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!S.playing) return;
    const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
    S.p += S.dir * dt / DURATION * S.speed;
    if (S.p >= 1) { S.p = 1; setPlaying(false); } else if (S.p <= 0) { S.p = 0; setPlaying(false); }
    render(); if (S.playing) requestAnimationFrame(tick);
  }
  const STEP = 0.006;
  $('hbPlay').onclick = () => setPlaying(!(S.playing && S.dir > 0), 1);
  $('hbRev').onclick = () => (S.playing && S.dir < 0) ? setPlaying(false) : setPlaying(true, -1);
  $('hbStart').onclick = () => { setPlaying(false); S.p = 0; render(); };
  $('hbEnd').onclick = () => { setPlaying(false); S.p = 1; render(); };
  $('hbBack').onclick = () => { setPlaying(false); S.p = clamp(S.p - STEP, 0, 1); render(); };
  $('hbFwd').onclick = () => { setPlaying(false); S.p = clamp(S.p + STEP, 0, 1); render(); };
  $('hSpeed').onchange = e => S.speed = +e.target.value;
  $('hSeek').oninput = e => { setPlaying(false); S.p = +e.target.value / 1000; render(); };
  function setMode(m) {
    S.mode = m;
    $('hmFt').className = 'px-2.5 py-1 font-semibold ' + (m === 'Ft' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100');
    $('hmFh').className = 'px-2.5 py-1 font-semibold ' + (m === 'Fh' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100');
    render();
  }
  $('hmFt').onclick = () => setMode('Ft'); $('hmFh').onclick = () => setMode('Fh');
  window.addEventListener('keydown', e => {
    if (LAB.active !== 'hard' || dlg.open || (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); $('hbPlay').click(); }
    else if (e.code === 'ArrowRight') $('hbFwd').click(); else if (e.code === 'ArrowLeft') $('hbBack').click();
    else if (e.code === 'Home') $('hbStart').click(); else if (e.code === 'End') $('hbEnd').click();
  });

  /* =================================================================
     CANVAS
  ================================================================= */
  function setupCanvas(cv, w, h) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.aspectRatio = w + ' / ' + h;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  }
  const SW = 560, SH = 760;
  const sctx = setupCanvas($('cvHSpec'), SW, SH), pctx = setupCanvas($('cvHProc'), 640, 300), rctx = setupCanvas($('cvHRel'), 440, 300), kctx = setupCanvas($('cvHScale'), 440, 140);

  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  function arrow(ctx, x1, y1, x2, y2, color, w = 1.5, head = 6) {
    const a = Math.atan2(y2 - y1, x2 - x1); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4)); ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), c = v => clamp(v + amt, 0, 255); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }
  function halo(ctx, txt, x, y, color, font, align = 'left') {
    ctx.font = font; ctx.textAlign = align; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
  }

  /* ---------- simulación ---------- */
  function drawSpec(st) {
    const M = S.model, ctx = sctx, r = M.res, cx = 280, ySurf = 520, yBot = 650;
    const pm = PHASE_META[st.phase];
    ctx.clearRect(0, 0, SW, SH); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, SW, SH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= SW; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, SH); }
    for (let y = 0; y <= SH; y += 28) { ctx.moveTo(0, y); ctx.lineTo(SW, y); }
    ctx.stroke();

    const Rmm = M.kind === 'ball' ? (M.method === 'brinell' ? r.D / 2 : r.sc.R) : 0;
    let sc = 85 / M.hwOf(M.hMax);
    if (M.kind === 'ball') sc = Math.min(sc, 90 / Rmm);
    const hPx = st.h * sc, hw = M.hwOf(st.h) * sc, gapPx = st.gap * 80, tipY = ySurf + hPx - gapPx;
    const tanA = M.kind === 'cone' ? 1.7320508 : 2.4750869;
    const profile = x => {
      const ax = Math.abs(x); if (ax >= hw || hPx <= 0) return 0;
      if (M.kind === 'ball') { const Rp = Rmm * sc; return Math.max(0, hPx - (Rp - Math.sqrt(Math.max(0, Rp * Rp - ax * ax)))); }
      return Math.max(0, hPx - ax / tanA);
    };
    const blockPath = () => {
      ctx.beginPath(); ctx.moveTo(150, ySurf); ctx.lineTo(cx - hw, ySurf);
      if (hw > 0.5) for (let x = -hw; x <= hw; x += Math.max(1, hw / 60)) ctx.lineTo(cx + x, ySurf + profile(x));
      ctx.lineTo(cx + hw, ySurf); ctx.lineTo(540, ySurf); ctx.lineTo(540, yBot); ctx.lineTo(150, yBot); ctx.closePath();
    };

    // yunque
    ctx.fillStyle = '#334155'; rr(ctx, 170, yBot, 330, 34, 4); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('YUNQUE', cx, yBot + 21);
    ctx.fillStyle = '#475569'; rr(ctx, 40, yBot + 34, 480, 14, 3); ctx.fill();

    // probeta (sección)
    const base = M.mat.color || '#94a3b8';
    blockPath(); const g = ctx.createLinearGradient(0, ySurf, 0, yBot); g.addColorStop(0, shade(base, 18)); g.addColorStop(1, shade(base, -22)); ctx.fillStyle = g; ctx.fill();
    ctx.save(); blockPath(); ctx.clip();
    ctx.strokeStyle = 'rgba(30,41,59,.16)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 20; x < 560; x += 12) { ctx.moveTo(x, yBot); ctx.lineTo(x + 130, ySurf); }
    ctx.stroke();
    if (st.h > 0) {
      const act = st.F > 0 ? 1 : 0.6;
      const rP = Math.min(hw * 1.8 + 10, 165), rE = Math.min(hw * 3.6 + 10, 225);
      if (st.F > 0) {
        const a = 0.12 * Math.sqrt(clamp(st.loadFrac, 0, 1));
        ctx.fillStyle = `rgba(37,99,235,${a})`; ctx.beginPath(); ctx.arc(cx, ySurf, rE, 0, Math.PI); ctx.fill();
        ctx.setLineDash([5, 4]); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, ySurf, rE, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
      }
      const gr = ctx.createRadialGradient(cx, ySurf, 2, cx, ySurf, rP);
      gr.addColorStop(0, `rgba(245,158,11,${0.65 * act})`); gr.addColorStop(1, `rgba(245,158,11,${0.14 * act})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, ySurf, rP, 0, Math.PI); ctx.fill();
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, ySurf, rP, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore(); ctx.save();
      if (st.F > 0) halo(ctx, 'Zona elástica', Math.min(cx + rE * 0.6, 470), Math.min(ySurf + rE * 0.74, yBot - 30), '#1d4ed8', `700 11px ${FONT}`, 'left');
      halo(ctx, 'Zona plástica', Math.max(cx - rP * 0.98, 156), ySurf + rP * 0.78, '#b45309', `700 11px ${FONT}`, 'left');
    }
    ctx.restore();
    blockPath(); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(`espesor ${fnum(M.cfg.thickness)} mm (fuera de escala)`, 534, yBot - 8);

    // regla de profundidades
    const rx = 24; ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.2;
    const hMaxPx = M.hMax * sc; ctx.beginPath(); ctx.moveTo(rx, ySurf - 10); ctx.lineTo(rx, ySurf + hMaxPx + 12); ctx.stroke();
    const ticks = [[0, '0 · superficie', '#334155']];
    if (M.method === 'rockwell') ticks.push([M.h0, 'h₀ origen (F₀)', '#0284c7']);
    ticks.push([M.hRes, M.method === 'rockwell' ? 'h res. (F₀)' : 'h residual', '#16a34a'], [M.hMax, 'h máx', '#2563eb']);
    let lastY = -1e9;
    ticks.forEach(([hh, lab, col]) => {
      const y = ySurf + hh * sc; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx - 5, y); ctx.lineTo(rx + 5, y); ctx.stroke();
      ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx + 5, y); ctx.lineTo(150, y); ctx.stroke(); ctx.setLineDash([]);
      const ly = Math.max(y + 3, lastY + 12); lastY = ly;
      ctx.fillStyle = col; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(lab, rx + 9, ly + 1);
    });
    if (st.h > 0) { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(rx - 8, ySurf + hPx); ctx.lineTo(rx - 2, ySurf + hPx - 4); ctx.lineTo(rx - 2, ySurf + hPx + 4); ctx.fill(); }

    // cotas
    if (hw > 4) {
      const yd = ySurf + hPx + 26;
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - hw, ySurf + 4); ctx.lineTo(cx - hw, yd + 6); ctx.moveTo(cx + hw, ySurf + 4); ctx.lineTo(cx + hw, yd + 6); ctx.stroke();
      arrow(ctx, cx, yd, cx - hw, yd, '#334155', 1.2, 5); arrow(ctx, cx, yd, cx + hw, yd, '#334155', 1.2, 5);
      const dNow = 2 * M.hwOf(st.h);
      halo(ctx, `${M.method === 'vickers' ? 'a' : M.method === 'brinell' ? 'd' : 'Ø'} = ${fmt(dNow, dNow < 1 ? 3 : 2)} mm`, cx, yd + 15, '#0f172a', `700 11px ${FONT}`, 'center');
    }
    if (hPx > 2) {
      const xh = cx + hw + 30;
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + hw + 4, ySurf); ctx.lineTo(xh + 6, ySurf); ctx.moveTo(cx + 2, ySurf + hPx); ctx.lineTo(xh + 6, ySurf + hPx); ctx.stroke();
      arrow(ctx, xh, ySurf + hPx / 2, xh, ySurf, '#334155', 1.2, 5); arrow(ctx, xh, ySurf + hPx / 2, xh, ySurf + hPx, '#334155', 1.2, 5);
      halo(ctx, `h = ${fmt(st.h, 3)} mm`, xh + 8, ySurf + hPx / 2 + 4, '#0f172a', `700 11px ${FONT}`);
    }
    if (M.method === 'rockwell' && (st.phase === 'release' || st.phase === 'reading' || st.phase === 'withdraw')) {
      const y0 = ySurf + M.h0 * sc, y1 = ySurf + M.hRes * sc, xe = cx + hw + 120;
      ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + hw + 60, y0); ctx.lineTo(xe + 6, y0); ctx.moveTo(cx + hw + 60, y1); ctx.lineTo(xe + 6, y1); ctx.stroke();
      arrow(ctx, xe, (y0 + y1) / 2, xe, y0, '#7c3aed', 1.4, 5); arrow(ctx, xe, (y0 + y1) / 2, xe, y1, '#7c3aed', 1.4, 5);
      halo(ctx, `e = ${fmt(r.e, 3)} mm`, xe + 8, (y0 + y1) / 2 + 4, '#6d28d9', `700 11px ${FONT}`);
    }

    // penetrador
    const Fk = M.Fmax;
    let headBottom;
    if (M.kind === 'ball') {
      const Rp = Rmm * sc, cyb = tipY - Rp;
      headBottom = cyb - Rp - 14;
      ctx.fillStyle = '#64748b'; ctx.fillRect(cx - Rp * 0.42, headBottom, Rp * 0.84, 16);
      const bg = ctx.createRadialGradient(cx - Rp * 0.3, cyb - Rp * 0.3, Rp * 0.1, cx, cyb, Rp);
      if (M.method === 'brinell') { bg.addColorStop(0, '#94a3b8'); bg.addColorStop(1, '#1e293b'); } else { bg.addColorStop(0, '#e2e8f0'); bg.addColorStop(1, '#475569'); }
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cyb, Rp, 0, 7); ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.stroke();
    } else {
      const L = 140, shaft = 34, Hw = shaft / tanA;
      headBottom = tipY - L;
      const dg = ctx.createLinearGradient(cx - shaft, 0, cx + shaft, 0); dg.addColorStop(0, '#7dd3fc'); dg.addColorStop(.5, '#f0f9ff'); dg.addColorStop(1, '#38bdf8');
      ctx.fillStyle = '#64748b'; ctx.fillRect(cx - shaft, tipY - L, shaft * 2, L - Hw);
      ctx.fillStyle = dg; ctx.beginPath(); ctx.moveTo(cx, tipY); ctx.lineTo(cx + shaft, tipY - Hw); ctx.lineTo(cx - shaft, tipY - Hw); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 1.3; ctx.stroke();
      halo(ctx, M.kind === 'cone' ? 'cono 120°' : 'pirámide 136°', cx + shaft + 8, tipY - Hw - 6, '#0369a1', `600 10px ${FONT}`);
    }
    ctx.fillStyle = '#1e293b'; rr(ctx, cx - 78, headBottom - 44, 156, 46, 6); ctx.fill();
    ctx.fillStyle = '#4ade80'; ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('CABEZAL', cx, headBottom - 24);
    ctx.fillStyle = '#cbd5e1'; ctx.fillText(st.F > 0 ? 'F = ' + fmt(st.F, 0) + ' N' : 'F = 0', cx, headBottom - 9);
    if (st.F > 0) {
      const L = 8 + 38 * clamp(st.F / Fk, 0, 1);
      arrow(ctx, cx, headBottom - 48 - L, cx, headBottom - 48, '#dc2626', 3, 8);
    }

    // panel de instrumentos
    ctx.fillStyle = '#0f172a'; rr(ctx, 20, 8, 520, 142, 10); ctx.fill();
    ctx.fillStyle = pm.color; rr(ctx, 20, 8, 6, 142, 3); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 10px ${FONT}`; ctx.fillText(METHOD_NAME[M.method].toUpperCase() + ' · ' + NORMS[M.method], 38, 28);
    ctx.fillStyle = '#f1f5f9'; ctx.font = `700 15px ${FONT}`; ctx.fillText(M.method === 'rockwell' ? `Escala ${r.sc.name}` : M.method === 'brinell' ? `HBW ${fnum(r.D)}/${fnum(r.Fk)}` : `HV ${fnum(r.Fk)}`, 38, 50);
    ctx.fillStyle = '#cbd5e1'; ctx.font = `500 11.5px ${FONT}`;
    const lines = M.method === 'brinell' ? [`Bola de metal duro Ø ${fnum(r.D)} mm`, `F = ${fmt(r.F, 0)} N (${fnum(r.Fk)} kgf)`, `Mantenimiento: ${M.cfg.dwell} s`]
      : M.method === 'vickers' ? ['Pirámide de diamante 136°', `F = ${fmt(r.F, 1)} N (${fnum(r.Fk)} kgf)`, `Mantenimiento: ${M.cfg.dwell} s`]
        : [r.sc.desc[0].toUpperCase() + r.sc.desc.slice(1), `F₀ = ${fmt(r.F0, 1)} N · F₁ = ${fmt(r.F1, 1)} N`, `Mantenimiento ≈ ${M.cfg.dwell} s`];
    lines.forEach((t, i) => ctx.fillText(t, 38, 70 + i * 16));
    if (st.phase === 'measure' && M.method !== 'rockwell') {
      const k = st.measureU, c1 = clamp(k * 2, 0, 1), c2 = clamp(k * 2 - 1, 0, 1), sym = M.method === 'brinell' ? 'd' : 'd';
      ctx.fillStyle = '#c4b5fd'; ctx.font = `700 11.5px ${MONO}`;
      ctx.fillText(`${sym}₁ = ${fmt(r.d1 * c1, M.method === 'brinell' ? 3 : 4)} mm`, 38, 124); ctx.fillText(`${sym}₂ = ${fmt(r.d2 * c2, M.method === 'brinell' ? 3 : 4)} mm`, 200, 124);
    } else if (M.method === 'rockwell' && st.phase !== 'approach') { ctx.fillStyle = '#c4b5fd'; ctx.font = `700 11.5px ${MONO}`; ctx.fillText(`Lectura = ${fmt(clamp(st.reading, r.N - 100, r.N), 1)} ${r.sc.name}`, 38, 124); if (st.phase === 'reading' || st.phase === 'withdraw') ctx.fillText(`e = ${fmt(r.e, 4)} mm`, 200, 124); }

    if (M.method === 'rockwell') drawDial(ctx, 448, 79, 62, st, M); else drawLens(ctx, 448, 79, 62, st, M);

    // leyenda
    ctx.textAlign = 'left'; ctx.font = `600 11px ${FONT}`;
    [['rgba(245,158,11,.6)', 'Zona plástica'], ['rgba(37,99,235,.35)', 'Zona elástica'], ['#475569', 'Huella residual']].forEach(([c, t], i) => {
      ctx.fillStyle = c; rr(ctx, 40 + i * 165, 722, 16, 16, 3); ctx.fill(); ctx.fillStyle = '#334155'; ctx.fillText(t, 62 + i * 165, 735);
    });
  }

  function drawDial(ctx, cx, cy, r, st, M) {
    const N = M.res.N, red = M.res.sc.name === 'HRB';
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.stroke();
    const ang = v => ((N - v) * 3 - 90) * Math.PI / 180;
    for (let v = N; v >= N - 100; v -= 2) {
      const a = ang(v), major = (N - v) % 10 === 0, r1 = r - 4, r2 = r - (major ? 12 : 8);
      ctx.strokeStyle = red ? '#b91c1c' : '#0f172a'; ctx.lineWidth = major ? 1.6 : 0.9;
      ctx.beginPath(); ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a)); ctx.stroke();
      if (major && v !== N - 100) { ctx.fillStyle = red ? '#b91c1c' : '#0f172a'; ctx.font = `600 8.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(v), cx + (r - 21) * Math.cos(a), cy + (r - 21) * Math.sin(a) + 3); }
    }
    ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.moveTo(cx, cy - r + 3); ctx.lineTo(cx - 4, cy - r - 4); ctx.lineTo(cx + 4, cy - r - 4); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(M.res.sc.name, cx, cy + 24);
    const a = ang(clamp(st.reading, N - 100, N));
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx - 8 * Math.cos(a), cy - 8 * Math.sin(a)); ctx.lineTo(cx + (r - 8) * Math.cos(a), cy + (r - 8) * Math.sin(a)); ctx.stroke();
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
  }

  function drawLens(ctx, cx, cy, r, st, M) {
    const vis = st.phase === 'measure' ? 1 : st.phase === 'withdraw' ? st.u : 0;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    ctx.fillStyle = '#cfd4db'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    if (vis > 0) {
      ctx.globalAlpha = vis;
      ctx.strokeStyle = 'rgba(100,116,139,.35)'; ctx.lineWidth = 0.8; ctx.beginPath();
      for (let i = -12; i < 12; i++) { ctx.moveTo(cx - r, cy + i * 9 + (i % 3)); ctx.lineTo(cx + r, cy + i * 9 - (i % 4) * 2); } ctx.stroke();
      const rad = 35, d = M.res.d, k = rad / (d / 2);
      const gr = ctx.createRadialGradient(cx - 6, cy - 6, 3, cx, cy, rad);
      gr.addColorStop(0, '#475569'); gr.addColorStop(1, '#0f172a');
      ctx.fillStyle = gr;
      if (M.method === 'brinell') { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill(); ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.2; ctx.stroke(); }
      else {
        ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx, cy - rad); ctx.lineTo(cx + rad, cy); ctx.lineTo(cx, cy + rad); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = 'rgba(248,250,252,.35)'; ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
      }
      const k1 = clamp(st.measureU * 2, 0, 1), k2 = clamp(st.measureU * 2 - 1, 0, 1);
      ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.fillStyle = '#a855f7';
      if (k1 > 0) { const L = rad * k1; ctx.beginPath(); ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - L, cy - 6); ctx.lineTo(cx - L, cy + 6); ctx.moveTo(cx + L, cy - 6); ctx.lineTo(cx + L, cy + 6); ctx.stroke(); }
      if (k2 > 0) { const L = rad * k2; ctx.strokeStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy + L); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 6, cy - L); ctx.lineTo(cx + 6, cy - L); ctx.moveTo(cx - 6, cy + L); ctx.lineTo(cx + 6, cy + L); ctx.stroke(); }
      void k;
      ctx.globalAlpha = 1;
    } else { ctx.fillStyle = '#64748b'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('MICROSCOPIO', cx, cy - 2); ctx.fillText('DE MEDIDA', cx, cy + 12); }
    ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  }

  /* ---------- gráficas ---------- */
  function niceTicks(min, max, n = 6) {
    const raw = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
    const step = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, arr = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) arr.push(v);
    return { arr, step };
  }
  function axes(ctx, W, H, o) {
    const m = o.m || { l: 58, r: 14, t: 16, b: 40 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = v => m.l + (v - o.xmin) / (o.xmax - o.xmin) * pw, Y = v => m.t + ph - (v - o.ymin) / (o.ymax - o.ymin) * ph;
    const tx = niceTicks(o.xmin, o.xmax, 7), ty = niceTicks(o.ymin, o.ymax, 5);
    const dx = Math.max(0, -Math.floor(Math.log10(tx.step) + 1e-9)), dy = Math.max(0, -Math.floor(Math.log10(ty.step) + 1e-9));
    ctx.font = `10.5px ${FONT}`; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.textAlign = 'center'; tx.arr.forEach(v => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.fillText(fmt(Math.abs(v) < 1e-9 ? 0 : v, dx), x, m.t + ph + 15); });
    ctx.textAlign = 'right'; ty.arr.forEach(v => { const y = Y(v); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.fillText(fmt(Math.abs(v) < 1e-9 ? 0 : v, dy), m.l - 6, y + 4); });
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `600 11.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(o.xl, m.l + pw / 2, H - 6);
    ctx.save(); ctx.translate(14, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yl, 0, 0); ctx.restore();
    return { X, Y, m, pw, ph };
  }

  function drawProc(st) {
    const M = S.model, ctx = pctx, W = 640, H = 300, ft = S.mode === 'Ft';
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const xmax = ft ? M.tTotal : M.hMax * 1.18, ymax = M.Fmax * 1.12;
    const A = axes(ctx, W, H, { xmin: 0, xmax, ymin: 0, ymax, xl: ft ? 'Tiempo t (s)' : 'Profundidad h (mm)', yl: 'Fuerza F (N)' });
    const px = s => A.X(ft ? s.t : s.h), py = s => A.Y(s.F);
    if (ft) {
      ctx.save(); ctx.beginPath(); ctx.rect(A.m.l, A.m.t, A.pw, A.ph); ctx.clip(); ctx.textAlign = 'center';
      M.phases.forEach(ph => {
        if (ph.dur <= 0) return; const x0 = A.X(ph.t0), x1 = A.X(ph.t0 + ph.dur), c = PHASE_META[ph.id].color;
        ctx.fillStyle = c + '14'; ctx.fillRect(x0, A.m.t, x1 - x0, A.ph); ctx.strokeStyle = c + '55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, A.m.t); ctx.lineTo(x0, A.m.t + A.ph); ctx.stroke();
        if (x1 - x0 > 44) { ctx.fillStyle = c; ctx.font = `700 9.5px ${FONT}`; ctx.fillText(PHASE_META[ph.id].short.toUpperCase(), (x0 + x1) / 2, A.m.t + 12); }
      }); ctx.restore();
    } else {
      [[M.hRes, M.method === 'rockwell' ? 'h res.' : 'h residual', '#16a34a'], [M.hMax, 'h máx', '#2563eb']].concat(M.method === 'rockwell' ? [[M.h0, 'h₀', '#0284c7']] : []).forEach(([h, l, c]) => {
        const x = A.X(h); ctx.setLineDash([4, 3]); ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, A.m.t); ctx.lineTo(x, A.m.t + A.ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = c; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(l, x, A.m.t + 11);
      });
      const xa = A.X(M.hRes), xb = A.X(M.hMax);
      if (xb - xa > 12) { arrow(ctx, xb, A.Y(M.Fmax * 0.06), xa, A.Y(M.Fmax * 0.06), '#16a34a', 1.5, 5); ctx.fillStyle = '#15803d'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('recup. elástica', (xa + xb) / 2, A.Y(M.Fmax * 0.06) - 5); }
    }
    ctx.lineWidth = 2; ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); M.samples.forEach((s, i) => i ? ctx.lineTo(px(s), py(s)) : ctx.moveTo(px(s), py(s))); ctx.stroke();
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let cur = null; ctx.beginPath();
    for (const s of M.samples) {
      if (s.p > st.p) break;
      if (s.phase !== cur) { if (cur) { ctx.lineTo(px(s), py(s)); ctx.stroke(); } cur = s.phase; ctx.strokeStyle = PHASE_META[cur].color; ctx.beginPath(); ctx.moveTo(px(s), py(s)); } else ctx.lineTo(px(s), py(s));
    }
    const X = ft ? A.X(st.t) : A.X(st.h), Y = A.Y(st.F); ctx.lineTo(X, Y); ctx.stroke();
    ctx.fillStyle = PHASE_META[st.phase].color + '33'; ctx.beginPath(); ctx.arc(X, Y, 10, 0, 7); ctx.fill();
    ctx.fillStyle = PHASE_META[st.phase].color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, 7); ctx.fill(); ctx.stroke();
    halo(ctx, 'F máx = ' + fmt(M.Fmax, 0) + ' N', A.m.l + 8, A.Y(M.Fmax) - 6, '#334155', `600 10.5px ${FONT}`, 'left');
  }

  function drawRel(st) {
    const M = S.model, ctx = rctx, W = 440, H = 300, r = M.res;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    let f, x0, x1, ymax, xl, yl, valid = null, xm, ym, sens;
    if (M.method === 'brinell') {
      const D = r.D; f = d => 2 * r.Fk / (Math.PI * D * (D - Math.sqrt(Math.max(0, D * D - d * d))));
      x0 = 0.2 * D; x1 = 0.7 * D; ymax = Math.min(f(x0), r.HB * 3.2); xl = 'Diámetro de huella d (mm)'; yl = 'Dureza HBW';
      valid = [0.24 * D, 0.6 * D]; xm = r.d; ym = r.HB;
      const dd = 0.02, dh = Math.abs(f(r.d + dd) - r.HB);
      sens = `Un error de lectura de ±0,02 mm en d supone ≈ ±${fmt(dh, 1)} HBW (±${fmt(dh / r.HB * 100, 1)} %). La zona verde es el margen válido 0,24·D – 0,6·D.`;
    } else if (M.method === 'vickers') {
      f = d => 1.8544 * r.Fk / (d * d); x0 = r.d * 0.5; x1 = r.d * 1.8; ymax = f(x0); xl = 'Diagonal media d (mm)'; yl = 'Dureza HV'; xm = r.d; ym = r.HV;
      const dd = 0.002, dh = Math.abs(f(r.d + dd) - r.HV);
      sens = `HV depende de 1/d²: un error de ±2 µm en la diagonal supone ≈ ±${fmt(dh, 1)} HV (±${fmt(dh / r.HV * 100, 1)} %). Las huellas pequeñas (carga baja) son más sensibles.`;
    } else {
      const N = r.N; f = e => N - e / 0.002; x0 = 0; x1 = (N - 5) * 0.002; ymax = N; xl = 'Profundidad permanente e (mm)'; yl = 'Lectura ' + r.sc.name;
      valid = null; xm = r.e; ym = r.HR; sens = `Cada 0,002 mm de profundidad equivale a 1 punto de dureza. El campo válido de ${r.sc.name} es ${r.sc.min} – ${r.sc.max} (zona verde).`;
    }
    const A = axes(ctx, W, H, { xmin: x0, xmax: x1, ymin: M.method === 'rockwell' ? 0 : 0, ymax: ymax * 1.05, xl, yl, m: { l: 52, r: 12, t: 14, b: 38 } });
    ctx.save(); ctx.beginPath(); ctx.rect(A.m.l, A.m.t, A.pw, A.ph); ctx.clip();
    if (valid) { ctx.fillStyle = 'rgba(16,185,129,.12)'; ctx.fillRect(A.X(valid[0]), A.m.t, A.X(valid[1]) - A.X(valid[0]), A.ph); ctx.fillStyle = 'rgba(239,68,68,.07)'; ctx.fillRect(A.m.l, A.m.t, A.X(valid[0]) - A.m.l, A.ph); ctx.fillRect(A.X(valid[1]), A.m.t, A.m.l + A.pw - A.X(valid[1]), A.ph); }
    else if (M.method === 'rockwell') { ctx.fillStyle = 'rgba(16,185,129,.12)'; ctx.fillRect(A.m.l, A.Y(r.sc.max), A.pw, A.Y(r.sc.min) - A.Y(r.sc.max)); }
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const x = lerp(x0, x1, i / 120), y = f(x); i ? ctx.lineTo(A.X(x), A.Y(y)) : ctx.moveTo(A.X(x), A.Y(y)); } ctx.stroke();
    ctx.restore();
    const show = st.p >= M.pRead;
    const X = A.X(xm), Y = A.Y(ym);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, A.m.t + A.ph); ctx.moveTo(X, Y); ctx.lineTo(A.m.l, Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = show ? 1 : 0.35;
    ctx.fillStyle = '#7c3aed'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7); ctx.fill(); ctx.stroke();
    halo(ctx, `${fmt(ym, M.method === 'vickers' || M.method === 'brinell' ? 0 : 1)} ${r.unit}`, X + 9, Y - 9, '#5b21b6', `700 11px ${FONT}`);
    ctx.globalAlpha = 1;
    $('hSens').textContent = sens;
  }

  function drawScale() {
    const M = S.model, ctx = kctx, W = 440, H = 140;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const l = 20, w = W - 40, lo = Math.log10(5), hi = Math.log10(1500), X = hv => l + (Math.log10(hv) - lo) / (hi - lo) * w, y0 = 66, bh = 14;
    const g = ctx.createLinearGradient(l, 0, l + w, 0); g.addColorStop(0, '#bfdbfe'); g.addColorStop(.5, '#fde68a'); g.addColorStop(1, '#fca5a5');
    ctx.fillStyle = g; rr(ctx, l, y0, w, bh, 7); ctx.fill();
    ctx.font = `9.5px ${FONT}`; ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
    [10, 100, 1000].forEach(v => { ctx.fillText(v + ' HV', X(v), y0 + bh + 12); ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(X(v), y0 + bh); ctx.lineTo(X(v), y0 + bh + 3); ctx.stroke(); });
    const SH = { alpuro: 'Al puro', cu: 'Cu', laton: 'Latón', acdulce: 'Ac. dulce', ac045: 'Ac. 0,45C', acbon: 'Ac. bonif.', acherr: 'Templado', al6061: 'Al 6061', bronce: 'Bronce', fgris: 'F. gris', ti64: 'Ti-6Al-4V' };
    const refs = Object.entries(MATERIALS).filter(([k]) => ['alpuro', 'cu', 'laton', 'acdulce', 'ac045', 'acbon', 'acherr'].includes(k)).sort((a, b) => a[1].hv - b[1].hv);
    refs.forEach(([k, m], i) => {
      const x = X(m.hv), lv = i % 4, up = lv % 2 === 0, far = lv > 1;
      const yEnd = up ? y0 - 6 - (far ? 16 : 0) : y0 + bh + 20 + (far ? 16 : 0);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, up ? y0 : y0 + bh); ctx.lineTo(x, up ? yEnd + 2 : yEnd - 9); ctx.stroke();
      ctx.fillStyle = '#475569'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(SH[k], x, up ? yEnd : yEnd + 1);
    });
    const x = X(clamp(M.hv, 5, 1500));
    ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.moveTo(x, y0 + 1); ctx.lineTo(x - 5, y0 - 8); ctx.lineTo(x + 5, y0 - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b21b6'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(fmt(M.hv, 0) + ' HV', clamp(x, 28, W - 28), 12);
  }

  /* =================================================================
     RENDER
  ================================================================= */
  function renderHero(M, revealed) {
    const r = M.res, ok = r.ok;
    const badge = ok ? '<span class="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">ENSAYO VÁLIDO</span>' : `<span class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white">NO VÁLIDO · ${r.nFail} condición${r.nFail > 1 ? 'es' : ''}</span>`;
    const warn = M.checks.some(k => k.ok === 'warn');
    const failed = M.checks.filter(k => k.ok === false).map(k => `<li>${k.hint}</li>`).join('');
    const msg = ok ? `Se cumplen las condiciones de la norma ${NORMS[M.method]}${warn ? ' (con avisos)' : ''}: el valor obtenido es representativo.`
      : `El resultado no es fiable. Qué corregir:<ul class="mt-1 list-inside list-disc text-slate-600">${failed}</ul>`;
    $('hHero').innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3">
      <div><div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado · ${METHOD_NAME[M.method]}</div>
      <div class="mt-0.5 font-mono text-4xl font-bold ${revealed ? 'text-slate-900' : 'text-slate-300'}">${revealed ? r.designation : '— — —'}</div>
      <div class="text-xs text-slate-500">${revealed ? `≈ ${fmt(M.hv, 0)} HV · ${M.cfg.mat.name}` : 'Se obtiene al medir la huella'}</div></div>
      <div class="max-w-md text-sm"><div class="mb-1">${badge}</div><div class="text-slate-700">${msg}</div></div></div>`;
  }

  function render() {
    const M = S.model; if (!M || LAB.active !== 'hard') return;
    const st = M.state(S.p), r = M.res, pm = PHASE_META[st.phase];
    drawSpec(st); drawProc(st); drawRel(st); drawScale();
    $('hF').textContent = fmt(st.F, 0); $('hH').textContent = fmt(st.h, 3); $('hT').textContent = mmss(st.t);
    const measured = S.p >= M.pRead;
    let dTxt = '—';
    if (M.method === 'rockwell') dTxt = st.phase === 'reading' || st.phase === 'withdraw' ? fmt(st.reading, 1) + ' ' + r.sc.name : '—';
    else if (st.phase === 'measure') dTxt = fmt(r.d * clamp(st.measureU * 2.2, 0, 1), M.method === 'brinell' ? 3 : 4) + ' mm';
    $('hD').textContent = dTxt;
    $('hSeek').value = Math.round(S.p * 1000);
    const b = $('hBadge'); b.style.background = pm.color; b.textContent = pm.label.toUpperCase();
    const [t, tx, fm] = explainH(M, st);
    $('hExTitle').textContent = t; $('hExText').textContent = tx; $('hExFormula').textContent = fm; $('hExp').style.borderColor = pm.color;
    $('hChips').querySelectorAll('button').forEach(btn => { const on = btn.dataset.id === st.phase, c = PHASE_META[btn.dataset.id].color; btn.style.background = on ? c : '#fff'; btn.style.color = on ? '#fff' : c; btn.style.borderColor = c; });
    paramRows.forEach(pr => { pr.row.style.opacity = (pr.rev === 0 || S.p >= pr.rev) ? 1 : 0.28; });
    if (lastRevealed !== measured) { renderHero(M, measured); lastRevealed = measured; }
  }

  /* =================================================================
     ARRANQUE (modelo por defecto, sin mostrar aún)
  ================================================================= */
  mSel.value = 'acdulce'; fillMat('acdulce'); syncForm(); setMode('Ft');
  apply(readCfg().cfg);
})();
