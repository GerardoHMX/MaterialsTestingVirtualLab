# Contexto del proyecto · Laboratorio virtual de ensayos mecánicos

> **Uso:** pega este archivo completo al inicio de una conversación nueva (o pide que lo lea) y añade debajo lo que quieres cambiar. Es solo para uso privado: **no lo publiques** en el repositorio (menciona el flujo de trabajo con el asistente).

---

## Prompt de arranque

Vas a continuar el desarrollo de una aplicación web ya terminada. Lee todo este documento y luego **inspecciona los archivos reales** del proyecto antes de proponer cambios (el código manda sobre este resumen si hay diferencias). Mantén exactamente la misma línea de diseño, arquitectura y forma de trabajo que se describen aquí. Responde siempre en español.

**Mi petición ahora:** _(escribe aquí qué quieres añadir o modificar)_

---

## 1. Qué es

Aplicación web **estática** (HTML + JavaScript + Tailwind por CDN, sin build ni dependencias) que simula ensayos mecánicos para explicar las propiedades de los materiales de forma **muy visual y esquemática**. Cuatro pestañas, todas terminadas:

| Pestaña | Ensayo | Norma mostrada en cabecera |
|---|---|---|
| Tracción | Probetas cilíndricas/prismáticas, máquina de tracción | UNE 7-474 |
| Dureza | Brinell / Vickers / Rockwell (HRA, HRB, HRC) | UNE 7-422-85 / 7-423-84 / 7-424-89 |
| Resiliencia | Péndulo de Charpy (KV/KU), curva de transición | UNE 36-403-81 |
| Fatiga | Flexión rotativa / torsión alternativa en voladizo, motor de frecuencia regulable | campo libre «Norma de referencia (opcional)»; no se indicó norma |

Estructura de cada ensayo (misma en los cuatro):
- **Cabecera:** nombre del ensayo, norma, material, probeta y condiciones (chips) + botón «Configurar ensayo».
- **Izquierda:** simulación en canvas (identificando las zonas fundamentales), display digital, chips de fases/zonas clicables, controles de reproducción (inicio, paso atrás, reproducir hacia atrás, reproducir/pausa, paso adelante, final, barra de progreso, velocidad 0,25×–4×) y tarjeta de explicación de la fase actual con su fórmula.
- **Derecha:** resultado («hero») con insignias de validez, gráficas, parámetros que se «iluminan» al llegar al punto donde se obtienen, condiciones de validez, recomendaciones.
- **Pie:** fórmulas (con descripción de cada elemento) y vocabulario, **distintos por pestaña**; debajo, el bloque de licencia CC BY-NC-SA 4.0 de Gerardo Huizar Castro.
- **Flujo:** al abrir una pestaña por primera vez se abre el diálogo de configuración con valores por defecto; «Calcular y simular» construye el modelo y arranca la reproducción.

## 2. Archivos

```
index.html               Estructura de todas las pestañas, diálogos de configuración, meta/Open Graph
assets/og-image.png      Imagen Open Graph 1200×630
js/model.js              Tracción: modelo del material (puro)        → window.TensileModel
js/app.js                Tracción: UI, canvas, controles
js/tabs.js               Registro de pestañas (LAB.register / LAB.show)
js/hardness-model.js     Dureza: modelo (puro)                       → window.HardnessModel
js/hardness.js           Dureza: UI
js/resilience-model.js   Resiliencia: modelo (puro)                  → window.CharpyModel
js/resilience.js         Resiliencia: UI
js/fatigue-model.js      Fatiga: modelo (puro)                       → window.FatigueModel
js/fatigue.js            Fatiga: UI
README.md                Descripción, alcances y limitaciones (sin mención al uso de IA)
CONTEXTO_PROYECTO.md     Este archivo (privado)
```

Orden de `<script>` al final de `index.html`: `model.js`, `app.js`, `tabs.js`, `hardness-model.js`, `hardness.js`, `resilience-model.js`, `resilience.js`, `fatigue-model.js`, `fatigue.js`.

## 3. Arquitectura (patrón que debes respetar)

