# Costo cero

Presupuesto del proyecto: **ARS/USD 0**. Este documento registra cada servicio y dependencia y por qué no genera cargos.

| Componente | Proveedor | Costo | Notas |
|---|---|---|---|
| Código y CI | GitHub (repositorio público) | $0 | Actions con runners estándar es gratuito e ilimitado para repos públicos. Si el repo pasa a privado, el plan Free incluye minutos mensuales y, sin medio de pago, **no hay cargos**: los jobs se detienen al agotar la cuota. |
| Distribución Android | GitHub Releases / artefactos de Actions | $0 | No se usa Google Play (su registro tiene costo). |
| Web | Build estático (`dist/`) | $0 | Puede servirse en GitHub Pages / Cloudflare Pages / Netlify gratis. No se compró dominio. **No se publicó automáticamente.** |
| Nube (opcional) | Supabase **Free** | $0 | Sólo si el titular crea el proyecto. Sin tarjeta. Límites (consultar supabase.com/pricing): 500 MB de base de datos, 2 proyectos activos, **pausa tras ~7 días sin actividad**. No se activaron upgrades ni Storage. |
| PDF | jsPDF (MIT), en el dispositivo | $0 | Sin servicios de generación externos. |
| WhatsApp | Enlace `wa.me` + selector del sistema | $0 | No se usa WhatsApp Business API. |
| Mapas, IA, analíticas, fuentes | — | — | No se usan. Tipografía del sistema. |
| Íconos y logo | Propios (SVG) | $0 | Sin bancos de imágenes ni generación paga. |

## Licencias de dependencias de producción

Revisadas desde `package-lock.json`: MIT (39 paquetes), Apache-2.0 (dexie, dexie-react-hooks), 0BSD (tslib), ISC (@capacitor/synapse), MIT AND Zlib (pako), MPL-2.0 OR Apache-2.0 (dompurify, opción Apache-2.0), «MIT OR SEE LICENSE» (rgbcolor, opción MIT). Ninguna comercial ni copyleft obligatoria. El proyecto se publica bajo MIT.

Herramientas de desarrollo (no se distribuyen): TypeScript, Vite, Vitest, Playwright, axe-core (MPL-2.0), ESLint, Capacitor CLI, Gradle/Android SDK (gratuitos).

## Qué NO se hizo a propósito

- No se creó ningún proyecto Supabase ni cuenta en servicios externos.
- No se configuró hosting público.
- No se iniciaron pruebas gratuitas que pidan tarjeta.
