// plugins.test.js
// ═══════════════════════════════════════════════════════════════
// Testes do Plugin System — pluginManager + plugins individuais
// ═══════════════════════════════════════════════════════════════

const pluginManager = require('./pluginManager');

// ─── pluginManager ────────────────────────────────────────────

describe('pluginManager', () => {
  beforeEach(() => pluginManager.clearCache());

  test('✅ Carrega plugin marmitaria', () => {
    const plugin = pluginManager.loadPlugin('marmitaria');
    expect(plugin).not.toBeNull();
    expect(plugin.business_type).toBe('marmitaria');
  });

  test('✅ Carrega plugin pizzaria', () => {
    const plugin = pluginManager.loadPlugin('pizzaria');
    expect(plugin).not.toBeNull();
    expect(plugin.business_type).toBe('pizzaria');
  });

  test('✅ Carrega plugin acougue', () => {
    const plugin = pluginManager.loadPlugin('acougue');
    expect(plugin).not.toBeNull();
    expect(plugin.business_type).toBe('acougue');
  });

  test('✅ Carrega plugin lanchonete', () => {
    const plugin = pluginManager.loadPlugin('lanchonete');
    expect(plugin).not.toBeNull();
    expect(plugin.business_type).toBe('lanchonete');
  });

  test('❌ Plugin inexistente retorna null', () => {
    const plugin = pluginManager.loadPlugin('padaria');
    expect(plugin).toBeNull();
  });

  test('❌ null retorna null', () => {
    expect(pluginManager.loadPlugin(null)).toBeNull();
    expect(pluginManager.loadPlugin('')).toBeNull();
  });

  test('✅ Cache — segundo load não faz require', () => {
    const a = pluginManager.loadPlugin('marmitaria');
    const b = pluginManager.loadPlugin('marmitaria');
    expect(a).toBe(b); // Mesma referência
  });

  test('✅ clearCache limpa cache', () => {
    pluginManager.loadPlugin('marmitaria');
    pluginManager.clearCache();
    // Após limpar, carrega de novo (não vai ser mesma referência pois require tem cache do Node)
    const p = pluginManager.loadPlugin('marmitaria');
    expect(p).not.toBeNull();
  });

  test('✅ listAvailablePlugins retorna plugins existentes', () => {
    const list = pluginManager.listAvailablePlugins();
    expect(list).toContain('marmitaria');
    expect(list).toContain('pizzaria');
    expect(list).toContain('acougue');
    expect(list).toContain('lanchonete');
  });

  test('✅ Todos os plugins implementam interface obrigatória', () => {
    const types = ['marmitaria', 'pizzaria', 'acougue', 'lanchonete'];
    for (const type of types) {
      const plugin = pluginManager.loadPlugin(type);
      for (const method of pluginManager.REQUIRED_INTERFACE) {
        expect(plugin).toHaveProperty(method);
      }
    }
  });

  test('✅ getDefaultCardapio retorna cardápio do nicho correto (não marmitaria)', () => {
    const pizzaria = pluginManager.loadPlugin('pizzaria');
    const acougue = pluginManager.loadPlugin('acougue');
    const lanchonete = pluginManager.loadPlugin('lanchonete');

    // Pizzaria deve ter sabores como categoria principal
    const cPizza = pizzaria.getDefaultCardapio();
    expect(cPizza.sabores).toBeDefined();
    expect(cPizza.sabores.length).toBeGreaterThan(0);

    // Açougue deve ter cortes como categoria principal
    const cAcougue = acougue.getDefaultCardapio();
    expect(cAcougue.cortes).toBeDefined();
    expect(cAcougue.cortes.length).toBeGreaterThan(0);

    // Lanchonete deve ter lanches como categoria principal
    const cLanche = lanchonete.getDefaultCardapio();
    expect(cLanche.lanches).toBeDefined();
    expect(cLanche.lanches.length).toBeGreaterThan(0);
  });
});

// ─── Plugin Marmitaria ────────────────────────────────────────

