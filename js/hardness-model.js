/* Modelo del ensayo de dureza (Brinell, Vickers, Rockwell). Lógica pura, sin DOM. */
(function (root) {
  'use strict';
  const G = 9.80665;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 2);

  // interpolación lineal con extrapolación por los extremos
  function interp(x, pts) {
    const n = pts.length; let i = 0;
    if (x <= pts[0][0]) i = 0; else if (x >= pts[n - 1][0]) i = n - 2; else while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  // Conversiones orientativas (aceros), según tablas tipo ASTM E140
  const HV_HRC = [[238, 20], [266, 25], [302, 30], [345, 35], [392, 40], [446, 45], [513, 50], [595, 55], [697, 60], [832, 65]];
  const HV_HRB = [[107, 60], [125, 70], [150, 80], [177, 90], [240, 100]];
  const HRC_HRA = [[20, 60.5], [30, 65.8], [40, 70.4], [50, 75.9], [60, 81.2], [65, 83.9]];
  const hvToHRC = hv => interp(hv, HV_HRC);
  const hvToHRB = hv => interp(hv, HV_HRB);
  const hvToHRA = hv => interp(hvToHRC(hv), HRC_HRA);
  const hvToHB = hv => hv * 0.95;

  const SCALES = {
    A: { name: 'HRA', ind: 'cone', F0: 98.07, F1: 490.3, N: 100, min: 20, max: 88, fn: hv => (hvToHRC(hv) < 20 ? -1 : hvToHRA(hv)), desc: 'cono de diamante 120°' },
    B: { name: 'HRB', ind: 'ball', R: 1.5875, F0: 98.07, F1: 882.6, N: 130, min: 20, max: 100, fn: hvToHRB, desc: 'bola de acero Ø 1/16"' },
    C: { name: 'HRC', ind: 'cone', F0: 98.07, F1: 1373, N: 100, min: 20, max: 70, fn: hvToHRC, desc: 'cono de diamante 120°' },
  };

  // hv: dureza Vickers "de referencia" del material; ferrous: aceros y fundiciones (conversiones fiables)
  const MATERIALS = {
    alpuro:  { name: 'Aluminio puro recocido',        hv: 25,  ferrous: false, kRec: 5,  color: '#cbd5e1' },
    al6061:  { name: 'Aluminio 6061-T6',               hv: 107, ferrous: false, kRec: 10, color: '#cbd5e1' },
    cu:      { name: 'Cobre recocido',                 hv: 50,  ferrous: false, kRec: 10, color: '#c2763a' },
    laton:   { name: 'Latón CuZn37',                   hv: 105, ferrous: false, kRec: 10, color: '#d4a72c' },
    bronce:  { name: 'Bronce en lingotes',             hv: 90,  ferrous: false, kRec: 10, color: '#b7791f' },
    acdulce: { name: 'Acero dulce (S235)',             hv: 125, ferrous: true,  kRec: 30, color: '#94a3b8' },
    ac045:   { name: 'Acero 0,45 % C normalizado',     hv: 200, ferrous: true,  kRec: 30, color: '#94a3b8' },
    acbon:   { name: 'Acero aleado bonificado',        hv: 350, ferrous: true,  kRec: 30, color: '#8b99ab' },
    acherr:  { name: 'Acero de herramientas templado', hv: 750, ferrous: true,  kRec: 30, color: '#7b8794' },
    fgris:   { name: 'Fundición gris',                 hv: 220, ferrous: true,  kRec: 30, color: '#6b7280' },
    ti64:    { name: 'Titanio Ti-6Al-4V',              hv: 340, ferrous: false, kRec: 30, color: '#a1a1aa' },
    custom:  { name: 'Material personalizado',         hv: 200, ferrous: true,  kRec: 30, color: '#94a3b8' },
  };

  const PHASE_META = {
    approach: { label: 'Aproximación',          short: 'Aproximación', color: '#64748b' },
    load:     { label: 'Aplicación de la carga', short: 'Carga',        color: '#2563eb' },
    dwell:    { label: 'Mantenimiento de la carga', short: 'Mantenim.', color: '#d97706' },
    unload:   { label: 'Retirada de la carga',   short: 'Descarga',     color: '#16a34a' },
    withdraw: { label: 'Retirada del penetrador', short: 'Retirada',    color: '#64748b' },
    measure:  { label: 'Medida de la huella',    short: 'Medida',       color: '#7c3aed' },
    preload:  { label: 'Precarga F₀',            short: 'Precarga F₀',  color: '#0ea5e9' },
    major:    { label: 'Carga adicional F₁',     short: 'Carga F₁',     color: '#2563eb' },
    release:  { label: 'Retirada de F₁',         short: 'Quita F₁',     color: '#16a34a' },
    reading:  { label: 'Lectura de la dureza',   short: 'Lectura',      color: '#7c3aed' },
  };

  function buildHardness(c) {
    const m = c.mat, hv = m.hv, method = c.method;
    const M = { cfg: c, mat: m, method, hv };
    const checks = [];     // {label, ok: true|false|'warn', value, limit, hint}
    const pushCheck = (label, ok, value, limit, hint) => checks.push({ label, ok, value, limit, hint });
    let phasesDef, hwOf, kind, hMax, hRes, h0 = 0, Fmax, F0 = 0, rows = [], res = {}, reco = [];

    if (method === 'brinell') {
      kind = 'ball';
      const D = c.D, Fk = c.kfac * D * D, F = Fk * G, R = D / 2;
      const HBt = hv * 0.95;
      let h = Fk / (Math.PI * D * HBt), clamped = false;
      if (h > 0.5 * D) { h = 0.5 * D; clamped = true; }
      const d = 2 * Math.sqrt(h * (D - h));
      const HB = 2 * Fk / (Math.PI * D * (D - Math.sqrt(D * D - d * d)));
      const ke = 0.06 + 0.10 * Math.min(1, HB / 400);
      hRes = h; hMax = h * (1 + ke) * 1.012; Fmax = F;
      hwOf = hh => Math.sqrt(Math.max(0, 2 * R * hh - hh * hh));
      Object.assign(res, { D, Fk, F, d, d1: d * 0.996, d2: d * 1.004, h, HB, S: Math.PI * D * h, ratio: d / D, k: c.kfac });
      res.value = HB; res.unit = 'HBW';
      res.designation = `${Math.round(HB)} HBW ${fnum(D)}/${fnum(Fk)}` + (c.dwell < 10 || c.dwell > 15 ? '/' + c.dwell : '');
      res.hvEq = HB / 0.95;
      pushCheck('Diámetro de huella 0,24·D ≤ d ≤ 0,6·D', !clamped && d >= 0.24 * D && d <= 0.6 * D, `d/D = ${(d / D).toFixed(2)}`, '0,24 – 0,60',
        d / D > 0.6 ? 'Huella demasiado grande: reduce la carga (k) o usa bola mayor.' : 'Huella demasiado pequeña: aumenta la carga (k).');
      pushCheck('Espesor de la probeta ≥ 8·h', c.thickness >= 8 * h, `${c.thickness} mm`, `≥ ${(8 * h).toFixed(2)} mm`, 'La deformación no debe marcarse en la cara opuesta.');
      pushCheck('Distancia al borde ≥ 2,5·d', c.edge >= 2.5 * d, `${c.edge} mm`, `≥ ${(2.5 * d).toFixed(2)} mm`, 'Acerca menos el ensayo al borde.');
      pushCheck('Distancia entre huellas ≥ 4·d', c.spacing >= 4 * d, `${c.spacing} mm`, `≥ ${(4 * d).toFixed(2)} mm`, 'Separa más las huellas (zona endurecida de la anterior).');
      pushCheck('Dureza dentro del límite HBW ≤ 650', HB <= 650, `${Math.round(HB)} HBW`, '≤ 650', 'Para durezas altas usa Vickers o Rockwell C.');
      pushCheck('Tiempo de mantenimiento 10 – 15 s', c.dwell >= 10 && c.dwell <= 15, `${c.dwell} s`, '10 – 15 s', 'Si es distinto se indica en la designación.');
      pushCheck(`Relación de carga adecuada al material (k ≈ ${m.kRec})`, c.kfac === m.kRec ? true : 'warn', `k = ${c.kfac}`, `k = ${m.kRec}`, 'Aceros: 30 · Cu, latones, bronces: 10 · aluminio blando: 5 · metales muy blandos: 1–2,5.');
      for (const DD of [10, 5, 2.5]) for (const k of [30, 15, 10, 5, 2.5, 1]) {
        const Fkk = k * DD * DD, hh = Fkk / (Math.PI * DD * HBt);
        if (hh > 0.5 * DD) continue;
        const dd = 2 * Math.sqrt(hh * (DD - hh));
        if (dd >= 0.24 * DD && dd <= 0.6 * DD && c.thickness >= 8 * hh && c.edge >= 2.5 * dd && c.spacing >= 4 * dd && HBt <= 650)
          reco.push(`HBW ${fnum(DD)}/${fnum(Fkk)}  (D = ${fnum(DD)} mm, k = ${k}) → d ≈ ${dd.toFixed(2)} mm`);
      }
      phasesDef = [['approach', .10, 2], ['load', .22, 6], ['dwell', .18, c.dwell], ['unload', .14, 3], ['withdraw', .10, 2], ['measure', .26, 0]];
    } else if (method === 'vickers') {
      kind = 'pyramid';
      const Fk = c.Fkgf, F = Fk * G;
      const d = Math.sqrt(1.8544 * Fk / hv), h = d / 7, HV = 1.8544 * Fk / (d * d);
      const ke = 0.08 + 0.12 * Math.min(1, hv / 800);
      hRes = h; hMax = h * (1 + ke) * 1.012; Fmax = F;
      const t68 = Math.tan(68 * Math.PI / 180);
      hwOf = hh => hh * t68;
      Object.assign(res, { Fk, F, d, d1: d * 0.994, d2: d * 1.006, h, HV, S: d * d / 1.8544 });
      res.value = HV; res.unit = 'HV';
      res.designation = `${Math.round(HV)} HV ${fnum(Fk)}` + (c.dwell < 10 || c.dwell > 15 ? '/' + c.dwell : '');
      res.hvEq = HV;
      const fe = m.ferrous;
      pushCheck('Espesor de la probeta ≥ 1,5·d', c.thickness >= 1.5 * d, `${c.thickness} mm`, `≥ ${(1.5 * d).toFixed(3)} mm`, 'Reduce la carga o usa una probeta más gruesa.');
      pushCheck(`Distancia al borde ≥ ${fe ? '2,5' : '3'}·d`, c.edge >= (fe ? 2.5 : 3) * d, `${c.edge} mm`, `≥ ${((fe ? 2.5 : 3) * d).toFixed(3)} mm`, 'Aleja la huella del borde.');
      pushCheck(`Distancia entre huellas ≥ ${fe ? '3' : '6'}·d`, c.spacing >= (fe ? 3 : 6) * d, `${c.spacing} mm`, `≥ ${((fe ? 3 : 6) * d).toFixed(3)} mm`, 'Separa más las huellas.');
      pushCheck('Diagonales: diferencia d₁ − d₂ ≤ 5 %', Math.abs(res.d1 - res.d2) / d <= 0.05, `${(Math.abs(res.d1 - res.d2) / d * 100).toFixed(1)} %`, '≤ 5 %', 'Revisa el pulido y la perpendicularidad de la superficie.');
      pushCheck('Diagonal medible (d ≥ 0,02 mm)', d >= 0.02, `${d.toFixed(3)} mm`, '≥ 0,02 mm', 'Huella demasiado pequeña: aumenta la carga.');
      pushCheck('Tiempo de mantenimiento 10 – 15 s', c.dwell >= 10 && c.dwell <= 15, `${c.dwell} s`, '10 – 15 s', 'Si es distinto se indica en la designación.');
      for (const FF of [0.2, 1, 5, 10, 20, 30, 50, 100]) {
        const dd = Math.sqrt(1.8544 * FF / hv);
        if (dd >= 0.02 && c.thickness >= 1.5 * dd && c.edge >= (fe ? 2.5 : 3) * dd && c.spacing >= (fe ? 3 : 6) * dd && dd <= 1.2) reco.push(`HV ${fnum(FF)}  (${fnum(FF)} kgf) → d ≈ ${dd.toFixed(3)} mm`);
      }
      phasesDef = [['approach', .10, 2], ['load', .22, 6], ['dwell', .18, c.dwell], ['unload', .14, 3], ['withdraw', .10, 2], ['measure', .26, 0]];
    } else {
      const sc = SCALES[c.scale];
      kind = sc.ind === 'cone' ? 'cone' : 'ball';
      const HRraw = sc.fn(hv), HR = clamp(HRraw, 1, sc.N - 1);
      const e = (sc.N - HR) * 0.002;
      h0 = 0.012 + 0.12 * e;
      const kel = 0.2 + 0.25 * Math.min(1, hv / 700);
      const hT = h0 + e * (1 + kel);
      hRes = h0 + e; hMax = hT + 0.004 * e; F0 = sc.F0; Fmax = sc.F0 + sc.F1;
      if (kind === 'cone') { const t60 = Math.tan(Math.PI / 3); hwOf = hh => hh * t60; }
      else { const R = sc.R; hwOf = hh => Math.sqrt(Math.max(0, 2 * R * hh - hh * hh)); }
      const dImp = 2 * hwOf(hRes);
      Object.assign(res, { sc, HRraw, HR, e, h0, hT, dImp, F0: sc.F0, F1: sc.F1, F: Fmax, N: sc.N, h: hRes });
      res.value = HR; res.unit = sc.name;
      res.designation = `${HR.toFixed(0)} ${sc.name}`;
      res.hvEq = hv;
      const thkMin = (kind === 'cone' ? 10 : 15) * e;
      pushCheck(`Lectura dentro del campo de la escala ${sc.name} (${sc.min} – ${sc.max})`, HRraw >= sc.min && HRraw <= sc.max, `${HRraw.toFixed(1)} ${sc.name}`, `${sc.min} – ${sc.max}`, 'Cambia de escala: ver recomendaciones.');
      pushCheck(`Espesor de la probeta ≥ ${kind === 'cone' ? 10 : 15}·e`, c.thickness >= thkMin, `${c.thickness} mm`, `≥ ${thkMin.toFixed(2)} mm`, 'La cara opuesta no debe marcarse.');
      pushCheck('Distancia al borde ≥ 2,5·Ø huella (mín. 1 mm)', c.edge >= Math.max(1, 2.5 * dImp), `${c.edge} mm`, `≥ ${Math.max(1, 2.5 * dImp).toFixed(2)} mm`, 'Aleja la huella del borde.');
      pushCheck('Distancia entre huellas ≥ 4·Ø huella (mín. 2 mm)', c.spacing >= Math.max(2, 4 * dImp), `${c.spacing} mm`, `≥ ${Math.max(2, 4 * dImp).toFixed(2)} mm`, 'Separa más las huellas.');
      pushCheck('Superficie plana y perpendicular al penetrador', true, '—', '—', 'Condición de preparación de la probeta.');
      for (const k of Object.keys(SCALES)) {
        const s2 = SCALES[k], v = s2.fn(hv);
        if (v >= s2.min && v <= s2.max) reco.push(`${s2.name}  (${s2.desc}, F₀ = ${fnum(s2.F0)} N, F₁ = ${fnum(s2.F1)} N) → ≈ ${v.toFixed(0)} ${s2.name}`);
      }
      phasesDef = [['approach', .08, 2], ['preload', .12, 3], ['major', .20, 4], ['dwell', .14, c.dwell], ['release', .14, 2], ['reading', .18, 3], ['withdraw', .14, 2]];
    }

    // --- fases ---
    let acc = 0, tAcc = 0;
    const phases = phasesDef.map(([id, w, dur]) => { const o = { id, p0: acc, p1: acc + w, dur, t0: tAcc }; acc += w; tAcc += dur; return o; });
    const idx = id => phases.findIndex(p => p.id === id);
    const pRead = phases[idx(method === 'rockwell' ? 'reading' : 'measure')].p0;

    function state(pp) {
      const p = clamp(pp, 0, 1);
      let ph = phases.find(q => p <= q.p1) || phases[phases.length - 1];
      const u = clamp((p - ph.p0) / (ph.p1 - ph.p0), 0, 1);
      const o = { p, phase: ph.id, u, F: 0, h: 0, gap: 0, t: ph.t0 + u * ph.dur, measureU: 0, loadFrac: 0 };
      const id = ph.id;
      if (method === 'rockwell') {
        const Fm = Fmax - F0;
        if (id === 'approach') { o.gap = 1 - ease(u); }
        else if (id === 'preload') { o.F = F0 * u; o.h = h0 * Math.sqrt(u); }
        else if (id === 'major') { o.F = F0 + Fm * u; o.h = h0 + (res.hT - h0) * Math.sqrt(u); }
        else if (id === 'dwell') { o.F = Fmax; o.h = res.hT + (hMax - res.hT) * ease(u); }
        else if (id === 'release') { const f = 1 - u; o.F = F0 + Fm * f; o.h = hRes + (hMax - hRes) * Math.pow(f, 1.4); }
        else if (id === 'reading') { o.F = F0; o.h = hRes; o.measureU = u; }
        else { o.F = F0 * (1 - ease(u)); o.h = hRes; o.gap = ease(u); }
        o.reading = res.N - Math.max(0, o.h - h0) / 0.002;
        o.loadFrac = o.F / Fmax;
      } else {
        if (id === 'approach') { o.gap = 1 - ease(u); }
        else if (id === 'load') { o.F = Fmax * u; o.h = (hMax / 1.012) * Math.sqrt(u); }
        else if (id === 'dwell') { o.F = Fmax; o.h = hMax / 1.012 + (hMax - hMax / 1.012) * ease(u); }
        else if (id === 'unload') { const f = 1 - u; o.F = Fmax * f; o.h = hRes + (hMax - hRes) * Math.pow(f, 1.4); }
        else if (id === 'withdraw') { o.h = hRes; o.gap = ease(u); }
        else { o.h = hRes; o.gap = 1; o.measureU = u; }
        o.loadFrac = o.F / Fmax;
      }
      return o;
    }

    const NS = 500, samples = [];
    for (let i = 0; i < NS; i++) { const s = state(i / (NS - 1)); samples.push({ p: s.p, t: s.t, F: s.F, h: s.h, phase: s.phase }); }

    // equivalencias orientativas
    const hrc = hvToHRC(hv), hrb = hvToHRB(hv), hra = hvToHRA(hv);
    const HBeq = hvToHB(hv);
    res.eq = {
      HV: hv, HB: HBeq,
      HRC: hrc >= 20 && hrc <= 70 ? hrc : null,
      HRB: hrb >= 20 && hrb <= 100 ? hrb : null,
      HRA: hra >= 20 && hra <= 88 && hrc >= 20 ? hra : null,
      Rm: m.ferrous && HBeq <= 450 ? 3.45 * HBeq : null,
    };
    res.hMax = hMax; res.hRes = hRes; res.Fmax = Fmax;
    res.ok = checks.every(k => k.ok === true || k.ok === 'warn');
    res.nFail = checks.filter(k => k.ok === false).length;

    return Object.assign(M, { kind, phases, state, samples, hwOf, hMax, hRes, h0, Fmax, F0, res, checks, reco, pRead, tTotal: tAcc });
  }

  function fnum(x) { return Number.isInteger(x) ? String(x) : String(+x.toFixed(2)).replace('.', ','); }

  const api = { G, SCALES, MATERIALS, PHASE_META, buildHardness, hvToHRC, hvToHRB, hvToHRA, hvToHB, fnum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HardnessModel = api;
})(this);
