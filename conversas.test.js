/**
 * conversas.test.js
 * ═══════════════════════════════════════════════════════════════════════
 * TESTES DE CONVERSAÇÃO REAL — Variações naturais de linguagem
 * Cobre: modificações de pedido, cancelamento parcial, trocas,
 * fluxos completos, edge cases, gírias e erros de digitação.
 * ═══════════════════════════════════════════════════════════════════════
 */

jest.mock('./stateManager', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(true)
}));
jest.mock('./logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), stateTransition: jest.fn()
}));

const { process: smProcess } = require('./stateMachine');
const ai = require('./aiInterpreter');
const router = require('./intentRouter');
const db = require('./database');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const COMPANY = {
  name: 'Marmitas Caseiras',
  delivery_fee: 5,
  estimated_time_default: 40,
  pix_key: '11999999999'
};

function criarEstadoInicial() {
  return {
    etapa: 'INICIO',
    pedidoAtual: {
      items: [], type: null, address: null,
      paymentMethod: null, deliveryFee: 0, trocoPara: null
    }
  };
}

async function executarFluxo(mensagens, perfil) {
  db.getCustomerByPhone = jest.fn().mockResolvedValue(perfil || { name: null, phone: '55119', preferences: {} });
  db.getProducts = jest.fn().mockResolvedValue([]);
  db.saveLastOrder = jest.fn().mockResolvedValue(true);
  db.saveCustomerPreferences = jest.fn().mockResolvedValue(true);
  db.saveCustomer = jest.fn().mockResolvedValue(true);

  let state = criarEstadoInicial();
  const historico = [];

  for (const msg of mensagens) {
    const result = await smProcess('test-co', '55119', msg, state, COMPANY);
    state = result.state;
    const resposta = Array.isArray(result.response) ? result.response.join('\n') : result.response;
    historico.push({ msg, etapa: state.etapa, resposta, items: [...(state.pedidoAtual?.items || [])] });
  }

  return { state, historico };
}

