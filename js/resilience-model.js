/* Modelo del ensayo de resiliencia con péndulo de Charpy (UNE 36-403-81). Lógica pura, sin DOM. */
(function (root) {
  'use strict';
  const G = 9.80665;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // Curva de transición: K(T) = Klow + (Kup − Klow)/2 · (1 + tanh((T − Tt)/C)); "flat" = sin transición.
  // duct: fracción de fractura dúctil en materiales sin transición.
  const MATERIALS = {
    s235:   { name: 'Acero S235JR (estructural)',        kind: 'transition', Kup: 125, Klow: 5,  Tt: 0,   C: 30, duct: 1,   color: '#94a3b8' },
    s355:   { name: 'Acero S355J2 (estructural)',        kind: 'transition', Kup: 170, Klow: 6,  Tt: -35, C: 28, duct: 1,   color: '#94a3b8' },
    ac045:  { name: 'Acero 0,45 % C normalizado',        kind: 'transition', Kup: 45,  Klow: 4,  Tt: 30,  C: 35, duct: 1,   color: '#8b99ab' },
    acbon:  { name: 'Acero aleado bonificado (42CrMo4)', kind: 'transition', Kup: 100, Klow: 20, Tt: -70, C: 40, duct: 1,   color: '#7b8794' },
    inox:   { name: 'Acero inoxidable austenítico 304',  kind: 'flat', Kup: 180, Klow: 180, Tt: 0, C: 30, duct: 1,   color: '#cbd5e1' },
    cu:     { name: 'Cobre recocido',                    kind: 'flat', Kup: 200, Klow: 200, Tt: 0, C: 30, duct: 1,   color: '#c2763a' },
    laton:  { name: 'Latón CuZn37',                      kind: 'flat', Kup: 45,  Klow: 45,  Tt: 0, C: 30, duct: 0.9, color: '#d4a72c' },
    al6061: { name: 'Aluminio 6061-T6',                  kind: 'flat', Kup: 18,  Klow: 18,  Tt: 0, C: 30, duct: 0.6, color: '#cbd5e1' },
    ti64:   { name: 'Titanio Ti-6Al-4V',                 kind: 'flat', Kup: 22,  Klow: 22,  Tt: 0, C: 30, duct: 0.6, color: '#a1a1aa' },
    acherr: { name: 'Acero de herramientas templado',    kind: 'flat', Kup: 6,   Klow: 6,   Tt: 0, C: 30, duct: 0.05, color: '#6b7280' },
    fgris:  { name: 'Fundición gris',                    kind: 'flat', Kup: 3,   Klow: 3,   Tt: 0, C: 30, duct: 0,   color: '#475569' },
    custom: { name: 'Material personalizado',            kind: 'transition', Kup: 100, Klow: 10, Tt: -20, C: 30, duct: 1, color: '#94a3b8' },
  };

  const PHASE_META = {
    cond:     { label: 'Acondicionamiento térmico', short: 'Acondic.',  color: '#0ea5e9' },
    transfer: { label: 'Traslado y colocación',     short: 'Traslado',  color: '#64748b' },
    fall:     { label: 'Caída del péndulo',         short: 'Caída',     color: '#2563eb' },
    impact:   { label: 'Impacto y rotura',          short: 'Impacto',   color: '#dc2626' },
    rise:     { label: 'Ascenso del péndulo',       short: 'Ascenso',   color: '#d97706' },
    read:     { label: 'Lectura de la energía',     short: 'Lectura',   color: '#7c3aed' },
    frac:     { label: 'Examen de la fractura',     short: 'Fractura',  color: '#475569' },
  };

  // Parámetros efectivos del material según entalla y ancho de probeta (aproximación didáctica)
  function effective(mat, notch, B) {
    const f = (notch === 'U' ? 1.6 : 1) * (B / 10);
    return { kind: mat.kind, Kup: mat.Kup * f, Klow: mat.Klow * f, Tt: mat.Tt + (notch === 'U' ? -15 : 0), C: mat.C, duct: mat.duct };
  }
  function kCurve(e, T) { return e.kind === 'transition' ? e.Klow + (e.Kup - e.Klow) / 2 * (1 + Math.tanh((T - e.Tt) / e.C)) : e.Kup; }
  function fibrous(e, K) { return e.kind === 'transition' ? clamp((K - e.Klow) / (e.Kup - e.Klow), 0, 1) : e.duct; }

  // Integración del péndulo (RK4) hasta que stop(th, om) sea cierto
  function integrate(th0, om0, L, stop) {
    const dt = 0.001, arr = [{ t: 0, th: th0, om: om0 }];
    let t = 0, th = th0, om = om0;
    const a = x => -(G / L) * Math.sin(x);
    for (let i = 0; i < 6000; i++) {
      const k1t = om, k1o = a(th);
      const k2t = om + dt / 2 * k1o, k2o = a(th + dt / 2 * k1t);
      const k3t = om + dt / 2 * k2o, k3o = a(th + dt / 2 * k2t);
      const k4t = om + dt * k3o, k4o = a(th + dt * k3t);
      th += dt / 6 * (k1t + 2 * k2t + 2 * k3t + k4t); om += dt / 6 * (k1o + 2 * k2o + 2 * k3o + k4o); t += dt;
      arr.push({ t, th, om });
      if (stop(th, om)) break;
    }
    return arr;
  }
  function at(tab, t) {
    const T = tab[tab.length - 1].t; t = clamp(t, 0, T);
    const f = t / 0.001, i = Math.min(tab.length - 2, Math.floor(f)), k = f - i;
    return { th: lerp(tab[i].th, tab[i + 1].th, k), om: lerp(tab[i].om, tab[i + 1].om, k) };
  }

  function buildCharpy(c) {
    const L = 0.8, alpha = 140 * Math.PI / 180, W0 = c.cap, B = c.B, notch = c.notch;
    const mgL = W0 / (1 - Math.cos(alpha));          // m·g·L
    const m = mgL / (G * L);
    const v0 = Math.sqrt(2 * G * L * (1 - Math.cos(alpha)));
    const depth = notch === 'V' ? 2 : 5, lig = 10 - depth, S0 = lig * B;     // mm²
    const eff = effective(c.mat, notch, B);
    const Ktrue = kCurve(eff, c.T);
    const notBroken = Ktrue > 0.97 * W0;
    const K = notBroken ? 0.95 * W0 : Ktrue;
    const frac = notBroken ? 1 : fibrous(eff, Ktrue);
    const LE = 1.7 * Math.pow(frac, 0.85) * (B / 10);
    const cosB = clamp(Math.cos(alpha) + K / mgL, -1, 1), beta = Math.acos(cosB);
    const rho = K / (S0 / 100);                                                // J/cm²
    const tw = c.transfer, Thit = c.T + (20 - c.T) * (1 - Math.exp(-tw / 60)), dTw = Thit - c.T;

    const fallTab = integrate(-alpha, 0, L, (th) => th >= 0);
    const tFall = fallTab[fallTab.length - 1].t;
    const om0 = Math.sqrt(Math.max(0, 2 * (W0 - K) / m)) / L;
    const riseTab = integrate(0, om0, L, (th, om) => om <= 0);
    const tRise = riseTab[riseTab.length - 1].t;

    const defs = [['cond', .10, 300], ['transfer', .08, tw], ['fall', .18, tFall], ['impact', .14, 0.005], ['rise', .18, tRise], ['read', .18, 5], ['frac', .14, 60]];
    let acc = 0, tAcc = 0;
    const phases = defs.map(([id, w, dur]) => { const o = { id, p0: acc, p1: acc + w, dur, t0: tAcc }; acc += w; tAcc += dur; return o; });
    const ph = id => phases.find(p => p.id === id);
    const pRead = ph('read').p0, pImpact = ph('impact').p0;
    const zf = notBroken ? 24 : 0.5 + 13 * frac;          // flecha (mm) en la rotura

    const Eof = th => mgL * (Math.cos(th) - Math.cos(alpha));   // energía que indica el péndulo al subir hasta th
    function state(pp) {
      const p = clamp(pp, 0, 1);
      const P = phases.find(q => p <= q.p1) || phases[phases.length - 1];
      const u = clamp((p - P.p0) / (P.p1 - P.p0), 0, 1), id = P.id;
      const o = { p, phase: id, u, th: -alpha, v: 0, Ep: W0, Ek: 0, Eabs: 0, Tspec: c.T, tTr: 0, z: 0, s: -12, ac: 0, broken: false, sep: 0, pointer: 0, notBroken, a: 0 };
      const setMech = (th, om, Etot) => { o.th = th; o.v = Math.abs(om) * L; o.Ep = mgL * (1 - Math.cos(th)); o.Ek = Math.max(0, Etot - o.Ep); };
      if (id === 'cond') { o.Tspec = lerp(20, c.T, ease(u * 1.4)); }
      else if (id === 'transfer') { o.tTr = u * tw; o.Tspec = c.T + (20 - c.T) * (1 - Math.exp(-o.tTr / 60)); }
      else if (id === 'fall') { const s = at(fallTab, u * tFall); setMech(s.th, s.om, W0); o.Tspec = Thit; o.s = -12; }
      else if (id === 'impact') {
        const a = ease((u - 0.2) / 0.65); o.a = a; o.th = 0; o.Tspec = Thit; o.Eabs = K * a; o.Ep = 0; o.Ek = W0 - o.Eabs; o.v = Math.sqrt(2 * o.Ek / m);
        o.s = u < 0.2 ? -12 + 12 * ease(u / 0.2) : null;
        o.z = u < 0.2 ? 0 : zf * a;
        o.broken = !notBroken && u >= 0.85;
        o.sep = o.broken ? (u - 0.85) / 0.15 : 0;
        o.ac = lig * (o.broken ? 1 : (notBroken ? 0.6 * a : 0.8 * Math.pow(a, 1 + 2 * (1 - frac))));
        if (o.s === null) o.s = o.broken ? zf + 8 * o.sep : o.z;
        o.pointer = 0;
      } else {
        o.Tspec = Thit; o.a = 1; o.Eabs = K; o.z = zf; o.broken = !notBroken; o.ac = lig; o.z = zf;
        if (id === 'rise') { const s = at(riseTab, u * tRise); setMech(s.th, s.om, W0 - K); o.pointer = Math.max(0, s.th); o.sep = o.broken ? 1 + u : 0; o.s = zf + 8 + 60 * u; }
        else { setMech(beta, 0, W0 - K); o.pointer = beta; o.sep = o.broken ? 2 : 0; o.s = zf + 70; }
        o.Ek = Math.max(0, W0 - K - o.Ep);
      }
      o.reading = Eof(o.pointer);
      return o;
    }

    const NS = 600, samples = [];
    for (let i = 0; i < NS; i++) { const s = state(i / (NS - 1)); samples.push({ p: s.p, Ep: s.Ep, Ek: s.Ek, Eabs: s.Eabs }); }

    // --- comprobaciones ---
    const checks = [];
    const chk = (label, ok, value, limit, hint) => checks.push({ label, ok, value, limit, hint });
    chk('Velocidad de impacto 5 – 5,5 m/s', v0 >= 5 && v0 <= 5.5, `${v0.toFixed(2)} m/s`, '5,0 – 5,5 m/s', 'Revisa la altura de caída del péndulo.');
    chk('Probeta rota por completo', !notBroken, notBroken ? 'no rota' : 'rota', 'rota', 'La energía de la probeta supera la capacidad: usa un péndulo de mayor energía.');
    chk('Energía absorbida ≤ 80 % de la capacidad', notBroken ? false : (K <= 0.8 * W0 ? true : 'warn'), `${(K / W0 * 100).toFixed(0)} % de ${W0} J`, '≤ 80 %', 'Resultado aproximado: usa un péndulo de mayor capacidad.');
    chk('Tiempo de traslado ≤ 5 s', tw <= 5, `${tw} s`, '≤ 5 s', 'La probeta se calienta/enfría durante el traslado.');
    chk('Variación de temperatura durante el traslado ≤ 2 °C', Math.abs(dTw) <= 2 ? true : 'warn', `${dTw >= 0 ? '+' : ''}${dTw.toFixed(1)} °C`, '± 2 °C', 'Sobreenfría/sobrecalienta la probeta para compensar el traslado.');
    chk('Probeta normalizada (ancho 10 mm)', B === 10 ? true : 'warn', `${B} mm`, '10 mm', 'Con probeta reducida los resultados no son comparables con los de la probeta normal.');
    const ok = checks.every(k => k.ok === true || k.ok === 'warn');

    // --- recomendaciones ---
    const reco = [];
    const need = K / 0.8;
    reco.push(`Capacidad necesaria del péndulo ≥ ${need.toFixed(0)} J (K ≤ 80 % de W₀): ${[150, 300].map(w => `${w} J ${w >= need ? '✓' : '✗'}`).join(' · ')}.`);
    if (eff.kind === 'transition') {
      const lo = Math.round(eff.Tt - 2 * eff.C), hi = Math.round(eff.Tt + 2 * eff.C);
      reco.push(`Para trazar la curva de transición ensaya entre ${lo} y ${hi} °C (alrededor de T_t ≈ ${eff.Tt.toFixed(0)} °C).`);
      if (frac > 0.1 && frac < 0.9) reco.push('Estás en la zona de transición: la dispersión es alta; ensaya al menos 3 probetas por temperatura.');
      else if (frac <= 0.1) reco.push('Estás en la meseta inferior (rotura frágil): una pequeña subida de temperatura aumenta mucho la energía.');
      else reco.push('Estás en la meseta superior (rotura dúctil): el material tiene reserva frente a la fragilidad.');
    } else reco.push('Este material no presenta transición dúctil-frágil apreciable: K casi no depende de la temperatura.');
    if (notch === 'U') reco.push('La entalla en U (KU) es menos severa que la V: da energías mayores; no compares KU con KV.');

    const regime = frac <= 0.15 ? 'frágil' : frac >= 0.85 ? 'dúctil' : 'de transición';
    const res = {
      W0, m, L, alphaDeg: 140, v0, S0, depth, lig, Ktrue, K, betaDeg: beta * 180 / Math.PI, rho, rhoKgm: rho * 0.10197, frac, LE, notBroken, Thit, dTw,
      regime, ok, nFail: checks.filter(k => k.ok === false).length, reqOk: K >= c.Kmin, Kmin: c.Kmin, eff,
      designation: `K${notch} ${W0}/${c.striker} = ${notBroken ? '> ' + (0.97 * W0).toFixed(0) : K.toFixed(0)} J`,
    };

    // --- serie de temperaturas (curva de transición) ---
    function series() {
      const Ts = eff.kind === 'transition' ? Array.from({ length: 11 }, (_, i) => Math.round(eff.Tt - 4 * eff.C + i * 0.8 * eff.C)) : [-60, -20, 20, 60, 100];
      return Ts.map((T, i) => {
        const base = kCurve(eff, T), n = Math.sin(i * 12.9898 + 4.1414) * 43758.5453, r = (n - Math.floor(n)) * 2 - 1;
        const range = eff.Kup - eff.Klow || eff.Kup;
        const Kp = clamp(base + r * 0.07 * Math.max(range * (eff.kind === 'transition' ? 1 : 0.2), 1) * (eff.kind === 'transition' ? (1 - Math.abs(base - (eff.Kup + eff.Klow) / 2) / (range / 2 + 1e-9) * 0.5) : 1), 0.5, 0.97 * W0);
        return { T, K: Kp, frac: fibrous(eff, base) };
      });
    }
    return { cfg: c, mat: c.mat, eff, phases, state, samples, res, checks, reco, pRead, pImpact, W0, m, L, alpha, mgL, v0, zf, depth, lig, S0, beta,
      Eof, curve: T => kCurve(eff, T), series, tFall, tRise, tTotal: tAcc };
  }

  // Temperatura a la que la serie cruza un nivel de energía (interpolación lineal)
  function crossing(points, level) {
    const p = points.slice().sort((a, b) => a.T - b.T);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      if ((a.K - level) * (b.K - level) <= 0 && a.K !== b.K) return a.T + (level - a.K) * (b.T - a.T) / (b.K - a.K);
    }
    return null;
  }

  const api = { G, MATERIALS, PHASE_META, buildCharpy, crossing, kCurve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CharpyModel = api;
})(this);
