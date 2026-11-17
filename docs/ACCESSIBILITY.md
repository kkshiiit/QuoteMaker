# Accesibilidad

Objetivo: **WCAG 2.2 AA** en web y criterios equivalentes en Android (la app Android usa la misma interfaz en el WebView del sistema, que expone el árbol de accesibilidad a TalkBack).

## Pruebas automáticas (`tests/e2e/quality.spec.ts`)

- **axe-core** con etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` sobre **25 pantallas** (todas las rutas + detalle de presupuesto, documento y detalle de producto), con datos de ejemplo, en **escritorio (1366 px) y móvil (Pixel 7)**: **0 violaciones**.
- Tema oscuro: axe sin violaciones en Inicio, Productos, Presupuestos y Calculadora.
- Color personalizado ilegible (#ffee00) → se ajusta automáticamente a contraste ≥ 4,5:1.
- Sin scroll horizontal accidental en todas las pantallas (escritorio y móvil), y en 8 pantallas dentro de Android real (emulador).
- Teclado: el primer Tab enfoca «Saltar al contenido»; Enter mueve el foco al contenido principal; el foco siempre tiene contorno visible.
- `prefers-reduced-motion: reduce` desactiva transiciones y animaciones.
- Formularios: errores en un resumen con `role="alert"` que recibe el foco; cada campo inválido tiene `aria-invalid` y `aria-describedby` hacia su mensaje.

## Diseño accesible aplicado

- Semántica: landmarks (`nav`, `main`, `header`, `aside`), un `h1` por pantalla que recibe el foco al navegar (lectores de pantalla anuncian la página), listas reales, tablas con encabezados.
- Etiquetas visibles en todos los campos; nombres accesibles en botones de ícono («Quitar ítem 2», «Más acciones del presupuesto»).
- Estados no dependen sólo del color: los badges de estado llevan ícono + texto; los datos internos llevan el rótulo «Interno · no se comparte».
- Áreas táctiles de 44 px mínimo (botones, campos, ítems de lista, checkboxes).
- Toasts en una región `aria-live`; errores con `role="alert"`.
- Diálogos nativos (`<dialog>` modal) con título asociado, cierre con Escape y foco gestionado por el navegador.
- Zoom: tipografía en `rem`, sin bloquear el zoom (`viewport` sin `maximum-scale`); el diseño se reorganiza (tablas → tarjetas en móvil).
- Tablas en móvil: se apilan con la etiqueta de cada celda (`data-label`).

## Revisión manual

| Verificación | Estado |
|---|---|
| Revisión visual de capturas reales (escritorio, móvil, Android) en tema claro y oscuro | Hecha. Se corrigieron barras de acción que tapaban formularios y filas de ítems demasiado estrechas |
| Equivalente a zoom 200 % (ancho efectivo ≤ 683 px) | Cubierto por las pruebas automáticas a 412 px de ancho: sin pérdida de contenido ni scroll horizontal |
| Recorrido completo sólo con teclado | **Parcial**: automatizado para el enlace de salto, foco visible y validación. El recorrido completo de punta a punta sólo con teclado queda pendiente |
| TalkBack (Android) / VoiceOver (iOS/macOS) / NVDA | **Pendiente**: no hay lector de pantalla disponible en este entorno |

Pendientes registrados en [ROADMAP](ROADMAP.md).