describe('plugin marmitaria', () => {
  const plugin = require('./plugins/marmitaria');

  test('✅ getFlowSteps retorna etapas corretas', () => {
    const steps = plugin.getFlowSteps();
    expect(steps).toContain('MONTANDO_TAMANHO');
    expect(steps).toContain('MONTANDO_PROTEINA');
    expect(steps).toContain('MONTANDO_SALADA');
  });

  test('✅ getDefaultCardapio tem proteínas', () => {
    const c = plugin.getDefaultCardapio();
    expect(c.proteinas.length).toBeGreaterThan(0);
    expect(c.acompanhamentos.length).toBeGreaterThan(0);
  });

  test('✅ handleStep MONTANDO_TAMANHO — grande', () => {
    const state = { etapa: 'MONTANDO_TAMANHO', pedidoAtual: { items: [] } };
    const result = plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, plugin.getDefaultCardapio());
    expect(result.state.etapa).toBe('MONTANDO_PROTEINA');
    expect(result.state._marmitaAtual.tamanho).toBe('Grande');
  });

  test('✅ handleStep etapa desconhecida retorna null', () => {
    const result = plugin.handleStep('AGUARDANDO_TIPO', 'entrega', {}, {});
    expect(result).toBeNull();
  });

  test('✅ buildFastTrackItem monta marmita válida', () => {
    const ft = { sucesso: true, tamanho: 'Grande', proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: ['Maionese'] };
    const item = plugin.buildFastTrackItem(ft, plugin.getDefaultCardapio());
    expect(item).not.toBeNull();
    expect(item.tipo).toBe('marmita');
    expect(item.price).toBe(22);
  });

  test('❌ buildFastTrackItem rejeita itens inválidos', () => {
    const ft = { sucesso: true, tamanho: 'Grande', proteinas: ['Salmão'] };
    const item = plugin.buildFastTrackItem(ft, plugin.getDefaultCardapio());
    expect(item).toBeNull();
  });

  test('✅ validateItem — marmita válida', () => {
    const v = plugin.validateItem({ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{ name: 'Frango' }] });
    expect(v.valid).toBe(true);
  });

  test('❌ validateItem — marmita sem proteína', () => {
    const v = plugin.validateItem({ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [] });
    expect(v.valid).toBe(false);
  });

  test('✅ calculateItemPrice', () => {
    expect(plugin.calculateItemPrice({ tipo: 'marmita', tamanho: 'Grande' })).toBe(22);
    expect(plugin.calculateItemPrice({ tipo: 'marmita', tamanho: 'Pequena' })).toBe(20);
  });

  test('✅ formatItemForSummary contém tamanho', () => {
    const txt = plugin.formatItemForSummary({
      tipo: 'marmita', tamanho: 'Grande', price: 22,
      proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
    });
    expect(txt).toContain('Grande');
    expect(txt).toContain('Frango');
  });
});

// ─── Plugin Pizzaria ──────────────────────────────────────────

describe('plugin pizzaria', () => {
  const plugin = require('./plugins/pizzaria');

  test('✅ getFlowSteps', () => {
    const steps = plugin.getFlowSteps();
    expect(steps).toContain('MONTANDO_TAMANHO');
    expect(steps).toContain('MONTANDO_SABOR');
    expect(steps).toContain('MONTANDO_BORDA');
  });

  test('✅ getDefaultCardapio tem sabores', () => {
    const c = plugin.getDefaultCardapio();
    expect(c.sabores.length).toBeGreaterThan(0);
    expect(c.bordas.length).toBeGreaterThan(0);
  });

  test('✅ validateItem — pizza válida', () => {
    const v = plugin.validateItem({ tipo: 'pizza', tamanho: 'Grande', price: 50, sabores: [{ name: 'Calabresa' }] });
    expect(v.valid).toBe(true);
  });

  test('❌ validateItem — pizza sem sabor', () => {
    const v = plugin.validateItem({ tipo: 'pizza', tamanho: 'Grande', price: 50, sabores: [] });
    expect(v.valid).toBe(false);
  });

  test('✅ calculateItemPrice calcula com borda', () => {
    expect(plugin.calculateItemPrice({ tipo: 'pizza', tamanho: 'Grande', borda: { price: 8 } })).toBe(58);
  });

  test('✅ formatItemForSummary', () => {
    const txt = plugin.formatItemForSummary({
      tipo: 'pizza', tamanho: 'Grande', price: 50,
      sabores: [{ name: 'Calabresa' }], borda: { name: 'Catupiry', price: 8 }
    });
    expect(txt).toContain('Grande');
    expect(txt).toContain('Calabresa');
    expect(txt).toContain('Catupiry');
  });
});

