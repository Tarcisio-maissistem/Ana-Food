// bootstrapContext.test.js
// ═══════════════════════════════════════════════════════════════
// Testes do Bootstrap Context — Pré-processador de contexto
// ═══════════════════════════════════════════════════════════════

const bootstrapContext = require('./bootstrapContext');

// ═══════════════════════════════════════════════════════════════
// extractNameFromMessage — Extração de nome da mensagem
// ═══════════════════════════════════════════════════════════════

describe('extractNameFromMessage', () => {
  const { extractNameFromMessage } = bootstrapContext;

  test('"aqui é o Carlos" → Carlos', () => {
    expect(extractNameFromMessage('aqui é o Carlos')).toBe('Carlos');
  });

  test('"Oi, aqui é a Maria" → Maria', () => {
    expect(extractNameFromMessage('Oi, aqui é a Maria')).toBe('Maria');
  });

  test('"sou a Joana" → Joana', () => {
    expect(extractNameFromMessage('sou a Joana')).toBe('Joana');
  });

  test('"meu nome é João Silva" → João Silva', () => {
    expect(extractNameFromMessage('meu nome é João Silva')).toBe('João Silva');
  });

  test('"me chamo Pedro" → Pedro', () => {
    expect(extractNameFromMessage('me chamo Pedro')).toBe('Pedro');
  });

  test('"pode me chamar de Ana" → Ana', () => {
    expect(extractNameFromMessage('pode me chamar de Ana')).toBe('Ana');
  });

  test('"Oi Ricardo" → Ricardo', () => {
    expect(extractNameFromMessage('Oi Ricardo')).toBe('Ricardo');
  });

  test('"Bom dia, sou o Fernando" → Fernando', () => {
    expect(extractNameFromMessage('Bom dia, sou o Fernando')).toBe('Fernando');
  });

  test('"oi" → null (sem nome)', () => {
    expect(extractNameFromMessage('oi')).toBeNull();
  });

  test('"quero uma marmita grande" → null (sem nome)', () => {
    expect(extractNameFromMessage('quero uma marmita grande')).toBeNull();
  });

  test('null → null', () => {
    expect(extractNameFromMessage(null)).toBeNull();
  });

  test('"ab" → null (muito curto)', () => {
    expect(extractNameFromMessage('ab')).toBeNull();
  });

  test('palavras comuns filtradas: "sou eu quero" → null', () => {
    expect(extractNameFromMessage('sou eu quero marmita')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// validateLastOrder — Validação de último pedido
// ═══════════════════════════════════════════════════════════════

describe('validateLastOrder', () => {
  const { validateLastOrder } = bootstrapContext;

  const CARDAPIO = {
    proteinas: [{ name: 'Frango' }, { name: 'Churrasco' }, { name: 'Costela' }],
    acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }, { name: 'Macarrão' }],
    saladas: [{ name: 'Alface' }, { name: 'Tomate' }],
    upsellsBebida: [{ name: 'Suco Natural', price: 8 }, { name: 'Refrigerante Lata', price: 6 }]
  };

  test('último pedido válido → retorna itens com preços atualizados', () => {
    const lastOrder = [{
      tipo: 'marmita',
      tamanho: 'Grande',
      price: 20, // preço antigo
      proteinas: [{ name: 'Frango' }],
      acompanhamentos: [{ name: 'Arroz' }],
      saladas: [{ name: 'Alface' }]
    }];

    const validated = validateLastOrder(lastOrder, CARDAPIO);

    expect(validated.length).toBe(1);
    expect(validated[0].price).toBe(22); // preço atualizado
    expect(validated[0].proteinas[0].name).toBe('Frango');
  });

  test('último pedido com proteína desativada → remove proteína', () => {
    const lastOrder = [{
      tipo: 'marmita',
      tamanho: 'Grande',
      proteinas: [{ name: 'ProteinaInexistente' }],
      acompanhamentos: [{ name: 'Arroz' }],
      saladas: []
    }];

    const validated = validateLastOrder(lastOrder, CARDAPIO);

    // Sem proteína válida, item é descartado
    expect(validated.length).toBe(0);
  });

  test('último pedido com bebida válida → mantém bebida', () => {
    const lastOrder = [{
      tipo: 'extra',
      name: 'Suco Natural',
      price: 7, // preço antigo
      quantity: 1
    }];

    const validated = validateLastOrder(lastOrder, CARDAPIO);

    expect(validated.length).toBe(1);
    expect(validated[0].price).toBe(8); // preço atualizado
  });

  test('null ou vazio → array vazio', () => {
    expect(validateLastOrder(null, CARDAPIO)).toEqual([]);
    expect(validateLastOrder([], CARDAPIO)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// formatLastOrderSummary — Formatação do resumo
// ═══════════════════════════════════════════════════════════════

describe('formatLastOrderSummary', () => {
  const { formatLastOrderSummary } = bootstrapContext;

  test('marmita com proteínas e acompanhamentos', () => {
    const items = [{
      tipo: 'marmita',
      tamanho: 'Grande',
      proteinas: [{ name: 'Frango' }, { name: 'Churrasco' }],
      acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
      saladas: [{ name: 'Alface' }]
    }];

    const summary = formatLastOrderSummary(items);

    expect(summary).toContain('Marmita Grande');
    expect(summary).toContain('Frango');
    expect(summary).toContain('Churrasco');
    expect(summary).toContain('Arroz');
    expect(summary).toContain('Alface');
  });

  test('array vazio → string vazia', () => {
    expect(formatLastOrderSummary([])).toBe('');
    expect(formatLastOrderSummary(null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatTopProducts — Formatação dos top produtos
// ═══════════════════════════════════════════════════════════════

describe('formatTopProducts', () => {
  const { formatTopProducts } = bootstrapContext;

  test('formata lista de produtos com emojis e preços', () => {
    const products = [
      { name: 'Marmita Grande — Frango', price: 22 },
      { name: 'Suco Natural', price: 8 }
    ];

    const formatted = formatTopProducts(products);

    expect(formatted).toContain('Marmita Grande');
    expect(formatted).toContain('22,00');
    expect(formatted).toContain('Suco Natural');
    expect(formatted).toContain('8,00');
  });

  test('limita a 5 produtos', () => {
    const products = Array(10).fill({ name: 'Produto', price: 10 });

    const formatted = formatTopProducts(products);
    const lines = formatted.split('\n');

    expect(lines.length).toBe(5);
  });

  test('array vazio → string vazia', () => {
    expect(formatTopProducts([])).toBe('');
    expect(formatTopProducts(null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
// getTopProducts — Produtos mais vendidos
// ═══════════════════════════════════════════════════════════════

describe('getTopProducts', () => {
  const { getTopProducts } = bootstrapContext;

  test('retorna lista de produtos padrão', async () => {
    const products = await getTopProducts('company-1', {});

    expect(products.length).toBe(5);
    expect(products[0]).toHaveProperty('name');
    expect(products[0]).toHaveProperty('price');
  });
});
