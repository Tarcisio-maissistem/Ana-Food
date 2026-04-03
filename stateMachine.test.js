// stateMachine.test.js
// ═══════════════════════════════════════════════════════════════
// Testes dos Bugs #1 e #3 — handleConfirmacao e handlePagamento
// Mocks de Redis/stateManager/database para evitar conexão real
// ═══════════════════════════════════════════════════════════════

// Mocks devem ser definidos ANTES de require
jest.mock('./stateManager', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(true)
}));
jest.mock('./database', () => ({
  getCompanyConfig: jest.fn().mockResolvedValue(null),
  saveLastOrder: jest.fn().mockResolvedValue(true),
  saveCustomerPreferences: jest.fn().mockResolvedValue(true),
  getCustomerPreferences: jest.fn().mockResolvedValue(null),
  getLastOrder: jest.fn().mockResolvedValue(null)
}));
jest.mock('./logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  stateTransition: jest.fn()
}));

const { process } = require('./stateMachine');
const ai = require('./aiInterpreter');

const COMPANY = {
  business_type: 'marmitaria',
  delivery_fee: 5,
  estimated_time_default: 30,
  pix_key: 'PIX123'
};

function makeState(etapa, overrides = {}) {
  return {
    etapa,
    pedidoAtual: {
      items: [
        {
          tipo: 'marmita',
          tamanho: 'Grande',
          price: 22,
          quantity: 1,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [{ name: 'Arroz' }],
          saladas: [{ name: 'Alface' }]
        }
      ],
      type: 'delivery',
      address: 'Rua A, 100',
      paymentMethod: null,
      deliveryFee: 5,
      trocoPara: null
    },
    _marmitaAtual: null,
    _pendingMarmitas: 1,
    _currentMarmitaNumber: 1,
    _upsellPhase: null,
    _confirmingAddress: false,
    _askedTroco: false,
    _awaitingPrefsConfirmation: false,
    _lastOrderForRepeat: undefined,
    _awaitingAddressChoice: false,
    _history: '',
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════
// Bug #1 — handleConfirmacao: modify NÃO deve destruir pedido
// ═══════════════════════════════════════════════════════════════

describe('Bug #1 — Modificação não destrói pedido', () => {
  test('IA retorna array vazio → items preservados', async () => {
    jest.spyOn(ai, 'interpretConfirmation').mockResolvedValue('indefinido');
    jest.spyOn(ai, 'interpretarModificacaoPedido').mockResolvedValue([]);

    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });
    const itemsAntes = JSON.parse(JSON.stringify(state.pedidoAtual.items));

    await process('c1', '5511999', 'troca o frango por carne', state, COMPANY);

    expect(state.pedidoAtual.items).toEqual(itemsAntes);
    ai.interpretConfirmation.mockRestore();
    ai.interpretarModificacaoPedido.mockRestore();
  });

  test('IA retorna item com price=0 → items preservados', async () => {
    jest.spyOn(ai, 'interpretConfirmation').mockResolvedValue('indefinido');
    jest.spyOn(ai, 'interpretarModificacaoPedido').mockResolvedValue([
      { tipo: 'marmita', name: 'Frango', price: 0, quantity: 1 }
    ]);

    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });
    const itemsAntes = JSON.parse(JSON.stringify(state.pedidoAtual.items));

    await process('c1', '5511999', 'muda pra costela', state, COMPANY);

    expect(state.pedidoAtual.items).toEqual(itemsAntes);
    ai.interpretConfirmation.mockRestore();
    ai.interpretarModificacaoPedido.mockRestore();
  });

  test('IA retorna null → items preservados', async () => {
    jest.spyOn(ai, 'interpretConfirmation').mockResolvedValue('indefinido');
    jest.spyOn(ai, 'interpretarModificacaoPedido').mockResolvedValue(null);

    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });
    const itemsAntes = JSON.parse(JSON.stringify(state.pedidoAtual.items));

    await process('c1', '5511999', 'troca tudo', state, COMPANY);

    expect(state.pedidoAtual.items).toEqual(itemsAntes);
    ai.interpretConfirmation.mockRestore();
    ai.interpretarModificacaoPedido.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #3 — handlePagamento: troco sem valor NÃO avança
// ═══════════════════════════════════════════════════════════════