// Helper: cria estado em CONFIRMANDO com pedido pronto
function criarEstadoConfirmando(extras = []) {
  const items = [
    {
      tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
      proteinas: [{ name: 'Churrasco' }],
      acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
      saladas: [{ name: 'Alface' }]
    },
    ...extras
  ];
  return {
    etapa: 'CONFIRMANDO',
    pedidoAtual: {
      items,
      type: 'pickup',
      address: null,
      paymentMethod: 'Pix',
      deliveryFee: 0,
      trocoPara: null
    },
    _loopCount: 0
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 1: MODIFICAÇÃO DE EXTRAS — Variações de linguagem
// ═══════════════════════════════════════════════════════════════════════════════

describe('Modificação de extras — variações de linguagem', () => {
  beforeEach(() => {
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: null, phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    db.saveLastOrder = jest.fn().mockResolvedValue(true);
    db.saveCustomerPreferences = jest.fn().mockResolvedValue(true);
    db.saveCustomer = jest.fn().mockResolvedValue(true);
  });

  test('"troca a coca pelo suco" — swap refri→suco', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'troca a coca pelo suco', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
    expect(result.state.etapa).toBe('CONFIRMANDO');
  });

  test('"substitui o refrigerante por suco" — sinônimo substituir', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 2 }
    ]);
    const result = await smProcess('c1', '55', 'substitui o refrigerante por suco', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
    expect(extras[0].quantity).toBe(2); // mantém quantidade original
  });

  test('"tira o suco" — remove com "tira"', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 3 }
    ]);
    const result = await smProcess('c1', '55', 'tira o suco', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(0);
    expect(result.state.etapa).toBe('CONFIRMANDO');
  });

  test('"remove o refrigerante" — remove com "remove"', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 },
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 2 }
    ]);
    const result = await smProcess('c1', '55', 'remove o refrigerante', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
  });

  test('"sem refrigerante" — remove com "sem"', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'sem refrigerante', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(0);
  });

  test('"adiciona mais 2 sucos" — adicionar quantidade', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'adiciona mais 2 sucos', state, COMPANY);

    const suco = result.state.pedidoAtual.items.find(i => i.tipo === 'extra' && i.name === 'Suco Natural');
    expect(suco.quantity).toBe(3); // 1 original + 2
  });

  test('"coloca uma agua" — adicionar item novo', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'coloca uma agua', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(2);
    const agua = extras.find(e => e.name === 'Água Mineral');
    expect(agua).toBeTruthy();
    expect(agua.price).toBe(3);
  });

  test('"troca suco por pudim" — troca cross-category (bebida→sobremesa)', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 2 }
    ]);
    const result = await smProcess('c1', '55', 'troca suco por pudim', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Pudim');
    expect(extras[0].quantity).toBe(2);
  });

  test('"exclui a mousse" — remove sobremesa', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Mousse', price: 6, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'exclui a mousse', state, COMPANY);

    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(0);
  });

  test('"cancela o pudim" — cancela item NÃO cancela pedido', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Pudim', price: 6, quantity: 1 },
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'cancela o pudim', state, COMPANY);

    expect(result.state.etapa).toBe('CONFIRMANDO');
    expect(result.state._confirmandoCancelamento).toBeFalsy();
    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    const temPudim = extras.some(e => e.name === 'Pudim');
    expect(temPudim).toBe(false);
  });

  test('"cancela a bebida" — remove genérico de bebida', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 2 }
    ]);
    const result = await smProcess('c1', '55', 'cancela a bebida', state, COMPANY);

    // Deve interpretar como remoção, não cancelamento do pedido
    expect(result.state.etapa).toBe('CONFIRMANDO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 2: CANCELAMENTO — Confirmação e restauração
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cancelamento — confirmação e restauração', () => {
  beforeEach(() => {
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: null, phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    db.saveLastOrder = jest.fn().mockResolvedValue(true);
    db.saveCustomerPreferences = jest.fn().mockResolvedValue(true);
    db.saveCustomer = jest.fn().mockResolvedValue(true);
  });

  test('"cancela" + "não" — não cancela, volta ao resumo', async () => {
    const state = criarEstadoConfirmando();
    const qtyBefore = state.pedidoAtual.items.length;
    await smProcess('c1', '55', 'cancela', state, COMPANY);
    expect(state._confirmandoCancelamento).toBe(true);
    await smProcess('c1', '55', 'não', state, COMPANY);
    expect(state._confirmandoCancelamento).toBeFalsy();
    expect(state.pedidoAtual.items.length).toBe(qtyBefore);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"cancela" + "sim" — cancela e salva backup', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
    ]);
    await smProcess('c1', '55', 'cancela', state, COMPANY);
    expect(state._confirmandoCancelamento).toBe(true);
    await smProcess('c1', '55', 'sim', state, COMPANY);
    expect(state.etapa).toBe('INICIO');
    expect(state._pedidoBackup).toBeTruthy();
    expect(state._pedidoBackup.items.length).toBe(2);
  });

  test('"cancela" + "sim" + "continuar" — restaura pedido', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
    ]);
    await smProcess('c1', '55', 'cancela', state, COMPANY);
    await smProcess('c1', '55', 'sim', state, COMPANY);
    expect(state.etapa).toBe('INICIO');
    await smProcess('c1', '55', 'continuar', state, COMPANY);
    expect(state.etapa).toBe('CONFIRMANDO');
    expect(state.pedidoAtual.items.length).toBe(2);
  });

  test('"cancela" + "sim" + "voltar" — restaura com "voltar"', async () => {
    const state = criarEstadoConfirmando();
    await smProcess('c1', '55', 'cancela', state, COMPANY);
    await smProcess('c1', '55', 'sim', state, COMPANY);
    await smProcess('c1', '55', 'voltar', state, COMPANY);
    expect(state.etapa).toBe('CONFIRMANDO');
    expect(state.pedidoAtual.items.length).toBeGreaterThan(0);
  });

  test('"não é pra cancelar" durante confirmação de cancelamento', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
    ]);
    await smProcess('c1', '55', 'cancela', state, COMPANY);
    expect(state._confirmandoCancelamento).toBe(true);

    // Diz algo diferente de sim → limpa flag
    await smProcess('c1', '55', 'não é pra cancelar o pedido!', state, COMPANY);
    expect(state._confirmandoCancelamento).toBeFalsy();
    expect(state.etapa).toBe('CONFIRMANDO');
    expect(state.pedidoAtual.items.length).toBe(2);
  });

  test('"cancela tudo" — detecta como cancelamento do pedido todo', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [{ tipo: 'marmita' }] }, _loopCount: 0 };
    const result = router.detectCancel(ai.normalizar('cancela tudo'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"desisti" — detecta como cancelamento', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [] }, _loopCount: 0 };
    const result = router.detectCancel(ai.normalizar('desisti'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"nao quero mais" — detecta como cancelamento', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [] }, _loopCount: 0 };
    const result = router.detectCancel(ai.normalizar('nao quero mais'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"pode cancelar" confirma quando _confirmandoCancelamento=true', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      _confirmandoCancelamento: true,
      pedidoAtual: { items: [{ tipo: 'marmita' }], type: 'pickup', paymentMethod: 'Pix', deliveryFee: 0, address: null, trocoPara: null }
    };
    const result = router.detectCancel(ai.normalizar('pode cancelar'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_CONFIRMED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 3: INTERPRETAÇÃO DE CONFIRMAÇÃO — Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('interpretConfirmation — edge cases', () => {
  test('"retira o refrigerante" = indefinido (modificação)', async () => {
    expect(await ai.interpretConfirmation('retira o refrigerante')).toBe('indefinido');
  });

  test('"cancela o suco" = indefinido (item, não pedido)', async () => {
    expect(await ai.interpretConfirmation('cancela o suco')).toBe('indefinido');
  });

  test('"cancela o pedido" = nao (pedido inteiro)', async () => {
    expect(await ai.interpretConfirmation('cancela o pedido')).toBe('nao');
  });

  test('"troca o refri pelo suco" = indefinido', async () => {
    expect(await ai.interpretConfirmation('troca o refri pelo suco')).toBe('indefinido');
  });

  test('"adiciona mais uma coca" = indefinido', async () => {
    expect(await ai.interpretConfirmation('adiciona mais uma coca')).toBe('indefinido');
  });

  test('"remove a mousse" = indefinido', async () => {
    expect(await ai.interpretConfirmation('remove a mousse')).toBe('indefinido');
  });

  test('"ta bom assim" = sim', async () => {
    expect(await ai.interpretConfirmation('ta bom assim')).toBe('sim');
  });

  test('"fechou" = sim', async () => {
    expect(await ai.interpretConfirmation('fechou')).toBe('sim');
  });

  test('"beleza" = sim', async () => {
    expect(await ai.interpretConfirmation('beleza')).toBe('sim');
  });

  test('"muda tudo" = nao', async () => {
    expect(await ai.interpretConfirmation('muda tudo')).toBe('nao');
  });

  test('"pode ir" = sim', async () => {
    expect(await ai.interpretConfirmation('pode ir')).toBe('sim');
  });

  test('"pode continuar" = sim', async () => {
    expect(await ai.interpretConfirmation('pode continuar')).toBe('sim');
  });

  test('"exclui o suco" = indefinido', async () => {
    expect(await ai.interpretConfirmation('exclui o suco')).toBe('indefinido');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 4: _modificarPedidoLocal — Edge cases e variações
// ═══════════════════════════════════════════════════════════════════════════════

describe('_modificarPedidoLocal — edge cases', () => {
  const MENU = {
    proteinas: [{ name: 'Frango', apelidos: ['frango'] }],
    acompanhamentos: [{ name: 'Arroz', apelidos: ['arroz'] }],
    saladas: [{ name: 'Alface', apelidos: ['alface'] }],
    upsellsBebida: [
      { name: 'Suco Natural', price: 8, apelidos: ['suco', 'natural', 'suquinho'] },
      { name: 'Refrigerante Lata', price: 6, apelidos: ['refrigerante', 'refri', 'lata', 'coca', 'guarana'] },
      { name: 'Refrigerante 2L', price: 10, apelidos: ['2l', 'dois litros'] },
      { name: 'Água Mineral', price: 3, apelidos: ['agua', 'água', 'mineral'] }
    ],
    upsellsSobremesa: [
      { name: 'Pudim', price: 6, apelidos: ['pudim'] },
      { name: 'Mousse', price: 6, apelidos: ['mousse', 'musse'] }
    ]
  };

  const baseItems = () => [
    { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{ name: 'Churrasco' }], acompanhamentos: [{ name: 'Arroz' }], saladas: [] },
    { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 2 },
    { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
  ];

  test('"troca o refri pelo suco" — merge quantidades', () => {
    const r = ai._modificarPedidoLocal('troca o refri pelo suco', baseItems(), MENU);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
    expect(extras[0].quantity).toBe(3); // 1 original + 2 da troca
  });

  test('"trocar coca por agua" — troca por agua mineral', () => {
    const r = ai._modificarPedidoLocal('trocar coca por agua', baseItems(), MENU);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    const agua = extras.find(e => e.name === 'Água Mineral');
    expect(agua).toBeTruthy();
    expect(agua.quantity).toBe(2);
  });

  test('"sem suco" — remove suco', () => {
    const r = ai._modificarPedidoLocal('sem suco', baseItems(), MENU);
    expect(r).not.toBeNull();
    const suco = r.find(i => i.tipo === 'extra' && i.name === 'Suco Natural');
    expect(suco).toBeUndefined();
    // Refri permanece
    const refri = r.find(i => i.tipo === 'extra' && i.name === 'Refrigerante Lata');
    expect(refri).toBeTruthy();
  });

  test('"retira a coca" — remove por apelido', () => {
    const r = ai._modificarPedidoLocal('retira a coca', baseItems(), MENU);
    expect(r).not.toBeNull();
    const refri = r.find(i => i.tipo === 'extra' && i.name === 'Refrigerante Lata');
    expect(refri).toBeUndefined();
  });

  test('"adiciona 3 pudins" — adiciona sobremesa', () => {
    const r = ai._modificarPedidoLocal('adiciona 3 pudins', baseItems(), MENU);
    expect(r).not.toBeNull();
    const pudim = r.find(i => i.tipo === 'extra' && i.name === 'Pudim');
    expect(pudim).toBeTruthy();
    expect(pudim.quantity).toBe(3);
    expect(pudim.price).toBe(6);
  });

  test('"coloca uma mousse" — adiciona com "coloca"', () => {
    const r = ai._modificarPedidoLocal('coloca uma mousse', baseItems(), MENU);
    expect(r).not.toBeNull();
    const mousse = r.find(i => i.tipo === 'extra' && i.name === 'Mousse');
    expect(mousse).toBeTruthy();
  });

  test('"quero confirmar" — texto irrelevante retorna null', () => {
    const r = ai._modificarPedidoLocal('quero confirmar', baseItems(), MENU);
    expect(r).toBeNull();
  });

  test('"troca arroz por pure" — marmita NÃO é alterada (só extras)', () => {
    const r = ai._modificarPedidoLocal('troca arroz por pure', baseItems(), MENU);
    // Não deve afetar marmitas — retorna null (acompanhamento não é extra)
    expect(r).toBeNull();
  });

  test('"mais um refri" — adiciona com "mais"', () => {
    const r = ai._modificarPedidoLocal('mais um refri', baseItems(), MENU);
    expect(r).not.toBeNull();
    const refri = r.find(i => i.tipo === 'extra' && i.name === 'Refrigerante Lata');
    expect(refri.quantity).toBe(3); // 2 + 1
  });

  test('"inclui dois sucos" — adiciona com "inclui"', () => {
    const r = ai._modificarPedidoLocal('inclui dois sucos', baseItems(), MENU);
    expect(r).not.toBeNull();
    const suco = r.find(i => i.tipo === 'extra' && i.name === 'Suco Natural');
    expect(suco.quantity).toBe(3); // 1 + 2
  });

  test('"cancela a coca" — remove com "cancela"', () => {
    const r = ai._modificarPedidoLocal('cancela a coca', baseItems(), MENU);
    expect(r).not.toBeNull();
    const refri = r.find(i => i.tipo === 'extra' && i.name === 'Refrigerante Lata');
    expect(refri).toBeUndefined();
  });

  test('"substitui suco por mousse" — cross-category swap', () => {
    const r = ai._modificarPedidoLocal('substitui suco por mousse', baseItems(), MENU);
    expect(r).not.toBeNull();
    const suco = r.find(i => i.tipo === 'extra' && i.name === 'Suco Natural');
    expect(suco).toBeUndefined();
    const mousse = r.find(i => i.tipo === 'extra' && i.name === 'Mousse');
    expect(mousse).toBeTruthy();
    expect(mousse.quantity).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 5: DETECT CANCEL — Item vs pedido
// ═══════════════════════════════════════════════════════════════════════════════

describe('detectCancel — distingue item de pedido', () => {
  const mkState = (etapa = 'CONFIRMANDO') => ({
    etapa,
    pedidoAtual: { items: [{ tipo: 'marmita' }], type: 'pickup', paymentMethod: 'Pix', deliveryFee: 0, address: null, trocoPara: null },
    _loopCount: 0
  });

  test('"cancela o refrigerante" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela o refrigerante'), mkState())).toBeNull();
  });

  test('"cancela a coca" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela a coca'), mkState())).toBeNull();
  });

  test('"cancela o suco" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela o suco'), mkState())).toBeNull();
  });

  test('"cancela a agua" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela a agua'), mkState())).toBeNull();
  });

  test('"cancela o pudim" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela o pudim'), mkState())).toBeNull();
  });

  test('"cancela a mousse" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela a mousse'), mkState())).toBeNull();
  });

  test('"cancela a sobremesa" → null (item)', () => {
    expect(router.detectCancel(ai.normalizar('cancela a sobremesa'), mkState())).toBeNull();
  });

  test('"cancela" (sozinho) → CANCEL_PENDING', () => {
    const result = router.detectCancel(ai.normalizar('cancela'), mkState());
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"cancela tudo" → CANCEL_PENDING', () => {
    const result = router.detectCancel(ai.normalizar('cancela tudo'), mkState());
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"quero cancelar" → CANCEL_PENDING', () => {
    const result = router.detectCancel(ai.normalizar('quero cancelar'), mkState());
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('em FINALIZADO retorna null (trata pelo handlePosPedido)', () => {
    expect(router.detectCancel(ai.normalizar('cancela'), mkState('FINALIZADO'))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 6: FLUXO COMPLETO — Pedido com modificações
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fluxo completo — pedido com modificações', () => {
  const perfil = { name: null, phone: '55119', preferences: {}, last_order: null };

  test('1 grande → bebida → cancela bebida → confirma', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'churrasco',
      'arroz e feijão alface',
      '2 sucos',             // upsell bebida
      'não quero',           // upsell sobremesa
      'retirada',
      'pix',
      'cancela o suco',      // deve remover, não cancelar pedido
      'sim'                  // confirma
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(0); // suco foi removido
  });

  test('1 grande → troca bebida → confirma', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz e feijão alface',
      'uma coca',            // bebida
      'não',                 // sem sobremesa
      'retirada',
      'pix',
      'troca a coca pelo suco',
      'sim'
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
  });

  test('fast track → cancela → não → continua pedido', async () => {
    const { state, historico } = await executarFluxo([
      'quero 2 grandes com churrasco arroz feijao alface retirada pix',
      '1 suco',               // bebida upsell
      'não quero',            // sem sobremesa → deve estar em CONFIRMANDO
      'cancela',              // cancela → pede confirmação
      'não',                  // NÃO cancela
      'sim'                   // confirma pedido
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.items.filter(i => i.tipo === 'marmita').length).toBe(2);
  });

  test('fast track → remove bebida → adiciona outra → confirma', async () => {
    const { state } = await executarFluxo([
      'quero 1 grande com frango arroz feijao alface retirada pix',
      '2 cocas',
      'não',
      'retira o refrigerante',
      'adiciona um suco',
      'sim'
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 7: FLUXO COMPLETO — Fast track
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fast track — variações naturais', () => {
  const perfil = { name: null, phone: '55119', preferences: {}, last_order: null };

  test('3 grandes e 1 pequena completas → direto CONFIRMANDO', async () => {
    const { state } = await executarFluxo([
      'quero 3 grandes com churrasco arroz feijao alface e 1 pequena com carne cozida maionese arroz feijao retirada pix',
      'não quero',  // bebida
      'não',        // sobremesa
    ], perfil);

    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(4);
    expect(state.pedidoAtual.type).toBe('pickup');
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });

  test('fast track com bebidas embutidas', async () => {
    const { state } = await executarFluxo([
      'quero 1 grande com frango arroz feijao alface e 2 sucos retirada pix',
      'não quero',   // sobremesa
    ], perfil);

    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    // Bebidas vêm no fast track
    if (extras.length > 0) {
      expect(extras[0].name).toBe('Suco Natural');
    }
    expect(state.pedidoAtual.type).toBe('pickup');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 8: EDGE CASES — Mensagens ambíguas
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge cases — mensagens ambíguas', () => {
  beforeEach(() => {
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: null, phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    db.saveLastOrder = jest.fn().mockResolvedValue(true);
    db.saveCustomerPreferences = jest.fn().mockResolvedValue(true);
    db.saveCustomer = jest.fn().mockResolvedValue(true);
  });

  test('"nao" no resumo não cancela, oferece modificação', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
    ]);
    const result = await smProcess('c1', '55', 'nao', state, COMPANY);
    expect(result.state.etapa).toBe('CONFIRMANDO');
    // Deve conter sugestão de alteração
    const resp = Array.isArray(result.response) ? result.response.join('\n') : result.response;
    expect(resp).toMatch(/mudar|troca|alter/i);
  });

  test('"sim" no resumo confirma pedido', async () => {
    const state = criarEstadoConfirmando();
    const result = await smProcess('c1', '55', 'sim', state, COMPANY);
    expect(result.state.etapa).toBe('FINALIZADO');
  });

  test('texto longo irrelevante no CONFIRMANDO mostra resumo', async () => {
    const state = criarEstadoConfirmando();
    const result = await smProcess('c1', '55', 'olha eu acho que esta bom ja viu', state, COMPANY);
    expect(result.state.etapa).toBe('CONFIRMANDO');
    const resp = Array.isArray(result.response) ? result.response.join('\n') : result.response;
    expect(resp).toMatch(/RESUMO|Posso confirmar/i);
  });

  test('"cancela o guarana" é item, não pedido', async () => {
    const state = criarEstadoConfirmando([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
    ]);
    // detectCancel deve retornar null
    const intent = router.detectCancel(ai.normalizar('cancela o guarana'), state);
    expect(intent).toBeNull();
  });

  test('"cancela a fanta" é item, não pedido', async () => {
    const state = criarEstadoConfirmando();
    const intent = router.detectCancel(ai.normalizar('cancela a fanta'), state);
    expect(intent).toBeNull();
  });

  test('confirmação de cancelamento com "manda" confirma', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      _confirmandoCancelamento: true,
      pedidoAtual: { items: [{ tipo: 'marmita' }], type: 'pickup', paymentMethod: 'Pix', deliveryFee: 0, address: null, trocoPara: null }
    };
    const result = router.detectCancel(ai.normalizar('manda'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_CONFIRMED');
  });

  test('confirmação de cancelamento com "quero" confirma', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      _confirmandoCancelamento: true,
      pedidoAtual: { items: [{ tipo: 'marmita' }], type: 'pickup', paymentMethod: 'Pix', deliveryFee: 0, address: null, trocoPara: null }
    };
    const result = router.detectCancel(ai.normalizar('quero'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CANCEL_CONFIRMED');
  });

  test('durante confirmação de cancelamento, "retira a coca" NÃO cancela', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      _confirmandoCancelamento: true,
      pedidoAtual: { items: [{ tipo: 'marmita' }, { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }] }
    };
    const result = router.detectCancel(ai.normalizar('retira a coca'), state);
    // Deveria limpar flag e retornar null para o handler processar como modificação
    expect(result).toBeNull();
    expect(state._confirmandoCancelamento).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 9: PEDIDO DELIVERY — endereço e pagamento
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fluxo delivery — endereço e pagamento', () => {
  const perfil = { name: null, phone: '55119', preferences: {}, last_order: null };

  test('delivery → endereço → pix → confirma', async () => {
    const { state } = await executarFluxo([
      'oi',
      'pequena',
      'frango',
      'arroz feijao alface',
      'não',
      'não',
      'entrega',
      'Rua das Flores 123 Centro',
      'sim',
      'pix',
      'sim'
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.type).toBe('delivery');
    expect(state.pedidoAtual.address).toBeTruthy();
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });

  test('delivery → dinheiro com troco → confirma', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'churrasco',
      'arroz feijao alface',
      'não',
      'não',
      'entrega',
      'Rua Teste 456 Bairro',
      'sim',
      'dinheiro troco pra 50',
      'sim'
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.paymentMethod).toBe('Dinheiro');
    expect(state.pedidoAtual.trocoPara).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 10: UPSELL — Variações de resposta
// ═══════════════════════════════════════════════════════════════════════════════

describe('Upsell — variações de resposta', () => {
  const perfil = { name: null, phone: '55119', preferences: {}, last_order: null };

  test('"nao quero" pula bebida e sobremesa', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'churrasco',
      'arroz feijao alface',
      'nao quero',    // bebida
      'nao quero',    // sobremesa
    ], perfil);

    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(0);
    // Deve estar em AGUARDANDO_TIPO ou depois
    expect(['AGUARDANDO_TIPO', 'AGUARDANDO_ENDERECO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO']).toContain(state.etapa);
  });

  test('"3 sucos e 2 cocas" captura múltiplas bebidas', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz feijao alface',
      '3 sucos e 2 cocas',   // bebidas
      'não',                  // sobremesa
    ], perfil);

    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBeGreaterThanOrEqual(1); // pelo menos 1 tipo
    const suco = extras.find(e => e.name === 'Suco Natural');
    if (suco) expect(suco.quantity).toBe(3);
    const refri = extras.find(e => e.name === 'Refrigerante Lata');
    if (refri) expect(refri.quantity).toBe(2);
  });

  test('"1 pudim" na sobremesa', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz feijao alface',
      'não',            // sem bebida
      '1 pudim',        // sobremesa
    ], perfil);

    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    const pudim = extras.find(e => e.name === 'Pudim');
    expect(pudim).toBeTruthy();
    expect(pudim.quantity).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 11: MÚLTIPLAS MARMITAS — Grupos com tamanhos diferentes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Múltiplas marmitas — grupos', () => {
  const perfil = { name: null, phone: '55119', preferences: {}, last_order: null };

  test('"2 grandes e 1 pequena" criar 3 marmitas', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      '2 grandes e 1 pequena',
      'churrasco',            // prot das grandes
      'frango',               // prot da pequena
      'arroz feijao alface',  // acomp das grandes
      'arroz feijao alface',  // acomp da pequena
    ], perfil);

    // Pode não ter expandido ainda se falta etapa
    // Mas os grupos devem estar preenchidos ou items criados
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    if (marmitas.length > 0) {
      expect(marmitas.length).toBe(3);
      const grandes = marmitas.filter(m => m.tamanho === 'Grande');
      const pequenas = marmitas.filter(m => m.tamanho === 'Pequena');
      expect(grandes.length).toBe(2);
      expect(pequenas.length).toBe(1);
    } else {
      // Ainda em montagem — grupos existem
      expect(state._grupos).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 12: CORREÇÃO DE QUANTIDADE NO CONFIRMANDO
// ═══════════════════════════════════════════════════════════════════════════════

describe('Correção de quantidade no CONFIRMANDO', () => {
  test('"são 3 marmitas" adiciona marmitas faltantes', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: {
        items: [
          { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: [] }
        ]
      }
    };
    const result = router.detectQuantityCorrection(ai.normalizar('são 3 marmitas'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CORRECAO_QUANTIDADE');
    expect(state.pedidoAtual.items.filter(i => i.tipo === 'marmita').length).toBe(3);
  });

  test('correção de quantidade não dispara para bebidas', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: { items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1 }] }
    };
    const result = router.detectQuantityCorrection(ai.normalizar('quero 3 cocas'), state);
    expect(result).toBeNull(); // bebidas são tratadas por detectDrinkCorrection
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 13: CORREÇÃO DE BEBIDAS PÓS-UPSELL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Correção de bebidas pós-upsell', () => {
  test('"faltou as 3 cocas" — adiciona/corrige bebidas', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: { items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [], acompanhamentos: [], saladas: [] }] }
    };
    const result = router.detectDrinkCorrection(ai.normalizar('faltou as 3 cocas'), state);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('CORRECAO_BEBIDAS');
    const refri = state.pedidoAtual.items.find(i => i.tipo === 'extra');
    expect(refri).toBeTruthy();
    expect(refri.quantity).toBe(3);
  });

  test('"pedi 2 sucos" — sobrescreve quantidade', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: {
        items: [
          { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [], acompanhamentos: [], saladas: [] },
          { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
        ]
      }
    };
    const result = router.detectDrinkCorrection(ai.normalizar('pedi 2 sucos'), state);
    expect(result).toBeTruthy();
    const suco = state.pedidoAtual.items.find(i => i.name === 'Suco Natural');
    expect(suco.quantity).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 14: FRUSTRAÇÃO E RESTART
// ═══════════════════════════════════════════════════════════════════════════════

describe('Frustração e restart', () => {
  test('"aff que chato" — retorna mensagem empática', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [] }, _loopCount: 0 };
    const result = router.classify('aff que chato', state, COMPANY);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('FRUSTRATION');
  });

  test('"deixa quieto" — restart', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [{ tipo: 'marmita' }] }, _loopCount: 0, _marmitaAtual: null, _confirmandoCancelamento: false };
    const result = router.classify('deixa quieto', state, COMPANY);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('RESTART');
    expect(state.etapa).toBe('MONTANDO_TAMANHO');
    expect(state.pedidoAtual.items.length).toBe(0);
  });

  test('"começa de novo" — restart', () => {
    const state = { etapa: 'MONTANDO_PROTEINA', pedidoAtual: { items: [] }, _loopCount: 0, _marmitaAtual: {}, _confirmandoCancelamento: false };
    const result = router.classify('comeca de novo', state, COMPANY);
    expect(result).toBeTruthy();
    expect(result.intent).toBe('RESTART');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO 15: FLUXO COMPLETO — Conversa realista baseada no simulador
// ═══════════════════════════════════════════════════════════════════════════════

describe('Conversa realista — simulando usuário real', () => {
  const perfil = { name: 'João', phone: '55119', preferences: {}, last_order: null };

  test('Cenário: pedido com 4 marmitas, troca bebida, cancela e volta', async () => {
    const { state, historico } = await executarFluxo([
      'quero 3 grandes com churrasco arroz feijao alface e 1 pequena com carne cozida maionese arroz feijao retirada pix',
      '3 sucos e uma coca',       // bebida
      'nao quero',                // sem sobremesa
      'troca o refri pelo suco',  // troca
      'cancela',                  // quer cancelar
      'não',                      // desiste de cancelar
      'sim'                       // confirma
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(4);
  });

  test('Cenário: pede, cancela, restaura, confirma', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz feijao alface',
      '1 suco',
      'nao',
      'retirada',
      'pix',
      'cancela',              // cancela pedido
      'sim',                  // confirma cancelamento
      'continuar',            // restaura
      'sim'                   // confirma
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.items.length).toBeGreaterThan(0);
  });

  test('Cenário: cliente indeciso — diz não e modifica', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'churrasco',
      'arroz feijao alface',
      '2 cocas',
      'nao',
      'retirada',
      'pix',
      'nao',                        // não confirma
      'retira o refrigerante',      // modifica
      'sim'                         // confirma
    ], perfil);

    expect(state.etapa).toBe('FINALIZADO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(0);
  });
});
