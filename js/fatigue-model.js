/* Modelo del ensayo de fatiga (flexión rotativa en voladizo / torsión alternativa). Lógica pura, sin DOM. */
(function (root) {
  'use strict';
  const G = 9.80665;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // Rm y Se en MPa. Se = límite de fatiga en flexión rotativa (probeta pulida) si ferrous;
  // en materiales sin límite de fatiga definido, Se = resistencia a 5·10^8 ciclos.
  const MATERIALS = {
    s235:   { name: 'Acero S235JR',                      Rm: 410,  Se: 190, ferrous: true,  color: '#94a3b8' },
    ac045:  { name: 'Acero 0,45 % C normalizado',        Rm: 650,  Se: 300, ferrous: true,  color: '#8b99ab' },
    acbon:  { name: 'Acero aleado bonificado (42CrMo4)', Rm: 1000, Se: 480, ferrous: true,  color: '#7b8794' },
    inox:   { name: 'Acero inoxidable austenítico 304',  Rm: 600,  Se: 240, ferrous: true,  color: '#cbd5e1' },
    fgris:  { name: 'Fundición gris',                    Rm: 220,  Se: 90,  ferrous: true,  color: '#6b7280' },
    ti64:   { name: 'Titanio Ti-6Al-4V',                 Rm: 950,  Se: 500, ferrous: true,  color: '#a1a1aa' },
    al6061: { name: 'Aluminio 6061-T6',                  Rm: 310,  Se: 95,  ferrous: false, color: '#cbd5e1' },
    al7075: { name: 'Aluminio 7075-T6',                  Rm: 570,  Se: 160, ferrous: false, color: '#cbd5e1' },
    laton:  { name: 'Latón CuZn37',                      Rm: 350,  Se: 125, ferrous: false, color: '#d4a72c' },
    cu:     { name: 'Cobre recocido',                    Rm: 220,  Se: 75,  ferrous: false, color: '#c2763a' },
    custom: { name: 'Material personalizado',            Rm: 500,  Se: 220, ferrous: true,  color: '#94a3b8' },
  };
  const FINISH = {
    polished: { name: 'Pulido espejo', ka: 1.0 },
    ground:   { name: 'Rectificado',   ka: 0.92 },
    turned:   { name: 'Torneado',      ka: 0.80 },
  };
  const DEFECT = {
    none:    { name: 'Sin defecto (superficie pulida)', Kf: 1.0, label: 'punto de inicio (superficie)' },
    scratch: { name: 'Rayado superficial',              Kf: 1.6, label: 'rayado superficial' },
    incl:    { name: 'Inclusión bajo la superficie',    Kf: 1.3, label: 'inclusión' },
    notch:   { name: 'Entalla circunferencial',         Kf: 2.2, label: 'entalla' },
  };
  const PHASE_META = {
    setup: { label: 'Montaje y carga',                short: 'Montaje',     color: '#64748b' },
    start: { label: 'Arranque y regulación del motor', short: 'Arranque',   color: '#0ea5e9' },
    init:  { label: 'Iniciación de la grieta',        short: 'Iniciación',  color: '#d97706' },
    prop:  { label: 'Propagación estable',            short: 'Propagación', color: '#2563eb' },
    final: { label: 'Rotura final',                   short: 'Rotura',      color: '#dc2626' },
    frac:  { label: 'Examen de la fractura',          short: 'Fractura',    color: '#475569' },
    run:   { label: 'Ciclado sin rotura',             short: 'Ciclado',     color: '#16a34a' },
    stop:  { label: 'Fin del ensayo (sin rotura)',    short: 'Fin',         color: '#475569' },
  };

  // área de la intersección de dos círculos (radios R y r, distancia entre centros D)
  function lens(R, r, D) {
    if (r <= 0) return 0;
    if (D >= R + r) return 0;
    if (D <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
    const a = r * r * Math.acos(clamp((D * D + r * r - R * R) / (2 * D * r), -1, 1));
    const b = R * R * Math.acos(clamp((D * D + R * R - r * r) / (2 * D * R), -1, 1));
    const c = 0.5 * Math.sqrt(Math.max(0, (-D + r + R) * (D + r - R) * (D - r + R) * (D + r + R)));
    return a + b - c;
  }

  function buildFatigue(c) {
    const bend = c.method === 'bend', d = c.d, R = d / 2;
    const conv = bend ? 1 : Math.sqrt(3);                    // τ → σ equivalente de von Mises
    const kb = Math.pow(clamp(d, 2.8, 51) / 7.62, -0.107);
    const ka = FINISH[c.finish].ka, Kf = DEFECT[c.defect].Kf;
    const Rm = c.mat.Rm, Se = c.mat.Se, ferrous = c.mat.ferrous;
    const S1k = 0.9 * Rm, Nk = ferrous ? 1e6 : 5e8, Nlim = ferrous ? 1e7 : 1e8;
    const b = -Math.log10(S1k / Se) / (Math.log10(Nk) - 3), A = S1k / Math.pow(1e3, b);

    // vida para una amplitud nominal s (σa en flexión, τa en torsión)
    const lifeOf = (s, nominalOnly) => {
      const seq = s * conv, e = nominalOnly ? seq : seq * Kf / (ka * kb);
      if (e >= 0.98 * Rm) return { N: 1, runout: false, e };
      const N = Math.pow(e / A, 1 / b);
      const runout = ferrous ? (e <= Se || N > Nlim) : N > Nlim;
      return { N: Math.max(1, N), runout, e };
    };
    const sa = c.sa, L = lifeOf(sa);
    const runout = L.runout, Nf = runout ? Nlim : L.N, seq = sa * conv, seqEff = L.e;
    const ampAt = (N, eff) => (A * Math.pow(N, b)) * (eff ? ka * kb / Kf : 1) / conv;   // amplitud nominal que da vida N
    const SeEff = Se * ka * kb / Kf / conv, SeBase = Se / conv;

    const fi = clamp(0.3 + 0.6 * (Math.log10(Math.max(Nf, 10)) - 3) / 3, 0.3, 0.9);
    const Ni = runout ? Infinity : fi * Nf, Np = runout ? 0 : Nf - Ni;
    const ffinal = clamp(0.03 + 0.9 * Math.pow(seq / Rm, 2.6), 0.03, 0.95);

    // geometría de la superficie de fractura
    const mode = (!bend || c.defect === 'notch') ? 'ring' : 'lens';
    const nOrig = !bend ? 4 : c.defect === 'notch' ? 0 : 1;
    let rf = 0, rc = 0, amax;
    if (mode === 'lens') {
      const target = (1 - ffinal) * Math.PI * R * R; let lo = 0.01 * R, hi = 2 * R;
      for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (lens(R, mid, R) < target) lo = mid; else hi = mid; }
      rf = (lo + hi) / 2; amax = Math.min(rf, 2 * R);
    } else { rc = R * Math.sqrt(ffinal); amax = R - rc; }
    const a0 = 0.02;
    const aOf = g => a0 + (amax - a0) * g;
    const gOf = u => (Math.exp(4 * clamp(u, 0, 1)) - 1) / (Math.exp(4) - 1);

    const defs = runout
      ? [['setup', .06, 0], ['start', .06, 10], ['run', .72, 0], ['stop', .16, 60]]
      : [['setup', .06, 0], ['start', .06, 10], ['init', .30, 0], ['prop', .38, 0], ['final', .04, 0], ['frac', .16, 60]];
    let acc = 0;
    const phases = defs.map(([id, w, dur]) => { const o = { id, p0: acc, p1: acc + w, dur }; acc += w; return o; });
    const ph = id => phases.find(p => p.id === id);
    const pEnd = runout ? ph('stop').p0 : ph('final').p1;     // instante en que termina el ciclado

    function state(pp) {
      const p = clamp(pp, 0, 1);
      const P = phases.find(q => p <= q.p1) || phases[phases.length - 1];
      const u = clamp((p - P.p0) / (P.p1 - P.p0), 0, 1), id = P.id;
      const o = { p, phase: id, u, N: 0, g: 0, a: 0, motor: 0, broken: false, drop: 0, load: id === 'setup' ? ease(u) : 1, marks: 0 };
      if (id === 'setup') { o.load = ease(u); }
      else if (id === 'start') { o.motor = ease(u); o.N = 0; }
      else if (id === 'init') { o.motor = 1; o.N = Ni * u; o.g = 0.015 * ease(u); }
      else if (id === 'prop') { o.motor = 1; o.N = Ni + Np * u; o.g = 0.015 + 0.985 * gOf(u); }
      else if (id === 'final') { o.motor = 1 - ease(u); o.N = Nf; o.g = 1; o.broken = u > 0.25; o.drop = ease((u - 0.25) / 0.75); }
      else if (id === 'frac') { o.N = Nf; o.g = 1; o.broken = true; o.drop = 1; }
      else if (id === 'run') { o.motor = 1; o.N = Nlim * u; }
      else if (id === 'stop') { o.motor = 1 - ease(u * 4); o.N = Nlim; }
      o.a = runout ? 0 : aOf(o.g);
      o.tReal = o.N / c.f;
      return o;
    }
    const NS = 400, samples = [];
    for (let i = 0; i < NS; i++) { const s = state(i / (NS - 1)); samples.push({ p: s.p, N: s.N, a: s.a, g: s.g, phase: s.phase }); }

    // --- cargas ---
    const Fload = bend ? sa * Math.PI * d ** 3 / (32 * c.L) : 0;            // N (flexión: brazo L)
    const Torque = bend ? 0 : sa * Math.PI * d ** 3 / 16 / 1000;            // N·m
    const Fcrank = bend ? 0 : Torque * 1000 / c.L;                            // N en el extremo de la palanca (brazo L)

    // --- comprobaciones ---
    const checks = [], chk = (label, ok, value, limit, hint) => checks.push({ label, ok, value, limit, hint });
    chk('Esfuerzo alterno simétrico (R = −1, σ_m = 0)', true, 'R = −1', 'R = −1', '');
    chk('Tensión equivalente menor que Rm', seqEff < 0.98 * Rm, `${seqEff.toFixed(0)} MPa`, `< ${(0.98 * Rm).toFixed(0)} MPa`, 'La probeta rompe en el primer ciclo (rotura estática): reduce la carga.');
    chk('Vida ≥ 10³ ciclos (régimen de fatiga)', runout || Nf >= 1e3, runout ? 'sin rotura' : fmtN(Nf), '≥ 1 000', 'Carga excesiva: es fatiga oligocíclica, casi rotura estática.');
    chk('Frecuencia ≤ 100 Hz (sin calentamiento apreciable)', c.f <= 100 ? true : c.f <= 200 ? 'warn' : false, `${c.f.toFixed(0)} Hz`, '≤ 100 Hz', 'A frecuencias altas la probeta se calienta y falsea la vida.');
    chk('Diámetro de probeta 5 – 12 mm', d >= 5 && d <= 12 ? true : 'warn', `${d} mm`, '5 – 12 mm', 'Probetas fuera de este rango no son comparables con las normalizadas.');
    chk('Acabado superficial pulido', c.finish === 'polished' ? true : 'warn', FINISH[c.finish].name, 'pulido', 'Un mal acabado reduce el límite de fatiga (factor k_a).');
    chk('Probeta sin defectos de partida', c.defect === 'none' ? true : 'warn', DEFECT[c.defect].name, 'sin defecto', 'El defecto concentra tensiones (K_f) y acorta la vida.');
    const ok = checks.every(k => k.ok === true || k.ok === 'warn');

    const regime = runout ? 'vida infinita (sin rotura)' : Nf < 1e4 ? 'fatiga oligocíclica' : Nf < 1e5 ? 'fatiga de bajo número de ciclos' : 'fatiga de alto número de ciclos';
    const reco = [];
    reco.push(`Límite de fatiga efectivo ${bend ? 'σ' : 'τ'}_e,ef = ${SeEff.toFixed(0)} MPa (${((1 - SeEff / SeBase) * 100).toFixed(0)} % menos que la probeta pulida sin defectos, ${SeBase.toFixed(0)} MPa).`);
    reco.push(runout ? 'La amplitud aplicada está por debajo del límite de fatiga efectivo: el ensayo se detiene a ' + fmtN(Nlim) + ' ciclos sin rotura.'
      : `La rotura ocurre tras ${fmtN(Nf)} ciclos: ${(fi * 100).toFixed(0)} % de la vida en iniciar la grieta y ${((1 - fi) * 100).toFixed(0)} % en propagarla.`);
    if (!runout) reco.push(`La zona de rotura final ocupa el ${(ffinal * 100).toFixed(0)} % de la sección: cuanto mayor es la tensión, mayor es esta zona.`);
    reco.push(`Para obtener la curva de Wöhler ensaya 6–8 probetas a distintas amplitudes (de ${(0.9 * Rm / conv).toFixed(0)} MPa hasta por debajo de ${SeEff.toFixed(0)} MPa).`);
    if (c.defect !== 'none') reco.push('Compara con una probeta pulida sin defecto: la diferencia de vida muestra el efecto del concentrador de tensiones.');
    if (c.f > 100) reco.push('Reduce la frecuencia por debajo de 100 Hz para evitar el calentamiento de la probeta.');

    const res = {
      bend, N: Nf, Nlim, runout, Ni: runout ? null : Ni, Np: runout ? null : Np, fi, tReal: Nf / c.f, rpm: c.f * 60,
      Fload, mass: Fload / G, Torque, Fcrank, seq, seqEff, SeEff, SeBase, Kf, ka, kb, ffinal, amax, regime, staticFail: !runout && Nf <= 1,
      ok, nFail: checks.filter(k => k.ok === false).length, ampMax: 0.9 * Rm / conv, conv, unit: bend ? 'σa' : 'τa',
      designation: runout ? `Sin rotura · N > ${fmtN(Nlim)}` : `N = ${fmtN(Nf)} ciclos`,
    };

    // serie de ensayos (curva de Wöhler) con dispersión determinista
    function series() {
      const top = res.ampMax * 0.97, bot = SeEff * (ferrous ? 0.82 : 0.6), out = [];
      for (let i = 0; i < 8; i++) {
        const s = top * Math.pow(bot / top, i / 7), l = lifeOf(s);
        const n = Math.sin(i * 12.9898 + 7.233) * 43758.5453, r = (n - Math.floor(n)) * 2 - 1;
        const N = l.runout ? Nlim : clamp(l.N * Math.pow(10, 0.18 * r), 1, Nlim * 0.9);
        out.push({ s, N, runout: l.runout });
      }
      return out;
    }

    return { cfg: c, mat: c.mat, phases, state, samples, res, checks, reco, lifeOf, ampAt, series, pEnd, mode, nOrig, rf, rc, R, a0, amax, aOf, gOf,
      A, b, S1k, Nlim, Nk, ferrous, ffinal, phi0: 40 * Math.PI / 180, SeEff, SeBase, conv, Ni, Np, Nf };
  }

  function fmtN(N) {
    if (!isFinite(N)) return '∞';
    if (N < 1e5) return Math.round(N).toLocaleString('es-ES');
    const e = Math.floor(Math.log10(N)), m = N / Math.pow(10, e);
    const sup = String(e).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
    return `${m.toFixed(1).replace('.', ',')}·10${sup}`;
  }

  const api = { G, MATERIALS, FINISH, DEFECT, PHASE_META, buildFatigue, fmtN, lens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FatigueModel = api;
})(this);
