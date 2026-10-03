/* Interfaz del ensayo de resiliencia (péndulo de Charpy): configuración, simulación y análisis */
(function () {
  'use strict';
  const { MATERIALS, PHASE_META, buildCharpy, crossing } = window.CharpyModel;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fmt = (x, d = 1) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const LAB = window.LAB;
  const DURATION = 34;
  const S = { model: null, p: 0, playing: false, dir: 1, speed: 1, last: 0, started: false, points: [] };

  /* =================================================================
     TEXTOS
  ================================================================= */
  function explainR(M, st) {
    const T = M.cfg.T;
    const X = {
      cond: ['Acondicionamiento térmico', 'La probeta se mantiene en un baño a la temperatura de ensayo (mín. 5 min en líquido) para que toda su sección alcance esa temperatura. La resiliencia de los aceros ferríticos depende mucho de ella.', `T de ensayo = ${fmt(T, 0)} °C`],
      transfer: ['Traslado y colocación', 'La probeta se saca del baño y se centra sobre los apoyos en menos de 5 s, con la entalla en la cara opuesta al percutor, para que su temperatura no cambie.', 'Δt ≤ 5 s'],
      fall: ['Caída del péndulo', 'El péndulo se suelta desde su altura inicial: la energía potencial se transforma en cinética. En el punto más bajo alcanza la velocidad de impacto (5 – 5,5 m/s).', 'W₀ = m·g·L·(1 − cos α) = ½·m·v²'],
      impact: ['Impacto y rotura (cámara lenta)', 'El percutor golpea la cara opuesta a la entalla: flexión en tres puntos. Las tensiones se concentran en el fondo de la entalla, la grieta avanza y la probeta rompe. La energía absorbida se gasta en deformación plástica y en crear la fractura.', 'K = W₀ − energía que le queda al péndulo'],
      rise: ['Ascenso del péndulo', 'Con la energía que no absorbió la probeta, el péndulo sigue su camino y sube hasta un ángulo β menor que α. Cuanto menor es β, más energía absorbió la probeta.', 'K = m·g·L·(cos β − cos α)'],
      read: ['Lectura de la energía', 'La aguja arrastrada marca el ángulo máximo β y la escala lo convierte en energía absorbida K. La resiliencia ρ es K dividida entre la sección bajo la entalla.', 'ρ = K / S₀   (J/cm²)'],
      frac: ['Examen de la fractura', 'Se observa la superficie rota: zona fibrosa (dúctil, mate, con deformación) y zona cristalina (frágil, brillante). Cuanto más fibrosa, más dúctil y mayor es K.', 'Aspecto = % de superficie fibrosa'],
    };
    return X[st.phase];
  }
  const FORMULAS = [
    ['W₀ = m·g·L·(1 − cos α)', 'Energía inicial del péndulo', ['m: masa del péndulo (kg) · g = 9,81 m/s²', 'L: distancia del eje al centro de gravedad (m)', 'α: ángulo inicial respecto de la vertical']],
    ['v = √(2·g·L·(1 − cos α))', 'Velocidad de impacto', ['En el punto más bajo; la norma exige 5 – 5,5 m/s']],
    ['K = m·g·L·(cos β − cos α)', 'Energía absorbida por la probeta', ['β: ángulo máximo que alcanza el péndulo tras romper la probeta', 'Se expresa en julios (J) y se designa KV (entalla en V) o KU (entalla en U)']],
    ['ρ = K / S₀', 'Resiliencia', ['S₀: sección de la probeta bajo la entalla (cm²)', 'Unidades: J/cm² (1 J = 0,102 kgm)']],
    ['K(T) = K_b + (K_a − K_b)/2 · [1 + tanh((T − T_t)/C)]', 'Curva de transición dúctil-frágil', ['K_a / K_b: meseta alta (dúctil) y baja (frágil)', 'T_t: temperatura de transición · C: anchura de la transición']],
    ['% fibroso = (S_fibrosa / S₀) · 100', 'Aspecto de la fractura', ['Se estima por observación de la superficie de rotura']],
  ];
  const VOCAB = [
    ['Resiliencia', 'Energía que absorbe un material por unidad de sección al romper bajo un impacto.'],
    ['Péndulo de Charpy', 'Máquina que rompe la probeta con un martillo en forma de péndulo.'],
    ['Percutor', 'Parte del péndulo que golpea la probeta (cuchilla con radio 2 u 8 mm).'],
    ['Apoyos (yunque)', 'Soportes entre los que se coloca la probeta (luz de 40 mm).'],
    ['Entalla', 'Ranura en V o en U que concentra las tensiones y favorece la rotura.'],
    ['KV / KU', 'Energía absorbida con entalla en V o en U.'],
    ['Energía absorbida K', 'Energía que pierde el péndulo al romper la probeta.'],
    ['Ángulo de ascenso β', 'Ángulo máximo que alcanza el péndulo después del impacto.'],
    ['Aguja arrastrada', 'Indicador que el péndulo empuja y que marca β en la escala.'],
    ['Fractura dúctil', 'Rotura con mucha deformación plástica, superficie fibrosa y alta energía.'],
    ['Fractura frágil', 'Rotura casi sin deformación, superficie cristalina y brillante, baja energía.'],
    ['Temperatura de transición', 'Temperatura a la que el comportamiento pasa de frágil a dúctil (aceros ferríticos).'],
    ['Meseta superior / inferior', 'Zonas de la curva K-T donde la energía es alta (dúctil) o baja (frágil).'],
    ['Expansión lateral', 'Ensanchamiento de la probeta junto a la fractura; mide la deformación plástica.'],
    ['Labios de cizalladura', 'Bordes inclinados 45° de la superficie de fractura dúctil.'],
    ['Tenacidad', 'Capacidad del material de absorber energía antes de romper.'],
  ];
  const resFooter = {
    f: FORMULAS.map(([f, t, items]) => `<div class="rounded-lg bg-slate-800/70 p-3"><div class="flex flex-wrap items-baseline gap-x-3"><span class="font-mono text-[15px] font-semibold text-blue-200">${f}</span><span class="text-xs uppercase tracking-wide text-slate-400">${t}</span></div><ul class="mt-1 list-inside list-disc text-[13px] text-slate-300">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join(''),
    v: VOCAB.map(([t, d]) => `<div><dt class="font-semibold text-emerald-200">${t}</dt><dd class="text-[13px] text-slate-300">${d}</dd></div>`).join(''),
  };
  LAB.register('res', { dlg: 'cfgR', btn: 'tabRes', main: 'mainRes', hdr: 'hdrRes', title: 'Ensayo de resiliencia', grid: true, footer: resFooter,
    pause: () => setPlaying(false), onShow: () => { render(); if (!S.started) { S.started = true; dlg.showModal(); } } });

  /* =================================================================
     CONFIGURACIÓN
  ================================================================= */
  const dlg = $('cfgR'), mSel = $('rMatSel');
  Object.entries(MATERIALS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.name; mSel.appendChild(o); });
  function syncKind() { const flat = $('rKind').value === 'flat'; ['rgLow', 'rgTt', 'rgC'].forEach(id => $(id).style.display = flat ? 'none' : ''); $('rKup').previousElementSibling.textContent = flat ? 'K (J)' : 'K meseta alta (J)'; }
  function updPrev() { const lig = $('rNotch').value === 'V' ? 8 : 5; $('rS0').textContent = fmt(lig * +$('rWid').value, 0) + ' mm²'; }
  function fillMat(k) { const m = MATERIALS[k]; $('rKind').value = m.kind; $('rKup').value = m.Kup; $('rKlow').value = m.Klow; $('rTt').value = m.Tt; $('rC').value = m.C; syncKind(); }
  mSel.onchange = () => fillMat(mSel.value);
  $('rKind').onchange = () => { mSel.value = 'custom'; syncKind(); };
  ['rKup', 'rKlow', 'rTt', 'rC'].forEach(id => $(id).addEventListener('input', () => { mSel.value = 'custom'; }));
  ['rNotch', 'rWid'].forEach(id => $(id).onchange = updPrev);
  $('rBtnCfg').onclick = () => { setPlaying(false); dlg.showModal(); };
  $('rClose').onclick = $('rCancel').onclick = () => dlg.close();

  function readCfg() {
    const base = MATERIALS[mSel.value], kind = $('rKind').value, Kup = +$('rKup').value;
    const mat = { name: base.name, color: base.color, kind, Kup, Klow: kind === 'flat' ? Kup : +$('rKlow').value, Tt: +$('rTt').value, C: +$('rC').value,
      duct: mSel.value === 'custom' ? clamp(Kup / 60, 0, 1) : base.duct };
    const cfg = { cap: +$('rCap').value, striker: +$('rStr').value, notch: $('rNotch').value, B: +$('rWid').value, mat, T: +$('rTemp').value, transfer: +$('rTrans').value, Kmin: +$('rKmin').value };
    const errs = [];
    if (!(Kup > 0)) errs.push('K de la meseta alta debe ser positivo.');
    if (kind === 'transition') { if (!(mat.Klow > 0 && mat.Klow < Kup)) errs.push('K de la meseta baja debe ser positivo y menor que la alta.'); if (!(mat.C >= 3)) errs.push('La anchura de la transición debe ser ≥ 3 °C.'); }
    if (!isFinite(cfg.T) || cfg.T < -196 || cfg.T > 600) errs.push('Temperatura entre −196 y 600 °C.');
    if (!(cfg.transfer > 0)) errs.push('El tiempo de traslado debe ser positivo.');
    if (!(cfg.Kmin > 0)) errs.push('La energía mínima debe ser positiva.');
    return { cfg, errs };
  }
  $('rForm').addEventListener('submit', e => {
    e.preventDefault();
    const { cfg, errs } = readCfg(), box = $('rErr');
    if (errs.length) { box.textContent = errs.join(' '); box.classList.remove('hidden'); return; }
    box.classList.add('hidden'); dlg.close(); apply(cfg); setPlaying(true, 1);
  });

  /* =================================================================
     APLICAR
  ================================================================= */
  let paramRows = [], lastRevealed = null;
  function apply(cfg) {
    const M = buildCharpy(cfg), r = M.res;
    S.model = M; S.p = 0; S.dir = 1; S.points = []; lastRevealed = null;
    $('rhMach').textContent = `Charpy ${cfg.cap} J · R${cfg.striker}`;
    $('rhMat').textContent = cfg.mat.name;
    $('rhSpec').textContent = `10 × ${cfg.B} × 55 mm`;
    $('rhNotch').textContent = cfg.notch === 'V' ? 'V (2 mm)' : 'U (5 mm)';
    $('rhT').textContent = `${fmt(cfg.T, 0)} °C`;
    $('rhKmin').textContent = `K${cfg.notch} ≥ ${fmt(cfg.Kmin, 0)} J`;
    buildChips(M); buildParams(M); buildChecks(M); buildReco(M);
    render();
  }
  function buildChips(M) {
    const box = $('rChips'); box.innerHTML = '';
    M.phases.forEach(ph => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = ph.id;
      b.className = 'rounded-full border px-3 py-1 text-xs font-semibold transition'; b.textContent = PHASE_META[ph.id].short;
      b.onclick = () => { setPlaying(false); S.p = clamp(ph.p0 + 0.04 * (ph.p1 - ph.p0), 0, 1); render(); };
      box.appendChild(b);
    });
  }
  function buildParams(M) {
    const r = M.res, c = M.cfg, pr = M.pRead;
    const rows = [
      ['Péndulo', `Charpy · W₀ = ${c.cap} J`, 0], ['Masa m', fmt(r.m, 1) + ' kg', 0], ['Longitud L / ángulo α', `${fmt(r.L, 2)} m / ${r.alphaDeg}°`, 0],
      ['Velocidad de impacto v', fmt(r.v0, 2) + ' m/s', 0], ['Percutor', `cuchilla 30° · R = ${c.striker} mm`, 0],
      ['Probeta', `10 × ${c.B} × 55 mm · entalla ${c.notch} ${r.depth} mm`, 0], ['Sección S₀ bajo la entalla', fmt(r.S0, 0) + ' mm²', 0],
      ['Temperatura de ensayo', fmt(c.T, 0) + ' °C', 0], ['Ángulo de ascenso β', fmt(r.betaDeg, 1) + '°', pr],
      [`Energía absorbida K${c.notch}`, r.notBroken ? `> ${fmt(0.97 * c.cap, 0)} J (no rota)` : fmt(r.K, 1) + ' J', pr],
      ['Resiliencia ρ = K / S₀', `${fmt(r.rho, 1)} J/cm² (${fmt(r.rhoKgm, 2)} kgm/cm²)`, pr],
      ['Aspecto de rotura', `${fmt(r.frac * 100, 0)} % fibroso`, pr], ['Expansión lateral', fmt(r.LE, 2) + ' mm', pr],
    ];
    const box = $('rParams'); box.innerHTML = '';
    paramRows = rows.map(([l, v, rev]) => {
      const row = document.createElement('div'); row.className = 'flex items-center justify-between gap-3 py-1.5 transition-opacity duration-300';
      row.innerHTML = `<span class="text-slate-600">${l}</span><span class="text-right font-mono font-semibold text-slate-800">${v}</span>`;
      box.appendChild(row); return { row, rev };
    });
  }
  function buildChecks(M) {
    $('rChecks').innerHTML = M.checks.map(k => {
      const ic = k.ok === true ? ['✓', 'bg-emerald-600'] : k.ok === 'warn' ? ['!', 'bg-amber-500'] : ['✕', 'bg-red-600'];
      return `<div class="flex gap-2.5"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${ic[1]}">${ic[0]}</span>
        <div class="min-w-0"><div class="text-slate-800">${k.label}</div><div class="font-mono text-xs text-slate-500">${k.value} <span class="text-slate-400">·</span> exigido ${k.limit}</div>${k.ok !== true ? `<div class="text-xs ${k.ok === false ? 'text-red-600' : 'text-amber-600'}">${k.hint}</div>` : ''}</div></div>`;
    }).join('');
  }
  function buildReco(M) {
    const r = M.res, c = M.cfg;
    const head = r.notBroken ? `<li class="list-none font-semibold text-red-700">La probeta no se rompe: la energía supera la capacidad del péndulo.</li>`
      : `<li class="list-none"><b>Régimen ${r.regime}:</b> ${fmt(r.frac * 100, 0)} % de superficie fibrosa y K${c.notch} = ${fmt(r.K, 0)} J a ${fmt(c.T, 0)} °C.</li>`;
    $('rReco').innerHTML = head + M.reco.map(t => `<li>${t}</li>`).join('');
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
    $('rTPlay').textContent = fwd ? 'Pausa' : 'Reproducir';
    $('rIcPlay').innerHTML = fwd ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M6 4l14 8-14 8z"/>';
    $('rbRev').classList.toggle('bg-blue-100', on && S.dir < 0);
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
  $('rbPlay').onclick = () => setPlaying(!(S.playing && S.dir > 0), 1);
  $('rbRev').onclick = () => (S.playing && S.dir < 0) ? setPlaying(false) : setPlaying(true, -1);
  $('rbStart').onclick = () => { setPlaying(false); S.p = 0; render(); };
  $('rbEnd').onclick = () => { setPlaying(false); S.p = 1; render(); };
  $('rbBack').onclick = () => { setPlaying(false); S.p = clamp(S.p - STEP, 0, 1); render(); };
  $('rbFwd').onclick = () => { setPlaying(false); S.p = clamp(S.p + STEP, 0, 1); render(); };
  $('rSpeed').onchange = e => S.speed = +e.target.value;
  $('rSeek').oninput = e => { setPlaying(false); S.p = +e.target.value / 1000; render(); };
  window.addEventListener('keydown', e => {
    if (LAB.active !== 'res' || dlg.open || (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); $('rbPlay').click(); }
    else if (e.code === 'ArrowRight') $('rbFwd').click(); else if (e.code === 'ArrowLeft') $('rbBack').click();
    else if (e.code === 'Home') $('rbStart').click(); else if (e.code === 'End') $('rbEnd').click();
  });
  $('rbReg').onclick = () => {
    const M = S.model; if (!M) return;
    S.points = S.points.filter(q => q.T !== M.cfg.T).concat([{ T: M.cfg.T, K: M.res.K, own: true }]); render();
  };
  $('rbSeries').onclick = () => { const M = S.model; if (!M) return; S.points = M.series(); render(); };
  $('rbClear').onclick = () => { S.points = []; render(); };

  /* =================================================================
     CANVAS
  ================================================================= */
  function setupCanvas(cv, w, h) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.aspectRatio = w + ' / ' + h;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  }
  const SW = 560, SH = 780;
  const sctx = setupCanvas($('cvRSpec'), SW, SH), ectx = setupCanvas($('cvREn'), 640, 260), tctx = setupCanvas($('cvRTr'), 640, 320), fctx = setupCanvas($('cvRFrac'), 320, 230);
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  function arrow(ctx, x1, y1, x2, y2, color, w = 1.5, head = 6) {
    const a = Math.atan2(y2 - y1, x2 - x1); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4)); ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), c = v => clamp(v + amt, 0, 255); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }
  function halo(ctx, txt, x, y, color, font, align = 'left') { ctx.font = font; ctx.textAlign = align; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y); }
  const tempColor = T => T <= 0 ? `rgb(${Math.round(lerp(120, 56, clamp(-T / 100, 0, 1)))},${Math.round(lerp(190, 130, clamp(-T / 100, 0, 1)))},248)` : T < 60 ? '#cbd5e1' : `rgb(248,${Math.round(lerp(160, 80, clamp((T - 60) / 140, 0, 1)))},${Math.round(lerp(120, 70, clamp((T - 60) / 140, 0, 1)))})`;

  /* ---------- péndulo + detalle de la probeta ---------- */
  function drawSpec(st) {
    const M = S.model, ctx = sctx, r = M.res, c = M.cfg, pm = PHASE_META[st.phase];
    ctx.clearRect(0, 0, SW, SH); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, SW, SH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= SW; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, SH); }
    for (let y = 0; y <= SH; y += 28) { ctx.moveTo(0, y); ctx.lineTo(SW, y); }
    ctx.stroke();

    // ---- máquina ----
    const cx = 280, cy = 190, Lc = 165, tip = 198;
    const col = ctx.createLinearGradient(cx - 26, 0, cx + 26, 0); col.addColorStop(0, '#94a3b8'); col.addColorStop(.5, '#e2e8f0'); col.addColorStop(1, '#94a3b8');
    ctx.fillStyle = col; rr(ctx, cx - 26, 150, 52, 280, 6); ctx.fill();
    ctx.fillStyle = '#334155'; rr(ctx, 80, 430, 400, 22, 4); ctx.fill();
    ctx.fillStyle = '#475569'; rr(ctx, 244, 398, 72, 32, 4); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('YUNQUE', cx, 445);

    // escala graduada en julios (aguja arrastrada)
    const rIn = 70, rOut = 92, alpha = M.alpha;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(cx, cy, rOut, Math.PI / 2 - alpha, Math.PI / 2); ctx.arc(cx, cy, rIn, Math.PI / 2, Math.PI / 2 - alpha, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.stroke();
    const step = r.W0 >= 300 ? 50 : 25;
    for (let E = 0; E <= r.W0 + 1e-6; E += step / 5) {
      const th = Math.acos(clamp(Math.cos(alpha) + E / M.mgL, -1, 1)), major = Math.abs(E % step) < 1e-6;
      const sx = Math.sin(th), cyy = Math.cos(th);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = major ? 1.4 : 0.7; ctx.beginPath(); ctx.moveTo(cx + rOut * sx, cy + rOut * cyy); ctx.lineTo(cx + (rOut - (major ? 11 : 6)) * sx, cy + (rOut - (major ? 11 : 6)) * cyy); ctx.stroke();
      if (major) { ctx.fillStyle = '#1e293b'; ctx.font = `600 8.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(E), cx + (rOut + 11) * sx, cy + (rOut + 11) * cyy + 3); }
    }
    ctx.fillStyle = '#64748b'; ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('J', cx + rOut + 14, cy + 10);

    // péndulo
    const th = st.th, sx = Math.sin(th), cyy = Math.cos(th);
    const hx = cx + Lc * sx, hy = cy + Lc * cyy, tx = cx + tip * sx, ty = cy + tip * cyy;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-th);
    ctx.fillStyle = '#475569'; ctx.fillRect(-4, 0, 8, tip - 8);
    const hg = ctx.createRadialGradient(-8, Lc - 8, 4, 0, Lc, 28); hg.addColorStop(0, '#94a3b8'); hg.addColorStop(1, '#1e293b');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, Lc, 27, 0, 7); ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.moveTo(-9, tip - 12); ctx.lineTo(9, tip - 12); ctx.lineTo(2, tip + 1); ctx.lineTo(-2, tip + 1); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.fill(); ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill();
    // aguja arrastrada
    const pa = st.pointer, pxn = Math.sin(pa), pyn = Math.cos(pa);
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (rOut + 2) * pxn, cy + (rOut + 2) * pyn); ctx.stroke();
    void hx; void hy; void tx; void ty;
    // probeta en la máquina (marcador) + guía al detalle
    ctx.fillStyle = '#f1f5f9'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.fillRect(cx - 5, 388, 10, 10); ctx.strokeRect(cx - 5, 388, 10, 10);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, 452); ctx.lineTo(cx, 468); ctx.stroke(); ctx.setLineDash([]);
    halo(ctx, 'Probeta', cx + 12, 396, '#334155', `600 10px ${FONT}`);
    halo(ctx, `L = ${fmt(r.L, 2)} m`, cx - 34, 300, '#64748b', `500 10px ${FONT}`, 'right');
    ctx.save(); ctx.fillStyle = '#64748b'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(`α = ${r.alphaDeg}°`, 24, 36); ctx.restore();
    if (st.th < -0.05) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 200); ctx.stroke(); ctx.setLineDash([]); }

    // barra de energía
    const bx = 30, by = 70, bw = 26, bh = 300, W0 = r.W0;
    ctx.fillStyle = '#e2e8f0'; rr(ctx, bx, by, bw, bh, 4); ctx.fill();
    let yy = by + bh;
    [[st.Ek, '#f59e0b'], [st.Ep, '#2563eb'], [st.Eabs, '#dc2626']].forEach(([E, c2]) => { const h = E / W0 * bh; ctx.fillStyle = c2; ctx.fillRect(bx, yy - h, bw, h); yy -= h; });
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2; rr(ctx, bx, by, bw, bh, 4); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`W₀ = ${W0} J`, bx + bw / 2 + 8, by - 8);
    [['#2563eb', 'Ep'], ['#f59e0b', 'Ec'], ['#dc2626', 'K']].forEach(([c2, t], i) => { ctx.fillStyle = c2; ctx.fillRect(bx - 4 + i * 30, by + bh + 12, 10, 10); ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(t, bx + 8 + i * 30, by + bh + 21); });

    // ---- detalle en planta ----
    const px0 = 20, py0 = 468, pw = 520, ph = 296;
    ctx.fillStyle = '#fff'; rr(ctx, px0, py0, pw, ph, 10); ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('DETALLE DE LA PROBETA · VISTA EN PLANTA (×5)', px0 + 12, py0 + 18);
    if (st.phase === 'impact') { ctx.fillStyle = '#dc2626'; ctx.fillText('● CÁMARA LENTA', px0 + pw - 105, py0 + 18); }
    ctx.save(); ctx.beginPath(); ctx.rect(px0 + 2, py0 + 26, pw - 4, ph - 28); ctx.clip();
    drawPlan(ctx, st, M, px0, py0, pw, ph);
    ctx.restore();

    // chivato de fase
    ctx.fillStyle = pm.color; rr(ctx, 380, 20, 160, 26, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(pm.short.toUpperCase(), 460, 37);
  }

  function drawPlan(ctx, st, M, px0, py0, pw, ph) {
    const c = M.cfg, k = 5.2, X0 = 280, Y0 = py0 + 140;                // X(x)=X0+x·k ; cara superior (entalla) en Y0
    const cxm = x => X0 + x * k, cym = y => Y0 - y * k;
    const T = st.Tspec, tcol = tempColor(T), base = c.mat.color || '#94a3b8';
    const showBath = st.phase === 'cond' || st.phase === 'transfer';
    const bathA = st.phase === 'cond' ? 1 : 1 - ease(st.u * 1.2);

    // baño termostático
    if (showBath) {
      ctx.save(); ctx.globalAlpha = bathA;
      const lg = ctx.createLinearGradient(0, py0 + 70, 0, py0 + ph - 14); lg.addColorStop(0, tcol); lg.addColorStop(1, shade('#64748b', 20));
      ctx.fillStyle = lg; rr(ctx, 50, py0 + 70, 400, ph - 90, 10); ctx.fill(); ctx.strokeStyle = '#475569'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 14; i++) { const bx = 80 + (i * 97) % 340, by = py0 + 100 + ((i * 53 + S.p * 900) % 110); ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, 7); ctx.fill(); }
      ctx.fillStyle = '#0f172a'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(`Baño a ${fmt(c.T, 0)} °C`, 64, py0 + 90);
      ctx.restore();
    }
    // termómetro
    const tx = 495, ty0 = py0 + 40, ty1 = py0 + ph - 30;
    ctx.fillStyle = '#e2e8f0'; rr(ctx, tx - 6, ty0, 12, ty1 - ty0, 6); ctx.fill();
    const frac = clamp((T + 200) / 500, 0.02, 1); ctx.fillStyle = tcol === '#cbd5e1' ? '#94a3b8' : tcol; rr(ctx, tx - 4, ty1 - (ty1 - ty0) * frac, 8, (ty1 - ty0) * frac, 4); ctx.fill();
    ctx.beginPath(); ctx.arc(tx, ty1 + 6, 10, 0, 7); ctx.fill(); ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `700 10px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(`${fmt(T, 1)}°C`, tx, ty0 - 6);

    const anvA = showBath ? (st.phase === 'transfer' ? ease(st.u) : 0) : 1;
    // apoyos (yunque) sobre la cara de la entalla
    ctx.save(); ctx.globalAlpha = anvA;
    [-1, 1].forEach(sg => {
      const x0 = sg > 0 ? cxm(20) : cxm(-34), w = 14 * k, h = 9 * k;
      ctx.fillStyle = '#475569'; ctx.beginPath();
      if (sg > 0) { ctx.moveTo(x0, cym(9)); ctx.lineTo(x0 + w, cym(9)); ctx.lineTo(x0 + w, cym(0)); ctx.lineTo(x0 + k, cym(0)); ctx.quadraticCurveTo(x0, cym(0), x0, cym(1)); }
      else { ctx.moveTo(x0, cym(9)); ctx.lineTo(x0 + w, cym(9)); ctx.lineTo(x0 + w, cym(1)); ctx.quadraticCurveTo(x0 + w, cym(0), x0 + w - k, cym(0)); ctx.lineTo(x0, cym(0)); }
      ctx.closePath(); ctx.fill(); void h;
    });
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('APOYO', cxm(27), cym(5)); ctx.fillText('APOYO', cxm(-27), cym(5));
    // cota de la luz
    const yd = cym(14); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cxm(-20), cym(9)); ctx.lineTo(cxm(-20), yd - 3); ctx.moveTo(cxm(20), cym(9)); ctx.lineTo(cxm(20), yd - 3); ctx.stroke();
    arrow(ctx, X0, yd, cxm(-20), yd, '#334155', 1.2, 5); arrow(ctx, X0, yd, cxm(20), yd, '#334155', 1.2, 5);
    ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.fillText('luz = 40 mm', X0, yd - 5);
    ctx.restore();

    // percutor (desde abajo)
    const sMm = st.s, Rm = c.striker, tipY = -10 + sMm;
    const strA = showBath ? 0 : 1;
    if (strA > 0 && tipY < 60) {
      const Cx = X0, Cy = cym(tipY - Rm), R = Rm * k, a15 = 15 * Math.PI / 180;
      const Tl = [Cx - R * Math.cos(a15), Cy - R * Math.sin(a15)], Tr = [Cx + R * Math.cos(a15), Cy - R * Math.sin(a15)];
      const d = [Math.sin(a15), Math.cos(a15)], len = 34 * k;
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.moveTo(Tl[0], Tl[1]); ctx.arc(Cx, Cy, R, Math.PI + a15, -a15); ctx.lineTo(Tr[0] + d[0] * len, Tr[1] + d[1] * len); ctx.lineTo(Tl[0] - d[0] * len, Tl[1] + d[1] * len); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2e8f0'; ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('PERCUTOR', Cx, Cy + 40);
      if (sMm > -10 || true) { ctx.fillStyle = '#dc2626'; arrow(ctx, X0 + 70, cym(-16), X0 + 70, cym(-16) - 24, '#dc2626', 3, 8); halo(ctx, 'v', X0 + 80, cym(-16) - 8, '#dc2626', `700 11px ${FONT}`); }
    }

    // probeta
    const z = st.z, phi = Math.atan2(z, 20), notchPts = c.notch === 'V' ? [[-0.83, 0], [0, -2]] : [[-1, 0], [-1, -4], [-0.6, -4.8], [0, -5]];
    const half = [[-27.5, 0], ...notchPts, [0, -10], [-27.5, -10]];
    const rot = (p, pv, a) => { const dx = p[0] - pv[0], dy = p[1] - pv[1]; return [pv[0] + dx * Math.cos(a) - dy * Math.sin(a), pv[1] + dx * Math.sin(a) + dy * Math.cos(a)]; };
    const sepE = st.sep, flyA = 0.35 * Math.min(sepE, 2);
    const mk = sg => {   // sg = −1 (mitad izquierda), +1 (mitad derecha); cada mitad gira sobre su apoyo
      const pts = half.map(p => (sg < 0 ? [p[0], p[1]] : [-p[0], p[1]]));
      const pv = [20 * sg, 0], ang = (sg < 0 ? 1 : -1) * phi;
      return pts.map(p => {
        let q = rot(p, pv, ang);
        if (st.broken) { q = rot(q, pv, (sg < 0 ? 1 : -1) * flyA); q = [q[0] + sg * 10 * sepE, q[1] + 9 * sepE]; }
        return q;
      });
    };
    const drawHalf = pts => {
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(cxm(p[0]), cym(p[1])) : ctx.moveTo(cxm(p[0]), cym(p[1]))); ctx.closePath();
      const g = ctx.createLinearGradient(0, cym(0), 0, cym(-10)); g.addColorStop(0, shade(base, 22)); g.addColorStop(1, shade(base, -18));
      ctx.fillStyle = g; ctx.fill();
      if (T < 60) { ctx.fillStyle = tcol + '55'; ctx.fill(); } else { ctx.fillStyle = tcol + '40'; ctx.fill(); }
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.4; ctx.stroke();
    };
    ctx.save(); ctx.globalAlpha = showBath ? (st.phase === 'transfer' ? 1 : 1) : 1;
    // zona plástica alrededor de la entalla
    if (!st.broken && st.a > 0) { const gp = ctx.createRadialGradient(cxm(0), cym(-4 + z), 2, cxm(0), cym(-4 + z), 9 * k); gp.addColorStop(0, `rgba(245,158,11,${0.5 * st.a * (0.4 + 0.6 * M.res.frac)})`); gp.addColorStop(1, 'rgba(245,158,11,0)'); ctx.fillStyle = gp; ctx.fillRect(cxm(-12), cym(8 + z), 24 * k, 20 * k); }
    drawHalf(mk(-1)); drawHalf(mk(1));
    // grieta
    if (!st.broken && st.ac > 0.05) {
      const root = -M.depth + z, ln = Math.min(st.ac, M.lig);
      ctx.strokeStyle = '#020617'; ctx.lineWidth = 1.2 + 2 * Math.min(1, z / 6); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cxm(0), cym(root)); ctx.lineTo(cxm(0), cym(root - ln)); ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.restore();
    // etiquetas de la probeta
    if (!st.broken || st.sep < 0.3) {
      halo(ctx, c.notch === 'V' ? 'entalla en V' : 'entalla en U', X0 + 14, cym(z + 3.5), '#0f172a', `600 10px ${FONT}`);
    }
    if (st.phase === 'cond') halo(ctx, 'probeta 10 × ' + c.B + ' × 55 mm', X0, cym(-14), '#0f172a', `600 10px ${FONT}`, 'center');
    if (st.phase === 'transfer') {
      const used = st.tTr, ok = used <= 5;
      ctx.fillStyle = '#e2e8f0'; rr(ctx, 70, py0 + ph - 38, 300, 14, 7); ctx.fill();
      ctx.fillStyle = ok ? '#16a34a' : '#dc2626'; rr(ctx, 70, py0 + ph - 38, 300 * clamp(used / 5, 0, 1), 14, 7); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'left'; ctx.fillText(`t = ${fmt(used, 1)} s  (máx. 5 s)`, 70, py0 + ph - 44);
    }
    // pinzas durante el traslado
    if (st.phase === 'transfer') {
      const retr = clamp((st.u - 0.75) / 0.25, 0, 1), ox = lerp(0, -150, retr), oy = lerp(0, -70, retr);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60 + ox, py0 + 50 + oy); ctx.lineTo(cxm(-27.5) + ox, cym(-3) + oy); ctx.moveTo(60 + ox, py0 + 62 + oy); ctx.lineTo(cxm(-27.5) + ox, cym(-8) + oy); ctx.stroke();
      halo(ctx, 'pinzas', 70 + ox, py0 + 46 + oy, '#475569', `600 10px ${FONT}`);
    }
    // lectura
    if (st.phase === 'read' || st.phase === 'frac') {
      ctx.fillStyle = '#7c3aed'; ctx.font = `700 22px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(M.res.notBroken ? 'NO ROTA' : `K${c.notch} = ${fmt(M.res.K, 0)} J`, X0, py0 + ph - 20);
    }
    if (M.res.notBroken && (st.phase === 'rise' || st.phase === 'read' || st.phase === 'frac')) halo(ctx, 'La probeta se dobla y pasa entre los apoyos sin romper', X0, py0 + 60, '#b91c1c', `700 11px ${FONT}`, 'center');
  }

  /* ---------- gráficas ---------- */
  function niceTicks(min, max, n = 6) {
    const raw = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
    const step = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, arr = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) arr.push(v);
    return { arr, step };
  }
  function axes(ctx, W, H, o) {
    const m = o.m || { l: 56, r: 14, t: 16, b: 38 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = v => m.l + (v - o.xmin) / (o.xmax - o.xmin) * pw, Y = v => m.t + ph - (v - o.ymin) / (o.ymax - o.ymin) * ph;
    const tx = o.noX ? { arr: [] } : niceTicks(o.xmin, o.xmax, 8), ty = niceTicks(o.ymin, o.ymax, 5);
    ctx.font = `10.5px ${FONT}`; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.textAlign = 'center'; tx.arr.forEach(v => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.fillText(fmt(Math.abs(v) < 1e-9 ? 0 : v, 0), x, m.t + ph + 15); });
    ctx.textAlign = 'right'; ty.arr.forEach(v => { const y = Y(v); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.fillText(fmt(Math.abs(v) < 1e-9 ? 0 : v, 0), m.l - 6, y + 4); });
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.font = `600 11.5px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(o.xl, m.l + pw / 2, H - 6);
    ctx.save(); ctx.translate(14, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yl, 0, 0); ctx.restore();
    return { X, Y, m, pw, ph };
  }

  function drawEn(st) {
    const M = S.model, ctx = ectx, W = 640, H = 260, W0 = M.W0;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const A = axes(ctx, W, H, { xmin: 0, xmax: 1, ymin: 0, ymax: W0 * 1.06, xl: 'Progreso del ensayo (fases)', yl: 'Energía (J)', noX: true });
    ctx.textAlign = 'center';
    M.phases.forEach(ph => {
      const x0 = A.X(ph.p0), x1 = A.X(ph.p1), c = PHASE_META[ph.id].color;
      ctx.fillStyle = c + '14'; ctx.fillRect(x0, A.m.t, x1 - x0, A.ph); ctx.strokeStyle = c + '66'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, A.m.t); ctx.lineTo(x0, A.m.t + A.ph); ctx.stroke();
      ctx.fillStyle = c; ctx.font = `700 9.5px ${FONT}`; const lab = PHASE_META[ph.id].short.toUpperCase(); if (ctx.measureText(lab).width < x1 - x0 - 6) ctx.fillText(lab, (x0 + x1) / 2, A.m.t + 11);
    });
    const layers = [['Ep', '#2563eb', s => s.Ep], ['Ek', '#f59e0b', s => s.Ek], ['K', '#dc2626', s => s.Eabs]];
    const draw = (alpha, pMax) => {
      const arr = M.samples.filter(s => s.p <= pMax);
      if (arr.length < 2) return;
      const lastP = arr[arr.length - 1].p;
      for (let li = layers.length - 1; li >= 0; li--) {
        const cum = s => layers.slice(0, li + 1).reduce((a, l) => a + l[2](s), 0), below = s => layers.slice(0, li).reduce((a, l) => a + l[2](s), 0);
        ctx.fillStyle = layers[li][1] + alpha; ctx.beginPath();
        arr.forEach((s, i) => i ? ctx.lineTo(A.X(s.p), A.Y(cum(s))) : ctx.moveTo(A.X(s.p), A.Y(cum(s))));
        for (let i = arr.length - 1; i >= 0; i--) ctx.lineTo(A.X(arr[i].p), A.Y(below(arr[i])));
        ctx.closePath(); ctx.fill();
      }
      void lastP;
    };
    draw('26', 1); draw('cc', st.p);
    const px = A.X(st.p); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, A.m.t); ctx.lineTo(px, A.m.t + A.ph); ctx.stroke();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(px, A.m.t + A.ph, 4, 0, 7); ctx.fill();
    [['Ep', '#2563eb', 'Energía potencial'], ['Ek', '#f59e0b', 'Energía cinética'], ['K', '#dc2626', 'Absorbida K']].forEach(([_, c, t], i) => { ctx.fillStyle = c; ctx.fillRect(A.m.l + 10 + i * 130, H - 30, 10, 10); ctx.fillStyle = '#334155'; ctx.font = `600 10.5px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(t, A.m.l + 24 + i * 130, H - 21); });
  }

  function trRange() {
    const M = S.model, T = M.cfg.T, ts = S.points.map(p => p.T);
    return [Math.floor(Math.min(-100, T - 30, ...ts) / 10) * 10, Math.ceil(Math.max(150, T + 30, ...ts) / 10) * 10];
  }
  function drawTr(st) {
    const M = S.model, ctx = tctx, W = 640, H = 320, r = M.res, e = r.eff, W0 = M.W0;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const [x0, x1] = trRange();
    const A = axes(ctx, W, H, { xmin: x0, xmax: x1, ymin: 0, ymax: W0 * 1.04, xl: 'Temperatura de ensayo T (°C)', yl: `Energía absorbida K${M.cfg.notch} (J)` });
    ctx.save(); ctx.beginPath(); ctx.rect(A.m.l, A.m.t, A.pw, A.ph); ctx.clip();
    if (e.kind === 'transition') {
      const a = e.Tt - 1.0986 * e.C, b = e.Tt + 1.0986 * e.C;
      [[x0, a, '#dc2626', 'FRÁGIL'], [a, b, '#d97706', 'TRANSICIÓN'], [b, x1, '#16a34a', 'DÚCTIL']].forEach(([u0, u1, c, t]) => {
        const xa = A.X(clamp(u0, x0, x1)), xb = A.X(clamp(u1, x0, x1)); if (xb - xa < 2) return;
        ctx.fillStyle = c + '12'; ctx.fillRect(xa, A.m.t, xb - xa, A.ph); if (xb - xa > 60) { ctx.fillStyle = c; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(t, (xa + xb) / 2, A.m.t + 12); }
      });
    } else { ctx.fillStyle = '#16a34a'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('SIN TRANSICIÓN APRECIABLE', A.m.l + A.pw / 2, A.m.t + 12); }
    // capacidad y requisito
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(A.m.l, A.Y(0.8 * W0)); ctx.lineTo(A.m.l + A.pw, A.Y(0.8 * W0)); ctx.stroke();
    ctx.strokeStyle = '#d97706'; ctx.beginPath(); ctx.moveTo(A.m.l, A.Y(M.cfg.Kmin)); ctx.lineTo(A.m.l + A.pw, A.Y(M.cfg.Kmin)); ctx.stroke(); ctx.setLineDash([]);
    // curva teórica
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 160; i++) { const T = lerp(x0, x1, i / 160), K = Math.min(M.curve(T), W0); i ? ctx.lineTo(A.X(T), A.Y(K)) : ctx.moveTo(A.X(T), A.Y(K)); } ctx.stroke();
    // criterios sobre la serie
    const pts = S.points; let info = '';
    if (pts.length >= 3) {
      const Kmax = Math.max(...pts.map(p => p.K)), Kmin2 = Math.min(...pts.map(p => p.K)), mid = (Kmax + Kmin2) / 2;
      const T27 = crossing(pts, M.cfg.Kmin), T50 = crossing(pts, mid);
      [[T27, '#d97706', `T(${fmt(M.cfg.Kmin, 0)} J)`], [T50, '#7c3aed', 'T(50 %)']].forEach(([t, c, l]) => {
        if (t === null) return; ctx.setLineDash([3, 3]); ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(A.X(t), A.m.t); ctx.lineTo(A.X(t), A.m.t + A.ph); ctx.stroke(); ctx.setLineDash([]);
        halo(ctx, `${l} ≈ ${fmt(t, 0)} °C`, A.X(t) + 4, A.m.t + A.ph - 8, c, `700 10px ${FONT}`);
      });
      info = `A partir de ${pts.length} ensayos: ${T27 !== null ? `la energía alcanza ${fmt(M.cfg.Kmin, 0)} J a ≈ ${fmt(T27, 0)} °C` : `no se alcanzan ${fmt(M.cfg.Kmin, 0)} J en el rango ensayado`}; ${T50 !== null ? `la temperatura de transición (50 % de la energía entre mesetas, ${fmt(mid, 0)} J) es ≈ ${fmt(T50, 0)} °C.` : 'no se identifica el 50 % de la transición.'}`;
    } else info = pts.length ? 'Añade al menos 3 temperaturas para estimar la temperatura de transición.' : 'Pulsa «Simular serie de temperaturas» para ensayar varias temperaturas y estimar la temperatura de transición, o «Registrar este ensayo» para añadir el punto actual.';
    ctx.restore();
    // puntos registrados
    pts.forEach(p => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(A.X(p.T), A.Y(p.K), 5, 0, 7); ctx.fill(); ctx.stroke(); });
    // punto del ensayo actual
    const show = st.p >= M.pRead, X = A.X(M.cfg.T), Y = A.Y(Math.min(r.K, W0));
    ctx.globalAlpha = show ? 1 : 0.3; ctx.fillStyle = '#7c3aed'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, 7, 0, 7); ctx.fill(); ctx.stroke();
    halo(ctx, `${fmt(M.cfg.T, 0)} °C · ${fmt(r.K, 0)} J`, clamp(X + 10, A.m.l + 4, A.m.l + A.pw - 90), Y - 12, '#5b21b6', `700 11px ${FONT}`); ctx.globalAlpha = 1;
    ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#64748b'; ctx.fillText('80 % W₀', A.m.l + A.pw - 4, A.Y(0.8 * W0) - 4);
    ctx.fillStyle = '#b45309'; ctx.fillText(`K mín. ${fmt(M.cfg.Kmin, 0)} J`, A.m.l + A.pw - 4, A.Y(M.cfg.Kmin) - 4);
    $('rTrInfo').textContent = info;
  }

  function drawFrac(st) {
    const M = S.model, ctx = fctx, W = 320, H = 230, r = M.res, show = st.p >= M.pRead;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const k = 18, B = M.cfg.B, lig = M.lig, w = (B + r.LE) * k, h = lig * k, x = (W - w) / 2, y = 40;
    if (!show) { ctx.fillStyle = '#94a3b8'; ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Se mostrará al terminar el ensayo', W / 2, H / 2); $('rFracInfo').textContent = ''; return; }
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.strokeRect((W - B * k) / 2, y, B * k, h); ctx.setLineDash([]);
    if (r.notBroken) { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#b91c1c'; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('NO ROTA', W / 2, y + h / 2 + 4); $('rFracInfo').textContent = 'La probeta no llega a romperse: la energía de rotura supera la capacidad del péndulo.'; return; }
    ctx.fillStyle = '#6b7280'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(31,41,55,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 40; i++) { const yy = y + ((i * 37) % h), xx = x + ((i * 91) % w); ctx.moveTo(xx, yy); ctx.lineTo(xx + 10, yy + 2); } ctx.stroke();
    const cr = Math.sqrt(1 - r.frac), iw = w * cr, ih = h * cr, ix = x + (w - iw) / 2, iy = y + (h - ih) * 0.62;
    if (r.frac < 0.995) {
      const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih); g.addColorStop(0, '#f8fafc'); g.addColorStop(1, '#cbd5e1'); ctx.fillStyle = g; ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = 'rgba(255,255,255,.95)'; for (let i = 0; i < 40; i++) { ctx.fillRect(ix + ((i * 53) % Math.max(1, iw - 3)), iy + ((i * 29) % Math.max(1, ih - 3)), 2, 2); }
    }
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('▼ fondo de la entalla', W / 2, y - 8); ctx.fillText(`${B} mm`, W / 2, y + h + 14);
    [['#6b7280', 'Fibrosa (dúctil)'], ['#f1f5f9', 'Cristalina (frágil)']].forEach(([c, t], i) => { ctx.fillStyle = c; ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.fillRect(40 + i * 130, H - 28, 12, 12); ctx.strokeRect(40 + i * 130, H - 28, 12, 12); ctx.fillStyle = '#334155'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(t, 56 + i * 130, H - 18); });
    $('rFracInfo').textContent = `${fmt(r.frac * 100, 0)} % fibroso · ${fmt((1 - r.frac) * 100, 0)} % cristalino. Expansión lateral ≈ ${fmt(r.LE, 2)} mm (contorno discontinuo = ancho inicial).`;
  }

  /* =================================================================
     RENDER
  ================================================================= */
  function renderHero(M, revealed) {
    const r = M.res, c = M.cfg;
    const valid = r.ok ? '<span class="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">ENSAYO VÁLIDO</span>' : `<span class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white">NO VÁLIDO · ${r.nFail} condición${r.nFail > 1 ? 'es' : ''}</span>`;
    const req = r.notBroken ? '<span class="rounded-md bg-slate-500 px-2.5 py-1 text-xs font-bold text-white">REQUISITO NO EVALUABLE</span>'
      : r.reqOk ? `<span class="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">CUMPLE K${c.notch} ≥ ${fmt(r.Kmin, 0)} J</span>` : `<span class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white">NO CUMPLE K${c.notch} ≥ ${fmt(r.Kmin, 0)} J</span>`;
    const fails = M.checks.filter(k => k.ok === false).map(k => `<li>${k.hint}</li>`).join('');
    $('rHero').innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3">
      <div><div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado · Charpy ${c.cap} J</div>
      <div class="mt-0.5 font-mono text-3xl font-bold sm:text-4xl ${revealed ? 'text-slate-900' : 'text-slate-300'}">${revealed ? r.designation : '— — —'}</div>
      <div class="text-xs text-slate-500">${revealed ? `ρ = ${fmt(r.rho, 1)} J/cm² (${fmt(r.rhoKgm, 2)} kgm/cm²) · rotura ${r.regime} (${fmt(r.frac * 100, 0)} % fibroso) · ${fmt(c.T, 0)} °C` : 'Se obtiene al leer la energía absorbida'}</div></div>
      <div class="max-w-md text-sm"><div class="mb-1 flex flex-wrap gap-1.5">${valid}${revealed ? req : ''}</div>
      ${r.ok ? '<div class="text-slate-700">Se cumplen las condiciones de la norma UNE 36-403-81.</div>' : `<div class="text-slate-700">El resultado no es fiable. Qué corregir:<ul class="mt-1 list-inside list-disc text-slate-600">${fails}</ul></div>`}</div></div>`;
  }

  function render() {
    const M = S.model; if (!M || LAB.active !== 'res') return;
    const st = M.state(S.p), pm = PHASE_META[st.phase];
    drawSpec(st); drawEn(st); drawTr(st); drawFrac(st);
    $('rA').textContent = fmt(Math.abs(st.th) * 180 / Math.PI, 0); $('rV').textContent = fmt(st.v, 2); $('rTs').textContent = fmt(st.Tspec, 1);
    $('rK').textContent = S.p >= M.pRead ? (M.res.notBroken ? '> ' + fmt(0.97 * M.W0, 0) : fmt(M.res.K, 1)) : '—';
    $('rSeek').value = Math.round(S.p * 1000);
    const b = $('rBadge'); b.style.background = pm.color; b.textContent = pm.label.toUpperCase();
    const [t, tx, fm] = explainR(M, st);
    $('rExTitle').textContent = t; $('rExText').textContent = tx; $('rExFormula').textContent = fm; $('rExp').style.borderColor = pm.color;
    $('rChips').querySelectorAll('button').forEach(btn => { const on = btn.dataset.id === st.phase, c = PHASE_META[btn.dataset.id].color; btn.style.background = on ? c : '#fff'; btn.style.color = on ? '#fff' : c; btn.style.borderColor = c; });
    paramRows.forEach(pr => { pr.row.style.opacity = (pr.rev === 0 || S.p >= pr.rev) ? 1 : 0.28; });
    const measured = S.p >= M.pRead;
    if (lastRevealed !== measured) { renderHero(M, measured); lastRevealed = measured; }
  }

  /* =================================================================
     ARRANQUE
  ================================================================= */
  mSel.value = 's235'; fillMat('s235'); updPrev(); $('rTemp').value = 0;
  apply(readCfg().cfg);
})();
