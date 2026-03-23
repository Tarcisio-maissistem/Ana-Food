/**
 * Testes para o sistema de follow-up e cancelamento por inatividade.
 * 
 * Comportamento esperado:
 * - Após 5 minutos sem resposta → envia lembrete (T.lembrete)
 * - Após 25-30 minutos sem resposta → cancela pedido (T.cancelarPorInatividade)
 * 
 * Para os testes, usamos tempos reduzidos (10 segundos = 5 min, 25 segundos = 25 min)
 */

const T = require('./templates');
const { setState, getState, resetState } = require('./stateManager');

// Mock do stateManager para testes
jest.mock('./stateManager', () => {
  const sessions = new Map();
  return {
    getAllActiveSessions: jest.fn(async () => {
      const result = [];
      sessions.forEach((state, key) => {
        const [companyId, phone] = key.split(':');
        result.push({ companyId, phone, state });
      });
      return result;
    }),
    setState: jest.fn(async (companyId, phone, state) => {
      sessions.set(`${companyId}:${phone}`, state);
    }),
    getState: jest.fn(async (companyId, phone) => {
      return sessions.get(`${companyId}:${phone}`) || null;
    }),
    resetState: jest.fn(async (companyId, phone) => {
      sessions.delete(`${companyId}:${phone}`);
    }),
    _sessions: sessions, // Exposição interna para testes
    _clear: () => sessions.clear()
  };
});

// Mock do evolutionApi
const mockSendText = jest.fn();
jest.mock('./evolutionApi', () => ({
  sendText: (...args) => mockSendText(...args)
}));

// Mock do logger
jest.mock('./logger', () => ({
  reminderSent: jest.fn(),
  orderCancelledByTimeout: jest.fn(),
  redisError: jest.fn(),
  webhookError: jest.fn()
}));

const logger = require('./logger');
const { getAllActiveSessions } = require('./stateManager');

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE TEMPO PARA TESTES (10 segundos = 5 minutos reais)
// ═══════════════════════════════════════════════════════════════════════

const TEST_FOLLOWUP_MS = 10 * 1000;  // 10 segundos (simula 5 minutos)
const TEST_CANCEL_MS = 25 * 1000;    // 25 segundos (simula 25 minutos)

/**
 * Simula o comportamento do worker.js com tempos configuráveis
 */
