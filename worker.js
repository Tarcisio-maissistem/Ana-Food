// src/worker.js — Processo SEPARADO do webhook. Nunca misturar.
require('dotenv').config();
const cron = require('node-cron');
const { getAllActiveSessions, setState, resetState } = require('./stateManager');
const { sendText } = require('./evolutionApi');
const logger = require('./logger');
const T = require('./templates');

const FOLLOWUP_MS = parseInt(process.env.FOLLOWUP_MINUTES || '5')  * 60 * 1000;
const CANCEL_MS   = parseInt(process.env.CANCEL_MINUTES   || '25') * 60 * 1000;

// A cada minuto
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  let sessions = [];

  try {
    sessions = await getAllActiveSessions();
  } catch (err) {
    logger.redisError({ operation: 'getAllActiveSessions', error: err });
    return;
  }

  for (const { companyId, phone, state } of sessions) {
    if (!state.aguardandoResposta) continue;
    if (state.etapa === 'FINALIZADO' || state.etapa === 'INICIO') continue;

    const elapsed = now - (state.lastInteraction || 0);

    try {
      if (elapsed >= CANCEL_MS) {
        await sendText(phone, T.cancelarPorInatividade());
        await resetState(companyId, phone);
        logger.orderCancelledByTimeout({ companyId, phone, etapa: state.etapa, elapsedMs: elapsed });
        continue;
      }

      if (elapsed >= FOLLOWUP_MS && !state._reminderSent) {
        await sendText(phone, T.lembrete());
        state._reminderSent = true;
        await setState(companyId, phone, state);
        logger.reminderSent({ companyId, phone });
      }
    } catch (err) {
      logger.webhookError({ phone, error: err });
    }
  }
});

process.stdout.write(JSON.stringify({
  ts: new Date().toISOString(), level: 'info', event: 'worker.started'
}) + '\n');