describe('Bug #3 — Troco deve ser coletado antes de avançar', () => {
  test('"não sei quanto deu" → repete pergunta, não avança', async () => {
    const state = makeState('AGUARDANDO_PAGAMENTO', {
      pedidoAtual: {
        ...makeState('AGUARDANDO_PAGAMENTO').pedidoAtual,
        paymentMethod: 'Dinheiro'
      },
      _askedTroco: true
    });

    const result = await process('c1', '5511999', 'não sei quanto deu', state, COMPANY);

    expect(state.etapa).toBe('AGUARDANDO_PAGAMENTO');
    expect(state.pedidoAtual.trocoPara).toBeNull();
  });

  test('"troco pra 50" → trocoPara=50, avança', async () => {
    const state = makeState('AGUARDANDO_PAGAMENTO', {
      pedidoAtual: {
        ...makeState('AGUARDANDO_PAGAMENTO').pedidoAtual,
        paymentMethod: 'Dinheiro'
      },
      _askedTroco: true
    });

    const result = await process('c1', '5511999', 'troco pra 50', state, COMPANY);

    expect(state.pedidoAtual.trocoPara).toBe(50);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"não precisa de troco" → trocoPara=0, avança', async () => {
    const state = makeState('AGUARDANDO_PAGAMENTO', {
      pedidoAtual: {
        ...makeState('AGUARDANDO_PAGAMENTO').pedidoAtual,
        paymentMethod: 'Dinheiro'
      },
      _askedTroco: true
    });

    const result = await process('c1', '5511999', 'nao precisa', state, COMPANY);

    expect(state.pedidoAtual.trocoPara).toBe(0);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"50" → trocoPara=50, avança', async () => {
    const state = makeState('AGUARDANDO_PAGAMENTO', {
      pedidoAtual: {
        ...makeState('AGUARDANDO_PAGAMENTO').pedidoAtual,
        paymentMethod: 'Dinheiro'
      },
      _askedTroco: true
    });

    const result = await process('c1', '5511999', '50', state, COMPANY);

    expect(state.pedidoAtual.trocoPara).toBe(50);
    expect(state.etapa).toBe('CONFIRMANDO');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #6 — Loop infinito no troco: escape após 2 tentativas
// ═══════════════════════════════════════════════════════════════

describe('Bug #6 — Loop troco escape automático', () => {
  test('após 2 tentativas sem número → assume sem troco, avança', async () => {
    const state = makeState('AGUARDANDO_PAGAMENTO', {
      pedidoAtual: {
        ...makeState('AGUARDANDO_PAGAMENTO').pedidoAtual,
        paymentMethod: 'Dinheiro'
      },
      _askedTroco: true,
      _trocoTentativas: 1  // já tentou 1x
    });

    const result = await process('c1', '5511999', 'sim', state, COMPANY);

    expect(state.pedidoAtual.trocoPara).toBe(0);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"sem troco" → trocoPara=0, avança normalmente', async () => {
    const state = makeState('AGUARDANDO_PAGAMENTO', {
      pedidoAtual: {
        ...makeState('AGUARDANDO_PAGAMENTO').pedidoAtual,
        paymentMethod: 'Dinheiro'
      },
      _askedTroco: true
    });

    const result = await process('c1', '5511999', 'sem troco', state, COMPANY);

    expect(state.pedidoAtual.trocoPara).toBe(0);
    expect(state.etapa).toBe('CONFIRMANDO');
  });
});

// ═══════════════════════════════════════════════════════════════
// Nuances de Conversação — Cenários reais de delivery
// ═══════════════════════════════════════════════════════════════

describe('Adicionar marmita em CONFIRMANDO', () => {
  test('"quero adicionar mais uma marmita grande" → volta ao fluxo, NÃO finaliza', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });

    const result = await process('c1', '5511999', 'quero adicionar mais uma marmita grande', state, COMPANY);

    // NÃO deve finalizar
    expect(state.etapa).not.toBe('FINALIZADO');
    // Deve voltar para montagem
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
  });

  test('"adicionar outra marmita" sem tamanho → pergunta tamanho', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });

    const result = await process('c1', '5511999', 'quero adicionar mais uma marmita', state, COMPANY);

    expect(state.etapa).toBe('MONTANDO_TAMANHO');
    expect(state.etapa).not.toBe('FINALIZADO');
  });
});

