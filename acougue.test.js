// acougue.test.js
// ═══════════════════════════════════════════════════════════════
// Testes completos do plugin Açougue v2
// Parser, Validator, Templates, Handlers
// ═══════════════════════════════════════════════════════════════

const {
  parseQuantity, matchCorte, matchPreparo,
  parsePackaging, splitItems, parseSingleItem,
  parseDeterministico, normalizeUnit
} = require('./plugins/acougue/parser');
const { DEFAULT_CARDAPIO, BOVINOS, FRANGO, SUINO, PREPAROS, UPSELLS, UNIT_MAP } = require('./plugins/acougue/cardapio');
const { corteExiste, unitReconhecida, validateItem, calculateItemPrice } = require('./plugins/acougue/validator');
const { formatQuantity, formatItemForSummary, resumoPedido, saudacao, saudacaoCliente } = require('./plugins/acougue/templates');
const plugin = require('./plugins/acougue');

// ═══════════════════════════════════════════════════════════════
// CARDAPIO
// ═══════════════════════════════════════════════════════════════

describe('Cardápio', () => {
  test('41 cortes no total (25 bovino + 11 frango + 5 suíno)', () => {
    expect(BOVINOS.length).toBe(25);
    expect(FRANGO.length).toBe(11);
    expect(SUINO.length).toBe(5);
    expect(DEFAULT_CARDAPIO.cortes.length).toBe(41);
  });

  test('todos os cortes possuem name, price, animal, apelidos', () => {
    for (const c of DEFAULT_CARDAPIO.cortes) {
      expect(c.name).toBeTruthy();
      expect(typeof c.price).toBe('number');
      expect(c.price).toBeGreaterThan(0);
      expect(['bovino', 'frango', 'suino']).toContain(c.animal);
      expect(Array.isArray(c.apelidos)).toBe(true);
    }
  });

  test('16 preparos com apelidos', () => {
    expect(PREPAROS.length).toBe(16);
    for (const p of PREPAROS) {
      expect(p.name).toBeTruthy();
      expect(Array.isArray(p.apelidos)).toBe(true);
    }
  });

  test('5 upsells com preço', () => {
    expect(UPSELLS.length).toBe(5);
    for (const u of UPSELLS) {
      expect(typeof u.price).toBe('number');
    }
  });

  test('UNIT_MAP normaliza unidades conhecidas', () => {
    expect(UNIT_MAP['kg']).toBe('kg');
    expect(UNIT_MAP['quilo']).toBe('kg');
    expect(UNIT_MAP['gramas']).toBe('g');
    expect(UNIT_MAP['reais']).toBe('BRL');
    expect(UNIT_MAP['pacote']).toBe('pct');
    expect(UNIT_MAP['unidade']).toBe('un');
    expect(UNIT_MAP['bandeja']).toBe('bnd');
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — parseQuantity
// ═══════════════════════════════════════════════════════════════

describe('parseQuantity', () => {
  test('meio kg', () => {
    const r = parseQuantity('meio kg');
    expect(r.value).toBe(0.5);
    expect(r.unit).toBe('kg');
    expect(r.type).toBe('weight');
  });

  test('meio quilo', () => {
    const r = parseQuantity('meio quilo');
    expect(r.value).toBe(0.5);
    expect(r.unit).toBe('kg');
  });

  test('1 e meio', () => {
    const r = parseQuantity('1 e meio kg');
    expect(r.value).toBe(1.5);
    expect(r.unit).toBe('kg');
  });

  test('2 e meio (sem unidade → assume kg)', () => {
    const r = parseQuantity('2 e meio de alcatra');
    expect(r.value).toBe(2.5);
    expect(r.unit).toBe('kg');
  });

  test('2 kg', () => {
    const r = parseQuantity('2 kg de patinho');
    expect(r.value).toBe(2);
    expect(r.unit).toBe('kg');
  });

  test('1.5 kg', () => {
    const r = parseQuantity('1.5 kg');
    expect(r.value).toBe(1.5);
    expect(r.unit).toBe('kg');
  });

  test('1,5 kg (vírgula)', () => {
    const r = parseQuantity('1,5 kg');
    expect(r.value).toBe(1.5);
  });

  test('500g → 0.5 kg', () => {
    const r = parseQuantity('500g de alcatra');
    expect(r.value).toBe(0.5);
    expect(r.unit).toBe('kg');
    expect(r.type).toBe('weight');
  });

  test('300 gramas → 0.3 kg', () => {
    const r = parseQuantity('300 gramas');
    expect(r.value).toBeCloseTo(0.3);
    expect(r.unit).toBe('kg');
  });

  test('R$ 50 reais', () => {
    const r = parseQuantity('R$ 50 de alcatra');
    expect(r.value).toBe(50);
    expect(r.unit).toBe('BRL');
    expect(r.type).toBe('value');
  });

  test('30 reais', () => {
    const r = parseQuantity('30 reais de patinho');
    expect(r.value).toBe(30);
    expect(r.unit).toBe('BRL');
  });

  test('2 pacotes', () => {
    const r = parseQuantity('2 pacotes');
    expect(r.value).toBe(2);
    expect(r.unit).toBe('pct');
    expect(r.type).toBe('package');
  });

  test('3 peças', () => {
    const r = parseQuantity('3 peças de costelinha');
    expect(r.value).toBe(3);
    expect(r.type).toBe('count');
  });

  test('número solto < 100 → assume kg', () => {
    const r = parseQuantity('2');
    expect(r.value).toBe(2);
    expect(r.unit).toBe('kg');
  });

  test('número solto >= 100 → assume gramas', () => {
    const r = parseQuantity('500');
    expect(r.value).toBe(0.5);
    expect(r.unit).toBe('kg');
  });

  test('sem número retorna null', () => {
    expect(parseQuantity('alcatra moída')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — matchCorte
// ═══════════════════════════════════════════════════════════════

describe('matchCorte', () => {
  const cortes = DEFAULT_CARDAPIO.cortes;

  test('match pelo nome', () => {
    expect(matchCorte('picanha', cortes).name).toBe('Picanha');
  });

  test('match por apelido', () => {
    expect(matchCorte('contra file', cortes).name).toBe('Contra Filé');
  });

  test('match mais longo ganha (longest match)', () => {
    // "coxão mole" deve ganhar sobre "coxão" se houvesse
    expect(matchCorte('coxao mole', cortes).name).toBe('Coxão Mole');
  });

  test('match case insensitive', () => {
    expect(matchCorte('ALCATRA', cortes).name).toBe('Alcatra');
  });

  test('match frango', () => {
    expect(matchCorte('sobrecoxa', cortes).name).toBe('Sobrecoxa');
  });

  test('match suíno', () => {
    expect(matchCorte('toscana', cortes).name).toBe('Linguiça de Porco');
  });

  test('sem match retorna null', () => {
    expect(matchCorte('pizza', cortes)).toBeNull();
  });

  test('match com contexto extra', () => {
    expect(matchCorte('2 kg de patinho moído', cortes).name).toBe('Patinho');
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — matchPreparo
// ═══════════════════════════════════════════════════════════════

describe('matchPreparo', () => {
  test('fatiado', () => {
    expect(matchPreparo('alcatra fatiada')).toContain('Fatiado');
  });

  test('moído', () => {
    expect(matchPreparo('patinho moido')).toContain('Moído');
  });

  test('moído 2x deduplica', () => {
    const result = matchPreparo('patinho moido duas vezes');
    expect(result).toContain('Moído 2x');
    expect(result).not.toContain('Moído');
  });

  test('em cubos', () => {
    expect(matchPreparo('coxão mole em cubos')).toContain('Em cubos');
  });

  test('para strogonoff', () => {
    expect(matchPreparo('patinho pra strogonoff')).toContain('Para strogonoff');
  });

  test('múltiplos preparos', () => {
    const result = matchPreparo('patinho moído sem gordura');
    expect(result).toContain('Moído');
    expect(result).toContain('Sem gordura');
  });

  test('sem preparo → []', () => {
    expect(matchPreparo('2 kg de picanha')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — parsePackaging
// ═══════════════════════════════════════════════════════════════

describe('parsePackaging', () => {
  test('dividir em N pacotes de Xg', () => {
    const r = parsePackaging('dividir em 4 pacotes de 500g');
    expect(r.divide).toBe(true);
    expect(r.packages_count).toBe(4);
    expect(r.package_size).toBe('500g');
  });

  test('pacotes de Xg', () => {
    const r = parsePackaging('pacotes de 300g');
    expect(r.divide).toBe(true);
    expect(r.package_size).toBe('300g');
  });

  test('em N pacotes', () => {
    const r = parsePackaging('em 3 pacotes');
    expect(r.divide).toBe(true);
    expect(r.packages_count).toBe(3);
  });

  test('sem embalagem → null', () => {
    expect(parsePackaging('2 kg de alcatra')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — splitItems
// ═══════════════════════════════════════════════════════════════

describe('splitItems', () => {
  test('separador +', () => {
    const r = splitItems('2 kg de alcatra + 1 kg de patinho');
    expect(r.length).toBe(2);
    expect(r[0]).toBe('2 kg de alcatra');
    expect(r[1]).toBe('1 kg de patinho');
  });

  test('separador \\n', () => {
    const r = splitItems('2 kg de alcatra\n1 kg de patinho');
    expect(r.length).toBe(2);
  });

  test('item único', () => {
    const r = splitItems('1 kg de picanha');
    expect(r.length).toBe(1);
  });

  test('ignora linhas vazias', () => {
    const r = splitItems('2 kg alcatra\n\n1 kg patinho');
    expect(r.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — parseSingleItem
// ═══════════════════════════════════════════════════════════════

describe('parseSingleItem', () => {
  const cortes = DEFAULT_CARDAPIO.cortes;

  test('item completo: "2 kg de picanha fatiada"', () => {
    const r = parseSingleItem('2 kg de picanha fatiada', cortes);
    expect(r).not.toBeNull();
    expect(r.item.name).toBe('Picanha');
    expect(r.item.quantity.value).toBe(2);
    expect(r.item.quantity.unit).toBe('kg');
    expect(r.item.preparation.style).toBe('Fatiado');
    expect(r.item.estimated_price).toBe(139.80);
    expect(r.confidence).toBe(0.9);
  });

  test('item sem quantidade: "alcatra moída"', () => {
    const r = parseSingleItem('alcatra moída', cortes);
    expect(r).not.toBeNull();
    expect(r.item.name).toBe('Alcatra');
    expect(r.item.quantity.value).toBe(1);
    expect(r.item.preparation.style).toBe('Moído');
    expect(r.confidence).toBe(0.6);
  });

  test('item com gramas: "500g de patinho moído"', () => {
    const r = parseSingleItem('500g de patinho moído', cortes);
    expect(r.item.name).toBe('Patinho');
    expect(r.item.quantity.value).toBe(0.5);
    expect(r.item.quantity.unit).toBe('kg');
  });

  test('item com valor: "R$ 30 de maminha"', () => {
    const r = parseSingleItem('R$ 30 de maminha', cortes);
    expect(r.item.name).toBe('Maminha');
    expect(r.item.quantity.unit).toBe('BRL');
    expect(r.item.estimated_price).toBe(30);
  });

  test('item com packaging: "2 kg de alcatra, dividir em 4 pacotes de 500g"', () => {
    const r = parseSingleItem('2 kg de alcatra, dividir em 4 pacotes de 500g', cortes);
    expect(r.item.name).toBe('Alcatra');
    expect(r.item.packaging).not.toBeNull();
    expect(r.item.packaging.packages_count).toBe(4);
    expect(r.item.packaging.package_size).toBe('500g');
  });

  test('item não encontrado → null', () => {
    expect(parseSingleItem('pizza margherita', cortes)).toBeNull();
  });

  test('item suíno: costelinha', () => {
    const r = parseSingleItem('2 kg de costelinha de porco', cortes);
    expect(r.item.name).toBe('Costelinha de Porco');
    expect(r.item.animal).toBe('suino');
  });

  test('moído 2x detectado', () => {
    const r = parseSingleItem('1 kg de patinho moído duas vezes', cortes);
    expect(r.item.preparation.style).toBe('Moído 2x');
    expect(r.item.preparation.times).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// PARSER — parseDeterministico
// ═══════════════════════════════════════════════════════════════

describe('parseDeterministico', () => {
  test('pedido simples: 1 item', () => {
    const r = parseDeterministico('2 kg de picanha', DEFAULT_CARDAPIO);
    expect(r.items.length).toBe(1);
    expect(r.items[0].name).toBe('Picanha');
    expect(r.confidence).toBe(0.9);
  });

  test('pedido multi-item com +', () => {
    const r = parseDeterministico(
      '2 kg de alcatra em bife + 1 kg de patinho moído + 500g de maminha',
      DEFAULT_CARDAPIO
    );
    expect(r.items.length).toBe(3);
    expect(r.items[0].name).toBe('Alcatra');
    expect(r.items[1].name).toBe('Patinho');
    expect(r.items[2].name).toBe('Maminha');
  });

  test('pedido com frango e bovino misturado', () => {
    const r = parseDeterministico(
      '1 kg de sobrecoxa + 2 kg de picanha fatiada',
      DEFAULT_CARDAPIO
    );
    expect(r.items.length).toBe(2);
    expect(r.items[0].animal).toBe('frango');
    expect(r.items[1].animal).toBe('bovino');
  });

  test('pedido vazio / sem corte → 0 items', () => {
    const r = parseDeterministico('bom dia quero fazer um pedido', DEFAULT_CARDAPIO);
    expect(r.items.length).toBe(0);
    expect(r.confidence).toBe(0);
  });

  test('confidence 0.9 quando todos os itens têm quantidade', () => {
    const r = parseDeterministico('1 kg de patinho + 2 kg de alcatra', DEFAULT_CARDAPIO);
    expect(r.confidence).toBe(0.9);
  });

  test('confidence menor quando falta quantidade', () => {
    const r = parseDeterministico('patinho moído', DEFAULT_CARDAPIO);
    expect(r.confidence).toBeLessThan(0.85);
  });

  test('pedido real: "1 kg de patinho moído duas vezes, dividido em pacotes de 500g"', () => {
    const r = parseDeterministico(
      '1 kg de patinho moído duas vezes, dividido em pacotes de 500g',
      DEFAULT_CARDAPIO
    );
    expect(r.items.length).toBe(1);
    const item = r.items[0];
    expect(item.name).toBe('Patinho');
    expect(item.preparation.style).toBe('Moído 2x');
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATOR — corteExiste
// ═══════════════════════════════════════════════════════════════

describe('corteExiste', () => {
  test('corte que existe por nome', () => {
    expect(corteExiste('Picanha')).toBe(true);
  });

  test('corte que existe por apelido', () => {
    expect(corteExiste('contra file')).toBe(true);
  });

  test('corte que não existe', () => {
    expect(corteExiste('salmão')).toBe(false);
  });

  test('case insensitive', () => {
    expect(corteExiste('ALCATRA')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATOR — unitReconhecida
// ═══════════════════════════════════════════════════════════════

describe('unitReconhecida', () => {
  test('kg → true', () => expect(unitReconhecida('kg')).toBe(true));
  test('BRL → true', () => expect(unitReconhecida('BRL')).toBe(true));
  test('pct → true', () => expect(unitReconhecida('pct')).toBe(true));
  test('gramas → true', () => expect(unitReconhecida('gramas')).toBe(true));
  test('xyz → false', () => expect(unitReconhecida('xyz')).toBe(false));
  test('null → false', () => expect(unitReconhecida(null)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════
// VALIDATOR — validateItem
// ═══════════════════════════════════════════════════════════════

describe('validateItem', () => {
  test('item válido com quantity object', () => {
    const v = validateItem({
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 2, unit: 'kg' }, estimated_price: 139.80
    });
    expect(v.valid).toBe(true);
    expect(v.errors.length).toBe(0);
  });

  test('item válido legado com peso', () => {
    const v = validateItem({
      tipo: 'carne', name: 'Picanha', peso: 2, price: 139.80
    });
    expect(v.valid).toBe(true);
  });

  test('item inválido: quantidade 0', () => {
    const v = validateItem({
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 0, unit: 'kg' }
    });
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('Quantidade inválida');
  });

  test('item inválido: quantidade > 50', () => {
    const v = validateItem({
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 51, unit: 'kg' }
    });
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('Quantidade muito alta (máx 50kg)');
  });

  test('item inválido: preço negativo', () => {
    const v = validateItem({
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 1, unit: 'kg' },
      estimated_price: -10
    });
    expect(v.valid).toBe(false);
  });

  test('item não-corte passa validação', () => {
    const v = validateItem({ tipo: 'extra', name: 'Carvão', price: 18 });
    expect(v.valid).toBe(true);
  });

  test('item sem nome falha', () => {
    const v = validateItem({ tipo: 'corte', quantity: { value: 1, unit: 'kg' } });
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('Corte não definido');
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATOR — calculateItemPrice
// ═══════════════════════════════════════════════════════════════

describe('calculateItemPrice', () => {
  test('novo formato: peso em kg', () => {
    const p = calculateItemPrice({
      tipo: 'corte', price_per_kg: 69.90,
      quantity: { value: 2, unit: 'kg', type: 'weight' }
    });
    expect(p).toBe(139.80);
  });

  test('legado: peso direto', () => {
    const p = calculateItemPrice({
      tipo: 'carne', pricePerKg: 42.90, peso: 1
    });
    expect(p).toBe(42.90);
  });

  test('meio kg', () => {
    const p = calculateItemPrice({
      tipo: 'corte', price_per_kg: 42.90,
      quantity: { value: 0.5, unit: 'kg', type: 'weight' }
    });
    expect(p).toBe(21.45);
  });

  test('extra (não-corte): retorna price', () => {
    expect(calculateItemPrice({ tipo: 'extra', price: 18 })).toBe(18);
  });

  test('sem preço retorna 0', () => {
    expect(calculateItemPrice({ tipo: 'corte' })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════

describe('Templates açougue', () => {
  test('saudacao contém emoji e nome', () => {
    const msgs = saudacao('Carnes da Boa');
    expect(msgs[0]).toContain('Carnes da Boa');
    expect(msgs[0]).toContain('🥩');
  });

  test('saudacaoCliente contém nome do cliente', () => {
    const msgs = saudacaoCliente('João', 'Carnes da Boa');
    expect(msgs[0]).toContain('João');
    expect(msgs[0]).toContain('Carnes da Boa');
  });

  test('formatQuantity — kg', () => {
    expect(formatQuantity({ value: 2, unit: 'kg' })).toBe('2 kg');
  });

  test('formatQuantity — BRL', () => {
    expect(formatQuantity({ value: 50, unit: 'BRL' })).toContain('50');
    expect(formatQuantity({ value: 50, unit: 'BRL' })).toContain('R$');
  });

  test('formatQuantity — pacote', () => {
    expect(formatQuantity({ value: 2, unit: 'pct' })).toContain('pacote');
  });

  test('formatQuantity — null → default 1 kg', () => {
    expect(formatQuantity(null)).toBe('1 kg');
  });

  test('formatItemForSummary — corte completo', () => {
    const txt = formatItemForSummary({
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 1.5, unit: 'kg', type: 'weight' },
      estimated_price: 104.85,
      preparation: { style: 'Fatiado' }
    });
    expect(txt).toContain('Picanha');
    expect(txt).toContain('1.5 kg');
    expect(txt).toContain('104,85');
    expect(txt).toContain('Fatiado');
  });

  test('formatItemForSummary — extra (não-corte)', () => {
    const txt = formatItemForSummary({
      tipo: 'extra', name: 'Carvão 5kg', price: 18, quantity: 1
    });
    expect(txt).toContain('Carvão');
    expect(txt).toContain('18');
  });

  test('formatItemForSummary — null retorna vazio', () => {
    expect(formatItemForSummary(null)).toBe('');
  });

  test('resumoPedido mostra total e aviso de balança', () => {
    const items = [{
      tipo: 'corte', name: 'Picanha',
      quantity: { value: 2, unit: 'kg', type: 'weight' },
      estimated_price: 139.80
    }];
    const txt = resumoPedido(items, 139.80);
    expect(txt).toContain('Picanha');
    expect(txt).toContain('139,80');
    expect(txt).toContain('balança');
  });
});

// ═══════════════════════════════════════════════════════════════
// HANDLERS — handleStep
// ═══════════════════════════════════════════════════════════════

describe('handleStep', () => {
  function makeState() {
    return {
      etapa: 'PEDIDO_LIVRE_ACOUGUE',
      pedidoAtual: { items: [] }
    };
  }

  test('PEDIDO_LIVRE_ACOUGUE — parseia e vai para revisão', () => {
    const state = makeState();
    const result = plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '2 kg de picanha', state, DEFAULT_CARDAPIO);
    expect(result).not.toBeNull();
    expect(state.etapa).toBe('REVISANDO_PEDIDO_ACOUGUE');
    expect(state.pedidoAtual.items.length).toBe(1);
    expect(state.pedidoAtual.items[0].name).toBe('Picanha');
  });

  test('PEDIDO_LIVRE_ACOUGUE — texto sem corte → pedidoNaoEntendido', () => {
    const state = makeState();
    const result = plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', 'bom dia', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('PEDIDO_LIVRE_ACOUGUE');
    expect(result.response).toContain('Não encontrei');
  });

  test('PEDIDO_LIVRE_ACOUGUE — multi-item com +', () => {
    const state = makeState();
    plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '1 kg de alcatra + 2 kg de patinho moído', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items.length).toBe(2);
    expect(state.etapa).toBe('REVISANDO_PEDIDO_ACOUGUE');
  });

  test('MONTANDO_CORTE compat → redireciona para pedido livre', () => {
    const state = makeState();
    state.etapa = 'MONTANDO_CORTE';
    const result = plugin.handleStep('MONTANDO_CORTE', '1 kg de picanha', state, DEFAULT_CARDAPIO);
    expect(result).not.toBeNull();
    expect(state.pedidoAtual.items.length).toBe(1);
  });

  test('REVISANDO_PEDIDO — "sim" → vai para upsell', () => {
    const state = makeState();
    plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '2 kg de alcatra', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('REVISANDO_PEDIDO_ACOUGUE');

    const result = plugin.handleStep('REVISANDO_PEDIDO_ACOUGUE', 'sim', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('REVISANDO_PEDIDO — "não" → reseta cortes e recomeça', () => {
    const state = makeState();
    plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '2 kg de alcatra', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items.length).toBe(1);

    plugin.handleStep('REVISANDO_PEDIDO_ACOUGUE', 'nao', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('PEDIDO_LIVRE_ACOUGUE');
    expect(state.pedidoAtual.items.filter(i => i.tipo === 'corte').length).toBe(0);
  });

  test('REVISANDO_PEDIDO — "corrigir" → pede correção', () => {
    const state = makeState();
    plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '2 kg de alcatra', state, DEFAULT_CARDAPIO);

    const result = plugin.handleStep('REVISANDO_PEDIDO_ACOUGUE', 'corrigir', state, DEFAULT_CARDAPIO);
    expect(state.etapa).toBe('PEDIDO_LIVRE_ACOUGUE');
    expect(result.response).toContain('mudar');
  });

  test('REVISANDO_PEDIDO — adiciona mais itens', () => {
    const state = makeState();
    plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '2 kg de alcatra', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items.length).toBe(1);

    plugin.handleStep('REVISANDO_PEDIDO_ACOUGUE', 'mais 1 kg de picanha', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items.length).toBe(2);
  });

  test('REVISANDO_PEDIDO — texto com corte adiciona automaticamente', () => {
    const state = makeState();
    plugin.handleStep('PEDIDO_LIVRE_ACOUGUE', '2 kg de alcatra', state, DEFAULT_CARDAPIO);

    plugin.handleStep('REVISANDO_PEDIDO_ACOUGUE', '1 kg de maminha', state, DEFAULT_CARDAPIO);
    expect(state.pedidoAtual.items.length).toBe(2);
  });

  test('etapa desconhecida → null', () => {
    const state = makeState();
    const result = plugin.handleStep('ETAPA_FANTASMA', 'oi', state, DEFAULT_CARDAPIO);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// PLUGIN INTERFACE
// ═══════════════════════════════════════════════════════════════

describe('Plugin interface completa', () => {
  test('exporta business_type', () => {
    expect(plugin.business_type).toBe('acougue');
  });

  test('exporta getFlowSteps', () => {
    expect(typeof plugin.getFlowSteps).toBe('function');
    expect(plugin.getFlowSteps().length).toBeGreaterThan(0);
  });

  test('exporta getDefaultCardapio', () => {
    expect(typeof plugin.getDefaultCardapio).toBe('function');
    expect(plugin.getDefaultCardapio().cortes.length).toBe(41);
  });

  test('exporta handleStep', () => {
    expect(typeof plugin.handleStep).toBe('function');
  });

  test('exporta validateItem', () => {
    expect(typeof plugin.validateItem).toBe('function');
  });

  test('exporta calculateItemPrice', () => {
    expect(typeof plugin.calculateItemPrice).toBe('function');
  });

  test('exporta formatItemForSummary', () => {
    expect(typeof plugin.formatItemForSummary).toBe('function');
  });

  test('exporta templates.saudacao', () => {
    expect(typeof plugin.templates.saudacao).toBe('function');
  });

  test('exporta templates.saudacaoCliente', () => {
    expect(typeof plugin.templates.saudacaoCliente).toBe('function');
  });

  test('exporta buildFastTrackItem', () => {
    expect(typeof plugin.buildFastTrackItem).toBe('function');
    expect(plugin.buildFastTrackItem()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// NORMALIZEUNIT
// ═══════════════════════════════════════════════════════════════

describe('normalizeUnit', () => {
  test('kg → kg', () => expect(normalizeUnit('kg')).toBe('kg'));
  test('quilo → kg', () => expect(normalizeUnit('quilo')).toBe('kg'));
  test('gramas → g', () => expect(normalizeUnit('gramas')).toBe('g'));
  test('reais → BRL', () => expect(normalizeUnit('reais')).toBe('BRL'));
  test('pacote → pct', () => expect(normalizeUnit('pacote')).toBe('pct'));
  test('desconhecido → null', () => expect(normalizeUnit('litros')).toBeNull());
  test('null → null', () => expect(normalizeUnit(null)).toBeNull());
});
