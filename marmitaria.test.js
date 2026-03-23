// marmitaria.test.js
// ═══════════════════════════════════════════════════════════════
// Testes completos do plugin Marmitaria v2
// Contexto, Upsell, Validator, Templates, Handlers, Combos
// ═══════════════════════════════════════════════════════════════

const { DEFAULT_CARDAPIO, TAMANHOS, PROTEINAS, ACOMPANHAMENTOS, SALADAS, BEBIDAS, SOBREMESAS, COMBOS } = require('./plugins/marmitaria/cardapio');
const { detectarContexto, isSkipIntent } = require('./plugins/marmitaria/context');
const { calcularUpsellScore, selecionarMelhorBebida, deveOfereceUpsell, gerarMensagemUpsell } = require('./plugins/marmitaria/upsell');
const { validateItem, calculateItemPrice, formatItemForSummary } = require('./plugins/marmitaria/validator');
const tpl = require('./plugins/marmitaria/templates');
const plugin = require('./plugins/marmitaria');

// ═══════════════════════════════════════════════════════════════
// CARDÁPIO
// ═══════════════════════════════════════════════════════════════

describe('Cardápio marmitaria', () => {
  test('2 tamanhos com limites distintos', () => {
    expect(TAMANHOS.length).toBe(2);
    const peq = TAMANHOS.find(t => t.id === 'pequena');
    const gra = TAMANHOS.find(t => t.id === 'grande');
    expect(peq.max_proteinas).toBe(1);
    expect(gra.max_proteinas).toBe(2);
    expect(peq.price).toBe(20);
    expect(gra.price).toBe(22);
  });

  test('6 proteínas com apelidos', () => {
    expect(PROTEINAS.length).toBe(6);
    for (const p of PROTEINAS) {
      expect(p.name).toBeTruthy();
      expect(Array.isArray(p.apelidos)).toBe(true);
    }
  });

  test('5 acompanhamentos', () => {
    expect(ACOMPANHAMENTOS.length).toBe(5);
    const padroes = ACOMPANHAMENTOS.filter(a => a.padrao);
    expect(padroes.length).toBe(2); // Arroz e Feijão
  });

  test('5 saladas', () => {
    expect(SALADAS.length).toBe(5);
  });

  test('4 bebidas com scores', () => {
    expect(BEBIDAS.length).toBe(4);
    const suco = BEBIDAS.find(b => b.id === 'suco');
    expect(suco.score_almoco).toBe(0.9);
  });

  test('2 sobremesas', () => {
    expect(SOBREMESAS.length).toBe(2);
  });

  test('2 combos com triggers', () => {
    expect(COMBOS.length).toBe(2);
    for (const c of COMBOS) {
      expect(Array.isArray(c.triggers)).toBe(true);
      expect(c.triggers.length).toBeGreaterThan(0);
    }
  });

  test('DEFAULT_CARDAPIO tem compatibilidade upsellsBebida/upsellsSobremesa', () => {
    expect(DEFAULT_CARDAPIO.upsellsBebida).toBe(BEBIDAS);
    expect(DEFAULT_CARDAPIO.upsellsSobremesa).toBe(SOBREMESAS);
    expect(DEFAULT_CARDAPIO.proteinas).toBe(PROTEINAS);
    expect(DEFAULT_CARDAPIO.acompanhamentos).toBe(ACOMPANHAMENTOS);
  });
});

// ═══════════════════════════════════════════════════════════════
// CONTEXTO
// ═══════════════════════════════════════════════════════════════

