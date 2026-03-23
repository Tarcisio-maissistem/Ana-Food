// src/intentRouter.js
// ═════════════════════════════════════════════════════════════════
// INTENT ROUTER — Classificação global de intenção ANTES do state switch.
// Toda mensagem passa por aqui primeiro. Se for intenção global (FAQ,
// reclamação de fluxo, falar com humano), resolve aqui.
// Se não, devolve null e o handler de etapa cuida.
// ═════════════════════════════════════════════════════════════════

const { normalizar, interpretQuantity, interpretTamanho } = require('./aiInterpreter');
const ragFAQ = require('./ragFAQ');
const T = require('./templates');

// Etapas onde texto sobre endereço/rua faz parte do fluxo (NÃO é FAQ)
const ETAPAS_BLOQUEIAM_FAQ_ENDERECO = ['AGUARDANDO_ENDERECO', 'CONFIRMANDO', 'AGUARDANDO_NOME'];

// Etapas onde "pix" faz parte do fluxo de pagamento
const ETAPAS_BLOQUEIAM_FAQ_PIX = ['AGUARDANDO_PAGAMENTO', 'CONFIRMANDO'];

/**
 * Classifica a intenção global de uma mensagem.
 *
 * @param {string} text - Mensagem do cliente
 * @param {object} state - Estado atual da sessão
 * @param {object} company - Objeto company do banco
 * @returns {{ intent: string, response: string|string[], _skipHumanize?: boolean, _internalNote?: string, _flagHumano?: boolean, _redirectTo?: string } | null}
 *   Retorna objeto se a intenção foi tratada globalmente.
 *   Retorna null se deve ir para o handler da etapa.
 */
function classify(text, state, company) {
  const lower = normalizar(text);
  const etapa = state.etapa;

  // ─── 0. CANCELAMENTO ─────────────────────────────────────────────
  // Detecta PRIMEIRO: "cancela", "cancelar", "desisti", "para"
  const cancelIntent = detectCancel(lower, state);
  if (cancelIntent) return cancelIntent;

  // ─── 0b. FRUSTRAÇÃO ─────────────────────────────────────────────
  // "aff que chato", "que chato", "irritado", "impossível"
  const frustrationIntent = detectFrustration(lower, state);
  if (frustrationIntent) return frustrationIntent;

  // ─── 0c. RESTART / DESISTÊNCIA SUAVE ───────────────────────────
  // "deixa quieto", "esquece", "começa de novo"
  const restartIntent = detectRestart(lower, state);
  if (restartIntent) return restartIntent;

  // ─── 1. RECLAMAÇÃO DE FLUXO ────────────────────────────────────────
  // "sim mas eu não falei o troco", "ok mas não disse o endereço"
  // Detecta ANTES do FAQ para não confundir com pergunta genérica
  const flowComplaint = detectFlowComplaint(lower, state);
  if (flowComplaint) return flowComplaint;

  // ─── 1a. CORREÇÃO DE BEBIDAS ───────────────────────────────────────
  // "faltou as 3 cocas", "minhas bebidas", "pedi 3 refris"
  const drinkCorrection = detectDrinkCorrection(lower, state);
  if (drinkCorrection) return drinkCorrection;

  // ─── 1b. CORREÇÃO DE QUANTIDADE DE MARMITAS ────────────────────────
  // "são 3 marmitas", "falei que são 3 grandes" — só fora da montagem
  const qtCorrection = detectQuantityCorrection(lower, state);
  if (qtCorrection) return qtCorrection;

  // ─── 2. FALAR COM HUMANO ───────────────────────────────────────────
  if (/falar com (alguem|atendente|humano|pessoa|gente)|atendimento humano|chamar (gerente|dono)|quero falar com/.test(lower)) {
    return {
      intent: 'FALAR_HUMANO',
      response: 'Vou chamar um atendente para te ajudar! Aguarde um momento. 😊',
      _skipHumanize: true,
      _flagHumano: true
    };
  }

  // ─── 2b. MOSTRAR RESUMO DO PEDIDO ──────────────────────────────────
  // "mostra o resumo", "o que eu pedi", "qual meu pedido", "ver meu pedido"
  const askSummary = detectAskSummary(lower, state);
  if (askSummary) return askSummary;

  // ─── 3. FAQ (via RAG) ─────────────────────────────────────────────
  const faqAnswer = ragFAQ.answer(text, company, etapa);
  if (faqAnswer) {
    const contexto = T.contextoEtapa(etapa);
    return {
      intent: 'FAQ',
      response: [faqAnswer, contexto].filter(Boolean),
      _skipHumanize: true
    };
  }

  // ─── Não é intenção global ────────────────────────────────────────
  return null;
}

