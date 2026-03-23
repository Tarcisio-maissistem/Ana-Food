// src/evolutionApi.js
// ═════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM EVOLUTION API — Envio de mensagens WhatsApp
// ═════════════════════════════════════════════════════════════════

const axios = require('axios');
const logger = require('./logger');

const BASE_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE;

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'apikey': API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

/**
 * Envia mensagem de texto via Evolution API.
 * @param {string} phone - Número do destinatário (ex: "5511999998888")
 * @param {string} text - Texto da mensagem
 */
async function sendText(phone, text) {
  if (!BASE_URL || !API_KEY || !INSTANCE) {
    logger.warn('evolution.not_configured', { phone });
    return null;
  }

  if (!text || !phone) return null;

  try {
    const response = await api.post(`/message/sendText/${INSTANCE}`, {
      number: phone,
      text: text
    });
    return response.data;
  } catch (err) {
    logger.error('evolution.send_error', {
      phone,
      status: err.response?.status,
      error: err.message
    });
    throw err;
  }
}

module.exports = {
  sendText
};
