# Laboratorio virtual · Ensayos mecánicos de materiales

Aplicación web didáctica que simula ensayos técnicos de materiales para explicar sus propiedades mecánicas de forma visual y esquemática. Está hecha con HTML, JavaScript y Tailwind CSS, sin servidor ni dependencias de instalación.

## Objetivo

Ayudar a comprender cómo se comporta un material al someterlo a un ensayo: elegir el ensayo, definir la probeta y el material, calcular la curva y verla desarrollarse en una simulación controlable, con las zonas fundamentales identificadas.

Ensayos previstos:

| Ensayo | Estado |
|---|---|
| Tracción (UNE 7-474) | Disponible |
| Dureza (Brinell, Vickers, Rockwell) | Disponible |
| Resiliencia (péndulo de Charpy) | Disponible |
| Fatiga (flexión rotativa y torsión alternativa) | Disponible |

## Uso

1. Abrir `index.html` en un navegador (se necesita conexión a internet para cargar Tailwind desde su CDN).
   También puede servirse en local: `python3 -m http.server` y abrir `http://localhost:8000`.
2. En la ventana de configuración elegir probeta, material y criterios de seguridad, y pulsar **Calcular y simular**.
3. Controlar la simulación con reproducir, pausa, reproducción inversa, pasos, saltos a cada zona y la barra de progreso.

Se cambia de ensayo con las pestañas de la cabecera. Atajos: `Espacio` reproducir/pausa · `←` `→` paso atrás/adelante · `Inicio` `Fin` · `F` pantalla completa.

## Ensayo de tracción: qué incluye

**Configuración**
- Probeta cilíndrica (diámetro) o prismática (espesor y ancho).
- Longitud de referencia proporcional L₀ = k·√S₀, con k = 5,65 ó 11,3.
- Material elegido de una lista (datos de la tabla del curso, convertidos a MPa) o personalizado: E, Re (ReH/ReL o Rp0,2), Rm, A y Z.
- Coeficiente de seguridad requerido y tensión de trabajo prevista.

**Simulación (panel izquierdo)**
- Máquina de tracción con cruceta fija y móvil, mordazas, célula de carga y extensómetro.
- Deformación elástica y plástica de la probeta, bandas de Lüders, estricción y rotura (copa y cono en materiales dúctiles, plana en frágiles).
- Zona actual resaltada, sección transversal mínima, lecturas de fuerza, alargamiento, tensión, deformación y tiempo.

**Análisis (panel derecho)**
- Diagrama tensión–deformación (σ–ε) o fuerza–alargamiento (F–ΔL), con zonas coloreadas.
- Anotaciones: recta de Hooke, límite de proporcionalidad, ReH/ReL o Rp0,2, Rm, punto de rotura y descarga elástica. Opción de ampliar la zona elástica.
- Parámetros determinados: E, σp, Re, Rm, Fm, A, Z, longitud final, resiliencia y tenacidad.
- Tensión máxima de trabajo σ_adm = Re/n, fuerza admisible, coeficiente de seguridad real y veredicto frente al límite elástico.

**Cabecera y pie**
- Cabecera con el ensayo, la norma, el material y las características de la probeta.
- Pie con las fórmulas (descripción de cada elemento) y un vocabulario técnico.

## Ensayo de dureza: qué incluye

**Métodos** (a elegir en la configuración)
- **Brinell (HBW)**, UNE 7-422-85: bola de metal duro (D = 10, 5, 2,5, 2 ó 1 mm) y relación de carga k = 0,102·F/D².
- **Vickers (HV)**, UNE 7-423-84: pirámide de diamante de 136° con cargas de 0,2 a 100 kgf.
- **Rockwell**, UNE 7-424-89: escalas HRA, HRB y HRC (precarga F₀ + carga adicional F₁).

**Simulación (panel izquierdo)**
- Sección ampliada de la probeta con el penetrador, la zona plástica, la zona elástica, la huella residual y las cotas (h, d o diagonal, e).
- Regla de profundidades: superficie, origen de medida (Rockwell), profundidad residual y máxima.
- Microscopio de medida (Brinell y Vickers) con las mediciones d₁ y d₂, o reloj comparador (Rockwell).
- Fases con salto directo: aproximación, carga, mantenimiento, descarga, retirada, medida (Rockwell: precarga, carga F₁, mantenimiento, retirada de F₁, lectura).
- Controles de reproducción, pausa, marcha atrás, pasos y velocidad, igual que en tracción.

