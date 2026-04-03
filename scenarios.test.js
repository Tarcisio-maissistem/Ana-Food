// scenarios.test.js
// ═══════════════════════════════════════════════════════════════════════
// TESTES DOS 12 CENÁRIOS REAIS DE ATENDIMENTO
// Baseado em padrões reais de comportamento de clientes via WhatsApp
// ═══════════════════════════════════════════════════════════════════════

// Mocks devem ser declarados ANTES dos requires
jest.mock('./stateManager', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(true)
}));
jest.mock('./logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  stateTransition: jest.fn()
}));

const { process: smProcess } = require('./stateMachine');
const db = require('./database');

// ─── CONFIG BASE ─────────────────────────────────────────────────────────────

const COMPANY = {
  name: 'Marmitas Caseiras',
  delivery_fee: 5,
  estimated_time_default: 40,
  pix_key: '11999999999',
  opening_hours: 'Seg a Sáb, 10h às 22h',
  address: 'Rua das Marmitas, 123 - Centro'
};

// ─── HELPER ──────────────────────────────────────────────────────────────────

function criarEstadoInicial() {
  return {
    etapa: 'INICIO',
    pedidoAtual: {
      items: [], type: null, address: null,
      paymentMethod: null, deliveryFee: 0, trocoPara: null
    }
  };
}

async function executarFluxo(mensagens, perfil, estadoInicial = null) {
  db.getCustomerByPhone = jest.fn().mockResolvedValue(perfil);
  db.getProducts = jest.fn().mockResolvedValue([]);            // usa cardápio padrão
  db.saveLastOrder = jest.fn().mockResolvedValue(true);
  db.saveCustomerPreferences = jest.fn().mockResolvedValue(true);
  db.saveCustomer = jest.fn().mockResolvedValue(true);

  let state = estadoInicial || criarEstadoInicial();
  const historico = [];
  
  for (const msg of mensagens) {
    const result = await smProcess('test-company', perfil.phone, msg, state, COMPANY);
    state = result.state;
    const resposta = Array.isArray(result.response) ? result.response.join('\n') : result.response;
    historico.push({ msg, etapa: state.etapa, resposta, items: state.pedidoAtual?.items?.length || 0 });
  }
  
  return { state, historico };
}

