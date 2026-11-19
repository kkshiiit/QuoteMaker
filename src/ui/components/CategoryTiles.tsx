/** Mosaicos de categorías con ícono (estilo del diseño de referencia). */
import type { Category } from '../../domain/types';
import { Icon, type IconName } from './Icon';

const RULES: Array<[RegExp, IconName]> = [
  [/blanquer|s[aá]bana|acolch|edred|almohad|cama/i, 'bed'],
  [/beb[eé]/i, 'baby'],
  [/media|calcet/i, 'sock'],
  [/ropa|remera|prenda|indument|niñ|adult/i, 'shirt'],
  [/vela/i, 'candle'],
  [/sahum|incienso|difus/i, 'incense'],
  [/hornill|aroma/i, 'flame'],
  [/ba[ñn]o|toall/i, 'bath'],
  [/mueble|silla|mesa/i, 'chair'],
  [/deco|l[aá]mpara|ilumin/i, 'lamp'],
];

export function categoryIcon(name: string): IconName {
  return RULES.find(([re]) => re.test(name))?.[1] ?? 'tag';
}

export function CategoryTiles({ categories, value, onChange, all = true }: { categories: Category[]; value: string; onChange: (id: string) => void; all?: boolean }) {
  const list = categories.filter((c) => !c.archived);
  if (!list.length) return null;
  return (
    <div className="cat-tiles" role="group" aria-label="Categorías">
      {all && (
        <button type="button" className="cat-tile" aria-pressed={!value} onClick={() => onChange('')}>
          <Icon name="grid" />
          <span>Todas</span>
        </button>
      )}
      {list.map((c) => (
        <button key={c.id} type="button" className="cat-tile" aria-pressed={value === c.id} onClick={() => onChange(value === c.id ? '' : c.id)}>
          <Icon name={categoryIcon(c.name)} />
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  );
}
