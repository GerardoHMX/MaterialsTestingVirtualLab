/* Modelo del ensayo de tracción: material -> curva tensión-deformación (ingenieril)
   Lógica pura (sin DOM) para poder probarla en Node. */
(function (root) {
  'use strict';

  const ZONES = {
    elastic:   { label: 'Zona elástica',               short: 'Elástica',       color: '#2563eb' },
    yield:     { label: 'Fluencia / zona elastoplástica', short: 'Fluencia',     color: '#d97706' },
    hardening: { label: 'Endurecimiento por deformación', short: 'Endurecim.',   color: '#16a34a' },
    necking:   { label: 'Estricción',                  short: 'Estricción',     color: '#dc2626' },
    rupture:   { label: 'Rotura',                      short: 'Rotura',         color: '#475569' },
  };

  // Datos de la tabla del curso (kp/mm²): se convierten a MPa con 1 kp/mm² = 9,80665 MPa.
  // Los rangos de la tabla se toman por su punto medio. A y Z no figuran en la tabla: son valores orientativos.
  const KP = 9.80665;
  const mk = (name, kind, E, Re, Rm, St, A, Z, color) => ({
    name, kind, E: +(E * KP / 1000).toFixed(1), Re: +(Re * KP).toFixed(1), ReL: kind === 'yield' ? +(Re * KP * 0.95).toFixed(1) : 0,
    Rm: +(Rm * KP).toFixed(1), St: +(St * KP).toFixed(1), A, Z, color,
  });
  // mk(nombre, comportamiento, E[kp/mm²], σE, σR, σt, A%, Z%, color)
  const PRESETS = {
    acero:    mk('Acero',                 'yield',  22000, 30,   50,    13.5, 22, 50, '#94a3b8'),
    hierroS:  mk('Hierro soldado',        'yield',  20000, 18,   33,    9,    20, 35, '#a8a29e'),
    hierroH:  mk('Hierro homogéneo',      'yield',  20000, 16,   40,    8,    25, 50, '#9ca3af'),
    acEsp:    mk('Aceros especiales (E supuesto)', 'smooth', 22000, 90, 135, 22.5, 10, 35, '#7b8794'),
    alambreA: mk('Alambre de acero',      'smooth', 24000, 45,   137.5, 24,   5,  30, '#b0bcc9'),
    fundicion:mk('Fundición',             'brittle',10000, 6,    12.5,  3,    0.5, 0, '#475569'),
    cobre:    mk('Cobre en alambre',      'smooth', 13000, 5,    50,    5,    15, 60, '#c2763a'),
    aluminio: mk('Aluminio en chapa (Re estimado)', 'smooth', 7000, 5, 11, 2, 8, 30, '#cbd5e1'),
    bronce:   mk('Bronce en lingotes',    'smooth', 7000,  8,    20,    2.5,  10, 25, '#b7791f'),
    madera:   mk('Madera dura',           'smooth', 1200,  2.5,  8.5,   0.6,  3,  5,  '#a16207'),
    canamo:   mk('Cuerda de cáñamo',      'smooth', 150,   1,    7,     0.8,  12, 5,  '#d6c28a'),
    custom:   { name: 'Material personalizado', kind: 'yield', E: 200, Re: 300, ReL: 285, Rm: 450, A: 20, Z: 50, color: '#94a3b8' },
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function buildModel(c) {
    const warnings = [];
    const m = Object.assign({}, c.mat);
    const kind = m.kind;

    // --- Probeta ---------------------------------------------------------
    const S0 = c.shape === 'cyl' ? Math.PI * c.d0 * c.d0 / 4 : c.a0 * c.b0;
    const rootS = Math.sqrt(S0);
    let L0 = c.k * rootS;
    const L0r = Math.round(L0 / 5) * 5;                     // se redondea al múltiplo de 5 mm (≤10 %)
    if (L0r > 0 && Math.abs(L0r - L0) <= 0.1 * L0) L0 = L0r;
    const Lc = c.shape === 'cyl' ? L0 + c.d0 / 2 : L0 + 1.5 * rootS;   // longitud paralela mínima

    // --- Material (con saneado de datos) ---------------------------------
    const E = m.E * 1000;           // MPa
    let Rm = m.Rm, Re = m.Re, ReL = m.ReL;
    if (kind === 'yield') {
      if (Rm < Re * 1.02) { Rm = Re * 1.02; warnings.push('Rm debe ser mayor que Re: se ajustó Rm.'); }
      if (!(ReL > 0) || ReL > Re) ReL = Re * 0.96;
    } else if (kind === 'smooth') {
      if (Rm < Re * 1.05) { Rm = Re * 1.05; warnings.push('Rm debe superar a Rp0,2 al menos un 5 %: se ajustó Rm.'); }
      ReL = 0;
    } else { Re = 0; ReL = 0; }

    let epsR = m.A / 100;
    const Zf = kind === 'brittle' ? 0 : clamp(m.Z / 100, 0, 0.9);

    // --- Construcción de la curva por zonas ------------------------------
    // El tiempo de simulación (p: 0..1) se reparte por zonas para que todas se aprecien.
    const zoneDefs = kind === 'yield'
      ? [['elastic', .22], ['yield', .14], ['hardening', .28], ['necking', .26], ['rupture', .10]]
      : kind === 'smooth'
        ? [['elastic', .25], ['yield', .12], ['hardening', .30], ['necking', .23], ['rupture', .10]]
        : [['elastic', .85], ['rupture', .15]];
    const zb = {}; let acc = 0;
    zoneDefs.forEach(([z, w]) => { zb[z] = [acc, acc + w]; acc += w; });
    const pR = zb.rupture[0];
    const zoneList = zoneDefs.map(d => d[0]);

    let fn, epsU, zoneEps = {}, sigF, sigP = null, epsY = null, epsH = null, zoomEps, nRO = null;

    if (kind === 'yield') {
      epsY = Re / E;
      const plat = Math.min(0.02, 0.12 * epsR);
      epsH = epsY + plat;
      epsR = Math.max(epsR, epsH * 2.2);
      epsU = clamp(0.7 * epsR, epsH + 0.05 * epsR, 0.9 * epsR);
      sigF = 0.70 * Rm;
      sigP = Re;
      zoneEps = { elastic: [0, epsY], yield: [epsY, epsH], hardening: [epsH, epsU], necking: [epsU, epsR] };
      zoomEps = Math.min(epsR, 4 * epsY);
      fn = (z, u) => {
        if (z === 'elastic') { const e = epsY * u; return [e, E * e]; }
        if (z === 'yield') {
          const e = lerp(epsY, epsH, u), d = 0.05;
          const s = u < d ? Re - (Re - ReL) * (u / d) : ReL * (1 + 0.006 * Math.sin((u - d) * 60) * (1 - u));
          return [e, s];
        }
        if (z === 'hardening') return [lerp(epsH, epsU, u), ReL + (Rm - ReL) * (1 - Math.pow(1 - u, 2.2))];
        return [lerp(epsU, epsR, u), Rm - (Rm - sigF) * u * u];
      };
    } else if (kind === 'smooth') {
      epsR = Math.max(epsR, Re / E + 0.03);
      epsU = Math.max(0.7 * epsR, Rm / E + 0.012);
      epsR = Math.max(epsR, epsU * 1.12);
      nRO = Math.min(200, Math.log((epsU - Rm / E) / 0.002) / Math.log(Rm / Re));
      const roEps = s => s / E + 0.002 * Math.pow(s / Re, nRO);
      const roSig = e => { let lo = 0, hi = Rm; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (roEps(mid) < e) lo = mid; else hi = mid; } return (lo + hi) / 2; };
      sigP = 0.8 * Re;
      const epsE = roEps(sigP);
      const epsY2 = Re / E + 0.006;
      sigF = 0.85 * Rm;
      epsY = roEps(Re);                // deformación en Rp0,2
      zoneEps = { elastic: [0, epsE], yield: [epsE, epsY2], hardening: [epsY2, epsU], necking: [epsU, epsR] };
      zoomEps = Math.min(epsR, epsY2 * 1.15);
      fn = (z, u) => {
        if (z === 'elastic') { const e = epsE * u; return [e, roSig(e)]; }
        if (z === 'yield') { const e = lerp(epsE, epsY2, u); return [e, roSig(e)]; }
        if (z === 'hardening') { const e = lerp(epsY2, epsU, u); return [e, Math.min(Rm, roSig(e))]; }
        return [lerp(epsU, epsR, u), Rm - (Rm - sigF) * u * u];
      };
    } else { // frágil
      epsR = Math.max(epsR, 1.1 * Rm / E);
      epsU = epsR;
      const mm = E * epsR / Rm;        // pendiente inicial = E; sale de σ = Rm·(1-(1-x)^m)
      sigF = Rm;
      zoneEps = { elastic: [0, epsR] };
      zoomEps = epsR;
      fn = (_z, u) => [epsR * u, Rm * (1 - Math.pow(1 - u, mm))];
    }

    const N = 1600;
    const samples = [];
    const zoneAt = p => {
      for (const z of zoneList) { if (z === 'rupture') break; const [a, b] = zb[z]; if (p <= b) return [z, clamp((p - a) / (b - a), 0, 1)]; }
      return [zoneList[zoneList.length - 2], 1];
    };
    for (let i = 0; i < N; i++) {
      const p = pR * i / (N - 1);
      const [z, u] = zoneAt(p);
      const [eps, sig] = fn(z, u);
      samples.push({ p, eps, sig, zone: z });
    }
    // Rotura: la deformación y la tensión salen exactamente de la última muestra
    sigF = samples[N - 1].sig;
    const epsPerm = Math.max(0, epsR - sigF / E);

    // --- Resultados -------------------------------------------------------
    let Uf = 0;
    for (let i = 1; i < N; i++) Uf += 0.5 * (samples[i].sig + samples[i - 1].sig) * (samples[i].eps - samples[i - 1].eps);
    const ReSafe = kind === 'brittle' ? Rm : Re;
    const n = c.n, sigTrab = c.sigTrab;
    const sigAdm = ReSafe / n;
    const results = {
      E: m.E, sigP, Re, ReL, Rm,
      Fm: Rm * S0 / 1000, A: epsR * 100, Z: Zf * 100,
      Su: S0 * (1 - Zf), Lu: L0 * (1 + epsPerm),
      Ur: kind === 'brittle' ? null : Re * Re / (2 * E), Uf,
      sigAdm, FAdm: sigAdm * S0 / 1000,
      nReal: sigTrab > 0 ? ReSafe / sigTrab : null, ReSafe, sigTrab,
    };

    // --- Estado en el instante p (0..1) ----------------------------------
    function state(pp) {
      const p = clamp(pp, 0, 1);
      if (p >= pR) {
        const sep = (p - pR) / (1 - pR);
        const t = Math.min(1, sep / 0.25);                   // descarga elástica al romper
        return { p, ruptured: true, sep, zone: 'rupture', u: 1,
          eps: epsR, sig: sigF, epsPlot: epsR - t * sigF / E, sigPlot: sigF * (1 - t),
          epsSpec: epsR };
      }
      const f = p / pR * (N - 1), i = Math.min(N - 2, Math.floor(f)), t = f - i;
      const a = samples[i], b = samples[i + 1];
      const eps = lerp(a.eps, b.eps, t), sig = lerp(a.sig, b.sig, t);
      const [zone, u] = zoneAt(p);
      return { p, ruptured: false, sep: 0, zone, u, eps, sig, epsPlot: eps, sigPlot: sig, epsSpec: eps };
    }

    return {
      cfg: c, mat: m, kind, S0, L0, Lc, E, Rm, Re, ReL, Z: Zf,
      epsR, epsU, epsY, epsH, epsPerm, sigF, sigP, nRO,
      zb, pR, zoneList, zoneEps, zoomEps, samples, results, state, warnings,
      evMax: kind === 'brittle' ? 0.07 : 0.30,
    };
  }

  const api = { ZONES, PRESETS, buildModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TensileModel = api;
})(this);
