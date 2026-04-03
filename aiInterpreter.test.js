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
  test('❓ "cancela o refrigerante" = indefinido (item específico, não pedido)', async () => {
    expect(await interpretConfirmation('cancela o refrigerante')).toBe('indefinido');
  });
  test('❓ "retira o suco" = indefinido (modificação)', async () => {
    expect(await interpretConfirmation('retira o suco')).toBe('indefinido');
  });
  test('❓ "remove a coca" = indefinido (modificação)', async () => {
    expect(await interpretConfirmation('remove a coca')).toBe('indefinido');
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
    expect(interpretOrderType('vou retirar')).toBe('pickup');  });
  test('✅ "é pra retirada" = pickup', () => {
    expect(interpretOrderType('é pra retirada')).toBe('pickup');
  });
  test('✅ "retirada no balcão" = pickup', () => {
    expect(interpretOrderType('retirada no balcão')).toBe('pickup');  });  // Typos comuns de clientes
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

// ═══════════════════════════════════════════════════════════════════════════
// _classificarFastTrackLocal — Fast track parsing completo
// ═══════════════════════════════════════════════════════════════════════════
const { _classificarFastTrackLocal } = require('./aiInterpreter');

describe('_classificarFastTrackLocal', () => {
  test('✅ pedido completo com retirada e pix', () => {
    const ft = _classificarFastTrackLocal(
      '3 marmitas grandes e uma pequena todas com churrasco arroz e feijao, e pra retirada e pagamento no pix'
    );
    expect(ft.sucesso).toBe(true);
    expect(ft.marmitas).toHaveLength(2); // 2 grupos: grande e pequena
    expect(ft.marmitas[0].tamanho).toBe('Grande');
    expect(ft.marmitas[0].quantidade).toBe(3);
    expect(ft.marmitas[1].tamanho).toBe('Pequena');
    expect(ft.marmitas[1].quantidade).toBe(1);
    expect(ft.tipo).toBe('pickup');
    expect(ft.pagamento).toBe('Pix');
  });

  test('✅ "retirada" detecta pickup', () => {
    const ft = _classificarFastTrackLocal('1 grande de frango retirada pix');
    expect(ft.tipo).toBe('pickup');
  });

  test('✅ "retira" detecta pickup', () => {
    const ft = _classificarFastTrackLocal('1 grande de frango retira no balcao pix');
    expect(ft.tipo).toBe('pickup');
  });

  test('✅ "vou buscar" detecta pickup', () => {
    const ft = _classificarFastTrackLocal('1 grande de frango vou buscar pix');
    expect(ft.tipo).toBe('pickup');
  });

  test('✅ "entrega" detecta delivery', () => {
    const ft = _classificarFastTrackLocal('2 grandes frango arroz feijao entrega cartao');
    expect(ft.tipo).toBe('delivery');
  });

  test('✅ pagamento Pix detectado', () => {
    const ft = _classificarFastTrackLocal('2 grandes frango arroz pix');
    expect(ft.pagamento).toBe('Pix');
  });

  test('✅ pagamento cartão detectado', () => {
    const ft = _classificarFastTrackLocal('2 grandes frango arroz cartao');
    expect(ft.pagamento).toBe('Cartão');
  });

  test('✅ pagamento dinheiro detectado', () => {
    const ft = _classificarFastTrackLocal('2 grandes frango arroz dinheiro');
    expect(ft.pagamento).toBe('Dinheiro');
  });

  test('✅ sem tipo/pagamento retorna null para ambos', () => {
    const ft = _classificarFastTrackLocal('2 grandes de frango com arroz e feijao');
    expect(ft.tipo).toBeNull();
    expect(ft.pagamento).toBeNull();
  });

  test('✅ 3 grandes e 1 pequena → 2 grupos com quantidades corretas', () => {
    const ft = _classificarFastTrackLocal('quero 3 grandes e 1 pequena de churrasco');
    expect(ft.sucesso).toBe(true);
    expect(ft.marmitas).toHaveLength(2);
    const grande = ft.marmitas.find(m => m.tamanho === 'Grande');
    const pequena = ft.marmitas.find(m => m.tamanho === 'Pequena');
    expect(grande.quantidade).toBe(3);
    expect(pequena.quantidade).toBe(1);
  });

  test('✅ proteínas compartilhadas "todas com churrasco"', () => {
    const ft = _classificarFastTrackLocal(
      '3 grandes e 1 pequena todas com churrasco arroz e feijao'
    );
    expect(ft.sucesso).toBe(true);
    ft.marmitas.forEach(m => {
      expect(m.proteinas.map(p => p.toLowerCase())).toContain('churrasco');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Itens DIFERENTES por grupo (bug #2 corrigido)
  // ═══════════════════════════════════════════════════════════════════════════
  test('✅ itens diferentes por grupo: grandes churrasco, pequena carne cozida', () => {
    const ft = _classificarFastTrackLocal(
      'quero 3 marmitas grandes com churrasco arroz e feijao alface e 1 pequena com carne cozida maionese e alface arroz e feijao'
    );
    expect(ft.sucesso).toBe(true);
    expect(ft.marmitas).toHaveLength(2);

    const grande = ft.marmitas.find(m => m.tamanho === 'Grande');
    const pequena = ft.marmitas.find(m => m.tamanho === 'Pequena');

    // Grande: churrasco, arroz+feijão, alface
    expect(grande.quantidade).toBe(3);
    expect(grande.proteinas).toContain('Churrasco');
    expect(grande.proteinas).not.toContain('Carne Cozida');
    expect(grande.acompanhamentos).toEqual(expect.arrayContaining(['Arroz', 'Feijão']));
    expect(grande.saladas).toContain('Alface');
    expect(grande.saladas).not.toContain('Maionese');

    // Pequena: carne cozida, arroz+feijão, maionese+alface
    expect(pequena.quantidade).toBe(1);
    expect(pequena.proteinas).toContain('Carne Cozida');
    expect(pequena.proteinas).not.toContain('Churrasco');
    expect(pequena.saladas).toEqual(expect.arrayContaining(['Maionese', 'Alface']));
  });

  test('✅ itens diferentes: grande frango, pequena linguiça', () => {
    const ft = _classificarFastTrackLocal(
      '2 grandes com frango arroz e macarrao e 1 pequena com linguica feijao e beterraba'
    );
    expect(ft.sucesso).toBe(true);
    const grande = ft.marmitas.find(m => m.tamanho === 'Grande');
    const pequena = ft.marmitas.find(m => m.tamanho === 'Pequena');

    expect(grande.proteinas).toContain('Frango');
    expect(grande.proteinas).not.toContain('Linguiça');
    expect(grande.acompanhamentos).toEqual(expect.arrayContaining(['Arroz', 'Macarrão']));

    expect(pequena.proteinas).toContain('Linguiça');
    expect(pequena.proteinas).not.toContain('Frango');
    expect(pequena.saladas).toContain('Beterraba');
  });

  test('✅ "todas com" → modo compartilhado, mesmo com múltiplos grupos', () => {
    const ft = _classificarFastTrackLocal(
      '2 grandes e 1 pequena todas com frango arroz feijao'
    );
    expect(ft.sucesso).toBe(true);
    ft.marmitas.forEach(m => {
      expect(m.proteinas).toContain('Frango');
      expect(m.acompanhamentos).toEqual(expect.arrayContaining(['Arroz', 'Feijão']));
    });
  });

  test('✅ "tudo com" → modo compartilhado', () => {
    const ft = _classificarFastTrackLocal(
      '3 grandes e 2 pequenas tudo com churrasco arroz e pure'
    );
    expect(ft.sucesso).toBe(true);
    ft.marmitas.forEach(m => {
      expect(m.proteinas).toContain('Churrasco');
      expect(m.acompanhamentos).toEqual(expect.arrayContaining(['Arroz', 'Purê']));
    });
  });

  test('✅ grupo único não afeta: 3 grandes com churrasco', () => {
    const ft = _classificarFastTrackLocal(
      '3 grandes com churrasco arroz feijao alface'
    );
    expect(ft.sucesso).toBe(true);
    expect(ft.marmitas).toHaveLength(1);
    expect(ft.marmitas[0].proteinas).toContain('Churrasco');
    expect(ft.marmitas[0].saladas).toContain('Alface');
  });
});

// ═══════════════════════════════════════════════════════════════
// _modificarPedidoLocal — Modificação LOCAL de extras
// ═══════════════════════════════════════════════════════════════

describe('_modificarPedidoLocal', () => {
  const { _modificarPedidoLocal } = require('./aiInterpreter');
  const cardapio = require('./plugins/marmitaria/cardapio');
  const menu = {
    proteinas: cardapio.PROTEINAS,
    acompanhamentos: cardapio.ACOMPANHAMENTOS,
    saladas: cardapio.SALADAS,
    upsellsBebida: cardapio.BEBIDAS,
    upsellsSobremesa: cardapio.SOBREMESAS
  };

  const baseItems = [
    { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{name:'Churrasco'}], acompanhamentos: [{name:'Arroz'},{name:'Feijão'}], saladas: [{name:'Alface'}] },
    { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 3 },
    { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
  ];

  test('"troca o refri pelo suco" → remove refri, soma qty no suco existente', () => {
    const r = _modificarPedidoLocal('troca o refri pelo suco', baseItems, menu);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
    expect(extras[0].quantity).toBe(4);
  });

  test('"retira o refrigerante" → remove refri, mantém suco', () => {
    const r = _modificarPedidoLocal('retira o refrigerante', baseItems, menu);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
    expect(extras[0].quantity).toBe(3);
  });

  test('"cancela o refrigerante" → remove refri', () => {
    const r = _modificarPedidoLocal('cancela o refrigerante', baseItems, menu);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
  });

  test('"tira a coca" → remove refri (apelido)', () => {
    const r = _modificarPedidoLocal('tira a coca', baseItems, menu);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].name).toBe('Suco Natural');
  });

  test('"adiciona 2 cocas" → incrementa qty do refri existente', () => {
    const r = _modificarPedidoLocal('adiciona 2 cocas', baseItems, menu);
    expect(r).not.toBeNull();
    const refri = r.find(i => i.tipo === 'extra' && i.name === 'Refrigerante Lata');
    expect(refri).toBeDefined();
    expect(refri.quantity).toBe(3);
  });

  test('"sem refrigerante" → remove refri', () => {
    const r = _modificarPedidoLocal('sem refrigerante', baseItems, menu);
    expect(r).not.toBeNull();
    const extras = r.filter(i => i.tipo === 'extra');
    expect(extras).toHaveLength(1);
  });

  test('"troca suco por coca" sem suco no pedido → null', () => {
    const items = [{ tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }];
    const r = _modificarPedidoLocal('troca suco por coca', items, menu);
    expect(r).toBeNull();
  });

  test('"bla bla bla" (texto irrelevante) → null', () => {
    const r = _modificarPedidoLocal('está chovendo hoje', baseItems, menu);
    expect(r).toBeNull();
  });

  test('marmitas não são afetadas pela modificação de extras', () => {
    const r = _modificarPedidoLocal('retira o refrigerante', baseItems, menu);
    expect(r).not.toBeNull();
    const marmitas = r.filter(i => i.tipo === 'marmita');
    expect(marmitas).toHaveLength(1);
    expect(marmitas[0].proteinas[0].name).toBe('Churrasco');
  });
});
