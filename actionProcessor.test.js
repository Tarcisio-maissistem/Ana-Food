// actionProcessor.test.js
const { matchItemCatalog, processAction, processModification } = require('./actionProcessor');

const CARDAPIO = {
  proteinas: [
    { name: 'Frango' }, { name: 'Churrasco', apelidos: ['churras'] },
    { name: 'Carne Cozida', apelidos: ['carne'] }
  ],
  acompanhamentos: [
    { name: 'Arroz' }, { name: 'Feijão', apelidos: ['feijao'] }
  ],
  saladas: [
    { name: 'Maionese' }, { name: 'Alface' }
  ],
  upsellsBebida: [
    { name: 'Suco Natural', price: 8 },
    { name: 'Refrigerante Lata', price: 6, apelidos: ['refri'] }
  ],
  upsellsSobremesa: [
    { name: 'Pudim', price: 6 }
  ]
};

describe('matchItemCatalog', () => {
  test('✅ Match exato', () => {
    expect(matchItemCatalog('Frango', CARDAPIO.proteinas).name).toBe('Frango');
  });

  test('✅ Match por apelido', () => {
    expect(matchItemCatalog('churras', CARDAPIO.proteinas).name).toBe('Churrasco');
  });

  test('✅ Match case-insensitive', () => {
    expect(matchItemCatalog('FRANGO', CARDAPIO.proteinas).name).toBe('Frango');
  });

  test('❌ Item inexistente retorna null', () => {
    expect(matchItemCatalog('Salmão', CARDAPIO.proteinas)).toBeNull();
  });

  test('❌ null/undefined retorna null', () => {
    expect(matchItemCatalog(null, CARDAPIO.proteinas)).toBeNull();
    expect(matchItemCatalog('Frango', null)).toBeNull();
  });
});

describe('processAction (fast track)', () => {
  test('✅ Valida e normaliza fast track', () => {
    const ft = {
      sucesso: true, tamanho: 'Grande',
      proteinas: ['frango', 'churras'],
      acompanhamentos: ['arroz'],
      saladas: ['maionese']
    };
    const result = processAction(ft, CARDAPIO);
    expect(result.sucesso).toBe(true);
    expect(result.proteinas).toEqual(['Frango', 'Churrasco']);
    expect(result.acompanhamentos).toEqual(['Arroz']);
  });

  test('❌ Proteínas inexistentes invalidam fast track', () => {
    const ft = {
      sucesso: true, tamanho: 'Grande',
      proteinas: ['Salmão'],
      acompanhamentos: ['arroz'],
      saladas: []
    };
    const result = processAction(ft, CARDAPIO);
    expect(result.sucesso).toBe(false);
  });

  test('❌ Tamanho inválido', () => {
    const ft = { sucesso: true, tamanho: 'Enorme', proteinas: ['frango'] };
    const result = processAction(ft, CARDAPIO);
    expect(result.sucesso).toBe(false);
  });
});

describe('processModification', () => {
  test('✅ Corrige nomes e preços', () => {
    const itens = [{
      tipo: 'marmita', tamanho: 'Grande', price: 99, quantity: 1,
      proteinas: [{ name: 'carne' }],
      acompanhamentos: [{ name: 'arroz' }],
      saladas: []
    }];
    const result = processModification(itens, CARDAPIO);
    expect(result[0].price).toBe(22); // Corrigido para preço real
    expect(result[0].proteinas[0].name).toBe('Carne Cozida');
  });

  test('❌ Array vazio retorna null', () => {
    expect(processModification([], CARDAPIO)).toBeNull();
  });

  test('❌ null retorna null', () => {
    expect(processModification(null, CARDAPIO)).toBeNull();
  });

  test('❌ Extra desconhecido rejeita tudo', () => {
    const itens = [{ tipo: 'extra', name: 'Cerveja', price: 10, quantity: 1 }];
    expect(processModification(itens, CARDAPIO)).toBeNull();
  });

  test('✅ Extra conhecido é corrigido', () => {
    const itens = [{ tipo: 'extra', name: 'refri', price: 99, quantity: 1 }];
    const result = processModification(itens, CARDAPIO);
    expect(result[0].name).toBe('Refrigerante Lata');
    expect(result[0].price).toBe(6);
  });
});
