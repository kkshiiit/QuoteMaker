/**
 * Bienvenida inmersiva (primera apertura, base vacía): escena ilustrada en capas —ventana en
 * arco con luz, toallas tejidas, vela CH encendida y difusor— con movimiento suave, tres
 * pantallas para deslizar y «Comenzar». Toma los colores del tema (claro / oscuro / paletas) y
 * queda quieta si el sistema pide «reducir movimiento». Sin imágenes externas.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../../data/db';
import { isDatabaseEmpty } from '../../data/demo';
import { usePrefs } from '../hooks';
import { Icon, Wordmark } from './Icon';

const SLIDES = [
  { title: 'Stock, pedidos y envíos en un solo lugar.', text: 'Colores, talles y existencias al día, en el local y online.' },
  { title: 'Tus costos, siempre privados.', text: 'Precios con ganancia real. Al cliente sólo le llega lo que vos elegís.' },
  { title: 'Compartí tus productos con un toque.', text: 'Fotos, precio y links a Instagram, Facebook y TikTok.' },
];

/** Escena ilustrada (SVG en línea, colores del tema). */
function Scene() {
  return (
    <svg className="w-scene" viewBox="0 0 400 440" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="w-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--surface)" />
          <stop offset="1" stopColor="var(--accent-soft)" />
        </linearGradient>
        <linearGradient id="w-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="w-glow">
          <stop offset="0" stopColor="#ffd28a" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#ffb86b" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffb86b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="w-flame" cx="0.5" cy="0.7" r="0.6">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.45" stopColor="#ffd27a" />
          <stop offset="1" stopColor="#f08a3c" />
        </radialGradient>
        <linearGradient id="w-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--surface)" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="var(--surface-2)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--surface)" stopOpacity="0.95" />
        </linearGradient>
        <pattern id="w-knit" width="7" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 0 3.5 5 7 0M0 5 3.5 10 7 5" fill="none" stroke="var(--accent)" strokeOpacity="0.22" strokeWidth="1.2" />
        </pattern>
      </defs>

      {/* Ventana en arco con luz */}
      <g className="w-layer w-back">
        <path d="M70 330V150a130 130 0 0 1 260 0v180z" fill="url(#w-sky)" />
        <path d="M70 330V150a130 130 0 0 1 260 0v180z" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M200 20v310M70 210h260" stroke="var(--line)" strokeWidth="2.5" opacity="0.7" />
        <path className="w-beam" d="M150 40 270 40 360 440 40 440z" fill="url(#w-beam)" />
      </g>

      {/* Mesa */}
      <g className="w-layer w-mid">
        <rect x="0" y="372" width="400" height="68" fill="var(--surface-2)" />
        <rect x="0" y="368" width="400" height="8" rx="4" fill="var(--line)" opacity="0.9" />
      </g>

      {/* Difusor con varillas y flores secas */}
      <g className="w-layer w-front w-diffuser">
        <path d="M58 300 52 240M64 300 70 232M60 300 62 226" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
        <g className="w-flowers" fill="var(--accent)" opacity="0.85">
          <path d="M44 250c-6 2-10-1-12-6M40 236c-5 0-8-4-8-8M78 240c6 0 10-3 11-8" stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="31" cy="243" r="3.2" />
          <circle cx="32" cy="227" r="2.8" />
          <circle cx="89" cy="231" r="3" />
          <circle cx="52" cy="221" r="2.6" />
        </g>
        <path d="M44 372c-4-26 0-46 8-58h16c8 12 12 32 8 58z" fill="url(#w-glass)" stroke="var(--line)" strokeWidth="2" />
        <rect x="52" y="300" width="16" height="14" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      </g>

      {/* Vela CH en vaso, con resplandor */}
      <g className="w-layer w-front">
        <circle className="w-halo" cx="152" cy="292" r="90" fill="url(#w-glow)" />
        <rect x="112" y="298" width="80" height="76" rx="14" fill="url(#w-glass)" stroke="var(--line)" strokeWidth="2" />
        <rect x="118" y="316" width="68" height="52" rx="10" fill="var(--surface)" />
        <text x="152" y="352" textAnchor="middle" className="w-candle-ch">
          CH
        </text>
        <path d="M152 316v-9" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
        <path className="w-flame2" d="M152 284c7 9 9 15 5 21-3 4-7 4-10 0-4-6-2-12 5-21z" fill="url(#w-flame)" />
      </g>

      {/* Toallas tejidas apiladas */}
      <g className="w-layer w-front w-towels">
        <g>
          <rect x="216" y="330" width="170" height="40" rx="18" fill="var(--accent-soft)" />
          <rect x="216" y="330" width="170" height="40" rx="18" fill="url(#w-knit)" />
          <path d="M228 350h146" stroke="var(--surface)" strokeOpacity="0.6" strokeWidth="2" />
        </g>
        <g>
          <rect x="228" y="292" width="150" height="40" rx="18" fill="color-mix(in srgb, var(--accent-soft) 70%, var(--surface))" />
          <rect x="228" y="292" width="150" height="40" rx="18" fill="url(#w-knit)" />
        </g>
        <g>
          <rect x="222" y="256" width="156" height="38" rx="18" fill="color-mix(in srgb, var(--accent-soft) 55%, var(--accent))" opacity="0.85" />
          <rect x="222" y="256" width="156" height="38" rx="18" fill="url(#w-knit)" />
        </g>
      </g>

      {/* Partículas de luz */}
      <g className="w-particles" fill="#ffe2a8">
        {[
          [140, 250, 0],
          [168, 230, 1.2],
          [126, 210, 2.1],
          [180, 270, 3],
          [150, 190, 1.7],
          [200, 220, 2.6],
        ].map(([x, y, d], i) => (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.2} style={{ animationDelay: `${d}s` } as CSSProperties} />
        ))}
      </g>
    </svg>
  );
}