**Análisis (panel derecho)**
- Resultado con su designación normalizada (p. ej. «119 HBW 10/3000», «200 HV 30», «62 HRC») y veredicto de validez.
- Registro fuerza–tiempo o fuerza–profundidad (se aprecia la recuperación elástica).
- Dureza frente al tamaño de la huella, con el margen de validez y la sensibilidad a un error de lectura.
- Parámetros del ensayo, condiciones de validez (relación d/D, espesor mínimo, distancia al borde y entre huellas, campo de la escala, tiempo de mantenimiento) con la corrección sugerida cuando fallan.
- Equivalencias (HV, HB, HRC, HRB, HRA), resistencia a tracción estimada y posición del material en una escala de durezas.
- Combinaciones de carga o escala recomendadas para el material y la probeta indicados.

Limitaciones propias de dureza: el material se define por su dureza Vickers de referencia y de ella se derivan los demás valores; las conversiones entre escalas y la estimación de Rm son orientativas y solo fiables para aceros; la curva fuerza–profundidad es un modelo idealizado (ley cuadrática de carga y recuperación elástica estimada); las dimensiones de la huella se calculan a partir de las fórmulas, no de una medida real.

## Ensayo de resiliencia: qué incluye

**Configuración** (UNE 36-403-81)
- Péndulo de Charpy de 300 J o 150 J, con percutor de radio 2 u 8 mm.
- Probeta de 10 × B × 55 mm con entalla en V (KV) o en U (KU); ancho normal (10 mm) o reducido.
- Material con su curva de transición dúctil-frágil: aceros ferríticos (con transición) y materiales sin transición (inoxidable, cobre, aluminio, fundición…), o personalizado.
- Temperatura de ensayo, tiempo de traslado desde el baño y energía mínima exigida (p. ej. 27 J).

**Simulación (panel izquierdo)**
- Péndulo a escala con escala graduada en julios y aguja arrastrada, barra de energía (potencial, cinética y absorbida) y lecturas de ángulo, velocidad y temperatura.
- Detalle ampliado de la probeta en vista de planta: baño termostático y traslado con pinzas, flexión en tres puntos, avance de la grieta, rotura y proyección de las mitades (impacto en cámara lenta).
- El movimiento del péndulo se calcula integrando su ecuación de movimiento; la energía absorbida sale del ángulo de ascenso: K = m·g·L·(cos β − cos α).

**Análisis (panel derecho)**
- Resultado con su designación (p. ej. «KV 300/2 = 128 J»), resiliencia en J/cm² y en kgm/cm², régimen de rotura y comprobación del requisito de energía mínima.
- Balance de energía del péndulo a lo largo de todo el ensayo.
- Curva de transición dúctil-frágil: se pueden registrar ensayos a distintas temperaturas o simular una serie completa, y se estima la temperatura de transición.
- Superficie de fractura (zona fibrosa y cristalina) y expansión lateral.
- Condiciones de validez (velocidad de impacto, rotura completa, K ≤ 80 % de la capacidad, traslado ≤ 5 s, variación de temperatura, probeta normalizada) con la corrección sugerida, e interpretación y recomendaciones.

Limitaciones propias de resiliencia: la curva K–T es un modelo (tangente hiperbólica) con valores típicos; el efecto de la entalla en U y del ancho reducido se aproxima con factores sencillos; el aspecto de fractura y la expansión lateral se estiman a partir de la energía; no se modelan rozamientos del péndulo ni la dispersión real de la zona de transición (la serie simulada solo añade una dispersión sencilla).

## Ensayo de fatiga: qué incluye

**Métodos** (a elegir en la configuración)
- **Flexión rotativa**: probeta en voladizo que gira con una carga fija colgada de un cojinete; cada fibra pasa alternativamente de tracción a compresión (σ = 32·M/(π·d³)).
- **Torsión alternativa**: probeta en voladizo con una palanca accionada por biela y excéntrica; el par cambia de sentido en cada vuelta (τ = 16·T/(π·d³)).

**Configuración**
- Diámetro y brazo de carga, acabado superficial (pulido, rectificado, torneado) y punto defectuoso de partida (rayado, inclusión, entalla o ninguno).
- Material (10 materiales y uno personalizado) con Rm y límite de fatiga; con o sin límite de fatiga definido.
- Amplitud de tensión y frecuencia de giro del motor; la frecuencia se puede regular también durante la simulación (cambia la duración real del ensayo y la velocidad de giro).
- Norma de referencia opcional (texto libre que se muestra en la cabecera).

**Simulación (panel izquierdo)**
- Máquina en voladizo con motor, mandril, cojinete y carga (flexión) o empotramiento, palanca, biela y excéntrica (torsión). Las zonas de tracción y compresión se colorean y las fibras giran con la probeta.
- Contador de ciclos, tiempo real (N/f), osciloscopio del ciclo de esfuerzo alterno y fibra de la sección que gira.
- Sección crítica en formación: la grieta avanza desde el punto defectuoso dejando la zona de grano fino con marcas de playa onduladas; al romper queda la zona de grano grueso y brillante. La mitad libre de la probeta cae al romper.