describe('Tipo de entrega com typo', () => {
  test('"etrega" (typo) → reconhece como delivery', async () => {
    const state = makeState('AGUARDANDO_TIPO');

    const result = await process('c1', '5511999', 'etrega', state, COMPANY);

    expect(state.pedidoAtual.type).toBe('delivery');
    expect(state.etapa).toBe('AGUARDANDO_ENDERECO');
  });
});

describe('FAQ no meio do fluxo', () => {
  test('pergunta horário em MONTANDO_PROTEINA → responde + contexto', async () => {
    const state = makeState('MONTANDO_PROTEINA');

    const result = await process('c1', '5511999', 'que horas vocês fecham?', state, {
      ...COMPANY,
      opening_hours: '11h às 14h30'
    });

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    // Deve responder o horário
    expect(resp).toContain('11h');
    // Deve manter a etapa (não avançar)
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
  });

  test('pergunta taxa em MONTANDO_SALADA → responde + contexto', async () => {
    const state = makeState('MONTANDO_SALADA');

    const result = await process('c1', '5511999', 'qual o valor da entrega?', state, COMPANY);

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('5,00');
    expect(state.etapa).toBe('MONTANDO_SALADA');
  });
});

describe('Itens desconhecidos são ignorados sem crash', () => {
  test('"alface e tomate" → só alface (tomate não existe)', async () => {
    const state = makeState('MONTANDO_SALADA', {
      _marmitaAtual: {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        quantity: 1,
        proteinas: [{ name: 'Frango' }],
        acompanhamentos: [{ name: 'Arroz' }],
        saladas: []
      }
    });

    const result = await process('c1', '5511999', 'alface e tomate', state, COMPANY);

    // Só alface deve ter sido adicionada (tomate não existe no cardápio)
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita') || state._marmitaAtual;
    if (marmita && marmita.saladas) {
      expect(marmita.saladas.map(s => s.name)).toContain('Alface');
      expect(marmita.saladas.map(s => s.name)).not.toContain('Tomate');
    }
    // Não deve crashar
    expect(result).toBeDefined();
  });
});

describe('Upsell mostra resumo completo', () => {
  test('após aceitar suco, perguntarTipo inclui extras', async () => {
    const state = makeState('OFERECENDO_UPSELL', {
      _upsellPhase: 'bebida',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Frango' }],
            acompanhamentos: [{ name: 'Arroz' }],
            saladas: [{ name: 'Alface' }]
          }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0,
        trocoPara: null
      }
    });

    const result = await process('c1', '5511999', 'quero um suco', state, COMPANY);

    // Deve ter adicionado o suco aos itens
    expect(state.pedidoAtual.items.some(i => i.name === 'Suco Natural')).toBe(true);
    // Se o cardápio tem sobremesas (CARDAPIO_DEFAULT), vai para sobremesa antes de AGUARDANDO_TIPO
    // Aceita ambos os estados como válidos
    expect(['AGUARDANDO_TIPO', 'OFERECENDO_UPSELL']).toContain(state.etapa);
  });
});

describe('Confirmação com modificação inline', () => {
  test('"troca o frango por carne" NÃO finaliza pedido', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });

    // interpretConfirmation agora retorna 'indefinido' para frases com "troca"
    const result = await process('c1', '5511999', 'troca o frango por carne', state, COMPANY);

    expect(state.etapa).not.toBe('FINALIZADO');
  });

  test('"tira a salada" NÃO finaliza pedido', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });

    const result = await process('c1', '5511999', 'tira a salada', state, COMPANY);

    expect(state.etapa).not.toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════
// Repetir marmita — "igual a primeira", "mesmo pedido"
// ═══════════════════════════════════════════════════════════════

