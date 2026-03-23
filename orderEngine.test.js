// orderEngine.test.js
const { addItem, removeItem, calculateItemTotal, calculateTotal, validateOrder } = require('./orderEngine');

describe('addItem', () => {
  test('✅ Adiciona marmita ao pedido', () => {
    const order = { items: [] };
    const item = { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{ name: 'Frango' }] };
    const { order: updated, event } = addItem(order, item);
    expect(updated.items).toHaveLength(1);
    expect(event).toBe('item_added');
  });

  test('❌ Rejeita item sem tipo', () => {
    const order = { items: [] };
    const { event } = addItem(order, { price: 10 });
    expect(event).toBe('invalid_item');
  });

  test('❌ Rejeita item com preço negativo', () => {
    const order = { items: [] };
    const { event } = addItem(order, { tipo: 'extra', price: -5 });
    expect(event).toBe('invalid_price');
  });
});

describe('removeItem', () => {
  test('✅ Remove item por índice', () => {
    const order = { items: [{ tipo: 'marmita' }, { tipo: 'extra' }] };
    const { order: updated, event } = removeItem(order, 1);
    expect(updated.items).toHaveLength(1);
    expect(event).toBe('item_removed');
  });

  test('❌ Índice inválido', () => {
    const order = { items: [{ tipo: 'marmita' }] };
    const { event } = removeItem(order, 5);
    expect(event).toBe('invalid_index');
  });
});

describe('calculateTotal', () => {
  test('✅ Total simples: 2 marmitas + taxa', () => {
    const order = {
      items: [
        { tipo: 'marmita', price: 22, quantity: 2 },
        { tipo: 'extra', price: 6, quantity: 1 }
      ],
      deliveryFee: 5
    };
    expect(calculateTotal(order)).toBe(22 * 2 + 6 + 5);
  });

  test('✅ base_price tem prioridade', () => {
    const order = {
      items: [{ tipo: 'marmita', base_price: 20, price: 99, quantity: 1 }],
      deliveryFee: 0
    };
    expect(calculateTotal(order)).toBe(20);
  });

  test('✅ Extras embutidos no item', () => {
    const order = {
      items: [{
        tipo: 'marmita', price: 22, quantity: 1,
        extras: [{ price: 3, quantity: 1 }, { price: 2, quantity: 2 }]
      }],
      deliveryFee: 0
    };
    expect(calculateTotal(order)).toBe(22 + 3 + 4);
  });

  test('✅ Sem taxa = 0', () => {
    const order = { items: [{ tipo: 'marmita', price: 20, quantity: 1 }] };
    expect(calculateTotal(order)).toBe(20);
  });

  test('✅ estimated_price (açougue) — usa valor direto sem multiplicar', () => {
    const order = {
      items: [{ tipo: 'carne', produto: 'Picanha', estimated_price: 67.5, quantity: { value: 1.5, unit: 'kg' } }],
      deliveryFee: 8
    };
    expect(calculateTotal(order)).toBe(67.5 + 8);
  });

  test('✅ quantity como objeto { value, unit } — multiplica corretamente', () => {
    const order = {
      items: [{ tipo: 'carne', price: 45, quantity: { value: 2.5, unit: 'kg' } }],
      deliveryFee: 0
    };
    expect(calculateTotal(order)).toBe(45 * 2.5);
  });

  test('✅ calculateItemTotal isolado — estimated_price tem prioridade', () => {
    const item = { tipo: 'carne', price: 45, estimated_price: 67.5, quantity: { value: 1.5, unit: 'kg' } };
    expect(calculateItemTotal(item)).toBe(67.5);
  });
});

describe('validateOrder', () => {
  test('✅ Pedido válido delivery', () => {
    const order = {
      items: [{ tipo: 'marmita', price: 22, proteinas: [{ name: 'Frango' }] }],
      type: 'delivery',
      address: 'Rua X, 100',
      paymentMethod: 'Pix'
    };
    expect(validateOrder(order).valid).toBe(true);
  });

  test('❌ Pedido sem itens', () => {
    const order = { items: [], type: 'delivery', address: 'Rua X', paymentMethod: 'Pix' };
    const result = validateOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Pedido sem itens');
  });

  test('❌ Delivery sem endereço', () => {
    const order = {
      items: [{ tipo: 'marmita', price: 22, proteinas: [{ name: 'Frango' }] }],
      type: 'delivery',
      address: null,
      paymentMethod: 'Pix'
    };
    expect(validateOrder(order).valid).toBe(false);
  });

  test('✅ Pickup sem endereço é válido', () => {
    const order = {
      items: [{ tipo: 'marmita', price: 22, proteinas: [{ name: 'Frango' }] }],
      type: 'pickup',
      paymentMethod: 'Dinheiro'
    };
    expect(validateOrder(order).valid).toBe(true);
  });
});