/**
 * Detecta reclamações sobre etapas faltantes no fluxo.
 * Ex: "sim mas eu não falei o troco" → volta para coletar troco.
 */
function detectFlowComplaint(lower, state) {
  // Padrão: positivo + "mas" + negação + referência a dado faltante
  const isComplaint = /mas\s+(eu\s+)?(nao|n)\s+(falei|disse|informei|coloquei|digitei|mandei|escolhi|pedi)/.test(lower);
  if (!isComplaint) return null;

  // Identifica O QUE está faltando
  const pedido = state.pedidoAtual || {};

  // Troco faltando
  if (/troco/.test(lower) && pedido.paymentMethod === 'Dinheiro' && pedido.trocoPara == null) {
    state._askedTroco = true;
    state.etapa = 'AGUARDANDO_PAGAMENTO';
    return {
      intent: 'RECLAMACAO_FLUXO',
      response: 'Tem razão! Vai precisar de troco? Se sim: "troco pra 50". Se não: "sem troco".',
      _skipHumanize: true
    };
  }

  // Endereço faltando/errado
  if (/endereco|endereço|rua/.test(lower) && pedido.type === 'delivery') {
    state._confirmingAddress = false;
    state.etapa = 'AGUARDANDO_ENDERECO';
    return {
      intent: 'RECLAMACAO_FLUXO',
      response: 'Tem razão! Pode me informar o endereço completo?\n_(Rua, número, bairro e complemento)_',
      _skipHumanize: true
    };
  }

  // Pagamento faltando
  if (/pagamento|pagar|forma/.test(lower) && !pedido.paymentMethod) {
    state.etapa = 'AGUARDANDO_PAGAMENTO';
    return {
      intent: 'RECLAMACAO_FLUXO',
      response: 'Tem razão! Vai ser no *Pix, Cartão ou Dinheiro*?',
      _skipHumanize: true
    };
  }

  // Reclamação genérica (não conseguiu mapear o dado faltante)
  return {
    intent: 'RECLAMACAO_FLUXO',
    response: null,
    _internalNote: 'O cliente reclamou que algo não foi coletado. Cheque se falta troco, endereço ou pagamento.',
    _isFlowComplaint: true
  };
}

/**
 * Detecta reclamação/correção sobre bebidas faltando.
 * Ex: "faltou as 3 cocas", "minhas bebidas", "pedi 3 refris"
 * Ativa em etapas pós-upsell (AGUARDANDO_TIPO, CONFIRMANDO, etc.)
 */