describe('detectarContexto', () => {
  const emptyState = { _pendingMarmitas: 1 };

  test('detecta pressa', () => {
    expect(detectarContexto('preciso rápido por favor', emptyState).temPressa).toBe(true);
    expect(detectarContexto('quero uma grande', emptyState).temPressa).toBe(false);
  });

  test('detecta indecisão', () => {
    expect(detectarContexto('não sei o que pedir', emptyState).indeciso).toBe(true);
    expect(detectarContexto('o que você recomenda?', emptyState).indeciso).toBe(true);
    expect(detectarContexto('quero frango', emptyState).indeciso).toBe(false);
  });

  test('detecta repetir', () => {
    expect(detectarContexto('quero igual da última vez', emptyState).querRepetir).toBe(true);
    expect(detectarContexto('o de sempre', emptyState).querRepetir).toBe(true);
  });

  test('detecta pedido completo', () => {
    const ctx = detectarContexto(
      'quero grande com frango e arroz e feijão por favor',
      emptyState
    );
    expect(ctx.pedidoCompleto).toBe(true);
  });

  test('texto curto NÃO é pedido completo', () => {
    expect(detectarContexto('oi', emptyState).pedidoCompleto).toBe(false);
  });

  test('detecta múltiplas marmitas no state', () => {
    expect(detectarContexto('ok', { _pendingMarmitas: 3 }).multiplas).toBe(true);
  });

  test('detecta múltiplas no texto', () => {
    expect(detectarContexto('quero duas marmitas', emptyState).multiplas).toBe(true);
  });

  test('periodo é string válida', () => {
    const ctx = detectarContexto('oi', emptyState);
    expect(['almoco', 'jantar', 'outro']).toContain(ctx.periodo);
  });
});

describe('isSkipIntent', () => {
  test('detecta negações', () => {
    expect(isSkipIntent('não')).toBe(true);
    expect(isSkipIntent('nada')).toBe(true);
    expect(isSkipIntent('pula')).toBe(true);
    expect(isSkipIntent('sem')).toBe(true);
    expect(isSkipIntent('só isso')).toBe(true);
  });

  test('texto normal não é skip', () => {
    expect(isSkipIntent('frango')).toBe(false);
    expect(isSkipIntent('arroz e feijão')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// UPSELL
// ═══════════════════════════════════════════════════════════════

describe('Upsell engine', () => {
  test('calcularUpsellScore — almoço favorece suco', () => {
    const suco = BEBIDAS.find(b => b.id === 'suco');
    const refri = BEBIDAS.find(b => b.id === 'refri_lata');
    const scoreSuco = calcularUpsellScore(suco, { periodo: 'almoco' });
    const scoreRefri = calcularUpsellScore(refri, { periodo: 'almoco' });
    expect(scoreSuco).toBeGreaterThan(scoreRefri);
  });

  test('calcularUpsellScore — múltiplas favorece 2L', () => {
    const refri2l = BEBIDAS.find(b => b.id === 'refri_2l');
    expect(calcularUpsellScore(refri2l, { multiplas: true })).toBe(0.95);
  });

  test('selecionarMelhorBebida — retorna bebida rankeada', () => {
    const bebida = selecionarMelhorBebida({ periodo: 'almoco' }, []);
    expect(bebida).not.toBeNull();
    expect(bebida.name).toBeDefined();
  });

  test('selecionarMelhorBebida — null se já tem extra', () => {
    const items = [{ tipo: 'extra', name: 'Suco', price: 8 }];
    expect(selecionarMelhorBebida({ periodo: 'almoco' }, items)).toBeNull();
  });

  test('deveOfereceUpsell — false se pressa', () => {
    const state = { pedidoAtual: { items: [] } };
    expect(deveOfereceUpsell(state, { temPressa: true })).toBe(false);
  });

  test('deveOfereceUpsell — false se já tem bebida', () => {
    const state = { pedidoAtual: { items: [{ tipo: 'extra' }] } };
    expect(deveOfereceUpsell(state, { temPressa: false })).toBe(false);
  });

  test('deveOfereceUpsell — true se normal', () => {
    const state = { pedidoAtual: { items: [] } };
    expect(deveOfereceUpsell(state, { temPressa: false })).toBe(true);
  });

  test('gerarMensagemUpsell — varia por contexto', () => {
    const bebida = { name: 'Suco Natural', price: 8 };
    const msgAlmoco = gerarMensagemUpsell(bebida, { periodo: 'almoco' });
    const msgMultiplas = gerarMensagemUpsell(bebida, { multiplas: true });
    expect(msgAlmoco).toContain('Suco Natural');
    expect(msgMultiplas).toContain('acompanhar');
  });

  test('gerarMensagemUpsell — null se não tem bebida', () => {
    expect(gerarMensagemUpsell(null, {})).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATOR
// ═══════════════════════════════════════════════════════════════

describe('validateItem marmitaria', () => {
  test('marmita Grande válida com 2 proteínas', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Grande', price: 22,
      proteinas: [{ name: 'Frango Grelhado' }, { name: 'Churrasco' }],
      acompanhamentos: [{ name: 'Arroz' }],
      saladas: []
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(true);
  });

  test('marmita Pequena com 2 proteínas FALHA', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Pequena', price: 20,
      proteinas: [{ name: 'Frango Grelhado' }, { name: 'Churrasco' }],
      acompanhamentos: [], saladas: []
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.code === 'TOO_MANY_PROTEINAS')).toBe(true);
  });

  test('marmita sem proteína FALHA', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Grande', price: 22,
      proteinas: [], acompanhamentos: [], saladas: []
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.code === 'NO_PROTEINAS')).toBe(true);
  });

  test('marmita Pequena com 2 saladas FALHA', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Pequena', price: 20,
      proteinas: [{ name: 'Frango Grelhado' }],
      acompanhamentos: [],
      saladas: [{ name: 'Alface' }, { name: 'Repolho' }]
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.code === 'TOO_MANY_SALADAS')).toBe(true);
  });

  test('tamanho inválido FALHA', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Enorme', price: 30,
      proteinas: [{ name: 'Frango Grelhado' }], acompanhamentos: [], saladas: []
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.code === 'INVALID_SIZE')).toBe(true);
  });

  test('proteína inexistente FALHA', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Grande', price: 22,
      proteinas: [{ name: 'Salmão Grelhado' }], acompanhamentos: [], saladas: []
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.code === 'INVALID_PROTEINA')).toBe(true);
  });

  test('item não-marmita passa', () => {
    const v = validateItem({ tipo: 'extra', name: 'Suco', price: 8 });
    expect(v.valid).toBe(true);
  });

  test('preço zero FALHA', () => {
    const v = validateItem({
      tipo: 'marmita', tamanho: 'Grande', price: 0,
      proteinas: [{ name: 'Frango Grelhado' }], acompanhamentos: [], saladas: []
    }, DEFAULT_CARDAPIO);
    expect(v.valid).toBe(false);
  });
});

