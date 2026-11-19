/**
 * Estimador de envíos (sin servicios pagos: la distancia se carga a mano o se copia de un
 * mapa). Todo con decimales exactos.
 *
 *   km del recorrido = distancia × (2 si es ida y vuelta)
 *   nafta            = km × consumo (l/100 km) ÷ 100 × precio por litro    (auto / moto)
 *   pasajes          = boletos × precio del boleto × (2 si es ida y vuelta) (transporte)
 *   tiempo           = km ÷ velocidad promedio × 60 + espera (minutos)
 *   valor del tiempo = minutos ÷ 60 × valor de la hora
 *   costo            = nafta + pasajes + peajes/estacionamiento + valor del tiempo
 *   precio sugerido  = costo × (1 + recargo %), redondeado hacia arriba al múltiplo elegido
 *
 * El costo es INTERNO; al cliente sólo le llega el precio de envío que se decida cobrar.
 */
import { D, type Dec, roundMoney, toDec } from './money';

export type TransportMode = 'auto' | 'moto' | 'bici' | 'transporte' | 'pie';

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  auto: 'Auto',
  moto: 'Moto',
  bici: 'Bicicleta',
  transporte: 'Colectivo / tren',
  pie: 'A pie',
};

/** Velocidad promedio urbana por defecto (km/h). */
export const DEFAULT_SPEED: Record<TransportMode, Dec> = { auto: '25', moto: '30', bici: '14', transporte: '18', pie: '4.5' };

export interface ShippingDefaults {
  fuelPrice: Dec; // $ por litro
  carConsumption: Dec; // l / 100 km
  motoConsumption: Dec; // l / 100 km
  fare: Dec; // $ por boleto
  hourValue: Dec; // $ por hora de trabajo
  markupPct: Dec;
  roundTo: Dec; // redondeo hacia arriba
}

export const SHIPPING_DEFAULTS: ShippingDefaults = {
  fuelPrice: '0',
  carConsumption: '8',
  motoConsumption: '3',
  fare: '0',
  hourValue: '0',
  markupPct: '0',
  roundTo: '100',
};

export interface ShippingInput {
  mode: TransportMode;
  distanceKm: Dec;
  roundTrip: boolean;
  /** Boletos por tramo (transporte público). */
  tickets: Dec;
  waitMinutes: Dec;
  extras: Dec; // peajes, estacionamiento
  speedKmh?: Dec; // vacío = el por defecto del medio
}

export interface ShippingEstimate {
  km: Dec;
  minutes: number;
  fuelLiters: Dec;
  fuel: Dec;
  fares: Dec;
  time: Dec;
  extras: Dec;
  cost: Dec;
  suggested: Dec;
}

export function estimateShipping(input: ShippingInput, d: ShippingDefaults): ShippingEstimate {
  const trips = input.roundTrip ? 2 : 1;
  const km = D(input.distanceKm || '0').times(trips);
  const consumption = input.mode === 'auto' ? D(d.carConsumption || '0') : input.mode === 'moto' ? D(d.motoConsumption || '0') : D(0);
  const liters = km.times(consumption).div(100);
  const fuel = roundMoney(liters.times(D(d.fuelPrice || '0')));
  const fares = input.mode === 'transporte' ? roundMoney(D(input.tickets || '0').times(D(d.fare || '0')).times(trips)) : D(0);
  const speed = D(input.speedKmh || DEFAULT_SPEED[input.mode]);
  const minutes = speed.gt(0) ? km.div(speed).times(60).plus(D(input.waitMinutes || '0')) : D(input.waitMinutes || '0');
  const time = roundMoney(minutes.div(60).times(D(d.hourValue || '0')));
  const extras = roundMoney(D(input.extras || '0'));
  const cost = fuel.plus(fares).plus(time).plus(extras);
  const raw = cost.times(D(1).plus(D(d.markupPct || '0').div(100)));
  const step = D(d.roundTo || '0');
  const suggested = step.gt(0) ? raw.div(step).round(0, 3).times(step) : roundMoney(raw);
  return {
    km: km.round(2).toString(),
    minutes: Number(minutes.round(0, 1).toString()),
    fuelLiters: liters.round(2).toString(),
    fuel: toDec(fuel),
    fares: toDec(fares),
    time: toDec(time),
    extras: toDec(extras),
    cost: toDec(cost),
    suggested: toDec(suggested),
  };
}

/** Resumen interno legible: «8,5 km ida y vuelta en Auto · 41 min». */
export function shippingNote(i: ShippingInput, e: ShippingEstimate): string {
  return `${String(i.distanceKm).replace('.', ',')} km ${i.roundTrip ? 'ida y vuelta' : 'ida'} en ${TRANSPORT_LABELS[i.mode]} · ${e.minutes} min`;
}

/** Link para ver la ruta en Google Maps (gratis, sin clave): la distancia se copia de ahí. */
export function mapsRouteUrl(origin: string, destination: string, mode: TransportMode): string {
  const travel = mode === 'transporte' ? 'transit' : mode === 'bici' ? 'bicycling' : mode === 'pie' ? 'walking' : 'driving';
  const q = new URLSearchParams({ api: '1', origin, destination, travelmode: travel });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}
