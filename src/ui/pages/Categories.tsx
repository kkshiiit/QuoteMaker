import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../data/db';
import { createBase, putRecord } from '../../data/repo';
import type { Category } from '../../domain/types';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorSummary, PageHeader, useToast } from '../components/ui';

export default function Categories() {
  const toast = useToast();
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const p of await db.products.toArray()) if (p.categoryId) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    return m;
  }, []);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const exists = (n: string, except?: string) => (cats ?? []).some((c) => c.id !== except && !c.archived && c.name.trim().toLocaleLowerCase('es') === n.trim().toLocaleLowerCase('es'));

  const add = async () => {
    if (!name.trim()) return setErrors(['Escribí un nombre.']);
    if (exists(name)) return setErrors(['Ya existe esa categoría.']);
    setErrors([]);
    await putRecord('categories', { ...createBase(), name: name.trim(), archived: false });
    setName('');
    toast('Categoría creada');
  };
  const rename = async (c: Category) => {
    const n = editing[c.id] ?? c.name;
    if (!n.trim() || exists(n, c.id)) return setErrors(['Nombre vacío o repetido.']);
    setErrors([]);
    await putRecord('categories', { ...c, name: n.trim() });
    setEditing(({ [c.id]: _, ...rest }) => rest);
    toast('Categoría actualizada');
  };

  return (
    <>
      <PageHeader title="Categorías" subtitle="Para ordenar y filtrar tus productos." />
      <ErrorSummary errors={errors} />
      <form className="card row" onSubmit={(e) => { e.preventDefault(); void add(); }} style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="ncat">Nueva categoría</label>
          <input id="ncat" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit"><Icon name="plus" />Agregar</button>
      </form>
      {cats && cats.length === 0 ? (
        <EmptyState icon="tag" title="Sin categorías" text="Creá categorías como «Muebles» o «Iluminación»." />
      ) : (
        <ul className="list">
          {(cats ?? []).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'es')).map((c) => (
            <li key={c.id} className="list-item">
              <div className="grow field">
                <label htmlFor={`c-${c.id}`} className="sr-only">Nombre de la categoría</label>
                <input id={`c-${c.id}`} className="input" value={editing[c.id] ?? c.name} onChange={(e) => setEditing({ ...editing, [c.id]: e.target.value })} disabled={c.archived} />
                <span className="small muted">{counts?.get(c.id) ?? 0} producto(s){c.archived ? ' · Archivada' : ''}</span>
              </div>
              {editing[c.id] !== undefined && <button className="btn btn-sm" onClick={() => rename(c)}>Guardar</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => putRecord('categories', { ...c, archived: !c.archived })}>{c.archived ? 'Restaurar' : 'Archivar'}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