describe('Repetir marmita anterior', () => {
  function makeMultiMarmitaState() {
    return {
      etapa: 'MONTANDO_TAMANHO',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Frango' }],
            acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
            saladas: [{ name: 'Alface' }]
          }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0,
        trocoPara: null
      },
      _marmitaAtual: null,
      _pendingMarmitas: 3,
      _currentMarmitaNumber: 2,
      _upsellPhase: null,
      _confirmingAddress: false,
      _askedTroco: false,
      _awaitingPrefsConfirmation: false,
      _lastOrderForRepeat: undefined,
      _awaitingAddressChoice: false,
      _history: ''
    };
  }

  test('"pode ser igual a primeira" → duplica marmitas restantes, avança para upsell', async () => {
    const state = makeMultiMarmitaState();

    const result = await process('c1', '5511999', 'pode ser igual a primeira', state, COMPANY);

    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(3);
    expect(marmitas[1].proteinas[0].name).toBe('Frango');
    expect(marmitas[2].proteinas[0].name).toBe('Frango');
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('"mesmo pedido" → duplica 1 marmita (2 de 2)', async () => {
    const state = makeMultiMarmitaState();
    state._pendingMarmitas = 2;
    state._currentMarmitaNumber = 2;

    const result = await process('c1', '5511999', 'mesmo pedido da primeira', state, COMPANY);

    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(2);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('"de novo" sem marmita anterior → pede tamanho normal', async () => {
    const state = makeMultiMarmitaState();
    state.pedidoAtual.items = [];

    const result = await process('c1', '5511999', 'de novo', state, COMPANY);

    expect(state.etapa).toBe('MONTANDO_TAMANHO');
  });
});

// ═══════════════════════════════════════════════════════════════
// _skipHumanize nos handlers de montagem
// ═══════════════════════════════════════════════════════════════

describe('Montagem usa _skipHumanize', () => {
  test('handleProteina → resposta tem _skipHumanize', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'frango', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('handleAcompanhamento → resposta tem _skipHumanize', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'arroz e feijao', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('handleSalada → resposta tem _skipHumanize', async () => {
    const state = makeState('MONTANDO_SALADA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'alface', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Intent Router — Reclamação de fluxo (via process)
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — Reclamação de fluxo via process', () => {
  test('"sim mas eu não falei o troco" com Dinheiro → redireciona para troco', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        items: [
          { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
            proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: [{ name: 'Alface' }] }
        ],
        type: 'delivery',
        address: 'Rua A, 100',
        paymentMethod: 'Dinheiro',
        deliveryFee: 5,
        trocoPara: null
      }
    });

    const result = await process('c1', '5511999', 'sim mas eu não falei o troco', state, COMPANY);

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('troco');
    expect(state.etapa).toBe('AGUARDANDO_PAGAMENTO');
  });

  test('"ok mas eu nao informei o endereço" → redireciona para endereço', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        items: [
          { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
            proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: [{ name: 'Alface' }] }
        ],
        type: 'delivery',
        address: 'Rua Velha',
        paymentMethod: 'Pix',
        deliveryFee: 5,
        trocoPara: null
      }
    });

    const result = await process('c1', '5511999', 'ok mas eu nao informei o endereço correto', state, COMPANY);

    expect(state.etapa).toBe('AGUARDANDO_ENDERECO');
  });

  test('falar com humano → detecta', async () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = await process('c1', '5511999', 'quero falar com um atendente', state, COMPANY);

    expect(result._flagHumano).toBe(true);
    expect(state.etapa).toBe('MONTANDO_PROTEINA'); // não muda de etapa
  });
});

// ═══════════════════════════════════════════════════════════════
// RAG FAQ — Dados dinâmicos via process
// ═══════════════════════════════════════════════════════════════

describe('RAG FAQ — Dados dinâmicos via process', () => {
  test('horário → usa dados reais da empresa', async () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = await process('c1', '5511999', 'que horas vocês fecham?', state, {
      ...COMPANY,
      opening_hours: '11h às 14h30'
    });

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('11h');
    expect(resp).toContain('14h30');
  });

  test('taxa → usa delivery_fee real', async () => {
    const state = makeState('MONTANDO_SALADA');
    const result = await process('c1', '5511999', 'qual a taxa?', state, {
      ...COMPANY,
      delivery_fee: 8
    });

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('8,00');
    expect(state.etapa).toBe('MONTANDO_SALADA');
  });

  test('tempo de entrega → usa estimated_time', async () => {
    const state = makeState('MONTANDO_TAMANHO');
    const result = await process('c1', '5511999', 'quanto tempo demora?', state, {
      ...COMPANY,
      estimated_time_default: 45
    });

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('45 minutos');
  });
});

// ═══════════════════════════════════════════════════════════════
// Correção de quantidade via Intent Router
// ═══════════════════════════════════════════════════════════════

