import { ShippingCalculator } from '../components/Shipping';
import { PageHeader } from '../components/ui';

export default function ShippingPage() {
  return (
    <>
      <PageHeader title="Envíos" subtitle="Estimá cuánto te cuesta una entrega y qué precio cobrar. Desde un pedido, el precio se aplica directo." />
      <section className="card" style={{ maxWidth: 820 }}>
        <ShippingCalculator />
      </section>
    </>
  );
}
