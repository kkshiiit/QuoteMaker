import { describe, expect, it } from 'vitest';
import { estimateShipping, mapsRouteUrl, SHIPPING_DEFAULTS, shippingNote } from '../../src/domain/shipping';

const d = { ...SHIPPING_DEFAULTS, fuelPrice: '1250', carConsumption: '8', fare: '700', hourValue: '6000', markupPct: '0', roundTo: '100' };

describe('estimador de envíos', () => {
  it('auto ida y vuelta: nafta, tiempo, costo y redondeo hacia arriba', () => {
    const e = estimateShipping({ mode: 'auto', distanceKm: '8.5', roundTrip: true, tickets: '0', waitMinutes: '10', extras: '0' }, d);
    expect(e.km).toBe('17');
    expect(e.fuelLiters).toBe('1.36'); // 17 × 8 ÷ 100
    expect(e.fuel).toBe('1700.00'); // 1,36 l × $1.250
    expect(e.minutes).toBe(51); // 17 ÷ 25 × 60 = 40,8 + 10 espera
    expect(e.time).toBe('5080.00'); // 50,8 min ÷ 60 × $6.000
    expect(e.cost).toBe('6780.00');
    expect(e.suggested).toBe('6800.00');
  });

  it('transporte público: pasajes por tramo, sin nafta; recargo y sin redondeo', () => {
    const e = estimateShipping({ mode: 'transporte', distanceKm: '12', roundTrip: true, tickets: '2', waitMinutes: '0', extras: '0' }, { ...d, hourValue: '0', markupPct: '10', roundTo: '0' });
    expect(e.fuel).toBe('0.00');
    expect(e.fares).toBe('2800.00'); // 2 boletos × $700 × 2 tramos
    expect(e.cost).toBe('2800.00');
    expect(e.suggested).toBe('3080.00');
  });

  it('bici con peaje/estacionamiento y velocidad propia; distancia vacía no rompe', () => {
    const e = estimateShipping({ mode: 'bici', distanceKm: '7', roundTrip: false, tickets: '0', waitMinutes: '0', extras: '500', speedKmh: '21' }, { ...d, hourValue: '0' });
    expect(e.minutes).toBe(20);
    expect(e.cost).toBe('500.00');
    expect(estimateShipping({ mode: 'auto', distanceKm: '', roundTrip: false, tickets: '', waitMinutes: '', extras: '' }, d).cost).toBe('0.00');
  });

  it('nota interna y link de ruta en el mapa (sin clave ni servicio pago)', () => {
    const i = { mode: 'auto' as const, distanceKm: '8.5', roundTrip: true, tickets: '0', waitMinutes: '0', extras: '0' };
    expect(shippingNote(i, estimateShipping(i, d))).toBe('8,5 km ida y vuelta en Auto · 41 min');
    const url = new URL(mapsRouteUrl('Av. Siempreviva 742', 'Calle Falsa 123', 'transporte'));
    expect(url.hostname).toBe('www.google.com');
    expect(url.searchParams.get('travelmode')).toBe('transit');
    expect(url.searchParams.get('destination')).toBe('Calle Falsa 123');
  });
});