describe('Correção de quantidade via process', () => {
  test('"são 3 marmitas grandes" em AGUARDANDO_TIPO → adiciona marmitas e re-pergunta tipo', async () => {
    const state = makeState('AGUARDANDO_TIPO');

    const result = await process('c1', '5511999', 'são 3 marmitas grandes', state, COMPANY);

    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(3);
    // Deve continuar em AGUARDANDO_TIPO
    expect(state.etapa).toBe('AGUARDANDO_TIPO');
    // Resposta deve confirmar correção + re-perguntar entrega/retirada
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('3');
  });

  test('"pedi 2 marmitas" em CONFIRMANDO → ajusta e refaz resumo', async () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        items: [
          { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
            proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: [{ name: 'Alface' }] }
        ],
        type: 'delivery',
        address: 'Rua A, 100',
        paymentMethod: 'Pix',
        deliveryFee: 5,
        trocoPara: null
      }
    });

    const result = await process('c1', '5511999', 'são 2 marmitas grandes', state, COMPANY);

    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(2);
    expect(state.etapa).toBe('CONFIRMANDO');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug fixes — fast-track vs repeat, _skipHumanize, upsell edge
// ═══════════════════════════════════════════════════════════════

describe('handleTamanho _skipHumanize', () => {
  test('pedirProteina retorna _skipHumanize', async () => {
    const state = makeState('MONTANDO_TAMANHO', {
      pedidoAtual: { items: [] },
      _marmitaAtual: null,
      _pendingMarmitas: 0,
      _currentMarmitaNumber: 0
    });

    const result = await process('c1', '5511999', 'grande', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
  });

  test('tamanhoNaoEntendido retorna _skipHumanize', async () => {
    const state = makeState('MONTANDO_TAMANHO', {
      pedidoAtual: { items: [] },
      _marmitaAtual: null,
      _pendingMarmitas: 0,
      _currentMarmitaNumber: 0
    });

    const result = await process('c1', '5511999', 'azul', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
    expect(state.etapa).toBe('MONTANDO_TAMANHO');
  });
});

describe('handleProteina skip paths _skipHumanize', () => {
  test('"nao quero" pula proteína com _skipHumanize', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'nao quero', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('proteínaNaoEntendida retorna _skipHumanize', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'xyz123 abc', state, COMPANY);

    expect(result._skipHumanize).toBe(true);
  });
});

describe('Repeat detection "igual a primeira"', () => {
  test('"pode ser igual a primeira" duplica marmita sem chamar fast-track', async () => {
    const marmita1 = {
      tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
      proteinas: [{ name: 'Churrasco' }],
      acompanhamentos: [{ name: 'Arroz' }],
      saladas: [{ name: 'Alface' }]
    };

    const state = makeState('MONTANDO_TAMANHO', {
      pedidoAtual: { items: [marmita1] },
      _pendingMarmitas: 2,
      _currentMarmitaNumber: 2,
      _marmitaAtual: null
    });

    const result = await process('c1', '5511999', 'pode ser igual a primeira', state, COMPANY);

    // Should have duplicated the marmita + moved to upsell
    expect(state.pedidoAtual.items.length).toBe(2);
    expect(state.pedidoAtual.items[1].proteinas[0].name).toBe('Churrasco');
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    expect(result._skipHumanize).toBe(true);
  });
});

describe('Upsell frustration edge case', () => {
  test('"de novo?" no upsell pula para próxima etapa necessária', async () => {
    const state = makeState('OFERECENDO_UPSELL', {
      _upsellPhase: 'bebida'
    });

    const result = await process('c1', '5511999', 'de novo?', state, COMPANY);

    // makeState default tem type=delivery + address: 'Rua A, 100', logo pula para AGUARDANDO_PAGAMENTO
    expect(state.etapa).toBe('AGUARDANDO_PAGAMENTO');
  });

  test('"hein?" no upsell sem tipo definido vai para AGUARDANDO_TIPO', async () => {
    const state = makeState('OFERECENDO_UPSELL', {
      _upsellPhase: 'bebida',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
            proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: []
          }
        ],
        type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null
      }
    });

    const result = await process('c1', '5511999', 'hein?', state, COMPANY);

    expect(state.etapa).toBe('AGUARDANDO_TIPO');
  });

  test('"suco" NÃO é tratado como frustração — adiciona bebida e avança', async () => {
    const state = makeState('OFERECENDO_UPSELL', {
      _upsellPhase: 'bebida'
    });

    const result = await process('c1', '5511999', 'suco', state, COMPANY);

    // Deve ter adicionado suco aos itens (não é frustração)
    expect(state.pedidoAtual.items.some(i => i.name === 'Suco Natural')).toBe(true);
    // Pode ir para sobremesa (se cardápio tem sobremesa) ou direto para tipo
    expect(['AGUARDANDO_TIPO', 'OFERECENDO_UPSELL']).toContain(state.etapa);
  });
});