function detectDrinkCorrection(lower, state) {
  // Só ativa em etapas pós-upsell
  const etapasAtivas = ['AGUARDANDO_TIPO', 'AGUARDANDO_ENDERECO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO'];
  if (!etapasAtivas.includes(state.etapa)) return null;

  // Detecta menção a bebidas
  const bebidaRegex = /coca|refri|refrigerante|suco|lata|guarana|fanta|bebida/;
  if (!bebidaRegex.test(lower)) return null;

  // Detecta reclamação ou quantidade
  const reclamacaoRegex = /faltou|faltando|minhas?|pedi|cadê|cade|nao veio|sumiu|esqueceu/;
  const quantidadeRegex = /(\d+)\s*(coca|refri|refrigerante|suco|lata|guarana|fanta|bebida)/;
  const quantidadeExtensoRegex = /(uma?|dois|duas|tr[eê]s|quatro|cinco|seis)\s*(coca|refri|refrigerante|suco|lata|guarana|fanta|bebida)/;

  if (!reclamacaoRegex.test(lower) && !quantidadeRegex.test(lower) && !quantidadeExtensoRegex.test(lower)) {
    return null;
  }

  // Extrai quantidade
  const PALAVRAS_NUM = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2,
    'tres': 3, 'três': 3, 'quatro': 4, 'cinco': 5, 'seis': 6
  };

  let quantidade = 1;
  const matchDigito = lower.match(/(\d+)\s*(coca|refri|refrigerante|suco|lata|guarana|fanta|bebida)/);
  const matchExtenso = lower.match(/(uma?|dois|duas|tr[eê]s|quatro|cinco|seis)\s*(coca|refri|refrigerante|suco|lata|guarana|fanta|bebida)/);
  
  if (matchDigito) {
    quantidade = parseInt(matchDigito[1]);
  } else if (matchExtenso) {
    quantidade = PALAVRAS_NUM[matchExtenso[1]] || 1;
  }

  // Determina tipo de bebida
  let tipoFalado = 'Refrigerante Lata';
  let preco = 6;
  if (/suco/.test(lower)) {
    tipoFalado = 'Suco Natural';
    preco = 8;
  }

  // Atualiza o pedido
  const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
  const extraExistente = extras.find(e => normalizar(e.name).includes(normalizar(tipoFalado).split(' ')[0].toLowerCase()));

  if (extraExistente) {
    // Atualiza a quantidade do item existente
    extraExistente.quantity = quantidade;
  } else {
    // Adiciona novo item
    state.pedidoAtual.items.push({
      tipo: 'extra',
      name: tipoFalado,
      price: preco,
      quantity: quantidade
    });
  }

  const contexto = _contextoEtapa(state.etapa);
  
  return {
    intent: 'CORRECAO_BEBIDAS',
    response: [
      `Anotado! ${quantidade}x ${tipoFalado}. 👍`,
      contexto
    ].filter(Boolean),
    _skipHumanize: true,
    _reaskEtapa: true
  };
}

/**
 * Detecta correção de quantidade de marmitas fora do fluxo de montagem.
 * Ex: "são 3 marmitas", "falei que são 3 grandes"
 * Só ativa em etapas pós-montagem (AGUARDANDO_TIPO, CONFIRMANDO, etc.)
 */
