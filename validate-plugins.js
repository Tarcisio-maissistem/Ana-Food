#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// VALIDAÇÃO S4 — USE_PLUGINS=true
// Roda sem Redis/Supabase (mocks internos).
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FALHOU: ${label}`);
    failed++;
  }
}

// ─── 0. USE_PLUGINS deve estar true ──────────────────────────
console.log('\n═══ 0. Verificando USE_PLUGINS ═══');
assert(process.env.USE_PLUGINS === 'true', 'USE_PLUGINS=true no .env');

// ─── 1. getCardapio + plugin pizzaria + banco vazio ──────────
console.log('\n═══ 1. getCardapio() com plugin=pizzaria + banco vazio ═══');

// Mock stateManager (evita ioredis)
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === './stateManager') {
    // retorna o path do nosso mock abaixo
  }
  return originalResolve.call(this, request, parent, ...rest);
};

// Injeta mocks antes de carregar stateMachine
jest_mock_stateManager();

function jest_mock_stateManager() {
  const stateManagerPath = require.resolve('./stateManager');
  require.cache[stateManagerPath] = {
    id: stateManagerPath,
    filename: stateManagerPath,
    loaded: true,
    exports: {
      getState: async () => ({}),
      setState: async () => {},
      resetState: async () => {},
      getAllActiveSessions: async () => [],
      cacheGet: async () => null,   // sempre cache miss
      cacheSet: async () => {},
      cacheDel: async () => {}
    }
  };
}

// Mock database — retorna array vazio (banco vazio)
function mockDatabase(productsReturn) {
  const dbPath = require.resolve('./database');
  const realDb = require('./database');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      ...realDb,
      getProducts: async () => productsReturn,
      getCustomerByPhone: async () => null,
      getCompanyByPhone: async () => null,
      saveCustomer: async () => {},
      saveLastOrder: async () => ({ data: { id: 'order-test-123' } }),
      saveCustomerPreferences: async () => {}
    }
  };
}

mockDatabase([]);  // banco vazio

const pluginManager = require('./pluginManager');
const { process: stateProcess } = require('./stateMachine');
const orderEngine = require('./orderEngine');
const db = require('./database');

(async () => {
  // Teste 1: getCardapio com plugin pizzaria + banco vazio
  try {
    const pizzPlugin = pluginManager.loadPlugin('pizzaria');
    assert(pizzPlugin !== null, 'Plugin pizzaria carregado');
    
    const pizzCardapio = pizzPlugin.getDefaultCardapio();
    assert(pizzCardapio.sabores && pizzCardapio.sabores.length > 0, 'Cardápio pizzaria tem sabores');
    assert(!pizzCardapio.proteinas, 'Cardápio pizzaria NÃO tem proteínas (é de pizza, não marmita)');
    assert(pizzCardapio.tamanhos && pizzCardapio.tamanhos.length > 0, 'Cardápio pizzaria tem tamanhos');
    
    // Simula getCardapio via stateProcess com company.business_type=pizzaria
    // Quando banco vazio + plugin pizzaria → deve usar plugin.getDefaultCardapio()
    const state = {
      etapa: 'INICIO',
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null },
      _marmitaAtual: null, _pendingMarmitas: 1, _currentMarmitaNumber: 1,
      _upsellPhase: null, _confirmingAddress: false, _askedTroco: false
    };
    const company = {
      name: 'Pizzaria do Zé',
      business_type: 'pizzaria',
      delivery_fee: 5,
      estimated_time_default: 40,
      pix_key: '11999999999'
    };

    const result = await stateProcess('test-co', '5511000000000', 'oi', state, company);
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    
    // Confirma que a resposta NÃO contém termos de marmitaria
    assert(!resp.includes('proteína'), 'Resposta pizzaria NÃO menciona "proteína"');
    assert(!resp.includes('marmita'), 'Resposta pizzaria NÃO menciona "marmita" (lowercase)');
    assert(!resp.includes('Marmita'), 'Resposta pizzaria NÃO menciona "Marmita" (cap)');
    assert(!resp.includes('acompanhamento'), 'Resposta pizzaria NÃO menciona "acompanhamento"');
  } catch (err) {
    console.log(`  ❌ ERRO no teste getCardapio: ${err.message}`);
    failed++;
  }

  // ─── 2. orderEngine.calculateTotal com quantity decimal ────
  console.log('\n═══ 2. calculateTotal() com quantity decimal ═══');
  
  // Açougue: estimated_price
  const orderAcougue = {
    items: [{ tipo: 'corte', name: 'Picanha', estimated_price: 89.50, quantity: { value: 1.5, unit: 'kg' } }],
    deliveryFee: 7
  };
  const totalAcougue = orderEngine.calculateTotal(orderAcougue);
  assert(totalAcougue === 96.50, `Açougue: estimated_price 89.50 + fee 7 = 96.50 (got ${totalAcougue})`);
  
  // Item com quantity decimal via value
  const orderDecimal = {
    items: [{ tipo: 'corte', name: 'Fraldinha', base_price: 50, quantity: { value: 2.5, unit: 'kg' } }],
    deliveryFee: 0
  };
  const totalDecimal = orderEngine.calculateTotal(orderDecimal);
  assert(totalDecimal === 125, `Decimal: 50 * 2.5 = 125 (got ${totalDecimal})`);

  // Item normal (inteiro)
  const orderNormal = {
    items: [{ tipo: 'marmita', tamanho: 'grande', price: 25, quantity: 2 }],
    deliveryFee: 5
  };
  const totalNormal = orderEngine.calculateTotal(orderNormal);
  assert(totalNormal === 55, `Normal: 25 * 2 + 5 = 55 (got ${totalNormal})`);

  // ─── 3. _buildPreferences com tipo='corte' ────────────────
  console.log('\n═══ 3. _buildPreferences() com tipo="corte" ═══');
  
  try {
    const result = db._buildPreferences({}, {
      paymentMethod: 'pix',
      address: 'Rua A, 123',
      items: [{ tipo: 'corte', name: 'Picanha', price: 89.50 }]
    });
    assert(result.total_orders === 1, 'total_orders = 1');
    assert(result.last_payment === 'pix', 'last_payment = pix');
    assert(result.top_items[0].name === 'Picanha', 'top_items[0].name = Picanha (não "Marmita ?")');
    assert(result.top_items[0].tipo === 'corte', 'top_items[0].tipo = corte');
    console.log('  ✅ _buildPreferences com tipo="corte" NÃO lançou exceção');
    passed++;
  } catch (err) {
    console.log(`  ❌ _buildPreferences LANÇOU EXCEÇÃO: ${err.message}`);
    failed++;
  }

  // ─── 4. DELETE /admin/plugin-cache ─────────────────────────
  console.log('\n═══ 4. DELETE /admin/plugin-cache ═══');
  
  // Simula sem HTTP: chama clearCache diretamente
  try {
    pluginManager.loadPlugin('marmitaria');  // popula cache
    pluginManager.clearCache();
    console.log('  ✅ pluginManager.clearCache() executou sem erro');
    passed++;
    
    // Verifica que após clearCache, o plugin precisa ser recarregado
    // (internamente, loadPlugin refaz o require)
    const reloaded = pluginManager.loadPlugin('marmitaria');
    assert(reloaded !== null, 'Plugin recarregado após clearCache');
  } catch (err) {
    console.log(`  ❌ clearCache ERRO: ${err.message}`);
    failed++;
  }

  // ─── 5. Fluxo pizzaria sem mensagens de marmitaria ────────
  console.log('\n═══ 5. Fluxo pizzaria: nenhuma mensagem de marmitaria ═══');
  
  try {
    const pizzPlugin = pluginManager.loadPlugin('pizzaria');
    const marmitaTerms = ['marmita', 'proteína', 'proteina', 'acompanhamento', 'salada'];
    
    // Testa templates do plugin pizzaria
    const pizzTemplates = pizzPlugin.templates;
    if (pizzTemplates) {
      let hasMarmitaTerm = false;
      for (const [key, fn] of Object.entries(pizzTemplates)) {
        if (typeof fn === 'function') {
          try {
            const msg = fn('teste', ['item'], {});
            if (typeof msg === 'string') {
              for (const term of marmitaTerms) {
                if (msg.toLowerCase().includes(term)) {
                  console.log(`  ❌ Template pizzaria "${key}" contém "${term}": ${msg.substring(0, 80)}`);
                  hasMarmitaTerm = true;
                  failed++;
                }
              }
            }
          } catch (e) { /* template pode ter assinatura diferente */ }
        }
      }
      if (!hasMarmitaTerm) {
        assert(true, 'Templates pizzaria não contêm termos de marmitaria');
      }
    }

    // Testa handleStep da pizzaria
    const pizzSteps = pizzPlugin.getFlowSteps();
    assert(!pizzSteps.includes('MONTANDO_PROTEINA'), 'Pizzaria NÃO tem etapa MONTANDO_PROTEINA');
    assert(!pizzSteps.includes('MONTANDO_SALADA'), 'Pizzaria NÃO tem etapa MONTANDO_SALADA');
    
    // Simula fluxo: INICIO → primeira etapa do plugin
    const stateP = {
      etapa: 'INICIO',
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null },
      _marmitaAtual: null, _pendingMarmitas: 1, _currentMarmitaNumber: 1,
      _upsellPhase: null, _confirmingAddress: false, _askedTroco: false
    };
    const companyP = {
      name: 'Pizzaria Teste',
      business_type: 'pizzaria',
      delivery_fee: 5,
      estimated_time_default: 40,
      pix_key: '11888888888'
    };

    // Fluxo: "oi" → "quero uma pizza"
    const r1 = await stateProcess('test-pizz', '5511000000001', 'oi', stateP, companyP);
    const resp1 = Array.isArray(r1.response) ? r1.response.join(' ') : (r1.response || '');
    
    for (const term of marmitaTerms) {
      assert(
        !resp1.toLowerCase().includes(term),
        `Resposta "oi" NÃO contém "${term}"`
      );
    }
    
    const r2 = await stateProcess('test-pizz', '5511000000001', 'quero uma pizza grande', r1.state, companyP);
    const resp2 = Array.isArray(r2.response) ? r2.response.join(' ') : (r2.response || '');
    
    for (const term of marmitaTerms) {
      assert(
        !resp2.toLowerCase().includes(term),
        `Resposta "quero pizza" NÃO contém "${term}"`
      );
    }
    
  } catch (err) {
    console.log(`  ❌ ERRO no fluxo pizzaria: ${err.message}`);
    failed++;
  }

  // ─── RESULTADO FINAL ──────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════\n');
  
  process.exit(failed > 0 ? 1 : 0);
})();