export function Welcome() {
  const loc = useLocation();
  const [prefs, setPrefs] = usePrefs();
  const stored = useLiveQuery(async () => ({ prefs: await db.prefs.get('prefs'), empty: await isDatabaseEmpty() }), []);
  const show = !!stored && loc.pathname === '/' && !prefs.onboardingDone && !stored.prefs?.onboardingDone && stored.empty;
  const [slide, setSlide] = useState(0);
  const touch = useRef<number | null>(null);
  const root = useRef<HTMLElement>(null);

  // Mientras se ve la bienvenida, el resto de la app no recibe foco ni lectores de pantalla.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    if (!app) return;
    app.inert = show;
    return () => {
      app.inert = false;
    };
  }, [show]);

  // Profundidad: la escena acompaña levemente al puntero o a la inclinación (no con «reducir movimiento»).
  useEffect(() => {
    const el = root.current;
    if (!show || !el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (x: number, y: number) => {
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
    };
    const onPointer = (e: PointerEvent) => move(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    const onTilt = (e: DeviceOrientationEvent) => move(Math.max(-1, Math.min(1, (e.gamma ?? 0) / 30)) / 2, Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 30)) / 2);
    addEventListener('pointermove', onPointer);
    addEventListener('deviceorientation', onTilt);
    return () => {
      removeEventListener('pointermove', onPointer);
      removeEventListener('deviceorientation', onTilt);
    };
  }, [show]);

  if (!show) return null;
  const go = (i: number) => setSlide((i + SLIDES.length) % SLIDES.length);
  const s = SLIDES[slide]!;

  return (
    <section
      ref={root}
      className="welcome"
      aria-labelledby="welcome-title"
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touch.current;
        const end = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        go(slide + (end < start ? 1 : -1));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(slide + 1);
        if (e.key === 'ArrowLeft') go(slide - 1);
      }}
    >
      <div className="welcome-sky" aria-hidden="true" />
      <div className="welcome-art" aria-hidden="true">
        <Scene />
      </div>
      <div className="welcome-body">
        <h1 id="welcome-title" className="sr-only">
          Chediek Home
        </h1>
        <Wordmark size={92} className="welcome-mark w-in w-in-1" />
        <hr className="welcome-rule w-in w-in-2" />
        <div className="welcome-copy" aria-live="polite" key={slide}>
          <p className="welcome-tagline">{s.title}</p>
          <p className="welcome-sub">{s.text}</p>
        </div>
        <div className="welcome-foot w-in w-in-3">
          <div className="welcome-dots" role="group" aria-label="Pantallas de bienvenida">
            {SLIDES.map((_, i) => (
              <button key={i} type="button" aria-label={`Pantalla ${i + 1} de ${SLIDES.length}`} aria-pressed={slide === i} onClick={() => go(i)} />
            ))}
          </div>
          <button className="btn btn-primary welcome-cta" onClick={() => void setPrefs({ onboardingDone: true })} autoFocus>
            Comenzar
            <Icon name="back" className="flip" />
          </button>
        </div>
      </div>
    </section>
  );
}
