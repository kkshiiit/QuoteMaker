/** Estimador de envíos: calculadora reutilizable (página «Envíos» y diálogo dentro del pedido). */
import { useMemo, useState } from 'react';
import { saveSettings } from '../../data/services';
import type { Dec } from '../../domain/money';
import { DEFAULT_SPEED, estimateShipping, mapsRouteUrl, SHIPPING_DEFAULTS, shippingNote, TRANSPORT_LABELS, type ShippingDefaults, type ShippingInput, type TransportMode } from '../../domain/shipping';
import { useMoney, useSettings } from '../hooks';
import { Icon } from './Icon';
import { Check, DecimalField, Dialog, InternalLabel, Segmented, TextField, useToast } from './ui';

export interface ShippingResult {
  price: Dec;
  cost: Dec;
  note: string;
}

export function ShippingCalculator({ destination: initialDest = '', onApply, applyLabel = 'Aplicar precio al pedido' }: { destination?: string; onApply?: (r: ShippingResult) => void; applyLabel?: string }) {
  const settings = useSettings();
  const money = useMoney();
  const toast = useToast();
  const saved = settings.shipping ?? SHIPPING_DEFAULTS;
  const [d, setD] = useState<ShippingDefaults>(saved);
  const [origin, setOrigin] = useState(settings.shippingOrigin ?? '');
  const [dest, setDest] = useState(initialDest);
  const [input, setInput] = useState<ShippingInput>({ mode: 'auto', distanceKm: '', roundTrip: true, tickets: '1', waitMinutes: '10', extras: '0' });
  const [price, setPrice] = useState<Dec | ''>('');
  const est = useMemo(() => estimateShipping(input, d), [input, d]);
  const setI = (p: Partial<ShippingInput>) => setInput((x) => ({ ...x, ...p }));
  const setDef = (p: Partial<ShippingDefaults>) => setD((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(d) !== JSON.stringify(saved) || origin !== (settings.shippingOrigin ?? '');
  const finalPrice = price || est.suggested;

  return (
    <div className="stack">
      <div className="form-grid cols-2">
        <TextField label="Desde" value={origin} onChange={setOrigin} hint="Tu local o depósito." />
        <TextField label="Destino" value={dest} onChange={setDest} />
      </div>
      <div className="actions">
        <a className={`btn btn-sm ${!origin.trim() || !dest.trim() ? 'btn-disabled' : ''}`} href={origin.trim() && dest.trim() ? mapsRouteUrl(origin, dest, input.mode) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!origin.trim() || !dest.trim()}>
          <Icon name="route" />
          Ver ruta en el mapa
        </a>
        <span className="small muted">Copiá de ahí los km (gratis, sin cuentas).</span>
      </div>
      <Segmented<TransportMode> legend="Medio de transporte" value={input.mode} onChange={(mode) => setI({ mode })} options={(Object.keys(TRANSPORT_LABELS) as TransportMode[]).map((m) => ({ value: m, label: TRANSPORT_LABELS[m] }))} />
      <div className="form-grid cols-3">
        <DecimalField label="Distancia" suffix="km" value={input.distanceKm} onChange={(v) => setI({ distanceKm: v })} />
        <DecimalField label="Espera / entrega" suffix="min" value={input.waitMinutes} onChange={(v) => setI({ waitMinutes: v })} />
        <DecimalField label="Velocidad promedio" suffix="km/h" value={input.speedKmh ?? ''} onChange={(v) => setI({ speedKmh: v || undefined })} placeholder={DEFAULT_SPEED[input.mode]} hint="Vacío = típica en ciudad." />
        {input.mode === 'transporte' && <DecimalField label="Boletos por tramo" value={input.tickets} onChange={(v) => setI({ tickets: v })} hint="Ej. colectivo + tren = 2." />}
        <DecimalField label="Peajes / estacionamiento" prefix="$" value={input.extras === '0' ? '' : input.extras} onChange={(v) => setI({ extras: v || '0' })} />
      </div>
      <Check label="Ida y vuelta" checked={input.roundTrip} onChange={(roundTrip) => setI({ roundTrip })} />

      <details>
        <summary>
          <strong>Valores de cálculo</strong> <InternalLabel text="Interno" />
        </summary>
        <div className="form-grid cols-3" style={{ marginTop: 10 }}>
          <DecimalField label="Nafta / diésel por litro" prefix="$" value={d.fuelPrice} onChange={(v) => setDef({ fuelPrice: v || '0' })} />
          <DecimalField label="Consumo del auto" suffix="l/100 km" value={d.carConsumption} onChange={(v) => setDef({ carConsumption: v || '0' })} />
          <DecimalField label="Consumo de la moto" suffix="l/100 km" value={d.motoConsumption} onChange={(v) => setDef({ motoConsumption: v || '0' })} />
          <DecimalField label="Boleto" prefix="$" value={d.fare} onChange={(v) => setDef({ fare: v || '0' })} />
          <DecimalField label="Valor de tu hora" prefix="$" value={d.hourValue} onChange={(v) => setDef({ hourValue: v || '0' })} />
          <DecimalField label="Recargo" suffix="%" value={d.markupPct} onChange={(v) => setDef({ markupPct: v || '0' })} />
          <DecimalField label="Redondear a" prefix="$" value={d.roundTo} onChange={(v) => setDef({ roundTo: v || '0' })} hint="Hacia arriba. 0 = sin redondeo." />
        </div>
        {dirty && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={async () => {
              await saveSettings({ ...settings, shipping: d, shippingOrigin: origin });
              toast('Valores de envío guardados');
            }}
          >
            Guardar como valores habituales
          </button>
        )}
      </details>

      <div className="card soft" aria-live="polite">
        <dl className="dl">
          <dt>Recorrido</dt>
          <dd>
            {est.km.replace('.', ',')} km · {est.minutes} min
          </dd>
          {est.fuel !== '0.00' && (
            <>
              <dt>Combustible ({est.fuelLiters.replace('.', ',')} l)</dt>
              <dd>{money(est.fuel)}</dd>
            </>
          )}
          {est.fares !== '0.00' && (
            <>
              <dt>Pasajes</dt>
              <dd>{money(est.fares)}</dd>
            </>
          )}
          {est.time !== '0.00' && (
            <>
              <dt>Tu tiempo</dt>
              <dd>{money(est.time)}</dd>
            </>
          )}
          {est.extras !== '0.00' && (
            <>
              <dt>Peajes / estacionamiento</dt>
              <dd>{money(est.extras)}</dd>
            </>
          )}
          <dt>
            Costo del envío <InternalLabel text="Interno" />
          </dt>
          <dd data-testid="ship-cost">{money(est.cost)}</dd>
          <dt className="total">Precio sugerido</dt>
          <dd className="total" data-testid="ship-suggested">
            {money(est.suggested)}
          </dd>
        </dl>
        <p className="small muted" style={{ marginTop: 8 }}>
          Es una estimación: ajustá el precio según tu política comercial.
        </p>
      </div>
      {onApply && (
        <div className="form-grid cols-2" style={{ alignItems: 'end' }}>
          <DecimalField label="Precio a cobrar" prefix="$" value={price} onChange={setPrice} placeholder={est.suggested} hint="Vacío = el sugerido." />
          <button type="button" className="btn btn-primary" onClick={() => onApply({ price: finalPrice, cost: est.cost, note: shippingNote(input, est) })}>
            <Icon name="check" />
            {applyLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function ShippingDialog({ open, onClose, destination, onApply }: { open: boolean; onClose: () => void; destination: string; onApply: (r: ShippingResult) => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Calcular envío"
      actions={
        <button className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <ShippingCalculator destination={destination} onApply={onApply} />
    </Dialog>
  );
}
