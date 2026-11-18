import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { parseDecimalInput, type Dec } from '../../domain/money';
import { QUOTE_STATUS_LABELS, type QuoteStatus } from '../../domain/types';
import { Icon, type IconName } from './Icon';

// ---------------- Toasts (aria-live) ----------------

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`} role={t.kind === 'error' ? 'alert' : undefined}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------- Layout helpers ----------------

let routeFocusPending = false;
/** Marca que la próxima pantalla debe anunciar su título (lectores de pantalla). */
export function requestRouteFocus() {
  routeFocusPending = true;
}
function isEditingControl(el: Element | null): boolean {
  return !!el && (el.matches('input, textarea, select, [contenteditable="true"]') || !!el.closest('dialog'));
}

export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · Chediek Home`;
  }, [title]);
  useEffect(() => {
    if (!routeFocusPending) return;
    routeFocusPending = false;
    if (!isEditingControl(document.activeElement)) h1.current?.focus({ preventScroll: true });
  }, []);
  return (
    <>
      {back && (
        <Link className="back-link" to={back.to}>
          <Icon name="back" />
          {back.label}
        </Link>
      )}
      <header className="page-header">
        <div>
          <h1 tabIndex={-1} id="page-title" ref={h1}>
            {title}
          </h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
    </>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function ErrorSummary({ errors }: { errors: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors]);
  if (!errors.length) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <h2>Revisá {errors.length === 1 ? 'este dato' : `estos ${errors.length} datos`}</h2>
      <ul>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Fields ----------------

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error" id={errId}>
          {error}
        </span>
      )}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string | null;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'url';
  placeholder?: string;
  className?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <Field label={props.label + (props.required ? ' *' : '')} hint={props.hint} error={props.error} className={props.className}>
      {({ id, describedBy, invalid }) =>
        props.multiline ? (
          <textarea
            id={id}
            className="input"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            maxLength={props.maxLength}
            placeholder={props.placeholder}
          />
        ) : (
          <input
            id={id}
            className="input"
            type={props.type ?? 'text'}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-required={props.required || undefined}
            autoComplete={props.autoComplete ?? 'off'}
            inputMode={props.inputMode}
            placeholder={props.placeholder}
            maxLength={props.maxLength}
          />
        )
      }
    </Field>
  );
}

const toDisplay = (v: Dec | '' | null | undefined) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));

/** Entrada numérica decimal (acepta "1.234,56"). Nunca convierte a number. */
export function DecimalField(props: {
  label: string;
  value: Dec | '' | null;
  onChange: (v: Dec | '') => void;
  hint?: ReactNode;
  error?: string | null;
  prefix?: string;
  suffix?: string;
  required?: boolean;
  allowNegative?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(toDisplay(props.value));
  const [invalid, setInvalid] = useState(false);
  const last = useRef(props.value);
  useEffect(() => {
    if (props.value !== last.current) {
      last.current = props.value;
      const parsed = parseDecimalInput(text);
      if (parsed !== props.value) setText(toDisplay(props.value));
    }
  }, [props.value, text]);
  const ownError = invalid ? 'Ingresá un número válido (ej. 1.234,50).' : null;
  return (
    <Field label={props.label + (props.required ? ' *' : '')} hint={props.hint} error={props.error ?? ownError} className={props.className}>
      {({ id, describedBy, invalid: inv }) => (
        <div className="input-affix">
          {props.prefix && <span className="affix affix-start">{props.prefix}</span>}
          <input
            id={id}
            className={`input num ${props.prefix ? 'has-start' : ''} ${props.suffix ? 'has-end' : ''}`}
            inputMode="decimal"
            value={text}
            placeholder={props.placeholder}
            aria-describedby={describedBy}
            aria-invalid={inv || undefined}
            aria-required={props.required || undefined}
            onChange={(e) => {
              const t = e.target.value;
              setText(t);
              if (t.trim() === '') {
                setInvalid(false);
                last.current = '';
                props.onChange('');
                return;
              }
              const parsed = parseDecimalInput(t);
              const bad = parsed === null || (!props.allowNegative && parsed.startsWith('-'));
              setInvalid(bad);
              if (!bad && parsed !== null) {
                last.current = parsed;
                props.onChange(parsed);
              }
            }}
          />
          {props.suffix && <span className="affix affix-end">{props.suffix}</span>}
        </div>
      )}
    </Field>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
}) {
  return (
    <Field label={props.label} hint={props.hint} error={props.error} className={props.className}>
      {({ id, describedBy, invalid }) => (
        <select id={id} className="input" value={props.value} onChange={(e) => props.onChange(e.target.value as T)} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined} />
        <span>{label}</span>
      </label>
      {hint && (
        <p className="small muted" id={`${id}-h`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ legend, value, onChange, options }: { legend: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  const name = useId();
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------- Dialog ----------------

export function Dialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <div className="dialog-body">
            <h2 id={titleId}>{title}</h2>
            {children}
          </div>
          {actions && <div className="dialog-actions">{actions}</div>}
        </>
      )}
    </dialog>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: string; confirm: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((title: string, text: string, confirm = 'Confirmar', danger = false) => new Promise<boolean>((resolve) => setState({ title, text, confirm, danger, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const node = (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      title={state?.title ?? ''}
      actions={
        <>
          {/* En acciones destructivas el foco inicial queda en «Cancelar»: Enter nunca borra por accidente. */}
          <button type="button" className="btn" onClick={() => close(false)} autoFocus={!!state?.danger}>
            Cancelar
          </button>
          <button type="button" className={`btn ${state?.danger ? 'btn-danger-fill' : 'btn-primary'}`} onClick={() => close(true)} autoFocus={!state?.danger}>
            {state?.danger && <Icon name="trash" />}
            {state?.confirm}
          </button>
        </>
      }
    >
      <p>{state?.text}</p>
    </Dialog>
  );
  return [ask, node] as const;
}

// ---------------- Menu ----------------

export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <details className="menu" ref={ref}>
      <summary className="btn btn-icon" aria-label={label} title={label}>
        <Icon name="more" />
      </summary>
      <div className="menu-panel" onClick={() => ref.current && (ref.current.open = false)}>
        {children}
      </div>
    </details>
  );
}

// ---------------- Badges ----------------

const STATUS_STYLE: Record<QuoteStatus, { cls: string; icon: IconName }> = {
  draft: { cls: '', icon: 'edit' },
  sent: { cls: 'badge-info', icon: 'upload' },
  accepted: { cls: 'badge-ok', icon: 'check' },
  rejected: { cls: 'badge-danger', icon: 'x' },
  expired: { cls: 'badge-warn', icon: 'alert' },
  cancelled: { cls: '', icon: 'archive' },
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`badge ${s.cls}`}>
      <Icon name={s.icon} />
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}

export function InternalLabel({ text = 'Interno · no se comparte' }: { text?: string }) {
  return (
    <span className="internal-label">
      <Icon name="lock" />
      {text}
    </span>
  );
}
