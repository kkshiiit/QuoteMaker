import { Link } from 'react-router-dom';
import { MORE_GROUPS } from '../App';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';

export default function More() {
  return (
    <>
      <PageHeader title="Más" subtitle="Herramientas, gestión, personalización y datos." />
      {MORE_GROUPS.map((g) => (
        <section key={g.title} aria-labelledby={`more-${g.title}`} style={{ marginBottom: 16 }}>
          <h2 id={`more-${g.title}`} className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {g.title}
          </h2>
          <ul className="list">
            {g.links.map((l) => (
              <li key={l.to}>
                <Link className="list-item" to={l.to}>
                  <span className="thumb" aria-hidden="true">
                    <Icon name={l.icon} />
                  </span>
                  <span className="grow title">{l.label}</span>
                  <span aria-hidden="true" className="muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