describe('calculateItemPrice', () => {
  test('Grande = 22', () => {
    expect(calculateItemPrice({ tipo: 'marmita', tamanho: 'Grande' }, DEFAULT_CARDAPIO)).toBe(22);
  });

  test('Pequena = 20', () => {
    expect(calculateItemPrice({ tipo: 'marmita', tamanho: 'Pequena' }, DEFAULT_CARDAPIO)).toBe(20);
  });

  test('extra retorna price', () => {
    expect(calculateItemPrice({ tipo: 'extra', price: 8 })).toBe(8);
  });

  test('sem cardápio usa fallback', () => {
    expect(calculateItemPrice({ tipo: 'marmita', tamanho: 'Grande' })).toBe(22);
  });
});

describe('formatItemForSummary', () => {
  test('marmita com proteínas', () => {
    const txt = formatItemForSummary({
      tipo: 'marmita', tamanho: 'Grande', price: 22,
      proteinas: [{ name: 'Frango Grelhado' }],
      acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
      saladas: [{ name: 'Alface' }]
    });
    expect(txt).toContain('Grande');
    expect(txt).toContain('Frango');
    expect(txt).toContain('Arroz');
    expect(txt).toContain('Alface');
  });

  test('extra formatado', () => {
    const txt = formatItemForSummary({ tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 });
    expect(txt).toContain('Suco');
    expect(txt).toContain('8');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════

describe('Templates marmitaria', () => {
  test('saudacao contém preços', () => {
    const msg = tpl.saudacao('Marmitas da Boa');
    expect(msg).toContain('20');
    expect(msg).toContain('22');
  });

  test('saudacaoCliente contém nome', () => {
    const msg = tpl.saudacaoCliente('João', 'Marmitas');
    expect(msg).toContain('João');
  });

  test('tamanhoNaoEntendido com tamanhos do cardápio', () => {
    const msg = tpl.tamanhoNaoEntendido(TAMANHOS);
    expect(msg).toContain('Pequena');
    expect(msg).toContain('Grande');
    expect(msg).toContain('1 pessoa');
  });

  test('pedirProteina mostra limite por tamanho', () => {
    const peq = TAMANHOS.find(t => t.id === 'pequena');
    const msgPeq = tpl.pedirProteina(peq, 1);
    expect(msgPeq).not.toContain('escolha até'); // max=1, não precisa mostrar

    const gra = TAMANHOS.find(t => t.id === 'grande');
    const msgGra = tpl.pedirProteina(gra, 1);
    expect(msgGra).toContain('até 2');
  });

  test('pedirProteinaRapido é compacto', () => {
    const msg = tpl.pedirProteinaRapido();
    expect(msg.length).toBeLessThan(100);
    expect(msg).toContain('Frango');
  });

  test('pedirSalada menciona salada', () => {
    const msg = tpl.pedirSalada(DEFAULT_CARDAPIO);
    expect(msg).toContain('Salada');
    expect(msg).toContain('Alface');
  });

  test('proximaMarmita mostra progresso', () => {
    const msg = tpl.proximaMarmita(2, 3);
    expect(msg).toContain('2ª');
  });

  test('recomendarCombo mostra ingredientes', () => {
    const msg = tpl.recomendarCombo(COMBOS[0]);
    expect(msg).toContain('Combo Frango');
    expect(msg).toContain('Frango Grelhado');
    expect(msg).toContain('Arroz');
  });

  test('resumoFinalMarmita formata completo', () => {
    const txt = tpl.resumoFinalMarmita({
      tamanho: 'Grande', price: 22,
      proteinas: [{ name: 'Frango Grelhado' }],
      acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
      saladas: [{ name: 'Alface' }]
    });
    expect(txt).toContain('🍱');
    expect(txt).toContain('Frango');
    expect(txt).toContain('🥗');
  });

  test('resumoFinalMarmita null retorna vazio', () => {
    expect(tpl.resumoFinalMarmita(null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
// HANDLERS — handleStep
// ═══════════════════════════════════════════════════════════════

describe('handleStep', () => {
  function makeState() {
    return {
      etapa: 'MONTANDO_TAMANHO',
      pedidoAtual: { items: [] },
      _pendingMarmitas: 1,
      _currentMarmitaNumber: 1
    };
  }

  // --- TAMANHO ---

  test('TAMANHO — "grande" avança para proteína', () => {
    const state = makeState();
    const r = plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
    expect(state._marmitaAtual.tamanho).toBe('Grande');
    expect(state._marmitaAtual.price).toBe(22);
  });

  test('TAMANHO — "pequena" price 20', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'pequena', state, DEFAULT_CARDAPIO);
    expect(state._marmitaAtual.price).toBe(20);
    expect(state._tamanhoAtual.max_proteinas).toBe(1);
  });

  test('TAMANHO — "2 grande" qty=2', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', '2 grande', state, DEFAULT_CARDAPIO);
    expect(state._pendingMarmitas).toBe(2);
  });

  test('TAMANHO — texto inválido pede de novo', () => {
    const state = makeState();
    const r = plugin.handleStep('MONTANDO_TAMANHO', 'blablabla', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_TAMANHO');
    expect(r.response).toContain('Qual você prefere');
  });

  test('TAMANHO — apelido "p" funciona', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'p', state, DEFAULT_CARDAPIO);
    expect(state._marmitaAtual.tamanho).toBe('Pequena');
  });

  test('TAMANHO — apelido "g" funciona', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'g', state, DEFAULT_CARDAPIO);
    expect(state._marmitaAtual.tamanho).toBe('Grande');
  });

  // --- PROTEÍNA ---

  test('PROTEINA — "frango" seleciona', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    expect(state._marmitaAtual.proteinas.length).toBe(1);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('PROTEINA — "frango e churrasco" seleciona 2', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango e churrasco', state, DEFAULT_CARDAPIO);
    expect(state._marmitaAtual.proteinas.length).toBe(2);
  });

  test('PROTEINA — clipping por max: Pequena aceita máx 1', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'pequena', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango e churrasco', state, DEFAULT_CARDAPIO);
    expect(state._marmitaAtual.proteinas.length).toBe(1);
  });

  test('PROTEINA + ACOMP juntos finaliza marmita', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango com arroz e feijão', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items[0].proteinas.length).toBe(1);
    expect(state.pedidoAtual.items[0].acompanhamentos.length).toBe(2);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('PROTEINA — "não quero" pula para acompanhamento', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'não quero', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('PROTEINA — texto inválido mostra erro', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    const r = plugin.handleStep('MONTANDO_PROTEINA', 'xyz', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
  });

  // --- ACOMPANHAMENTO ---

  test('ACOMPANHAMENTO — "arroz e feijão" finaliza marmita', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'arroz e feijão', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items[0].acompanhamentos.length).toBe(2);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('ACOMPANHAMENTO — "sim" repete prompt', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    const r = plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'sim quero', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  // --- SALADA (OPCIONAL) ---

  test('ACOMPANHAMENTO + SALADA — "arroz alface" captura ambos', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'arroz e alface', state, DEFAULT_CARDAPIO);
    // Marmita finalizada, estado avançou
    expect(state._marmitaAtual).toBeNull();
    expect(state.pedidoAtual.items.length).toBe(1);
    expect(state.pedidoAtual.items[0].saladas.length).toBe(1);
  });

  test('ACOMPANHAMENTO — sem salada avança direto', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'arroz', state, DEFAULT_CARDAPIO);
    // Avançou direto sem salada
    expect(state._marmitaAtual).toBeNull();
    expect(state.pedidoAtual.items.length).toBe(1);
    expect(state.pedidoAtual.items[0].saladas.length).toBe(0);
  });

  test('ACOMPANHAMENTO — pular avança sem nada', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'pula', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items.length).toBe(1);
    expect(state.pedidoAtual.items[0].acompanhamentos.length).toBe(0);
  });

  // --- MÚLTIPLAS MARMITAS ---

  test('2 marmitas — pede tamanho da próxima após acomp', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', '2 grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    const r = plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'arroz', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_TAMANHO');
    expect(state._currentMarmitaNumber).toBe(2);
    expect(r.response).toContain('2ª');
  });

  // --- UPSELL ---

  test('UPSELL — "suco" adiciona extra', () => {
    const state = makeState();
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'arroz', state, DEFAULT_CARDAPIO);
    plugin.handleStep('MONTANDO_SALADA', 'não', state, DEFAULT_CARDAPIO);
    // Agora está em OFERECENDO_UPSELL
    state._upsellPhase = 'bebida';
    plugin.handleStep('OFERECENDO_UPSELL', 'suco', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('AGUARDANDO_TIPO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
    expect(extras[0].name).toContain('Suco');
  });

  test('UPSELL — "não" avança sem extra', () => {
    const state = makeState();
    state.etapa = 'OFERECENDO_UPSELL';
    state._upsellPhase = 'bebida';
    state.pedidoAtual = { items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: [] }] };
    plugin.handleStep('OFERECENDO_UPSELL', 'não', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('AGUARDANDO_TIPO');
    expect(state.pedidoAtual.items.filter(i => i.tipo === 'extra').length).toBe(0);
  });

  test('etapa desconhecida retorna null', () => {
    expect(plugin.handleStep('AGUARDANDO_TIPO', 'entrega', {}, {})).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// FAST TRACK
// ═══════════════════════════════════════════════════════════════

describe('buildFastTrackItem', () => {
  test('monta marmita válida', () => {
    const ft = { sucesso: true, tamanho: 'Grande', proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: ['Maionese'] };
    const item = plugin.buildFastTrackItem(ft, DEFAULT_CARDAPIO);
    expect(item).not.toBeNull();
    expect(item.tipo).toBe('marmita');
    expect(item.price).toBe(22);
    expect(item.proteinas[0].name).toBe('Frango Grelhado');
  });

  test('rejeita proteína inválida', () => {
    const ft = { sucesso: true, tamanho: 'Grande', proteinas: ['Salmão'] };
    const item = plugin.buildFastTrackItem(ft, DEFAULT_CARDAPIO);
    expect(item).toBeNull();
  });

  test('Pequena price 20', () => {
    const ft = { sucesso: true, tamanho: 'Pequena', proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: [] };
    const item = plugin.buildFastTrackItem(ft, DEFAULT_CARDAPIO);
    expect(item).not.toBeNull();
    expect(item.price).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════
// PLUGIN INTERFACE
// ═══════════════════════════════════════════════════════════════

describe('Plugin interface completa', () => {
  test('business_type = marmitaria', () => {
    expect(plugin.business_type).toBe('marmitaria');
  });

  test('getFlowSteps retorna etapas corretas', () => {
    const steps = plugin.getFlowSteps();
    expect(steps).toContain('MONTANDO_TAMANHO');
    expect(steps).toContain('MONTANDO_PROTEINA');
    expect(steps).toContain('MONTANDO_ACOMPANHAMENTO');
    expect(steps).toContain('MONTANDO_SALADA');
    expect(steps).toContain('OFERECENDO_UPSELL');
  });

  test('getDefaultCardapio tem todas as categorias', () => {
    const c = plugin.getDefaultCardapio();
    expect(c.tamanhos.length).toBe(2);
    expect(c.proteinas.length).toBe(6);
    expect(c.acompanhamentos.length).toBe(5);
    expect(c.saladas.length).toBe(5);
    expect(c.bebidas.length).toBe(4);
    expect(c.combos.length).toBe(2);
    expect(c.upsellsBebida).toBeDefined();
  });

  test('templates.saudacao é function', () => {
    expect(typeof plugin.templates.saudacao).toBe('function');
    const msg = plugin.templates.saudacao('Marmitas Fit');
    expect(msg).toBeTruthy();
  });

  test('templates.saudacaoCliente é function', () => {
    expect(typeof plugin.templates.saudacaoCliente).toBe('function');
  });

  test('validateItem é function', () => {
    expect(typeof plugin.validateItem).toBe('function');
  });

  test('calculateItemPrice é function', () => {
    expect(typeof plugin.calculateItemPrice).toBe('function');
  });

  test('formatItemForSummary é function', () => {
    expect(typeof plugin.formatItemForSummary).toBe('function');
  });

  test('buildFastTrackItem é function', () => {
    expect(typeof plugin.buildFastTrackItem).toBe('function');
  });

  test('handleStep é function', () => {
    expect(typeof plugin.handleStep).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════
// FLUXO COMPLETO — HAPPY PATH
// ═══════════════════════════════════════════════════════════════

describe('Fluxo completo happy path', () => {
  test('grande → frango → arroz e feijão → alface → upsell → tipo', () => {
    const state = {
      etapa: 'MONTANDO_TAMANHO',
      pedidoAtual: { items: [] },
      _pendingMarmitas: 1,
      _currentMarmitaNumber: 1
    };

    // 1. Tamanho
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');

    // 2. Proteína
    plugin.handleStep('MONTANDO_PROTEINA', 'frango', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');

    // 3. Acompanhamento + Salada (combinado)
    plugin.handleStep('MONTANDO_ACOMPANHAMENTO', 'arroz e feijão alface', state, DEFAULT_CARDAPIO);
    // Marmita finalizada, avança para upsell
    expect(state.pedidoAtual.items.length).toBe(1);
    const marmita = state.pedidoAtual.items[0];
    expect(marmita.tamanho).toBe('Grande');
    expect(marmita.proteinas[0].name).toContain('Frango');
    expect(marmita.acompanhamentos.length).toBe(2);
    expect(marmita.saladas.length).toBe(1);

    // 4. Upsell
    state._upsellPhase = 'bebida';
    plugin.handleStep('OFERECENDO_UPSELL', 'não', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('AGUARDANDO_TIPO');
  });

  test('fluxo rápido: proteína + acompanhamento juntos (6 msgs)', () => {
    const state = {
      etapa: 'MONTANDO_TAMANHO',
      pedidoAtual: { items: [] },
      _pendingMarmitas: 1,
      _currentMarmitaNumber: 1
    };

    // 1. Tamanho
    plugin.handleStep('MONTANDO_TAMANHO', 'grande', state, DEFAULT_CARDAPIO);

    // 2. Proteína + Acompanhamento juntos → finaliza direto
    plugin.handleStep('MONTANDO_PROTEINA', 'frango com arroz e feijão', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items[0].proteinas.length).toBe(1);
    expect(state.pedidoAtual.items[0].acompanhamentos.length).toBe(2);
    expect(state.pedidoAtual.items.length).toBe(1);
  });
});
