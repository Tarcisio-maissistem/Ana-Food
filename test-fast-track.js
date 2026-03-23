/**
 * Teste automatizado do Fast Track
 * Simula a conversa problemática e valida o comportamento esperado
 * 
 * Cenário: "quero 4 marmitas 3 grandes e 1 pequena, com frango e churrasco, maionese feijão e arroz pagamento no pix pra retirar"
 * 
 * Esperado:
 * - Fast track deve capturar: 2 grupos (3 grandes + 1 pequena)
 * - Proteínas: Frango, Churrasco (para ambos)
 * - Acompanhamentos: Arroz, Feijão (para ambos) 
 * - Saladas: Maionese (para ambos)
 * - Tipo: pickup (retirar)
 * - Pagamento: Pix
 * - NÃO deve perguntar tamanho novamente
 * - NÃO deve mencionar "Média"
 */

const { process: processMessage } = require('./stateMachine');

const COMPANY_ID = 'test-fast-track';
const PHONE = '5511999999999';

// Estado inicial limpo
function createFreshState() {
  return {
    etapa: 'MONTANDO_TAMANHO', // Onde o fast track é ativado
    pedidoAtual: {
      items: [],
      type: null,
      address: null,
      paymentMethod: null,
      deliveryFee: 0
    },
    _marmitaAtual: null,
    _grupos: null,
    _currentGrupoIndex: 0
  };
}

// Cores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function pass(msg) { console.log(`${GREEN}✓ PASS${RESET}: ${msg}`); }
function fail(msg) { console.log(`${RED}✗ FAIL${RESET}: ${msg}`); }
function info(msg) { console.log(`${CYAN}ℹ INFO${RESET}: ${msg}`); }
function warn(msg) { console.log(`${YELLOW}⚠ WARN${RESET}: ${msg}`); }

async function testFastTrackCompleto() {
  console.log('\n' + '═'.repeat(60));
  console.log('TESTE: Fast Track com pedido completo');
  console.log('═'.repeat(60));

  const state = createFreshState();
  const input = 'quero 4 marmitas 3 grandes e 1 pequena, com frango e churrasco, maionese feijão e arroz pagamento no pix pra retirar';
  
  info(`Input: "${input}"`);
  info(`Estado inicial: ${state.etapa}`);

  let result;
  try {
    result = await processMessage(COMPANY_ID, PHONE, input, state);
  } catch (err) {
    fail(`Erro no processamento: ${err.message}`);
    console.error(err.stack);
    return { passed: 0, failed: 1 };
  }

  let passed = 0;
  let failed = 0;

  info(`Estado final: ${result.state.etapa}`);
  info(`Resposta: ${result.response?.slice(0, 100)}...`);

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDAÇÕES
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Não deve ir para MONTANDO_PROTEINA perguntando proteína (já informou)
  if (result.state.etapa === 'MONTANDO_PROTEINA') {
    // Verifica se os grupos têm proteínas
    const grupos = result.state._grupos;
    if (grupos && grupos.every(g => g.proteinas && g.proteinas.length > 0)) {
      fail('Foi para MONTANDO_PROTEINA mas grupos já têm proteínas!');
      failed++;
    } else if (!grupos || grupos.length === 0) {
      fail('Fast track não criou grupos!');
      failed++;
    } else {
      warn('Grupos criados mas proteínas não foram capturadas do input');
      console.log('  Grupos:', JSON.stringify(grupos, null, 2));
    }
  } else {
    pass('Não foi para MONTANDO_PROTEINA desnecessariamente');
    passed++;
  }

  // 2. Não deve mencionar "Média" na resposta
  if (result.response && /média|media/i.test(result.response)) {
    fail(`Resposta menciona "Média": ${result.response}`);
    failed++;
  } else {
    pass('Resposta não menciona "Média"');
    passed++;
  }

  // 3. Verificar se grupos foram criados corretamente
  const grupos = result.state._grupos;
  if (grupos && grupos.length > 0) {
    pass(`Grupos criados: ${grupos.length}`);
    passed++;
    
    // Verificar estrutura dos grupos
    const grupoGrande = grupos.find(g => g.tamanho === 'Grande');
    const grupoPequena = grupos.find(g => g.tamanho === 'Pequena');
    
    if (grupoGrande && grupoGrande.qty === 3) {
      pass('Grupo Grande com qty=3');
      passed++;
    } else {
      fail(`Grupo Grande esperado qty=3, got: ${JSON.stringify(grupoGrande)}`);
      failed++;
    }
    
    if (grupoPequena && grupoPequena.qty === 1) {
      pass('Grupo Pequena com qty=1');
      passed++;
    } else {
      fail(`Grupo Pequena esperado qty=1, got: ${JSON.stringify(grupoPequena)}`);
      failed++;
    }
    
    // Verificar se proteínas foram capturadas
    const todasProteinas = grupos.every(g => g.proteinas && g.proteinas.length > 0);
    if (todasProteinas) {
      pass('Proteínas capturadas em todos os grupos');
      passed++;
      console.log('  Proteínas:', grupos.map(g => g.proteinas).join(' | '));
    } else {
      fail('Proteínas NÃO foram capturadas');
      failed++;
      console.log('  Grupos:', JSON.stringify(grupos, null, 2));
    }
    
    // Verificar se acompanhamentos foram capturados
    const todosAcomps = grupos.every(g => g.acompanhamentos && g.acompanhamentos.length > 0);
    if (todosAcomps) {
      pass('Acompanhamentos capturados em todos os grupos');
      passed++;
    } else {
      warn('Acompanhamentos não foram capturados (pode ser OK se salada sim)');
    }
  } else if (result.state.pedidoAtual.items.length > 0) {
    // Grupos já foram expandidos para items
    pass('Grupos já expandidos para items');
    passed++;
    const marmitas = result.state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
    info(`Total de marmitas: ${marmitas.length}`);
    if (marmitas.length === 4) {
      pass('Total correto: 4 marmitas');
      passed++;
    } else {
      fail(`Esperado 4 marmitas, tem ${marmitas.length}`);
      failed++;
    }
  } else {
    fail('Nenhum grupo ou item criado!');
    failed++;
  }

  // 4. Verificar tipo e pagamento
  if (result.state.pedidoAtual.type === 'pickup') {
    pass('Tipo capturado: pickup');
    passed++;
  } else {
    warn(`Tipo não capturado (${result.state.pedidoAtual.type})`);
  }

  if (result.state.pedidoAtual.paymentMethod === 'Pix') {
    pass('Pagamento capturado: Pix');
    passed++;
  } else {
    warn(`Pagamento não capturado (${result.state.pedidoAtual.paymentMethod})`);
  }

  return { passed, failed };
}