// ═══════════════════════════════════════════════════════════════
// _loopCount — escape mechanism for infinite loops
// ═══════════════════════════════════════════════════════════════

describe('_loopCount — escape mechanism', () => {
  test('handleAcompanhamento 1ª falha → repete pergunta mais simples', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      },
      _loopCount: 0
    });

    const result = await process('c1', '5511999', 'blablabla xyz', state, COMPANY);

    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
    expect(state._loopCount).toBe(1);
  });

  test('handleAcompanhamento 2ª falha → avança sem acompanhamento', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      },
      _loopCount: 1
    });

    const result = await process('c1', '5511999', 'xyz abc 123', state, COMPANY);

    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    expect(state._loopCount).toBe(0);
  });

  test('handleProteina 2ª falha → avança sem proteína', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [], acompanhamentos: [], saladas: []
      },
      _loopCount: 1
    });

    const result = await process('c1', '5511999', 'xyz abc 123', state, COMPANY);

    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
    expect(state._loopCount).toBe(0);
    expect(result.response).toContain('acompanhamentos');
  });

  test('handleSalada 2ª falha → avança para upsell', async () => {
    const state = makeState('MONTANDO_SALADA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: []
      },
      _pendingMarmitas: 1,
      _currentMarmitaNumber: 1,
      _loopCount: 1
    });

    const result = await process('c1', '5511999', 'xyz abc 123', state, COMPANY);

    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    expect(state._loopCount).toBe(0);
  });

  test('_loopCount reseta ao avançar com sucesso', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      },
      _loopCount: 1
    });

    await process('c1', '5511999', 'arroz e feijão', state, COMPANY);

    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    expect(state._loopCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Intent Router via process — CANCEL, FRUSTRATION, RESTART
// ═══════════════════════════════════════════════════════════════

describe('Intent Router via process', () => {
  test('"cancela" em qualquer etapa → pede confirmação', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'cancela', state, COMPANY);

    expect(state._confirmandoCancelamento).toBe(true);
    expect(result.response).toContain('Quer cancelar');
  });

  test('"aff que chato" → mensagem empática + retomada', async () => {
    const state = makeState('MONTANDO_SALADA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'aff que chato', state, COMPANY);

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    // Aceita qualquer das respostas empáticas (são aleatórias)
    expect(resp).toMatch(/desculpa|perdoa/i);
    expect(resp).toContain('Voltando');
  });

  test('"deixa quieto" → restart do pedido', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'deixa quieto', state, COMPANY);

    expect(state.etapa).toBe('MONTANDO_TAMANHO');
    expect(state.pedidoAtual.items).toEqual([]);
    expect(result.response).toContain('zero');
  });

  test('"posso retirar?" → FAQ respondida + retomada', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'posso retirar?', state, COMPANY);

    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toContain('entrega');
    expect(resp).toContain('retirada');
    // Should still be in the same state (FAQ doesn't advance the flow)
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FAST TRACK COMPLETO — Testes para fluxo de grupos
// ═══════════════════════════════════════════════════════════════════════════
describe('Fast Track — Fluxo de Grupos', () => {
  test('handleProteina com grupos avança para próximo grupo', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: null, acompanhamentos: null, saladas: null },
        { tamanho: 'Pequena', qty: 1, proteinas: null, acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0
    });

    const result = await process('c1', '5511999', 'frango', state, COMPANY);

    // Proteína preenchida no grupo 0
    expect(state._grupos[0].proteinas).toContain('Frango');
    // Avançou para grupo 1
    expect(state._currentGrupoIndex).toBe(1);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
    expect(result.response).toContain('pequena');
  });

  test('handleProteina último grupo vai para acompanhamento', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: ['Frango'], acompanhamentos: null, saladas: null },
        { tamanho: 'Pequena', qty: 1, proteinas: null, acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 1
    });

    const result = await process('c1', '5511999', 'churrasco', state, COMPANY);

    expect(state._grupos[1].proteinas).toContain('Churrasco');
    expect(state._currentGrupoIndex).toBe(0); // Resetou para 0
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('handleAcompanhamento com grupos avança para próximo grupo', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: ['Frango'], acompanhamentos: null, saladas: null },
        { tamanho: 'Pequena', qty: 1, proteinas: ['Churrasco'], acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0
    });

    const result = await process('c1', '5511999', 'arroz e feijao', state, COMPANY);

    expect(state._grupos[0].acompanhamentos).toContain('Arroz');
    expect(state._currentGrupoIndex).toBe(1);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('handleSalada expande grupos em itens no final', async () => {
    const state = makeState('MONTANDO_SALADA', {
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: null }
      ],
      _currentGrupoIndex: 0,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    });

    const result = await process('c1', '5511999', 'maionese', state, COMPANY);

    // Grupos foram expandidos para itens
    expect(state._grupos).toBeNull();
    expect(state.pedidoAtual.items.length).toBe(2); // 2 grandes
    expect(state.pedidoAtual.items[0].proteinas[0].name).toBe('Frango');
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('múltiplos grupos expandem corretamente (3 grandes + 1 pequena = 4 itens)', async () => {
    const state = makeState('MONTANDO_SALADA', {
      _grupos: [
        { tamanho: 'Grande', qty: 3, proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: ['Maionese'] },
        { tamanho: 'Pequena', qty: 1, proteinas: ['Churrasco'], acompanhamentos: ['Feijão'], saladas: null }
      ],
      _currentGrupoIndex: 1,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    });

    const result = await process('c1', '5511999', 'beterraba', state, COMPANY);

    expect(state._grupos).toBeNull();
    expect(state.pedidoAtual.items.length).toBe(4);
    // 3 grandes
    const grandes = state.pedidoAtual.items.filter(i => i.tamanho === 'Grande');
    expect(grandes.length).toBe(3);
    // 1 pequena
    const pequenas = state.pedidoAtual.items.filter(i => i.tamanho === 'Pequena');
    expect(pequenas.length).toBe(1);
  });

  test('label do grupo mostra quantidade correta', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _grupos: [
        { tamanho: 'Grande', qty: 3, proteinas: null, acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0
    });

    // Simula não entender a entrada para ver a mensagem de erro
    const result = await process('c1', '5511999', 'xyz', state, COMPANY);

    // Deve mostrar "as 3 grandes" na mensagem
    expect(result.response).toMatch(/3.*grande/i);
  });

  test('pular proteína com "não quero" funciona em grupos', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _grupos: [
        { tamanho: 'Grande', qty: 1, proteinas: null, acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0,
      _loopCount: 2 // Já tentou 2 vezes
    });

    const result = await process('c1', '5511999', 'xyz qualquer coisa', state, COMPANY);

    // Após 2 tentativas, pula
    expect(state._grupos[0].proteinas).toEqual([]);
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });
});

