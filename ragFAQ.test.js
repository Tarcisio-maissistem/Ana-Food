// ragFAQ.test.js
// ═══════════════════════════════════════════════════════════════
// Testes do RAG FAQ — respostas dinâmicas com dados da empresa
// ═══════════════════════════════════════════════════════════════

const ragFAQ = require('./ragFAQ');

const COMPANY_A = {
  name: 'Marmitaria do João',
  opening_hours: '11h às 14h30',
  address: 'Rua das Acácias, 789 - Jardim Primavera',
  delivery_fee: 7,
  pix_key: 'joao@pix.com',
  estimated_time_default: 35
};

const COMPANY_B = {
  name: 'Restaurante da Maria',
  opening_hours: '18h às 23h',
  address: 'Av. Brasil, 1500 - Centro',
  delivery_fee: 10,
  pix_key: null,
  estimated_time_default: 50
};

// ═══════════════════════════════════════════════════════════════
// Dados dinâmicos por empresa
// ═══════════════════════════════════════════════════════════════

describe('RAG FAQ — Dados dinâmicos', () => {
  test('horário empresa A → retorna dados da empresa A', () => {
    const ans = ragFAQ.answer('que horas fecham?', COMPANY_A, 'MONTANDO_PROTEINA');
    expect(ans).toContain('11h às 14h30');
  });

  test('horário empresa B → retorna dados da empresa B', () => {
    const ans = ragFAQ.answer('tão aberto?', COMPANY_B, 'MONTANDO_TAMANHO');
    expect(ans).toContain('18h às 23h');
  });

  test('endereço empresa A → retorna endereço real', () => {
    const ans = ragFAQ.answer('onde fica a loja?', COMPANY_A, 'MONTANDO_TAMANHO');
    expect(ans).toContain('Rua das Acácias, 789');
  });

  test('endereço empresa B → retorna endereço real', () => {
    const ans = ragFAQ.answer('onde vocês ficam?', COMPANY_B, 'MONTANDO_TAMANHO');
    expect(ans).toContain('Av. Brasil, 1500');
  });

  test('taxa empresa A → R$ 7,00', () => {
    const ans = ragFAQ.answer('qual o valor da entrega?', COMPANY_A, 'INICIO');
    expect(ans).toContain('7,00');
  });

  test('taxa empresa B → R$ 10,00', () => {
    const ans = ragFAQ.answer('valor da entrega?', COMPANY_B, 'INICIO');
    expect(ans).toContain('10,00');
  });

  test('pix empresa A (com chave) → mostra chave', () => {
    const ans = ragFAQ.answer('tem pix?', COMPANY_A, 'MONTANDO_TAMANHO');
    expect(ans).toContain('joao@pix.com');
  });

  test('pix empresa B (sem chave) → aceita sem mostrar chave', () => {
    const ans = ragFAQ.answer('aceita pix?', COMPANY_B, 'MONTANDO_TAMANHO');
    expect(ans).toContain('aceitamos Pix');
    expect(ans).not.toContain('null');
  });

  test('tempo de entrega empresa A → 35 minutos', () => {
    const ans = ragFAQ.answer('quanto tempo demora?', COMPANY_A, 'MONTANDO_PROTEINA');
    expect(ans).toContain('35 minutos');
  });

  test('tempo de entrega empresa B → 50 minutos', () => {
    const ans = ragFAQ.answer('demora muito?', COMPANY_B, 'MONTANDO_PROTEINA');
    expect(ans).toContain('50 minutos');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bloqueio por etapa (não confunde FAQ com fluxo)
// ═══════════════════════════════════════════════════════════════

describe('RAG FAQ — Bloqueio por etapa', () => {
  test('"rua" em AGUARDANDO_ENDERECO → null (não é FAQ)', () => {
    const ans = ragFAQ.answer('Rua das Flores, 100', COMPANY_A, 'AGUARDANDO_ENDERECO');
    expect(ans).toBeNull();
  });

  test('"pix" em AGUARDANDO_PAGAMENTO → null (está pagando)', () => {
    const ans = ragFAQ.answer('quero pagar no pix', COMPANY_A, 'AGUARDANDO_PAGAMENTO');
    expect(ans).toBeNull();
  });

  test('"pix" em CONFIRMANDO → null', () => {
    const ans = ragFAQ.answer('vou pagar pix', COMPANY_A, 'CONFIRMANDO');
    expect(ans).toBeNull();
  });

  test('"endereço" com "entrega" → null (blocked word)', () => {
    const ans = ragFAQ.answer('o endereço de entrega é rua A', COMPANY_A, 'MONTANDO_TAMANHO');
    expect(ans).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Não é FAQ → retorna null
// ═══════════════════════════════════════════════════════════════

describe('RAG FAQ — Passthrough', () => {
  test('"frango e linguiça" → null', () => {
    const ans = ragFAQ.answer('frango e linguiça', COMPANY_A, 'MONTANDO_PROTEINA');
    expect(ans).toBeNull();
  });

  test('"grande" → null', () => {
    const ans = ragFAQ.answer('grande', COMPANY_A, 'MONTANDO_TAMANHO');
    expect(ans).toBeNull();
  });

  test('"sim pode confirmar" → null', () => {
    const ans = ragFAQ.answer('sim pode confirmar', COMPANY_A, 'CONFIRMANDO');
    expect(ans).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// buildKB retorna base de conhecimento completa
// ═══════════════════════════════════════════════════════════════

describe('RAG FAQ — buildKB', () => {
  test('empresa completa → gera todas as entradas', () => {
    const kb = ragFAQ.buildKB(COMPANY_A);
    const ids = kb.map(e => e.id);
    expect(ids).toContain('horario');
    expect(ids).toContain('localizacao');
    expect(ids).toContain('cartao');
    expect(ids).toContain('taxa');
    expect(ids).toContain('pix');
    expect(ids).toContain('tempo');
    expect(ids).toContain('cardapio');
    expect(ids).toContain('entrega_retirada');
  });

  test('empresa sem horário → não gera entrada de horário', () => {
    const kb = ragFAQ.buildKB({ name: 'Teste' });
    const ids = kb.map(e => e.id);
    expect(ids).not.toContain('horario');
  });
});

// ═══════════════════════════════════════════════════════════════
// FAQ Entrega / Retirada
// ═══════════════════════════════════════════════════════════════

describe('FAQ Entrega/Retirada', () => {
  test('"posso retirar?" → responde sobre entrega e retirada', () => {
    const ans = ragFAQ.answer('posso retirar?', COMPANY_A, 'MONTANDO_ACOMPANHAMENTO');
    expect(ans).toContain('entrega');
    expect(ans).toContain('retirada');
    expect(ans).toContain('7,00');
  });

  test('"tem entrega?" → responde sobre entrega e retirada', () => {
    const ans = ragFAQ.answer('tem entrega?', COMPANY_B, 'MONTANDO_PROTEINA');
    expect(ans).toContain('entrega');
    expect(ans).toContain('retirada');
    expect(ans).toContain('10,00');
  });

  test('"posso retirar pessoalmente?" → responde sobre retirada', () => {
    const ans = ragFAQ.answer('posso retirar pessoalmente?', COMPANY_A, 'MONTANDO_SALADA');
    expect(ans).toContain('retirada');
  });

  test('"só delivery?" → responde sobre entrega e retirada', () => {
    const ans = ragFAQ.answer('so delivery?', COMPANY_A, 'MONTANDO_ACOMPANHAMENTO');
    expect(ans).toContain('entrega');
    expect(ans).toContain('retirada');
  });

  test('FAQ entrega bloqueada em AGUARDANDO_TIPO', () => {
    const ans = ragFAQ.answer('posso retirar?', COMPANY_A, 'AGUARDANDO_TIPO');
    expect(ans).toBeNull();
  });
});
