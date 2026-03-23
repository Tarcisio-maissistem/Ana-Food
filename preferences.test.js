// preferences.test.js
const { _buildPreferences, invalidateCardapioCache } = require('./database');

// Mock stateManager para testar invalidateCardapioCache sem Redis real
jest.mock('./stateManager', () => ({
  cacheDel: jest.fn().mockResolvedValue(true),
  cacheGet: jest.fn(),
  cacheSet: jest.fn()
}));

describe('_buildPreferences', () => {
  test('✅ Preferências vazias → inicializa total_orders=1', () => {
    const result = _buildPreferences({}, { paymentMethod: 'Pix', items: [] });
    expect(result.total_orders).toBe(1);
  });

  test('✅ Incrementa total_orders existente', () => {
    const result = _buildPreferences({ total_orders: 5 }, { items: [] });
    expect(result.total_orders).toBe(6);
  });

  test('✅ Define favorite_payment pelo mais usado', () => {
    let prefs = {};
    prefs = _buildPreferences(prefs, { paymentMethod: 'Pix', items: [] });
    prefs = _buildPreferences(prefs, { paymentMethod: 'Pix', items: [] });
    prefs = _buildPreferences(prefs, { paymentMethod: 'Dinheiro', items: [] });
    expect(prefs.favorite_payment).toBe('Pix');
    expect(prefs._payment_counts).toEqual({ Pix: 2, Dinheiro: 1 });
  });

  test('✅ Troca favorite_payment quando outro método ultrapassa', () => {
    const prefs = { _payment_counts: { Pix: 2, Dinheiro: 2 }, total_orders: 4 };
    const result = _buildPreferences(prefs, { paymentMethod: 'Dinheiro', items: [] });
    expect(result.favorite_payment).toBe('Dinheiro');
    expect(result._payment_counts.Dinheiro).toBe(3);
  });

  test('✅ Adiciona endereço novo com uses=1', () => {
    const result = _buildPreferences({}, { address: 'Rua X, 123', items: [] });
    expect(result.saved_addresses).toHaveLength(1);
    expect(result.saved_addresses[0]).toEqual({ address: 'Rua X, 123', uses: 1 });
    expect(result.last_address).toBe('Rua X, 123');
  });

  test('✅ Incrementa uses de endereço existente', () => {
    const prefs = { saved_addresses: [{ address: 'Rua X, 123', uses: 3 }] };
    const result = _buildPreferences(prefs, { address: 'Rua X, 123', items: [] });
    expect(result.saved_addresses[0].uses).toBe(4);
  });

  test('✅ Limita saved_addresses a 5 — remove o menos usado', () => {
    const prefs = { saved_addresses: [
      { address: 'R1', uses: 10 },
      { address: 'R2', uses: 8 },
      { address: 'R3', uses: 6 },
      { address: 'R4', uses: 4 },
      { address: 'R5', uses: 2 }
    ]};
    const result = _buildPreferences(prefs, { address: 'R6', items: [] });
    expect(result.saved_addresses).toHaveLength(5);
    // R6 tem uses=1, é o menos usado → removido pelo corte
    expect(result.saved_addresses.map(a => a.address)).not.toContain('R6');
  });

  test('✅ Atualiza top_items — marmita usa "Marmita {tamanho}"', () => {
    const orderData = {
      items: [
        { tipo: 'marmita', tamanho: 'Grande', price: 22 },
        { tipo: 'extra', name: 'Refrigerante Lata', price: 6 }
      ]
    };
    const result = _buildPreferences({}, orderData);
    expect(result.top_items).toHaveLength(2);
    expect(result.top_items[0]).toEqual({ name: 'Marmita Grande', tipo: 'marmita', count: 1 });
    expect(result.top_items[1]).toEqual({ name: 'Refrigerante Lata', tipo: 'extra', count: 1 });
  });

  test('✅ Incrementa count de top_items existentes', () => {
    const prefs = { top_items: [{ name: 'Marmita Grande', tipo: 'marmita', count: 5 }] };
    const result = _buildPreferences(prefs, {
      items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }]
    });
    expect(result.top_items[0].count).toBe(6);
  });

  test('✅ Limita top_items a 10', () => {
    const prefs = { top_items: Array.from({ length: 10 }, (_, i) => ({
      name: `Item${i}`, tipo: 'extra', count: 100 - i
    }))};
    const result = _buildPreferences(prefs, {
      items: [{ tipo: 'extra', name: 'ItemNovo', price: 5 }]
    });
    expect(result.top_items).toHaveLength(10);
    // ItemNovo tem count=1, menor que todos → cortado
    expect(result.top_items.find(t => t.name === 'ItemNovo')).toBeUndefined();
  });

  test('✅ Sem paymentMethod → não modifica pagamento', () => {
    const prefs = { favorite_payment: 'Pix', _payment_counts: { Pix: 3 } };
    const result = _buildPreferences(prefs, { items: [] });
    expect(result.favorite_payment).toBe('Pix');
    expect(result._payment_counts).toEqual({ Pix: 3 });
  });

  test('✅ Sem address → não modifica endereços', () => {
    const prefs = { saved_addresses: [{ address: 'Rua X', uses: 2 }] };
    const result = _buildPreferences(prefs, { items: [] });
    expect(result.saved_addresses).toEqual([{ address: 'Rua X', uses: 2 }]);
  });

  test('✅ Sem items → não modifica top_items', () => {
    const prefs = { top_items: [{ name: 'Marmita Grande', tipo: 'marmita', count: 5 }] };
    const result = _buildPreferences(prefs, {});
    expect(result.top_items).toEqual([{ name: 'Marmita Grande', tipo: 'marmita', count: 5 }]);
  });

  test('✅ Não muta objeto original', () => {
    const original = { total_orders: 3, saved_addresses: [{ address: 'R1', uses: 1 }] };
    const clone = JSON.parse(JSON.stringify(original));
    _buildPreferences(original, { address: 'R2', items: [] });
    expect(original).toEqual(clone);
  });

  test('✅ Item açougue (corte) com campo produto — não quebra', () => {
    const result = _buildPreferences({}, {
      items: [{ tipo: 'carne', produto: 'Picanha', price: 67.5 }]
    });
    expect(result.top_items).toHaveLength(1);
    expect(result.top_items[0]).toEqual({ name: 'Picanha', tipo: 'carne', count: 1 });
  });

  test('✅ Item pizza com campo name — funciona normalmente', () => {
    const result = _buildPreferences({}, {
      items: [{ tipo: 'pizza', name: 'Pizza Grande Calabresa', price: 45 }]
    });
    expect(result.top_items[0]).toEqual({ name: 'Pizza Grande Calabresa', tipo: 'pizza', count: 1 });
  });

  test('✅ Item sem name/produto/tipo → fallback defensivo', () => {
    const result = _buildPreferences({}, {
      items: [{ price: 15 }]
    });
    expect(result.top_items).toHaveLength(1);
    expect(result.top_items[0].name).toBe('Item sem nome');
    expect(result.top_items[0].tipo).toBe('produto');
    expect(result.top_items[0].name).not.toBe('undefined');
  });
});

describe('invalidateCardapioCache', () => {
  const { cacheDel } = require('./stateManager');

  beforeEach(() => {
    cacheDel.mockClear();
  });

  test('✅ Chama cacheDel com chave correta', async () => {
    await invalidateCardapioCache('company_123');
    expect(cacheDel).toHaveBeenCalledWith('cardapio:company_123');
  });

  test('✅ Funciona para diferentes companyIds', async () => {
    await invalidateCardapioCache('abc');
    await invalidateCardapioCache('xyz');
    expect(cacheDel).toHaveBeenCalledTimes(2);
    expect(cacheDel).toHaveBeenCalledWith('cardapio:abc');
    expect(cacheDel).toHaveBeenCalledWith('cardapio:xyz');
  });
});