**Análisis (panel derecho)**
- Resultado (ciclos hasta la rotura o «sin rotura») y duración real a la frecuencia elegida.
- Curva de Wöhler (S–N) con la probeta ideal y con el acabado y el defecto del ensayo; se puede registrar el ensayo o simular una serie de probetas con dispersión.
- Superficie de rotura con las tres zonas identificadas: punto de inicio, grano fino con marcas de playa (propagación) y grano grueso brillante (rotura final), con el porcentaje de cada zona.
- Evolución de la grieta (iniciación y propagación), parámetros, condiciones del ensayo e interpretación.

Limitaciones propias de fatiga: la curva S–N es un modelo de Basquin con los valores típicos del material (no datos experimentales); el efecto del acabado, el tamaño y los defectos se aproxima con factores sencillos (k_a, k_b, K_f); la torsión se compara con la flexión mediante la tensión equivalente de von Mises; el tamaño de la zona de rotura final y la forma de la superficie de fractura son representaciones esquemáticas; no se modela el calentamiento de la probeta ni la dispersión real, y la frecuencia solo cambia la duración y la animación.

## Estructura

```
index.html      Interfaz (cabecera, paneles, pie, configuración)
js/model.js     Tracción: modelo del material y curva (lógica pura)
js/app.js       Tracción: simulación en canvas, diagrama, controles y paneles
js/hardness-model.js  Dureza: modelo de los tres métodos (lógica pura)
js/hardness.js        Dureza: simulación, gráficas, validez y paneles
js/resilience-model.js  Resiliencia: péndulo de Charpy y curva de transición (lógica pura)
js/resilience.js        Resiliencia: simulación, gráficas y paneles
js/fatigue-model.js    Fatiga: curva S–N, iniciación y propagación de la grieta (lógica pura)
js/fatigue.js          Fatiga: simulación, gráficas y paneles
js/tabs.js              Registro y cambio de pestañas
```

## Alcances

- Uso docente y de demostración: permite visualizar y comparar el comportamiento de distintos materiales.
- Curvas coherentes con el comportamiento real: materiales con fluencia definida, sin fluencia (límite convencional Rp0,2) y frágiles.
- Los materiales y los datos son editables, de modo que se pueden contrastar con valores propios.
- Funciona íntegramente en el navegador, sin instalación ni servidor.

## Limitaciones

- **No es una herramienta de cálculo ni de certificación.** No sustituye a un ensayo real ni a un informe normalizado.
- **La curva es un modelo teórico por tramos**, construido a partir de los parámetros introducidos (E, Re, Rm, A, Z), no datos experimentales. Detalles como la forma exacta de la fluencia o del endurecimiento son aproximaciones.
- **Datos orientativos.** Los valores de la tabla se toman por el punto medio de cada rango. El alargamiento A y la estricción Z no figuran en la tabla y son estimaciones. Algunos datos faltantes se han supuesto (E de los aceros especiales; σE de la chapa de aluminio).
- **Tensiones ingenieriles.** Se calculan con la sección inicial S₀; no se representa la tensión verdadera.
- **Escala visual exagerada.** El alargamiento de la probeta se dibuja con una escala no lineal para poder apreciar la zona elástica; los valores numéricos son los reales.
- **Tiempo de simulación comprimido.** La duración se reparte entre las zonas para que todas se vean; el «tiempo real» mostrado solo se estima con la velocidad de cruceta indicada.
- **Norma.** La simulación se apoya en los conceptos de la UNE 7-474 (probeta proporcional, magnitudes y definiciones), pero no reproduce sus dimensiones exactas de probeta ni sus velocidades de ensayo.
- **Idealizaciones.** Material homogéneo e isótropo, sin defectos, a temperatura ambiente y sin efectos de velocidad de deformación, deslizamiento en mordazas ni rigidez de la máquina. La madera y la cuerda se modelan como materiales isótropos, lo que es una simplificación fuerte.
- Las unidades se muestran en MPa y kN (los datos de partida en kp/mm² se convierten con 1 kp/mm² = 9,80665 MPa).
- Requiere conexión a internet para cargar Tailwind desde su CDN.

## Estado

Los cuatro ensayos (tracción, dureza, resiliencia y fatiga) están disponibles.

## Licencia

Realizado por Gerardo Huizar Castro bajo licencia [Creative Commons Atribución-NoComercial-CompartirIgual 4.0 (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/).
