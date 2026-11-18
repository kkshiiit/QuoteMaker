/**
 * Datos de ejemplo 100 % ficticios (para probar la app, capturas y pruebas e2e).
 * Se cargan con las mismas funciones de negocio que usa la UI.
 */
import { addDays } from '../domain/quote';
import type { Customer, Product, Sale, Supplier } from '../domain/types';
import { db } from './db';
import { newId, todayIso } from './defaults';
import { createBase, putRecord } from './repo';
import {
  changeQuoteStatus,
  createQuote,
  emptyCustomer,
  emptyExpense,
  emptyProduct,
  emptyPurchase,
  emptySale,
  emptySupplier,
  getSettings,
  itemFromProduct,
  saveExpense,
  savePurchase,
  saveProduct,
  saveQuote,
  saveSale,
  addStockMove,
  saveSettings,
  suggestedPrice,
} from './services';

export async function isDatabaseEmpty(): Promise<boolean> {
  const counts = await Promise.all([db.products.count(), db.quotes.count(), db.customers.count(), db.purchases.count()]);
  return counts.every((c) => c === 0);
}

export async function loadDemoData(): Promise<void> {
  const today = todayIso();
  const d = (n: number) => addDays(today, -n);
  const s = await getSettings();
  await saveSettings({
    ...s,
    businessName: 'Taller Aurora',
    legalName: 'Aurora Muebles (ejemplo)',
    phone: '+54 9 11 5555-0100',
    email: 'hola@taller-aurora.example',
    address: 'Av. Ficticia 1234, Buenos Aires',
    website: 'taller-aurora.example',
    instagram: '@taller.aurora.ejemplo',
    facebook: 'facebook.com/taller.aurora.ejemplo',
    tiktok: '@taller.aurora.ejemplo',
    defaultTaxPct: '21',
    defaultTargetMarginPct: '40',
    defaultPctCharges: '4',
    estimatedMonthlyUnits: '60',
    quotePrefix: 'TA-',
    defaultConditions: 'Seña del 50 % para confirmar. Entrega en 10 días hábiles. Precios válidos hasta la fecha indicada.',
  });

  const cat = async (name: string) => putRecord('categories', { ...createBase(), name, archived: false });
  const [muebles, deco] = [await cat('Muebles'), await cat('Decoración')];

  const sup = async (x: Partial<Supplier>) => putRecord('suppliers', { ...emptySupplier(), ...x });
  const maderera = await sup({ name: 'Maderera del Norte (ejemplo)', contactName: 'Ramiro', phone: '11 4000-0001', notes: 'Paga a 30 días.' });
  const textil = await sup({ name: 'Textiles Sur (ejemplo)', contactName: 'Paula', phone: '11 4000-0002' });

  const prod = async (x: Partial<Product>) => saveProduct({ ...emptyProduct(), ...x });
  const mesa = await prod({ favorite: true, name: 'Mesa de roble 120 cm', description: 'Roble macizo, terminación aceite natural', categoryId: muebles.id, supplierId: maderera.id, sku: 'MES-120', unitWeight: '22', unitVolume: '180' });
  const silla = await prod({ name: 'Silla tapizada', description: 'Estructura de roble, tapizado lino gris', categoryId: muebles.id, supplierId: textil.id, sku: 'SIL-01', unitWeight: '6', unitVolume: '90' });
  const banco = await prod({ name: 'Banco largo', description: 'Para mesa de 120 cm', categoryId: muebles.id, supplierId: maderera.id, sku: 'BAN-01', unitWeight: '9', unitVolume: '60' });
  const lampara = await prod({ name: 'Lámpara de pie', description: 'Pantalla de lino', categoryId: deco.id, sku: 'LAM-01', unitWeight: '3', unitVolume: '40', manualCost: '28000', favorite: true });
  const cojin = await prod({
    name: 'Almohadón 45×45',
    categoryId: deco.id,
    supplierId: textil.id,
    sku: 'ALM-45',
    unitWeight: '0.5',
    unitVolume: '10',
    trackStock: true,
    lowStockAt: '2',
    variants: [
      { id: 'alm-crudo', color: 'Crudo', colorHex: '#efe6d2', size: '' },
      { id: 'alm-salvia', color: 'Verde salvia', colorHex: '#9cb59a', size: '' },
      { id: 'alm-terracota', color: 'Terracota', colorHex: '#c0643f', size: '' },
    ],
  });
  await addStockMove(cojin.id, 'alm-crudo', '8', 'in', 'Compra a Textiles Sur');
  await addStockMove(cojin.id, 'alm-salvia', '6', 'in', 'Compra a Textiles Sur');
  await addStockMove(cojin.id, 'alm-terracota', '3', 'in', 'Compra a Textiles Sur');
  await prod({ name: 'Servicio de armado', description: 'Armado e instalación en domicilio', unit: 'servicio', manualCost: '8000', manualPrice: '15000' });

  const purchase = async (date: string, supplierId: string, items: Array<[Product, string, string]>, extra = '0', ref = '') => {
    const p = emptyPurchase(s.currency);
    Object.assign(p, { date, supplierId, extraCharges: extra, reference: ref });
    p.items = items.map(([pr, qty, price]) => ({ id: newId(), productId: pr.id, quantity: qty, unitPrice: price, discount: '0', unitWeight: pr.unitWeight, unitVolume: pr.unitVolume }));
    await savePurchase(p);
    return p;
  };
  const p1 = await purchase(d(40), maderera.id, [[mesa, '4', '150000'], [banco, '6', '38000']], '12000', 'FC A-0001-0042');
  const p2 = await purchase(d(25), textil.id, [[silla, '12', '42000'], [cojin, '20', '6500']], '0', 'FC B-0003-0107');
  await purchase(d(5), maderera.id, [[mesa, '2', '165000']], '0', 'FC A-0001-0058');

  await saveExpense({ ...emptyExpense(), date: d(40), category: 'Combustible', description: 'Viaje a la maderera', amount: '24000', target: 'purchase', purchaseId: p1.id, method: 'weight' });
  await saveExpense({ ...emptyExpense(), date: d(40), category: 'Peajes', description: 'Autopista ida y vuelta', amount: '6800', target: 'purchase', purchaseId: p1.id, method: 'units' });
  await saveExpense({ ...emptyExpense(), date: d(25), category: 'Envío de compra', description: 'Flete de tela', amount: '18000', target: 'purchase', purchaseId: p2.id, method: 'value' });
  await saveExpense({ ...emptyExpense(), date: d(20), category: 'Embalaje', description: 'Film y cartón', amount: '9600', target: 'products', productIds: [silla.id, banco.id], method: 'units' });
  await saveExpense({ ...emptyExpense(), date: d(3), category: 'Estacionamiento', description: 'Feria de diseño', amount: '4500' });

  const oh = async (name: string, category: string, amount: string, include: boolean, frequency: 'monthly' | 'yearly' = 'monthly') =>
    putRecord('overheads', { ...createBase(), name, category, amount, currency: s.currency, frequency, kind: 'fixed' as const, startDate: d(120), endDate: null, active: true, includeInUnitCost: include, notes: '' });
  await oh('Alquiler del taller', 'Alquiler', '180000', true);
  await oh('Internet', 'Internet', '22000', true);
  await oh('Publicidad en redes', 'Publicidad', '35000', false);

  const cust = async (x: Partial<Customer>) => putRecord('customers', { ...emptyCustomer(), ...x });
  const lucia = await cust({ name: 'Lucía Fernández', phone: '+54 9 11 5555-0201', email: 'lucia@example.com', address: 'Calle Imaginaria 742', notes: 'Prefiere entregas por la tarde.' });
  const estudio = await cust({ name: 'Estudio Norte Arquitectura', phone: '+54 9 11 5555-0202', email: 'compras@estudionorte.example', taxId: '30-00000000-0' });
  const martin = await cust({ name: 'Martín Gómez', phone: '+54 9 11 5555-0203' });
  await cust({ name: 'Café Las Palmas', phone: '+54 9 11 5555-0204', email: 'contacto@laspalmas.example' });

  const settings = await getSettings();
  const fresh = async (p: Product) => (await db.products.get(p.id))!;
  const item = async (p: Product, qty: string, disc = '0') => ({ ...itemFromProduct(await fresh(p), suggestedPrice(await fresh(p), settings)), quantity: qty, discountPct: disc });

  const quote = async (c: Customer, items: Awaited<ReturnType<typeof item>>[], extra: Record<string, string> = {}, statuses: Array<'sent' | 'accepted' | 'rejected'> = [], daysAgo = 0) => {
    let q = await createQuote(c);
    q = await saveQuote({ ...q, items, issueDate: d(daysAgo), validUntil: addDays(d(daysAgo), 15), ...extra });
    for (const st of statuses) q = await changeQuoteStatus(q, st);
    return q;
  };
  await quote(estudio, [await item(mesa, '2'), await item(silla, '8', '5'), await item(banco, '2')], { shippingCharged: '25000', shippingCost: '18000' }, ['sent', 'accepted'], 12);
  await quote(lucia, [await item(mesa, '1'), await item(silla, '4')], { shippingCharged: '12000', shippingCost: '9000' }, ['sent'], 6);
  await quote(martin, [await item(lampara, '2'), await item(cojin, '4')], {}, ['sent', 'rejected'], 20);
  await quote(lucia, [await item(cojin, '6')], { globalDiscountPct: '10' }, [], 1);

  // Ventas: en el local y online, con y sin cliente registrado
  const sale = async (x: Partial<Sale>, items: Awaited<ReturnType<typeof item>>[]) => saveSale({ ...emptySale(), ...x, items: items.map((it) => ({ ...it, description: it.description.split(' — ')[0] ?? it.description })) });
  await sale({ date: d(9), channel: 'presencial', customerId: martin.id, customerName: martin.name, paymentMethod: 'Efectivo' }, [await item(lampara, '1')]);
  const v = async (p: Product, qty: string, variantId: string, label: string) => ({ ...(await item(p, qty)), variantId, description: `${p.name} (${label})` });
  await sale({ date: d(4), channel: 'online', platform: 'Instagram', customerId: lucia.id, customerName: lucia.name, paymentMethod: 'Transferencia', shippingCharged: '6000' }, [await v(cojin, '4', 'alm-crudo', 'Crudo')]);
  await sale({ date: d(2), channel: 'online', platform: 'WhatsApp', customerName: 'Sofía R.', paymentMethod: 'Mercado Pago' }, [await item(silla, '2')]);
  await sale({ date: d(0), channel: 'presencial', paymentMethod: 'Débito' }, [await v(cojin, '2', 'alm-salvia', 'Verde salvia')]);
  // Pedido confirmado con seña, envío a domicilio y saldo pendiente
  await sale(
    {
      date: d(1),
      channel: 'online',
      platform: 'Facebook',
      customerId: estudio.id,
      customerName: estudio.name,
      paymentMethod: 'Transferencia',
      status: 'confirmado',
      shippingCharged: '3500',
      payments: [{ id: newId(), date: d(1), amount: '30000', method: 'Transferencia', note: 'Seña' }],
      delivery: { mode: 'envio', address: 'Av. Corrientes 1234, CABA', date: d(-3), internalCost: '2400', internalNote: '8,5 km ida y vuelta en Auto · 51 min' },
    },
    [await v(cojin, '2', 'alm-terracota', 'Terracota'), await item(lampara, '1')],
  );
}
