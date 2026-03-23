// c:\Users\Maissistem\Desktop\AGENTE RESTAURANTE\aiInterpreter.test.js
// ═════════════════════════════════════════════════════════════════
// Testes de NLP para Marmitaria
// ═════════════════════════════════════════════════════════════════

const {
  interpretConfirmation,
  interpretTamanho,
  interpretItensMultiplos,
  interpretOrderType,
  interpretUpsell,
  interpretQuantity
} = require('./aiInterpreter');

describe('interpretConfirmation', () => {
  test('Ô£à "sim"', async () => {
    expect(await interpretConfirmation('sim')).toBe('sim');
  });
  test('Ô£à "pode ser"', async () => {
    expect(await interpretConfirmation('pode ser')).toBe('sim');
  });
  test('ÔØî "nao"', async () => {
    expect(await interpretConfirmation('nao')).toBe('nao');
  });
  test('ÔØî "assim mesmo" N├âO deve confirmar', async () => {
    expect(await interpretConfirmation('assim mesmo')).toBe('indefinido');
  });  test('✅ "ta sim" = sim', async () => {
    expect(await interpretConfirmation('ta sim')).toBe('sim');
  });
  test('✅ "aham" = sim', async () => {
    expect(await interpretConfirmation('aham')).toBe('sim');
  });
  test('✅ "beleza" = sim', async () => {
    expect(await interpretConfirmation('beleza')).toBe('sim');
  });
  test('❌ "nao quero nao" = nao', async () => {
    expect(await interpretConfirmation('nao quero nao')).toBe('nao');
  });
  // Bug #2 — frases mistas NÃO devem cancelar
  test('✅ "sim mas eu não falei o troco antes" = sim (não cancela)', async () => {
    expect(await interpretConfirmation('sim mas eu não falei o troco antes')).toBe('sim');
  });
  test('✅ "pode ser mas não sei o endereço" = sim (não cancela)', async () => {
    expect(await interpretConfirmation('pode ser mas não sei o endereço')).toBe('sim');
  });
  test('✅ "ok mas nao era esse sabor" = sim (começa positivo)', async () => {
    expect(await interpretConfirmation('ok mas nao era esse sabor')).toBe('sim');
  });
  test('❌ "cancela o pedido" = nao (negação explícita)', async () => {
    expect(await interpretConfirmation('cancela o pedido')).toBe('nao');
  });
  // Intenção de modificar/adicionar NÃO deve confirmar
  test('❓ "quero adicionar mais uma marmita" = indefinido', async () => {
    expect(await interpretConfirmation('quero adicionar mais uma marmita')).toBe('indefinido');
  });
  test('❓ "antes de confirmar quero adicionar" = indefinido', async () => {
    expect(await interpretConfirmation('antes de confirmar quero adicionar mais uma marmita grande')).toBe('indefinido');
  });
  test('❓ "troca o frango por carne" = indefinido', async () => {
    expect(await interpretConfirmation('troca o frango por carne')).toBe('indefinido');
  });
  test('❓ "tira a salada" = indefinido', async () => {
    expect(await interpretConfirmation('tira a salada')).toBe('indefinido');
  });
  test('❓ "coloca mais um refrigerante" = indefinido', async () => {
    expect(await interpretConfirmation('coloca mais um refrigerante')).toBe('indefinido');
  });
});

describe('interpretTamanho', () => {
  test('Ô£à "pequena" = Pequena', () => {
    expect(interpretTamanho('quero uma pequena')).toBe('Pequena');
  });
  test('Ô£à "p" = Pequena', () => {
    expect(interpretTamanho('P')).toBe('Pequena');
  });
  test('Ô£à "grande" = Grande', () => {
    expect(interpretTamanho('manda uma grande ai')).toBe('Grande');
  });
  test('✅ "g" = Grande', () => {
    expect(interpretTamanho('vou querer G')).toBe('Grande');
  });
  test('❌ "media" = null (Média não existe)', () => {
    expect(interpretTamanho('Media')).toBeNull();
  });
  test('❌ "nao sei" = null', () => {
    expect(interpretTamanho('nao sei')).toBeNull();
  });  test('✅ "m" isolado = Grande', () => {
    expect(interpretTamanho('m')).toBe('Grande');
  });
  test('❌ "manda uma ai" NÃO deve casar como tamanho', () => {
    expect(interpretTamanho('manda uma ai')).toBeNull();
  });});

