import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SyncProvider, useSync } from '../sync/controller';
import { Icon, LogoMark, type IconName } from './components/Icon';
import { requestRouteFocus, ToastProvider } from './components/ui';
import { usePrefs } from './hooks';
import { applyTheme, resolveTheme } from './theme/theme';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Costs = lazy(() => import('./pages/Costs'));
const PurchaseEdit = lazy(() => import('./pages/PurchaseEdit'));
const ExpenseEdit = lazy(() => import('./pages/ExpenseEdit'));
const Quotes = lazy(() => import('./pages/Quotes'));
const QuoteEdit = lazy(() => import('./pages/QuoteEdit'));
const QuoteDocument = lazy(() => import('./pages/QuoteDocument'));
const More = lazy(() => import('./pages/More'));
const Customers = lazy(() => import('./pages/Customers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Overheads = lazy(() => import('./pages/Overheads'));
const Categories = lazy(() => import('./pages/Categories'));
const Stats = lazy(() => import('./pages/Stats'));
const Personalize = lazy(() => import('./pages/Personalize'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));
const CloudPage = lazy(() => import('./pages/CloudPage'));
const About = lazy(() => import('./pages/About'));

function ThemeApplier() {
  const [prefs] = usePrefs();
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  useEffect(() => {
    applyTheme(resolveTheme(prefs, systemDark));
  }, [prefs, systemDark]);
  return null;
}

const PRIMARY: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/productos', label: 'Productos', icon: 'box' },
  { to: '/costos', label: 'Costos', icon: 'calculator' },
  { to: '/presupuestos', label: 'Presupuestos', icon: 'file' },
];

const SECONDARY: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/proveedores', label: 'Proveedores', icon: 'truck' },
  { to: '/gastos-generales', label: 'Gastos generales', icon: 'wallet' },
  { to: '/categorias', label: 'Categorías', icon: 'tag' },
  { to: '/estadisticas', label: 'Estadísticas', icon: 'chart' },
];

const SYSTEM: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/personalizacion', label: 'Personalización', icon: 'palette' },
  { to: '/configuracion', label: 'Configuración', icon: 'settings' },
  { to: '/respaldo', label: 'Respaldo', icon: 'database' },
  { to: '/nube', label: 'Sincronización', icon: 'cloud' },
  { to: '/informacion', label: 'Información', icon: 'info' },
];

export const MORE_LINKS = [...SECONDARY, ...SYSTEM];

export function SyncChip() {
  const s = useSync();
  let dot = '';
  let text = 'Solo en este dispositivo';
  if (s.configured && !s.userEmail) text = 'Nube: sin sesión';
  if (s.configured && s.userEmail) {
    if (s.counts.conflict) {
      dot = 'dot-danger';
      text = `${s.counts.conflict} conflicto${s.counts.conflict > 1 ? 's' : ''}`;
    } else if (s.counts.error || !s.online) {
      dot = 'dot-warn';
      text = s.online ? 'Error de sincronización' : 'Sin conexión';
    } else if (s.syncing || s.counts.pending) {
      dot = 'dot-warn';
      text = s.syncing ? 'Sincronizando…' : `${s.counts.pending} pendiente${s.counts.pending > 1 ? 's' : ''}`;
    } else {
      dot = 'dot-ok';
      text = 'Sincronizado';
    }
  }
  return (
    <Link to="/nube" className="sync-chip" aria-label={`Estado de sincronización: ${text}`}>
      <span className={`dot ${dot}`} aria-hidden="true" />
      {text}
    </Link>
  );
}

function RouteFocus() {
  const loc = useLocation();
  const [first, setFirst] = useState(true);
  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    window.scrollTo(0, 0);
    // El h1 de la nueva pantalla toma el foco al montarse (ver PageHeader), nunca después de que
    // la persona ya empezó a escribir en un campo.
    requestRouteFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);
  return null;
}