function detectQuantityCorrection(lower, state) {
  // Só ativa em etapas pós-montagem
  const etapasAtivas = ['AGUARDANDO_TIPO', 'AGUARDANDO_ENDERECO', 'AGUARDANDO_PAGAMENTO', 'CONFIRMANDO'];
  if (!etapasAtivas.includes(state.etapa)) return null;

  // Ignora se estiver falando de bebidas (tratado por detectDrinkCorrection)
  if (/coca|refri|refrigerante|suco|lata|guarana|fanta|bebida/.test(lower)) return null;

  // Padrões: "são 3 marmitas", "falei 3 grandes", "pedi 3 marmitas", "quero 3 grandes"
  if (!/marmita|grande|pequena|\bsao\b|\bpedi\b|\bfalei\b|\bquero\b/.test(lower)) return null;

  const qty = interpretQuantity(lower);
  if (!qty || qty <= 1) return null;

  // Verifica se realmente está falando de marmitas (não de sucos, etc.)
  if (!/marmita|grande|pequena/.test(lower) && !/\bsao\b.*\d|\bpedi\b.*\d|\bfalei\b.*\d/.test(lower)) return null;

  const marmitasAtuais = (state.pedidoAtual.items || []).filter(i => i.tipo === 'marmita');
  if (marmitasAtuais.length === 0) return null;

  // Se já tem a quantidade certa, ignora
  if (marmitasAtuais.length === qty) return null;

  // Detecta tamanho se mencionado
  const tamanho = interpretTamanho(lower) || marmitasAtuais[0].tamanho;

  // Modelo base: primeira marmita existente
  const modelo = marmitasAtuais[0];
  const faltam = qty - marmitasAtuais.length;

  if (faltam > 0) {
    // Adicionar marmitas faltantes baseadas no modelo
    for (let i = 0; i < faltam; i++) {
      const nova = JSON.parse(JSON.stringify(modelo));
      nova.tamanho = tamanho;
      nova.price = tamanho === 'Grande' ? 22 : 20;
      state.pedidoAtual.items.push(nova);
    }
  } else {
    // Se pediu menos do que tem, remove as excedentes (do fim)
    const extras = state.pedidoAtual.items.filter(i => i.tipo !== 'marmita');
    const marmitasAjustadas = marmitasAtuais.slice(0, qty);
    state.pedidoAtual.items = [...marmitasAjustadas, ...extras];
  }

  const totalMarmitas = state.pedidoAtual.items.filter(i => i.tipo === 'marmita').length;

  // Retorna para a etapa anterior com confirmação
  return {
    intent: 'CORRECAO_QUANTIDADE',
    response: `Anotado! ${totalMarmitas} marmita(s) ${tamanho}. 👍`,
    _skipHumanize: true,
    _reaskEtapa: true
  };
}

/**
 * Detecta intenção de CANCELAR o pedido.
 * "cancela", "cancelar", "desisti", "não quero mais", "para"
 */
function detectCancel(lower, state) {
  if (!/^cancela$|^cancelar$|^para$|nao quero mais|desisti|desisto/.test(lower)) return null;

  // Se já estava confirmando cancelamento, cancela de vez
  if (state._confirmandoCancelamento) {
    state._confirmandoCancelamento = false;
    state.etapa = 'INICIO';
    state.pedidoAtual = { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null };
    state._marmitaAtual = null;
    state._loopCount = 0;
    return {
      intent: 'CANCEL_CONFIRMED',
      response: 'Pedido cancelado. Se quiser pedir de novo, é só chamar! 😊',
      _skipHumanize: true
    };
  }

  // Primeira vez: pede confirmação
  state._confirmandoCancelamento = true;
  return {
    intent: 'CANCEL_PENDING',
    response: 'Quer cancelar o pedido? Confirme com *sim* ou continue com *não*.',
    _skipHumanize: true
  };
}

/**
 * Detecta intenção de VER O RESUMO do pedido atual.
 * "mostra o resumo", "o que eu pedi", "qual meu pedido", "ver pedido"
 */
function detectAskSummary(lower, state) {
  // No estado FINALIZADO, deixa o handlePosPedido responder sobre status
  if (state.etapa === 'FINALIZADO') return null;

  // Padrões expandidos para capturar variações
  // NOTA: Cada pattern deve exigir contexto de "resumo" ou "pedido" para evitar falsos positivos
  // Ex: "não mostrou as saladas pq?" NÃO deve disparar (é pergunta sobre opções, não resumo)
  const patterns = /mostra.*resumo|ver.*resumo|resumo.*pedido|o\s+que\s+eu\s+pedi|qual\s+meu\s+pedido|ver\s+o\s+que\s+pedi|cade\s+o?\s*resumo|cadê\s+o?\s*resumo|conferir.*pedido|mostrar\s+tudo|mostra\s+tudo|pedido\s+completo|quero.*pedido\s+completo|nao\s+(?:esta|está)\s+completo|não\s+(?:esta|está)\s+completo|cade\s+as?\s+quantidades?|cadê\s+as?\s+quantidades?|falt(?:ou|ando)\s+(?:item|marmita|bebida)|(?:esta|está)\s+faltando|nao\s+mostrou\s+o?\s*resumo|não\s+mostrou\s+o?\s*resumo|meu\s+pedido\s+completo|mostra\s+meu\s+pedido|ver\s+meu\s+pedido|meu\s+pedido$/;
  if (!patterns.test(lower)) return null;

  const items = state.pedidoAtual?.items || [];
  if (items.length === 0) {
    return {
      intent: 'ASK_SUMMARY',
      response: 'Você ainda não tem itens no pedido. Vamos montar? Qual tamanho de marmita: *Pequena* ou *Grande*?',
      _skipHumanize: true
    };
  }

  // Usa formatação do templates que já agrupa marmitas idênticas
  const resumoFormatado = T._formatarItensPedido(items);
  const subtotal = T.calcTotal(items, 0);
  const contexto = _contextoEtapa(state.etapa);

  return {
    intent: 'ASK_SUMMARY',
    response: [
      `📋 *Seu pedido até agora:*\n\n${resumoFormatado}\n\n*Subtotal: R$ ${T.fmt(subtotal)}*`,
      contexto
    ].filter(Boolean),
    _skipHumanize: true,
    _reaskEtapa: true
  };
}

