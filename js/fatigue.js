/* Interfaz del ensayo de fatiga: configuración, simulación (flexión rotativa / torsión) y análisis */
(function () {
  'use strict';
  const { MATERIALS, FINISH, DEFECT, PHASE_META, buildFatigue, fmtN } = window.FatigueModel;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fmt = (x, d = 1) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const hms = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`; };
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const LAB = window.LAB;
  const DURATION = 40;                 // s de simulación a 1× y 50 Hz
  const S = { model: null, p: 0, playing: false, dir: 1, speed: 1, last: 0, started: false, points: [], freq: 50, rot: 0, userSa: false };
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* =================================================================
     TEXTOS
  ================================================================= */
  function explainF(M, st) {
    const bend = M.cfg.method === 'bend';
    const X = bend ? {
      setup: ['Montaje y carga', 'La probeta se sujeta por un extremo en el mandril del motor (voladizo). En el otro extremo se monta un cojinete del que cuelga la carga: la carga es fija y no gira con la probeta.', 'σ = 32·M / (π·d³) ,  M = F·L'],
      start: ['Arranque y regulación del motor', 'Se arranca el motor y se ajusta la frecuencia de giro. Al girar la probeta, cada fibra pasa de tracción (arriba) a compresión (abajo): esfuerzo alterno simétrico, un ciclo por vuelta.', 'f = rpm / 60 ;  R = σmin/σmax = −1'],
      init: ['Iniciación de la grieta', 'En el punto defectuoso (rayado, inclusión o entalla) las tensiones se concentran y aparece una microgrieta en la superficie. Es la fase más larga en fatiga de alto número de ciclos.', 'σ_local = K_f · σ_nominal'],
      prop: ['Propagación estable', 'La grieta avanza ciclo a ciclo: se abre en la zona de tracción y se cierra en compresión. Deja una zona lisa de grano fino con marcas de playa ondulares. Al reducirse la sección, la grieta se acelera.', 'da/dN aumenta con la longitud de grieta a'],
      final: ['Rotura final', 'La sección que queda ya no soporta la carga: rotura brusca (frágil) en un solo ciclo. Deja la zona de grano grueso y brillante. El motor se detiene y la parte libre cae.', 'σ_real = F / S_restante ≥ Rm'],
      frac: ['Examen de la fractura', 'Se distinguen: el punto de inicio, la zona de grano fino con marcas de playa (propagación) y la zona de grano grueso y brillante (rotura final).', 'Zona final mayor ⇒ tensión nominal mayor'],
      run: ['Ciclado sin rotura', 'La amplitud es menor que el límite de fatiga efectivo: la probeta gira millones de ciclos sin que se inicie ninguna grieta.', 'σa ≤ σ_e,ef  ⇒  vida infinita'],
      stop: ['Fin del ensayo (run-out)', 'Se detiene el ensayo al alcanzar el número límite de ciclos sin rotura.', 'N ≥ N_límite'],
    } : {
      setup: ['Montaje y carga', 'La probeta se empotra por un extremo (voladizo). En el otro se fija una palanca unida mediante una biela a la excéntrica del motor.', 'τ = 16·T / (π·d³) ,  T = F·L'],
      start: ['Arranque y regulación del motor', 'Al girar el motor, la biela sube y baja la palanca: el par de torsión cambia de sentido en cada vuelta (±T). Las tensiones principales a 45° alternan tracción y compresión.', 'f = rpm / 60 ;  σ₁ = −σ₂ = ± τ'],
      init: ['Iniciación de la grieta', 'En el punto defectuoso de la superficie las tensiones se concentran y nace una microgrieta, normalmente inclinada 45° respecto al eje (plano de máxima tracción).', 'σ_local = K_f · τ_nominal'],
      prop: ['Propagación estable', 'La grieta crece en cada ciclo; las caras rozan entre sí por el giro alterno y dejan una superficie lisa de grano fino con marcas de playa. La sección resistente disminuye.', 'da/dN aumenta con la longitud de grieta a'],
      final: ['Rotura final', 'Cuando la sección que queda no resiste, se produce la rotura brusca: grano grueso y brillante en la zona central. El motor se detiene.', 'τ_real = T / W_restante ≥ τ_rotura'],
      frac: ['Examen de la fractura', 'Se observan los puntos de inicio con marcas radiales (de rastrillo), la corona lisa de grano fino con marcas de playa y el núcleo central de grano grueso y brillante.', 'Núcleo mayor ⇒ par nominal mayor'],
      run: ['Ciclado sin rotura', 'La amplitud de torsión está por debajo del límite de fatiga efectivo: no se inicia ninguna grieta.', 'τa ≤ τ_e,ef  ⇒  vida infinita'],
      stop: ['Fin del ensayo (run-out)', 'Se detiene el ensayo al alcanzar el número límite de ciclos sin rotura.', 'N ≥ N_límite'],
    };
    return X[st.phase];
  }
  const FORMULAS = [
    ['σ = 32·M / (π·d³) ,  M = F·L', 'Flexión rotativa en voladizo', ['M: momento flector en la sección crítica (N·mm)', 'F: carga fija colgada (N) · L: brazo hasta la sección (mm)', 'd: diámetro de la sección crítica (mm)']],
    ['τ = 16·T / (π·d³) ,  T = F·L', 'Torsión alternativa', ['T: par de torsión (N·mm) · F: fuerza en la palanca (N)', 'L: brazo de la palanca (mm)']],
    ['σ(t) = σa · sen(2π·f·t)   ,   R = σmin/σmax = −1', 'Ciclo de esfuerzo alterno simétrico', ['σa: amplitud (MPa) · f: frecuencia (Hz) = rpm/60', 'Tensión media σm = 0: tracción y compresión alternas']],
    ['σa = A · N^b   (Basquin)', 'Curva de Wöhler (S–N)', ['N: ciclos hasta la rotura · A y b: constantes del material', 'Para aceros: la curva se hace horizontal en σa = Se (≈ 10⁶ ciclos)']],
    ['Se,ef = Se · k_a · k_b / K_f', 'Límite de fatiga efectivo', ['Se: límite de fatiga de la probeta pulida', 'k_a: acabado superficial · k_b: tamaño · K_f: concentrador de tensiones']],
    ['t = N / f', 'Duración real del ensayo', ['N: ciclos · f: frecuencia de giro del motor (Hz)', 'Doblar la frecuencia reduce a la mitad la duración']],
    ['σ_eq = √3 · τa', 'Equivalencia en torsión', ['Permite comparar la torsión con la flexión usando la misma curva S–N']],
  ];
  const VOCAB = [
    ['Fatiga', 'Rotura progresiva de un material sometido a esfuerzos variables, a tensiones menores que las de rotura estática.'],
    ['Ciclo de esfuerzo', 'Variación completa de la tensión (de +σa a −σa y vuelta).'],
    ['Amplitud σa', 'Valor máximo de la tensión alterna respecto de la media.'],
    ['Relación R', 'Cociente σmin/σmax; R = −1 es el ciclo alterno simétrico.'],
    ['Curva de Wöhler (S–N)', 'Gráfica de la amplitud de tensión frente al número de ciclos hasta la rotura.'],
    ['Límite de fatiga', 'Amplitud por debajo de la cual el material resiste un número infinito de ciclos (aceros).'],
    ['Run-out', 'Ensayo que se detiene sin rotura al alcanzar el número límite de ciclos.'],
    ['Iniciación', 'Fase en que nace la microgrieta, normalmente en un punto defectuoso de la superficie.'],
    ['Propagación', 'Fase en que la grieta crece estable, ciclo a ciclo.'],
    ['Marcas de playa', 'Líneas onduladas y concéntricas que dejan las paradas o variaciones de carga durante la propagación.'],
    ['Grano fino (zona de fatiga)', 'Zona lisa, mate y de aspecto sedoso que deja la propagación de la grieta.'],
    ['Grano grueso brillante', 'Zona de rotura final brusca, de aspecto cristalino y brillante.'],
    ['Concentrador de tensiones', 'Rayado, entalla, inclusión o cambio de sección que eleva la tensión local (K_f).'],
    ['Acabado superficial', 'La rugosidad reduce el límite de fatiga (factor k_a).'],
    ['Mandril / cojinete', 'El mandril sujeta y hace girar la probeta; el cojinete permite que la carga no gire.'],
    ['Excéntrica y biela', 'Mecanismo que convierte el giro del motor en el movimiento alternativo de la palanca (torsión).'],
  ];
  const fatFooter = {
    f: FORMULAS.map(([f, t, items]) => `<div class="rounded-lg bg-slate-800/70 p-3"><div class="flex flex-wrap items-baseline gap-x-3"><span class="font-mono text-[15px] font-semibold text-blue-200">${f}</span><span class="text-xs uppercase tracking-wide text-slate-400">${t}</span></div><ul class="mt-1 list-inside list-disc text-[13px] text-slate-300">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join(''),
    v: VOCAB.map(([t, d]) => `<div><dt class="font-semibold text-emerald-200">${t}</dt><dd class="text-[13px] text-slate-300">${d}</dd></div>`).join(''),
  };
  LAB.register('fat', { dlg: 'cfgF', btn: 'tabFat', main: 'mainFat', hdr: 'hdrFat', title: 'Ensayo de fatiga', grid: true, footer: fatFooter,
    pause: () => setPlaying(false), onShow: () => { render(); if (!S.started) { S.started = true; dlg.showModal(); } } });

  /* =================================================================
     CONFIGURACIÓN
  ================================================================= */
  const dlg = $('cfgF'), mSel = $('faMatSel');
  Object.entries(MATERIALS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.name; mSel.appendChild(o); });
  const methodVal = () => document.querySelector('input[name=fmethod]:checked').value;
  const conv = () => methodVal() === 'bend' ? 1 : Math.sqrt(3);

  function suggestSa() {
    const Kf = DEFECT[$('faDefect').value].Kf, Se = +$('faSe').value || 200;
    $('faSa').value = Math.max(5, Math.round(1.3 * Se / Kf / conv() / 5) * 5);
  }
  function syncCfg() {
    const bend = methodVal() === 'bend', ferr = $('faKind').value === 'ferrous';
    $('faSaLbl').textContent = bend ? 'Amplitud de tensión σa (MPa)' : 'Amplitud de tensión τa (MPa)';
    $('faSeLbl').textContent = ferr ? 'Límite de fatiga Se (MPa)' : 'Resistencia a 5·10⁸ ciclos (MPa)';
    const { cfg, errs } = readCfg();
    if (errs.length) { $('faPrevLoad').textContent = '—'; $('faPrevEq').textContent = errs[0]; return; }
    const M = buildFatigue(cfg), r = M.res;
    $('faPrevLoad').innerHTML = bend ? `Carga fija F = σa·π·d³/(32·L) = <b>${fmt(r.Fload, 0)} N</b> (${fmt(r.mass, 1)} kg)` : `Par T = τa·π·d³/16 = <b>${fmt(r.Torque, 1)} N·m</b> · fuerza en la palanca = <b>${fmt(r.Fcrank, 0)} N</b>`;
    $('faPrevEq').innerHTML = `Límite de fatiga efectivo = <b>${fmt(r.SeEff, 0)} MPa</b> → ${r.runout ? '<b class="text-emerald-700">no rompe</b> (vida infinita)' : `rotura en ≈ <b class="text-amber-700">${fmtN(r.N)}</b> ciclos`}`;
  }
  function fillMat(k) {
    const m = MATERIALS[k]; $('faRm').value = m.Rm; $('faSe').value = m.Se; $('faKind').value = m.ferrous ? 'ferrous' : 'nonferrous';
    S.userSa = false; suggestSa(); syncCfg();
  }
  mSel.onchange = () => fillMat(mSel.value);
  ['faRm', 'faSe', 'faKind'].forEach(id => $(id).addEventListener('input', () => { mSel.value = 'custom'; syncCfg(); }));
  document.querySelectorAll('input[name=fmethod]').forEach(r => r.onchange = () => { suggestSa(); syncCfg(); });
  $('faDefect').onchange = () => { suggestSa(); syncCfg(); };
  ['faD', 'faL', 'faFinish', 'faFreqCfg'].forEach(id => $(id).addEventListener('input', syncCfg));
  $('faSa').addEventListener('input', () => { S.userSa = true; syncCfg(); });
  $('faBtnCfg').onclick = () => { setPlaying(false); dlg.showModal(); };
  $('faClose').onclick = $('faCancel').onclick = () => dlg.close();

  function readCfg() {
    const base = MATERIALS[mSel.value];
    const mat = { name: base.name, color: base.color, Rm: +$('faRm').value, Se: +$('faSe').value, ferrous: $('faKind').value === 'ferrous' };
    const cfg = { method: methodVal(), d: +$('faD').value, L: +$('faL').value, finish: $('faFinish').value, defect: $('faDefect').value, mat, sa: +$('faSa').value, f: +$('faFreqCfg').value, norm: $('faNorm').value.trim() };
    const errs = [];
    if (!(cfg.d >= 3 && cfg.d <= 30)) errs.push('El diámetro debe estar entre 3 y 30 mm.');
    if (!(cfg.L >= 20)) errs.push('El brazo L debe ser de al menos 20 mm.');
    if (!(mat.Rm > 0 && mat.Se > 0 && mat.Se < mat.Rm)) errs.push('Rm y Se deben ser positivos, con Se < Rm.');
    if (!(cfg.sa > 0)) errs.push('La amplitud de tensión debe ser positiva.');
    if (!(cfg.f >= 5 && cfg.f <= 200)) errs.push('La frecuencia debe estar entre 5 y 200 Hz.');
    return { cfg, errs };
  }
  $('faForm').addEventListener('submit', e => {
    e.preventDefault();
    const { cfg, errs } = readCfg(), box = $('faErr');
    if (errs.length) { box.textContent = errs.join(' '); box.classList.remove('hidden'); return; }
    box.classList.add('hidden'); dlg.close(); S.freq = cfg.f; apply(cfg); setPlaying(true, 1);
  });

  /* =================================================================
     APLICAR
  ================================================================= */
  let paramRows = [], lastRevealed = null;
  function describe(M) {
    const c = M.cfg, r = M.res;
    $('fhNorm').textContent = c.norm || 'no indicada';
    $('fhMethod').textContent = c.method === 'bend' ? 'Flexión rotativa' : 'Torsión alternativa';
    $('fhMat').textContent = c.mat.name;
    $('fhSpec').textContent = `Ø ${fmt(c.d, 1)} mm · ${FINISH[c.finish].name.toLowerCase()}`;
    $('fhLoad').textContent = `${c.method === 'bend' ? '±σa' : '±τa'} = ${fmt(c.sa, 0)} MPa · R = −1`;
    $('fhFreq').textContent = `${fmt(c.f, 0)} Hz (${fmt(c.f * 60, 0)} rpm)`;
    $('fhDefect').textContent = DEFECT[c.defect].name;
    $('faSLab').textContent = c.method === 'bend' ? 'Amplitud σa' : 'Amplitud τa';
    $('faS').textContent = fmt(c.sa, 0); $('faHz').textContent = fmt(c.f, 0);
    $('faFreq').value = c.f; $('faFreqTxt').textContent = fmt(c.f, 0); $('faRpm').textContent = fmt(c.f * 60, 0);
    void r;
  }
  function apply(cfg, keepP) {
    const M = buildFatigue(cfg);
    S.model = M; if (!keepP) { S.p = 0; S.dir = 1; S.points = []; S.rot = 0; } lastRevealed = null;
    describe(M); buildChips(M); buildParams(M); buildChecks(M); buildReco(M);
    render();
  }
  function setFreq(f) {
    f = clamp(Math.round(f), 5, 200); S.freq = f;
    const cfg = Object.assign({}, S.model.cfg, { f });
    apply(cfg, true);
  }
  $('faFreq').addEventListener('input', e => setFreq(+e.target.value));
  document.querySelectorAll('.faPre').forEach(b => b.onclick = () => setFreq(+b.dataset.f));

  function buildChips(M) {
    const box = $('faChips'); box.innerHTML = '';
    M.phases.forEach(ph => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = ph.id;
      b.className = 'rounded-full border px-3 py-1 text-xs font-semibold transition'; b.textContent = PHASE_META[ph.id].short;
      b.onclick = () => { setPlaying(false); S.p = clamp(ph.p0 + 0.05 * (ph.p1 - ph.p0), 0, 1); render(); };
      box.appendChild(b);
    });
  }
  function revealP(M) { return M.res.runout ? M.phases.find(p => p.id === 'stop').p0 : M.phases.find(p => p.id === 'frac').p0; }
  function buildParams(M) {
    const r = M.res, c = M.cfg, rp = revealP(M), bend = c.method === 'bend', u = bend ? 'σa' : 'τa';
    const rows = [
      ['Método', bend ? 'Flexión rotativa (voladizo)' : 'Torsión alternativa (voladizo)', 0],
      ['Material · Rm / Se', `${fmt(c.mat.Rm, 0)} / ${fmt(c.mat.Se, 0)} MPa`, 0],
      ['Diámetro d · brazo L', `${fmt(c.d, 1)} mm · ${fmt(c.L, 0)} mm`, 0],
      ['Factores k_a · k_b · K_f', `${fmt(r.ka, 2)} · ${fmt(r.kb, 2)} · ${fmt(r.Kf, 1)}`, 0],
      [bend ? 'Carga fija F' : 'Par T · fuerza en palanca', bend ? `${fmt(r.Fload, 0)} N (${fmt(r.mass, 1)} kg)` : `${fmt(r.Torque, 1)} N·m · ${fmt(r.Fcrank, 0)} N`, 0],
      [`Amplitud ${u}`, `${fmt(c.sa, 0)} MPa (σ_eq = ${fmt(r.seq, 0)} MPa)`, 0],
      ['Frecuencia · periodo', `${fmt(c.f, 0)} Hz (${fmt(c.f * 60, 0)} rpm) · ${fmt(1000 / c.f, 1)} ms`, 0],
      ['Límite de fatiga efectivo', `${fmt(r.SeEff, 0)} MPa`, 0],
      ['Ciclos hasta la rotura N', r.runout ? `> ${fmtN(r.Nlim)} (sin rotura)` : fmtN(r.N), rp],
      ['Iniciación / propagación', r.runout ? '—' : `${fmtN(r.Ni)} / ${fmtN(r.Np)}`, rp],
      ['Duración real a esa frecuencia', hms(r.N / c.f), rp],
      ['Zona de rotura final', r.runout ? '—' : `${fmt(r.ffinal * 100, 0)} % de la sección`, rp],
    ];
    const box = $('faParams'); box.innerHTML = '';
    paramRows = rows.map(([l, v, rev]) => {
      const row = document.createElement('div'); row.className = 'flex items-center justify-between gap-3 py-1.5 transition-opacity duration-300';
      row.innerHTML = `<span class="text-slate-600">${l}</span><span class="text-right font-mono font-semibold text-slate-800">${v}</span>`;
      box.appendChild(row); return { row, rev };
    });
  }
  function buildChecks(M) {
    $('faChecks').innerHTML = M.checks.map(k => {
      const ic = k.ok === true ? ['✓', 'bg-emerald-600'] : k.ok === 'warn' ? ['!', 'bg-amber-500'] : ['✕', 'bg-red-600'];
      return `<div class="flex gap-2.5"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${ic[1]}">${ic[0]}</span>
        <div class="min-w-0"><div class="text-slate-800">${k.label}</div><div class="font-mono text-xs text-slate-500">${k.value} <span class="text-slate-400">·</span> ${k.limit}</div>${k.ok !== true && k.hint ? `<div class="text-xs ${k.ok === false ? 'text-red-600' : 'text-amber-600'}">${k.hint}</div>` : ''}</div></div>`;
    }).join('');
  }
  function buildReco(M) { $('faReco').innerHTML = `<li class="list-none"><b>Régimen:</b> ${M.res.regime}.</li>` + M.reco.map(t => `<li>${t}</li>`).join(''); }

  /* =================================================================
     BUCLE Y CONTROLES
  ================================================================= */
  function setPlaying(on, dir) {
    if (dir) S.dir = dir;
    if (on && S.p >= 1 && S.dir > 0) S.p = 0;
    if (on && S.p <= 0 && S.dir < 0) S.p = 1;
    S.playing = on; S.last = performance.now();
    const fwd = on && S.dir > 0;
    $('faTPlay').textContent = fwd ? 'Pausa' : 'Reproducir';
    $('faIcPlay').innerHTML = fwd ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M6 4l14 8-14 8z"/>';
    $('fabRev').classList.toggle('bg-blue-100', on && S.dir < 0);
    if (on) requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!S.playing) return;
    const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
    const st = S.model.state(S.p), fv = 1.2 + 1.8 * clamp(S.freq / 200, 0, 1);
    S.rot += S.dir * dt * 2 * Math.PI * fv * st.motor;
    S.p += S.dir * dt / DURATION * S.speed * (S.freq / 50);
    if (S.p >= 1) { S.p = 1; setPlaying(false); } else if (S.p <= 0) { S.p = 0; setPlaying(false); }
    render(); if (S.playing) requestAnimationFrame(tick);
  }
  const STEP = 0.006;
  $('fabPlay').onclick = () => setPlaying(!(S.playing && S.dir > 0), 1);
  $('fabRev').onclick = () => (S.playing && S.dir < 0) ? setPlaying(false) : setPlaying(true, -1);
  $('fabStart').onclick = () => { setPlaying(false); S.p = 0; render(); };
  $('fabEnd').onclick = () => { setPlaying(false); S.p = 1; render(); };
  $('fabBack').onclick = () => { setPlaying(false); S.p = clamp(S.p - STEP, 0, 1); S.rot -= 0.6; render(); };
  $('fabFwd').onclick = () => { setPlaying(false); S.p = clamp(S.p + STEP, 0, 1); S.rot += 0.6; render(); };
  $('faSpeed').onchange = e => S.speed = +e.target.value;
  $('faSeek').oninput = e => { setPlaying(false); S.p = +e.target.value / 1000; render(); };
  window.addEventListener('keydown', e => {
    if (LAB.active !== 'fat' || dlg.open || (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); $('fabPlay').click(); }
    else if (e.code === 'ArrowRight') $('fabFwd').click(); else if (e.code === 'ArrowLeft') $('fabBack').click();
    else if (e.code === 'Home') $('fabStart').click(); else if (e.code === 'End') $('fabEnd').click();
  });
  $('fabReg').onclick = () => { const M = S.model; if (!M) return; S.points = S.points.filter(q => q.s !== M.cfg.sa).concat([{ s: M.cfg.sa, N: M.res.N, runout: M.res.runout }]); render(); };
  $('fabSeries').onclick = () => { const M = S.model; if (!M) return; S.points = M.series(); render(); };
  $('fabClear').onclick = () => { S.points = []; render(); };

  /* =================================================================
     CANVAS
  ================================================================= */
  function setupCanvas(cv, w, h) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.aspectRatio = w + ' / ' + h;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  }
  const SW = 560, SH = 620;
  const sctx = setupCanvas($('cvFaSpec'), SW, SH), nctx = setupCanvas($('cvFaSN'), 640, 340), kctx = setupCanvas($('cvFaCrack'), 320, 240), fctx = setupCanvas($('cvFaFrac'), 340, 360);
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  function arrow(ctx, x1, y1, x2, y2, color, w = 1.5, head = 6) {
    const a = Math.atan2(y2 - y1, x2 - x1); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4)); ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  function halo(ctx, txt, x, y, color, font, align = 'left') { ctx.font = font; ctx.textAlign = align; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y); }
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), c = v => clamp(v + amt, 0, 255); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }

  /* ---------- superficie de rotura (zonas de fatiga y rotura final) ---------- */
  function fractureDraw(ctx, cx, cy, R, M, g, broken, labels) {
    const ring = M.mode === 'ring', depth = clamp(M.a0 + (M.amax - M.a0) * g, 0, M.amax) / M.R;     // fracción de R
    const a0ang = -40 * Math.PI / 180, ox = cx + R * Math.cos(a0ang), oy = cy + R * Math.sin(a0ang);
    const fatigueFill = '#7e8998', k = R / M.R;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    // base: sección sana o grano grueso de la rotura final
    if (!broken) { const gr = ctx.createRadialGradient(cx - R * .3, cy - R * .3, 2, cx, cy, R); gr.addColorStop(0, '#d5dbe3'); gr.addColorStop(1, '#a7b1bd'); ctx.fillStyle = gr; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
    else {
      ctx.fillStyle = '#e8edf3'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      for (let i = 0; i < 260; i++) {
        const a = rnd(i) * 6.283, d = Math.sqrt(rnd(i + 500)) * R, x = cx + d * Math.cos(a), y = cy + d * Math.sin(a), s = (3 + rnd(i + 900) * 9) * R / 100, sh = 205 + Math.floor(rnd(i + 1300) * 50);
        ctx.fillStyle = `rgb(${sh},${sh + 2},${Math.min(255, sh + 6)})`; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + s * (rnd(i + 2) * 2 - 0.4), y + s * (rnd(i + 3) * 1.4 - 0.7)); ctx.lineTo(x + s * (rnd(i + 4) * 1.6), y + s * (0.3 + rnd(i + 5))); ctx.closePath(); ctx.fill();
        if (i % 3 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1.6, 1.6); }
      }
    }
    // zona de fatiga (grano fino)
    const fatiguePath = () => {
      ctx.beginPath();
      if (!ring) ctx.arc(ox, oy, depth * (M.rf / M.amax) * M.R * k, 0, 7);
      else { ctx.arc(cx, cy, R * 1.01, 0, 7); ctx.arc(cx, cy, R * (1 - depth), 0, 7, true); }
    };
    if (depth > 0.002) {
      ctx.save(); fatiguePath(); if (ring) ctx.clip('evenodd'); else ctx.clip();
      const fg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); fg.addColorStop(0, shade(fatigueFill, 10)); fg.addColorStop(1, shade(fatigueFill, -14));
      ctx.fillStyle = fg; ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
      for (let i = 0; i < 320; i++) { const a = rnd(i + 70) * 6.283, d = Math.sqrt(rnd(i + 80)) * R, x = cx + d * Math.cos(a), y = cy + d * Math.sin(a); ctx.strokeStyle = rnd(i + 90) > .5 ? 'rgba(255,255,255,.10)' : 'rgba(15,23,42,.10)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 * R / 100, y + 1.2 * R / 100); ctx.stroke(); }
      // marcas de playa (onduladas y concéntricas)
      const nm = 9, rmaxLens = M.rf * k;
      for (let j = 1; j <= nm; j++) {
        const fr = Math.pow(j / (nm + 1), 0.9);
        const rj = ring ? R * (1 - fr * (M.amax / M.R)) : rmaxLens * fr;
        if (ring ? (R - rj) > depth * R + 0.5 : rj > depth * (M.rf / M.amax) * M.R * k + 0.5) continue;
        [['rgba(30,41,59,.55)', 1.7, 0], ['rgba(226,232,240,.55)', 1.1, 2.2]].forEach(([col, lw, off]) => {
          ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
          for (let i = 0; i <= 120; i++) { const th = i / 120 * 6.283, rr2 = (rj + (ring ? -off : off)) * (1 + 0.022 * Math.sin(7 * th + j * 1.7) + 0.012 * Math.sin(13 * th + j)); const px = (ring ? cx : ox) + rr2 * Math.cos(th), py = (ring ? cy : oy) + rr2 * Math.sin(th); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
        });
      }
      ctx.restore();
      // frente de grieta actual
      if (g < 1 && !broken) { ctx.save(); fatiguePath(); if (ring) ctx.clip('evenodd'); ctx.restore(); ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); if (!ring) ctx.arc(ox, oy, depth * (M.rf / M.amax) * M.R * k, 0, 7); else ctx.arc(cx, cy, R * (1 - depth), 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
    // marcas de rastrillo radiales en los puntos de inicio
    const origins = ring ? (M.nOrig ? Array.from({ length: M.nOrig }, (_, i) => a0ang + i * 2 * Math.PI / M.nOrig) : Array.from({ length: 24 }, (_, i) => i * 2 * Math.PI / 24)) : [a0ang];
    if (depth > 0.01) origins.forEach(a => {
      for (let j = -3; j <= 3; j++) { const aa = a + j * 0.075; ctx.strokeStyle = 'rgba(15,23,42,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + R * Math.cos(aa), cy + R * Math.sin(aa)); ctx.lineTo(cx + R * (1 - Math.min(0.2, depth * 0.9)) * Math.cos(aa), cy + R * (1 - Math.min(0.2, depth * 0.9)) * Math.sin(aa)); ctx.stroke(); }
    });
    ctx.restore();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    // punto de inicio (defecto)
    if (M.nOrig === 1 || (M.nOrig === 0 && false)) { ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ox, oy, 4.5, 0, 7); ctx.fill(); ctx.stroke(); }
    else if (M.nOrig > 1) origins.forEach(a => { ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx + R * Math.cos(a), cy + R * Math.sin(a), 3.5, 0, 7); ctx.fill(); ctx.stroke(); });
    if (labels) {
      const dirx = Math.cos(a0ang), diry = Math.sin(a0ang);
      const A1 = [cx + (R + 0) * dirx, cy + R * diry];
      const A2 = ring ? [cx + R * (1 - M.amax / M.R / 2) * Math.cos(2.3), cy + R * (1 - M.amax / M.R / 2) * Math.sin(2.3)] : [ox - dirx * Math.min(M.rf * k * 0.42, R * 1.1), oy - diry * Math.min(M.rf * k * 0.42, R * 1.1)];
      const tf = ring ? 0 : clamp((M.rf - M.R) / 2 + M.R * 0.5 + 0, 0.15 * M.R, 0.85 * M.R) * k / M.R * M.R;
      const A3 = ring ? [cx, cy] : [cx - dirx * Math.min(tf, 0.8 * R), cy - diry * Math.min(tf, 0.8 * R)];
      [[A1, '1', '#dc2626'], [A2, '2', '#1d4ed8'], [A3, '3', '#0f172a']].forEach(([p, t, c]) => {
        ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0] + (t === '1' ? 12 : 0), p[1] + (t === '1' ? -12 : 0), 9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(t, p[0] + (t === '1' ? 12 : 0), p[1] + (t === '1' ? -8 : 4));
      });
    }
  }

  /* ---------- máquina ---------- */
  function drawSpec(st) {
    const M = S.model, ctx = sctx, c = M.cfg, r = M.res, bend = c.method === 'bend', pm = PHASE_META[st.phase];
    ctx.clearRect(0, 0, SW, SH); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, SW, SH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= SW; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, SH); }
    for (let y = 0; y <= SH; y += 28) { ctx.moveTo(0, y); ctx.lineTo(SW, y); }
    ctx.stroke();
    const rot = S.rot, sinr = Math.sin(rot);
    const dpx = clamp(c.d * 3.4, 20, 36), rn = dpx / 2, rt = rn * 1.55;
    const cy = bend ? 160 : 150, xa = bend ? 212 : 118, xb = bend ? 470 : 400, xn = bend ? 250 : 168;
    const rfun = x => { const t = Math.abs(x - xn); if (t <= 12) return rn; if (t >= 32) return rt; const k = (t - 12) / 20; return lerp(rn, rt, k * k * (3 - 2 * k)); };
    const delta = bend ? (3 + 9 * st.load * (1 + 3 * st.g * st.g)) : 0;
    const yc = x => { const xi = clamp((x - xa) / (xb - xa), 0, 1); return cy + delta * xi * xi * (3 - xi) / 2; };
    const poly = (x0, x1, top, bot) => { ctx.beginPath(); for (let x = x0; x <= x1; x += 3) ctx.lineTo(x, yc(x) - (top ? rfun(x) : 0)); for (let x = x1; x >= x0; x -= 3) ctx.lineTo(x, yc(x) + (bot ? rfun(x) : 0)); ctx.closePath(); };
    const steel = c.mat.color || '#94a3b8';

    const drawSpecimen = () => {
      const g = ctx.createLinearGradient(0, cy - rt, 0, cy + rt); g.addColorStop(0, shade(steel, -30)); g.addColorStop(.3, shade(steel, 28)); g.addColorStop(.6, steel); g.addColorStop(1, shade(steel, -40));
      poly(xa, xb, true, true); ctx.fillStyle = g; ctx.fill();
      if (bend) {   // zonas de tracción (arriba) y compresión (abajo) según el momento flector
        const gt = ctx.createLinearGradient(xa, 0, xb, 0), gb = ctx.createLinearGradient(xa, 0, xb, 0);
        for (let i = 0; i <= 8; i++) { const x = xa + (xb - xa) * i / 8, m = clamp((xb - x) / (xb - xn), 0, 1.1); gt.addColorStop(i / 8, `rgba(220,38,38,${0.55 * m * st.load})`); gb.addColorStop(i / 8, `rgba(37,99,235,${0.55 * m * st.load})`); }
        ctx.beginPath(); for (let x = xa; x <= xb; x += 3) ctx.lineTo(x, yc(x) - rfun(x)); for (let x = xb; x >= xa; x -= 3) ctx.lineTo(x, yc(x)); ctx.closePath(); ctx.fillStyle = gt; ctx.fill();
        ctx.beginPath(); for (let x = xa; x <= xb; x += 3) ctx.lineTo(x, yc(x)); for (let x = xb; x >= xa; x -= 3) ctx.lineTo(x, yc(x) + rfun(x)); ctx.closePath(); ctx.fillStyle = gb; ctx.fill();
        // marcas que giran con la probeta
        for (let k = 0; k < 7; k++) { const x = xa + 22 + k * 36, ph = rot + k * 0.95, y = yc(x) + rfun(x) * Math.sin(ph), front = Math.cos(ph) > 0; ctx.fillStyle = front ? '#0f172a' : 'rgba(15,23,42,.18)'; ctx.beginPath(); ctx.arc(x, y, front ? 2.6 : 1.8, 0, 7); ctx.fill(); }
      } else {      // torsión: líneas generatrices que se retuercen
        const th = x => 1.0 * sinr * st.motor * clamp((x - xa) / (xb - xa), 0, 1);
        for (let i = 0; i < 4; i++) {
          const ph0 = i * Math.PI / 2 + 0.5;
          for (let x = xa; x < xb; x += 4) { const a1 = ph0 + th(x), a2 = ph0 + th(x + 4); if (Math.cos(a1) < 0 && Math.cos(a2) < 0) continue; ctx.strokeStyle = i % 2 ? 'rgba(15,23,42,.8)' : 'rgba(180,83,9,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, yc(x) + rfun(x) * Math.sin(a1)); ctx.lineTo(x + 4, yc(x + 4) + rfun(x + 4) * Math.sin(a2)); ctx.stroke(); }
        }
        const al = Math.abs(sinr) * 0.22 * st.motor; ctx.fillStyle = sinr >= 0 ? `rgba(220,38,38,${al})` : `rgba(37,99,235,${al})`; poly(xa, xb, true, true); ctx.fill();
      }
      poly(xa, xb, true, true); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke();
      // punto defectuoso y grieta en el cuello
      const phi = M.phi0 + (bend ? rot : 0), side = Math.cos(phi) > 0, yy = yc(xn) + rn * Math.sin(phi);
      if (!st.broken && (st.phase !== 'setup')) {
        if (side || !bend) {
          const crackPx = clamp(st.a * (dpx / c.d) * 0.9, 0, 2 * rn);
          if (st.g > 0.012 && !r.runout) { ctx.strokeStyle = '#020617'; ctx.lineWidth = 1.6 + (Math.sin(phi) < 0 ? 2.2 : 0); ctx.lineCap = 'round'; ctx.beginPath(); if (bend) { ctx.moveTo(xn, yy - crackPx / 2 * 0.6); ctx.lineTo(xn, yy + crackPx / 2 * 0.6); } else { const q = crackPx * 0.4; ctx.moveTo(xn - q, yy + q); ctx.lineTo(xn + q, yy - q); } ctx.stroke(); ctx.lineCap = 'butt'; }
          ctx.fillStyle = 'rgba(220,38,38,.9)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(xn, yy, 3, 0, 7); ctx.fill(); ctx.stroke();
        }
      }
    };

    // ---- elementos de la máquina ----
    const mot = st.motor;
    if (bend) {
      ctx.fillStyle = '#1e3a5f'; rr(ctx, 24, 108, 112, 104, 10); ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; for (let x = 34; x < 128; x += 9) { ctx.beginPath(); ctx.moveTo(x, 114); ctx.lineTo(x, 144); ctx.moveTo(x, 176); ctx.lineTo(x, 206); ctx.stroke(); }
      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(80, cy, 26, 0, 7); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(80, cy); ctx.lineTo(80 + 22 * Math.cos(rot), cy + 22 * Math.sin(rot)); ctx.stroke();
      ctx.fillStyle = '#e2e8f0'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('MOTOR', 80, 124);
      ctx.fillStyle = '#4ade80'; ctx.font = `700 11px ${MONO}`; ctx.fillText(`${fmt(S.freq * 60 * mot, 0)} rpm`, 80, 204);
      ctx.fillStyle = '#64748b'; ctx.fillRect(136, cy - 8, 34, 16);
      const cg = ctx.createLinearGradient(0, cy - 24, 0, cy + 24); cg.addColorStop(0, '#94a3b8'); cg.addColorStop(.5, '#e2e8f0'); cg.addColorStop(1, '#64748b');
      ctx.fillStyle = cg; rr(ctx, 170, cy - 24, 42, 48, 4); ctx.fill(); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.stroke();
      halo(ctx, 'MANDRIL', 191, cy + 42, '#475569', `700 9.5px ${FONT}`, 'center');
    } else {
      ctx.fillStyle = '#cbd5e1'; ctx.fillRect(40, 70, 40, 170); ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); for (let y = 76; y < 240; y += 10) { ctx.moveTo(40, y + 10); ctx.lineTo(80, y); } ctx.stroke(); ctx.strokeRect(40, 70, 40, 170);
      const cg = ctx.createLinearGradient(0, cy - 24, 0, cy + 24); cg.addColorStop(0, '#94a3b8'); cg.addColorStop(.5, '#e2e8f0'); cg.addColorStop(1, '#64748b');
      ctx.fillStyle = cg; rr(ctx, 80, cy - 24, 38, 48, 4); ctx.fill(); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.stroke();
      halo(ctx, 'EMPOTRAMIENTO', 70, 260, '#475569', `700 9.5px ${FONT}`, 'center');
    }

    // ---- probeta (con caída de la mitad libre tras la rotura) ----
    const ycn = yc(xn);
    if (st.broken) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, xn, SH); ctx.clip(); drawSpecimen(); ctx.restore();
      ctx.save(); ctx.translate(bend ? 0 : 16 * st.drop, 70 * st.drop * (bend ? 1 : 0.4)); ctx.translate(xn, ycn); ctx.rotate(st.drop * (bend ? 0.28 : 0.05)); ctx.translate(-xn, -ycn);
      ctx.beginPath(); ctx.rect(xn, 0, SW, SH); ctx.clip(); drawSpecimen(); drawFree(); ctx.restore();
    } else { drawSpecimen(); drawFree(); }

    function drawFree() {
      if (bend) {
        const ye = yc(xb);
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(xb, ye, rt + 9, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,.35)'; ctx.beginPath(); ctx.arc(xb, ye, rt + 9, 0, 7); ctx.arc(xb, ye, rt + 1, 0, 7, true); ctx.fill();
        const wTop = ye + rt + 46 - (1 - st.load) * 60, wh = 26 + Math.min(5, r.mass) * 6;
        ctx.globalAlpha = st.load; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb, ye + rt + 9); ctx.lineTo(xb, wTop); ctx.stroke();
        ctx.fillStyle = '#334155'; rr(ctx, xb - 36, wTop, 72, wh, 6); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; ctx.font = `700 10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(`F = ${fmt(r.Fload, 0)} N`, xb, wTop + wh / 2 + 4); ctx.globalAlpha = 1;
        halo(ctx, 'COJINETE (la carga no gira)', xb + 4, ye - rt - 16, '#475569', `700 9.5px ${FONT}`, 'center');
      } else {
        const x = xb, ccx = 484, ccy = 278, pin = [ccx + 24 * Math.cos(rot), ccy + 24 * Math.sin(rot)], tipX = ccx, tipY = pin[1] - 72;
        ctx.fillStyle = '#64748b'; rr(ctx, x, cy - 24, 28, 48, 4); ctx.fill(); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 14, cy); ctx.lineTo(tipX, tipY); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, 7); ctx.fill();
        halo(ctx, 'PALANCA', x + 34, cy - 14, '#475569', `700 9.5px ${FONT}`);
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(pin[0], pin[1]); ctx.stroke();
        halo(ctx, 'BIELA', tipX + 12, (tipY + pin[1]) / 2 + 4, '#475569', `700 9.5px ${FONT}`);
        ctx.fillStyle = '#1e3a5f'; rr(ctx, ccx - 56, ccy + 32, 112, 34, 8); ctx.fill();
        ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(ccx, ccy, 34, 0, 7); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(pin[0], pin[1], 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('MOTOR · EXCÉNTRICA', ccx, ccy + 47);
        ctx.fillStyle = '#4ade80'; ctx.font = `700 10.5px ${MONO}`; ctx.fillText(`${fmt(S.freq * 60 * mot, 0)} rpm`, ccx, ccy + 61);
      }
    }

    // ---- anotaciones ----
    if (bend) {
      const xl = xb, yD = cy - rt - 36;
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xn, yD - 4); ctx.lineTo(xn, cy - rt - 4); ctx.moveTo(xl, yD - 4); ctx.lineTo(xl, cy - rt - 14); ctx.stroke();
      arrow(ctx, (xn + xl) / 2, yD, xn, yD, '#334155', 1.2, 5); arrow(ctx, (xn + xl) / 2, yD, xl, yD, '#334155', 1.2, 5);
      halo(ctx, `L = ${fmt(c.L, 0)} mm`, (xn + xl) / 2, yD - 5, '#0f172a', `600 10.5px ${FONT}`, 'center');
      halo(ctx, 'TRACCIÓN', 330, cy - rt - 8, '#b91c1c', `700 10px ${FONT}`, 'center');
      halo(ctx, 'COMPRESIÓN', 330, cy + rt + 18, '#1d4ed8', `700 10px ${FONT}`, 'center');
      halo(ctx, 'sección crítica (cuello)', xn - 40, cy + rt + 38, '#334155', `600 10px ${FONT}`, 'center');
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xn - 10, cy + rt + 30); ctx.lineTo(xn, cy + rn + 4); ctx.stroke();
      ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(352, cy, rt + 16, -2.4, 0.5); ctx.stroke();
      arrow(ctx, 352 + (rt + 16) * Math.cos(0.45), cy + (rt + 16) * Math.sin(0.45), 352 + (rt + 16) * Math.cos(0.62), cy + (rt + 16) * Math.sin(0.62), '#0ea5e9', 2.5, 8);
      halo(ctx, 'gira', 352, cy - rt - 22, '#0369a1', `700 10px ${FONT}`, 'center');
    } else {
      halo(ctx, 'sección crítica (cuello)', xn + 40, cy + rt + 34, '#334155', `600 10px ${FONT}`, 'center');
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xn + 20, cy + rt + 26); ctx.lineTo(xn, cy + rn + 4); ctx.stroke();
      halo(ctx, `par alterno ± T = ${fmt(r.Torque, 1)} N·m`, 300, cy - rt - 20, '#334155', `700 10.5px ${FONT}`, 'center');
      halo(ctx, `brazo L = ${fmt(c.L, 0)} mm`, 552, 120, '#475569', `600 10px ${FONT}`, 'right');
    }

    // ---- sección B ----
    ctx.fillStyle = '#fff'; rr(ctx, 16, 346, 528, 258, 10); ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('SECCIÓN CRÍTICA · SUPERFICIE DE ROTURA EN FORMACIÓN', 30, 364);
    const broken = st.broken || st.phase === 'frac';
    fractureDraw(ctx, 124, 466, 78, M, st.g, broken, false);
    if (r.runout) { ctx.fillStyle = 'rgba(255,255,255,.0)'; }
    ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(broken ? 'sección rota' : (r.runout ? 'sección sin grieta' : st.g > 0.012 ? 'la grieta avanza (frente naranja)' : 'sección sana'), 124, 568);
    [['#7e8998', 'Grano fino · marcas de playa', 30], ['#e8edf3', 'Grano grueso brillante (final)', 205], ['#a7b1bd', 'Sección sana', 395]].forEach(([cc, t, x]) => {
      ctx.fillStyle = cc; ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.fillRect(x, 585, 12, 12); ctx.strokeRect(x, 585, 12, 12);
      ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(t, x + 17, 595);
    });
    // osciloscopio del ciclo de esfuerzo
    const sx = 262, sy = 374, sw = 270, sh = 150, mid = sy + sh / 2 - 6;
    ctx.fillStyle = '#0f172a'; rr(ctx, sx, sy, sw, sh, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx + 8, sy + i * sh / 4); ctx.lineTo(sx + sw - 8, sy + i * sh / 4); ctx.stroke(); }
    ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(sx + 8, mid); ctx.lineTo(sx + sw - 8, mid); ctx.stroke();
    const amp = 46, w0 = sx + 14, ww = sw - 28, tot = 4 * Math.PI;
    const px = ph => w0 + ph / tot * ww;
    ctx.beginPath(); for (let i = 0; i <= 160; i++) { const ph = i / 160 * tot, y = mid - amp * Math.sin(ph) * (mot > 0.02 || st.phase === 'start' ? 1 : 1); i ? ctx.lineTo(px(ph), y) : ctx.moveTo(px(ph), y); }
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
    const ph0 = ((rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    [ph0, ph0 + 2 * Math.PI].forEach(pp => { const y = mid - amp * Math.sin(pp); ctx.fillStyle = Math.sin(pp) >= 0 ? '#f87171' : '#60a5fa'; ctx.beginPath(); ctx.arc(px(pp), y, 5.5, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#f87171'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(bend ? '+σa  TRACCIÓN' : '+τa  (par +)', sx + 12, sy + 16);
    ctx.fillStyle = '#60a5fa'; ctx.fillText(bend ? '−σa  COMPRESIÓN' : '−τa  (par −)', sx + 12, sy + sh - 8);
    ctx.fillStyle = '#cbd5e1'; ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText(`T = ${fmt(1000 / S.freq, 1)} ms`, sx + sw - 10, sy + 16);
    ctx.fillStyle = '#334155'; ctx.font = `600 10.5px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(`${bend ? 'σ' : 'τ'}max = +${fmt(c.sa, 0)}  ${bend ? 'σ' : 'τ'}min = −${fmt(c.sa, 0)}  media = 0`, sx, sy + sh + 20);
    ctx.fillText(`R = −1 · f = ${fmt(S.freq, 0)} Hz`, sx, sy + sh + 38);
    // fibra de la sección que gira
    const mcx = 512, mcy = 548, mr = 18, al = rot - Math.PI / 2;
    ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(mcx, mcy, mr, 0, 7); ctx.fill(); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.stroke();
    const sg = Math.sin(rot); ctx.fillStyle = sg >= 0 ? '#dc2626' : '#2563eb'; ctx.beginPath(); ctx.arc(mcx + mr * Math.sin(al), mcy - mr * Math.cos(al), 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(bend ? (sg >= 0 ? 'fibra: tracción' : 'fibra: compresión') : (sg >= 0 ? 'par +' : 'par −'), mcx, mcy + mr + 12);

    // chivato de fase
    ctx.fillStyle = pm.color; rr(ctx, 400, 14, 140, 26, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(pm.short.toUpperCase(), 470, 31);
  }

  /* ---------- gráficas ---------- */
  function niceTicks(min, max, n = 6) {
    const raw = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
    const step = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, arr = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) arr.push(v);
    return { arr, step };
  }

  function drawSN(st) {
    const M = S.model, ctx = nctx, W = 640, H = 340, r = M.res, c = M.cfg;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const m = { l: 56, r: 14, t: 18, b: 42 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xmin = 2, xmax = Math.log10(M.Nlim) + 1, ymax = r.ampMax * 1.1;
    const X = n => m.l + (Math.log10(Math.max(n, 100)) - xmin) / (xmax - xmin) * pw, Y = a => m.t + ph - a / ymax * ph;
    const bands = [[2, 5, '#d97706', 'BAJO Nº DE CICLOS'], [5, Math.log10(M.Nlim), '#2563eb', 'ALTO Nº DE CICLOS'], [Math.log10(M.Nlim), xmax, '#16a34a', 'VIDA INFINITA']];
    bands.forEach(([a, b, col, t]) => { const x0 = m.l + (a - xmin) / (xmax - xmin) * pw, x1 = m.l + (b - xmin) / (xmax - xmin) * pw; ctx.fillStyle = col + '12'; ctx.fillRect(x0, m.t, x1 - x0, ph); ctx.fillStyle = col; ctx.font = `700 9.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(t, (x0 + x1) / 2, m.t + 11); });
    ctx.font = `10.5px ${FONT}`; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for (let e = xmin; e <= xmax; e++) { const x = m.l + (e - xmin) / (xmax - xmin) * pw; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText('10' + String(e).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]), x, m.t + ph + 15); }
    const ty = niceTicks(0, ymax, 5); ty.arr = ty.arr.map(v => Math.abs(v) < 1e-9 ? 0 : v); ctx.textAlign = 'right'; ty.arr.forEach(v => { const y = Y(v); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.fillText(fmt(v, 0), m.l - 6, y + 4); });
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `600 11.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Número de ciclos hasta la rotura N (escala logarítmica)', m.l + pw / 2, H - 6);
    ctx.save(); ctx.translate(14, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`Amplitud ${r.unit} (MPa)`, 0, 0); ctx.restore();

    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    const curve = (eff, col, lw, dash) => {
      ctx.setLineDash(dash || []); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (let i = 0; i <= 140; i++) { const e = lerp(xmin, xmax, i / 140), N = Math.pow(10, e), n2 = (M.ferrous && N >= 1e6) ? 1e6 : N, a = M.ampAt(n2, eff); i ? ctx.lineTo(X(N), Y(a)) : ctx.moveTo(X(N), Y(a)); } ctx.stroke(); ctx.setLineDash([]);
    };
    curve(false, '#94a3b8', 1.8, [5, 4]); curve(true, '#2563eb', 2.6);
    // amplitud aplicada
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(m.l, Y(c.sa)); ctx.lineTo(m.l + pw, Y(c.sa)); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    halo(ctx, `${r.unit} aplicada = ${fmt(c.sa, 0)} MPa`, m.l + pw - 4, Y(c.sa) - 6, '#6d28d9', `700 10.5px ${FONT}`, 'right');
    halo(ctx, 'probeta pulida sin defectos', m.l + 8, Y(M.ampAt(100, false)) + 16, '#64748b', `600 10px ${FONT}`);
    halo(ctx, 'con acabado y defecto del ensayo', m.l + 8, Y(M.ampAt(100, true)) + 16, '#1d4ed8', `600 10px ${FONT}`);
    // puntos registrados
    S.points.forEach(p => { const x = X(p.N), y = Y(p.s); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke(); if (p.runout) arrow(ctx, x + 6, y, x + 22, y, '#7c3aed', 2, 6); });
    // marcador vivo: consumo de vida
    const xN = X(Math.max(st.N, 100)), yS = Y(c.sa), show = st.p >= M.pEnd || r.runout && st.p >= M.pEnd;
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(100), yS); ctx.lineTo(xN, yS); ctx.stroke();
    ctx.fillStyle = '#7c3aed'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xN, yS, 6, 0, 7); ctx.fill(); ctx.stroke();
    if (!r.runout) { const xf = X(r.N); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xf, yS, 8, 0, 7); ctx.stroke(); if (show) halo(ctx, `rotura: ${fmtN(r.N)}`, xf, yS + 22, '#b91c1c', `700 10.5px ${FONT}`, 'center'); }
    else if (show) { arrow(ctx, X(M.Nlim), yS, X(M.Nlim) + 28, yS, '#16a34a', 2.5, 8); halo(ctx, 'sin rotura', X(M.Nlim) + 6, yS - 10, '#15803d', `700 10.5px ${FONT}`, 'center'); }
    // información
    let info = `Límite de fatiga efectivo (curva azul): ${r.unit.replace('a', '')}e,ef ≈ ${fmt(r.SeEff, 0)} MPa frente a ${fmt(r.SeBase, 0)} MPa de la probeta pulida (curva gris).`;
    const ro = S.points.filter(p => p.runout).map(p => p.s);
    if (S.points.length >= 4) info += ro.length ? ` Con la serie: mayor amplitud sin rotura ≈ ${fmt(Math.max(...ro), 0)} MPa.` : ' En la serie ninguna probeta llegó al límite de ciclos.';
    else info += ' Pulsa «Simular serie de probetas» para obtener la curva experimental con dispersión.';
    $('faSNInfo').textContent = info;
  }

  function drawCrack(st) {
    const M = S.model, ctx = kctx, W = 320, H = 240, r = M.res;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const m = { l: 50, r: 12, t: 16, b: 38 }, pw = W - m.l - m.r, ph = H - m.t - m.b, xmax = r.runout ? M.Nlim : M.Nf, ymax = M.amax * 1.08;
    const X = n => m.l + n / xmax * pw, Y = a => m.t + ph - a / ymax * ph;
    const tx = niceTicks(0, xmax, 4), ty = niceTicks(0, ymax, 4); tx.arr = tx.arr.map(v => Math.abs(v) < 1e-9 ? 0 : v); ty.arr = ty.arr.map(v => Math.abs(v) < 1e-9 ? 0 : v);
    ctx.font = `10px ${FONT}`; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.textAlign = 'center'; tx.arr.forEach(v => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.fillText(fmtN(v), x, m.t + ph + 13); });
    ctx.textAlign = 'right'; ty.arr.forEach(v => { const y = Y(v); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.fillText(fmt(v, 1), m.l - 5, y + 3); });
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `600 10.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Ciclos N', m.l + pw / 2, H - 6);
    ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Profundidad de grieta a (mm)', 0, 0); ctx.restore();
    if (r.runout) { halo(ctx, 'Sin grieta: la amplitud está por debajo', m.l + pw / 2, m.t + ph / 2 - 6, '#15803d', `700 10.5px ${FONT}`, 'center'); halo(ctx, 'del límite de fatiga efectivo', m.l + pw / 2, m.t + ph / 2 + 10, '#15803d', `700 10.5px ${FONT}`, 'center'); ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m.l, Y(0)); ctx.lineTo(X(st.N), Y(0)); ctx.stroke(); return; }
    const xi = X(M.Ni); ctx.fillStyle = 'rgba(217,119,6,.08)'; ctx.fillRect(m.l, m.t, xi - m.l, ph); ctx.fillStyle = 'rgba(37,99,235,.08)'; ctx.fillRect(xi, m.t, m.l + pw - xi, ph);
    ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#d97706'; ctx.fillText('INICIACIÓN', (m.l + xi) / 2, m.t + 11); ctx.fillStyle = '#2563eb'; ctx.fillText('PROPAGACIÓN', (xi + m.l + pw) / 2, m.t + 11);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath(); M.samples.forEach((s, i) => i ? ctx.lineTo(X(s.N), Y(s.a)) : ctx.moveTo(X(s.N), Y(s.a))); ctx.stroke();
    ctx.lineWidth = 3; let cur = null; ctx.beginPath();
    for (const s of M.samples) { if (s.p > st.p) break; const col = s.phase === 'init' || s.phase === 'setup' || s.phase === 'start' ? '#d97706' : '#2563eb'; if (col !== cur) { if (cur) ctx.lineTo(X(s.N), Y(s.a)); ctx.stroke(); cur = col; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(X(s.N), Y(s.a)); } else ctx.lineTo(X(s.N), Y(s.a)); }
    ctx.lineTo(X(st.N), Y(st.a)); ctx.stroke();
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(st.N), Y(st.a), 5, 0, 7); ctx.fill(); ctx.stroke();
    halo(ctx, `a = ${fmt(st.a, 2)} mm`, clamp(X(st.N) - 8, m.l + 40, m.l + pw - 4), Y(st.a) + 16, '#0f172a', `700 10.5px ${FONT}`, 'right');
  }

  function drawFrac(st) {
    const M = S.model, ctx = fctx, W = 340, H = 360, r = M.res, show = st.p >= revealP(M);
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const cx = 170, cy = 142, R = 112;
    if (r.runout) {
      fractureDraw(ctx, cx, cy, R, M, 0, false, false);
      ctx.fillStyle = '#334155'; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(show ? 'Sección sin grieta: no hay superficie de rotura' : 'Se mostrará al terminar el ensayo', W / 2, 290);
      $('faFracInfo').textContent = show ? 'La probeta no rompe: la amplitud aplicada es menor que el límite de fatiga efectivo. Para ver la superficie de rotura aumenta la amplitud o añade un defecto.' : '';
      return;
    }
    fractureDraw(ctx, cx, cy, R, M, show ? 1 : 0, show, show);
    if (!show) { ctx.fillStyle = '#64748b'; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Se mostrará al producirse la rotura', W / 2, 290); $('faFracInfo').textContent = ''; return; }
    ctx.font = `600 10.5px ${FONT}`; ctx.textAlign = 'left';
    [['#dc2626', '1', 'Punto de inicio (defecto superficial)'], ['#1d4ed8', '2', 'Grano fino y marcas de playa onduladas (propagación)'], ['#0f172a', '3', 'Grano grueso y brillante (rotura final brusca)']].forEach(([c, n, t], i) => {
      const y = 290 + i * 22; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(26, y - 4, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(n, 26, y); ctx.fillStyle = '#334155'; ctx.font = `600 10.5px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(t, 42, y);
    });
    $('faFracInfo').textContent = `Zona de fatiga: ${fmt((1 - r.ffinal) * 100, 0)} % de la sección (grano fino). Zona de rotura final: ${fmt(r.ffinal * 100, 0)} % (grano grueso brillante). ${r.bend ? 'La grieta nace en un punto de la superficie y avanza en abanico.' : 'En torsión nacen varias grietas (marcas radiales) y avanza una corona hacia el núcleo.'} ${r.ffinal < 0.2 ? 'Zona final pequeña: tensión nominal baja.' : r.ffinal > 0.45 ? 'Zona final grande: tensión nominal alta.' : ''}`;
  }

  /* =================================================================
     RENDER
  ================================================================= */
  function renderHero(M, rev) {
    const r = M.res, c = M.cfg;
    const valid = r.ok ? '<span class="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">ENSAYO VÁLIDO</span>' : `<span class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white">REVISAR · ${r.nFail} condición${r.nFail > 1 ? 'es' : ''}</span>`;
    const outcome = r.runout ? '<span class="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">VIDA INFINITA</span>' : '<span class="rounded-md bg-red-700 px-2.5 py-1 text-xs font-bold text-white">ROTURA POR FATIGA</span>';
    const fails = M.checks.filter(k => k.ok === false).map(k => `<li>${k.hint}</li>`).join('');
    $('faHero').innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3">
      <div><div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado · ${c.method === 'bend' ? 'Flexión rotativa' : 'Torsión alternativa'}</div>
      <div class="mt-0.5 font-mono text-2xl font-bold sm:text-3xl ${rev ? 'text-slate-900' : 'text-slate-300'}">${rev ? r.designation : '— — —'}</div>
      <div class="text-xs text-slate-500">${rev ? `${r.regime} · ${r.runout ? '' : `duración real ${hms(r.N / c.f)} a ${fmt(c.f, 0)} Hz · `}${r.unit} = ${fmt(c.sa, 0)} MPa` : 'Se obtiene al terminar el ensayo'}</div></div>
      <div class="max-w-md text-sm"><div class="mb-1 flex flex-wrap gap-1.5">${valid}${rev ? outcome : ''}</div>
      ${r.ok ? '<div class="text-slate-700">Condiciones de ensayo correctas.</div>' : `<div class="text-slate-700">Qué corregir:<ul class="mt-1 list-inside list-disc text-slate-600">${fails}</ul></div>`}</div></div>`;
  }
  function render() {
    const M = S.model; if (!M || LAB.active !== 'fat') return;
    const st = M.state(S.p), pm = PHASE_META[st.phase], r = M.res, f = S.freq;
    drawSpec(st); drawSN(st); drawCrack(st); drawFrac(st);
    $('faN').textContent = Math.round(st.N).toLocaleString('es-ES'); $('faHz').textContent = fmt(f, 0);
    $('faT').textContent = hms(st.N / f); $('faSeek').value = Math.round(S.p * 1000);
    $('faFreqTxt').textContent = fmt(f, 0); $('faRpm').textContent = fmt(f * 60, 0);
    const b = $('faBadge'); b.style.background = pm.color; b.textContent = pm.label.toUpperCase();
    const [t, tx, fm] = explainF(M, st);
    $('faExTitle').textContent = t; $('faExText').textContent = tx; $('faExFormula').textContent = fm; $('faExp').style.borderColor = pm.color;
    $('faChips').querySelectorAll('button').forEach(btn => { const on = btn.dataset.id === st.phase, c = PHASE_META[btn.dataset.id].color; btn.style.background = on ? c : '#fff'; btn.style.color = on ? '#fff' : c; btn.style.borderColor = c; });
    const rp = revealP(M); paramRows.forEach(pr => { pr.row.style.opacity = (pr.rev === 0 || S.p >= pr.rev) ? 1 : 0.28; });
    const rev = S.p >= rp; if (lastRevealed !== rev) { renderHero(M, rev); lastRevealed = rev; }
    void r;
  }

  /* =================================================================
     ARRANQUE
  ================================================================= */
  mSel.value = 'ac045'; $('faDefect').value = 'scratch'; fillMat('ac045'); $('faSa').value = 250; syncCfg();
  apply(readCfg().cfg);
})();
