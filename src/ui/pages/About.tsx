import { LogoMark } from '../components/Icon';
import { PageHeader } from '../components/ui';

export default function About() {
  return (
    <>
      <PageHeader title="Información" />
      <section className="card stack">
        <div className="row">
          <LogoMark size={56} title="Logo de QuoteMaker" />
          <div>
            <h2>QuoteMaker</h2>
            <p className="muted">Versión {__APP_VERSION__}</p>
          </div>
        </div>
        <p>Herramienta privada para emprendedores: costos reales, precios con margen sano y presupuestos profesionales.</p>
        <h3>Privacidad</h3>
        <ul>
          <li>Tus datos se guardan en este dispositivo (IndexedDB). No hay servidores propios ni analíticas.</li>
          <li>Los PDF y mensajes para clientes se generan desde una lista cerrada de campos comerciales: costos, márgenes, proveedores y notas privadas nunca se incluyen.</li>
          <li>La sincronización en la nube es opcional y usa tu propio proyecto Supabase con seguridad por fila (RLS).</li>
          <li>QuoteMaker nunca envía mensajes ni cambia estados por su cuenta.</li>
        </ul>
        <h3>Licencia</h3>
        <p>Código abierto bajo licencia MIT. Bibliotecas de terceros: React, React Router, Dexie, big.js, jsPDF, Supabase JS, Capacitor (MIT / Apache-2.0).</p>
      </section>
    </>
  );
}
