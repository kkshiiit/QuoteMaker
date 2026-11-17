# PRD — QuoteMaker

## Problema

Quien vende productos (muebles, deco, indumentaria, alimentos, reventa) suele calcular precios «a ojo»: se olvida del combustible, los peajes, el embalaje o la comisión del cobro; confunde margen con markup; y arma presupuestos en planillas donde un descuido expone sus costos al cliente.

## Usuario

**Emprendedor o titular del negocio** (única persona usuaria). Usa el teléfono en la calle y la computadora en el taller/oficina, a veces sin conexión. Los clientes son contactos privados, **no usuarios**.

## Objetivos

1. Conocer el **costo unitario real** de cada producto, incluyendo gastos asociados, sin contar nada dos veces.
2. Fijar **precios con margen sano**, entendiendo margen vs markup y cargos.
3. Emitir **presupuestos profesionales** (PDF/WhatsApp) en minutos, sin filtrar información interna.
4. Saber **cómo va el negocio** (aceptación, ventas, ganancia estimada).
5. Funcionar **offline** y, si se quiere, sincronizar entre dispositivos. Costo $0.

## Alcance (implementado)

Productos y categorías · Proveedores · Compras · Gastos asignables con 6 criterios de distribución · Costo real por lote e historial · Gastos generales · Calculadora de precios · Clientes privados · Presupuestos con estados manuales, copia congelada, historial y duplicado · PDF y WhatsApp con allowlist · Estadísticas · Personalización · Respaldo · Sincronización opcional (Supabase) · Web/PWA y Android.

## Fuera de alcance (explícitamente excluido)

Cuentas o portal de clientes, links públicos, aceptación online, chat, tracking de lectura, envío automático, WhatsApp Business API, cambios de estado automáticos, Google Drive API/OAuth, inventario/stock (se decidió no agregar un módulo superficial).

## Requisitos clave y criterios de aceptación

| Requisito | Criterio | Verificación |
|---|---|---|
| Precisión decimal | Ningún cálculo de dinero usa `number`; sumas de distribución exactas | `tests/unit/domain.*` (incluye 500 casos aleatorios) |
| Margen ≠ markup | Fórmulas documentadas; precio imposible avisado | Pruebas unitarias + e2e |
| Sin doble conteo | Cada gasto suma una vez en el libro | `expenseLedger` + pruebas |
| Históricos inmutables | Presupuesto enviado no cambia con nuevos costos/precios | Unitaria + e2e |
| Privacidad | PDF/WhatsApp/metadatos/nombres sin datos internos | Pruebas anti-filtración unitarias + e2e |
| Estados manuales | Sólo transiciones explícitas | Pruebas |
| Offline | Abrir, crear y persistir sin conexión | e2e offline (PWA) + Android tras reinicio |
| Accesibilidad | 0 violaciones axe WCAG 2.2 AA | e2e |

## Métricas de éxito sugeridas

Tiempo para emitir un presupuesto < 3 min; 100 % de productos con costo real; 0 incidentes de filtración.
