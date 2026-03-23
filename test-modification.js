require('dotenv').config();
const { interpretarModificacaoPedido } = require('./aiInterpreter');

async function testModification() {
    const currentItems = [
        {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            proteinas: [{ name: 'Frango' }, { name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
            saladas: [{ name: 'Alface' }]
        }
    ];

    const userText = "quero trocar o frango por carne cozida";

    console.log("--- Pedido Original ---");
    console.log(JSON.stringify(currentItems, null, 2));

    console.log("\nProcessando modificação: " + userText);
    try {
        const result = await interpretarModificacaoPedido(userText, currentItems);
        if (result) {
            console.log("\n--- Pedido Modificado ---");
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log("\nNenhuma modificação detectada (retorno nulo).");
        }
    } catch (e) {
        console.error("\nERRO DURANTE O TESTE:");
        console.error(e);
    }
}

testModification();
