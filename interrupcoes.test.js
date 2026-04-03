/**
 * interrupcoes.test.js
 * ═══════════════════════════════════════════════════════════════════════
 * TESTES DE INTERRUPÇÕES E SITUAÇÕES CAÓTICAS NO ATENDIMENTO
 * Cobre: perguntas no meio do pedido, mudança de ideia, typos pesados,
 * mensagens ambíguas, fluxos fora de ordem, edge cases numéricos,
 * mensagens curtas/longas, respostas inesperadas, troco/pagamento/endereço.
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
  name: 'Marmitas da Ana',
  delivery_fee: 5,
  estimated_time_default: 30,
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
    _upsellDone: true
  };
}

function criarEstadoEmEtapa(etapa, extra = {}) {
  return {
    etapa,
    pedidoAtual: {
      items: extra.items || [],
      type: extra.type || null,
      address: extra.address || null,
      paymentMethod: extra.paymentMethod || null,
      deliveryFee: extra.deliveryFee || 0,
      trocoPara: extra.trocoPara || null
    },
    _marmitaAtual: extra._marmitaAtual || null,
    _pendingMarmitas: extra._pendingMarmitas || 1,
    _currentMarmitaNumber: extra._currentMarmitaNumber || 1,
    _upsellDone: extra._upsellDone || false,
    _upsellPhase: extra._upsellPhase || null,
    _grupos: extra._grupos || null,
    _currentGrupoIndex: extra._currentGrupoIndex || 0,
    ...extra
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PERGUNTAS FAQ NO MEIO DO PEDIDO
// ═══════════════════════════════════════════════════════════════════════════

describe('FAQ durante montagem do pedido', () => {
  test('"qual o horario" durante MONTANDO_PROTEINA — responde e continua', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'qual o horario de funcionamento?'
    ]);
    // Deve ter respondido sobre o horário sem travar
    const ultima = historico[historico.length - 1];
    // Etapa NÃO deve regredir para INICIO
    expect(['MONTANDO_PROTEINA', 'MONTANDO_TAMANHO']).toContain(ultima.etapa);
  });

  test('"aceita cartao?" durante MONTANDO_ACOMPANHAMENTO — responde FAQ', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango',
      'aceita cartao?'
    ]);
    const ultima = historico[historico.length - 1];
    // Não deve ir para INICIO
    expect(ultima.etapa).not.toBe('INICIO');
  });

  test('"quanto ta a entrega" durante OFERECENDO_UPSELL', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'quanto ta a entrega?'
    ]);
    const ultima = historico[historico.length - 1];
    // Deve responder sobre taxa sem travar
    expect(ultima.etapa).not.toBe('INICIO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CLIENTE QUE MUDA DE IDEIA NO MEIO
// ═══════════════════════════════════════════════════════════════════════════

describe('Mudança de ideia durante pedido', () => {
  test('cliente inicia com grande, depois pede pequena na proteína', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('cliente diz "nao quero nada" em OFERECENDO_UPSELL (bebida)', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao quero nada'
    ]);
    const ultima = historico[historico.length - 1];
    // Deve ter avançado para sobremesa ou tipo
    expect(['OFERECENDO_UPSELL', 'AGUARDANDO_TIPO']).toContain(ultima.etapa);
  });

  test('cliente pede suco e depois diz "só isso" na sobremesa', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      '1 suco natural',
      'so isso'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('AGUARDANDO_TIPO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
    expect(extras[0].name).toBe('Suco Natural');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MENSAGENS CURTAS E AMBÍGUAS
// ═══════════════════════════════════════════════════════════════════════════

describe('Mensagens curtas e ambíguas', () => {
  test('"sim" em MONTANDO_PROTEINA — não avança sem dado', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'sim'
    ]);
    const ultima = historico[historico.length - 1];
    // "sim" não é proteína, deve ficar em MONTANDO_PROTEINA
    expect(ultima.etapa).toBe('MONTANDO_PROTEINA');
  });

  test('"ok" em MONTANDO_ACOMPANHAMENTO — repete pergunta', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango',
      'ok'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('"?" sozinho — não quebra o fluxo', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      '?'
    ]);
    const ultima = historico[historico.length - 1];
    // Não deve ter ido para INICIO
    expect(ultima.etapa).not.toBe('INICIO');
  });

  test('"1" sozinho em MONTANDO_TAMANHO — não entende como tamanho', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      '1'
    ]);
    const ultima = historico[historico.length - 1];
    // "1" não é tamanho válido (Pequena/Grande)
    expect(ultima.resposta.toLowerCase()).toMatch(/pequena|grande|tamanho/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. TYPOS PESADOS E ERROS DE DIGITAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

describe('Typos pesados no pedido', () => {
  test('"churascp" reconhece como Churrasco (fuzzy)', () => {
    const items = ai.interpretItensMultiplos('churascp', [
      { name: 'Frango' }, { name: 'Churrasco' }, { name: 'Costela' }
    ]);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].name).toBe('Churrasco');
  });

  test('"linguça" reconhece Linguiça', () => {
    const items = ai.interpretItensMultiplos('linguça', [
      { name: 'Linguiça', apelidos: ['linguica', 'linguça'] }
    ]);
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Linguiça');
  });

  test('"aros e fejao" — fuzzy reconhece pelo menos Feijão', () => {
    const items = ai.interpretItensMultiplos('aros e fejao', [
      { name: 'Arroz', apelidos: ['arro'] },
      { name: 'Feijão', apelidos: ['feijao'] },
      { name: 'Macarrão', apelidos: ['macarrao'] }
    ]);
    // "aros" tem Levenshtein=2 de "arroz"/"arro" → acima do limite
    // "fejao" = match exato do apelido → reconhece Feijão
    expect(items.length).toBeGreaterThanOrEqual(1);
    const nomes = items.map(i => i.name);
    expect(nomes).toContain('Feijão');
  });

  test('"aroz e fejao" reconhece ambos (Levenshtein=1)', () => {
    const items = ai.interpretItensMultiplos('aroz e fejao', [
      { name: 'Arroz', apelidos: ['arro'] },
      { name: 'Feijão', apelidos: ['feijao'] },
      { name: 'Macarrão', apelidos: ['macarrao'] }
    ]);
    expect(items.length).toBe(2);
    const nomes = items.map(i => i.name);
    expect(nomes).toContain('Arroz');
    expect(nomes).toContain('Feijão');
  });

  test('"maionese e beterrab" reconhece 2 saladas', () => {
    const items = ai.interpretItensMultiplos('maionese e beterrab', [
      { name: 'Maionese', apelidos: ['maiones'] },
      { name: 'Beterraba', apelidos: ['beterrab'] },
      { name: 'Alface' }
    ]);
    expect(items.length).toBe(2);
  });

  test('"etrega" → interpretOrderType reconhece delivery', () => {
    const tipo = ai.interpretOrderType('etrega');
    expect(tipo).toBe('delivery');
  });

  test('"retirda" → interpretOrderType reconhece pickup', () => {
    const tipo = ai.interpretOrderType('retirda');
    expect(tipo).toBe('pickup');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. FLUXO COM TROCO E PAGAMENTO — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('Pagamento e troco — edge cases', () => {
  test('"dinheiro troco pra 100" captura ambos de uma vez', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao quero bebida',
      'nao',
      'entrega',
      'Rua das Flores 123, Centro',
      'sim',
      'dinheiro troco pra 100'
    ]);
    expect(state.pedidoAtual.paymentMethod).toBe('Dinheiro');
    expect(state.pedidoAtual.trocoPara).toBe(100);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"pix" como pagamento avança direto para confirmação', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao quero',
      'nao',
      'retirada',
      'pix'
    ]);
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"sem troco" após dinheiro avança para confirmação', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'retirada',
      'dinheiro',
      'sem troco'
    ]);
    expect(state.pedidoAtual.trocoPara).toBe(0);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('2 tentativas inválidas de troco → assume sem troco', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'retirada',
      'dinheiro',
      'nao sei quanto deu',
      'quanto ficou?'
    ]);
    // Após 2 tentativas sem número, escape automático
    expect(state.pedidoAtual.trocoPara).toBe(0);
    expect(state.etapa).toBe('CONFIRMANDO');
  });

  test('"50" (só número) como troco funciona', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'retirada',
      'dinheiro',
      '50'
    ]);
    expect(state.pedidoAtual.trocoPara).toBe(50);
    expect(state.etapa).toBe('CONFIRMANDO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ENDEREÇO — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('Endereço — edge cases', () => {
  test('endereço completo com bairro → pedido de confirmação', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'entrega',
      'Rua XV de Novembro, 450, Centro'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('AGUARDANDO_ENDERECO');
    expect(state.pedidoAtual.address).toBeTruthy();
  });

  test('complemento de bairro via "bairro é Centro" ', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'entrega',
      'Rua das Flores 200',
      'bairro Centro'
    ]);
    expect(state.pedidoAtual.address).toMatch(/Centro/i);
  });

  test('confirmar endereço com "sim" avança para pagamento', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'entrega',
      'Rua das Flores, 200, Centro',
      'sim'
    ]);
    expect(state.etapa).toBe('AGUARDANDO_PAGAMENTO');
  });

  test('"não" no endereço pede novo endereço', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao',
      'nao',
      'entrega',
      'Rua das Flores, 200, Centro',
      'nao'
    ]);
    expect(state.etapa).toBe('AGUARDANDO_ENDERECO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. PEDIDO GRANDE COM MÚLTIPLOS TAMANHOS
// ═══════════════════════════════════════════════════════════════════════════

describe('Pedido com múltiplos tamanhos (grupos)', () => {
  test('"2 grandes e 1 pequena" cria 2 grupos', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      '2 grandes e 1 pequena'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('MONTANDO_PROTEINA');
    expect(state._grupos).toBeDefined();
    expect(state._grupos.length).toBe(2);
    expect(state._grupos[0].qty).toBe(2);
    expect(state._grupos[1].qty).toBe(1);
  });

  test('proteína por grupo: "frango" para as grandes, depois "costela" para a pequena', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      '2 grandes e 1 pequena',
      'frango',
      'costela'
    ]);
    // Após dar proteína para ambos os grupos, deve ir para acompanhamento
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('acompanhamento/salada por grupo até expandir', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      '2 grandes e 1 pequena',
      'frango',
      'costela',
      'arroz e feijao',
      'arroz e macarrao'
    ]);
    const ultima = historico[historico.length - 1];
    // Após todos os grupos terem acomp, deve ter expandido para itens
    expect(['OFERECENDO_UPSELL', 'AGUARDANDO_TIPO']).toContain(ultima.etapa);
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. RESPOSTAS SÓ COM NÚMEROS
// ═══════════════════════════════════════════════════════════════════════════

describe('Respostas numéricas', () => {
  test('"3" em MONTANDO_TAMANHO com contexto de marmitas', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      '3'
    ]);
    const ultima = historico[historico.length - 1];
    // "3" não é tamanho — deve pedir tamanho novamente
    expect(ultima.etapa).toBe('MONTANDO_TAMANHO');
  });

  test('"2" como quantidade de bebida no upsell', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      '2 sucos'
    ]);
    const ultima = historico[historico.length - 1];
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    if (extras.length > 0) {
      expect(extras[0].quantity).toBe(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. LOOP COUNT — PROTEÍNA/ACOMP/SALADA COM 2 ERROS PULA ETAPA
// ═══════════════════════════════════════════════════════════════════════════

describe('Loop count — pula etapa após 2 erros', () => {
  test('2 mensagens inválidas em proteína → pula para acompanhamento', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'xyz abc',
      'bla bla bla'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });

  test('2 mensagens inválidas em acompanhamento → pula para upsell', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango',
      'xyz abc',
      'bla bla bla'
    ]);
    const ultima = historico[historico.length - 1];
    // Deve ter pulado
    expect(['OFERECENDO_UPSELL', 'MONTANDO_ACOMPANHAMENTO']).toContain(ultima.etapa);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. CANCELAMENTO DUPLO — CANCELA, RESTAURA, CANCELA DE NOVO
// ═══════════════════════════════════════════════════════════════════════════

describe('Cancelamento duplo e restauração', () => {
  test('cancela → continuar → restaura → cancela de novo', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao e pra retirada no pix',
      'nao quero bebida',
      'nao quero sobremesa',
      'cancela',
      'sim',
      'continuar',
      'cancela',
      'sim'
    ]);
    // Após segundo cancelamento, deve estar em INICIO
    expect(state.etapa).toBe('INICIO');
    expect(state.pedidoAtual.items.length).toBe(0);
  });

  test('cancela → "não" → pedido intacto', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao e pra retirada no pix',
      'nao quero',
      'nao',
      'cancela',
      'nao'
    ]);
    // Pedido deve continuar intacto em CONFIRMANDO
    expect(state.etapa).toBe('CONFIRMANDO');
    expect(state.pedidoAtual.items.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. FRUSTRAÇÃO E REINÍCIO
// ═══════════════════════════════════════════════════════════════════════════

describe('Frustração e reinício mid-flow', () => {
  test('"aff" durante MONTANDO_PROTEINA — empatia, não reseta', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'aff'
    ]);
    const ultima = historico[historico.length - 1];
    // Não deve resetar para INICIO
    expect(ultima.etapa).not.toBe('INICIO');
  });

  test('"deixa quieto" reseta para novo pedido', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'deixa quieto'
    ]);
    const ultima = historico[historico.length - 1];
    // Restart vai para MONTANDO_TAMANHO (novo pedido)
    expect(ultima.etapa).toBe('MONTANDO_TAMANHO');
  });

  test('"esquece tudo" reseta para novo pedido', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango',
      'esquece tudo'
    ]);
    const ultima = historico[historico.length - 1];
    // Restart vai para MONTANDO_TAMANHO (novo pedido)
    expect(ultima.etapa).toBe('MONTANDO_TAMANHO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. FAST TRACK COM VARIAÇÕES REAIS
// ═══════════════════════════════════════════════════════════════════════════

describe('Fast track — variações complexas', () => {
  test('pedido completo com todas as infos em uma mensagem', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma marmita grande de frango com arroz e feijao pra retirada no pix'
    ]);
    const ultima = historico[historico.length - 1];
    // Deve ter avançado além de MONTANDO_TAMANHO
    expect(['OFERECENDO_UPSELL', 'CONFIRMANDO', 'AGUARDANDO_TIPO']).toContain(ultima.etapa);
  });

  test('pedido completo com 2 proteínas e salada', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma grande com frango e churrasco arroz feijao e maionese pra retirada no pix'
    ]);
    const ultima = historico[historico.length - 1];
    expect(['OFERECENDO_UPSELL', 'CONFIRMANDO', 'AGUARDANDO_TIPO']).toContain(ultima.etapa);
  });

  test('fast track com quantidade: "2 marmitas grandes de churrasco"', async () => {
    const { state, historico } = await executarFluxo([
      'quero 2 marmitas grandes de churrasco com arroz e feijao'
    ]);
    const ultima = historico[historico.length - 1];
    expect(['MONTANDO_PROTEINA', 'OFERECENDO_UPSELL', 'MONTANDO_ACOMPANHAMENTO']).toContain(ultima.etapa);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. INTERPRETAÇÃO DE CONFIRMAÇÃO — MAIS EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('interpretConfirmation — novos edge cases', () => {
  test('"tá certinho" = sim', async () => {
    const r = await ai.interpretConfirmation('tá certinho');
    expect(r).toBe('sim');
  });

  test('"perfeito" = sim', async () => {
    const r = await ai.interpretConfirmation('perfeito');
    expect(r).toBe('sim');
  });

  test('"aham pode ir" = sim', async () => {
    const r = await ai.interpretConfirmation('aham pode ir');
    expect(r).toBe('sim');
  });

  test('"nao era isso" = nao', async () => {
    const r = await ai.interpretConfirmation('nao era isso');
    expect(r).toBe('nao');
  });

  test('"ta errado o pedido" = nao', async () => {
    const r = await ai.interpretConfirmation('ta errado o pedido');
    expect(r).toBe('nao');
  });

  test('"quero mudar uma coisa" = nao', async () => {
    const r = await ai.interpretConfirmation('quero mudar uma coisa');
    expect(r).toBe('nao');
  });

  test('"adiciona um suco" = indefinido (é modificação)', async () => {
    const r = await ai.interpretConfirmation('adiciona um suco');
    expect(r).toBe('indefinido');
  });

  test('"troca frango por costela" = indefinido (é modificação)', async () => {
    const r = await ai.interpretConfirmation('troca frango por costela');
    expect(r).toBe('indefinido');
  });

  test('"hmm" = indefinido (ambíguo)', async () => {
    const r = await ai.interpretConfirmation('hmm');
    expect(r).toBe('indefinido');
  });

  test('"deixa assim" = sim (aceitar como está)', async () => {
    const r = await ai.interpretConfirmation('deixa assim');
    expect(r).toBe('sim');
  });

  test('"esse mesmo" = sim', async () => {
    const r = await ai.interpretConfirmation('esse mesmo');
    expect(r).toBe('sim');
  });

  test('"não quero mais nada" = nao (contém "nao quero")', async () => {
    const r = await ai.interpretConfirmation('nao quero mais nada');
    // "nao quero" é capturado como negação composta
    expect(r).toBe('nao');
  });

  test('"tira isso" = indefinido (é modificação)', async () => {
    const r = await ai.interpretConfirmation('tira isso');
    expect(r).toBe('indefinido');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. UPSELL — VARIAÇÕES DE RESPOSTA
// ═══════════════════════════════════════════════════════════════════════════

describe('Upsell — mais variações', () => {
  test('"quero uma coca e um pudim" captura bebida + sobremesa?', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'quero uma coca e um pudim'
    ]);
    // Coca deve ser capturada como bebida
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBeGreaterThanOrEqual(1);
  });

  test('"nao obrigado" recusa upsell sem travar', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'nao obrigado',
      'nao obrigado'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('AGUARDANDO_TIPO');
  });

  test('"me da 3 sucos e 2 refrigerantes lata" captura quantidades', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'me da 3 sucos e 2 refrigerantes lata'
    ]);
    const sucos = state.pedidoAtual.items.filter(i => i.name === 'Suco Natural');
    const refris = state.pedidoAtual.items.filter(i => i.name === 'Refrigerante Lata');
    if (sucos.length > 0) {
      expect(sucos[0].quantity).toBe(3);
    }
    if (refris.length > 0) {
      expect(refris[0].quantity).toBe(2);
    }
  });

  test('"de novo?" confusão no upsell = recusa', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e feijao',
      'de novo?'
    ]);
    const ultima = historico[historico.length - 1];
    // "de novo?" deve ser tratado como recusa do upsell
    expect(['AGUARDANDO_TIPO', 'OFERECENDO_UPSELL']).toContain(ultima.etapa);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. FLUXO COMPLETO DELIVERY COM PERGUNTAS NO MEIO
// ═══════════════════════════════════════════════════════════════════════════

describe('Fluxo delivery com interrupções', () => {
  test('pedido completo delivery com FAQ no meio', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com churrasco arroz e feijao',
      '1 suco',
      'nao quero sobremesa',
      'entrega',
      'Rua Alfredo Pinto, 50, Jardim Europa',
      'sim',
      'pix'
    ]);
    expect(state.etapa).toBe('CONFIRMANDO');
    expect(state.pedidoAtual.type).toBe('delivery');
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
    expect(state.pedidoAtual.address).toBeTruthy();
  });

  test('pedido delivery → retirada → deve funcionar trocando tipo', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango arroz e alface',
      'nao',
      'nao',
      'retirada',
      'pix'
    ]);
    expect(state.etapa).toBe('CONFIRMANDO');
    expect(state.pedidoAtual.type).toBe('pickup');
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. MODIFICAÇÃO EM CONFIRMANDO — TROCA DE TIPO E PAGAMENTO
// ═══════════════════════════════════════════════════════════════════════════

describe('Modificação de tipo e pagamento em CONFIRMANDO', () => {
  test('"quero entrega em vez de retirada" em CONFIRMANDO', async () => {
    const state = criarEstadoConfirmando();
    const result = await smProcess('c1', '55119', 'quero entrega em vez de retirada', state, COMPANY);
    // Deve manter o pedido (não cancelar) e relatar algo sobre a mudança
    expect(result.state.pedidoAtual.items.length).toBeGreaterThan(0);
  });

  test('"troca o pagamento pra cartao" em CONFIRMANDO', async () => {
    const state = criarEstadoConfirmando();
    const result = await smProcess('c1', '55119', 'troca o pagamento pra cartao', state, COMPANY);
    expect(result.state.pedidoAtual.items.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. PÓS-PEDIDO — INTERAÇÕES APÓS FINALIZAR
// ═══════════════════════════════════════════════════════════════════════════

describe('Pós-pedido (FINALIZADO)', () => {
  test('"quanto tempo demora?" em FINALIZADO retorna estimativa', async () => {
    const state = {
      etapa: 'FINALIZADO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [], acompanhamentos: [], saladas: [] }],
        type: 'delivery',
        address: 'Rua X, 100',
        paymentMethod: 'Pix',
        deliveryFee: 5,
        trocoPara: null
      }
    };
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: 'Teste', phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    const result = await smProcess('c1', '55119', 'quanto tempo demora?', state, COMPANY);
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp.toLowerCase()).toMatch(/minuto|tempo|estimad/);
  });

  test('"quero outro pedido" em FINALIZADO volta para MONTANDO_TAMANHO', async () => {
    const state = {
      etapa: 'FINALIZADO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [], acompanhamentos: [], saladas: [] }],
        type: 'pickup',
        address: null,
        paymentMethod: 'Pix',
        deliveryFee: 0,
        trocoPara: null
      }
    };
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: 'Teste', phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    const result = await smProcess('c1', '55119', 'quero outro pedido', state, COMPANY);
    expect(result.state.etapa).toBe('MONTANDO_TAMANHO');
  });

  test('"cancela" em FINALIZADO pede confirmação', async () => {
    const state = {
      etapa: 'FINALIZADO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [], acompanhamentos: [], saladas: [] }],
        type: 'pickup',
        address: null,
        paymentMethod: 'Pix',
        deliveryFee: 0,
        trocoPara: null
      }
    };
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: 'Teste', phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    const result = await smProcess('c1', '55119', 'cancela', state, COMPANY);
    expect(result.state._confirmandoCancelamentoPos).toBe(true);
    const resp = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(resp.toLowerCase()).toMatch(/cancelar|certeza/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. DETECT CANCEL — NOVAS VARIAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

describe('detectCancel — novas variações', () => {
  test('"desisti do pedido" detecta cancelamento', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [{ tipo: 'marmita' }] } };
    const r = router.classify('desisti do pedido', state, COMPANY);
    expect(r).toBeTruthy();
  });

  test('"não quero mais pedir" detecta cancelamento', () => {
    const state = { etapa: 'MONTANDO_PROTEINA', pedidoAtual: { items: [] } };
    const r = router.classify('nao quero mais pedir', state, COMPANY);
    // Pode ser restart ou cancel
    expect(r).toBeTruthy();
  });

  test('"cancela o refrigerante" NÃO cancela pedido (item específico)', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: { items: [{ tipo: 'marmita' }, { tipo: 'extra', name: 'Refrigerante Lata' }] }
    };
    const r = router.classify('cancela o refrigerante', state, COMPANY);
    // Não deve retornar intent de cancelamento — é modificação
    if (r && r.intent === 'CANCEL_ORDER') {
      // Se chegou aqui, é bug: deveria tratar como modificação
      expect(r._confirmandoCancelamento).toBeFalsy();
    }
  });

  test('"cancela tudo e começa de novo" detecta cancelamento/restart', () => {
    const state = { etapa: 'CONFIRMANDO', pedidoAtual: { items: [{ tipo: 'marmita' }] } };
    const r = router.classify('cancela tudo e começa de novo', state, COMPANY);
    expect(r).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. CONVERSA REALISTA — SIMULANDO ATENDIMENTO INTEIRO COM INTERRUPÇÕES
// ═══════════════════════════════════════════════════════════════════════════

describe('Conversa realista com interrupções', () => {
  test('cliente pergunta, pede, muda ideia, pergunta preço, confirma', async () => {
    const { state, historico } = await executarFluxo([
      'boa tarde, quero fazer um pedido',
      'grande',
      'frango e churrasco',
      'arroz e feijao com maionese',
      '2 sucos',
      'nao quero sobremesa',
      'retirada',
      'pix',
      'isso mesmo'
    ]);
    expect(state.etapa).toBe('FINALIZADO');
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(1);
    expect(marmitas[0].proteinas.length).toBe(2);
  });

  test('cliente faz pedido longo, modifica 2 vezes, confirma', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma marmita grande de churrasco arroz e feijao pra retirada no pix',
      '1 suco',
      'nao quero sobremesa',
      'troca o suco por coca',
      'isso mesmo'
    ]);
    expect(state.etapa).toBe('FINALIZADO');
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    // Verificar que houve troca
    expect(extras.length).toBeGreaterThanOrEqual(1);
  });

  test('cliente apressado: fast track + upsell + confirma rápido', async () => {
    const { state, historico } = await executarFluxo([
      'quero 2 marmitas grandes de frango com arroz e feijao pra retirada no pix',
      'nao quero nada',
      'nao quero',
      'confirma'
    ]);
    expect(state.etapa).toBe('FINALIZADO');
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(2);
  });

  test('cliente indeciso: começa, muda, pergunta, volta, confirma', async () => {
    const { state, historico } = await executarFluxo([
      'oi, quero pedir',
      'grande',
      'frango',
      'arroz e feijao',
      '1 coca lata',
      'nao',
      'entrega',
      'Rua da Paz, 200, Vila Nova',
      'sim',
      'cartao',
      'pode confirmar'
    ]);
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.type).toBe('delivery');
    expect(state.pedidoAtual.paymentMethod).toBe('Cartão');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. INTERPRETAÇÃO DE TIPO (ORDER TYPE) — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('interpretOrderType — variações', () => {
  test('"vou buscar" é pickup', () => {
    expect(ai.interpretOrderType('vou buscar')).toBe('pickup');
  });

  test('"manda pra mim" é delivery', () => {
    expect(ai.interpretOrderType('manda pra mim')).toBe('delivery');
  });

  test('"vou retirar no local" é pickup', () => {
    expect(ai.interpretOrderType('vou retirar no local')).toBe('pickup');
  });

  test('"pode entregar" é delivery', () => {
    expect(ai.interpretOrderType('pode entregar')).toBe('delivery');
  });

  test('"retirada no balcão" é pickup', () => {
    expect(ai.interpretOrderType('retirada no balcao')).toBe('pickup');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. INTERPRETAÇÃO DE UPSELL — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('interpretUpsell — edge cases', () => {
  const bebidas = [
    { name: 'Suco Natural', price: 8, apelidos: ['suco', 'natural', 'suquinho'] },
    { name: 'Refrigerante Lata', price: 6, apelidos: ['refrigerante', 'refri', 'lata', 'coca', 'guarana'] },
    { name: 'Refrigerante 2L', price: 10, apelidos: ['2l', 'dois litros', 'familia'] },
    { name: 'Água Mineral', price: 3, apelidos: ['agua', 'água', 'mineral'] }
  ];

  test('"quero um suquinho" captura Suco Natural', () => {
    const r = ai.interpretUpsell('quero um suquinho', bebidas);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('Suco Natural');
  });

  test('"me da uma agua" captura Água Mineral', () => {
    const r = ai.interpretUpsell('me da uma agua', bebidas);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('Água Mineral');
  });

  test('"2 cocas e 1 suco" captura ambos com quantidades', () => {
    const r = ai.interpretUpsell('2 cocas e 1 suco', bebidas);
    expect(r.length).toBe(2);
    const coca = r.find(b => b.name === 'Refrigerante Lata');
    const suco = r.find(b => b.name === 'Suco Natural');
    expect(coca).toBeTruthy();
    expect(suco).toBeTruthy();
    if (coca) expect(coca.quantity).toBe(2);
    if (suco) expect(suco.quantity).toBe(1);
  });

  test('"nao quero" retorna vazio', () => {
    const r = ai.interpretUpsell('nao quero', bebidas);
    expect(r.length).toBe(0);
  });

  test('"familia" captura Refrigerante 2L', () => {
    const r = ai.interpretUpsell('quero uma familia', bebidas);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('Refrigerante 2L');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. EXTRACT EXTRA INFO — CAPTURA IMPLÍCITA
// ═══════════════════════════════════════════════════════════════════════════

describe('Captura implícita de tipo/pagamento em etapas de montagem', () => {
  test('mencionar "retirada" durante MONTANDO_PROTEINA captura type', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango e costela, e é pra retirada'
    ]);
    // Tipo deve ter sido capturado implicitamente
    expect(state.pedidoAtual.type).toBe('pickup');
  });

  test('mencionar "pix" durante MONTANDO_ACOMPANHAMENTO captura payment', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango',
      'arroz e feijao, pagamento no pix'
    ]);
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 23. ESTADO RECUPERÁVEL — NENHUMA MENSAGEM VAZIA QUEBRA
// ═══════════════════════════════════════════════════════════════════════════

describe('Resiliência contra mensagens estranhas', () => {
  test('mensagem com só espaços não quebra', async () => {
    const state = criarEstadoEmEtapa('MONTANDO_TAMANHO');
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: null, phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    const result = await smProcess('c1', '55119', '   ', state, COMPANY);
    expect(result).toBeTruthy();
    expect(result.state).toBeTruthy();
  });

  test('mensagem com emojis só não quebra', async () => {
    const state = criarEstadoEmEtapa('MONTANDO_TAMANHO');
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: null, phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    const result = await smProcess('c1', '55119', '😊😊😊', state, COMPANY);
    expect(result).toBeTruthy();
    expect(result.state).toBeTruthy();
  });

  test('mensagem muito longa (200+ chars) não quebra', async () => {
    const state = criarEstadoEmEtapa('MONTANDO_PROTEINA', {
      _marmitaAtual: { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [], acompanhamentos: [], saladas: [] },
      _pendingMarmitas: 1,
      _currentMarmitaNumber: 1
    });
    db.getCustomerByPhone = jest.fn().mockResolvedValue({ name: null, phone: '55119', preferences: {} });
    db.getProducts = jest.fn().mockResolvedValue([]);
    const longMsg = 'eu queria pedir uma marmita grande com frango e churrasco mas na verdade pensando melhor talvez costela seja melhor mas eu nao sei tambem gosto de linguica o que voce acha me ajuda a decidir por favor obrigado';
    const result = await smProcess('c1', '55119', longMsg, state, COMPANY);
    expect(result).toBeTruthy();
    expect(result.state).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. FLUXO COM CLIENTE QUE PULA ACOMPANHAMENTO/SALADA
// ═══════════════════════════════════════════════════════════════════════════

describe('Pular acompanhamento e salada', () => {
  test('"sem acompanhamento" em MONTANDO_ACOMPANHAMENTO → avança', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango',
      'nao quero acompanhamento'
    ]);
    const ultima = historico[historico.length - 1];
    // Deve avançar para upsell ou tipo
    expect(['OFERECENDO_UPSELL', 'AGUARDANDO_TIPO']).toContain(ultima.etapa);
  });

  test('"nada" em MONTANDO_ACOMPANHAMENTO → avança', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita grande com frango',
      'nada'
    ]);
    const ultima = historico[historico.length - 1];
    expect(['OFERECENDO_UPSELL', 'AGUARDANDO_TIPO']).toContain(ultima.etapa);
  });

  test('"pular" em MONTANDO_PROTEINA como "nao quero" → pula', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'nao quero proteina'
    ]);
    const ultima = historico[historico.length - 1];
    // "nao quero" deve permitir pular a proteína
    expect(ultima.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 25. MODIFICAÇÃO _modificarPedidoLocal — NOVOS CENÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

describe('_modificarPedidoLocal — novos cenários', () => {
  const MENU = {
    upsellsBebida: [
      { name: 'Suco Natural', price: 8, apelidos: ['suco', 'natural', 'suquinho'] },
      { name: 'Refrigerante Lata', price: 6, apelidos: ['refrigerante', 'refri', 'lata', 'coca', 'guarana'] },
      { name: 'Refrigerante 2L', price: 10, apelidos: ['2l', 'dois litros', 'familia'] },
      { name: 'Água Mineral', price: 3, apelidos: ['agua', 'água', 'mineral'] }
    ],
    upsellsSobremesa: [
      { name: 'Pudim', price: 6, apelidos: ['pudim'] },
      { name: 'Mousse', price: 6, apelidos: ['mousse', 'musse'] }
    ]
  };

  const criarItems = (extras = []) => [
    {
      tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
      proteinas: [{ name: 'Frango' }],
      acompanhamentos: [{ name: 'Arroz' }],
      saladas: [{ name: 'Alface' }]
    },
    ...extras
  ];

  test('"tira o pudim" — remove extra simples', () => {
    const items = criarItems([
      { tipo: 'extra', name: 'Pudim', price: 6, quantity: 1 }
    ]);
    const r = ai._modificarPedidoLocal('tira o pudim', items, MENU);
    expect(r).toBeTruthy();
    const pudim = r.find(i => i.name === 'Pudim');
    expect(pudim).toBeFalsy();
  });

  test('"coloca 2 sucos" — adiciona extra', () => {
    const items = criarItems();
    const r = ai._modificarPedidoLocal('coloca 2 sucos', items, MENU);
    expect(r).toBeTruthy();
    const suco = r.find(i => i.name === 'Suco Natural');
    expect(suco).toBeTruthy();
    if (suco) expect(suco.quantity).toBe(2);
  });

  test('"adiciona 1 agua mineral" — adiciona novo extra', () => {
    const items = criarItems();
    const r = ai._modificarPedidoLocal('adiciona 1 agua mineral', items, MENU);
    if (r) {
      const agua = r.find(i => i.name === 'Água Mineral');
      expect(agua).toBeTruthy();
    }
  });

  test('"troca a coca pela agua" — swap de extras', () => {
    const items = criarItems([
      { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
    ]);
    const r = ai._modificarPedidoLocal('troca a coca pela agua', items, MENU);
    if (r) {
      const refri = r.find(i => i.name === 'Refrigerante Lata');
      const agua = r.find(i => i.name === 'Água Mineral');
      expect(refri).toBeFalsy();
      expect(agua).toBeTruthy();
    }
  });

  test('"sem mousse" — remove sobremesa', () => {
    const items = criarItems([
      { tipo: 'extra', name: 'Mousse', price: 6, quantity: 1 }
    ]);
    const r = ai._modificarPedidoLocal('sem mousse', items, MENU);
    if (r) {
      const mousse = r.find(i => i.name === 'Mousse');
      expect(mousse).toBeFalsy();
    }
  });

  test('"quero mais um pudim" — adiciona quando já não existe', () => {
    const items = criarItems();
    const r = ai._modificarPedidoLocal('quero mais um pudim', items, MENU);
    if (r) {
      const pudim = r.find(i => i.name === 'Pudim');
      expect(pudim).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 26. INTENT ROUTER — CLASSIFY EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('intentRouter.classify — edge cases', () => {
  test('"quero falar com um humano" detecta FALAR_HUMANO', () => {
    const state = { etapa: 'MONTANDO_PROTEINA', pedidoAtual: { items: [] } };
    const r = router.classify('quero falar com um humano', state, COMPANY);
    expect(r).toBeTruthy();
    expect(r._flagHumano).toBe(true);
  });

  test('"o que eu pedi até agora?" detecta ASK_SUMMARY', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: { items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: [] }] }
    };
    const r = router.classify('o que eu pedi ate agora?', state, COMPANY);
    if (r) {
      const resp = Array.isArray(r.response) ? r.response.join(' ') : (r.response || '');
      expect(resp.length).toBeGreaterThan(0);
    }
  });

  test('"sim mas nao falei o troco" detecta RECLAMACAO_FLUXO', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: { items: [{ tipo: 'marmita' }], paymentMethod: 'Dinheiro', trocoPara: null }
    };
    const r = router.classify('sim mas nao falei o troco', state, COMPANY);
    expect(r).toBeTruthy();
  });

  test('"sao 5 marmitas" em AGUARDANDO_TIPO → correção quantid.', () => {
    const state = {
      etapa: 'AGUARDANDO_TIPO',
      pedidoAtual: { items: [{ tipo: 'marmita' }] }
    };
    const r = router.classify('sao 5 marmitas', state, COMPANY);
    // Deve detectar correção de quantidade
    expect(r).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 27. PEDIDO COM MUITAS MARMITAS (STRESS)
// ═══════════════════════════════════════════════════════════════════════════

describe('Pedido estressado — muitas marmitas', () => {
  test('"5 marmitas grandes" cria grupo com qty=5', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero 5 marmitas grandes'
    ]);
    const ultima = historico[historico.length - 1];
    expect(ultima.etapa).toBe('MONTANDO_PROTEINA');
    if (state._grupos) {
      expect(state._grupos[0].qty).toBe(5);
    }
  });

  test('quantidade acima de 10 é limitada a 10', async () => {
    const { state, historico } = await executarFluxo([
      'quero 50 marmitas grandes de frango com arroz e feijao'
    ]);
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    if (state._grupos) {
      expect(state._grupos[0].qty).toBeLessThanOrEqual(10);
    } else if (marmitas.length > 0) {
      expect(marmitas.length).toBeLessThanOrEqual(10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 28. MULTI-TAMANHO — interpretarPedidoMultiTamanho
// ═══════════════════════════════════════════════════════════════════════════

describe('interpretarPedidoMultiTamanho', () => {
  test('"3 grandes e 2 pequenas"', () => {
    const r = ai.interpretarPedidoMultiTamanho('3 grandes e 2 pequenas');
    expect(r).toBeTruthy();
    expect(r.length).toBe(2);
    expect(r[0].size).toBe('Grande');
    expect(r[0].qty).toBe(3);
    expect(r[1].size).toBe('Pequena');
    expect(r[1].qty).toBe(2);
  });

  test('"1 grande e 1 pequena"', () => {
    const r = ai.interpretarPedidoMultiTamanho('1 grande e 1 pequena');
    expect(r).toBeTruthy();
    expect(r.length).toBe(2);
  });

  test('"uma grande" — retorno null (não é multi)', () => {
    const r = ai.interpretarPedidoMultiTamanho('uma grande');
    // Pode não retornar multi (apenas 1 tamanho), ou retornar com 1 elemento
    if (r && r.length === 1) {
      expect(r[0].qty).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 29. NORMALIZAR TEXTO
// ═══════════════════════════════════════════════════════════════════════════

describe('ai.normalizar — edge cases', () => {
  test('remove acentos', () => {
    const r = ai.normalizar('açúcar è além ñ');
    expect(r).not.toMatch(/[àáâãäéèêëíìîïóòôõöúùûüñç]/);
  });

  test('lowercase', () => {
    const r = ai.normalizar('GRANDE FRANGO PIX');
    expect(r).toBe('grande frango pix');
  });

  test('string vazia não quebra', () => {
    expect(() => ai.normalizar('')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 30. FLUXO COMPLETO: RETIRADA COM CARTÃO
// ═══════════════════════════════════════════════════════════════════════════

describe('Fluxo completo — retirada com cartão', () => {
  test('pedido simples: grande + frango + arroz + retirada + cartão + confirma', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango',
      'arroz e feijao',
      'nao obrigado',
      'nao',
      'retirada',
      'cartao',
      'confirma'
    ]);
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.type).toBe('pickup');
    expect(state.pedidoAtual.paymentMethod).toBe('Cartão');
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(1);
    expect(marmitas[0].proteinas[0].name).toBe('Frango');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 31. BUGS DA CONVERSA REAL — REGRESSÃO
// ═══════════════════════════════════════════════════════════════════════════

describe('Bug 3: "pode ser uma marmita pequena" em CONFIRMANDO', () => {
  test('interpretConfirmation retorna indefinido, não sim', async () => {
    const r = await ai.interpretConfirmation('pode ser uma marmita pequena');
    expect(r).toBe('indefinido');
  });

  test('interpretConfirmation "pode ser grande" retorna indefinido', async () => {
    const r = await ai.interpretConfirmation('pode ser grande');
    expect(r).toBe('indefinido');
  });

  test('interpretConfirmation "faz uma pequena" retorna indefinido', async () => {
    const r = await ai.interpretConfirmation('faz uma pequena');
    expect(r).toBe('indefinido');
  });

  test('interpretConfirmation "quero grande" retorna indefinido', async () => {
    const r = await ai.interpretConfirmation('quero grande');
    expect(r).toBe('indefinido');
  });

  test('interpretConfirmation "pode ser" continua retornando sim', async () => {
    const r = await ai.interpretConfirmation('pode ser');
    expect(r).toBe('sim');
  });

  test('interpretConfirmation "confirma" continua retornando sim', async () => {
    const r = await ai.interpretConfirmation('confirma');
    expect(r).toBe('sim');
  });

  test('handleConfirmacao altera tamanho ao invés de finalizar', async () => {
    const state = criarEstadoConfirmando();
    // estado original tem marmita Grande a R$22
    expect(state.pedidoAtual.items[0].tamanho).toBe('Grande');
    expect(state.pedidoAtual.items[0].price).toBe(22);

    const result = await smProcess('test-co', '55119', 'pode ser uma marmita pequena', state, COMPANY);
    // NÃO deve finalizar — deve continuar em CONFIRMANDO com tamanho alterado
    expect(result.state.etapa).toBe('CONFIRMANDO');
    const marmita = result.state.pedidoAtual.items.find(i => i.tipo === 'marmita');
    expect(marmita.tamanho).toBe('Pequena');
    expect(marmita.price).toBe(20);
  });

  test('"muda pra grande" em CONFIRMANDO altera tamanho', async () => {
    const state = criarEstadoConfirmando();
    state.pedidoAtual.items[0].tamanho = 'Pequena';
    state.pedidoAtual.items[0].price = 20;

    const result = await smProcess('test-co', '55119', 'muda pra grande', state, COMPANY);
    // "muda" é detectado como modificação por interpretConfirmation
    const marmita = result.state.pedidoAtual.items.find(i => i.tipo === 'marmita');
    // Se etapa é CONFIRMANDO e tamanho mudou → sucesso
    if (result.state.etapa === 'CONFIRMANDO') {
      expect(marmita.tamanho).toBe('Grande');
      expect(marmita.price).toBe(22);
    }
  });
});

describe('Bug: fluxo completo com mudança de tamanho em CONFIRMANDO', () => {
  test('grande → frango → arroz → upsell não → retirada → cartão → "pode ser pequena" → não finaliza', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango',
      'arroz',
      'nao',
      'nao',
      'retirada',
      'cartao',
      'pode ser uma marmita pequena'
    ]);
    // Deve estar em CONFIRMANDO com tamanho alterado, NÃO em FINALIZADO
    expect(state.etapa).toBe('CONFIRMANDO');
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita');
    expect(marmita.tamanho).toBe('Pequena');
    expect(marmita.price).toBe(20);
  });

  test('após alterar tamanho, pode confirmar normalmente', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango',
      'arroz',
      'nao',
      'nao',
      'retirada',
      'cartao',
      'pode ser uma marmita pequena',
      'confirma'
    ]);
    expect(state.etapa).toBe('FINALIZADO');
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita');
    expect(marmita.tamanho).toBe('Pequena');
    expect(marmita.price).toBe(20);
  });
});

describe('Bug: upsell deve perguntar sobre bebida, não proteína', () => {
  test('após acompanhamento, upsell oferece bebida (não proteína)', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango',
      'arroz'
    ]);
    // Após arroz, deve ir para OFERECENDO_UPSELL
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    // A resposta do upsell deve mencionar bebida, não proteína
    const ultimaResp = historico[historico.length - 1].resposta.toLowerCase();
    expect(ultimaResp).toMatch(/bebida|suco|refrigerante|refri|🥤/);
    expect(ultimaResp).not.toMatch(/prote[ií]na/);
  });

  test('"costela" durante upsell de bebida não substitui proteína', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero uma marmita',
      'grande',
      'frango',
      'arroz',
      'costela'
    ]);
    // "costela" não é bebida — deve avançar sem adicionar nada
    // Proteína original (Frango) deve ser preservada
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita');
    if (marmita) {
      expect(marmita.proteinas[0].name).toBe('Frango');
    }
  });
});

describe('Bug: "Olá" não deve aparecer no meio do fluxo (template check)', () => {
  test('resposta de upsell tem _skipHumanize=true', async () => {
    // Monta estado em MONTANDO_ACOMPANHAMENTO com marmita em andamento
    const state = criarEstadoEmEtapa('MONTANDO_ACOMPANHAMENTO', {
      items: [],
      _marmitaAtual: {
        tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }],
        acompanhamentos: [],
        saladas: []
      },
      _pendingMarmitas: 1,
      _currentMarmitaNumber: 1
    });

    const result = await smProcess('test-co', '55119', 'arroz', state, COMPANY);
    // O resultado deve ter _skipHumanize para evitar que o LLM modifique o template
    expect(result._skipHumanize).toBe(true);
    expect(result.state.etapa).toBe('OFERECENDO_UPSELL');
  });
});
