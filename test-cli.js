// c:\Users\Maissistem\Desktop\AGENTE RESTAURANTE\test-cli.js
// ═════════════════════════════════════════════════════════════════
// SIMULADOR DE TERMINAL PARA O AGENTE MARMITARIA
// Rode: node test-cli.js
// ═════════════════════════════════════════════════════════════════

require('dotenv').config();
const readline = require('readline');
const { process: stateProcess, ESTADOS } = require('./stateMachine');
const db = require('./database');

// ─── Simula cliente cadastrado (sem Supabase real) ───────────────
const CLIENTE_SIMULADO = {
    name: 'Tarcisio',
    phone: '5511999999999',
    preferences: {},
    last_order: null
};
db.getCustomerByPhone = async () => CLIENTE_SIMULADO;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const companyId = 'demo-company';
const phone = '5511999999999';
const company = {
    name: 'Marmitas Caseiras',
    delivery_fee: 5,
    estimated_time_default: 40,
    pix_key: 'telefone: 11999999999',
    opening_hours: '10h às 22h',
    address: 'Rua das Marmitas, 123 - Centro'
};

// Estado simulado em memória (representa o Redis na vida real)
let userState = {
    etapa: 'INICIO',
    pedidoAtual: {
        items: [],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0,
        trocoPara: null
    },
    _marmitaAtual: null,
    _pendingMarmitas: 1,
    _currentMarmitaNumber: 1,
    _upsellPhase: null,
    _confirmingAddress: false,
    _askedTroco: false
};

console.log('🍔=========================================🍔');
console.log('  SIMULADOR DO AGENTE MARMITARIA INICIADO  ');
console.log('🍔=========================================🍔\n');

async function interact(text) {
    try {
        const result = await stateProcess(companyId, phone, text, userState, company);
        userState = result.state;

        const messages = Array.isArray(result.response) ? result.response : [result.response];
        for (const msg of messages) {
            if (msg) console.log(`\n🤖 Bot: \n${msg}\n`);
        }

        if (userState.etapa === 'FINALIZADO') {
            console.log('\n--- Pedido Finalizado. Reiniciando fluxo ---\n');
            userState.etapa = 'INICIO';
            await interact('oi'); // Reinicia automático
        } else {
            promptUser();
        }
    } catch (error) {
        console.error('Erro no processamento:', error);
        promptUser();
    }
}

function promptUser() {
    rl.question('👤 Você: ', (answer) => {
        if (answer.toLowerCase() === 'sair' || answer.toLowerCase() === 'exit') {
            console.log('Encerrando simulador.');
            process.exit(0);
        } else {
            interact(answer);
        }
    });
}

// Inicia com um "Oi" silenciado para disparar a primeira mensagem do bot
interact('oi');