describe('interpretItensMultiplos (Proteinas)', () => {
  const proteinas = [{ name: 'Frango' }, { name: 'Churrasco' }, { name: 'Costela' }, { name: 'Carne Cozida', apelidos: ['carne'] }];

  test('Ô£à Extrai m├║ltiplos itens', () => {
    const res = interpretItensMultiplos('vou querer frango e churrasco', proteinas);
    expect(res).toHaveLength(2);
    expect(res.map(r => r.name)).toContain('Frango');
    expect(res.map(r => r.name)).toContain('Churrasco');
  });

  test('Ô£à Lida com apelidos ("carne" -> Carne Cozida)', () => {
    const res = interpretItensMultiplos('carne e costela', proteinas);
    expect(res).toHaveLength(2);
    expect(res.map(r => r.name)).toContain('Carne Cozida');
  });

  test('ÔØî Nega├º├úo direta ou "nada" = vazio', () => {
    expect(interpretItensMultiplos('nao quero carne', proteinas)).toHaveLength(0);
    expect(interpretItensMultiplos('nada', proteinas)).toHaveLength(0);
    expect(interpretItensMultiplos('pula essa parte', proteinas)).toHaveLength(0);
  });
});

describe('interpretOrderType', () => {
  test('Ô£à "1" = delivery', () => {
    expect(interpretOrderType('1')).toBe('delivery');
  });
  test('Ô£à "entrega" = delivery', () => {
    expect(interpretOrderType('entrega pra mim')).toBe('delivery');
  });
  test('Ô£à "2" = pickup', () => {
    expect(interpretOrderType('2')).toBe('pickup');
  });
  test('Ô£à "retirada" = pickup', () => {
    expect(interpretOrderType('vou retirar')).toBe('pickup');
  });  // Typos comuns de clientes
  test('✅ "etrega" (typo) = delivery', () => {
    expect(interpretOrderType('etrega')).toBe('delivery');
  });
  test('✅ "entrga" (typo) = delivery', () => {
    expect(interpretOrderType('entrga')).toBe('delivery');
  });});

describe('interpretUpsell', () => {
  const bebidas = [
    { name: 'Suco Natural', price: 8 },
    { name: 'Refrigerante Lata', price: 6, apelidos: ['refrigerante', 'refri', 'lata'] }
  ];

  test('Ô£à Escolha de refrigerante', () => {
    const res = interpretUpsell('manda um refrigerante tambem', bebidas);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Refrigerante Lata');
  });

  test('Ô£à Extrai m├║ltiplos (suco e refri)', () => {
    const res = interpretUpsell('quero um suco e uma lata', bebidas);
    expect(res).toHaveLength(2);
  });

  test('ÔØî Cliente recusa', () => {
    expect(interpretUpsell('nao quero bebida', bebidas)).toHaveLength(0);
    expect(interpretUpsell('nada', bebidas)).toHaveLength(0);
    expect(interpretUpsell('N', bebidas)).toHaveLength(0);
  });
});