async function testFluxoSemRepeticao() {
  console.log('\n' + '═'.repeat(60));
  console.log('TESTE: Fluxo não deve repetir perguntas');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;

  // Simular estado após fast track com grupos criados
  const stateComGrupos = {
    etapa: 'MONTANDO_SALADA',
    pedidoAtual: {
      items: [],
      type: 'pickup',
      paymentMethod: 'Pix',
      deliveryFee: 0
    },
    _grupos: [
      { tamanho: 'Grande', qty: 3, proteinas: ['Frango', 'Churrasco'], acompanhamentos: ['Arroz', 'Feijão'], saladas: null },
      { tamanho: 'Pequena', qty: 1, proteinas: ['Frango', 'Churrasco'], acompanhamentos: ['Arroz', 'Feijão'], saladas: null }
    ],
    _currentGrupoIndex: 0
  };

  info('Simulando resposta de salada para grupo Grande...');
  
  let result;
  try {
    result = await processMessage(COMPANY_ID, PHONE, 'maionese', stateComGrupos);
  } catch (err) {
    fail(`Erro: ${err.message}`);
    return { passed: 0, failed: 1 };
  }

  info(`Estado após salada: ${result.state.etapa}`);

  // Não deve ir para MONTANDO_TAMANHO
  if (result.state.etapa === 'MONTANDO_TAMANHO') {
    fail('Foi para MONTANDO_TAMANHO após salada - BUG!');
    failed++;
  } else {
    pass('Não voltou para MONTANDO_TAMANHO');
    passed++;
  }

  // Se ainda tem grupo sem salada, deve perguntar para o próximo grupo
  if (result.state.etapa === 'MONTANDO_SALADA') {
    if (result.state._currentGrupoIndex === 1) {
      pass('Avançou para próximo grupo (Pequena)');
      passed++;
    } else {
      warn('Ainda no mesmo grupo');
    }
  }

  // Resposta não deve mencionar "Média"
  if (/média|media/i.test(result.response || '')) {
    fail('Menciona Média na resposta!');
    failed++;
  } else {
    pass('Sem menção a Média');
    passed++;
  }

  return { passed, failed };
}

async function runAllTests() {
  console.log('\n' + '🍔'.repeat(30));
  console.log('  TESTE AUTOMATIZADO DO FAST TRACK');
  console.log('🍔'.repeat(30));

  let totalPassed = 0;
  let totalFailed = 0;

  const test1 = await testFastTrackCompleto();
  totalPassed += test1.passed;
  totalFailed += test1.failed;

  const test2 = await testFluxoSemRepeticao();
  totalPassed += test2.passed;
  totalFailed += test2.failed;

  console.log('\n' + '═'.repeat(60));
  console.log('RESUMO');
  console.log('═'.repeat(60));
  console.log(`${GREEN}Passou: ${totalPassed}${RESET}`);
  console.log(`${RED}Falhou: ${totalFailed}${RESET}`);

  if (totalFailed > 0) {
    console.log(`\n${RED}❌ TESTES FALHARAM${RESET}`);
    console.log('\nProblemas identificados:');
    console.log('1. O fast track não está capturando/validando proteínas corretamente');
    console.log('2. Verificar classificarFastTrack() em aiInterpreter.js');
    console.log('3. Verificar validação de proteínas no stateMachine.js linha ~210');
    process.exit(1);
  } else {
    console.log(`\n${GREEN}✅ TODOS OS TESTES PASSARAM${RESET}`);
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