async function runWorkerCycle(followupMs = TEST_FOLLOWUP_MS, cancelMs = TEST_CANCEL_MS) {
  const now = Date.now();
  const sessions = await getAllActiveSessions();

  for (const { companyId, phone, state } of sessions) {
    if (!state.aguardandoResposta) continue;
    if (state.etapa === 'FINALIZADO' || state.etapa === 'INICIO') continue;

    const elapsed = now - (state.lastInteraction || 0);

    if (elapsed >= cancelMs) {
      await mockSendText(phone, T.cancelarPorInatividade());
      await resetState(companyId, phone);
      logger.orderCancelledByTimeout({ companyId, phone, etapa: state.etapa, elapsedMs: elapsed });
      continue;
    }

    if (elapsed >= followupMs && !state._reminderSent) {
      await mockSendText(phone, T.lembrete());
      state._reminderSent = true;
      await setState(companyId, phone, state);
      logger.reminderSent({ companyId, phone });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════

const COMPANY_ID = 'c1';
const PHONE = '5511999999999';

describe('Follow-up e Cancelamento por Inatividade', () => {
  
  beforeEach(async () => {
    jest.clearAllMocks();
    require('./stateManager')._clear();
  });

  describe('Templates de follow-up', () => {
    test('T.lembrete() retorna mensagem amigável', () => {
      const msg = T.lembrete();
      expect(msg).toMatch(/ainda.*est[aá]|responder|pedido/i);
      expect(msg).toContain('😊');
    });

    test('T.cancelarPorInatividade() informa cancelamento', () => {
      const msg = T.cancelarPorInatividade();
      expect(msg.toLowerCase()).toMatch(/cancel|tempinho|chamar/i);
      expect(msg).toContain('🍱');
    });
  });

  describe('Envio de lembrete após inatividade', () => {
    test('envia lembrete após 10 segundos (simulando 5 minutos)', async () => {
      // Cria sessão com lastInteraction há 11 segundos
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 11000, // 11 segundos atrás
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Grande', price: 22 }
      };

      await setState(COMPANY_ID, PHONE, state);

      // Executa ciclo do worker
      await runWorkerCycle();

      // Deve ter enviado lembrete
      expect(mockSendText).toHaveBeenCalledTimes(1);
      expect(mockSendText).toHaveBeenCalledWith(PHONE, expect.stringMatching(/ainda.*est[aá]|responder/i));
      expect(logger.reminderSent).toHaveBeenCalledWith({ companyId: COMPANY_ID, phone: PHONE });
    });

    test('NÃO envia lembrete se ainda não passou tempo suficiente', async () => {
      // Cria sessão com lastInteraction há 5 segundos (menos que 10)
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 5000, // 5 segundos atrás
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      // NÃO deve ter enviado nada
      expect(mockSendText).not.toHaveBeenCalled();
    });

    test('NÃO envia lembrete se já enviou anteriormente', async () => {
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 15000, // 15 segundos atrás
        _reminderSent: true, // Já enviou lembrete
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      // NÃO deve enviar novamente
      expect(mockSendText).not.toHaveBeenCalled();
    });

    test('NÃO envia lembrete se etapa é FINALIZADO', async () => {
      const state = {
        etapa: 'FINALIZADO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 15000,
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      expect(mockSendText).not.toHaveBeenCalled();
    });

    test('NÃO envia lembrete se etapa é INICIO', async () => {
      const state = {
        etapa: 'INICIO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 15000,
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      expect(mockSendText).not.toHaveBeenCalled();
    });

    test('NÃO envia lembrete se aguardandoResposta é false', async () => {
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        aguardandoResposta: false, // Bot enviou, mas não está aguardando
        lastInteraction: Date.now() - 15000,
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      expect(mockSendText).not.toHaveBeenCalled();
    });
  });

  describe('Cancelamento por inatividade prolongada', () => {
    test('cancela pedido após 25 segundos (simulando 25 minutos)', async () => {
      const state = {
        etapa: 'AGUARDANDO_PAGAMENTO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 26000, // 26 segundos atrás
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123'
        }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      // Deve ter enviado mensagem de cancelamento
      expect(mockSendText).toHaveBeenCalledTimes(1);
      expect(mockSendText).toHaveBeenCalledWith(PHONE, expect.stringMatching(/cancel|tempinho/i));
      
      // Deve ter logado o cancelamento
      expect(logger.orderCancelledByTimeout).toHaveBeenCalledWith({
        companyId: COMPANY_ID,
        phone: PHONE,
        etapa: 'AGUARDANDO_PAGAMENTO',
        elapsedMs: expect.any(Number)
      });

      // Sessão deve ter sido removida
      const stateAfter = await require('./stateManager').getState(COMPANY_ID, PHONE);
      expect(stateAfter).toBeNull();
    });

    test('cancela pedido em qualquer etapa após timeout', async () => {
      const etapas = [
        'MONTANDO_PROTEINA',
        'MONTANDO_ACOMPANHAMENTO',
        'MONTANDO_SALADA',
        'OFERECENDO_UPSELL',
        'AGUARDANDO_TIPO',
        'AGUARDANDO_ENDERECO',
        'AGUARDANDO_PAGAMENTO',
        'CONFIRMANDO'
      ];

      for (const etapa of etapas) {
        require('./stateManager')._clear();
        jest.clearAllMocks();

        const state = {
          etapa,
          aguardandoResposta: true,
          lastInteraction: Date.now() - 30000, // 30 segundos
          pedidoAtual: { items: [] }
        };

        await setState(COMPANY_ID, PHONE, state);
        await runWorkerCycle();

        expect(mockSendText).toHaveBeenCalledTimes(1);
        expect(logger.orderCancelledByTimeout).toHaveBeenCalled();
      }
    });

    test('NÃO cancela se tempo é menor que limite', async () => {
      const state = {
        etapa: 'AGUARDANDO_PAGAMENTO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 20000, // 20 segundos (menos que 25)
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      await runWorkerCycle();

      // Deve enviar lembrete, não cancelar
      expect(mockSendText).toHaveBeenCalledWith(PHONE, expect.stringMatching(/ainda.*est[aá]|responder/i));
      expect(logger.orderCancelledByTimeout).not.toHaveBeenCalled();
    });
  });

  describe('Fluxo completo de follow-up', () => {
    test('cliente recebe lembrete, depois pedido é cancelado se não responder', async () => {
      // Estado inicial: cliente parou há 11 segundos
      let state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 11000,
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Grande', proteinas: [{ name: 'Frango' }] }
      };

      await setState(COMPANY_ID, PHONE, state);

      // Primeiro ciclo: envia lembrete
      await runWorkerCycle();

      expect(mockSendText).toHaveBeenCalledTimes(1);
      expect(mockSendText).toHaveBeenCalledWith(PHONE, expect.stringMatching(/ainda.*est[aá]/i));
      expect(logger.reminderSent).toHaveBeenCalled();

      // Verifica que _reminderSent foi setado
      const stateAfterReminder = await require('./stateManager').getState(COMPANY_ID, PHONE);
      expect(stateAfterReminder._reminderSent).toBe(true);

      // Segundo ciclo (ainda dentro do prazo): não faz nada
      jest.clearAllMocks();
      await runWorkerCycle();
      expect(mockSendText).not.toHaveBeenCalled();

      // Simula passagem de mais tempo (total > 25 segundos)
      stateAfterReminder.lastInteraction = Date.now() - 30000;
      await setState(COMPANY_ID, PHONE, stateAfterReminder);

      // Terceiro ciclo: cancela
      jest.clearAllMocks();
      await runWorkerCycle();

      expect(mockSendText).toHaveBeenCalledTimes(1);
      expect(mockSendText).toHaveBeenCalledWith(PHONE, expect.stringMatching(/cancel/i));
      expect(logger.orderCancelledByTimeout).toHaveBeenCalled();
    });

    test('cliente responde após lembrete - flag é resetado', async () => {
      // Estado: cliente recebeu lembrete
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 15000,
        _reminderSent: true,
        pedidoAtual: { items: [] }
      };

      await setState(COMPANY_ID, PHONE, state);

      // Simula cliente respondendo (atualiza lastInteraction e remove flag)
      state.lastInteraction = Date.now();
      state._reminderSent = false;
      state.aguardandoResposta = true; // Bot respondeu, aguarda cliente novamente
      await setState(COMPANY_ID, PHONE, state);

      // Ciclo do worker: não deve fazer nada
      await runWorkerCycle();

      expect(mockSendText).not.toHaveBeenCalled();
    });
  });

  describe('Múltiplas sessões simultâneas', () => {
    test('processa múltiplos clientes independentemente', async () => {
      // Cliente 1: precisa de lembrete
      await setState(COMPANY_ID, '5511111111111', {
        etapa: 'MONTANDO_PROTEINA',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 12000,
        pedidoAtual: { items: [] }
      });

      // Cliente 2: precisa de cancelamento
      await setState(COMPANY_ID, '5522222222222', {
        etapa: 'AGUARDANDO_PAGAMENTO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 30000,
        pedidoAtual: { items: [] }
      });

      // Cliente 3: recente, não precisa de nada
      await setState(COMPANY_ID, '5533333333333', {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        aguardandoResposta: true,
        lastInteraction: Date.now() - 3000,
        pedidoAtual: { items: [] }
      });

      await runWorkerCycle();

      // Deve ter 2 chamadas: 1 lembrete + 1 cancelamento
      expect(mockSendText).toHaveBeenCalledTimes(2);
      
      // Cliente 1 recebeu lembrete
      expect(mockSendText).toHaveBeenCalledWith('5511111111111', expect.stringMatching(/ainda.*est[aá]/i));
      
      // Cliente 2 foi cancelado
      expect(mockSendText).toHaveBeenCalledWith('5522222222222', expect.stringMatching(/cancel/i));

      // Cliente 3 não recebeu nada (verificamos pela ausência)
      expect(mockSendText).not.toHaveBeenCalledWith('5533333333333', expect.anything());
    });
  });

  describe('Mensagens de follow-up por etapa', () => {
    test('lembrete durante MONTANDO_PROTEINA menciona continuar pedido', () => {
      const msg = T.lembrete();
      expect(msg.toLowerCase()).toMatch(/pedido|responder|continuar/i);
    });

    test('cancelamento informa que pode pedir novamente', () => {
      const msg = T.cancelarPorInatividade();
      expect(msg.toLowerCase()).toMatch(/chamar.*novo|pedir/i);
    });
  });
});

describe('Configuração de tempos via ambiente', () => {
  test('FOLLOWUP_MINUTES e CANCEL_MINUTES são configuráveis', () => {
    // Verifica que as constantes existem no worker.js (lendo o arquivo)
    const fs = require('fs');
    const workerCode = fs.readFileSync('./worker.js', 'utf8');
    
    expect(workerCode).toMatch(/FOLLOWUP_MINUTES/);
    expect(workerCode).toMatch(/CANCEL_MINUTES/);
    expect(workerCode).toMatch(/process\.env\.FOLLOWUP_MINUTES/);
    expect(workerCode).toMatch(/process\.env\.CANCEL_MINUTES/);
  });

  test('valores padrão são 5 e 25 minutos', () => {
    const fs = require('fs');
    const workerCode = fs.readFileSync('./worker.js', 'utf8');
    
    // Verifica valores padrão no código
    expect(workerCode).toMatch(/FOLLOWUP_MINUTES.*\|\|.*'5'/);
    expect(workerCode).toMatch(/CANCEL_MINUTES.*\|\|.*'25'/);
  });
});
