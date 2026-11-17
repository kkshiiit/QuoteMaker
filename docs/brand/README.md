# Identidad visual de QuoteMaker

![Tres conceptos de logo](png/concepts.png)

## Conceptos explorados

| | A · Q + flecha (elegido) | B · Etiqueta de precio | C · Monograma QM |
|---|---|---|---|
| Idea | La «Q» de *Quote* cuya cola es una flecha de envío: el presupuesto que sale hacia el cliente | Etiqueta de precio con renglones de documento | Iniciales Q y M en un círculo |
| Legibilidad a 16 px | Alta: dos trazos gruesos | Media: los renglones se pierden | Baja: las letras se empastan |
| Memorabilidad | Alta: forma única, se reconoce como «Q» | Media: las etiquetas son un recurso muy común | Baja: los monogramas son genéricos |
| Escalabilidad (favicon → splash) | Excelente: mismo dibujo, sin detalles finos | Buena | Regular |
| Relación con el producto | Presupuesto + envío controlado por el usuario | Precios | Nombre |
| Ícono adaptativo de Android | Encaja en la zona segura circular | Forma irregular, recorta mal | Bien |

**Elegido: A.** Es el más legible en tamaños chicos, tiene una forma propia y comunica la acción central de la app.

## Archivos

| Archivo | Uso |
|---|---|
| `logo-mark.svg` | Marca principal (verde bosque #1F6F43, trazo blanco) |
| `logo-mark-dark.svg` | Sobre fondos oscuros |
| `logo-mark-mono.svg` | Monocromo (impresión, sellos) |
| `logo-horizontal-light.svg` / `-dark.svg` / `-mono.svg` | Marca + logotipo horizontal |
| `icon-maskable.svg` | Ícono PWA *maskable* (zona segura 60 %) |
| `png/logo-mark-1024.png`, `png/logo-horizontal-*.png` | Versiones rasterizadas |
| `png/splash-2732.png`, `png/splash-dark-2732.png` | Splash claro/oscuro |
| `../../public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icons/*` | Web/PWA |
| `../../android/app/src/main/res/mipmap-*`, `drawable*/splash.png` | Android (legacy, round, foreground adaptativo, splash) |

El logotipo usa la tipografía del sistema (sin fuentes externas ni licencias). Todos los recursos son SVG propios rasterizados con `scripts/render-brand.mjs` y `scripts/render-android.mjs` (Chromium local); no se usaron bancos de imágenes ni generación paga.

## Paleta

Bosque #1F6F43 (principal), Océano #1D5FA8, Terracota #B4532A, Ciruela #7A3D8F, Grafito #3F4752. Fondo claro #F6F5F1, oscuro #121314. Los acentos se ajustan automáticamente para contraste AA.
