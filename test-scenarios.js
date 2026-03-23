// test-scenarios.js
// ═══════════════════════════════════════════════════════════════════════
// SIMULADOR AVANÇADO — 12 Cenários Reais de Atendimento de Marmitaria
// Baseado em padrões reais de comportamento de clientes via WhatsApp
//
// Uso: node test-scenarios.js
//      node test-scenarios.js 3        (roda só o cenário 3)
//      node test-scenarios.js --auto   (roda todos automaticamente)
// ═══════════════════════════════════════════════════════════════════════

require('dotenv').config();
const readline = require('readline');
const { process: stateProcess } = require('./stateMachine');
const db = require('./database');

// ─── CONFIG BASE ─────────────────────────────────────────────────────────────

const company = {
  name: 'Marmitas Caseiras',
  delivery_fee: 5,
  estimated_time_default: 40,
  pix_key: '11999999999',
  opening_hours: 'Seg a Sáb, 10h às 22h',
  address: 'Rua das Marmitas, 123 - Centro'
};

// ─── CENÁRIOS ────────────────────────────────────────────────────────────────
// Cada cenário simula um perfil real de cliente com comportamento específico.
// Fonte: padrões observados em atendimentos reais de delivery via WhatsApp.

const CENARIOS = [

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 1,
    nome: '🏃 Cliente com Pressa',
    descricao: 'Manda tudo de uma vez, quer resposta rápida, pouca paciência para perguntas',
    perfil: { name: 'Rafael', phone: '5511900000001', preferences: {}, last_order: null },
    mensagens: [
      'oi quero 1 grande de frango com arroz e feijão pix retirada',
      'sim',
    ],
    verificar: [
      'deve ir direto ao resumo sem perguntar tudo de novo',
      'deve capturar: tamanho=Grande, proteína=Frango, acomps=Arroz+Feijão, pagamento=Pix, tipo=pickup',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 2,
    nome: '🤔 Cliente Indeciso',
    descricao: 'Pergunta o que tem, pede recomendação, muda de ideia',
    perfil: { name: 'Juliana', phone: '5511900000002', preferences: {}, last_order: null },
    mensagens: [
      'oi',
      'o que tem de proteína?',
      'qual você recomenda?',
      'pode ser frango então',
      'tanto faz',       // acompanhamento
      'sem salada',
      'não',            // sem upsell
      'entrega',
      'Rua Castro Alves, 200, Jardim Europa',
      'sim',
      'pix',
      'sim',
    ],
    verificar: [
      'bot deve sugerir quando perguntado',
      'deve aceitar "tanto faz" e sugerir algo',
      'fluxo deve chegar à confirmação sem travar',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 3,
    nome: '👨‍👩‍👧‍👦 Pedido Grande para Família',
    descricao: 'Pede várias marmitas com ingredientes diferentes, bebidas em quantidade',
    perfil: { name: 'Marcia', phone: '5511900000003', preferences: {}, last_order: null },
    mensagens: [
      '4 marmitas sendo 3 grandes e 1 pequena',
      'frango e churrasco',           // proteína das grandes
      'costela',                       // proteína da pequena
      'arroz e feijão',               // acomp grandes
      'pure',                          // acomp pequena
      'alface e maionese',            // salada grandes
      'repolho',                       // salada pequena
      '3 sucos e 2 refri',            // upsell com quantidade
      'entrega',
      'Av Paulista 1000 apto 52 Bela Vista',
      'sim',
      'dinheiro troco pra 200',
      'sim',
    ],
    verificar: [
      'deve criar 4 marmitas com ingredientes distintos por grupo',
      'bebidas: 3x Suco + 2x Refrigerante',
      'resumo deve agrupar as 3 grandes (3x Marmita Grande — R$66)',
      'troco deve ser capturado junto com a forma de pagamento',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 4,
    nome: '✏️ Cliente que Muda de Ideia',
    descricao: 'Começa pedindo uma coisa, muda no meio, cancela item, adiciona outro',
    perfil: { name: 'Bruno', phone: '5511900000004', preferences: {}, last_order: null },
    mensagens: [
      '2 grandes',
      'frango',
      'na verdade quero 3 grandes',    // muda quantidade no meio
      'frango e churrasco',
      'arroz e feijão',
      'arroz e feijão',
      'alface',
      'alface',
      'não quero bebida',
      'retirada',
      'cartão',
      'tira uma marmita',              // modifica antes de confirmar
      'sim',
    ],
    verificar: [
      'deve aceitar mudança de quantidade',
      'deve aceitar remoção de item na confirmação',
      'total deve refletir 2 marmitas após remoção',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 5,
    nome: '😤 Cliente Frustrado',
    descricao: 'Fica confuso, reclama do bot, usa linguagem informal e emoções',
    perfil: { name: 'Caio', phone: '5511900000005', preferences: {}, last_order: null },
    mensagens: [
      'oi',
      'grande',
      'sei lá, o que tem?',           // não sabe a proteína
      'frango',
      'não entendi',                   // confuso com acompanhamentos
      'arroz',
      'aff',                           // frustração
      'maionese',
      'não quero bebida',
      'entrega',
      'Rua 7 de Setembro 300 centro',
      'sim',
      'pix',
      'sim',
    ],
    verificar: [
      'deve responder com empatia ao "aff"',
      'não deve travar no estado de acompanhamento',
      'fluxo deve completar mesmo com o cliente frustrado',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 6,
    nome: '❓ Cliente Perguntão',
    descricao: 'Faz várias perguntas antes de pedir: horário, taxa, endereço, pagamento',
    perfil: { name: 'Fernanda', phone: '5511900000006', preferences: {}, last_order: null },
    mensagens: [
      'oi, boa tarde',
      'qual o horário de funcionamento?',
      'vocês entregam no Jardim América?',
      'qual a taxa?',
      'aceita cartão?',
      'tem marmita vegetariana?',
      'quanto custa a pequena?',
      'quero uma pequena então',
      'sem carne, só feijão e arroz',   // proteína vegetariana / pular
      'arroz e feijão',
      'nenhuma salada',
      'não',                             // sem bebida
      'entrega',
      'Rua das Acácias 45 Jardim América',
      'sim',
      'pix',
      'sim',
    ],
    verificar: [
      'deve responder perguntas de FAQ e retomar o fluxo',
      'deve aceitar pular proteína',
      'fluxo deve chegar à confirmação',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 7,
    nome: '🔤 Cliente com Typos',
    descricao: 'Escreve tudo errado: custela, churrascp, feijao, maiones, alfaçe',
    perfil: { name: 'Diego', phone: '5511900000007', preferences: {}, last_order: null },
    mensagens: [
      'oi quero uma grandi',           // typo em grande
      'churrascp e custela',           // typos em churrasco e costela
      'aroz e feijao',                 // typos em arroz e feijão
      'maiones e alfaçe',              // typos em maionese e alface
      'nao quero bebida',
      'retirada',
      'dinhero',                       // typo em dinheiro
      'sem troco',
      'sim',
    ],
    verificar: [
      '"grandi" → Grande',
      '"churrascp" → Churrasco',
      '"custela" → Costela',
      '"aroz" → Arroz',
      '"maiones" → Maionese',
      '"alfaçe" → Alface',
      '"dinhero" → Dinheiro',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 8,
    nome: '🔄 Cliente Recorrente — Quer Repetir',
    descricao: 'Cliente com histórico quer repetir o pedido anterior',
    perfil: {
      name: 'Tarcisio',
      phone: '5511900000008',
      preferences: { favorite_payment: 'Pix', usual_type: 'delivery', last_address: 'Rua das Flores, 123' },
      last_order: [
        {
          tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
          proteinas: [{ name: 'Frango Grelhado' }],
          acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
          saladas: [{ name: 'Alface' }]
        }
      ]
    },
    mensagens: [
      'oi quero o mesmo de ontem',
      'sim',            // confirma repetição
      'não',            // sem bebida
      'entrega',
      'Rua das Flores, 123, Centro',
      'sim',
      'pix',
      'sim',
    ],
    verificar: [
      'deve reconhecer intenção de repetir o pedido',
      'deve mostrar o último pedido e pedir confirmação',
      'deve pular montagem e ir para tipo/entrega',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 9,
    nome: '❌ Tentativa de Cancelamento',
    descricao: 'Cliente cancela, desiste de cancelar, e finaliza o pedido',
    perfil: { name: 'Amanda', phone: '5511900000009', preferences: {}, last_order: null },
    mensagens: [
      'oi',
      'grande',
      'frango',
      'arroz',
      'sem salada',
      'não',
      'cancela',        // tenta cancelar
      'não',            // desiste de cancelar
      'entrega',
      'Rua XV de Novembro 500 centro',
      'sim',
      'pix',
      'sim',
    ],
    verificar: [
      '"cancela" deve pedir confirmação, não cancelar direto',
      '"não" depois de "Quer cancelar?" deve retomar o pedido',
      'pedido deve ser completado normalmente',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 10,
    nome: '💰 Dinheiro com Troco',
    descricao: 'Fluxo completo com dinheiro — cliente não sabe o troco antes de ver o total',
    perfil: { name: 'Marcos', phone: '5511900000010', preferences: {}, last_order: null },
    mensagens: [
      'grande',
      'costela e linguiça',
      'feijão e tropeiro',
      'beterraba',
      'não',
      'entrega',
      'Av Independência 750 Bairro Novo',
      'sim',
      'dinheiro',
      'não sei o valor ainda',         // cliente não sabe o troco
      'troco pra 50',                  // depois de ver o total
      'sim',
    ],
    verificar: [
      'deve mostrar o total ANTES de perguntar o troco',
      '"não sei o valor ainda" não deve travar o fluxo',
      'deve mostrar o total novamente e aguardar',
      'deve capturar troco corretamente na segunda tentativa',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 11,
    nome: '🔍 Cliente Pede Resumo no Meio',
    descricao: 'Solicita o resumo em vários momentos diferentes do fluxo',
    perfil: { name: 'Patricia', phone: '5511900000011', preferences: {}, last_order: null },
    mensagens: [
      '2 grandes',
      'frango',
      'frango',
      'arroz e feijão',
      'arroz e feijão',
      'alface',
      'alface',
      '1 suco e 2 refri',
      'quero ver o resumo completo',   // pede resumo aqui
      'entrega',
      'Rua Barão de Itapura 1200 Bosque',
      'sim',
      'cartão',
      'pode me mostrar o pedido de novo?',  // pede resumo de novo
      'sim',
    ],
    verificar: [
      'ASK_SUMMARY deve funcionar em AGUARDANDO_TIPO',
      'ASK_SUMMARY deve funcionar em CONFIRMANDO',
      'resumo deve mostrar TODAS as marmitas agrupadas + bebidas',
      'após resumo deve retomar o fluxo de onde parou',
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 12,
    nome: '🌀 Conversa Caótica (Teste de Stress)',
    descricao: 'Cliente mistura tudo: perguntas, mudanças, typos, emojis, textos longos',
    perfil: { name: 'Henrique', phone: '5511900000012', preferences: {}, last_order: null },
    mensagens: [
      'boa tarde!! 😊😊',
      'quero pedir uma marmita grande com frango e churras e arroz com feijão sem salada pix entrega no centro',
      'espera, posso trocar?',         // quer mudar
      'tira o churrasco e coloca costela',
      'o resumo ta certo?',            // pede resumo
      'sim tudo certo',
      'entrega',
      'Praça da República 10 Centro SP',
      'sim',
      'pix',
      'sim manda confirmar',
    ],
    verificar: [
      'fast track deve capturar pedido completo da primeira mensagem',
      'modificação "tira e coloca" deve funcionar',
      'ASK_SUMMARY deve responder e retomar',
      'pedido deve ser finalizado corretamente',
    ]
  },
];

// ─── MOTOR DE EXECUÇÃO ────────────────────────────────────────────────────────

function criarEstadoInicial() {
  return {
    etapa: 'INICIO',
    pedidoAtual: {
      items: [], type: null, address: null,
      paymentMethod: null, deliveryFee: 0, trocoPara: null
    },
    _marmitaAtual: null,
    _pendingMarmitas: 1,
    _currentMarmitaNumber: 1,
    _upsellPhase: null,
    _confirmingAddress: false,
    _askedTroco: false,
    _sugestaoAcomp: null,
    _sugestaoSalada: null,
    _tamanhoParaTodasAsMarmitas: null,
    _confirmandoCancelamento: false,
    _loopCount: 0,
    aguardandoResposta: false,
    lastInteraction: Date.now()
  };
}

async function executarMensagem(mensagem, estado, perfil) {
  const result = await stateProcess(
    'test-company',
    perfil.phone,
    mensagem,
    estado,
    company
  );
  return result;
}

function printMensagens(responses) {
  const msgs = Array.isArray(responses) ? responses : [responses];
  for (const msg of msgs) {
    if (msg) {
      console.log(`\n  🤖 ${msg.split('\n').join('\n     ')}`);
    }
  }
}

function printSeparador(titulo) {
  const linha = '─'.repeat(60);
  console.log(`\n${linha}`);
  if (titulo) console.log(`  ${titulo}`);
  console.log(linha);
}

// ─── MODO AUTOMÁTICO ─────────────────────────────────────────────────────────

async function rodarCenarioAuto(cenario) {
  printSeparador(`CENÁRIO ${cenario.id}: ${cenario.nome}`);
  console.log(`  📋 ${cenario.descricao}\n`);

  // Mock do banco de dados com o perfil do cenário
  db.getCustomerByPhone = async () => cenario.perfil;

  let estado = criarEstadoInicial();
  let erros = 0;

  // Dispara mensagem inicial
  try {
    const init = await executarMensagem('oi', estado, cenario.perfil);
    estado = init.state;
    printMensagens(init.response);
  } catch (e) {
    console.error(`  ❌ ERRO na inicialização: ${e.message}`);
    erros++;
  }

  // Executa cada mensagem do cenário
  for (const msg of cenario.mensagens) {
    console.log(`\n  👤 "${msg}"`);
    try {
      const result = await executarMensagem(msg, estado, cenario.perfil);
      estado = result.state;
      printMensagens(result.response);

      // Mostra etapa atual
      console.log(`     [etapa: ${estado.etapa}]`);

      // Pequena pausa para simular conversa
      await new Promise(r => setTimeout(r, 200));

    } catch (e) {
      console.error(`  ❌ ERRO: ${e.message}`);
      erros++;
    }
  }

  // Resultado final
  console.log(`\n  📊 Estado final: ${estado.etapa}`);
  console.log(`  💰 Total: R$ ${estado.pedidoAtual?.items?.length > 0
    ? estado.pedidoAtual.items.reduce((a, i) => a + (i.price || 0) * (i.quantity || 1), 0)
    : 0}`);

  console.log('\n  ✅ O que verificar:');
  for (const v of cenario.verificar) {
    console.log(`     • ${v}`);
  }

  if (erros > 0) {
    console.log(`\n  ⚠️  ${erros} erro(s) durante a execução`);
  }

  return { erros, estadoFinal: estado.etapa };
}

// ─── MODO INTERATIVO ─────────────────────────────────────────────────────────

async function rodarCenarioInterativo(cenario) {
  printSeparador(`CENÁRIO ${cenario.id}: ${cenario.nome}`);
  console.log(`  📋 ${cenario.descricao}`);
  console.log(`  🎯 Perfil: ${cenario.perfil.name}`);

  console.log('\n  ✅ O que testar neste cenário:');
  for (const v of cenario.verificar) {
    console.log(`     • ${v}`);
  }

  console.log('\n  💬 Script sugerido de mensagens:');
  cenario.mensagens.forEach((m, i) => {
    console.log(`     ${i + 1}. "${m}"`);
  });

  console.log('\n');

  // Mock do banco
  db.getCustomerByPhone = async () => cenario.perfil;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let estado = criarEstadoInicial();

  // Init
  const init = await executarMensagem('oi', estado, cenario.perfil);
  estado = init.state;
  printMensagens(init.response);

  const pergunta = () => {
    rl.question('\n  👤 Você: ', async (input) => {
      if (['sair', 'exit', 'q'].includes(input.toLowerCase())) {
        console.log('\n  Saindo do cenário...');
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'reset') {
        console.log('\n  🔄 Reiniciando cenário...');
        estado = criarEstadoInicial();
        const r = await executarMensagem('oi', estado, cenario.perfil);
        estado = r.state;
        printMensagens(r.response);
        pergunta();
        return;
      }

      if (input.toLowerCase() === 'estado') {
        console.log('\n  📊 Estado atual:');
        console.log(JSON.stringify({
          etapa: estado.etapa,
          items: estado.pedidoAtual?.items?.length,
          tipo: estado.pedidoAtual?.type,
          pagamento: estado.pedidoAtual?.paymentMethod
        }, null, 2));
        pergunta();
        return;
      }

      try {
        const result = await executarMensagem(input, estado, cenario.perfil);
        estado = result.state;
        printMensagens(result.response);
        console.log(`  [etapa: ${estado.etapa}]`);

        if (estado.etapa === 'FINALIZADO') {
          console.log('\n  ✅ Pedido finalizado! Digite "reset" para recomeçar ou "sair" para sair.');
        }
      } catch (e) {
        console.error(`  ❌ ERRO: ${e.message}`);
      }

      pergunta();
    });
  };

  pergunta();
}

// ─── MENU PRINCIPAL ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const modoAuto = args.includes('--auto');
  const cenarioEspecifico = args.find(a => /^\d+$/.test(a));

  console.log('\n🍱 ════════════════════════════════════════════════ 🍱');
  console.log('      SIMULADOR AVANÇADO — MARMITAS CASEIRAS');
  console.log('🍱 ════════════════════════════════════════════════ 🍱\n');

  if (modoAuto) {
    // Roda todos os cenários automaticamente
    console.log('  Modo automático — executando todos os cenários...\n');
    let totalErros = 0;

    for (const cenario of CENARIOS) {
      const { erros } = await rodarCenarioAuto(cenario);
      totalErros += erros;
      await new Promise(r => setTimeout(r, 500));
    }

    printSeparador('RESULTADO GERAL');
    console.log(`  Cenários executados: ${CENARIOS.length}`);
    console.log(`  Erros encontrados: ${totalErros}`);
    process.exit(0);

  } else if (cenarioEspecifico) {
    // Roda cenário específico no modo interativo
    const num = parseInt(cenarioEspecifico);
    const cenario = CENARIOS.find(c => c.id === num);

    if (!cenario) {
      console.log(`  ❌ Cenário ${num} não encontrado. Disponíveis: 1 a ${CENARIOS.length}`);
      process.exit(1);
    }

    await rodarCenarioInterativo(cenario);

  } else {
    // Menu de seleção
    console.log('  Cenários disponíveis:\n');
    for (const c of CENARIOS) {
      console.log(`  [${c.id}] ${c.nome}`);
      console.log(`       ${c.descricao}\n`);
    }

    console.log('  Comandos:');
    console.log('    node test-scenarios.js 3         → roda cenário 3 (interativo)');
    console.log('    node test-scenarios.js --auto    → roda todos automaticamente\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  Qual cenário? (número ou "auto"): ', async (resp) => {
      rl.close();

      if (resp === 'auto') {
        process.argv.push('--auto');
        await main();
        return;
      }

      const num = parseInt(resp);
      if (isNaN(num)) { console.log('  Opção inválida.'); process.exit(1); }

      const cenario = CENARIOS.find(c => c.id === num);
      if (!cenario) { console.log(`  Cenário ${num} não encontrado.`); process.exit(1); }

      await rodarCenarioInterativo(cenario);
    });
  }
}

// ─── AJUDA ────────────────────────────────────────────────────────────────────

if (process.argv.includes('--help')) {
  console.log(`
  USO:
    node test-scenarios.js              → menu interativo
    node test-scenarios.js 3            → cenário 3 interativo
    node test-scenarios.js --auto       → todos automáticos
    node test-scenarios.js --help       → esta ajuda

  COMANDOS DURANTE A CONVERSA:
    reset    → reinicia o cenário
    estado   → mostra o estado atual do Redis (simulado)
    sair     → sai do simulador

  CENÁRIOS:
    1  Cliente com Pressa          — fast track, pede tudo de uma vez
    2  Cliente Indeciso            — pede recomendação, hesita
    3  Pedido Grande Família       — múltiplas marmitas e bebidas
    4  Muda de Ideia               — altera o pedido no meio
    5  Cliente Frustrado           — reclama, usa "aff"
    6  Cliente Perguntão           — FAQ antes de pedir
    7  Typos                       — erros de digitação reais
    8  Cliente Recorrente          — quer repetir o último pedido
    9  Cancelamento                — cancela e desiste de cancelar
    10 Dinheiro com Troco          — não sabe o valor antes de ver o total
    11 Pede Resumo no Meio         — ASK_SUMMARY em vários momentos
    12 Conversa Caótica            — stress test completo
  `);
  process.exit(0);
}

main().catch(console.error);
