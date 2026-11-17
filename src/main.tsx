import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (PWA): sólo en web de producción. La actualización la confirma la persona.
if (import.meta.env.PROD && !('Capacitor' in window && (window as unknown as { Capacitor: { isNativePlatform(): boolean } }).Capacitor.isNativePlatform())) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent('qm-update-available', { detail: () => update(true) }));
      },
    });
  });
}