function UpdateBanner() {
  const [apply, setApply] = useState<null | (() => void)>(null);
  useEffect(() => {
    const fn = (e: Event) => setApply(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener('qm-update-available', fn);
    return () => window.removeEventListener('qm-update-available', fn);
  }, []);
  if (!apply) return null;
  return (
    <div className="card row-between" role="status" style={{ marginBottom: 16 }}>
      <span>Hay una versión nueva de QuoteMaker.</span>
      <button className="btn btn-primary btn-sm" onClick={apply}>
        Actualizar
      </button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const moreActive = MORE_LINKS.some((l) => loc.pathname.startsWith(l.to)) || loc.pathname === '/mas';
  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Saltar al contenido
      </a>
      <nav className="sidebar" aria-label="Navegación principal">
        <Link to="/" className="brand" aria-label="QuoteMaker, inicio">
          <LogoMark />
          QuoteMaker
        </Link>
        {PRIMARY.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            <Icon name={l.icon} />
            {l.label}
          </NavLink>
        ))}
        <h2>Gestión</h2>
        {SECONDARY.map((l) => (
          <NavLink key={l.to} to={l.to}>
            <Icon name={l.icon} />
            {l.label}
          </NavLink>
        ))}
        <h2>Sistema</h2>
        {SYSTEM.map((l) => (
          <NavLink key={l.to} to={l.to}>
            <Icon name={l.icon} />
            {l.label}
          </NavLink>
        ))}
        <div className="sync-chip-wrap" style={{ marginTop: 'auto', paddingTop: 16 }}>
          <SyncChip />
        </div>
      </nav>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="QuoteMaker, inicio">
          <LogoMark size={28} />
          QuoteMaker
        </Link>
        <SyncChip />
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <UpdateBanner />
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Navegación principal">
        {PRIMARY.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            <span className="nav-pill">
              <Icon name={l.icon} />
            </span>
            {l.label}
          </NavLink>
        ))}
        <Link to="/mas" aria-current={moreActive ? 'page' : undefined}>
          <span className="nav-pill">
            <Icon name="grid" />
          </span>
          Más
        </Link>
      </nav>
    </div>
  );
}

function Loading() {
  return (
    <p className="muted" role="status">
      Cargando…
    </p>
  );
}

export function App() {
  return (
    <ToastProvider>
      <SyncProvider>
        <ThemeApplier />
        <HashRouter>
          <RouteFocus />
          <Shell>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/productos" element={<Products />} />
                <Route path="/productos/:id" element={<ProductDetail />} />
                <Route path="/costos" element={<Navigate to="/costos/compras" replace />} />
                <Route path="/costos/:tab" element={<Costs />} />
                <Route path="/costos/compras/:id" element={<PurchaseEdit />} />
                <Route path="/costos/gastos/:id" element={<ExpenseEdit />} />
                <Route path="/presupuestos" element={<Quotes />} />
                <Route path="/presupuestos/:id" element={<QuoteEdit />} />
                <Route path="/presupuestos/:id/documento" element={<QuoteDocument />} />
                <Route path="/mas" element={<More />} />
                <Route path="/clientes" element={<Customers />} />
                <Route path="/clientes/:id" element={<Customers />} />
                <Route path="/proveedores" element={<Suppliers />} />
                <Route path="/proveedores/:id" element={<Suppliers />} />
                <Route path="/gastos-generales" element={<Overheads />} />
                <Route path="/gastos-generales/:id" element={<Overheads />} />
                <Route path="/categorias" element={<Categories />} />
                <Route path="/estadisticas" element={<Stats />} />
                <Route path="/personalizacion" element={<Personalize />} />
                <Route path="/configuracion" element={<SettingsPage />} />
                <Route path="/respaldo" element={<BackupPage />} />
                <Route path="/nube" element={<CloudPage />} />
                <Route path="/informacion" element={<About />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Shell>
        </HashRouter>
      </SyncProvider>
    </ToastProvider>
  );
}

function NotFound() {
  return (
    <div className="empty">
      <h1 id="page-title" tabIndex={-1}>
        Página no encontrada
      </h1>
      <p>La dirección no existe.</p>
      <Link className="btn btn-primary" to="/">
        Ir al inicio
      </Link>
    </div>
  );
}