/**
 * Detecta sinais de FRUSTRAÇÃO do cliente.
 * "aff que chato", "impossivel", "voce nao entende"
 */
function detectFrustration(lower, state) {
  if (!/aff|que chato|chateado|irritad|nossa|absurdo|impossivel|horrivel|voce nao entende|nao entende|\?{3,}/.test(lower)) return null;

  const contexto = _contextoEtapa(state.etapa);

  return {
    intent: 'FRUSTRATION',
    response: [
      'Desculpa se compliquei! 😅',
      contexto || 'Quer continuar o pedido ou prefere cancelar?'
    ].filter(Boolean),
    _skipHumanize: true
  };
}

/**
 * Detecta intenção de RESTART / desistência suave.
 * "deixa quieto", "esquece", "começa de novo", "novo pedido"
 */
function detectRestart(lower, state) {
  if (!/deixa quieto|esquece|esqueca|comeca de novo|recomecar|novo pedido|reset/.test(lower)) return null;

  // Reseta tudo
  state.etapa = 'MONTANDO_TAMANHO';
  state.pedidoAtual = { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0, trocoPara: null };
  state._marmitaAtual = null;
  state._loopCount = 0;
  state._confirmandoCancelamento = false;

  return {
    intent: 'RESTART',
    response: 'Tudo bem! Começando do zero 😊\n*Pequena* — *R$ 20,00* ou *Grande* — *R$ 22,00*?',
    _skipHumanize: true
  };
}

/**
 * Retorna mensagem de retomada baseada na etapa atual.
 */
function _contextoEtapa(etapa) {
  const retomadas = {
    'MONTANDO_TAMANHO':        'Voltando — *Pequena* *R$ 20,00* ou *Grande* *R$ 22,00*?',
    'MONTANDO_PROTEINA':       'Voltando — qual proteína? Frango, Churrasco, Costela, Linguiça ou Carne Cozida',
    'MONTANDO_ACOMPANHAMENTO': 'Voltando — acompanhamentos e saladas? Arroz, Feijão, Purê, Macarrão, Tropeiro / Maionese, Beterraba, Alface, Repolho, Pepino',
    'MONTANDO_SALADA':         'Voltando — acompanhamentos e saladas?',
    'OFERECENDO_UPSELL':       'Quer adicionar uma bebida?',
    'AGUARDANDO_TIPO':         'Voltando — vai ser Entrega ou Retirada?',
    'AGUARDANDO_PAGAMENTO':    'Voltando — Pix, Cartão ou Dinheiro?',
    'CONFIRMANDO':             'Voltando — confirma o pedido?'
  };
  return retomadas[etapa] || null;
}

module.exports = { classify, detectFlowComplaint, detectQuantityCorrection, detectDrinkCorrection, detectCancel, detectFrustration, detectRestart };
