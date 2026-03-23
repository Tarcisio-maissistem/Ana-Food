// c:\Users\Maissistem\Desktop\AGENTE RESTAURANTE\templates.test.js
// ═════════════════════════════════════════════════════════════════
// Testes de Cálculos e Templates
// ═════════════════════════════════════════════════════════════════

const { calcTotal, fmt, confirmacaoFinal, _formatarMarmita, pagamentoComTroco, perguntarTipo, pedirAcompanhamentoESalada, oferecerUpsellBebida, oferecerUpsellSobremesa, pedirEndereco, confirmarEndereco } = require('./templates');

describe('Marmita Formatting', () => {
    test('✅ Formata Marmita com ingredientes escolhidos', () => {
        const marmita = {
            tamanho: 'Grande',
            proteinas: [{ name: 'Frango' }, { name: 'Costela' }],
            acompanhamentos: [{ name: 'Arroz' }],
            saladas: []
        };
        const res = _formatarMarmita(marmita);
        expect(res).toContain('Marmita Grande');
        expect(res).toContain('Frango + Costela');
        expect(res).toContain('Arroz');
        expect(res).not.toContain('🥗'); // Não selecionou salada
    });

    test('✅ Mostra quantidade quando > 1', () => {
        const marmita = {
            tamanho: 'Grande',
            price: 22,
            quantity: 3,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Arroz' }],
            saladas: [{ name: 'Alface' }]
        };
        const res = _formatarMarmita(marmita);
        expect(res).toContain('3x');
        expect(res).toContain('66,00'); // 22 * 3
    });

    test('✅ Não mostra prefixo quando quantity = 1', () => {
        const marmita = {
            tamanho: 'Pequena',
            price: 20,
            quantity: 1,
            proteinas: [{ name: 'Frango' }],
            acompanhamentos: [],
            saladas: []
        };
        const res = _formatarMarmita(marmita);
        expect(res).not.toContain('1x');
        expect(res).toContain('20,00');
    });
});

describe('calcTotal', () => {
    test('Ô£à Subtotal R$44 (2 grandes) + taxa R$8 = R$52', () => {
        const items = [
            { tipo: 'marmita', price: 22, quantity: 2 }
        ];
        expect(calcTotal(items, 8)).toBe(52);
    });

    test('Ô£à Subtotal R$20 (1 P) + Bebida (R$6) sem taxa = R$26', () => {
        const items = [
            { tipo: 'marmita', price: 20, quantity: 1 },
            { tipo: 'extra', price: 6, quantity: 1 }
        ];
        expect(calcTotal(items, 0)).toBe(26);
    });

    test('⚠ taxa undefined = usa 0', () => {
        const items = [{ price: 20, quantity: 1 }];
        expect(calcTotal(items)).toBe(20);
    });

    test('✅ base_price tem prioridade sobre price', () => {
        const items = [
            { tipo: 'marmita', base_price: 20, price: 20, quantity: 1 }
        ];
        expect(calcTotal(items, 0)).toBe(20);
    });

    test('✅ Extras embutidos no item são somados corretamente', () => {
        const items = [
            {
                tipo: 'marmita',
                base_price: 22,
                price: 22,
                quantity: 1,
                extras: [{ name: 'Bacon', price: 3 }]
            }
        ];
        // 22 + 3 = 25
        expect(calcTotal(items, 0)).toBe(25);
    });

    test('✅ Extras embutidos com quantidade > 1', () => {
        const items = [
            {
                tipo: 'marmita',
                base_price: 20,
                price: 20,
                quantity: 2,
                extras: [{ name: 'Queijo', price: 2 }]
            }
        ];
        // (20 + 2) * 2 = 44
        expect(calcTotal(items, 5)).toBe(49);
    });
});

describe('fmt', () => {
    test('Ô£à 25 ÔåÆ "25,00"', () => {
        expect(fmt(25)).toBe('25,00');
    });
    test('Ô£à 28.5 ÔåÆ "28,50"', () => {
        expect(fmt(28.5)).toBe('28,50');
    });
});