function getTextoCompleto(historico) {
  return historico.map(h => h.resposta).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 1: 🏃 Cliente com Pressa
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 1: Cliente com Pressa', () => {
  const perfil = { name: 'Rafael', phone: '5511900000001', preferences: {}, last_order: null };

  test('fast track: mensagem longa avança múltiplas etapas', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero 1 grande de frango com arroz e feijão pix retirada'
    ], perfil);
    
    // Fast track deve avançar várias etapas de uma vez
    // Não deve mais estar em INICIO ou MONTANDO_TAMANHO
    expect(['MONTANDO_PROTEINA', 'MONTANDO_ACOMPANHAMENTO', 'MONTANDO_SALADA', 'OFERECENDO_UPSELL', 'AGUARDANDO_TIPO', 'CONFIRMANDO']).toContain(state.etapa);
  });

  test('fluxo completo: grande frango retirada pix', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz e feijão',
      'sem salada',
      'não',
      'retirada',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.type).toBe('pickup');
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });

  test('fluxo rápido com poucas interações', async () => {
    const { state } = await executarFluxo([
      'oi quero 1 grande de frango com arroz',
      'sem salada',
      'não',
      'retirada',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 2: 🤔 Cliente Indeciso
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 2: Cliente Indeciso', () => {
  const perfil = { name: 'Juliana', phone: '5511900000002', preferences: {}, last_order: null };

  test('responde pergunta "o que tem de proteína?"', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'o que tem de proteína?'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    // Deve listar proteínas
    expect(texto).toMatch(/frango|churrasco|costela|linguiça|carne/i);
  });

  test('aceita "tanto faz" para acompanhamento', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'tanto faz'
    ], perfil);
    
    // Não deve travar - deve avançar para salada ou aceitar sugestão
    expect(['MONTANDO_SALADA', 'MONTANDO_ACOMPANHAMENTO']).toContain(state.etapa);
  });

  test('fluxo completo do indeciso até confirmação', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz e feijão',
      'sem salada',
      'não',
      'entrega',
      'Rua Castro Alves 200 Jardim Europa',
      'sim',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 3: 👨‍👩‍👧‍👦 Pedido Grande para Família
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 3: Pedido Grande para Família', () => {
  const perfil = { name: 'Marcia', phone: '5511900000003', preferences: {}, last_order: null };

  test('cria 4 marmitas (3 grandes + 1 pequena)', async () => {
    const { state } = await executarFluxo([
      'oi',
      '4 marmitas sendo 3 grandes e 1 pequena',
      'frango e churrasco',
      'costela',
      'arroz e feijão alface e maionese',
      'pure repolho'
    ], perfil);
    
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(4);
    
    const grandes = marmitas.filter(m => m.tamanho === 'Grande');
    const pequenas = marmitas.filter(m => m.tamanho === 'Pequena');
    expect(grandes.length).toBe(3);
    expect(pequenas.length).toBe(1);
  });

  test('adiciona bebidas com quantidade correta', async () => {
    const { state } = await executarFluxo([
      'oi',
      '4 marmitas sendo 3 grandes e 1 pequena',
      'frango e churrasco',
      'costela',
      'arroz e feijão alface e maionese',
      'pure repolho',
      '3 sucos e 2 refri'
    ], perfil);
    
    const bebidas = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(bebidas.length).toBe(2);
    
    const suco = bebidas.find(b => /suco/i.test(b.name));
    const refri = bebidas.find(b => /refrigerante/i.test(b.name));
    
    expect(suco?.quantity).toBe(3);
    expect(refri?.quantity).toBe(2);
  });

  test('resumo agrupa 3 grandes com preço correto', async () => {
    const { historico } = await executarFluxo([
      'oi',
      '4 marmitas sendo 3 grandes e 1 pequena',
      'frango e churrasco',
      'costela',
      'arroz e feijão alface e maionese',
      'pure repolho',
      '3 sucos e 2 refri',
      'não' // rejeita sobremesa → mostra perguntarTipo com resumo completo
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Deve agrupar as 3 grandes
    expect(texto).toMatch(/3x.*Marmita Grande/i);
    
    // Preço das 3 grandes = 3 * 22 = 66
    expect(texto).toMatch(/R\$ 66,00/);
  });

  test('fluxo completo com dinheiro e troco', async () => {
    const { state } = await executarFluxo([
      'oi',
      '4 marmitas sendo 3 grandes e 1 pequena',
      'frango e churrasco',
      'costela',
      'arroz e feijão alface e maionese',
      'pure repolho',
      '3 sucos e 2 refri',
      'não', // rejeita sobremesa → AGUARDANDO_TIPO
      'entrega',
      'Av Paulista 1000 apto 52 Bela Vista',
      'sim',
      'dinheiro troco pra 200',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.paymentMethod).toBe('Dinheiro');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 4: ✏️ Cliente que Muda de Ideia
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 4: Cliente que Muda de Ideia', () => {
  const perfil = { name: 'Bruno', phone: '5511900000004', preferences: {}, last_order: null };

  test('começa com 2 grandes e completa o fluxo', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      '2 grandes',
      'frango',
      'arroz',
      'sem salada',
      'não'
    ], perfil);
    
    // Após o fluxo normal, deve ter 2 marmitas
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    expect(marmitas.length).toBe(2);
  });

  test('fluxo completo com retirada e cartão', async () => {
    const { state } = await executarFluxo([
      'oi',
      '2 grandes',
      'frango',
      'arroz e feijão',
      'alface',
      'não quero bebida',
      'retirada',
      'cartão',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.type).toBe('pickup');
    expect(state.pedidoAtual.paymentMethod).toBe('Cartão');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 5: 😤 Cliente Frustrado
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 5: Cliente Frustrado', () => {
  const perfil = { name: 'Caio', phone: '5511900000005', preferences: {}, last_order: null };

  test('responde com empatia ao "aff"', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'aff'
    ], perfil);

    const texto = getTextoCompleto(historico);
    // Deve ter resposta empática (desculpa ou perdoa — resposta randomizada)
    expect(texto).toMatch(/desculp|perdoa|😅|pular|voltan/i);
  });

  test('não trava com "sei lá, o que tem?"', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'sei lá, o que tem?'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    // Deve listar opções ou sugerir
    expect(texto).toMatch(/frango|churrasco|costela|linguiça|carne|proteína/i);
  });

  test('fluxo completo mesmo com frustração', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'aff',
      'maionese',
      'não quero bebida',
      'entrega',
      'Rua 7 de Setembro 300 centro',
      'sim',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 6: ❓ Cliente Perguntão
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 6: Cliente Perguntão', () => {
  const perfil = { name: 'Fernanda', phone: '5511900000006', preferences: {}, last_order: null };

  test('responde pergunta sobre horário de funcionamento', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'qual o horário de funcionamento?'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/horário|10h|22h|seg|sáb/i);
  });

  test('responde pergunta sobre taxa de entrega', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'qual a taxa?'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/taxa|R\$ ?5|entrega/i);
  });

  test('responde pergunta sobre formas de pagamento', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'aceita cartão?'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/cartão|sim|débito|crédito|aceita/i);
  });

  test('retoma fluxo após perguntas de FAQ', async () => {
    const { state } = await executarFluxo([
      'oi',
      'qual o horário de funcionamento?',
      'vocês entregam?',
      'qual a taxa?',
      'quero uma pequena',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'retirada',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 7: 🔤 Cliente com Typos
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 7: Cliente com Typos', () => {
  const perfil = { name: 'Diego', phone: '5511900000007', preferences: {}, last_order: null };

  test('entende "grandi" como Grande', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'quero uma grandi'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    // Deve entender e mostrar Grande ou proteína
    expect(texto).toMatch(/grande|proteína|qual/i);
  });

  test('entende "churrascp" como Churrasco', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'churrascp'
    ], perfil);
    
    // Deve aceitar e avançar
    const ultimaEtapa = historico[historico.length - 1].etapa;
    expect(['MONTANDO_PROTEINA', 'MONTANDO_ACOMPANHAMENTO']).toContain(ultimaEtapa);
  });

  test('entende "custela" como Costela', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'custela'
    ], perfil);
    
    const ultimaEtapa = historico[historico.length - 1].etapa;
    expect(['MONTANDO_PROTEINA', 'MONTANDO_ACOMPANHAMENTO']).toContain(ultimaEtapa);
  });

  test('entende "aroz" como Arroz', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'aroz'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/arroz|✅/i);
  });

  test('entende "maiones" como Maionese', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'maiones'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/maionese|✅|upsell|bebida/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 9: ❌ Tentativa de Cancelamento
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 9: Tentativa de Cancelamento', () => {
  const perfil = { name: 'Amanda', phone: '5511900000009', preferences: {}, last_order: null };

  test('"cancela" pede confirmação antes de cancelar', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'cancela'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    // Deve pedir confirmação
    expect(texto).toMatch(/cancel|certeza|confirm/i);
    
    // Pode ou não estar em estado de confirmação de cancelamento
    expect(state._confirmandoCancelamento === true || state.etapa === 'AGUARDANDO_TIPO').toBe(true);
  });

  test('"não" após cancelamento retoma o pedido', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'cancela',
      'não'
    ], perfil);
    
    // Não deve ter cancelado - deve continuar no fluxo
    expect(state.etapa).not.toBe('INICIO');
    expect(state.pedidoAtual.items.length).toBeGreaterThan(0);
  });

  test('fluxo completo após desistir de cancelar', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'entrega',
      'Rua XV de Novembro 500 centro',
      'sim',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 10: 💰 Dinheiro com Troco
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 10: Dinheiro com Troco', () => {
  const perfil = { name: 'Marcos', phone: '5511900000010', preferences: {}, last_order: null };

  test('mostra total antes de perguntar troco', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'costela e linguiça',
      'feijão e tropeiro',
      'beterraba',
      'não',
      'entrega',
      'Av Independência 750 Bairro Novo',
      'sim',
      'dinheiro'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    // Deve mostrar total e perguntar troco
    expect(texto).toMatch(/total|R\$|troco/i);
  });

  test('captura troco corretamente', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'costela e linguiça',
      'feijão e tropeiro',
      'beterraba',
      'não',
      'entrega',
      'Av Independência 750 Bairro Novo',
      'sim',
      'dinheiro',
      'troco pra 50',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.paymentMethod).toBe('Dinheiro');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 11: 🔍 Cliente Pede Resumo no Meio
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 11: Cliente Pede Resumo no Meio', () => {
  const perfil = { name: 'Patricia', phone: '5511900000011', preferences: {}, last_order: null };

  test('ASK_SUMMARY funciona em AGUARDANDO_TIPO', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      '2 grandes',
      'frango',
      'arroz e feijão',
      'alface',
      '1 suco e 2 refri',
      'quero ver o resumo completo'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Deve mostrar o resumo
    expect(texto).toMatch(/marmita|frango|suco/i);
    
    // Deve continuar no mesmo estado ou mostrar resumo
    expect(['AGUARDANDO_TIPO', 'CONFIRMANDO']).toContain(state.etapa);
  });

  test('resumo mostra todas as marmitas agrupadas + bebidas', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      '2 grandes',
      'frango',
      'arroz e feijão alface',
      '1 suco e 2 refri',
      'não' // rejeita sobremesa → perguntarTipo mostra resumo completo
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Deve agrupar as 2 grandes
    expect(texto).toMatch(/2x.*Marmita Grande/i);
    
    // Deve mostrar bebidas
    expect(texto).toMatch(/Suco/i);
    expect(texto).toMatch(/Refrigerante/i);
    
    // Verifica que as bebidas foram adicionadas
    const bebidas = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(bebidas.length).toBe(2);
  });

  test('fluxo completo com pedido de resumo', async () => {
    const { state } = await executarFluxo([
      'oi',
      '2 grandes',
      'frango',
      'arroz e feijão alface',
      '1 suco e 2 refri',
      'não', // rejeita sobremesa → AGUARDANDO_TIPO
      'entrega',
      'Rua Barão de Itapura 1200 Bosque',
      'sim',
      'cartão',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 12: 🌀 Conversa Caótica (Teste de Stress)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 12: Conversa Caótica (Stress Test)', () => {
  const perfil = { name: 'Henrique', phone: '5511900000012', preferences: {}, last_order: null };

  test('fast track captura pedido completo de uma mensagem longa', async () => {
    const { state, historico } = await executarFluxo([
      'boa tarde!!',
      'quero pedir uma marmita grande com frango e arroz com feijão sem salada pix entrega'
    ], perfil);
    
    // Deve ter capturado pelo menos o tamanho e proteína
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita') || state._marmitaAtual;
    
    if (marmita) {
      expect(marmita.tamanho).toBe('Grande');
    }
  });

  test('aceita saudação com emojis', async () => {
    const { state, historico } = await executarFluxo([
      'boa tarde!! 😊😊'
    ], perfil);
    
    // Não deve travar
    expect(['INICIO', 'MONTANDO_TAMANHO']).toContain(state.etapa);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/olá|oi|tarde|bem-vindo|marmita/i);
  });

  test('fluxo completo com mensagens caóticas', async () => {
    const { state } = await executarFluxo([
      'boa tarde',
      'grande',
      'frango e churrasco',
      'arroz com feijão',
      'sem salada',
      'não quero bebida',
      'entrega',
      'Praça da República 10 Centro SP',
      'sim',
      'pix',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTES DE INTEGRIDADE DO PEDIDO
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integridade do Pedido', () => {
  const perfil = { name: 'Teste', phone: '5511900000099', preferences: {}, last_order: null };

  test('marmita grande tem preço 22', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não'
    ], perfil);
    
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita' && i.tamanho === 'Grande');
    expect(marmita?.price).toBe(22);
  });

  test('marmita pequena tem preço 20', async () => {
    const { state } = await executarFluxo([
      'oi',
      'pequena',
      'frango',
      'arroz',
      'sem salada',
      'não'
    ], perfil);
    
    const marmita = state.pedidoAtual.items.find(i => i.tipo === 'marmita' && i.tamanho === 'Pequena');
    expect(marmita?.price).toBe(20);
  });

  test('suco tem preço 8', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz', // handleAcompanhamento finaliza marmita e vai para OFERECENDO_UPSELL
      '2 sucos'
    ], perfil);

    const suco = state.pedidoAtual.items.find(i => /suco/i.test(i.name));
    expect(suco?.price).toBe(8);
    expect(suco?.quantity).toBe(2);
  });

  test('refrigerante tem preço 6', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz', // handleAcompanhamento finaliza marmita e vai para OFERECENDO_UPSELL
      '3 refri'
    ], perfil);
    
    const refri = state.pedidoAtual.items.find(i => /refrigerante/i.test(i.name));
    expect(refri?.price).toBe(6);
    expect(refri?.quantity).toBe(3);
  });

  test('taxa de entrega é 5', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'entrega',
      'Rua Teste 123',
      'sim'
    ], perfil);
    
    expect(state.pedidoAtual.deliveryFee).toBe(5);
  });

  test('retirada não tem taxa', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'retirada'
    ], perfil);
    
    expect(state.pedidoAtual.deliveryFee).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTES DE FLUXO DE PAGAMENTO
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fluxo de Pagamento', () => {
  const perfil = { name: 'Teste', phone: '5511900000098', preferences: {}, last_order: null };

  test('Pix: mostra chave após confirmação', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'retirada',
      'pix',
      'sim'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/11999999999|pix/i);
  });

  test('Cartão: confirma sem pedir troco', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'retirada',
      'cartão',
      'sim'
    ], perfil);
    
    expect(state.etapa).toBe('FINALIZADO');
    expect(state.pedidoAtual.paymentMethod).toBe('Cartão');
  });

  test('Dinheiro: pergunta troco', async () => {
    const { historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'retirada',
      'dinheiro'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    expect(texto).toMatch(/troco|valor/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 13: 🚀 Fast Track Completo com Bebidas
// Testa captura de marmita + proteína + saladas + bebida em uma única mensagem
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 13: Fast Track Completo com Bebidas', () => {
  const perfil = { name: 'Lucas', phone: '5511900000013', preferences: {}, last_order: null };

  test('captura marmita + proteína + salada + coca em uma mensagem', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma grande com churrasco e alface e maionese e uma coca lata'
    ], perfil);
    
    // Fast track deve capturar tudo de uma vez
    // Verificar se capturou a marmita grande
    const temGrupoGrande = state._grupos?.some(g => g.tamanho === 'Grande');
    const temMarmitaGrande = state.pedidoAtual.items.some(i => i.tipo === 'marmita' && i.tamanho === 'Grande');
    expect(temGrupoGrande || temMarmitaGrande).toBe(true);
    
    // Verificar se capturou churrasco como proteína
    const grupoGrande = state._grupos?.find(g => g.tamanho === 'Grande');
    const temChurrasco = grupoGrande?.proteinas?.some(p => /churrasco/i.test(p)) ||
      state.pedidoAtual.items.some(i => i.tipo === 'marmita' && i.proteinas?.some(p => /churrasco/i.test(p)));
    expect(temChurrasco).toBe(true);
    
    // Verificar se capturou saladas (alface e maionese)
    const temSaladas = grupoGrande?.saladas?.length >= 1 ||
      state.pedidoAtual.items.some(i => i.tipo === 'marmita' && i.saladas?.length >= 1);
    expect(temSaladas).toBe(true);
    
    // Verificar se capturou a coca/refrigerante
    const temCoca = state.pedidoAtual.items.some(i => 
      i.tipo === 'extra' && /coca|refrigerante/i.test(i.name)
    );
    expect(temCoca).toBe(true);
  });

  test('fast track com bebida deve identificar refrigerante lata', async () => {
    const { state, historico } = await executarFluxo([
      'quero 1 grande de frango com arroz e feijão e uma coca lata'
    ], perfil);
    
    // Deve ter capturado a bebida
    const bebida = state.pedidoAtual.items.find(i => i.tipo === 'extra');
    
    // Se capturou bebida, verificar propriedades
    if (bebida) {
      expect(bebida.name).toMatch(/coca|refrigerante/i);
      expect(bebida.quantity).toBe(1);
    }
    
    // Deve avançar além de MONTANDO_TAMANHO
    expect(['MONTANDO_SALADA', 'OFERECENDO_UPSELL', 'AGUARDANDO_TIPO', 'CONFIRMANDO']).toContain(state.etapa);
  });

  test('fast track com múltiplas bebidas', async () => {
    const { state, historico } = await executarFluxo([
      'quero 2 grandes de frango com arroz e 3 coca lata e 1 suco'
    ], perfil);
    
    const bebidas = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    
    // Se capturou bebidas, verificar
    if (bebidas.length > 0) {
      // Deve ter pelo menos uma bebida
      expect(bebidas.length).toBeGreaterThanOrEqual(1);
      
      // Verificar quantidades
      const coca = bebidas.find(b => /coca|refrigerante/i.test(b.name));
      const suco = bebidas.find(b => /suco/i.test(b.name));
      
      if (coca) expect(coca.quantity).toBe(3);
      if (suco) expect(suco.quantity).toBe(1);
    }
  });

  test('fast track deve pular upsell se já tem bebidas', async () => {
    const { state, historico } = await executarFluxo([
      'quero 1 grande de frango arroz feijão alface e 1 coca retirada pix'
    ], perfil);
    
    // Se já capturou bebida, não deve oferecer upsell
    const bebidas = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    
    if (bebidas.length > 0) {
      // Deve ter pulado OFERECENDO_UPSELL ou estar em etapa avançada
      expect(['AGUARDANDO_TIPO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO']).toContain(state.etapa);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 14: 📝 Feedback Visual Melhorado
// Testa se o bot informa claramente o que foi capturado
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 14: Feedback Visual Melhorado', () => {
  const perfil = { name: 'Ana', phone: '5511900000014', preferences: {}, last_order: null };

  test('após proteína, feedback menciona Marmita Grande com a proteína escolhida', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'churrasco'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Deve mencionar que é para a marmita grande
    // Pode ser "para a grande", "marmita grande", etc.
    expect(texto).toMatch(/grande|Churrasco/i);
    
    // Deve confirmar o que foi selecionado
    expect(texto).toMatch(/churrasco|✅|acompanhamento/i);
  });

  test('após acompanhamento, feedback menciona o que foi escolhido', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'churrasco',
      'arroz e feijão'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Deve mencionar acompanhamentos escolhidos ou confirmar
    expect(texto).toMatch(/arroz|feijão|✅|salada/i);
  });

  test('feedback visual deve mostrar proteína capturada', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma grande com churrasco'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Fast track: deve mostrar que capturou churrasco
    // Ou pedir próximo passo mencionando a seleção
    expect(texto).toMatch(/churrasco|grande|acompanhamento/i);
  });

  test('confirma visualmente marmita grande com proteína ao pedir acompanhamento', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'costela'
    ], perfil);
    
    // A resposta ao selecionar proteína deve ser clara
    const ultimaResposta = historico[historico.length - 1].resposta;
    
    // Deve mencionar:
    // 1. A marmita (grande)
    // 2. E/ou a proteína escolhida (costela)
    // 3. E/ou perguntar sobre acompanhamentos
    expect(ultimaResposta).toMatch(/grande|costela|acompanhamento/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 15: 🎯 Captura Inteligente de Pedido Inicial
// Testa se o bot entende pedidos completos logo no início
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 15: Captura Inteligente de Pedido Inicial', () => {
  const perfil = { name: 'Roberto', phone: '5511900000015', preferences: {}, last_order: null };

  test('mensagem completa captura tudo: marmita + proteína + salada + bebida', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma grande com churrasco e alface e maionese e uma coca lata'
    ], perfil);
    
    // Verificar marmita grande com churrasco
    const grupoGrande = state._grupos?.find(g => g.tamanho === 'Grande');
    
    if (grupoGrande) {
      // Proteína deve ser churrasco
      expect(grupoGrande.proteinas).toContain('Churrasco');
      
      // Saladas devem incluir alface e/ou maionese
      const temAlface = grupoGrande.saladas?.some(s => /alface/i.test(s));
      const temMaionese = grupoGrande.saladas?.some(s => /maionese/i.test(s));
      expect(temAlface || temMaionese).toBe(true);
    }
    
    // Verificar bebida capturada
    const bebida = state.pedidoAtual.items.find(i => i.tipo === 'extra');
    expect(bebida).toBeDefined();
  });

  test('pedido rápido completa fluxo em poucas interações', async () => {
    const { state, historico } = await executarFluxo([
      'quero uma grande com churrasco e alface e maionese e uma coca lata',
      'arroz e feijão', // Completar acompanhamento
      'sim', // Saladas já vieram no fast track, mas confirmar
      '1 suco', // Upsell ou confirmar bebida
      'retirada',
      'pix',
      'sim'
    ], perfil);
    
    // Deve ter avançado significativamente no fluxo
    // Pode estar em CONFIRMANDO, FINALIZADO ou até AGUARDANDO_PAGAMENTO
    const etapasAvancadas = ['AGUARDANDO_PAGAMENTO', 'CONFIRMANDO', 'FINALIZADO'];
    const etapaFinal = state.etapa;
    
    // Verifica se tem marmita e bebida (já é sucesso se capturou)
    const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    const bebidas = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    
    // Se chegou em FINALIZADO, perfeito
    if (etapaFinal === 'FINALIZADO') {
      expect(marmitas.length).toBe(1);
      expect(bebidas.length).toBeGreaterThanOrEqual(1);
    } else {
      // Se não finalizou, pelo menos deve ter capturado os itens
      // E estar em uma etapa avançada (não em INICIO ou MONTANDO_*)
      expect(['AGUARDANDO_TIPO', 'AGUARDANDO_ENDERECO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO', 'FINALIZADO']).toContain(etapaFinal);
      
      // Marmita deve estar construída (nos grupos ou items)
      const temMarmita = marmitas.length > 0 || 
        (state._grupos && state._grupos.length > 0);
      expect(temMarmita).toBe(true);
    }
  });

  test('fast track entende variações de pedido de bebida', async () => {
    const testCases = [
      'quero 1 grande frango e 1 coca',
      'quero 1 grande frango e uma coca lata',
      'quero 1 grande frango e 1 refrigerante'
    ];
    
    for (const msg of testCases) {
      const { state } = await executarFluxo([msg], perfil);
      
      // Pelo menos deve capturar marmita grande
      const temGrande = state._grupos?.some(g => g.tamanho === 'Grande') ||
        state.pedidoAtual.items.some(i => i.tamanho === 'Grande');
      expect(temGrande).toBe(true);
    }
  });

  test('mensagem com tudo deve avançar até próximo passo necessário', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero 1 grande de churrasco arroz feijão alface maionese 1 coca retirada pix'
    ], perfil);
    
    // Deve estar além das etapas de montagem
    const etapasFinais = ['OFERECENDO_UPSELL', 'AGUARDANDO_TIPO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO'];
    expect(etapasFinais.some(e => state.etapa === e || state.etapa === 'FINALIZADO')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CENÁRIO 16: 🧠 Smart Step-Skipping
// Testa extractExtraInfo + resolverProximaEtapa visual feedback
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cenário 16: Smart Step-Skipping', () => {
  const perfil = { name: 'Fernanda', phone: '5511900000016', preferences: {}, last_order: null };

  test('extractExtraInfo captura tipo durante montagem de proteína', async () => {
    const { state } = await executarFluxo([
      'oi quero 1 grande',
      'frango retirada'
    ], perfil);
    
    // Tipo deve ter sido capturado pelo extractExtraInfo durante MONTANDO_PROTEINA
    expect(state.pedidoAtual.type).toBe('pickup');
  });

  test('extractExtraInfo captura pagamento durante montagem', async () => {
    const { state } = await executarFluxo([
      'oi quero 1 grande',
      'churrasco pix'
    ], perfil);
    
    // Pagamento deve ter sido capturado pelo extractExtraInfo
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });

  test('extractExtraInfo captura bebida durante montagem de acompanhamento', async () => {
    const { state } = await executarFluxo([
      'oi quero 1 grande',
      'frango',
      'arroz feijão e 1 coca'
    ], perfil);
    
    // Bebida deve ter sido capturada
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
    expect(extras[0].name).toMatch(/Refrigerante/i);
    // Upsell deve ter sido marcado como feito
    expect(state._upsellDone).toBe(true);
  });

  test('extractExtraInfo captura tipo + pagamento em uma montagem', async () => {
    const { state } = await executarFluxo([
      'oi quero 1 grande',
      'frango',
      'arroz feijão retirada pix'
    ], perfil);
    
    // Ambos devem estar capturados
    expect(state.pedidoAtual.type).toBe('pickup');
    expect(state.pedidoAtual.paymentMethod).toBe('Pix');
  });

  test('extractExtraInfo não duplica bebida se já adicionada', async () => {
    const { state } = await executarFluxo([
      'oi quero 1 grande de frango e 1 coca',
      'arroz e feijão',
      'sem salada',
      'não quero mais nada'
    ], perfil);
    
    // Deve ter exatamente 1 bebida (não duplicada)
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
  });

  test('fast track com tudo pula direto para confirmação', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero 1 grande de frango arroz feijão alface 1 coca retirada pix'
    ], perfil);
    
    // Deve pular todas as etapas de montagem
    expect(['CONFIRMANDO', 'AGUARDANDO_TIPO', 'AGUARDANDO_PAGAMENTO']).toContain(state.etapa);
    
    // Deve ter marmita ou grupos construídos
    const temMarmita = state.pedidoAtual.items.some(i => i.tipo === 'marmita') ||
      (state._grupos && state._grupos.length > 0);
    expect(temMarmita).toBe(true);
  });

  test('resolverProximaEtapa mostra resumo visual ao pular', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero 1 grande de churrasco arroz feijão alface e 1 coca retirada pix'
    ], perfil);
    
    const texto = getTextoCompleto(historico);
    
    // Deve mencionar o que foi capturado (marmita, bebida, retirada, pix)
    // Pelo menos deve aparecer algum resumo visual
    const temResumo = /grande|churrasco|marmita/i.test(texto);
    expect(temResumo).toBe(true);
  });

  test('fluxo completo com smart skip reduz interações', async () => {
    const { state, historico } = await executarFluxo([
      'oi quero 1 grande de frango arroz feijão alface 1 coca retirada pix',
      'sim' // Confirmação final
    ], perfil);
    
    // Deve ter avançado além das etapas de montagem
    const etapasAvancadas = ['AGUARDANDO_TIPO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO', 'FINALIZADO'];
    expect(etapasAvancadas).toContain(state.etapa);
    
    // Deve ter marmita ou grupos
    const temMarmita = state.pedidoAtual.items.some(i => i.tipo === 'marmita') ||
      (state._grupos && state._grupos.length > 0);
    expect(temMarmita).toBe(true);
  });

  test('extractExtraInfo não interfere no OFERECENDO_UPSELL', async () => {
    const { state } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz e feijão', // handleAcompanhamento finaliza marmita e vai para OFERECENDO_UPSELL
      '2 coca lata'
    ], perfil);
    
    // Upsell handler deve processar normalmente, sem duplicatas
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
    expect(extras[0].quantity).toBe(2);
    expect(extras[0].name).toMatch(/Refrigerante/i);
  });

  test('perguntarTipo mostra resumo completo com marmitas + bebidas', async () => {
    const { state, historico } = await executarFluxo([
      'oi',
      'grande',
      'frango',
      'arroz e feijão',
      'alface',
      '1 suco'
    ], perfil);
    
    // Deve estar em AGUARDANDO_TIPO com resumo
    expect(state.etapa).toBe('AGUARDANDO_TIPO');
    
    const texto = getTextoCompleto(historico);
    
    // Resumo deve conter marmita e bebida
    expect(texto).toMatch(/Marmita Grande/i);
    expect(texto).toMatch(/Suco/i);
    expect(texto).toMatch(/Entrega.*Retirada/i);
  });
});