describe('resolverProximaEtapa — Decisão dinâmica', () => {
  test('estado com grupos incompletos retorna etapa correta', async () => {
    // Este teste verifica que o handleTamanho configura grupos corretamente
    const state = makeState('MONTANDO_TAMANHO');

    // Mensagem que cria grupos (via handleTamanho, não fast track)
    const result = await process('c1', '5511999', '2 grandes e 1 pequena', state, COMPANY);

    // Deve ter criado grupos e ido para MONTANDO_PROTEINA
    expect(state._grupos).toBeDefined();
    expect(state._grupos.length).toBeGreaterThanOrEqual(1);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
  });
});

describe('Fast Track em MONTANDO_TAMANHO', () => {
  // Este cenário é o bug reportado: bot perguntou tamanho, cliente mandou tudo de uma vez
  test('mensagem longa em MONTANDO_TAMANHO ativa fast track e pula para próxima etapa faltando', async () => {
    const state = makeState('MONTANDO_TAMANHO');

    // Mensagem com tamanhos + proteína → fast track captura proteína
    // Deve ir para MONTANDO_ACOMPANHAMENTO (proteína já capturada)
    const result = await process('c1', '5511999', '3 grandes e 1 pequena com frango', state, COMPANY);

    // Fast track deve criar grupos com proteína já preenchida
    expect(state._grupos).toBeDefined();
    expect(state._grupos.length).toBeGreaterThanOrEqual(1);
    // Como frango foi capturado, vai direto para acompanhamento
    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('"2 grandes" em MONTANDO_TAMANHO cria grupo único e pede proteína', async () => {
    const state = makeState('MONTANDO_TAMANHO');

    // Só tamanho, sem proteína → deve pedir proteína
    const result = await process('c1', '5511999', '2 grandes', state, COMPANY);

    expect(state._grupos).toBeDefined();
    expect(state._grupos.length).toBe(1);
    expect(state._grupos[0].tamanho).toBe('Grande');
    expect(state._grupos[0].qty).toBe(2);
    expect(state.etapa).toBe('MONTANDO_PROTEINA');
  });

  test('múltiplos tamanhos são criados como grupos separados', async () => {
    const state = makeState('MONTANDO_TAMANHO');

    const result = await process('c1', '5511999', '3 grandes e 2 pequenas', state, COMPANY);

    expect(state._grupos).toBeDefined();
    expect(state._grupos.length).toBe(2);
    expect(state._grupos[0]).toMatchObject({ tamanho: 'Grande', qty: 3 });
    expect(state._grupos[1]).toMatchObject({ tamanho: 'Pequena', qty: 2 });
  });
});

// ═══════════════════════════════════════════════════════════════
// handleConfirmacao: "não" agora pergunta o que mudar (não cancela)
// ═══════════════════════════════════════════════════════════════

describe('handleConfirmacao — "não" pede o que mudar', () => {
  test('"não" no resumo → mostra resumo + pergunta o que quer mudar', async () => {
    jest.spyOn(ai, 'interpretConfirmation').mockResolvedValue('nao');

    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Pix'
      }
    });

    const result = await process('c1', '5511999', 'não', state, COMPANY);

    // Não deve ter pedido confirmação de cancelamento
    expect(state._confirmandoCancelamento).toBeFalsy();
    // Deve continuar em CONFIRMANDO
    expect(state.etapa).toBe('CONFIRMANDO');
    // Resposta deve perguntar o que mudar
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toMatch(/mudar|alterar|trocar|modificar|mudar/i);

    ai.interpretConfirmation.mockRestore();
  });

  test('"não" não finaliza pedido', async () => {
    jest.spyOn(ai, 'interpretConfirmation').mockResolvedValue('nao');

    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        ...makeState('CONFIRMANDO').pedidoAtual,
        paymentMethod: 'Cartão'
      }
    });

    await process('c1', '5511999', 'não', state, COMPANY);

    expect(state.etapa).not.toBe('FINALIZADO');

    ai.interpretConfirmation.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// Upsell sobremesa — deve ser oferecida após bebida