describe('confirmacaoFinal', () => {
    test('Ô£à Delivery: deve conter endere├ºo e taxa', () => {
        const items = [{ tipo: 'marmita', tamanho: 'Pequena', price: 20, quantity: 1 }];
        const result = confirmacaoFinal({
            items,
            type: 'delivery',
            address: 'Rua das Flores, 123, Centro',
            deliveryFee: 8,
            paymentMethod: 'Pix',
            estimatedTime: 40
        });

        // confirmacaoFinal retorna um Array com 2 mensagens no novo formato
        const msg = result[0]; // Mensagem do resumo

        expect(msg).toContain('RESUMO FINAL');
        expect(msg).toContain('Rua das Flores, 123, Centro');
        expect(msg).toContain('8,00');
        expect(msg).toContain('Pix');
    });

    test('Ô£à Retirada: N├âO deve conter endere├ºo nem taxa', () => {
        const items = [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1 }];
        const result = confirmacaoFinal({
            items,
            type: 'pickup',
            address: null,
            deliveryFee: 0,
            paymentMethod: 'Dinheiro',
            trocoPara: 50,
            estimatedTime: 20
        });

        const msg = result[0];

        expect(msg).toContain('Retirada no balcão');
        expect(msg).toContain('Dinheiro');
        expect(msg).toContain('50,00'); // Troco
        expect(msg).toContain('22,00'); // Total sem taxa
    });
});

describe('pagamentoComTroco com total', () => {
    test('✅ pagamentoComTroco(33) → contém "R$ 33,00"', () => {
        const res = pagamentoComTroco(33);
        expect(res).toContain('R$ 33,00');
    });

    test('✅ pagamentoComTroco(33) → contém "troco pra"', () => {
        const res = pagamentoComTroco(33);
        expect(res).toContain('troco pra');
    });
});

describe('perguntarTipo com itens completos', () => {
    test('✅ perguntarTipo([marmita, suco]) → contém "Suco Natural"', () => {
        const items = [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{ name: 'Frango' }], acompanhamentos: [{ name: 'Arroz' }], saladas: [{ name: 'Alface' }] },
            { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
        ];
        const res = perguntarTipo(items);
        const joined = Array.isArray(res) ? res.join('\n') : res;
        expect(joined).toContain('Suco Natural');
    });

    test('✅ perguntarTipo([marmita]) → contém "Marmita"', () => {
        const items = [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: [] }
        ];
        const res = perguntarTipo(items);
        const joined = Array.isArray(res) ? res.join('\n') : res;
        expect(joined).toContain('Marmita');
    });
});

// ═══════════════════════════════════════════════════════════════
// Acomp+Salada combinado e remoção de hints
// ═══════════════════════════════════════════════════════════════

describe('pedirAcompanhamentoESalada', () => {
    test('contém "Acompanhamento"', () => {
        const msg = pedirAcompanhamentoESalada();
        expect(msg).toContain('Acompanhamento');
    });

    test('contém "Salada"', () => {
        const msg = pedirAcompanhamentoESalada();
        expect(msg).toContain('Salada');
    });
});

describe('Nenhuma mensagem contém hints em parênteses', () => {
    test('hints _(pode pular)_ e _(até 2)_ removidos de templates', () => {
        const mensagens = [
            oferecerUpsellBebida('Anotado!'),
            oferecerUpsellSobremesa('Ok!'),
            pedirEndereco(),
            confirmarEndereco('Rua Teste 123'),
            pagamentoComTroco([{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1 }]),
            confirmacaoFinal({ items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }], type: 'delivery', address: 'Rua X', paymentMethod: 'Pix', deliveryFee: 5 }),
            pedirAcompanhamentoESalada()
        ];
        const tudo = mensagens.flat().join(' ');
        expect(tudo).not.toMatch(/\(pode pular\)/i);
        expect(tudo).not.toMatch(/\(até 2\)/i);
        expect(tudo).not.toMatch(/\(sim \/ não\)/i);
        expect(tudo).not.toMatch(/\(Rua, número/i);
        expect(tudo).not.toMatch(/Digite "não"/i);
    });
});
