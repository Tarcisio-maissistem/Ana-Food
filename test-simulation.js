/**
 * Simulação do cenário exato do usuário:
 * "quero 3 marmitas grandes com churrasco arroz e feijão alface e 1 pequena
 *  com carne cozida e linguiça, maionese e alface arroz e feijão,
 *  vou pagar no PIX e vou Buscar"
 *
 * Esperado:
 * 3x Grande — Churrasco | Arroz + Feijão | Alface
 * 1x Pequena — Carne Cozida + Linguiça | Arroz + Feijão | Maionese + Alface
 * Tipo: pickup (Retirada/Buscar)
 * Pagamento: Pix
 */
const sm = require('./stateMachine');
const db = require('./database');

db.getCustomerByPhone = async () => ({ name: 'Tarcisio', preferences: {} });
db.getProducts = async () => [];
db.saveLastOrder = async () => {};
db.saveCustomerPreferences = async () => {};
db.saveCustomer = async () => {};

const COMPANY = { id: 'demo', name: 'Marmitas Caseiras', delivery_fee: 5, estimated_time_default: 40 };

function initState() {
  return {
    etapa: 'MONTANDO_TAMANHO',
    pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null },
    _marmitaAtual: null, _pendingMarmitas: 1, _currentMarmitaNumber: 1,
    _upsellPhase: null, _confirmingAddress: false, _askedTroco: false,
    _awaitingPrefsConfirmation: false, _lastOrderForRepeat: undefined,
    _awaitingAddressChoice: false, _history: '',
    _grupos: null, _currentGrupoIndex: 0, _upsellDone: false,
    _customerName: 'Tarcisio', _preferences: {}
  };
}

async function run() {
  const state = initState();
  let ok = 0, fail = 0;
  function check(label, cond) {
    if (cond) { ok++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
  }

  // ── MSG 1: Pedido completo ─────────────────────────────────────────────
  const msg1 = 'quero 3 marmitas grandes com churrasco arroz e feijão alface e 1 pequena com carne cozida e linguiça, maionese e alface arroz e feijão, vou pagar no PIX e vou Buscar';
  console.log(`\n👤 "${msg1}"\n`);
  const r1 = await sm.process('demo', '5511999', msg1, state, COMPANY);
  const resp1 = Array.isArray(r1.response) ? r1.response.join('\n') : r1.response;

  const marmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita');
  const grandes = marmitas.filter(m => m.tamanho === 'Grande');
  const pequenas = marmitas.filter(m => m.tamanho === 'Pequena');

  console.log('── Verificações MSG 1 ──');
  check('4 marmitas criadas', marmitas.length === 4);
  check('3 grandes', grandes.length === 3);
  check('1 pequena', pequenas.length === 1);

  // Grandes: só Churrasco
  check('Grandes: proteína = Churrasco', grandes.every(m =>
    m.proteinas && m.proteinas.some(p => p.name === 'Churrasco')
  ));
  check('Grandes: SEM Carne Cozida/Linguiça', grandes.every(m =>
    !m.proteinas.some(p => /Carne|Lingu/.test(p.name))
  ));
  check('Grandes: acomp = Arroz + Feijão', grandes.every(m =>
    m.acompanhamentos && m.acompanhamentos.some(a => a.name === 'Arroz') &&
    m.acompanhamentos.some(a => a.name === 'Feijão')
  ));
  check('Grandes: salada = Alface', grandes.every(m =>
    m.saladas && m.saladas.some(s => s.name === 'Alface')
  ));
  check('Grandes: SEM Maionese', grandes.every(m =>
    !m.saladas || !m.saladas.some(s => s.name === 'Maionese')
  ));

  // Pequena: Carne Cozida + Linguiça
  const peq = pequenas[0];
  check('Pequena: proteína = Carne Cozida', peq && peq.proteinas && peq.proteinas.some(p => p.name === 'Carne Cozida'));
  check('Pequena: proteína = Linguiça', peq && peq.proteinas && peq.proteinas.some(p => p.name === 'Linguiça'));
  check('Pequena: SEM Churrasco', peq && !peq.proteinas.some(p => p.name === 'Churrasco'));
  check('Pequena: acomp = Arroz + Feijão', peq && peq.acompanhamentos &&
    peq.acompanhamentos.some(a => a.name === 'Arroz') &&
    peq.acompanhamentos.some(a => a.name === 'Feijão')
  );
  check('Pequena: salada = Maionese + Alface', peq && peq.saladas &&
    peq.saladas.some(s => s.name === 'Maionese') &&
    peq.saladas.some(s => s.name === 'Alface')
  );

  // Tipo e Pagamento
  check('Tipo = pickup (buscar)', state.pedidoAtual.type === 'pickup');
  check('Pagamento = Pix', state.pedidoAtual.paymentMethod === 'Pix');

  // Próxima etapa: deve ir direto pro upsell (bebida) ou confirmação
  check('Não perguntou tipo/pagamento (etapa avançou além)', !['AGUARDANDO_TIPO', 'AGUARDANDO_PAGAMENTO'].includes(state.etapa));

  console.log(`\n🤖 Bot: ${resp1.substring(0, 500)}`);

  // ── MSG 2: Recusa bebida ───────────────────────────────────────────────
  if (state.etapa === 'OFERECENDO_UPSELL') {
    console.log(`\n👤 "não quero bebida"\n`);
    const r2 = await sm.process('demo', '5511999', 'não quero bebida', state, COMPANY);
    const resp2 = Array.isArray(r2.response) ? r2.response.join('\n') : r2.response;
    console.log(`🤖 Bot: ${resp2.substring(0, 500)}`);

    // Se sobremesa
    if (state.etapa === 'OFERECENDO_UPSELL') {
      console.log(`\n👤 "não"\n`);
      const r3 = await sm.process('demo', '5511999', 'não', state, COMPANY);
      const resp3 = Array.isArray(r3.response) ? r3.response.join('\n') : r3.response;
      console.log(`🤖 Bot: ${resp3.substring(0, 500)}`);
    }
  }

  check('Chegou em CONFIRMANDO', state.etapa === 'CONFIRMANDO');

  console.log(`\n══ RESULTADO: ${ok}/${ok+fail} ══`);
  if (fail > 0) console.log('❌ Há falhas!');
  else console.log('✅ TUDO OK!');
}

run().catch(e => console.error('ERRO:', e.message));