**Modelo puro + UI separada.** Cada `*-model.js` es una IIFE sin DOM que exporta `buildX(cfg)` (también `module.exports` para probarlo con Node). Devuelve el modelo con: `state(p)` (p ∈ [0,1] = progreso), `phases` (`{id,p0,p1,dur}`), `samples` para las gráficas, `res` (resultados), `checks`, `reco`, y datos de geometría. La UI (`*.js`) es otra IIFE que lee/escribe el DOM, dibuja canvas y llama a `model.state(S.p)` en cada `render()`.

**Estado de cada UI:** `S = {model, p, playing, dir, speed, last, started, points…}`; bucle con `requestAnimationFrame` en `tick`; `setPlaying(on, dir)`; `render()` redibuja todo y no hace nada si `LAB.active` no es su pestaña.

**Pestañas:** `window.LAB = {active}`. Cada UI llama `LAB.register(id, {btn, main, hdr, title, grid:true, footer:{f,v}, pause, onShow})`. `tabs.js` alterna `hidden` en `mainX`/`hdrX`, cambia el título (`#hTitle`), el pie (`#ftFormulas`, `#ftVocab`) y llama a `onShow`. Ids: `tens`, `hard`, `res`, `fat`. Los atajos de teclado (Espacio, ←, →, Inicio, Fin) comprueban `LAB.active`; `F` = pantalla completa (botón `#btnFs`).

**Prefijos de ids (evitar colisiones):** tracción sin prefijo + `cfg`/`cfgGo`; dureza `h…` (`cfgH`, `hGo`, selector de bola `hDia`); resiliencia `r…` (`cfgR`, `rGo`); fatiga `fa…` y `fh…` en cabecera (`cfgF`, `faGo`). Comprobar siempre que no haya ids duplicados.

**Dos construcciones recurrentes:**
- *Fases:* `[id, peso_visual, duración_real]`; el tiempo de simulación se reparte por pesos para que cada fase se vea; la duración real se muestra aparte.
- *Comprobaciones:* `{label, ok: true|false|'warn', value, limit, hint}`; `res.ok` = ninguna en `false`. Si algo falla, el «hero» muestra «NO VÁLIDO» con las `hint`. Los parámetros calculados llevan un `reveal` (valor de p) y se atenúan (`opacity .28`) hasta alcanzarlo.

## 4. Diseño visual (mantener)

- **Tailwind CDN** + bloque `<style type="text/tailwindcss">` con componentes: `.inp .lbl .card .ctl .chip .sec`. Paleta `slate`, acento `blue-600`. Cabecera `slate-900`, pestañas, fondo `slate-100`, pie oscuro. Todo en **español**; decimales con coma (`toLocaleString('es-ES')`), unidades MPa/kN/J.
- **Canvas** con fondo tipo plano técnico (`#f8fafc` con rejilla `#e2e8f0` cada 28 px), tamaño lógico fijo (p. ej. 560×660) escalado con `devicePixelRatio`, texto con «halo» blanco, flechas de cota, etiquetas junto a los elementos clave.
- **Colores de zona/fase** (coherentes en simulación, chips, badge y gráficas): elástica `#2563eb`, fluencia `#d97706`, endurecimiento `#16a34a`, estricción `#dc2626`, rotura `#475569`; en dureza/resiliencia/fatiga cada fase tiene su color en `PHASE_META`.
- Controles de reproducción idénticos en las cuatro pestañas; display oscuro con tipografía monoespaciada para lecturas.
- Cada diálogo de configuración: rejilla de columnas numeradas («1 · …», «2 · …») con material precargable y editable, validación con mensaje de error y botón «Calcular y simular».
- Fidelidad física: la escala visual puede exagerarse (se avisa en una nota), pero **los números mostrados son reales** y consistentes con las fórmulas del pie.

## 5. Contenido técnico por ensayo (resumen)