describe('interpretQuantity', () => {
  // Casos clássicos que devem funcionar
  test('✅ "quero 2 patinhos" → 2', () => {
    expect(interpretQuantity('quero 2 patinhos')).toBe(2);
  });

  test('✅ "3" → 3', () => {
    expect(interpretQuantity('3')).toBe(3);
  });

  test('✅ "uma" → 1', () => {
    expect(interpretQuantity('uma')).toBe(1);
  });

  test('✅ "duas grandes" → 2', () => {
    expect(interpretQuantity('duas grandes')).toBe(2);
  });

  // Blacklist: NÃO deve capturar número nesses contextos
  test('❌ "patinho moído 2x" → null (instrução de repetição)', () => {
    expect(interpretQuantity('patinho moído 2x')).toBeNull();
  });

  test('❌ "dividir em 3 pacotes" → null', () => {
    expect(interpretQuantity('dividir em 3 pacotes')).toBeNull();
  });

  test('❌ "moer duas vezes" → null', () => {
    expect(interpretQuantity('moer duas vezes')).toBeNull();
  });

  test('❌ "cortar em 4 pedaços" → null', () => {
    expect(interpretQuantity('cortar em 4 pedacos')).toBeNull();
  });

  test('❌ "3 vezes" → null', () => {
    expect(interpretQuantity('3 vezes')).toBeNull();
  });

  // Suporte decimal (açougue)
  test('✅ "1 kg e meio" → 1.5', () => {
    expect(interpretQuantity('1 kg e meio')).toBe(1.5);
  });

  test('✅ "meio kilo" → 0.5', () => {
    expect(interpretQuantity('meio kilo')).toBe(0.5);
  });

  test('✅ "2 e meio" → 2.5', () => {
    expect(interpretQuantity('2 e meio')).toBe(2.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Fuzzy match — typos de clientes
// ═══════════════════════════════════════════════════════════════

describe('Fuzzy match em interpretItensMultiplos', () => {
  const saladas = [
    { name: 'Maionese' },
    { name: 'Alface' },
    { name: 'Beterraba' },
    { name: 'Repolho' },
    { name: 'Pepino' }
  ];
  const proteinas = [
    { name: 'Frango' },
    { name: 'Churrasco', apelidos: ['churras'] },
    { name: 'Costela' },
    { name: 'Linguiça', apelidos: ['linguica'] },
    { name: 'Carne Cozida', apelidos: ['carne'] }
  ];

  test('✅ "maiones" → match Maionese', () => {
    const res = interpretItensMultiplos('maiones e alface', saladas);
    expect(res.map(r => r.name)).toContain('Maionese');
  });

  test('✅ "alfaçe" → match Alface (normalizar resolve acento)', () => {
    const res = interpretItensMultiplos('alfaçe', saladas);
    expect(res.map(r => r.name)).toContain('Alface');
  });

  test('✅ "churasco" → match Churrasco', () => {
    const res = interpretItensMultiplos('churasco', proteinas);
    expect(res.map(r => r.name)).toContain('Churrasco');
  });

  test('✅ "linguça" → match Linguiça', () => {
    const res = interpretItensMultiplos('linguça', proteinas);
    expect(res.map(r => r.name)).toContain('Linguiça');
  });

  test('✅ "beterrab" → match Beterraba', () => {
    const res = interpretItensMultiplos('beterrab', saladas);
    expect(res.map(r => r.name)).toContain('Beterraba');
  });
});

// ═══════════════════════════════════════════════════════════════
// Multi-item protein parsing — Proteínas por marmita
// ═══════════════════════════════════════════════════════════════

const { interpretarProteinasMultiplas } = require('./aiInterpreter');
const { interpretarPedidoMultiTamanho } = require('./aiInterpreter');

describe('interpretarProteinasMultiplas', () => {
  const proteinas = [
    { name: 'Frango' },
    { name: 'Churrasco', apelidos: ['churras'] },
    { name: 'Costela' },
    { name: 'Linguiça', apelidos: ['linguica'] },
    { name: 'Carne Cozida', apelidos: ['carne'] }
  ];

  test('✅ "churrasco e frango em uma, na outra frango, na outra linguiça"', () => {
    const res = interpretarProteinasMultiplas(
      'churrasco e frango em uma, na outra frango, na outra linguiça',
      proteinas,
      3
    );
    expect(res).not.toBeNull();
    expect(res.length).toBe(3);
    expect(res[0]).toContain('Churrasco');
    expect(res[0]).toContain('Frango');
    expect(res[1]).toContain('Frango');
    expect(res[2]).toContain('Linguiça');
  });

  test('✅ "na primeira frango e costela. na segunda só linguiça"', () => {
    const res = interpretarProteinasMultiplas(
      'na primeira frango e costela. na segunda só linguiça',
      proteinas,
      2
    );
    expect(res).not.toBeNull();
    expect(res.length).toBe(2);
    expect(res[0]).toEqual(expect.arrayContaining(['Frango', 'Costela']));
    expect(res[1]).toContain('Linguiça');
  });

  test('✅ "numa churrasco, noutra frango, noutra costela"', () => {
    const res = interpretarProteinasMultiplas(
      'numa churrasco, noutra frango, noutra costela',
      proteinas,
      3
    );
    expect(res).not.toBeNull();
    expect(res.length).toBe(3);
  });

  test('❌ "frango e churrasco" → null (sem separadores, não é multi)', () => {
    const res = interpretarProteinasMultiplas(
      'frango e churrasco',
      proteinas,
      2
    );
    expect(res).toBeNull();
  });

  test('❌ texto simples sem especificação → null', () => {
    const res = interpretarProteinasMultiplas('frango', proteinas, 1);
    expect(res).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Multi-tamanho parsing — "2 grandes e 3 pequenas"
// ═══════════════════════════════════════════════════════════════

describe('interpretarPedidoMultiTamanho', () => {
  test('✅ "2 grandes e 3 pequenas"', () => {
    const res = interpretarPedidoMultiTamanho('2 grandes e 3 pequenas');
    expect(res).not.toBeNull();
    expect(res.length).toBe(2);
    expect(res).toContainEqual({ size: 'Grande', qty: 2 });
    expect(res).toContainEqual({ size: 'Pequena', qty: 3 });
  });

  test('✅ "3 marmitas pequenas e 2 grandes"', () => {
    const res = interpretarPedidoMultiTamanho('3 marmitas pequenas e 2 grandes');
    expect(res).not.toBeNull();
    expect(res.length).toBe(2);
    expect(res).toContainEqual({ size: 'Pequena', qty: 3 });
    expect(res).toContainEqual({ size: 'Grande', qty: 2 });
  });

  test('✅ "uma grande e uma pequena"', () => {
    const res = interpretarPedidoMultiTamanho('uma grande e uma pequena');
    expect(res).not.toBeNull();
    expect(res.length).toBe(2);
    expect(res).toContainEqual({ size: 'Grande', qty: 1 });
    expect(res).toContainEqual({ size: 'Pequena', qty: 1 });
  });

  test('✅ "duas grandes e duas pequenas"', () => {
    const res = interpretarPedidoMultiTamanho('duas grandes e duas pequenas');
    expect(res).not.toBeNull();
    expect(res).toContainEqual({ size: 'Grande', qty: 2 });
    expect(res).toContainEqual({ size: 'Pequena', qty: 2 });
  });

  test('✅ "3 marmitas pequenas" → single size array', () => {
    const res = interpretarPedidoMultiTamanho('3 marmitas pequenas');
    expect(res).not.toBeNull();
    expect(res.length).toBe(1);
    expect(res[0]).toEqual({ size: 'Pequena', qty: 3 });
  });

  test('❌ "marmita grande" (sem quantidade explícita) → null', () => {
    const res = interpretarPedidoMultiTamanho('marmita grande');
    expect(res).toBeNull();
  });

  test('❌ "oi quero pedir" (sem tamanho) → null', () => {
    const res = interpretarPedidoMultiTamanho('oi quero pedir');
    expect(res).toBeNull();
  });
});
