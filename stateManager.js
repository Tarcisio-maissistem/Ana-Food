// src/stateManager.js
// ═════════════════════════════════════════════════════════════════
// GERÊNCIA DE ESTADO — Redis (ioredis)
// Chave: session:{companyId}:{phone} — TTL 2h
// ═════════════════════════════════════════════════════════════════

const Redis = require('ioredis');
const logger = require('./logger');

const TTL = parseInt(process.env.SESSION_TTL || '7200'); // 2h padrão

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null; // para de reconectar após 5 tentativas
    return Math.min(times * 200, 2000);
  }
});

redis.on('error', (err) => {
logger.redisError({ operation: 'connection', error: err });
});

const PREFIX = 'session:';

function buildKey(companyId, phone) {
  return `${PREFIX}${companyId}:${phone}`;
}

function defaultState() {
  return {
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
    _askedTroco: false,
    _history: '',
    aguardandoResposta: false,
    lastInteraction: Date.now()
  };
}

/**
 * Carrega estado do Redis. Se não existir, retorna estado padrão.
 */
async function getState(companyId, phone) {
  const key = buildKey(companyId, phone);
  const raw = await redis.get(key);

  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      logger.warn('redis.parse_error', { key, error: e.message });
    }
  }

  return defaultState();
}

/**
 * Salva estado no Redis com TTL.
 * SEMPRE atualiza lastInteraction para garantir que o worker funcione.
 */
async function setState(companyId, phone, state) {
  const key = buildKey(companyId, phone);
  state.lastInteraction = Date.now();
  await redis.setex(key, TTL, JSON.stringify(state));
}

/**
 * Remove estado do Redis (fim de sessão).
 */
async function resetState(companyId, phone) {
  const key = buildKey(companyId, phone);
  await redis.del(key);
}

/**
 * Retorna todas as sessões ativas para o worker de follow-up/cancelamento.
 * Usa SCAN para evitar bloqueio do Redis em bases grandes.
 */
async function getAllActiveSessions() {
  const sessions = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      const values = await redis.mget(...keys);

      for (let i = 0; i < keys.length; i++) {
        if (!values[i]) continue;
        try {
          const state = JSON.parse(values[i]);
          // Chave: session:{companyId}:{phone}
          const parts = keys[i].replace(PREFIX, '').split(':');
          const companyId = parts[0];
          const phone = parts.slice(1).join(':');
          sessions.push({ companyId, phone, state });
        } catch (e) {
          // Ignora chaves corrompidas
        }
      }
    }
  } while (cursor !== '0');

  return sessions;
}

// ─── CACHE GENÉRICO ───────────────────────────────────────────────────────────

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '1800'); // 30min

/**
 * Busca valor do cache Redis. Retorna null se não existir.
 */
async function cacheGet(key) {
  const raw = await redis.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Salva valor no cache Redis com TTL.
 */
async function cacheSet(key, value) {
  await redis.setex(key, CACHE_TTL, JSON.stringify(value));
}

/**
 * Invalida (deleta) chave de cache.
 */
async function cacheDel(key) {
  await redis.del(key);
}

module.exports = {
  getState,
  setState,
  resetState,
  getAllActiveSessions,
  cacheGet,
  cacheSet,
  cacheDel
};