- **Tracción:** curva por zonas (elástica → fluencia → endurecimiento → estricción → rotura) con tres comportamientos (acero con fluencia, sin fluencia con Rp0,2 vía Ramberg-Osgood, frágil). Materiales de la tabla del curso (kp/mm² → MPa ×9,80665, puntos medios de los rangos). Zoom de zona elástica, σ–ε / F–ΔL, recta de Hooke, σ_adm = Re/n, coeficiente de seguridad real.
- **Dureza:** el material se define por HV de referencia; HB = 0,95·HV; tablas orientativas (aceros) para HRC/HRB/HRA. Brinell (D, k=0,102F/D²), Vickers (HV = 1,8544·F/d²), Rockwell (preselección automática de escala según el material, pero permitiendo elegir una incorrecta). Comprobaciones de validez (d/D, espesor, distancias, campo de escala).
- **Resiliencia:** péndulo de L=0,8 m, α=140°, masa según capacidad (150/300 J); integración RK4 del péndulo; K = m·g·L·(cosβ − cosα); curva K–T con tanh; entalla V/U y ancho reducido con factores simples; serie de temperaturas simulada con dispersión determinista; vista en planta de la probeta (flexión en tres puntos, grieta, rotura).
- **Fatiga:** S–N de Basquin (σ_eq de von Mises para torsión), límite de fatiga efectivo Se·ka·kb/Kf, run-out a 10⁷ (10⁸ sin límite definido), iniciación/propagación, zona final según σ/Rm; superficie de rotura con punto de inicio, **grano fino con marcas de playa onduladas** (propagación) y **grano grueso brillante** (rotura final); frecuencia del motor regulable en vivo (cambia duración real y rapidez de la animación).

Los valores de materiales son **típicos y orientativos** salvo la tabla del curso (tracción). Las limitaciones están en `README.md`; si cambias el comportamiento, actualiza el README y el pie.

## 6. Forma de trabajo que quiero

1. **Si te falta información (normas, datos de materiales, números), pregúntame; no la inventes.** (Ejemplo: no se dio norma para fatiga y se dejó un campo opcional.)
2. Antes de editar, lee los archivos reales; reutiliza los patrones existentes (misma estructura de modelo/UI, mismos componentes, mismos nombres y estilo de comentarios, concisos y en español).
3. Cambios mínimos y coherentes: no reescribas lo que funciona. Si añades un ensayo: nuevo `*-model.js` + `*.js`, `LAB.register`, pestaña, `main`/`hdr`/diálogo en `index.html`, pie propio, README.
4. **Verifica en el navegador:** ejecuta el modelo con Node, sirve la carpeta (`python3 -m http.server 8765`), abre la página con un parámetro anti-caché (`?v=$RANDOM`; el navegador cachea el HTML), recorre las pestañas, capta pantallazos de varios estados (inicio, mitad, final, caso inválido/frágil/sin rotura) y comprueba que no haya errores de consola ni ids duplicados.
5. Informa con claridad de lo que se hizo, lo que se probó y lo que **no** se pudo probar. Señala valores supuestos o aproximaciones.
6. **No menciones el uso de IA en ningún archivo del proyecto** (README, comentarios, meta). Este archivo es privado.

## 7. Trampas ya encontradas

- Ids duplicados (un `<span id="hD">` chocó con el selector `hD`): usar prefijos y verificar.
- Caché del navegador al probar: siempre `?v=$RANDOM`.
- Reset de Tailwind: `img` es `display:block` (las imágenes de la licencia se apilaban; se fijó `display:inline`).
- `step` de los `<input type=number>` con `min` no entero bloquea el envío: se usa `step="any"`.
- `-0` en ejes: normalizar `Math.abs(v)<1e-9 ? 0 : v` antes de formatear.
- Dibujo dentro de recuadros: recortar (`clip`) las piezas que salen volando (probeta Charpy).
- Bloques de texto del `canvas` que se solapan: mostrar la etiqueta solo si cabe o apilar posiciones.

## 8. Publicación y metadatos

- Sitio: `https://gerardohmx.github.io/MaterialsTestingVirtualLab/` (`canonical` y `og:url`); imagen `assets/og-image.png` (1200×630) también para `twitter:card`.
- Autor/licencia: Gerardo Huizar Castro, CC BY-NC-SA 4.0 (bloque en el pie y sección en README).
- Las dos metas `google-site-verification` tienen texto de ejemplo; hay que sustituirlas por el código real de Search Console (un solo valor, una sola línea).
- Requiere internet (Tailwind CDN e iconos de Creative Commons).

## 9. Pendientes conocidos

- Norma de la prueba de **fatiga**: pendiente de indicar.
- Sustituir los valores típicos de materiales por los de los apuntes del curso si se facilitan (dureza, resiliencia, fatiga).
- Verificación de Google (ver punto 8).
