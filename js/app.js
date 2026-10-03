/* Interfaz: configuración, simulación de la máquina (canvas) y diagrama de tracción */
(function () {
  'use strict';
  const { ZONES, PRESETS, buildModel } = window.TensileModel;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const fmt = (x, d = 1) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  const DURATION = 26;          // s de simulación a 1×
  window.LAB = window.LAB || { active: 'tens' };
  const state = { model: null, p: 0, playing: false, dir: 1, speed: 1, mode: 'se', zoom: false, notes: true, last: 0 };

  /* ===================================================================
     TEXTOS
  =================================================================== */
  function explain(M, st) {
    const brittle = M.kind === 'brittle';
    switch (st.zone) {
      case 'elastic': return brittle
        ? ['Comportamiento elástico-frágil', 'El material se deforma de forma casi lineal y reversible hasta que, sin avisar, rompe. No hay zona plástica apreciable: la rotura es súbita.', 'σ ≈ E · ε']
        : ['Zona elástica · Ley de Hooke', 'La deformación es proporcional a la tensión y reversible: si se descargase ahora, la probeta recuperaría su longitud inicial. La pendiente de la recta es el módulo de Young E.', 'σ = E · ε'];
      case 'yield': return M.kind === 'yield'
        ? ['Fluencia', 'Se supera el límite elástico: la tensión cae de ReH (superior) a ReL (inferior) y la probeta se alarga sin apenas aumentar la carga. Aparecen bandas de Lüders; la deformación ya es permanente.', 'Re = F_e / S₀']
        : ['Transición elastoplástica', 'Este material no presenta fluencia marcada: se usa el límite elástico convencional Rp0,2 (tensión que deja una deformación remanente del 0,2 %). La curva se separa de la recta de Hooke.', 'Rp0,2 → ε_plástica = 0,2 %'];
      case 'hardening': return ['Endurecimiento por deformación (acritud)', 'La deformación plástica es uniforme a lo largo de la zona calibrada. El material endurece y necesita más carga para seguir deformándose, hasta alcanzar la carga máxima Fm.', 'Rm = F_m / S₀'];
      case 'necking': return ['Estricción', 'Se alcanzó Rm: la deformación se localiza en una zona y la sección se estrecha rápidamente. La tensión ingenieril (F/S₀) disminuye aunque el material sigue endureciendo, hasta la rotura.', 'Z = (S₀ − S_u) / S₀ · 100'];
      default: return brittle
        ? ['Rotura frágil', 'Fractura súbita con superficie plana y sin estricción. La carga cae a cero de golpe.', 'A = (L_u − L₀) / L₀ · 100']
        : ['Rotura dúctil (copa y cono)', 'La probeta rompe por la sección estrechada con la típica superficie «copa y cono». Se descarga elásticamente (línea paralela a Hooke) y queda la deformación permanente; con ella se obtienen A y Z.', 'A = (L_u − L₀) / L₀ · 100'];
    }
  }

  const FORMULAS = [
    ['σ = F / S₀', 'Tensión (ingenieril)', ['σ: tensión normal (MPa = N/mm²)', 'F: fuerza axial aplicada (N)', 'S₀: sección inicial de la probeta (mm²)']],
    ['ε = ΔL / L₀', 'Deformación unitaria', ['ε: deformación (adimensional, o en %)', 'ΔL = L − L₀: alargamiento medido con extensómetro (mm)', 'L₀: longitud inicial entre marcas (mm)']],
    ['σ = E · ε   (Ley de Hooke)', 'Zona elástica', ['E: módulo de elasticidad o de Young (GPa), pendiente de la recta', 'Válida hasta el límite de proporcionalidad σp']],
    ['L₀ = k · √S₀', 'Longitud de referencia (probeta proporcional)', ['k = 5,65 (probeta normal) ó 11,3 (probeta larga)', 'S₀: sección inicial (mm²)']],
    ['S₀ = π·d₀² / 4   |   S₀ = a₀ · b₀', 'Sección cilíndrica / prismática', ['d₀: diámetro (mm)', 'a₀, b₀: espesor y ancho (mm)']],
    ['A = (L_u − L₀) / L₀ · 100', 'Alargamiento de rotura (%)', ['L_u: longitud final entre marcas tras romper (mm)', 'Mide la ductilidad del material']],
    ['Z = (S₀ − S_u) / S₀ · 100', 'Estricción (%)', ['S_u: sección mínima tras la rotura (mm²)', 'Otra medida de ductilidad']],
    ['σ_adm = Re / n', 'Tensión máxima de trabajo', ['Re: límite elástico (ReH o Rp0,2), o Rm si el material es frágil', 'n: coeficiente de seguridad', 'Si σ_trab ≤ σ_adm la pieza trabaja en zona elástica']],
    ['n = Re / σ_trab', 'Coeficiente de seguridad real', ['σ_trab: tensión de trabajo prevista (MPa)', 'Debe cumplirse n_real ≥ n requerido']],
    ['U_r = Re² / (2·E)', 'Módulo de resiliencia elástica', ['Energía por unidad de volumen que el material absorbe sin deformarse permanentemente (MJ/m³)']],
  ];

  const VOCAB = [
    ['Probeta', 'Muestra normalizada del material que se ensaya.'],
    ['Mordazas', 'Elementos de la máquina que sujetan los extremos (cabezas) de la probeta.'],
    ['Célula de carga', 'Sensor que mide la fuerza F que transmite la máquina.'],
    ['Extensómetro', 'Instrumento que mide el alargamiento ΔL entre dos marcas (base L₀).'],
    ['Cruceta móvil', 'Parte de la máquina que se desplaza y estira la probeta a velocidad controlada.'],
    ['Zona calibrada (Lc)', 'Parte central y de sección constante de la probeta donde se mide la deformación.'],
    ['Elasticidad', 'Capacidad de recuperar la forma al retirar la carga.'],
    ['Plasticidad', 'Deformación permanente que queda tras superar el límite elástico.'],
    ['Límite de proporcionalidad σp', 'Tensión hasta la que σ y ε son proporcionales (Hooke).'],
    ['Límite elástico Re', 'Tensión a partir de la cual hay deformación permanente. ReH superior / ReL inferior.'],
    ['Rp0,2', 'Límite elástico convencional: tensión que produce 0,2 % de deformación permanente.'],
    ['Resistencia a tracción Rm', 'Tensión máxima soportada: Fm / S₀.'],
    ['Fluencia', 'Alargamiento plástico a carga casi constante (aceros dulces).'],
    ['Acritud', 'Endurecimiento del metal al deformarse plásticamente en frío.'],
    ['Estricción', 'Estrechamiento localizado de la sección antes de romper.'],
    ['Ductilidad', 'Capacidad de deformarse plásticamente antes de romper (alto A y Z).'],
    ['Fragilidad', 'Rotura sin deformación plástica apreciable.'],
    ['Tenacidad', 'Energía absorbida hasta la rotura (área bajo la curva σ-ε).'],
    ['Coeficiente de Poisson ν', 'Relación entre contracción lateral y alargamiento axial (≈ 0,3 elástico; 0,5 plástico).'],
    ['Coeficiente de seguridad n', 'Margen entre el límite elástico y la tensión de trabajo.'],
  ];

  /* ===================================================================
     CONFIGURACIÓN
  =================================================================== */
  const F = {};   // referencias a campos
  ['vel', 'd0', 'a0', 'b0', 'kSel', 'matSel', 'mKind', 'mE', 'mRe', 'mReL', 'mRm', 'mA', 'mZ', 'nSeg', 'sTrab'].forEach(id => F[id] = $(id));
  const shapeVal = () => document.querySelector('input[name=shape]:checked').value;

  Object.entries(PRESETS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.name; F.matSel.appendChild(o); });

  function fillMaterial(key) {
    const p = PRESETS[key];
    F.mKind.value = p.kind; F.mE.value = p.E; F.mRe.value = p.Re || ''; F.mReL.value = p.ReL || '';
    F.mRm.value = p.Rm; F.mA.value = p.A; F.mZ.value = p.Z;
    F.sTrab.value = p.St ? +p.St.toFixed(1) : Math.round((p.kind === 'brittle' ? p.Rm : p.Re) * 0.4 / 5) * 5;
    syncKindFields();
  }
  function syncKindFields() {
    const k = F.mKind.value;
    $('gReL').style.display = k === 'yield' ? '' : 'none';
    $('gRe').style.display = k === 'brittle' ? 'none' : '';
    $('gZ').style.display = k === 'brittle' ? 'none' : '';
    $('lRe').textContent = k === 'yield' ? 'ReH (MPa)' : 'Rp0,2 (MPa)';
  }
  function syncShape() {
    const cyl = shapeVal() === 'cyl';
    $('fCyl').style.display = cyl ? '' : 'none';
    const fp = $('fPrism'); fp.classList.toggle('hidden', cyl); fp.classList.toggle('grid', !cyl);
    updatePreview();
  }
  function geomFromForm() {
    const shape = shapeVal(), k = parseFloat(F.kSel.value);
    const d0 = +F.d0.value, a0 = +F.a0.value, b0 = +F.b0.value;
    const S0 = shape === 'cyl' ? Math.PI * d0 * d0 / 4 : a0 * b0;
    let L0 = k * Math.sqrt(S0); const r = Math.round(L0 / 5) * 5; if (r > 0 && Math.abs(r - L0) <= 0.1 * L0) L0 = r;
    const Lc = shape === 'cyl' ? L0 + d0 / 2 : L0 + 1.5 * Math.sqrt(S0);
    return { shape, k, d0, a0, b0, S0, L0, Lc };
  }
  function updatePreview() {
    const g = geomFromForm();
    $('pvS0').textContent = isFinite(g.S0) ? fmt(g.S0, 1) + ' mm²' : '—';
    $('pvL0').textContent = isFinite(g.L0) ? fmt(g.L0, 1) + ' mm' : '—';
    $('pvLc').textContent = isFinite(g.Lc) ? fmt(g.Lc, 1) + ' mm' : '—';
  }

  function readConfig() {
    const g = geomFromForm();
    const kind = F.mKind.value;
    const mat = {
      name: PRESETS[F.matSel.value].name, kind, color: PRESETS[F.matSel.value].color,
      E: +F.mE.value, Re: +F.mRe.value, ReL: +F.mReL.value, Rm: +F.mRm.value, A: +F.mA.value, Z: +F.mZ.value,
    };
    const errs = [];
    if (g.shape === 'cyl') { if (!(g.d0 >= 3 && g.d0 <= 40)) errs.push('El diámetro debe estar entre 3 y 40 mm.'); }
    else {
      if (!(g.a0 >= 1 && g.b0 >= 3)) errs.push('Espesor y ancho no válidos.');
      else if (g.b0 / g.a0 > 8 || g.b0 / g.a0 < 1) errs.push('Relación ancho/espesor recomendada: entre 1 y 8.');
    }
    if (!(mat.E > 0 && mat.Rm > 0 && mat.A > 0)) errs.push('E, Rm y A deben ser positivos.');
    if (kind !== 'brittle' && !(mat.Re > 0)) errs.push('Indica el límite elástico (Re).');
    if (!(+F.nSeg.value >= 1)) errs.push('El coeficiente de seguridad debe ser ≥ 1.');
    if (!(+F.vel.value > 0)) errs.push('La velocidad debe ser positiva.');
    return { errs, cfg: Object.assign({ n: +F.nSeg.value, sigTrab: +F.sTrab.value || 0, v: +F.vel.value, mat }, g) };
  }

  const dlg = $('cfg');
  $('btnCfg').onclick = () => { setPlaying(false); dlg.showModal(); };
  $('cfgClose').onclick = $('cfgCancel').onclick = () => dlg.close();
  document.querySelectorAll('input[name=shape]').forEach(r => r.onchange = syncShape);
  ['d0', 'a0', 'b0', 'kSel'].forEach(id => F[id].oninput = updatePreview);
  F.matSel.onchange = () => fillMaterial(F.matSel.value);
  F.mKind.onchange = () => { F.matSel.value = 'custom'; syncKindFields(); };
  ['mE', 'mRe', 'mReL', 'mRm', 'mA', 'mZ'].forEach(id => F[id].addEventListener('input', () => { if (F.matSel.value !== 'custom') F.matSel.value = 'custom'; }));

  $('cfgForm').addEventListener('submit', e => {
    e.preventDefault();
    const { errs, cfg } = readConfig();
    const box = $('cfgErr');
    if (errs.length) { box.textContent = errs.join(' '); box.classList.remove('hidden'); return; }
    box.classList.add('hidden');
    dlg.close();
    apply(cfg);
    setPlaying(true);
  });

  /* ===================================================================
     APLICAR CONFIGURACIÓN
  =================================================================== */
  function apply(cfg) {
    const M = buildModel(cfg);
    state.model = M; state.p = 0; state.dir = 1;
    if (M.kind === 'brittle') state.zoom = false;
    $('tZoom').checked = state.zoom; $('tZoom').disabled = M.kind === 'brittle';
    const shapeTxt = cfg.shape === 'cyl' ? `Cilíndrica Ø${fmt(cfg.d0, 1)} mm` : `Prismática ${fmt(cfg.b0, 1)}×${fmt(cfg.a0, 1)} mm`;
    $('hMat').textContent = cfg.mat.name;
    $('hSpec').textContent = shapeTxt;
    $('hL0').textContent = fmt(M.L0, 1) + ' mm  (k=' + fmt(cfg.k, 2) + ')';
    $('hS0').textContent = fmt(M.S0, 1) + ' mm²';
    $('hE').textContent = fmt(cfg.mat.E, 0) + ' GPa';
    $('hRe').textContent = M.kind === 'brittle' ? '—' : fmt(M.Re, 0) + ' MPa';
    $('hRm').textContent = fmt(M.Rm, 0) + ' MPa';
    $('hV').textContent = fmt(cfg.v, 1) + ' mm/min';
    buildChips(M); buildResults(M); buildSafety(M);
    if (M.warnings.length) console.warn(M.warnings.join(' '));
    render();
  }

  function buildChips(M) {
    const box = $('zoneChips'); box.innerHTML = '';
    M.zoneList.forEach(z => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.z = z;
      b.className = 'rounded-full border px-3 py-1 text-xs font-semibold transition';
      b.textContent = (M.kind === 'brittle' && z === 'elastic') ? 'Elástica (hasta rotura)' : ZONES[z].short;
      b.onclick = () => { setPlaying(false); state.p = clamp(M.zb[z][0] + (z === 'rupture' ? 0.002 : 0.04 * (M.zb[z][1] - M.zb[z][0])), 0, 1); render(); };
      box.appendChild(b);
    });
  }

  /* ===================================================================
     RESULTADOS / SEGURIDAD
  =================================================================== */
  let resultRows = [];
  function buildResults(M) {
    const r = M.results, zb = M.zb, brittle = M.kind === 'brittle';
    const yMid = M.kind === 'yield' ? lerp(zb.yield[0], zb.yield[1], 0.3) : (zb.yield ? zb.yield[1] : 0);
    const eEnd = zb.elastic[1];
    const rows = [
      ['E', 'Módulo de elasticidad E', fmt(r.E, 1) + ' GPa', eEnd * 0.6, ZONES.elastic.color],
    ];
    if (!brittle) rows.push([M.kind === 'yield' ? 'σp ≈ ReH' : 'σp', 'Límite de proporcionalidad', fmt(r.sigP, 0) + ' MPa', eEnd, ZONES.elastic.color]);
    if (M.kind === 'yield') {
      rows.push(['ReH', 'Límite elástico superior', fmt(r.Re, 0) + ' MPa', yMid, ZONES.yield.color]);
      rows.push(['ReL', 'Límite elástico inferior', fmt(r.ReL, 0) + ' MPa', yMid, ZONES.yield.color]);
    } else if (M.kind === 'smooth') rows.push(['Rp0,2', 'Límite elástico convencional', fmt(r.Re, 0) + ' MPa', zb.yield[1], ZONES.yield.color]);
    const pMax = brittle ? M.pR : zb.necking[0];
    rows.push(['Rm', 'Resistencia a tracción', fmt(r.Rm, 0) + ' MPa', pMax, ZONES.hardening.color]);
    rows.push(['Fm', 'Carga máxima', fmt(r.Fm, 2) + ' kN', pMax, ZONES.hardening.color]);
    rows.push(['A', 'Alargamiento de rotura', fmt(r.A, 1) + ' %', M.pR, ZONES.necking.color]);
    if (!brittle) rows.push(['Z', 'Estricción', fmt(r.Z, 1) + ' %  (S_u = ' + fmt(r.Su, 1) + ' mm²)', M.pR, ZONES.necking.color]);
    rows.push(['L_u', 'Longitud final entre marcas', fmt(r.Lu, 1) + ' mm', M.pR, ZONES.rupture.color]);
    if (!brittle) rows.push(['U_r', 'Resiliencia elástica', fmt(r.Ur, 2) + ' MJ/m³', eEnd, ZONES.elastic.color]);
    rows.push(['U_f', 'Tenacidad (área bajo σ-ε)', fmt(r.Uf, 1) + ' MJ/m³', M.pR, ZONES.rupture.color]);

    const box = $('results'); box.innerHTML = '';
    resultRows = rows.map(([sym, label, val, reveal, color]) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 py-1.5 transition-opacity duration-300';
      row.innerHTML = `<span class="w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-bold text-white" style="background:${color}">${sym}</span><span class="flex-1 text-slate-600">${label}</span><span class="font-mono font-semibold text-slate-800">${val}</span>`;
      box.appendChild(row);
      return { row, reveal };
    });
  }

  function buildSafety(M) {
    const r = M.results, brittle = M.kind === 'brittle';
    const reName = brittle ? 'Rm' : (M.kind === 'yield' ? 'ReH' : 'Rp0,2');
    const ok = r.sigTrab <= r.sigAdm, elastic = r.sigTrab <= r.ReSafe;
    let badge, cls, msg;
    if (!(r.sigTrab > 0)) { badge = 'Sin σ_trab'; cls = 'bg-slate-500'; msg = 'Indica una tensión de trabajo en la configuración para verificar la seguridad.'; }
    else if (ok) { badge = 'CUMPLE'; cls = 'bg-emerald-600'; msg = `σ_trab no supera σ_adm: la pieza trabaja en zona elástica con n = ${fmt(r.nReal, 2)} ≥ ${fmt(M.cfg.n, 2)}.`; }
    else if (elastic) { badge = 'NO CUMPLE n'; cls = 'bg-amber-600'; msg = `σ_trab < ${reName}, pero el coeficiente real (${fmt(r.nReal, 2)}) es menor que el requerido (${fmt(M.cfg.n, 2)}).`; }
    else { badge = 'SUPERA EL LÍMITE'; cls = 'bg-red-600'; msg = `σ_trab > ${reName}: se sale de la zona elástica y habría deformación permanente (o rotura).`; }
    const pct = v => clamp(v / M.Rm * 100, 0, 100);
    $('safety').innerHTML = `
      <div class="grid grid-cols-2 gap-2 text-center">
        <div class="rounded-lg bg-slate-50 p-2"><div class="text-[11px] text-slate-500">σ_adm = ${reName}/n</div><div class="font-mono text-lg font-bold text-emerald-700">${fmt(r.sigAdm, 0)} <small class="text-xs">MPa</small></div></div>
        <div class="rounded-lg bg-slate-50 p-2"><div class="text-[11px] text-slate-500">F_adm = σ_adm·S₀</div><div class="font-mono text-lg font-bold text-emerald-700">${fmt(r.FAdm, 2)} <small class="text-xs">kN</small></div></div>
        <div class="rounded-lg bg-slate-50 p-2"><div class="text-[11px] text-slate-500">σ_trab prevista</div><div class="font-mono text-lg font-bold">${r.sigTrab > 0 ? fmt(r.sigTrab, 0) : '—'} <small class="text-xs">MPa</small></div></div>
        <div class="rounded-lg bg-slate-50 p-2"><div class="text-[11px] text-slate-500">n real = ${reName}/σ_trab</div><div class="font-mono text-lg font-bold">${r.nReal ? fmt(r.nReal, 2) : '—'}</div></div>
      </div>
      <div><span class="inline-block rounded-md px-2.5 py-1 text-xs font-bold text-white ${cls}">${badge}</span> <span class="text-slate-600">${msg}</span></div>
      <div>
        <div class="mb-1 flex justify-between text-[11px] text-slate-500"><span>Tensión durante el ensayo</span><span id="liveSig" class="font-mono"></span></div>
        <div class="relative h-4 overflow-hidden rounded-full bg-slate-200">
          <div class="absolute inset-y-0 left-0 bg-emerald-200" style="width:${pct(r.sigAdm)}%"></div>
          <div class="absolute inset-y-0 bg-amber-200" style="left:${pct(r.sigAdm)}%;width:${pct(r.ReSafe) - pct(r.sigAdm)}%"></div>
          <div class="absolute inset-y-0 bg-red-100" style="left:${pct(r.ReSafe)}%;right:0"></div>
          <div id="liveBar" class="absolute inset-y-0 left-0 w-0 rounded-full bg-emerald-600"></div>
          ${r.sigTrab > 0 ? `<div class="absolute -inset-y-0 w-0.5 bg-slate-900" style="left:${pct(r.sigTrab)}%" title="σ_trab"></div>` : ''}
        </div>
        <div class="mt-1 flex justify-between text-[10px] text-slate-500"><span class="text-emerald-700">● seguro (≤ σ_adm)</span><span class="text-amber-700">● elástico sin margen</span><span class="text-red-600">● plástico</span></div>
      </div>`;
  }

  /* ===================================================================
     SIMULACIÓN: bucle y controles
  =================================================================== */
  function setPlaying(on, dir) {
    if (dir) state.dir = dir;
    if (on && state.p >= 1 && state.dir > 0) state.p = 0;
    if (on && state.p <= 0 && state.dir < 0) state.p = 1;
    state.playing = on; state.last = performance.now();
    const fwd = on && state.dir > 0;
    $('tPlay').textContent = fwd ? 'Pausa' : 'Reproducir';
    $('icPlay').innerHTML = fwd ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M6 4l14 8-14 8z"/>';
    $('bRev').classList.toggle('bg-blue-100', on && state.dir < 0);
    if (on) requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min(0.1, (now - state.last) / 1000); state.last = now;
    state.p += state.dir * dt / DURATION * state.speed;
    if (state.p >= 1) { state.p = 1; setPlaying(false); }
    else if (state.p <= 0) { state.p = 0; setPlaying(false); }
    render();
    if (state.playing) requestAnimationFrame(tick);
  }
  const STEP = 0.006;
  $('bPlay').onclick = () => setPlaying(!(state.playing && state.dir > 0), 1);
  $('bRev').onclick = () => (state.playing && state.dir < 0) ? setPlaying(false) : setPlaying(true, -1);
  $('bStart').onclick = () => { setPlaying(false); state.p = 0; render(); };
  $('bEnd').onclick = () => { setPlaying(false); state.p = 1; render(); };
  $('bBack').onclick = () => { setPlaying(false); state.p = clamp(state.p - STEP, 0, 1); render(); };
  $('bFwd').onclick = () => { setPlaying(false); state.p = clamp(state.p + STEP, 0, 1); render(); };
  $('speed').onchange = e => state.speed = +e.target.value;
  $('seek').oninput = e => { setPlaying(false); state.p = +e.target.value / 1000; render(); };
  $('mSE').onclick = () => setMode('se');
  $('mFD').onclick = () => setMode('fd');
  $('tZoom').onchange = e => { state.zoom = e.target.checked; render(); };
  $('tNotes').onchange = e => { state.notes = e.target.checked; render(); };
  function setMode(m) {
    state.mode = m;
    $('mSE').className = 'px-2.5 py-1 font-semibold ' + (m === 'se' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100');
    $('mFD').className = 'px-2.5 py-1 font-semibold ' + (m === 'fd' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100');
    render();
  }
  window.addEventListener('keydown', e => {
    if (window.LAB.active !== 'tens' || dlg.open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); $('bPlay').click(); }
    else if (e.code === 'ArrowRight') $('bFwd').click();
    else if (e.code === 'ArrowLeft') $('bBack').click();
    else if (e.code === 'Home') $('bStart').click();
    else if (e.code === 'End') $('bEnd').click();
  });

  /* ===================================================================
     CANVAS
  =================================================================== */
  function setupCanvas(cv, w, h) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.aspectRatio = w + ' / ' + h;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  const SW = 560, SH = 660, DW = 680, DH = 440;
  const sctx = setupCanvas($('cvSpec'), SW, SH);
  const dctx = setupCanvas($('cvDiag'), DW, DH);
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function arrow(ctx, x1, y1, x2, y2, color, w = 2, head = 7) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4)); ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  const sigmoid = x => 1 / (1 + Math.exp(-x));

  /* ---------- Probeta + máquina ---------- */
  function drawSpecimen(st) {
    const M = state.model, ctx = sctx, cx = 280;
    ctx.clearRect(0, 0, SW, SH);
    const zc = ZONES[st.zone].color;
    const cyl = M.cfg.shape === 'cyl', brittle = M.kind === 'brittle';

    // fondo tipo plano técnico
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, SW, SH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= SW; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, SH); }
    for (let y = 0; y <= SH; y += 28) { ctx.moveTo(0, y); ctx.lineTo(SW, y); }
    ctx.stroke();

    // --- geometría ---
    const Hc0 = 190, yP = 176, yTop = 100;
    const pxmm = Hc0 / M.Lc;
    const hw0 = clamp((cyl ? M.cfg.d0 : M.cfg.b0) * pxmm / 2, 12, 40);
    const hwh = Math.min(62, hw0 * 1.45 + 6);
    const eps = st.epsSpec;
    const vis = e => M.evMax * Math.pow(clamp(e / M.epsR, 0, 1), 0.4);
    const ev = vis(eps), evU = vis(Math.min(eps, M.epsU));
    const nu = brittle ? 0.3 : st.zone === 'elastic' ? 0.3 : st.zone === 'yield' ? 0.3 + 0.2 * st.u : 0.5;
    const wu = Math.pow(1 + evU, -nu);
    const uN = brittle ? 0 : st.zone === 'necking' ? st.u : st.ruptured ? 1 : 0;
    const wnFinal = Math.sqrt(1 - M.Z) / wu;
    const wnRel = lerp(1, wnFinal, ease(uN));
    const sigN = s => (sigmoid((s - 0.5) / 0.07) - sigmoid(-0.5 / 0.07)) / (sigmoid(0.5 / 0.07) - sigmoid(-0.5 / 0.07));
    const yAt = s => yP + Hc0 * s + Hc0 * evU * s + Hc0 * (ev - evU) * sigN(s);
    const hwAt = s => hw0 * wu * (1 - (1 - wnRel) * Math.exp(-Math.pow((s - 0.5) / 0.1, 2)));
    const sepPx = st.ruptured ? 34 * ease(Math.min(1, st.sep * 1.6)) : 0;

    // puntos del contorno
    const pts = []; let iMid = 0;
    pts.push({ y: yTop, hw: hwh }, { y: yP - 26, hw: hwh });
    for (let i = 1; i <= 8; i++) { const t = i / 8, e = t * t * (3 - 2 * t); pts.push({ y: yP - 26 + 26 * t, hw: lerp(hwh, hwAt(0), e) }); }
    const NS = 70;
    for (let i = 1; i <= NS; i++) { const s = i / NS; if (i === NS / 2) iMid = pts.length; pts.push({ y: yAt(s), hw: hwAt(s) }); }
    const yEnd = yAt(1);
    for (let i = 1; i <= 8; i++) { const t = i / 8, e = t * t * (3 - 2 * t); pts.push({ y: yEnd + 26 * t, hw: lerp(hwAt(1), hwh, e) }); }
    pts.push({ y: yEnd + 76, hw: hwh });
    const yBottom = yEnd + 76 + sepPx;
    const yc = pts[iMid].y, hwN = pts[iMid].hw;

    // --- máquina ---
    const steel = (x0, x1) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#64748b'); g.addColorStop(.5, '#cbd5e1'); g.addColorStop(1, '#64748b'); return g; };
    const baseY = 625;
    ctx.fillStyle = steel(46, 62); ctx.fillRect(46, 62, 16, baseY - 62);
    ctx.fillStyle = steel(498, 514); ctx.fillRect(498, 62, 16, baseY - 62);
    ctx.fillStyle = '#475569'; rr(ctx, 30, baseY, SW - 60, 26, 4); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('BANCADA', SW / 2, baseY + 17);
    // cruceta superior fija + célula de carga
    ctx.fillStyle = steel(30, 530); rr(ctx, 30, 22, SW - 60, 40, 5); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.font = `700 11px ${FONT}`; ctx.fillText('CRUCETA FIJA', 120, 46);
    ctx.fillStyle = '#1e293b'; rr(ctx, cx - 28, 62, 56, 24, 4); ctx.fill();
    ctx.fillStyle = '#4ade80'; ctx.font = `600 9px ui-monospace, monospace`; ctx.fillText('LOAD CELL', cx, 78);
    // cruceta inferior móvil + pistón (se dibujan tras la probeta, pero la posición se calcula ya)
    const gripLowY = yBottom - 25;
    const crossY = yBottom + 30;

    // pistón
    ctx.fillStyle = steel(cx - 10, cx + 10); ctx.fillRect(cx - 10, crossY + 36, 20, baseY - crossY - 36);
    ctx.fillStyle = steel(60, 500); rr(ctx, 60, crossY, 440, 36, 5); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('CRUCETA MÓVIL', 150, crossY + 22);
    arrow(ctx, 450, crossY + 6, 450, crossY + 30, '#2563eb', 2.5, 7);
    ctx.fillStyle = '#2563eb'; ctx.font = `600 10px ${FONT}`; ctx.fillText('v', 436, crossY + 22);

    // --- contorno original (fantasma) ---
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - hw0, yP, hw0 * 2, Hc0); ctx.setLineDash([]);

    // --- probeta ---
    const paint = (pathFn, x0, x1) => {
      const base = M.mat.color || '#94a3b8';
      let fill;
      if (cyl) { fill = ctx.createLinearGradient(cx - hwh, 0, cx + hwh, 0); fill.addColorStop(0, shade(base, -35)); fill.addColorStop(.3, shade(base, 25)); fill.addColorStop(.55, base); fill.addColorStop(1, shade(base, -45)); }
      else { fill = ctx.createLinearGradient(cx - hwh, 0, cx + hwh, 0); fill.addColorStop(0, shade(base, -10)); fill.addColorStop(.86, shade(base, 10)); fill.addColorStop(.86, shade(base, -40)); fill.addColorStop(1, shade(base, -45)); }
      pathFn(); ctx.fillStyle = fill; ctx.fill();
      ctx.save(); pathFn(); ctx.clip();
      ctx.globalAlpha = 0.34; ctx.fillStyle = zc; ctx.fillRect(cx - 120, yP - 4, 240, yBottom - yP);   // tinte de zona en la zona calibrada
      ctx.globalAlpha = 1;
      if (st.zone === 'yield' && M.kind === 'yield') {   // bandas de Lüders
        ctx.strokeStyle = 'rgba(30,41,59,.55)'; ctx.lineWidth = 1.2;
        const nb = 2 + Math.floor(st.u * 9);
        for (let i = 0; i < nb; i++) { const s = ((i * 0.381 + 0.11) % 1) * 0.92 + 0.04, y = yAt(s); ctx.beginPath(); ctx.moveTo(cx - 60, y + 30); ctx.lineTo(cx + 60, y - 30); ctx.stroke(); }
      }
      ctx.restore();
      pathFn(); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5; ctx.stroke();
    };
    const top = pts.slice(0, iMid + 1).map(p => ({ y: p.y, hw: p.hw }));
    const bot = pts.slice(iMid).map(p => ({ y: p.y + sepPx, hw: p.hw }));
    const d = brittle ? 0 : hwN * 0.55;
    const pathWhole = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(cx - p.hw, p.y) : ctx.moveTo(cx - p.hw, p.y)); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(cx + pts[i].hw, pts[i].y); ctx.closePath(); };
    const pathTop = () => {
      ctx.beginPath(); ctx.moveTo(cx - top[0].hw, top[0].y);
      for (let i = 1; i < top.length; i++) ctx.lineTo(cx - top[i].hw, top[i].y);
      const L = top[top.length - 1]; ctx.quadraticCurveTo(cx, L.y - 2 * d + (brittle ? 0 : 0), cx + L.hw, L.y);
      for (let i = top.length - 2; i >= 0; i--) ctx.lineTo(cx + top[i].hw, top[i].y);
      ctx.closePath();
    };
    const pathBot = () => {
      const Fp = bot[0]; ctx.beginPath(); ctx.moveTo(cx - Fp.hw, Fp.y);
      ctx.quadraticCurveTo(cx, Fp.y - 1.7 * d, cx + Fp.hw, Fp.y);
      for (let i = 1; i < bot.length; i++) ctx.lineTo(cx + bot[i].hw, bot[i].y);
      for (let i = bot.length - 1; i >= 1; i--) ctx.lineTo(cx - bot[i].hw, bot[i].y);
      ctx.closePath();
    };
    if (st.ruptured) { paint(pathTop); paint(pathBot); } else paint(pathWhole);

    // marcas de la base de medida L0 y extensómetro
    const sA = (1 - M.L0 / M.Lc) / 2, sB = 1 - sA;
    const yM = s => yAt(s) + (st.ruptured && s > 0.5 ? sepPx : 0);
    ctx.strokeStyle = '#0f172a';
    for (let i = 0; i <= 5; i++) {
      const s = sA + (sB - sA) * i / 5, y = yM(s), h = hwAt(s);
      ctx.lineWidth = (i === 0 || i === 5) ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(cx - h, y); ctx.lineTo(cx + h, y); ctx.stroke();
    }
    const yA = yM(sA), yB = yM(sB);
    ctx.fillStyle = '#0f172a';
    [[yA, hwAt(sA)], [yB, hwAt(sB)]].forEach(([y, h]) => { rr(ctx, cx - h - 11, y - 4, 11, 8, 2); ctx.fill(); rr(ctx, cx + h, y - 4, 11, 8, 2); ctx.fill(); });
    // cota L
    const dx = cx + hwh + 34;
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + hwAt(sA) + 11, yA); ctx.lineTo(dx + 6, yA); ctx.moveTo(cx + hwAt(sB) + 11, yB); ctx.lineTo(dx + 6, yB); ctx.stroke();
    arrow(ctx, dx, (yA + yB) / 2, dx, yA, '#334155', 1.2, 6); arrow(ctx, dx, (yA + yB) / 2, dx, yB, '#334155', 1.2, 6);
    ctx.textAlign = 'left'; ctx.font = `600 11px ${FONT}`; ctx.fillStyle = '#64748b';
    ctx.fillText('L₀ = ' + fmt(M.L0, 1) + ' mm', dx + 10, (yA + yB) / 2 - 8);
    ctx.fillStyle = zc; ctx.font = `700 12px ${FONT}`;
    ctx.fillText('L = ' + fmt(M.L0 * (1 + (st.ruptured ? M.epsPerm : eps)), 1) + ' mm', dx + 10, (yA + yB) / 2 + 8);

    // mordazas (encima de las cabezas)
    const grip = (y0, y1) => {
      const g = ctx.createLinearGradient(cx - 74, 0, cx + 74, 0); g.addColorStop(0, '#1e293b'); g.addColorStop(.5, '#475569'); g.addColorStop(1, '#1e293b');
      ctx.fillStyle = g; rr(ctx, cx - 74, y0, 148, y1 - y0, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
      for (let y = y0 + 6; y < y1 - 3; y += 6) { ctx.beginPath(); ctx.moveTo(cx - hwh - 6, y); ctx.lineTo(cx - hwh + 6, y); ctx.moveTo(cx + hwh - 6, y); ctx.lineTo(cx + hwh + 6, y); ctx.stroke(); }
    };
    ctx.fillStyle = '#1e293b'; rr(ctx, cx - 74, 84, 148, 42, 5); ctx.fill();
    grip(86, 126);
    ctx.fillStyle = '#f1f5f9'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('MORDAZA', cx, 110);
    grip(gripLowY, gripLowY + 55);
    ctx.fillStyle = '#f1f5f9'; ctx.fillText('MORDAZA', cx, gripLowY + 40);

    // fuerzas
    const fmax = M.Rm * M.S0 / 1000;
    const Fcur = st.sigPlot * M.S0 / 1000;
    const L = 8 + 56 * clamp(Fcur / fmax, 0, 1);
    if (Fcur > 0.001) {
      arrow(ctx, cx - hwh - 22, 150, cx - hwh - 22, 150 - L, '#dc2626', 3.2, 9);
      arrow(ctx, cx - hwh - 22, yBottom - 52, cx - hwh - 22, yBottom - 52 + L, '#dc2626', 3.2, 9);
      ctx.fillStyle = '#dc2626'; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillText('F', cx - hwh - 30, 150 - L / 2 + 4); ctx.fillText('F', cx - hwh - 30, yBottom - 52 + L / 2 + 4);
    }

    // destello al romper
    if (st.ruptured && st.sep < 0.3) {
      const t = st.sep / 0.3, g = ctx.createRadialGradient(cx, yc, 0, cx, yc, 25 + 70 * t);
      g.addColorStop(0, `rgba(254,240,138,${0.9 * (1 - t)})`); g.addColorStop(1, 'rgba(254,240,138,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 120, yc - 120, 240, 240);
    }

    // chivato de zona + sección transversal
    ctx.textAlign = 'left';
    rr(ctx, 370, 92, 170, 52, 8); ctx.fillStyle = zc; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 12px ${FONT}`; ctx.fillText(ZONES[st.zone].short.toUpperCase(), 380, 112);
    ctx.font = `500 11px ui-monospace, monospace`;
    ctx.fillText(st.zone === 'elastic' ? 'σ = E·ε' : st.zone === 'yield' ? (M.kind === 'yield' ? 'σ ≈ ReL = cte' : 'σ ≈ Rp0,2') : st.zone === 'hardening' ? 'σ ↑ hasta Rm' : st.zone === 'necking' ? 'S ↓  →  σ=F/S₀ ↓' : 'F = 0', 380, 132);

    // sección transversal
    const bx = 58, by = 200, bw = 112, bh = 118;
    ctx.fillStyle = '#fff'; rr(ctx, bx, by, bw, bh, 8); ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('SECCIÓN MÍNIMA', bx + bw / 2, by + 15);
    const fac = (st.ruptured ? hwN : Math.min(hwAt(0.5), hwAt(0.2))) / hw0;
    const cxs = bx + bw / 2, cys = by + 58;
    const r0 = 32, rcur = r0 * fac;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#94a3b8';
    if (cyl) { ctx.beginPath(); ctx.arc(cxs, cys, r0, 0, 7); ctx.stroke(); }
    else { const w0 = 40, h0 = 40 * (M.cfg.a0 / M.cfg.b0) * 1.6 + 8; ctx.strokeRect(cxs - w0, cys - h0 / 2, w0 * 2, h0); }
    ctx.setLineDash([]); ctx.fillStyle = zc + 'aa'; ctx.strokeStyle = zc; ctx.lineWidth = 2;
    if (cyl) { ctx.beginPath(); ctx.arc(cxs, cys, Math.max(1, rcur), 0, 7); ctx.fill(); ctx.stroke(); }
    else { const w0 = 40, h0 = 40 * (M.cfg.a0 / M.cfg.b0) * 1.6 + 8; ctx.fillRect(cxs - w0 * fac, cys - h0 * fac / 2, w0 * 2 * fac, h0 * fac); ctx.strokeRect(cxs - w0 * fac, cys - h0 * fac / 2, w0 * 2 * fac, h0 * fac); }
    ctx.fillStyle = '#334155'; ctx.font = `600 11px ${FONT}`; ctx.fillText('S = ' + fmt(M.S0 * fac * fac, 1) + ' mm²', cxs, by + bh - 20);
    ctx.fillStyle = zc; ctx.fillText('S/S₀ = ' + fmt(fac * fac * 100, 0) + ' %', cxs, by + bh - 6);
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => clamp(v + amt, 0, 255);
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  /* ---------- Diagrama ---------- */
  function niceTicks(max, n = 6) {
    const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
    const step = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, arr = [];
    for (let v = 0; v <= max + 1e-9; v += step) arr.push(v);
    return { arr, step };
  }

  function drawDiagram(st) {
    const M = state.model, ctx = dctx, mode = state.mode, zoom = state.zoom && M.kind !== 'brittle';
    ctx.clearRect(0, 0, DW, DH); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, DW, DH);
    const ml = 64, mr = 20, mt = 26, mb = 46, pw = DW - ml - mr, ph = DH - mt - mb;
    const sx = mode === 'se' ? 100 : M.L0, sy = mode === 'se' ? 1 : M.S0 / 1000;
    const xmaxE = zoom ? M.zoomEps : M.epsR * 1.04;
    let ymaxS = M.Rm * 1.12;
    if (zoom) { let mx = 0; for (const s of M.samples) if (s.eps <= xmaxE) mx = Math.max(mx, s.sig); ymaxS = mx * 1.18; }
    const xmaxV = xmaxE * sx, ymaxV = ymaxS * sy;
    const X = e => ml + e * sx / xmaxV * pw, Y = s => mt + ph - s * sy / ymaxV * ph;
    const fy = s => mode === 'se' ? fmt(s, 0) + ' MPa' : fmt(s * M.S0 / 1000, 1) + ' kN';

    ctx.save(); ctx.beginPath(); ctx.rect(ml, mt, pw, ph); ctx.clip();
    // bandas de zona
    ctx.textAlign = 'center';
    Object.entries(M.zoneEps).forEach(([z, [a, b]]) => {
      const x0 = X(a), x1 = Math.min(ml + pw, X(b));
      if (x1 <= x0) return;
      ctx.fillStyle = ZONES[z].color + '12'; ctx.fillRect(x0, mt, x1 - x0, ph);
      ctx.strokeStyle = ZONES[z].color + '55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, mt); ctx.lineTo(x0, mt + ph); ctx.stroke();
      if (x1 - x0 > 46) { ctx.fillStyle = ZONES[z].color; ctx.font = `700 10px ${FONT}`; ctx.fillText(ZONES[z].short.toUpperCase(), (x0 + x1) / 2, mt + 13); }
    });
    // zona segura de trabajo
    const R = M.results;
    if (state.notes) {
      ctx.fillStyle = 'rgba(16,185,129,.09)'; ctx.fillRect(ml, Y(R.sigAdm), pw, mt + ph - Y(R.sigAdm));
    }
    ctx.restore();

    // rejilla y ejes
    const tx = niceTicks(xmaxV, 7), ty = niceTicks(ymaxV, 6);
    ctx.font = `11px ${FONT}`; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    const dx = Math.max(0, -Math.floor(Math.log10(tx.step) + 1e-9)), dy = Math.max(0, -Math.floor(Math.log10(ty.step) + 1e-9));
    ctx.textAlign = 'center';
    tx.arr.forEach(v => { const x = ml + v / xmaxV * pw; ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, mt + ph); ctx.stroke(); ctx.fillText(fmt(v, dx), x, mt + ph + 16); });
    ctx.textAlign = 'right';
    ty.arr.forEach(v => { const y = mt + ph - v / ymaxV * ph; ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + pw, y); ctx.stroke(); ctx.fillText(fmt(v, dy), ml - 6, y + 4); });
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ml, mt); ctx.lineTo(ml, mt + ph); ctx.lineTo(ml + pw, mt + ph); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(mode === 'se' ? 'Deformación  ε  (%)' : 'Alargamiento  ΔL  (mm)', ml + pw / 2, DH - 8);
    ctx.save(); ctx.translate(16, mt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(mode === 'se' ? 'Tensión  σ  (MPa)' : 'Fuerza  F  (kN)', 0, 0); ctx.restore();

    ctx.save(); ctx.beginPath(); ctx.rect(ml, mt - 2, pw + 2, ph + 2); ctx.clip();

    // curva completa (fantasma)
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath();
    M.samples.forEach((s, i) => i ? ctx.lineTo(X(s.eps), Y(s.sig)) : ctx.moveTo(X(s.eps), Y(s.sig)));
    ctx.stroke();
    // descarga elástica en la rotura
    const endS = M.samples[M.samples.length - 1];
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(X(endS.eps), Y(endS.sig)); ctx.lineTo(X(M.epsPerm), Y(0)); ctx.stroke(); ctx.setLineDash([]);

    // anotaciones
    if (state.notes) {
      // Hooke
      const sH = Math.min(ymaxS, (M.kind === 'brittle' ? M.Rm : M.Re) * 1.25);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = ZONES.elastic.color; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(sH / M.E), Y(sH)); ctx.stroke();
      if (M.kind === 'smooth') {   // recta paralela desplazada 0,2 %
        ctx.strokeStyle = '#7c3aed'; ctx.beginPath(); ctx.moveTo(X(0.002), Y(0)); ctx.lineTo(X(0.002 + Math.min(ymaxS, M.Re * 1.12) / M.E), Y(Math.min(ymaxS, M.Re * 1.12))); ctx.stroke();
      }
      // σ_adm y σ_trab
      ctx.strokeStyle = '#059669'; ctx.beginPath(); ctx.moveTo(ml, Y(R.sigAdm)); ctx.lineTo(ml + pw, Y(R.sigAdm)); ctx.stroke();
      if (R.sigTrab > 0) { ctx.strokeStyle = R.sigTrab <= R.sigAdm ? '#2563eb' : (R.sigTrab <= R.ReSafe ? '#d97706' : '#dc2626'); ctx.beginPath(); ctx.moveTo(ml, Y(R.sigTrab)); ctx.lineTo(ml + pw, Y(R.sigTrab)); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    ctx.restore();

    if (state.notes) {
      const tag = (txt, e, s, color, dx = 8, dy = -8, align = 'left') => {
        const x = X(e), y = Y(s); if (x < ml - 1 || x > ml + pw + 1 || y < mt - 1 || y > mt + ph + 1) return;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.stroke();
        ctx.font = `700 11px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(txt, x + dx, y + dy);
      };
      if (M.kind === 'yield') {
        tag('ReH ' + fy(M.Re), M.epsY, M.Re, ZONES.yield.color, 8, -8);
        tag('ReL ' + fy(M.ReL), (M.epsY + M.epsH) / 2, M.ReL, ZONES.yield.color, 6, 16);
      } else if (M.kind === 'smooth') {
        tag('Rp0,2 ' + fy(M.Re), M.epsY, M.Re, '#7c3aed', 10, 14);
        tag('σp', M.zoneEps.elastic[1], M.sigP, ZONES.elastic.color, -8, -6, 'right');
      }
      if (M.kind !== 'brittle') tag('Rm ' + fy(M.Rm), M.epsU, M.Rm, ZONES.hardening.color, -8, -10, 'right');
      tag((M.kind === 'brittle' ? 'Rotura = Rm ' : 'Rotura ') + fy(endS.sig), endS.eps, endS.sig, ZONES.rupture.color, -8, -10, 'right');
      ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillStyle = '#059669'; ctx.fillText('σ_adm = ' + fy(R.sigAdm), ml + 6, Y(R.sigAdm) - 5);
      if (R.sigTrab > 0) { ctx.fillStyle = R.sigTrab <= R.sigAdm ? '#2563eb' : (R.sigTrab <= R.ReSafe ? '#d97706' : '#dc2626'); ctx.fillText('σ_trab = ' + fy(R.sigTrab), ml + 6, R.sigTrab <= R.sigAdm ? Y(R.sigTrab) + 13 : Y(R.sigTrab) - 5); }
      ctx.fillStyle = ZONES.elastic.color; ctx.font = `600 10px ${FONT}`;
      const hx = X(Math.min(xmaxE * 0.9, (M.kind === 'brittle' ? M.Rm * 0.5 : M.Re * 0.55) / M.E)), hy = Y((M.kind === 'brittle' ? M.Rm * 0.5 : M.Re * 0.55));
      ctx.textAlign = 'left'; ctx.fillText('Hooke: tg α = E', hx + 8, hy + 4);
    }

    // curva recorrida por zonas
    ctx.save(); ctx.beginPath(); ctx.rect(ml, mt - 2, pw + 2, ph + 2); ctx.clip();
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let curZ = null;
    const pEnd = Math.min(st.p, M.pR);
    ctx.beginPath();
    for (let i = 0; i < M.samples.length; i++) {
      const s = M.samples[i];
      if (s.p > pEnd) break;
      if (s.zone !== curZ) { if (curZ) { ctx.lineTo(X(s.eps), Y(s.sig)); ctx.stroke(); } curZ = s.zone; ctx.strokeStyle = ZONES[curZ].color; ctx.beginPath(); ctx.moveTo(X(s.eps), Y(s.sig)); }
      else ctx.lineTo(X(s.eps), Y(s.sig));
    }
    ctx.lineTo(X(st.epsPlot), Y(st.sigPlot)); ctx.stroke();
    if (st.ruptured) {   // descarga recorrida
      ctx.strokeStyle = ZONES.rupture.color; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(X(endS.eps), Y(endS.sig)); ctx.lineTo(X(st.epsPlot), Y(st.sigPlot)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // marcador actual
    const px = X(st.epsPlot), py = Y(st.sigPlot), zc = ZONES[st.zone].color;
    if (px >= ml && px <= ml + pw) {
      ctx.setLineDash([2, 3]); ctx.strokeStyle = zc + '99'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, mt + ph); ctx.moveTo(px, py); ctx.lineTo(ml, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = zc + '33'; ctx.beginPath(); ctx.arc(px, py, 11, 0, 7); ctx.fill();
      ctx.fillStyle = zc; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill(); ctx.stroke();
      const txt = `σ = ${fmt(st.sigPlot, 0)} MPa   ε = ${fmt(st.epsPlot * 100, st.epsPlot < 0.01 ? 3 : 2)} %`;
      ctx.font = `600 11px ui-monospace, monospace`; const w = ctx.measureText(txt).width + 14;
      let bx = px + 14, by = py - 30; if (bx + w > ml + pw) bx = px - w - 14; if (by < mt) by = py + 14;
      ctx.fillStyle = '#0f172a'; rr(ctx, bx, by, w, 22, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 7, by + 15);
    }
  }

  /* ===================================================================
     RENDER GLOBAL
  =================================================================== */
  let lastZone = null;
  function render() {
    const M = state.model; if (!M) return;
    const st = M.state(state.p);
    drawSpecimen(st); drawDiagram(st);

    const F_kN = st.sigPlot * M.S0 / 1000;
    $('rF').textContent = fmt(F_kN, 2);
    $('rDL').textContent = fmt(st.epsPlot * M.L0, 2);
    $('rSig').textContent = fmt(st.sigPlot, 0);
    $('rEps').textContent = fmt(st.epsPlot * 100, st.epsPlot < 0.01 ? 3 : 2);
    $('rT').textContent = mmss(st.eps * M.Lc / (M.cfg.v / 60));
    $('seek').value = Math.round(state.p * 1000);

    const zc = ZONES[st.zone].color;
    const b = $('zoneBadge'); b.style.background = zc; b.textContent = ZONES[st.zone].label.split(' / ')[0].toUpperCase();
    if (st.zone !== lastZone || true) {
      const [t, tx, fm] = explain(M, st);
      $('exTitle').textContent = t; $('exText').textContent = tx; $('exFormula').textContent = fm;
      $('explain').style.borderColor = zc; lastZone = st.zone;
    }
    $('zoneChips').querySelectorAll('button').forEach(btn => {
      const on = btn.dataset.z === st.zone, c = ZONES[btn.dataset.z].color;
      btn.style.background = on ? c : '#fff'; btn.style.color = on ? '#fff' : c; btn.style.borderColor = c;
    });
    resultRows.forEach(r => { const on = state.p >= r.reveal - 1e-9; r.row.style.opacity = on ? 1 : 0.28; });

    const sig = st.sigPlot, R = M.results;
    const live = $('liveSig'), bar = $('liveBar');
    if (live) {
      live.textContent = fmt(sig, 0) + ' MPa';
      bar.style.width = clamp(sig / M.Rm * 100, 0, 100) + '%';
      bar.style.background = sig <= R.sigAdm ? '#059669' : sig <= R.ReSafe ? '#d97706' : '#dc2626';
    }
  }

  /* ===================================================================
     PIE DE PÁGINA
  =================================================================== */
  $('ftFormulas').innerHTML = FORMULAS.map(([f, t, items]) =>
    `<div class="rounded-lg bg-slate-800/70 p-3"><div class="flex flex-wrap items-baseline gap-x-3"><span class="font-mono text-base font-semibold text-blue-200">${f}</span><span class="text-xs uppercase tracking-wide text-slate-400">${t}</span></div><ul class="mt-1 list-inside list-disc text-[13px] text-slate-300">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('');
  $('ftVocab').innerHTML = VOCAB.map(([t, d]) => `<div><dt class="font-semibold text-emerald-200">${t}</dt><dd class="text-[13px] text-slate-300">${d}</dd></div>`).join('');
  $('ftToggle').onclick = () => { const h = $('ftBody').classList.toggle('hidden'); $('ftToggle').textContent = h ? 'Mostrar' : 'Ocultar'; };

  window.LAB.pauseTens = () => setPlaying(false);
  const fsBtn = $('btnFs');
  const fsOn = () => !!document.fullscreenElement;
  const toggleFs = () => { if (!document.fullscreenEnabled) return; (fsOn() ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); };
  fsBtn.onclick = toggleFs;
  document.addEventListener('fullscreenchange', () => { $('fsLabel').textContent = fsOn() ? 'Salir de pantalla completa' : 'Pantalla completa'; });
  window.addEventListener('keydown', e => { if (e.key === 'f' && !dlg.open && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) toggleFs(); });

  /* ===================================================================
     ARRANQUE
  =================================================================== */
  F.matSel.value = 'acero'; fillMaterial('acero'); syncShape(); syncKindFields(); setMode('se');
  const first = readConfig();
  apply(first.cfg);
  dlg.showModal();
})();
