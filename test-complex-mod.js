require('dotenv').config();
const { interpretarModificacaoPedido } = require('./aiInterpreter');

const CARDAPIO = {
    proteinas: [
        { name: 'Frango' }, { name: 'Churrasco', apelidos: ['churras'] }, { name: 'Costela' },
        { name: 'Linguiça', apelidos: ['linguica'] }, { name: 'Carne Cozida', apelidos: ['carne'] }
    ],
    upsellsBebida: [
        { name: 'Suco Natural', price: 8 },
        { name: 'Refrigerante Lata', price: 6, apelidos: ['refrigerante', 'refri', 'lata', 'coca'] }
    ]
};

async function test() {
    const currentItems = [
        {
            tipo: 'marmita',
            tamanho: 'Pequena',
            price: 20,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Arroz' }],
            saladas: [{ name: 'Alface' }, { name: 'Repolho' }]
        },
        { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 },
        { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
    ];

    const userText = "tira o suco e adiciona mais um refri";

    console.log("Pedido Original:", JSON.stringify(currentItems, null, 2));
    console.log("\nModificando:", userText);

    const result = await interpretarModificacaoPedido(userText, currentItems, CARDAPIO);

    if (result) {
        console.log("\nPedido Modificado:", JSON.stringify(result, null, 2));
        const finalTotal = result.reduce((acc, i) => acc + (i.price * (i.quantity || 1)), 0);
        console.log("\nTotal Calculado:", finalTotal);
    } else {
        console.log("\nFalha: IA retornou null");
    }
}

test();
