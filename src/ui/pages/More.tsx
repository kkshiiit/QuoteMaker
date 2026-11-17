import { Link } from 'react-router-dom';
import { MORE_LINKS } from '../App';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';

export default function More() {
  return (
    <>
      <PageHeader title="Más" subtitle="Gestión, personalización y datos." />
      <ul className="list">
        {MORE_LINKS.map((l) => (
          <li key={l.to}>
            <Link className="list-item" to={l.to}>
              <span className="thumb" aria-hidden="true">
                <Icon name={l.icon} />
              </span>
              <span className="grow title">{l.label}</span>
              <span aria-hidden="true" className="muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
