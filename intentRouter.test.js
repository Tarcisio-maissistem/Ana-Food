// intentRouter.test.js
// ═══════════════════════════════════════════════════════════════
// Testes do Intent Router — classificação global de intenções
// ═══════════════════════════════════════════════════════════════

const intentRouter = require('./intentRouter');

const COMPANY = {
  name: 'Marmitaria Teste',
  opening_hours: '11h às 15h',
  address: 'Rua das Flores, 123 - Centro',
  delivery_fee: 6,
  pix_key: 'pix@teste.com',
  estimated_time_default: 40
};

function makeState(etapa, overrides = {}) {
  return {
    etapa,
    pedidoAtual: {
      items: [],
      type: null,
      address: null,
      paymentMethod: null,
      deliveryFee: 0,
      trocoPara: null
    },
    _askedTroco: false,
    _confirmingAddress: false,
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════
// FAQ via Intent Router (delegado ao RAG FAQ)
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — FAQ', () => {
  test('pergunta horário → detecta FAQ com dados reais da empresa', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('que horas vocês fecham?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FAQ');
    expect(result.response[0]).toContain('11h às 15h');
    expect(result._skipHumanize).toBe(true);
  });

  test('pergunta localização → retorna endereço real da empresa', () => {
    const state = makeState('MONTANDO_TAMANHO');
    const result = intentRouter.classify('onde vocês ficam?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FAQ');
    expect(result.response[0]).toContain('Rua das Flores, 123');
  });

  test('pergunta taxa → retorna taxa real', () => {
    const state = makeState('MONTANDO_SALADA');
    const result = intentRouter.classify('qual o valor da entrega?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.response[0]).toContain('6,00');
  });

  test('pergunta cartão → responde aceitamos', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('aceita cartao?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FAQ');
  });

  test('"rua" em AGUARDANDO_ENDERECO → NÃO é FAQ (está dando endereço)', () => {
    const state = makeState('AGUARDANDO_ENDERECO');
    const result = intentRouter.classify('Rua das Flores, 123', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"pix" em AGUARDANDO_PAGAMENTO → NÃO é FAQ (está pagando)', () => {
    const state = makeState('AGUARDANDO_PAGAMENTO');
    const result = intentRouter.classify('quero pagar no pix', state, COMPANY);
    expect(result).toBeNull();
  });

  test('FAQ retorna contexto de retomada da etapa', () => {
    const state = makeState('MONTANDO_TAMANHO');
    const result = intentRouter.classify('vocês estão abertos?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.response.length).toBe(2); // FAQ + contexto
    expect(result.response[1]).toContain('tamanho');
  });

  test('pergunta tempo de entrega → retorna tempo real', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('quanto tempo demora a entrega?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.response[0]).toContain('40 minutos');
  });
});

// ═══════════════════════════════════════════════════════════════
// Reclamação de Fluxo
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — Reclamação de Fluxo', () => {
  test('"sim mas eu não falei o troco" com Dinheiro sem troco → redireciona', () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        items: [{ tipo: 'marmita', price: 22 }],
        type: 'delivery',
        address: 'Rua A, 100',
        paymentMethod: 'Dinheiro',
        deliveryFee: 5,
        trocoPara: null
      }
    });
    const result = intentRouter.classify('sim mas eu não falei o troco', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RECLAMACAO_FLUXO');
    expect(state.etapa).toBe('AGUARDANDO_PAGAMENTO');
    expect(result.response).toContain('troco');
  });

  test('"ok mas não disse o endereço" com delivery → redireciona', () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        items: [{ tipo: 'marmita', price: 22 }],
        type: 'delivery',
        address: 'Rua Antiga',
        paymentMethod: 'Pix',
        deliveryFee: 5,
        trocoPara: null
      }
    });
    const result = intentRouter.classify('sim mas eu não informei o endereço correto', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RECLAMACAO_FLUXO');
    expect(state.etapa).toBe('AGUARDANDO_ENDERECO');
  });

  test('"sim mas eu não escolhi a forma de pagamento" → redireciona', () => {
    const state = makeState('CONFIRMANDO', {
      pedidoAtual: {
        items: [{ tipo: 'marmita', price: 22 }],
        type: 'delivery',
        address: 'Rua A, 100',
        paymentMethod: null,
        deliveryFee: 5,
        trocoPara: null
      }
    });
    const result = intentRouter.classify('pode ser mas eu não falei a forma de pagamento', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RECLAMACAO_FLUXO');
    expect(state.etapa).toBe('AGUARDANDO_PAGAMENTO');
  });

  test('mensagem normal sem "mas não falei" → NÃO é reclamação', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('sim pode confirmar', state, COMPANY);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Falar com Humano
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — Falar com Humano', () => {
  test('"quero falar com um atendente" → detecta', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('quero falar com um atendente', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FALAR_HUMANO');
    expect(result._flagHumano).toBe(true);
  });

  test('"chamar gerente" → detecta', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('chamar gerente', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FALAR_HUMANO');
  });
});