// ═══════════════════════════════════════════════════════════════

describe('Upsell — sobremesa é oferecida após bebida', () => {
  test('após recusar bebida, oferece sobremesa (CARDAPIO_DEFAULT tem Pudim e Mousse)', async () => {
    // CARDAPIO_DEFAULT tem upsellsSobremesa, então deve oferecer sobremesa após bebida
    const state = makeState('OFERECENDO_UPSELL', {
      _upsellPhase: 'bebida',
      _upsellDone: false,
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
            proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: []
          }
        ],
        type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null
      }
    });

    const result = await process('c1', '5511999', 'nao', state, COMPANY);

    // Deve ter ido para fase de sobremesa
    expect(state._upsellPhase).toBe('sobremesa');
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toMatch(/pudim|mousse|sobremesa/i);
  });

  test('após recusar sobremesa (fase sobremesa), vai para AGUARDANDO_TIPO', async () => {
    const state = makeState('OFERECENDO_UPSELL', {
      _upsellPhase: 'sobremesa',
      _upsellDone: false,
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
            proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: []
          }
        ],
        type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null
      }
    });

    await process('c1', '5511999', 'nao quero', state, COMPANY);

    expect(state.etapa).toBe('AGUARDANDO_TIPO');
    expect(state._upsellDone).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Cancel — variantes naturais ampliadas
// ═══════════════════════════════════════════════════════════════

describe('Cancel — variantes linguísticas via process', () => {
  test('"pode cancelar" → pede confirmação', async () => {
    const state = makeState('MONTANDO_PROTEINA', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'pode cancelar', state, COMPANY);

    expect(state._confirmandoCancelamento).toBe(true);
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp).toMatch(/cancelar|cancel/i);
  });

  test('"quero cancelar" → pede confirmação', async () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO', {
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    });

    const result = await process('c1', '5511999', 'quero cancelar', state, COMPANY);

    expect(state._confirmandoCancelamento).toBe(true);
  });
});