// ─── Plugin Açougue ───────────────────────────────────────────

describe('plugin acougue', () => {
  const plugin = require('./plugins/acougue');

  test('✅ getFlowSteps', () => {
    const steps = plugin.getFlowSteps();
    expect(steps).toContain('MONTANDO_CORTE');
    expect(steps).toContain('PEDIDO_LIVRE_ACOUGUE');
    expect(steps).toContain('REVISANDO_PEDIDO_ACOUGUE');
  });

  test('✅ getDefaultCardapio tem cortes', () => {
    const c = plugin.getDefaultCardapio();
    expect(c.cortes.length).toBeGreaterThan(0);
    // 25 bovinos + 11 frango + 5 suíno = 41
    expect(c.cortes.length).toBe(41);
  });

  test('✅ validateItem — corte válido', () => {
    const v = plugin.validateItem({ tipo: 'corte', name: 'Picanha', quantity: { value: 2, unit: 'kg' }, estimated_price: 139.80 });
    expect(v.valid).toBe(true);
  });

  test('✅ validateItem — carne legado válida', () => {
    const v = plugin.validateItem({ tipo: 'carne', name: 'Picanha', peso: 2, price: 139.80 });
    expect(v.valid).toBe(true);
  });

  test('❌ validateItem — corte sem quantidade', () => {
    const v = plugin.validateItem({ tipo: 'corte', name: 'Picanha', quantity: { value: 0, unit: 'kg' }, estimated_price: 0 });
    expect(v.valid).toBe(false);
  });

  test('✅ calculateItemPrice calcula por kg (novo formato)', () => {
    expect(plugin.calculateItemPrice({
      tipo: 'corte', price_per_kg: 69.90, quantity: { value: 2, unit: 'kg', type: 'weight' }
    })).toBe(139.80);
  });

  test('✅ calculateItemPrice calcula por kg (legado)', () => {
    expect(plugin.calculateItemPrice({ tipo: 'carne', pricePerKg: 69.90, peso: 2 })).toBe(139.80);
  });

  test('✅ formatItemForSummary', () => {
    const txt = plugin.formatItemForSummary({
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 1.5, unit: 'kg', type: 'weight' },
      estimated_price: 104.85,
      preparation: { style: 'Fatiado' }
    });
    expect(txt).toContain('Picanha');
    expect(txt).toContain('1.5 kg');
    expect(txt).toContain('Fatiado');
  });
});

// ─── Plugin Lanchonete ────────────────────────────────────────

describe('plugin lanchonete', () => {
  const plugin = require('./plugins/lanchonete');

  test('✅ getFlowSteps', () => {
    const steps = plugin.getFlowSteps();
    expect(steps).toContain('MONTANDO_LANCHE');
    expect(steps).toContain('MONTANDO_ADICIONAIS');
  });

  test('✅ getDefaultCardapio tem lanches', () => {
    const c = plugin.getDefaultCardapio();
    expect(c.lanches.length).toBeGreaterThan(0);
    expect(c.adicionais.length).toBeGreaterThan(0);
  });

  test('✅ validateItem — lanche válido', () => {
    const v = plugin.validateItem({ tipo: 'lanche', name: 'X-Burger', price: 18 });
    expect(v.valid).toBe(true);
  });

  test('❌ validateItem — lanche sem nome', () => {
    const v = plugin.validateItem({ tipo: 'lanche', name: '', price: 18 });
    expect(v.valid).toBe(false);
  });

  test('✅ calculateItemPrice com adicionais', () => {
    const price = plugin.calculateItemPrice({
      tipo: 'lanche', price: 18, quantity: 2,
      adicionais: [{ price: 4 }, { price: 3 }]
    });
    expect(price).toBe(50); // (18 + 4 + 3) * 2
  });

  test('✅ formatItemForSummary', () => {
    const txt = plugin.formatItemForSummary({
      tipo: 'lanche', name: 'X-Bacon', price: 22, quantity: 1,
      adicionais: [{ name: 'Queijo Extra', price: 3 }]
    });
    expect(txt).toContain('X-Bacon');
    expect(txt).toContain('Queijo Extra');
  });
});