// ═══════════════════════════════════════════════════════════════
// Passthrough (não é intenção global)
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — Passthrough', () => {
  test('"frango e linguiça" → null (vai pro handler)', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('frango e linguiça', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"grande" → null', () => {
    const state = makeState('MONTANDO_TAMANHO');
    const result = intentRouter.classify('grande', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"sim" → null', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('sim', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"dinheiro troco pra 50" → null', () => {
    const state = makeState('AGUARDANDO_PAGAMENTO');
    const result = intentRouter.classify('dinheiro troco pra 50', state, COMPANY);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Correção de Quantidade
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — Correção de Quantidade', () => {
  function makeStateWithMarmita(etapa) {
    return {
      etapa,
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Arroz' }],
            saladas: [{ name: 'Alface' }]
          }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0,
        trocoPara: null
      },
      _askedTroco: false,
      _confirmingAddress: false
    };
  }

  test('"são 3 marmitas" em AGUARDANDO_TIPO → adiciona 2 marmitas', () => {
    const state = makeStateWithMarmita('AGUARDANDO_TIPO');
    const result = intentRouter.classify('são 3 marmitas grandes', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CORRECAO_QUANTIDADE');
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(3);
    expect(result._reaskEtapa).toBe(true);
  });

  test('"falei que são 3 grandes" em CONFIRMANDO → ajusta quantidade', () => {
    const state = makeStateWithMarmita('CONFIRMANDO');
    state.pedidoAtual.type = 'pickup';
    state.pedidoAtual.paymentMethod = 'Pix';
    const result = intentRouter.classify('falei que são 3 grandes', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CORRECAO_QUANTIDADE');
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(3);
  });

  test('"são 3 marmitas" em MONTANDO_PROTEINA → null (dentro da montagem)', () => {
    const state = makeStateWithMarmita('MONTANDO_PROTEINA');
    const result = intentRouter.classify('são 3 marmitas', state, COMPANY);
    expect(result).toBeNull();
  });

  test('quantidade igual → null (não precisa corrigir)', () => {
    const state = makeStateWithMarmita('AGUARDANDO_TIPO');
    const result = intentRouter.classify('é 1 marmita', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"quero 2 grandes" em AGUARDANDO_TIPO → duplica com deep copy', () => {
    const state = makeStateWithMarmita('AGUARDANDO_TIPO');
    const result = intentRouter.classify('quero 2 marmitas grandes', state, COMPANY);
    expect(result).not.toBeNull();
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(2);
    // Verifica deep copy (não referência ao mesmo objeto)
    marmitas[1].proteinas[0].name = 'Frango';
    expect(marmitas[0].proteinas[0].name).toBe('Churrasco');
  });
});

// ═══════════════════════════════════════════════════════════════
// CANCEL INTENT — Cancelamento de pedido
// ═══════════════════════════════════════════════════════════════

describe('detectCancel', () => {
  test('"cancela" primeira vez → pede confirmação', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('cancela', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
    expect(result.response).toContain('Quer cancelar');
    expect(state._confirmandoCancelamento).toBe(true);
  });

  test('"cancelar" segunda vez → confirma cancelamento', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    state._confirmandoCancelamento = true;
    const result = intentRouter.classify('cancelar', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_CONFIRMED');
    expect(state.etapa).toBe('INICIO');
    expect(state.pedidoAtual.items).toEqual([]);
  });

  test('"desisti" → trata como cancelamento', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('desisti', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"não quero mais" → trata como cancelamento', () => {
    const state = makeState('AGUARDANDO_TIPO');
    const result = intentRouter.classify('nao quero mais', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"arroz e feijão" → não é cancelamento (null)', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('arroz e feijão', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"cancela o refrigerante" → NÃO cancela pedido (item específico)', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('cancela o refrigerante', state, COMPANY);
    expect(result).toBeNull();
    expect(state._confirmandoCancelamento).toBeFalsy();
  });

  test('"cancela a coca" → NÃO cancela pedido (item específico)', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('cancela a coca', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"cancela o suco" → NÃO cancela pedido (item específico)', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('cancela o suco', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"não" durante confirmação de cancelamento → limpa flag e retorna null', () => {
    const state = makeState('CONFIRMANDO');
    state._confirmandoCancelamento = true;
    const result = intentRouter.classify('nao', state, COMPANY);
    expect(result).toBeNull();
    expect(state._confirmandoCancelamento).toBe(false);
  });

  test('"não é pra cancelar" durante confirmação → limpa flag, NÃO cancela', () => {
    const state = makeState('CONFIRMANDO');
    state._confirmandoCancelamento = true;
    const result = intentRouter.classify('não é pra cancelar o pedido não! é pra retirar o refrigerante', state, COMPANY);
    // detectCancel limpa a flag e retorna null, mas outro handler pode capturar (ex: detectDrinkCorrection)
    expect(state._confirmandoCancelamento).toBe(false);
    if (result) {
      expect(result.intent).not.toBe('CANCEL_PENDING');
      expect(result.intent).not.toBe('CANCEL_CONFIRMED');
    }
  });

  test('"sim" durante confirmação de cancelamento → CANCEL_CONFIRMED', () => {
    const state = makeState('CONFIRMANDO');
    state._confirmandoCancelamento = true;
    const result = intentRouter.classify('sim', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_CONFIRMED');
    expect(state.etapa).toBe('INICIO');
  });

  test('"cancela tudo" → pede confirmação (não é item específico)', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('cancela tudo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });
});

// ═══════════════════════════════════════════════════════════════
// FRUSTRATION INTENT — Detecção de frustração
// ═══════════════════════════════════════════════════════════════

describe('detectFrustration', () => {
  test('"aff que chato" → FRUSTRATION com mensagem empática', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('aff que chato', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FRUSTRATION');
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    // Aceita qualquer das respostas empáticas (são aleatórias)
    expect(resp).toMatch(/desculpa|perdoa/i);
  });

  test('"que chato" → FRUSTRATION', () => {
    const state = makeState('MONTANDO_SALADA');
    const result = intentRouter.classify('que chato', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FRUSTRATION');
  });

  test('"impossível" → FRUSTRATION', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('impossível', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FRUSTRATION');
  });

  test('"???" → FRUSTRATION', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('???', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('FRUSTRATION');
  });

  test('FRUSTRATION inclui retomada do fluxo', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('voce nao entende', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.response.join(' ')).toContain('Voltando');
  });
});

// ═══════════════════════════════════════════════════════════════
// RESTART INTENT — Recomeçar pedido
// ═══════════════════════════════════════════════════════════════

describe('detectRestart', () => {
  test('"deixa quieto" → RESTART', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('deixa quieto', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RESTART');
    expect(state.etapa).toBe('MONTANDO_TAMANHO');
    expect(state.pedidoAtual.items).toEqual([]);
  });

  test('"esquece" → RESTART', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('esquece', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RESTART');
  });

  test('"começa de novo" → RESTART', () => {
    const state = makeState('AGUARDANDO_PAGAMENTO');
    const result = intentRouter.classify('comeca de novo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RESTART');
  });

  test('"novo pedido" → RESTART', () => {
    const state = makeState('OFERECENDO_UPSELL');
    const result = intentRouter.classify('novo pedido', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('RESTART');
  });

  test('RESTART reseta _loopCount', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    state._loopCount = 5;
    intentRouter.classify('deixa quieto', state, COMPANY);
    expect(state._loopCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// ASK_SUMMARY — Ver Resumo do Pedido
// ═══════════════════════════════════════════════════════════════

describe('Intent Router — ASK_SUMMARY', () => {
  function stateWithItems(etapa) {
    return makeState(etapa, {
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
        deliveryFee: 0
      }
    });
  }

  test('"não está completo" → ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_PROTEINA');
    const result = intentRouter.classify('não está completo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"nao esta completo" → ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('nao esta completo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"cadê as quantidades?" → ASK_SUMMARY', () => {
    const state = stateWithItems('OFERECENDO_UPSELL');
    const result = intentRouter.classify('cade as quantidades?', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"cadê a quantidade" → ASK_SUMMARY', () => {
    const state = stateWithItems('CONFIRMANDO');
    const result = intentRouter.classify('cadê a quantidade', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"quero o pedido completo" → ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_SALADA');
    const result = intentRouter.classify('quero o pedido completo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"pedido completo" → ASK_SUMMARY', () => {
    const state = stateWithItems('AGUARDANDO_TIPO');
    const result = intentRouter.classify('pedido completo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"faltou item" → ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_PROTEINA');
    const result = intentRouter.classify('faltou item', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"faltou marmita" → ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('faltou marmita', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"está faltando" → ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('está faltando', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"faltou o bairro" NÃO é ASK_SUMMARY', () => {
    const state = stateWithItems('AGUARDANDO_ENDERECO');
    const result = intentRouter.classify('faltou o bairro centro', state, COMPANY);
    // Não deve ser ASK_SUMMARY
    expect(result?.intent).not.toBe('ASK_SUMMARY');
  });

  test('"mostra tudo" → ASK_SUMMARY', () => {
    const state = stateWithItems('CONFIRMANDO');
    const result = intentRouter.classify('mostra tudo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('ASK_SUMMARY sem itens → responde que não tem pedido', () => {
    const state = makeState('MONTANDO_TAMANHO'); // sem items
    const result = intentRouter.classify('mostra o resumo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
    expect(result.response).toContain('ainda não tem itens');
  });

  test('ASK_SUMMARY em FINALIZADO → retorna null (handlePosPedido responde)', () => {
    const state = stateWithItems('FINALIZADO');
    const result = intentRouter.classify('mostra o resumo', state, COMPANY);
    expect(result).toBeNull();
  });

  test('"não mostrou as saladas pq?" NÃO é ASK_SUMMARY (pergunta sobre opções)', () => {
    const state = stateWithItems('MONTANDO_SALADA');
    const result = intentRouter.classify('não mostrou as saladas pq?', state, COMPANY);
    // NÃO deve disparar ASK_SUMMARY - é pergunta sobre opções de salada
    expect(result?.intent).not.toBe('ASK_SUMMARY');
  });

  test('"por que não listou as opções?" NÃO é ASK_SUMMARY', () => {
    const state = stateWithItems('MONTANDO_PROTEINA');
    const result = intentRouter.classify('por que nao listou as opções?', state, COMPANY);
    expect(result?.intent).not.toBe('ASK_SUMMARY');
  });

  test('"não mostrou o resumo completo" É ASK_SUMMARY', () => {
    const state = stateWithItems('AGUARDANDO_TIPO');
    const result = intentRouter.classify('não mostrou o resumo completo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('"meu pedido completo" É ASK_SUMMARY', () => {
    const state = stateWithItems('OFERECENDO_UPSELL');
    const result = intentRouter.classify('meu pedido completo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });
});

// ═══════════════════════════════════════════════════════════════
// CANCEL — Variantes linguísticas ampliadas
// ═══════════════════════════════════════════════════════════════

describe('detectCancel — variantes naturais', () => {
  test('"pode cancelar" → CANCEL_PENDING', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('pode cancelar', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"quero cancelar" → CANCEL_PENDING', () => {
    const state = makeState('AGUARDANDO_TIPO');
    const result = intentRouter.classify('quero cancelar', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"cancela isso" → CANCEL_PENDING', () => {
    const state = makeState('OFERECENDO_UPSELL');
    const result = intentRouter.classify('cancela isso', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"cancela tudo" → CANCEL_PENDING', () => {
    const state = makeState('CONFIRMANDO');
    const result = intentRouter.classify('cancela tudo', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"nao quero mais nada" → CANCEL_PENDING', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('nao quero mais nada', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CANCEL_PENDING');
  });

  test('"arroz e feijão" NÃO dispara cancel (false positive guard)', () => {
    const state = makeState('MONTANDO_ACOMPANHAMENTO');
    const result = intentRouter.classify('arroz e feijão', state, COMPANY);
    expect(result?.intent).not.toBe('CANCEL_PENDING');
  });
});

// ═══════════════════════════════════════════════════════════════
// FRUSTRATION — _skipHumanize: false (deixa IA humanizar)
// ═══════════════════════════════════════════════════════════════

describe('detectFrustration — humanização ativa', () => {
  test('FRUSTRATION não bloqueia humanização (_skipHumanize: false)', () => {
    const state = makeState('MONTANDO_PROTEINA');
    const result = intentRouter.classify('aff impossivel', state, COMPANY);
    expect(result).not.toBeNull();
    expect(result._skipHumanize).toBe(false);
  });

  test('FRUSTRATION retorna contexto de retomada da etapa', () => {
    const state = makeState('AGUARDANDO_PAGAMENTO');
    const result = intentRouter.classify('voce nao entende nada', state, COMPANY);
    expect(result).not.toBeNull();
    const resp = result.response.join(' ');
    expect(resp).toMatch(/pix|cart[ãa]o|dinheiro|voltando/i);
  });
});
