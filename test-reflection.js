require('dotenv').config();
const { reflectAndImprovePrompt } = require('./aiInterpreter');

async function testSelfReflection() {
    const fakeBadConversation = `
Cliente: Olá
Ana: Por favor, selecione 1 para Grande ou 2 para Pequena.
Cliente: Pode ser 1, de frango
Ana: Erro. Proteínas recebidas. Confirme a opção de acompanhamento.
Cliente: Nossa, que confuso, manda arroz.
Ana: Acompanhamento recebido. Resumo: Grande, Frango, Arroz. Total R$22. Confirma?
Cliente: Sim.
`;

    console.log("Iniciando reflexão sobre conversa engessada...");
    await reflectAndImprovePrompt(fakeBadConversation);
    console.log("Reflexão concluída! O arquivo instructions.txt foi atualizado se a API da OpenAI o acionou.");
}

testSelfReflection();
