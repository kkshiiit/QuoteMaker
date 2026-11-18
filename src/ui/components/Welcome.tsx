/** Presentación de bienvenida (primera apertura, base vacía), como en el diseño de referencia. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../../data/db';
import { isDatabaseEmpty } from '../../data/demo';
import { usePrefs } from '../hooks';
import { Icon, Wordmark } from './Icon';

export function Welcome() {
  const loc = useLocation();
  const [prefs, setPrefs] = usePrefs();
  const stored = useLiveQuery(async () => ({ prefs: await db.prefs.get('prefs'), empty: await isDatabaseEmpty() }), []);
  const show = !!stored && loc.pathname === '/' && !prefs.onboardingDone && !stored.prefs?.onboardingDone && stored.empty;
  // Mientras se ve la bienvenida, el resto de la app no recibe foco ni lectores de pantalla.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    if (!app) return;
    app.inert = show;
    return () => {
      app.inert = false;
    };
  }, [show]);
  if (!show) return null;
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-art" aria-hidden="true">
        <span className="w-arch" />
        <span className="w-towel t1" />
        <span className="w-towel t2" />
        <span className="w-towel t3" />
        <span className="w-candle">
          <span className="w-flame" />
          <span className="w-ch">CH</span>
        </span>
        <span className="w-vase" />
      </div>
      <div className="welcome-body">
        <h1 id="welcome-title" className="sr-only">
          Chediek Home
        </h1>
        <Wordmark size={96} className="welcome-mark" />
        <hr className="welcome-rule" />
        <p className="welcome-tagline">Stock, pedidos y envíos en un solo lugar.</p>
        <button className="btn btn-primary welcome-cta" onClick={() => void setPrefs({ onboardingDone: true })} autoFocus>
          Comenzar
          <Icon name="back" className="flip" />
        </button>
      </div>
    </section>
  );
}
