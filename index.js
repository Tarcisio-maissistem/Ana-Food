// src/index.js
// Servidor Express — recebe webhook, valida, processa, responde.

require('dotenv').config();
const express = require('express');
const { getState, setState, resetState, cacheDel } = require('./stateManager');
const stateMachine = require('./stateMachine');
const { sendText } = require('./evolutionApi');
const db = require('./database');
const validator = require('./validator');
const logger = require('./logger');
const T = require('./templates');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ─── WEBHOOK PRINCIPAL ────────────────────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde imediatamente — Evolution não deve retry

  const body = req.body;

  // ── 1. Valida payload ──────────────────────────────────────────────────────
  const payloadCheck = validator.validateWebhookPayload(body);
  if (!payloadCheck.valid) {
    // Ignora silenciosamente — não é erro, pode ser evento de status
    return;
  }

  const rawPhone = body.data.key.remoteJid?.replace('@s.whatsapp.net', '') || '';
  const rawText = body.data.message?.conversation ||
    body.data.message?.extendedTextMessage?.text || '';
  const instanceId = body.instance;

  // ── 2. Valida telefone ─────────────────────────────────────────────────────
  const phoneCheck = validator.validatePhone(rawPhone);
  if (!phoneCheck.valid) {
    logger.validationFailed({ phone: rawPhone, reason: phoneCheck.reason });
    return;
  }
  const phone = phoneCheck.value;

  // ── 3. Valida texto ────────────────────────────────────────────────────────
  const textCheck = validator.validateMessage(rawText);
  if (!textCheck.valid) {
    logger.validationFailed({ phone, reason: textCheck.reason });
    // Mensagem inválida (vazia, muito longa, só emojis) → ignora silenciosamente
    return;
  }
  const text = textCheck.value;

  // ── 4. Busca empresa ───────────────────────────────────────────────────────
  let company;
  try {
    company = await db.getCompanyByPhone(instanceId);
  } catch (err) {
    logger.dbError({ phone, operation: 'getCompanyByPhone', error: err });
    return;
  }

  if (!company) {
    logger.validationFailed({ phone, reason: `company_not_found:${instanceId}` });
    return;
  }

  const companyId = company.id;
  logger.messageReceived({ companyId, phone, etapa: '?', messageLength: text.length });

  // ── 5. Carrega estado do Redis ─────────────────────────────────────────────
  let state;
  try {
    state = await getState(companyId, phone);
  } catch (err) {
    logger.redisError({ operation: 'getState', error: err });
    await sendText(phone, T.erroComunicacao());
    return;
  }

  logger.messageReceived({ companyId, phone, etapa: state.etapa, messageLength: text.length });

  // ── 6. Processa no motor determinístico ───────────────────────────────────
  let resultado;
  try {
    resultado = await stateMachine.process(companyId, phone, text, state, company);
  } catch (err) {
    logger.webhookError({ phone, error: err, stack: err.stack });
    await sendText(phone, T.erroComunicacao()).catch(() => { });
    return;
  }

  const { state: newState, response } = resultado;

  // ── 7. Salva estado no Redis ───────────────────────────────────────────────
  try {
    await setState(companyId, phone, newState);
  } catch (err) {
    logger.redisError({ operation: 'setState', error: err });
    // Continua — melhor entregar a resposta mesmo sem salvar estado
  }

  // ── 8. Envia resposta (suporta múltiplas mensagens) ──────────────────────
  if (response) {
    try {
      const messages = Array.isArray(response) ? response : [response];
      for (const msg of messages) {
        if (!msg) continue;
        await sendText(phone, msg);
        // Pequeno delay para simular digitação e manter a ordem no WhatsApp
        if (messages.length > 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    } catch (err) {
      logger.evolutionError({ phone, error: err });
    }
  }

  // ── 9. Agenda limpeza de sessão finalizada ────────────────────────────────
  if (newState.etapa === 'FINALIZADO') {
    setTimeout(
      () => resetState(companyId, phone).catch(() => { }),
      5 * 60 * 1000
    );
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.get('/status', async (req, res) => {
  const status = {
    status: 'ok',
    ts: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  };

  // Verifica Redis
  try {
    const { cacheGet } = require('./stateManager');
    await cacheGet('__health_check__');
    status.redis = 'connected';
  } catch {
    status.redis = 'disconnected';
    status.status = 'degraded';
  }

  // Verifica Supabase
  status.supabase = process.env.SUPABASE_URL ? 'configured' : 'not_configured';
  status.openai = process.env.OPENAI_API_KEY ? 'configured' : 'not_configured';
  status.evolution = process.env.EVOLUTION_API_URL ? 'configured' : 'not_configured';

  res.json(status);
});

// ─── ADMIN: ver sessão ────────────────────────────────────────────────────────

app.get('/admin/session/:companyId/:phone', async (req, res) => {
  try {
    const state = await getState(req.params.companyId, req.params.phone);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: resetar sessão ────────────────────────────────────────────────────

app.delete('/admin/session/:companyId/:phone', async (req, res) => {
  try {
    await resetState(req.params.companyId, req.params.phone);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: invalidar cache do cardápio ───────────────────────────────────────

app.delete('/admin/plugin-cache', (req, res) => {
  try {
    const pluginManager = require('./pluginManager');
    pluginManager.clearCache();
    logger.debug('admin.plugin_cache_cleared', {});
    res.json({ ok: true, message: 'Plugin cache cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/cardapio/:companyId', async (req, res) => {
  try {
    await cacheDel(`cardapio:${req.params.companyId}`);
    res.json({ ok: true, message: 'Cache do cardápio invalidado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: invalidar cache após criar/editar/desativar produto ──────────────

app.post('/admin/products/invalidate-cache/:companyId', async (req, res) => {
  try {
    await db.invalidateCardapioCache(req.params.companyId);
    res.json({ ok: true, message: 'Cardápio cache invalidado — próxima consulta buscará do banco' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  process.stdout.write(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    event: 'server.started',
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  }) + '\n');
});
