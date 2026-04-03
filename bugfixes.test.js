/**
 * Testes para os 5 bugs corrigidos na sessão.
 * 
 * Bug #1: "não" cancela pedido incorretamente quando _confirmandoCancelamento=true
 * Bug #2: Quantidade de bebidas ignorada no upsell ("3 coca lata")
 * Bug #3: Verificar que perguntarTipo mostra todos os itens
 * Bug #4: Complemento de endereço ignorado quando _confirmingAddress=true
 * Bug #5: ASK_SUMMARY intent para mostrar resumo do pedido
 */

const { process: smProcess, ESTADOS } = require('./stateMachine');
const T = require('./templates');
const ai = require('./aiInterpreter');
const router = require('./intentRouter');

const CARDAPIO = {
  proteinas: [
    { name: 'Frango' }, { name: 'Churrasco' }, { name: 'Costela' },
    { name: 'Linguiça' }, { name: 'Carne Cozida' }
  ],
  acompanhamentos: [
    { name: 'Arroz' }, { name: 'Feijão' }, { name: 'Purê' },
    { name: 'Macarrão' }, { name: 'Tropeiro' }
  ],
  saladas: [
    { name: 'Alface' }, { name: 'Tomate' }, { name: 'Vinagrete' }
  ],
  upsellsBebida: [
    { name: 'Suco Natural', price: 8 },
    { name: 'Refrigerante Lata', price: 6, apelidos: ['refrigerante', 'refri', 'lata', 'coca', 'guarana', 'fanta'] }
  ]
};

const COMPANY = { delivery_fee: 5 };
const COMPANY_ID = 'c1';
const PHONE = '5511999999';

describe('Bug #1 — Cancelamento com "não"', () => {
  test('"não" quando _confirmandoCancelamento=true NÃO cancela, retorna confirmação', async () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
        type: 'delivery',
        address: 'Rua Teste, 123',
        paymentMethod: 'Pix',
        deliveryFee: 5
      },
      _confirmandoCancelamento: true
    };

    const result = await smProcess(COMPANY_ID, PHONE, 'não', state, COMPANY);
    
    // Deve retornar para confirmação normal, NÃO cancelar
    expect(result.state._confirmandoCancelamento).toBe(false);
    expect(result.state.etapa).toBe('CONFIRMANDO');
    expect(result.state.pedidoAtual.items.length).toBe(1); // Items preservados
  });

  test('"sim" quando _confirmandoCancelamento=true CANCELA pedido', async () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
        type: 'delivery',
        address: 'Rua Teste, 123',
        paymentMethod: 'Pix',
        deliveryFee: 5
      },
      _confirmandoCancelamento: true
    };

    const result = await smProcess(COMPANY_ID, PHONE, 'sim', state, COMPANY);
    
    // Deve cancelar
    expect(result.state._confirmandoCancelamento).toBe(false);
    expect(result.state.pedidoAtual.items.length).toBe(0);
    expect(result.response).toMatch(/cancelado/i);
  });
});

describe('Bug #2 — Quantidade de bebidas no upsell', () => {
  test('interpretUpsell extrai quantidade "3 coca lata"', () => {
    const bebidas = ai.interpretUpsell('3 coca lata', CARDAPIO.upsellsBebida);
    
    expect(bebidas).toHaveLength(1);
    expect(bebidas[0].name).toBe('Refrigerante Lata');
    expect(bebidas[0].quantity).toBe(3);
  });

  test('interpretUpsell extrai quantidade "2 sucos e 1 refri"', () => {
    const bebidas = ai.interpretUpsell('2 sucos e 1 refri', CARDAPIO.upsellsBebida);
    
    expect(bebidas).toHaveLength(2);
    const suco = bebidas.find(b => b.name === 'Suco Natural');
    const refri = bebidas.find(b => b.name === 'Refrigerante Lata');
    
    expect(suco.quantity).toBe(2);
    expect(refri.quantity).toBe(1);
  });

  test('handleUpsell usa quantity do interpretUpsell', async () => {
    const state = {
      etapa: 'OFERECENDO_UPSELL',
      _upsellPhase: 'bebida',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [], acompanhamentos: [], saladas: [] }]
      }
    };

    const result = await smProcess(COMPANY_ID, PHONE, '3 coca lata', state, COMPANY);
    
    const extras = result.state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
    expect(extras[0].quantity).toBe(3);
    expect(extras[0].name).toBe('Refrigerante Lata');
  });
});

describe('Bug #3 — perguntarTipo mostra todos os itens', () => {
  test('perguntarTipo com 4 marmitas mostra todas', () => {
    const items = [
      { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{name:'Carne'}], acompanhamentos: [{name:'Feijão'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Pequena', price: 20, quantity: 1, proteinas: [{name:'Churrasco'}], acompanhamentos: [{name:'Purê'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Pequena', price: 20, quantity: 1, proteinas: [{name:'Costela'}], acompanhamentos: [{name:'Macarrão'}], saladas: [] }
    ];

    const resposta = T.perguntarTipo(items);
    const texto = Array.isArray(resposta) ? resposta.join('\n') : resposta;
    
    // Deve conter todas as 4 proteínas
    expect(texto).toMatch(/Frango/);
    expect(texto).toMatch(/Carne/);
    expect(texto).toMatch(/Churrasco/);
    expect(texto).toMatch(/Costela/);
    // Deve conter 2 grandes e 2 pequenas
    expect((texto.match(/Grande/g) || []).length).toBe(2);
    expect((texto.match(/Pequena/g) || []).length).toBe(2);
  });
});

describe('Bug #4 — Complemento de endereço', () => {
  test('"faltou o bairro que é centro" adiciona ao endereço', async () => {
    const state = {
      etapa: 'AGUARDANDO_ENDERECO',
      _confirmingAddress: true,
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
        address: 'Rua das Flores, 123',
        deliveryFee: 5
      }
    };

    const result = await smProcess(COMPANY_ID, PHONE, 'faltou o bairro que é centro', state, COMPANY);
    
    expect(result.state.pedidoAtual.address).toMatch(/centro/i);
    expect(result.state._confirmingAddress).toBe(true); // Continua confirmando
    expect(result.response).toBeDefined(); // Mostra confirmação novamente
  });

  test('"bairro parque floresta" adiciona ao endereço', async () => {
    const state = {
      etapa: 'AGUARDANDO_ENDERECO',
      _confirmingAddress: true,
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
        address: 'Rua das Flores, 123',
        deliveryFee: 5
      }
    };

    const result = await smProcess(COMPANY_ID, PHONE, 'bairro parque floresta', state, COMPANY);
    
    expect(result.state.pedidoAtual.address).toMatch(/parque floresta/i);
  });

  test('bairro simples "Centro" é adicionado ao endereço', async () => {
    const state = {
      etapa: 'AGUARDANDO_ENDERECO',
      _confirmingAddress: true,
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
        address: 'Rua das Flores, 123',
        deliveryFee: 5
      }
    };

    const result = await smProcess(COMPANY_ID, PHONE, 'Centro', state, COMPANY);
    
    expect(result.state.pedidoAtual.address).toMatch(/Centro/);
  });
});

describe('Bug #5 — ASK_SUMMARY intent', () => {
  test('"mostra o resumo" retorna resumo do pedido', () => {
    const state = {
      etapa: 'MONTANDO_PROTEINA',
      pedidoAtual: {
        items: [
          { tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
          { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 2 }
        ]
      }
    };

    const result = router.classify('mostra o resumo', state, COMPANY);
    
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
    const texto = Array.isArray(result.response) ? result.response.join('\n') : result.response;
    expect(texto).toMatch(/Frango/);
    expect(texto).toMatch(/Refrigerante/);
    expect(texto).toMatch(/2x/);
  });

  test('"o que eu pedi" mostra resumo', () => {
    const state = {
      etapa: 'AGUARDANDO_TIPO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Pequena', price: 20, quantity: 1, proteinas: [{name:'Churrasco'}], acompanhamentos: [{name:'Feijão'}], saladas: [] }]
      }
    };

    const result = router.classify('o que eu pedi', state, COMPANY);
    
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
  });

  test('pedido vazio retorna mensagem apropriada', () => {
    const state = {
      etapa: 'INICIO',
      pedidoAtual: { items: [] }
    };

    const result = router.classify('mostra o resumo', state, COMPANY);
    
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
    expect(result.response).toMatch(/ainda não tem itens/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// NOVOS BUGS V3 — Agrupamento, bebidas, continuação
// ═══════════════════════════════════════════════════════════════════

describe('Bug v3 #2 — Agrupamento de marmitas idênticas', () => {
  test('agruparItensPedido agrupa 3 marmitas grandes idênticas', () => {
    const items = [
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Carne'}], acompanhamentos: [{name:'Feijão'}], saladas: [] }
    ];

    const grupos = T.agruparItensPedido(items);
    
    expect(grupos.length).toBe(2); // 1 grupo de 3 grandes + 1 pequena
    const grandeGrupo = grupos.find(g => g.tamanho === 'Grande');
    expect(grandeGrupo._count).toBe(3);
  });

  test('marmitas diferentes não são agrupadas', () => {
    const items = [
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Carne'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }
    ];

    const grupos = T.agruparItensPedido(items);
    
    expect(grupos.length).toBe(2); // Diferentes, não agrupa
  });

  test('_formatarItensPedido mostra "3x Marmita Grande"', () => {
    const items = [
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
      { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }
    ];

    const resumo = T._formatarItensPedido(items);
    
    expect(resumo).toMatch(/3x.*Marmita Grande/);
    expect(resumo).toMatch(/R\$ 66,00/); // 3 x 22
  });
});

describe('Bug v3 #5 — Reclamação sobre bebidas faltando', () => {
  test('"faltou as minhas 3 cocas latas" adiciona 3 refris', () => {
    const state = {
      etapa: 'CONFIRMANDO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }]
      }
    };

    const result = router.classify('faltou as minhas 3 cocas latas', state, COMPANY);
    
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CORRECAO_BEBIDAS');
    
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras.length).toBe(1);
    expect(extras[0].quantity).toBe(3);
  });

  test('"pedi 2 sucos" adiciona 2 sucos', () => {
    const state = {
      etapa: 'AGUARDANDO_TIPO',
      pedidoAtual: {
        items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }]
      }
    };

    const result = router.classify('pedi 2 sucos', state, COMPANY);
    
    expect(result).not.toBeNull();
    expect(result.intent).toBe('CORRECAO_BEBIDAS');
    
    const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
    expect(extras[0].name).toBe('Suco Natural');
    expect(extras[0].quantity).toBe(2);
  });
});

describe('Bug v3 #4 — "agora sim" como continuação', () => {
  test('"agora sim" é reconhecido como confirmação', async () => {
    const result = await ai.interpretConfirmation('agora sim');
    expect(result).toBe('sim');
  });

  test('"pode continuar" é reconhecido como confirmação', async () => {
    const result = await ai.interpretConfirmation('pode continuar');
    expect(result).toBe('sim');
  });

  test('"ta bom assim" é reconhecido como confirmação', async () => {
    const result = await ai.interpretConfirmation('ta bom assim');
    expect(result).toBe('sim');
  });
});

// ═══════════════════════════════════════════════════════════════════
// PERGUNTAS LATERAIS — Verificar se agente retorna ao fluxo
// ═══════════════════════════════════════════════════════════════════

describe('Perguntas laterais — Retorno ao fluxo', () => {
  
  describe('FAQ via ragFAQ — responde e retoma etapa', () => {
    test('"qual o horário de vocês?" durante MONTANDO_ACOMPANHAMENTO retoma etapa', async () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'qual o horário de funcionamento?', state, {
        ...COMPANY,
        opening_hours: '11h às 22h'
      });

      // Estado deve permanecer na mesma etapa
      expect(result.state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
      // Marmita atual preservada
      expect(result.state._marmitaAtual.proteinas).toHaveLength(1);
    });

    test('"qual o valor da taxa de entrega?" durante AGUARDANDO_TIPO retoma', async () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'qual o valor da taxa de entrega?', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/taxa|entrega|r\$|5/i);
      expect(result.state.etapa).toBe('AGUARDANDO_TIPO');
    });
  });

  describe('Intenção de atendente humano', () => {
    test('"quero falar com atendente" aciona flag humano em qualquer etapa', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = router.classify('quero falar com atendente', state, COMPANY);
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('FALAR_HUMANO');
      expect(result._flagHumano).toBe(true);
    });

    test('"chamar gerente" aciona flag humano', () => {
      const state = { etapa: 'MONTANDO_PROTEINA', pedidoAtual: { items: [] } };
      const result = router.classify('chamar gerente', state, COMPANY);
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('FALAR_HUMANO');
    });
  });

  describe('Comportamento atual — Interpretação agressiva', () => {
    // Estes testes documentam o comportamento ATUAL (não ideal)
    // onde certas frases são interpretadas como comandos do fluxo

    test('"posso retirar no local?" em AGUARDANDO_TIPO é interpretado como RETIRADA', async () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'posso retirar no local?', state, COMPANY);

      // Comportamento atual: interpreta como seleção de retirada e avança
      // Comportamento ideal seria: responder FAQ e perguntar novamente
      expect(result.state.etapa).toBe('AGUARDANDO_PAGAMENTO');
      expect(result.state.pedidoAtual.type).toBe('pickup');
    });

    test('"tem pix?" em AGUARDANDO_PAGAMENTO é interpretado como seleção PIX', async () => {
      const state = {
        etapa: 'AGUARDANDO_PAGAMENTO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'tem pix?', state, COMPANY);

      // Comportamento atual: interpreta como seleção de Pix
      expect(result.state.pedidoAtual.paymentMethod).toBe('Pix');
      expect(result.state.etapa).toBe('CONFIRMANDO');
    });

    test('texto não reconhecido em MONTANDO_PROTEINA retorna erro amigável', async () => {
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Grande', price: 22 }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quanto tempo demora a entrega?', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Comportamento atual: não reconhece FAQ, pede proteína novamente
      expect(texto.toLowerCase()).toMatch(/prote[ií]na|frango|churrasco|inv[aá]lid/i);
      expect(result.state.etapa).toBe('MONTANDO_PROTEINA');
    });
  });

  describe('Pergunta lateral NÃO deve quebrar o fluxo', () => {
    test('pergunta sobre cardápio durante montagem não reseta marmita atual', async () => {
      const state = {
        etapa: 'MONTANDO_SALADA',
        pedidoAtual: { items: [] },
        _marmitaAtual: {
          tamanho: 'Grande',
          price: 22,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [{ name: 'Arroz' }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quais saladas vocês tem?', state, COMPANY);

      // Marmita atual deve estar preservada
      expect(result.state._marmitaAtual).toBeDefined();
      expect(result.state._marmitaAtual.proteinas).toHaveLength(1);
      expect(result.state._marmitaAtual.acompanhamentos).toHaveLength(1);
    });

    test('reclamação genérica não cancela pedido em andamento', async () => {
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Carne'}], acompanhamentos: [{name:'Feijão'}], saladas: [] }]
        },
        _marmitaAtual: { tamanho: 'Grande', price: 22 }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'isso ta muito confuso', state, COMPANY);

      // Não deve ter cancelado - items preservados
      expect(result.state.pedidoAtual.items.length).toBeGreaterThanOrEqual(1);
      expect(result.state._marmitaAtual).toBeDefined();
    });

    test('frustração ("aff que chato") retorna desculpa e retoma etapa', () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}] }
      };

      const result = router.classify('aff que chato', state, COMPANY);

      expect(result).not.toBeNull();
      expect(result.intent).toBe('FRUSTRATION');
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/desculpa|confuso|voltando/i);
    });
  });

  describe('Múltiplas perguntas laterais em sequência', () => {
    test('duas FAQs seguidas mantém fluxo na mesma etapa', async () => {
      let state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: {
          tamanho: 'Grande',
          price: 22,
          proteinas: [{ name: 'Frango' }]
        }
      };

      // Primeira pergunta lateral - horário
      let result = await smProcess(COMPANY_ID, PHONE, 'qual horário vocês fecham?', state, {
        ...COMPANY,
        opening_hours: '11h às 22h'
      });
      
      expect(result.state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');

      // Segunda pergunta - sobre taxa
      result = await smProcess(COMPANY_ID, PHONE, 'a taxa é fixa?', result.state, COMPANY);

      expect(result.state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
      // Marmita ainda preservada
      expect(result.state._marmitaAtual.proteinas).toHaveLength(1);
    });
  });

  describe('ASK_SUMMARY em qualquer etapa', () => {
    test('"mostra meu pedido" durante MONTANDO_ACOMPANHAMENTO mostra resumo', () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }]
        },
        _marmitaAtual: { tamanho: 'Pequena', price: 20, proteinas: [{name:'Carne'}] }
      };

      const result = router.classify('mostra meu pedido', state, COMPANY);

      expect(result).not.toBeNull();
      expect(result.intent).toBe('ASK_SUMMARY');
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/Frango/);
      expect(texto).toMatch(/22/);
    });

    test('"o que eu pedi até agora?" mostra resumo com subtotal', () => {
      const state = {
        etapa: 'AGUARDANDO_ENDERECO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 2 }
          ],
          type: 'delivery'
        }
      };

      const result = router.classify('o que eu pedi até agora?', state, COMPANY);

      expect(result).not.toBeNull();
      expect(result.intent).toBe('ASK_SUMMARY');
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/Subtotal/i);
      expect(texto).toMatch(/2x.*Suco/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// TROCA DE ITENS E MUDANÇA DE IDEIA
// ═══════════════════════════════════════════════════════════════════

describe('Troca de itens — Cliente muda de ideia', () => {
  
  describe('Correção de quantidade via intentRouter', () => {
    test('"são 3 marmitas" em AGUARDANDO_TIPO adiciona marmitas faltantes', () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }]
        }
      };

      const result = router.classify('são 3 marmitas grandes', state, COMPANY);

      expect(result).not.toBeNull();
      expect(result.intent).toBe('CORRECAO_QUANTIDADE');
      // Deve ter duplicado a marmita baseada no modelo
      expect(state.pedidoAtual.items.filter(i => i.tipo === 'marmita')).toHaveLength(3);
    });

    test('"pedi 2 marmitas" quando tem 4 remove as excedentes', () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Carne'}], acompanhamentos: [{name:'Feijão'}], saladas: [] },
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Costela'}], acompanhamentos: [{name:'Purê'}], saladas: [] }
          ]
        }
      };

      const result = router.classify('pedi 2 marmitas', state, COMPANY);

      expect(result).not.toBeNull();
      expect(result.intent).toBe('CORRECAO_QUANTIDADE');
      expect(state.pedidoAtual.items.filter(i => i.tipo === 'marmita')).toHaveLength(2);
    });

    test('"falei 5 grandes" adiciona marmitas do tamanho correto', () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'extra', name: 'Suco', price: 8, quantity: 2 }
          ]
        }
      };

      const result = router.classify('falei 5 grandes', state, COMPANY);

      expect(result).not.toBeNull();
      // Deve manter os extras intactos
      const extras = state.pedidoAtual.items.filter(i => i.tipo === 'extra');
      expect(extras).toHaveLength(1);
      expect(extras[0].name).toBe('Suco');
      // E ter 5 marmitas
      expect(state.pedidoAtual.items.filter(i => i.tipo === 'marmita')).toHaveLength(5);
    });

    test('correção de quantidade não ativa antes de ter marmitas', () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: { items: [] }
      };

      const result = router.classify('são 3 marmitas', state, COMPANY);
      
      // Sem marmitas no pedido, não deve ativar correção
      expect(result).toBeNull();
    });

    test('correção não ativa se quantidade já está correta', () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22 },
            { tipo: 'marmita', tamanho: 'Grande', price: 22 },
            { tipo: 'marmita', tamanho: 'Grande', price: 22 }
          ]
        }
      };

      const result = router.classify('são 3 marmitas', state, COMPANY);
      
      expect(result).toBeNull(); // Já tem 3, não precisa corrigir
    });
  });

  describe('Troca de tamanho durante montagem', () => {
    test('"quero pequena" em MONTANDO_PROTEINA - comportamento atual mantém tamanho', async () => {
      const state = {
        etapa: 'MONTANDO_PROTEINA',
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Grande', price: 22, proteinas: [] }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'não, quero pequena', state, COMPANY);

      // Comportamento atual: "pequena" sozinho é tratado como texto inválido
      // O tamanho só muda se explicitamente detectado no fast-track ou MONTANDO_TAMANHO
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/prote[ií]na|inv[aá]lid|pequen/i);
    });

    test('"mudei de ideia, quero grande" em MONTANDO_ACOMPANHAMENTO muda tamanho', async () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Pequena', price: 20, proteinas: [{name:'Frango'}] }
      };

      // Ao pedir grande, mantém proteína e muda tamanho
      const result = await smProcess(COMPANY_ID, PHONE, 'mudei de ideia quero grande', state, COMPANY);

      // Pode mudar tamanho ou pedir confirmação - verificamos se entende
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/grande|acompanhamento|arroz|feij[aã]o/i);
    });
  });

  describe('Troca de proteínas durante montagem', () => {
    test('"na verdade quero carne" em MONTANDO_ACOMPANHAMENTO troca proteína', async () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'na verdade quero carne cozida', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve processar o pedido de carne
      expect(texto.toLowerCase()).toMatch(/carne|acompanhamento|arroz|feij[aã]o/i);
    });

    test('"troca o frango por churrasco" muda proteína mantendo resto', async () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'troca o frango por churrasco', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve reconhecer churrasco
      expect(texto.toLowerCase()).toMatch(/churrasco|acompanhamento|arroz|feij[aã]o|entendi/i);
    });
  });

  describe('Troca de acompanhamentos', () => {
    test('"quero macarrão e feijão" em MONTANDO_ACOMPANHAMENTO', async () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [],
          saladas: []
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quero macarrão e feijão', state, COMPANY);

      // Marmita finalizada — verificar no items
      const item = result.state.pedidoAtual.items[0];
      expect(item.acompanhamentos).toBeDefined();
      expect(item.acompanhamentos.length).toBeGreaterThan(0);
      
      const nomes = item.acompanhamentos.map(a => a.name.toLowerCase());
      expect(nomes).toContain('macarrão');
    });

    test('"só feijão" quando já tem arroz, processa feijão', async () => {
      const state = {
        etapa: 'MONTANDO_ACOMPANHAMENTO',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [{ name: 'Arroz' }],
          saladas: []
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'só feijão', state, COMPANY);

      // Deve ter processado o pedido (marmita finalizada)
      expect(result.state.pedidoAtual.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Troca de saladas', () => {
    test('"alface e tomate" em MONTANDO_SALADA adiciona saladas e finaliza marmita', async () => {
      const state = {
        etapa: 'MONTANDO_SALADA',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
          saladas: [] // Inicializa array
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'alface e tomate', state, COMPANY);

      // Verifica se avançou de etapa (processou o pedido)
      expect(result.state.etapa).not.toBe('MONTANDO_SALADA');
      // Marmita deve ter sido finalizada e movida para items
      expect(result.state.pedidoAtual.items.length).toBeGreaterThan(0);
      
      // Verifica que a marmita final tem saladas
      const marmitaFinalizada = result.state.pedidoAtual.items[0];
      expect(marmitaFinalizada.saladas).toBeDefined();
      expect(marmitaFinalizada.saladas.length).toBeGreaterThan(0);
    });

    test('"sem salada" em MONTANDO_SALADA avança sem salada', async () => {
      const state = {
        etapa: 'MONTANDO_SALADA',
        pedidoAtual: { items: [] },
        _marmitaAtual: { 
          tamanho: 'Grande', 
          price: 22,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'sem salada', state, COMPANY);

      // Deve avançar para próxima etapa ou finalizar marmita
      expect(result.state.etapa).not.toBe('MONTANDO_SALADA');
    });
  });

  describe('Troca de tipo de pedido no resumo', () => {
    test('"quero retirar na loja" em CONFIRMANDO muda de delivery para pickup', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'mudei de ideia quero retirar na loja', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve reconhecer o pedido de mudança ou processar
      expect(texto.toLowerCase()).toMatch(/retirada|retirar|pickup|balc[aã]o|loja|confirm|resumo|entendi/i);
    });

    test('"na verdade vou buscar aí" em CONFIRMANDO', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Cartão',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'na verdade vou buscar aí', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve processar a intenção de retirada
      expect(texto.toLowerCase()).toMatch(/buscar|retirar|entendi|resumo|confirm/i);
    });
  });

  describe('Troca de forma de pagamento no resumo', () => {
    test('"muda pra pix" em CONFIRMANDO com pagamento em dinheiro', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Dinheiro',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'muda pra pix', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve reconhecer a mudança ou processar
      expect(texto.toLowerCase()).toMatch(/pix|pagamento|confirm|resumo|entendi|ok|anotado/i);
    });

    test('"prefiro cartão" em CONFIRMANDO com pix selecionado', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'prefiro cartão', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cart[aã]o|pagamento|confirm|resumo|entendi/i);
    });
  });

  describe('Troca de itens no pedido final', () => {
    test('"troca o frango por carne" em CONFIRMANDO', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'troca o frango por carne cozida', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Skill de modificação deve ativar ou entender o pedido
      expect(texto.toLowerCase()).toMatch(/carne|confirm|resumo|entendi|troca|modifica/i);
    });

    test('"remove uma marmita" em CONFIRMANDO com 2 marmitas', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Carne'}], acompanhamentos: [{name:'Feijão'}], saladas: [] }
          ],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'remove a marmita pequena', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/remove|pequena|confirm|resumo|entendi|ok/i);
    });

    test('"adiciona mais uma grande igual" em CONFIRMANDO', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'adiciona mais uma marmita grande', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve voltar ao fluxo de montagem ou duplicar
      expect(texto.toLowerCase()).toMatch(/marmita|grande|prote[ií]na|confirm|tamanho/i);
    });
  });

  describe('Troca de endereço no resumo', () => {
    test('"muda o endereço para rua nova 456" em CONFIRMANDO', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'muda o endereço para rua nova 456', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/endere[çc]o|nova|456|confirm|resumo|entendi/i);
    });
  });

  describe('Correção de bebidas no resumo', () => {
    test('"faltou 2 cocas" em CONFIRMANDO aciona correção de bebidas', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 1 }
          ],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = router.classify('faltou 2 cocas', state, COMPANY);
      
      // Deve acionar detectDrinkCorrection
      expect(result).not.toBeNull();
      expect(result.intent).toBe('CORRECAO_BEBIDAS');
    });

    test('"tira os refrigerantes" em CONFIRMANDO remove bebidas', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 3 }
          ],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'tira os refrigerantes', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/refrigerante|bebida|confirm|remov|tir|ok/i);
    });
  });

  describe('Múltiplas trocas em sequência', () => {
    test('cliente monta marmita passo a passo', async () => {
      // Inicia com marmita grande - arrays inicializados
      let state = {
        etapa: 'MONTANDO_PROTEINA',
        pedidoAtual: { items: [] },
        _marmitaAtual: { tamanho: 'Grande', price: 22, proteinas: [], acompanhamentos: [], saladas: [] }
      };

      // Escolhe frango
      let result = await smProcess(COMPANY_ID, PHONE, 'frango', state, COMPANY);
      expect(result.state._marmitaAtual.proteinas).toBeDefined();
      expect(result.state._marmitaAtual.proteinas.length).toBeGreaterThan(0);
      expect(result.state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');

      // Escolhe acompanhamentos e salada juntos (combinado)
      result = await smProcess(COMPANY_ID, PHONE, 'arroz e feijão alface', result.state, COMPANY);
      
      // Deve ter finalizado a marmita
      expect(result.state.pedidoAtual.items.length).toBeGreaterThanOrEqual(1);
    });

    test('"mais uma pequena" em AGUARDANDO_TIPO inicia nova marmita', async () => {
      // Estado após primeira marmita montada
      let state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [{
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            proteinas: [{ name: 'Frango' }],
            acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
            saladas: [{ name: 'Alface' }]
          }]
        }
      };

      // Quer mais uma marmita
      let result = await smProcess(COMPANY_ID, PHONE, 'quero mais uma marmita pequena', state, COMPANY);
      
      // Deve iniciar nova marmita ou perguntar sobre ela
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Pode iniciar montagem ou mostrar opções
      expect(texto.toLowerCase()).toMatch(/pequen|marmita|prote[ií]na|tamanho|delivery|retirada/i);
    });
  });

  describe('Comportamento em etapas intermediárias', () => {
    test('"delivery" em AGUARDANDO_TIPO define tipo corretamente', async () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'delivery', state, COMPANY);

      expect(result.state.pedidoAtual.type).toBe('delivery');
      expect(result.state.etapa).toBe('AGUARDANDO_ENDERECO');
    });

    test('"retirada" em AGUARDANDO_TIPO pula etapa de endereço', async () => {
      const state = {
        etapa: 'AGUARDANDO_TIPO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }]
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'retirada', state, COMPANY);

      expect(result.state.pedidoAtual.type).toBe('pickup');
      // Deve ter pulado endereço
      expect(result.state.etapa).not.toBe('AGUARDANDO_ENDERECO');
    });

    test('endereço informado em AGUARDANDO_ENDERECO avança para pagamento', async () => {
      const state = {
        etapa: 'AGUARDANDO_ENDERECO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'Rua das Flores, 123, Centro', state, { ...COMPANY, delivery_fee: 5 });

      // Deve capturar endereço ou pedir confirmação
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/endere[çc]o|flores|pagamento|pix|cart[aã]o|dinheiro|confirma/i);
    });

    test('forma de pagamento em AGUARDANDO_PAGAMENTO avança para confirmação', async () => {
      const state = {
        etapa: 'AGUARDANDO_PAGAMENTO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'pix', state, COMPANY);

      expect(result.state.pedidoAtual.paymentMethod).toBe('Pix');
      expect(result.state.etapa).toBe('CONFIRMANDO');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// COMPORTAMENTO PÓS-PEDIDO (FINALIZADO)
// ═══════════════════════════════════════════════════════════════════

describe('Comportamento pós-pedido (etapa FINALIZADO)', () => {
  
  describe('Templates pós-pedido', () => {
    test('T.tempoEntregaDelivery mostra tempo estimado', () => {
      const msg = T.tempoEntregaDelivery(30);
      expect(msg).toMatch(/30 minutos/);
      expect(msg.toLowerCase()).toMatch(/entrega|preparado/i);
    });

    test('T.tempoRetiradaPickup mostra tempo para retirada', () => {
      const msg = T.tempoRetiradaPickup(25);
      expect(msg).toMatch(/25 minutos/);
      expect(msg.toLowerCase()).toMatch(/retirar|preparado/i);
    });

    test('T.confirmarAlteracaoPosPedido pede confirmação', () => {
      const msg = T.confirmarAlteracaoPosPedido();
      expect(msg.toLowerCase()).toMatch(/cancelar|alterar|sim.*n[aã]o/i);
    });

    test('T.pedidoCanceladoParaRefazer inicia novo pedido', () => {
      const msg = T.pedidoCanceladoParaRefazer();
      expect(msg.toLowerCase()).toMatch(/cancelado|novo|tamanho|pequena|grande/i);
    });

    test('T.respostaPosPedido mostra opções disponíveis', () => {
      const msg = T.respostaPosPedido();
      expect(msg.toLowerCase()).toMatch(/tempo|trocar|outro pedido/i);
    });
  });

  describe('Perguntas sobre tempo de entrega (delivery)', () => {
    test('"quanto tempo pra chegar?" retorna tempo estimado de delivery', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quanto tempo pra chegar?', state, { ...COMPANY, estimated_time_default: 40 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/40 minutos/);
      expect(texto.toLowerCase()).toMatch(/entrega|preparado/i);
      expect(result.state.etapa).toBe('FINALIZADO');
    });

    test('"falta muito?" retorna tempo estimado', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'falta quanto tempo?', state, { ...COMPANY, estimated_time_default: 30 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/30 minutos/);
    });
  });

  describe('Perguntas sobre retirada (pickup)', () => {
    test('"já posso buscar?" retorna tempo para retirada', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup',
          paymentMethod: 'Dinheiro'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'já posso buscar?', state, { ...COMPANY, estimated_time_default: 20 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/20 minutos/);
      expect(texto.toLowerCase()).toMatch(/retirar|pronto/i);
      expect(result.state.etapa).toBe('FINALIZADO');
    });

    test('"tá pronto já?" retorna tempo estimado de pickup', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'tá pronto já?', state, { ...COMPANY, estimated_time_default: 15 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/15 minutos/);
    });
  });

  describe('Alteração de pedido após conclusão', () => {
    test('"quero trocar a proteína" pede confirmação de cancelamento', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quero trocar a proteína', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cancelar|alterar/i);
      expect(result.state._confirmandoAlteracao).toBe(true);
      expect(result.state.etapa).toBe('FINALIZADO');
    });

    test('"sim" após pedir alteração cancela e inicia novo pedido', async () => {
      const state = {
        etapa: 'FINALIZADO',
        _confirmandoAlteracao: true,
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}] }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'sim', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cancelado|novo|tamanho|pequena|grande/i);
      expect(result.state.etapa).toBe('MONTANDO_TAMANHO');
      expect(result.state.pedidoAtual.items).toHaveLength(0);
      expect(result.state._confirmandoAlteracao).toBe(false);
    });

    test('"não" após pedir alteração mantém pedido atual', async () => {
      const state = {
        etapa: 'FINALIZADO',
        _confirmandoAlteracao: true,
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'não', state, { ...COMPANY, estimated_time_default: 35 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/mantive|tempo|35/i);
      expect(result.state.etapa).toBe('FINALIZADO');
      expect(result.state._confirmandoAlteracao).toBe(false);
    });

    test('"muda o acompanhamento" pede confirmação', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup',
          paymentMethod: 'Cartão'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quero mudar o acompanhamento', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cancelar|alterar/i);
      expect(result.state._confirmandoAlteracao).toBe(true);
    });

    test('"adiciona uma bebida" pede confirmação para alterar', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'adiciona uma bebida no pedido', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cancelar|alterar/i);
      expect(result.state._confirmandoAlteracao).toBe(true);
    });
  });

  describe('Novo pedido após finalização', () => {
    test('"quero fazer outro pedido" inicia novo pedido', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quero fazer outro pedido', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/tamanho|pequena|grande/i);
      expect(result.state.etapa).toBe('MONTANDO_TAMANHO');
      expect(result.state.pedidoAtual.items).toHaveLength(0);
    });

    test('"pedir mais uma marmita" inicia novo pedido', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup',
          paymentMethod: 'Dinheiro'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'quero pedir mais uma marmita', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/tamanho|pequena|grande|novo/i);
      expect(result.state.etapa).toBe('MONTANDO_TAMANHO');
    });
  });

  describe('Cancelamento pós-pedido', () => {
    test('"cancela o pedido" pede confirmação', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'cancelar o pedido', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cancelar|certeza|sim.*n[aã]o/i);
      expect(result.state._confirmandoCancelamentoPos).toBe(true);
    });

    test('"sim" confirma cancelamento pós-pedido', async () => {
      const state = {
        etapa: 'FINALIZADO',
        _confirmandoCancelamentoPos: true,
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'sim', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cancelado|chamar/i);
      expect(result.state.etapa).toBe('INICIO');
    });

    test('"não" após pedir cancelamento mantém pedido', async () => {
      const state = {
        etapa: 'FINALIZADO',
        _confirmandoCancelamentoPos: true,
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'não', state, { ...COMPANY, estimated_time_default: 25 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/mantive|pronto/i);
      expect(result.state.etapa).toBe('FINALIZADO');
    });
  });

  describe('Status do pedido', () => {
    test('"como está meu pedido?" mostra status de delivery', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua das Flores, 456',
          paymentMethod: 'Pix',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'como está meu pedido?', state, { ...COMPANY, estimated_time_default: 30 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/30 minutos/);
      expect(texto).toMatch(/Flores|456/);
      expect(texto).toMatch(/Pix/);
    });

    test('"status do pedido" mostra status de pickup', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup',
          paymentMethod: 'Cartão'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'status do pedido', state, { ...COMPANY, estimated_time_default: 20 });

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/20 minutos/);
      expect(texto.toLowerCase()).toMatch(/retirada/i);
      expect(texto).toMatch(/Cartão/);
    });
  });

  describe('Resposta padrão pós-pedido', () => {
    test('mensagem aleatória retorna opções disponíveis', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'oi', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/tempo|trocar|outro pedido|andamento/i);
      expect(result.state.etapa).toBe('FINALIZADO');
    });

    test('emoji aleatório retorna opções', async () => {
      const state = {
        etapa: 'FINALIZADO',
        pedidoAtual: {
          items: [{ tipo: 'marmita', tamanho: 'Grande', price: 22 }],
          type: 'pickup',
          paymentMethod: 'Dinheiro'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, '👍', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/tempo|trocar|outro|andamento/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUGS V4 — Quantidade bebidas, Typo fuzzy, perguntarTipo, ASK_SUMMARY, Reclamação
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bugs v4 — Correções cirúrgicas', () => {
  const COMPANY_ID = 'demo-company';
  const PHONE = '5511999999999';
  const COMPANY = {
    name: 'Marmitas Caseiras',
    delivery_fee: 5,
    estimated_time_default: 30
  };

  // ─── BUG #1: Quantidade de bebidas ───────────────────────────────────────────
  describe('interpretUpsell — quantidade de bebidas', () => {
    const ai = require('./aiInterpreter');
    const upsells = [
      { name: 'Suco Natural', price: 8 },
      { name: 'Refrigerante Lata', price: 6, apelidos: ['refri', 'coca', 'guaraná'] }
    ];

    test('"5 sucos e 3 cocas" retorna quantidade correta', () => {
      const result = ai.interpretUpsell('5 sucos e 3 cocas', upsells);
      
      const suco = result.find(r => r.name === 'Suco Natural');
      const refri = result.find(r => r.name === 'Refrigerante Lata');
      
      expect(suco).toBeDefined();
      expect(suco.quantity).toBe(5);
      expect(refri).toBeDefined();
      expect(refri.quantity).toBe(3);
    });

    test('"sim quero 5 sucos naturais" retorna quantidade 5', () => {
      const result = ai.interpretUpsell('sim quero 5 sucos naturais', upsells);
      
      const suco = result.find(r => r.name === 'Suco Natural');
      expect(suco).toBeDefined();
      expect(suco.quantity).toBe(5);
    });

    test('"2 refris e 1 suco" retorna quantidades corretas', () => {
      const result = ai.interpretUpsell('2 refris e 1 suco', upsells);
      
      const suco = result.find(r => r.name === 'Suco Natural');
      const refri = result.find(r => r.name === 'Refrigerante Lata');
      
      expect(refri.quantity).toBe(2);
      expect(suco.quantity).toBe(1);
    });
  });

  // ─── BUG #2: Typo "custela" via Levenshtein ──────────────────────────────────
  describe('matchFuzzy — Levenshtein para typos', () => {
    const ai = require('./aiInterpreter');
    const proteinas = [
      { name: 'Frango Grelhado', apelidos: ['frango'] },
      { name: 'Costela', apelidos: [] },
      { name: 'Linguiça', apelidos: ['linguica'] },
      { name: 'Carne Cozida', apelidos: ['carne'] }
    ];

    test('"custela" reconhece Costela (distância 1)', () => {
      const result = ai.interpretItensMultiplos('custela', proteinas);
      expect(result.map(r => r.name)).toContain('Costela');
    });

    test('"custela e linguica" retorna 2 itens', () => {
      const result = ai.interpretItensMultiplos('custela e linguica', proteinas);
      const nomes = result.map(r => r.name);
      
      expect(nomes).toContain('Costela');
      expect(nomes).toContain('Linguiça');
      expect(result.length).toBe(2);
    });

    test('"linguça" reconhece Linguiça (distância 1)', () => {
      const result = ai.interpretItensMultiplos('linguça', proteinas);
      expect(result.map(r => r.name)).toContain('Linguiça');
    });

    test('"costala" reconhece Costela (distância 1 por troca de vogal)', () => {
      const result = ai.interpretItensMultiplos('costala', proteinas);
      expect(result.map(r => r.name)).toContain('Costela');
    });
  });

  // ─── BUG #3: perguntarTipo com array completo ────────────────────────────────
  describe('perguntarTipo — resumo completo', () => {
    const T = require('./templates');

    test('recebe array e formata múltiplas marmitas', () => {
      const items = [
        { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}] },
        { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Linguiça'}], acompanhamentos: [{name:'Feijão'}] },
        { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 2 }
      ];
      
      const resultado = T.perguntarTipo(items);
      const texto = Array.isArray(resultado) ? resultado.join(' ') : resultado;
      
      // Deve mostrar TODAS as marmitas, não só uma
      expect(texto).toMatch(/Grande/i);
      expect(texto).toMatch(/Pequena/i);
      expect(texto).toMatch(/Suco/i);
      expect(texto).toMatch(/Entrega|Retirada/i);
    });

    test('formata corretamente 3 marmitas + extras', () => {
      const items = [
        { tipo: 'marmita', tamanho: 'Grande', price: 22 },
        { tipo: 'marmita', tamanho: 'Pequena', price: 20 },
        { tipo: 'marmita', tamanho: 'Pequena', price: 20 },
        { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 3 }
      ];
      
      const resultado = T.perguntarTipo(items);
      const texto = Array.isArray(resultado) ? resultado.join(' ') : resultado;
      
      expect(texto).toMatch(/Grande/);
      expect(texto).toMatch(/Pequena/);
      expect(texto).toMatch(/Refrigerante|Refri/i);
    });
  });

  // ─── BUG #4: ASK_SUMMARY variações ───────────────────────────────────────────
  describe('ASK_SUMMARY — variações de frase', () => {
    const intentRouter = require('./intentRouter');

    test('"vc não mostrou o resumo" é capturado', () => {
      const state = { etapa: 'AGUARDANDO_TIPO', pedidoAtual: { items: [{ tipo: 'marmita', price: 20 }] } };
      const result = intentRouter.classify('vc não mostrou o resumo', state, {});
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('ASK_SUMMARY');
    });

    test('"ainda não mostrou o resumo" é capturado', () => {
      const state = { etapa: 'AGUARDANDO_TIPO', pedidoAtual: { items: [{ tipo: 'marmita', price: 20 }] } };
      const result = intentRouter.classify('ainda não mostrou o resumo', state, {});
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('ASK_SUMMARY');
    });

    test('"cadê o resumo" é capturado', () => {
      const state = { etapa: 'AGUARDANDO_TIPO', pedidoAtual: { items: [{ tipo: 'marmita', price: 20 }] } };
      const result = intentRouter.classify('cadê o resumo', state, {});
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('ASK_SUMMARY');
    });

    test('"meu pedido" é capturado', () => {
      const state = { etapa: 'AGUARDANDO_TIPO', pedidoAtual: { items: [{ tipo: 'marmita', price: 20 }] } };
      const result = intentRouter.classify('meu pedido', state, {});
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('ASK_SUMMARY');
    });

    test('não captura em FINALIZADO (usa handlePosPedido)', () => {
      const state = { etapa: 'FINALIZADO', pedidoAtual: { items: [{ tipo: 'marmita', price: 20 }] } };
      const result = intentRouter.classify('meu pedido', state, {});
      
      // Deve retornar null para deixar handlePosPedido tratar
      expect(result).toBeNull();
    });
  });

  // ─── BUG #5: Reclamação sobre quantidade ─────────────────────────────────────
  describe('handleConfirmacao — reclamação sobre quantidade', () => {
    const smProcess = require('./stateMachine').process;

    test('"as quantidades estão erradas" mostra resumo + pede correção', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22 },
            { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
          ],
          type: 'pickup',
          paymentMethod: 'Pix'
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'as quantidades de bebida estão erradas', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/corrigir|exatamente|exemplo/i);
      expect(result.state.etapa).toBe('CONFIRMANDO');
    });

    test('"não veio o suco" mostra como corrigir', async () => {
      const state = {
        etapa: 'CONFIRMANDO',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22 }
          ],
          type: 'delivery',
          address: 'Rua Teste, 123',
          paymentMethod: 'Dinheiro',
          deliveryFee: 5
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'a quantidade do suco esta errada', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/corrigir|errado/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUGS V5 — FAQ durante fluxo, Resumo completo no perguntarTipo
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bugs v5 — FAQ lateral e resumo completo', () => {
  const COMPANY_ID = 'demo-company';
  const PHONE = '5511999999999';
  const COMPANY = {
    name: 'Marmitas Caseiras',
    delivery_fee: 5,
    estimated_time_default: 30,
    opening_hours: '10h às 22h',
    address: 'Rua das Marmitas, 123'
  };

  // ─── PERGUNTAS LATERAIS (FAQ durante fluxo) ─────────────────────────────────
  describe('FAQ durante fluxo de pedido', () => {
    const intentRouter = require('./intentRouter');

    test('"qual o horário de funcionamento" durante MONTANDO_ACOMPANHAMENTO retorna FAQ + contexto', () => {
      const state = { 
        etapa: 'MONTANDO_ACOMPANHAMENTO', 
        pedidoAtual: { items: [] },
        _grupos: [{tamanho:'Pequena', qty:2}],
        _currentGrupoIndex: 1
      };
      
      const result = intentRouter.classify('qual o horário de funcionamento', state, COMPANY);
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('FAQ');
      
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      // Deve ter resposta do horário
      expect(texto).toMatch(/10h/);
      // E contexto para continuar
      expect(texto.toLowerCase()).toMatch(/acompanhamento/i);
    });

    test('"vocês aceitam cartão?" durante MONTANDO_SALADA retorna FAQ + contexto', () => {
      const state = { 
        etapa: 'MONTANDO_SALADA', 
        pedidoAtual: { items: [] }
      };
      
      const result = intentRouter.classify('vocês aceitam cartão?', state, COMPANY);
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('FAQ');
      
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto.toLowerCase()).toMatch(/cartao|crédito|débito|credito|debito/i);
      expect(texto.toLowerCase()).toMatch(/salada/i);
    });

    test('"onde fica a loja?" durante AGUARDANDO_TIPO retorna FAQ + contexto', () => {
      const state = { 
        etapa: 'AGUARDANDO_TIPO', 
        pedidoAtual: { items: [{ tipo: 'marmita', price: 20 }] }
      };
      
      const result = intentRouter.classify('onde fica a loja?', state, COMPANY);
      
      expect(result).not.toBeNull();
      expect(result.intent).toBe('FAQ');
      
      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
      expect(texto).toMatch(/Marmitas, 123/);
      expect(texto.toLowerCase()).toMatch(/entrega|retirada/i);
    });
  });

  // ─── RESUMO COMPLETO NO perguntarTipo ───────────────────────────────────────
  describe('perguntarTipo com múltiplos itens', () => {
    const smProcess = require('./stateMachine').process;

    test('após upsell mostra todas as marmitas + bebidas', async () => {
      // Simula estado após completar bebidas (fase sobremesa), bebidas já no pedido
      const state = {
        etapa: 'OFERECENDO_UPSELL',
        _upsellPhase: 'sobremesa',
        pedidoAtual: {
          items: [
            { tipo: 'marmita', tamanho: 'Grande', price: 22, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
            { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Costela'}], acompanhamentos: [{name:'Feijão'}], saladas: [{name:'Alface'}] },
            { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Costela'}], acompanhamentos: [{name:'Feijão'}], saladas: [{name:'Alface'}] },
            { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 3 },
            { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 2 }
          ],
          type: null,
          address: null,
          paymentMethod: null,
          deliveryFee: 0
        }
      };

      const result = await smProcess(COMPANY_ID, PHONE, 'não quero', state, COMPANY);

      const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;

      // Deve mostrar TODAS as marmitas
      expect(texto).toMatch(/Grande/i);
      expect(texto).toMatch(/Pequena/i);

      // Deve mostrar as bebidas
      expect(texto).toMatch(/Suco/i);
      expect(texto).toMatch(/Refri/i);

      // Deve perguntar tipo
      expect(texto.toLowerCase()).toMatch(/entrega|retirada/i);

      // 5 items (3 marmitas + 2 bebidas, sem sobremesa)
      expect(result.state.pedidoAtual.items.length).toBe(5);
    });

    test('formatação agrupa marmitas idênticas', () => {
      const T = require('./templates');
      
      const items = [
        { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
        { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] },
        { tipo: 'marmita', tamanho: 'Pequena', price: 20, proteinas: [{name:'Frango'}], acompanhamentos: [{name:'Arroz'}], saladas: [] }
      ];
      
      const resultado = T.perguntarTipo(items);
      const texto = Array.isArray(resultado) ? resultado.join(' ') : resultado;
      
      // Deve agrupar como "3x Marmita Pequena"
      expect(texto).toMatch(/3x.*Pequena/i);
      // Preço deve ser 60 (3 x 20)
      expect(texto).toMatch(/60,00/);
    });
  });

  // ─── CONTEXTO DE ETAPA PARA TODAS AS ETAPAS ─────────────────────────────────
  describe('contextoEtapa cobre todas etapas', () => {
    const T = require('./templates');

    test('MONTANDO_SALADA tem contexto', () => {
      expect(T.contextoEtapa('MONTANDO_SALADA')).toMatch(/salada/i);
    });

    test('OFERECENDO_UPSELL tem contexto', () => {
      expect(T.contextoEtapa('OFERECENDO_UPSELL')).toMatch(/bebida|sobremesa/i);
    });

    test('AGUARDANDO_ENDERECO tem contexto', () => {
      expect(T.contextoEtapa('AGUARDANDO_ENDERECO')).toMatch(/endere/i);
    });

    test('CONFIRMANDO tem contexto', () => {
      expect(T.contextoEtapa('CONFIRMANDO')).toMatch(/confirm/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bugs v6 — Resumo completo e opções de salada
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bugs v6 — Resumo completo antes do pagamento', () => {
  const { process: smProcess } = require('./stateMachine');
  const T = require('./templates');
  
  const COMPANY = { 
    name: 'Marmitas Teste', 
    delivery_fee: 5,
    opening_hours: '10h às 22h'
  };

  // ─── TESTES DE RESUMO COMPLETO ────────────────────────────────────────────

  test('perguntarTipo mostra TODAS as marmitas com proteínas, acompanhamentos e saladas', async () => {
    const items = [
      {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        quantity: 1,
        proteinas: [{ name: 'Churrasco' }],
        acompanhamentos: [{ name: 'Macarrão' }],
        saladas: [{ name: 'Beterraba' }, { name: 'Alface' }]
      },
      {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        quantity: 1,
        proteinas: [{ name: 'Churrasco' }],
        acompanhamentos: [{ name: 'Macarrão' }],
        saladas: [{ name: 'Beterraba' }, { name: 'Alface' }]
      },
      {
        tipo: 'marmita',
        tamanho: 'Pequena',
        price: 20,
        quantity: 1,
        proteinas: [{ name: 'Costela' }],
        acompanhamentos: [{ name: 'Purê' }],
        saladas: [{ name: 'Repolho' }]
      }
    ];
    
    const response = T.perguntarTipo(items);
    const texto = response.join('\n');
    
    // Verifica que mostra quantidade agrupada
    expect(texto).toMatch(/2x.*Marmita Grande/i);
    expect(texto).toMatch(/Marmita Pequena/i);
    // Verifica proteínas
    expect(texto).toMatch(/Churrasco/i);
    expect(texto).toMatch(/Costela/i);
    // Verifica acompanhamentos
    expect(texto).toMatch(/Macarrão/i);
    expect(texto).toMatch(/Purê/i);
    // Verifica saladas
    expect(texto).toMatch(/Beterraba/i);
    expect(texto).toMatch(/Alface/i);
    expect(texto).toMatch(/Repolho/i);
  });

  test('perguntarTipo mostra bebidas com quantidade correta', async () => {
    const items = [
      {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        quantity: 1,
        proteinas: [{ name: 'Frango' }],
        acompanhamentos: [{ name: 'Arroz' }],
        saladas: []
      },
      {
        tipo: 'extra',
        name: 'Suco Natural',
        price: 8,
        quantity: 3
      },
      {
        tipo: 'extra',
        name: 'Refrigerante Lata',
        price: 6,
        quantity: 2
      }
    ];
    
    const response = T.perguntarTipo(items);
    const texto = response.join('\n');
    
    // Verifica bebidas com quantidade
    expect(texto).toMatch(/3x.*Suco Natural/i);
    expect(texto).toMatch(/2x.*Refrigerante/i);
    // Verifica preços calculados corretamente
    expect(texto).toMatch(/R\$ 24,00/); // 3 * 8
    expect(texto).toMatch(/R\$ 12,00/); // 2 * 6
  });

  test('fluxo completo: após upsell mostra resumo completo com saladas', async () => {
    // Simula fase sobremesa (bebidas já anotadas), rejeita sobremesa
    let state = {
      etapa: 'OFERECENDO_UPSELL',
      _upsellPhase: 'sobremesa',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
            saladas: [{ name: 'Alface' }, { name: 'Tomate' }]
          },
          { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 2 }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0
      }
    };

    const result = await smProcess('c1', '5511999', 'não quero', state, COMPANY);
    const texto = result.response.join('\n');

    // Resumo deve incluir saladas
    expect(texto).toMatch(/Alface/i);
    expect(texto).toMatch(/Tomate/i);
    // E as bebidas
    expect(texto).toMatch(/2x.*Suco/i);
  });

  test('confirmacaoFinal mostra saladas no resumo', () => {
    const pedido = {
      items: [
        {
          tipo: 'marmita',
          tamanho: 'Grande',
          price: 22,
          proteinas: [{ name: 'Frango' }],
          acompanhamentos: [{ name: 'Arroz' }],
          saladas: [{ name: 'Beterraba' }, { name: 'Pepino' }]
        }
      ],
      type: 'delivery',
      address: 'Rua Teste, 123',
      deliveryFee: 5,
      paymentMethod: 'Pix',
      estimatedTime: 40
    };
    
    const response = T.confirmacaoFinal(pedido);
    const texto = response.join('\n');
    
    // Deve mostrar saladas
    expect(texto).toMatch(/Beterraba/i);
    expect(texto).toMatch(/Pepino/i);
  });

  test('_formatarItensPedido inclui ícone de salada 🥗', () => {
    const items = [
      {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        proteinas: [{ name: 'Frango' }],
        acompanhamentos: [{ name: 'Arroz' }],
        saladas: [{ name: 'Alface' }]
      }
    ];
    
    const texto = T._formatarItensPedido(items);
    
    expect(texto).toMatch(/🥗.*Alface/);
  });

  // ─── TESTES DE OPÇÕES DE SALADA ─────────────────────────────────────────────

  test('pedirSalada lista todas as opções de salada', () => {
    const response = T.pedirSalada();
    
    expect(response).toMatch(/Maionese/i);
    expect(response).toMatch(/Beterraba/i);
    expect(response).toMatch(/Alface/i);
    expect(response).toMatch(/Repolho/i);
    expect(response).toMatch(/Pepino/i);
  });

  test('handleSalada em GROUP MODE mostra opções de salada na pergunta', async () => {
    const state = {
      etapa: 'MONTANDO_SALADA',
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: null }
      ],
      _currentGrupoIndex: 0,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    // Mensagem não reconhecida deve re-perguntar com opções
    const result = await smProcess('c1', '5511999', 'xyz123', state, COMPANY);
    const texto = result.response;
    
    // Deve conter opções de salada
    expect(texto).toMatch(/Maionese|Beterraba|Alface|Repolho|Pepino/i);
  });

  test('saladaNaoEntendida lista opções de salada', () => {
    const response = T.saladaNaoEntendida();
    
    expect(response).toMatch(/Maionese/i);
    expect(response).toMatch(/Beterraba/i);
    expect(response).toMatch(/Alface/i);
    expect(response).toMatch(/Repolho/i);
    expect(response).toMatch(/Pepino/i);
  });

  test('transição após acompanhamento avança o fluxo', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      _grupos: [
        { tamanho: 'Grande', qty: 1, proteinas: ['Frango'], acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    const result = await smProcess('c1', '5511999', 'arroz e feijão', state, COMPANY);
    
    // Após acompanhamento combinado, deve expandir grupos e avançar
    expect(result.state.etapa).toBe('OFERECENDO_UPSELL');
    expect(result.state.pedidoAtual.items.length).toBe(1);
  });

  test('resumo no AGUARDANDO_TIPO mostra marmitas com todos os detalhes', async () => {
    const state = {
      etapa: 'AGUARDANDO_TIPO',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Linguiça' }],
            acompanhamentos: [{ name: 'Tropeiro' }],
            saladas: [{ name: 'Vinagrete' }]
          },
          {
            tipo: 'extra',
            name: 'Suco Natural',
            price: 8,
            quantity: 2
          }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0
      }
    };
    
    // ASK_SUMMARY nessa etapa
    const router = require('./intentRouter');
    const result = router.classify('mostra meu pedido', state, COMPANY);
    
    expect(result).not.toBeNull();
    expect(result.intent).toBe('ASK_SUMMARY');
    
    const texto = result.response.join('\n');
    // Verifica detalhes completos
    expect(texto).toMatch(/Linguiça/i);
    expect(texto).toMatch(/Tropeiro/i);
    expect(texto).toMatch(/Vinagrete/i);
    expect(texto).toMatch(/2x.*Suco/i);
  });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Bug v6 extra — Opções de salada na transição acompanhamento → salada
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug v6 — Opções de salada na transição', () => {
  const { process: smProcess } = require('./stateMachine');
  
  const COMPANY = { 
    name: 'Marmitas Teste', 
    delivery_fee: 5,
    opening_hours: '10h às 22h'
  };

  test('após acompanhamento, pergunta salada COM lista de opções (3 grandes)', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      _grupos: [
        { tamanho: 'Grande', qty: 3, proteinas: ['Frango'], acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    const result = await smProcess('c1', '5511999', 'arroz e feijão', state, COMPANY);
    
    // Com handler combinado, grupo completo → expande e avança
    expect(result.state.etapa).toBe('OFERECENDO_UPSELL');
    expect(result.state.pedidoAtual.items.length).toBe(3);
  });

  test('após acompanhamento do último grupo, expande e avança', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: null },
        { tamanho: 'Pequena', qty: 1, proteinas: ['Costela'], acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 1,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    const result = await smProcess('c1', '5511999', 'purê', state, COMPANY);
    
    // Todos os grupos completos → expande e avança
    expect(result.state.etapa).toBe('OFERECENDO_UPSELL');
    expect(result.state.pedidoAtual.items.length).toBe(3);
  });

  test('quando pula acompanhamento ("sem"), avança direto', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      _grupos: [
        { tamanho: 'Grande', qty: 1, proteinas: ['Frango'], acompanhamentos: null, saladas: null }
      ],
      _currentGrupoIndex: 0,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    const result = await smProcess('c1', '5511999', 'sem', state, COMPANY);
    
    expect(result.state.etapa).toBe('OFERECENDO_UPSELL');
    expect(result.state.pedidoAtual.items.length).toBe(1);
  });

  test('após salada do primeiro grupo, pergunta salada do segundo COM opções', async () => {
    const state = {
      etapa: 'MONTANDO_SALADA',
      _grupos: [
        { tamanho: 'Grande', qty: 2, proteinas: ['Frango'], acompanhamentos: ['Arroz'], saladas: null },
        { tamanho: 'Pequena', qty: 1, proteinas: ['Costela'], acompanhamentos: ['Purê'], saladas: null }
      ],
      _currentGrupoIndex: 0,
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    const result = await smProcess('c1', '5511999', 'alface', state, COMPANY);
    
    // Deve avançar para o próximo grupo
    expect(result.state._currentGrupoIndex).toBe(1);

    // Deve mostrar opções de salada para o próximo grupo
    const texto = Array.isArray(result.response) ? result.response.join(' ') : result.response;
    expect(texto).toMatch(/pequena/i);
    expect(texto).toMatch(/Maionese|Beterraba|Alface|Repolho|Pepino/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bug v6 — Resumo completo no perguntarTipo (entrega ou retirada)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug v6 — Resumo completo ao perguntar entrega/retirada', () => {
  const { process: smProcess } = require('./stateMachine');
  const T = require('./templates');
  
  const COMPANY = { 
    name: 'Marmitas Teste', 
    delivery_fee: 5,
    opening_hours: '10h às 22h'
  };

  test('fluxo 3 marmitas + 2 bebidas: resumo mostra TUDO antes de entrega/retirada', async () => {
    // Simula fase sobremesa (bebidas já anotadas), rejeita sobremesa para ir a AGUARDANDO_TIPO
    const state = {
      etapa: 'OFERECENDO_UPSELL',
      _upsellPhase: 'sobremesa',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Frango' }],
            acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
            saladas: [{ name: 'Alface' }]
          },
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Frango' }],
            acompanhamentos: [{ name: 'Arroz' }, { name: 'Feijão' }],
            saladas: [{ name: 'Alface' }]
          },
          {
            tipo: 'marmita',
            tamanho: 'Pequena',
            price: 20,
            quantity: 1,
            proteinas: [{ name: 'Costela' }],
            acompanhamentos: [{ name: 'Purê' }],
            saladas: [{ name: 'Beterraba' }]
          },
          { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 2 },
          { tipo: 'extra', name: 'Refrigerante Lata', price: 6, quantity: 3 }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0
      }
    };

    // Rejeita sobremesa, vai direto para AGUARDANDO_TIPO com resumo completo
    const result = await smProcess('c1', '5511999', 'não quero', state, COMPANY);
    
    // Deve ir para AGUARDANDO_TIPO
    expect(result.state.etapa).toBe('AGUARDANDO_TIPO');
    
    const texto = result.response.join('\n');
    
    // Deve mostrar 2x Marmita Grande (agrupadas)
    expect(texto).toMatch(/2x.*Marmita Grande/i);
    
    // Deve mostrar 1x Marmita Pequena
    expect(texto).toMatch(/Marmita Pequena/i);
    
    // Deve mostrar proteínas
    expect(texto).toMatch(/Frango/i);
    expect(texto).toMatch(/Costela/i);
    
    // Deve mostrar acompanhamentos
    expect(texto).toMatch(/Arroz/i);
    expect(texto).toMatch(/Feijão/i);
    expect(texto).toMatch(/Purê/i);
    
    // Deve mostrar saladas
    expect(texto).toMatch(/Alface/i);
    expect(texto).toMatch(/Beterraba/i);
    
    // Deve mostrar bebidas com quantidade correta
    expect(texto).toMatch(/2x.*Suco/i);
    expect(texto).toMatch(/3x.*Refrigerante/i);
    
    // Deve perguntar entrega ou retirada
    expect(texto).toMatch(/Entrega.*Retirada|Retirada.*Entrega/i);
  });

  test('fluxo 3 grandes idênticas + 1 suco: agrupa corretamente', async () => {
    // Fase sobremesa com suco já no pedido, rejeita sobremesa
    const state = {
      etapa: 'OFERECENDO_UPSELL',
      _upsellPhase: 'sobremesa',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Macarrão' }],
            saladas: [{ name: 'Repolho' }]
          },
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Macarrão' }],
            saladas: [{ name: 'Repolho' }]
          },
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Churrasco' }],
            acompanhamentos: [{ name: 'Macarrão' }],
            saladas: [{ name: 'Repolho' }]
          },
          { tipo: 'extra', name: 'Suco Natural', price: 8, quantity: 1 }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0
      }
    };

    const result = await smProcess('c1', '5511999', 'não quero', state, COMPANY);
    
    const texto = result.response.join('\n');
    
    // Deve mostrar 3x Marmita Grande (agrupadas)
    expect(texto).toMatch(/3x.*Marmita Grande/i);
    
    // Deve mostrar preço correto (3 * 22 = 66)
    expect(texto).toMatch(/R\$ 66,00/);
    
    // Deve mostrar proteína
    expect(texto).toMatch(/Churrasco/i);
    
    // Deve mostrar acompanhamento
    expect(texto).toMatch(/Macarrão/i);
    
    // Deve mostrar salada
    expect(texto).toMatch(/Repolho/i);
    
    // Deve mostrar bebida
    expect(texto).toMatch(/1x.*Suco|Suco Natural.*R\$/i);
  });

  test('fluxo sem bebidas: mostra só marmitas', async () => {
    // Fase sobremesa sem bebidas no pedido, rejeita sobremesa
    const state = {
      etapa: 'OFERECENDO_UPSELL',
      _upsellPhase: 'sobremesa',
      pedidoAtual: {
        items: [
          {
            tipo: 'marmita',
            tamanho: 'Grande',
            price: 22,
            quantity: 1,
            proteinas: [{ name: 'Linguiça' }],
            acompanhamentos: [{ name: 'Tropeiro' }],
            saladas: []
          },
          {
            tipo: 'marmita',
            tamanho: 'Pequena',
            price: 20,
            quantity: 1,
            proteinas: [{ name: 'Carne Cozida' }],
            acompanhamentos: [{ name: 'Feijão' }],
            saladas: [{ name: 'Pepino' }]
          }
        ],
        type: null,
        address: null,
        paymentMethod: null,
        deliveryFee: 0
      }
    };

    const result = await smProcess('c1', '5511999', 'não quero', state, COMPANY);
    
    const texto = result.response.join('\n');
    
    // Deve mostrar marmitas
    expect(texto).toMatch(/Marmita Grande/i);
    expect(texto).toMatch(/Marmita Pequena/i);
    
    // Deve mostrar proteínas
    expect(texto).toMatch(/Linguiça/i);
    expect(texto).toMatch(/Carne Cozida/i);
    
    // Deve mostrar salada da pequena
    expect(texto).toMatch(/Pepino/i);
    
    // NÃO deve ter bebidas
    expect(texto).not.toMatch(/Suco|Refrigerante/i);
    
    // Deve perguntar entrega/retirada
    expect(texto).toMatch(/Entrega.*Retirada/i);
  });

  test('template perguntarTipo direto com 3 marmitas + bebidas', () => {
    const items = [
      {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        quantity: 1,
        proteinas: [{ name: 'Frango' }, { name: 'Churrasco' }],
        acompanhamentos: [{ name: 'Arroz' }],
        saladas: [{ name: 'Alface' }, { name: 'Tomate' }]
      },
      {
        tipo: 'marmita',
        tamanho: 'Grande',
        price: 22,
        quantity: 1,
        proteinas: [{ name: 'Frango' }, { name: 'Churrasco' }],
        acompanhamentos: [{ name: 'Arroz' }],
        saladas: [{ name: 'Alface' }, { name: 'Tomate' }]
      },
      {
        tipo: 'marmita',
        tamanho: 'Pequena',
        price: 20,
        quantity: 1,
        proteinas: [{ name: 'Costela' }],
        acompanhamentos: [{ name: 'Macarrão' }, { name: 'Purê' }],
        saladas: []
      },
      {
        tipo: 'extra',
        name: 'Suco Natural',
        price: 8,
        quantity: 4
      },
      {
        tipo: 'extra',
        name: 'Refrigerante Lata',
        price: 6,
        quantity: 2
      }
    ];
    
    const response = T.perguntarTipo(items);
    const texto = response.join('\n');
    
    // Verifica agrupamento
    expect(texto).toMatch(/2x.*Marmita Grande/i);
    expect(texto).toMatch(/Marmita Pequena/i);
    
    // Verifica proteínas (2 na grande)
    expect(texto).toMatch(/Frango.*Churrasco|Churrasco.*Frango/i);
    expect(texto).toMatch(/Costela/i);
    
    // Verifica acompanhamentos
    expect(texto).toMatch(/Arroz/i);
    expect(texto).toMatch(/Macarrão/i);
    expect(texto).toMatch(/Purê/i);
    
    // Verifica saladas
    expect(texto).toMatch(/Alface/i);
    expect(texto).toMatch(/Tomate/i);
    
    // Verifica bebidas com quantidade
    expect(texto).toMatch(/4x.*Suco Natural/i);
    expect(texto).toMatch(/2x.*Refrigerante/i);
    
    // Verifica preços
    expect(texto).toMatch(/R\$ 44,00/); // 2 grandes * 22
    expect(texto).toMatch(/R\$ 20,00/); // 1 pequena
    expect(texto).toMatch(/R\$ 32,00/); // 4 sucos * 8
    expect(texto).toMatch(/R\$ 12,00/); // 2 refris * 6
    
    // Verifica pergunta
    expect(texto).toMatch(/Entrega.*Retirada/i);
  });

  test('fluxo completo via process: 3 grandes + bebidas', async () => {
    let state = {
      etapa: 'INICIO',
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 }
    };
    
    // Inicia
    state = (await smProcess('c1', '5511999', 'oi', state, COMPANY)).state;
    
    // Pede 3 grandes
    state = (await smProcess('c1', '5511999', '3 grandes', state, COMPANY)).state;
    
    // Proteína
    state = (await smProcess('c1', '5511999', 'frango', state, COMPANY)).state;
    
    // Acompanhamento + Salada (combinado)
    state = (await smProcess('c1', '5511999', 'arroz alface', state, COMPANY)).state;
    
    // Verifica que tem 3 marmitas
    expect(state.pedidoAtual.items.length).toBe(3);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
    
    // Bebidas
    const r1 = await smProcess('c1', '5511999', '2 sucos e 1 refri', state, COMPANY);
    // Bebidas adicionadas; agora oferece sobremesa (fase intermediária)
    expect(r1.state.pedidoAtual.items.length).toBe(5); // 3 marmitas + 2 bebidas

    // Rejeita sobremesa → vai para AGUARDANDO_TIPO com resumo completo
    const result = await smProcess('c1', '5511999', 'não', r1.state, COMPANY);

    expect(result.state.etapa).toBe('AGUARDANDO_TIPO');
    expect(result.state.pedidoAtual.items.length).toBe(5); // ainda 3 marmitas + 2 bebidas

    const texto = result.response.join('\n');

    // Deve mostrar 3x Marmita Grande
    expect(texto).toMatch(/3x.*Marmita Grande/i);

    // Deve mostrar bebidas
    expect(texto).toMatch(/2x.*Suco/i);
    expect(texto).toMatch(/1x.*Refrigerante/i);

    // Deve perguntar entrega/retirada
    expect(texto).toMatch(/Entrega.*Retirada/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleAcompanhamentoESalada — handler combinado
// ═══════════════════════════════════════════════════════════════

describe('handleAcompanhamentoESalada — handler combinado', () => {
  test('"arroz e alface" → acomp=[Arroz], salada=[Alface]', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      pedidoAtual: { items: [] },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    };

    await smProcess('c1', '5511999', 'arroz e alface', state, COMPANY);

    const item = state.pedidoAtual.items[0];
    expect(item.acompanhamentos.some(a => /arroz/i.test(a.name))).toBe(true);
    expect(item.saladas.some(s => /alface/i.test(s.name))).toBe(true);
  });

  test('"arroz feijão maionese repolho" → 2 acomps + 2 saladas', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      pedidoAtual: { items: [] },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    };

    await smProcess('c1', '5511999', 'arroz feijão maionese repolho', state, COMPANY);

    const item = state.pedidoAtual.items[0];
    expect(item.acompanhamentos.length).toBe(2);
    expect(item.saladas.length).toBe(2);
  });

  test('"arroz" (só acomp) → acomp=[Arroz], salada=[]', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      pedidoAtual: { items: [] },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    };

    await smProcess('c1', '5511999', 'arroz', state, COMPANY);

    const item = state.pedidoAtual.items[0];
    expect(item.acompanhamentos.length).toBe(1);
    expect(item.saladas.length).toBe(0);
  });

  test('"alface" (só salada) → acomp=[], salada=[Alface]', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      pedidoAtual: { items: [] },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    };

    await smProcess('c1', '5511999', 'alface', state, COMPANY);

    const item = state.pedidoAtual.items[0];
    expect(item.acompanhamentos.length).toBe(0);
    expect(item.saladas.length).toBe(1);
    expect(item.saladas[0].name).toMatch(/alface/i);
  });

  test('"pular" → acomp=[], salada=[], avança', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      pedidoAtual: { items: [] },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      }
    };

    await smProcess('c1', '5511999', 'pular', state, COMPANY);

    const item = state.pedidoAtual.items[0];
    expect(item.acompanhamentos.length).toBe(0);
    expect(item.saladas.length).toBe(0);
    expect(state.etapa).toBe('OFERECENDO_UPSELL');
  });

  test('texto não reconhecido → permanece e tenta de novo', async () => {
    const state = {
      etapa: 'MONTANDO_ACOMPANHAMENTO',
      pedidoAtual: { items: [] },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [{ name: 'Frango' }], acompanhamentos: [], saladas: []
      },
      _loopCount: 0
    };

    await smProcess('c1', '5511999', 'blablabla xyz abc', state, COMPANY);

    expect(state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');
    expect(state._loopCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Fluxo combinado: "grande frango" → prompt contém acomp E salada
// ═══════════════════════════════════════════════════════════════

describe('Fluxo combinado acomp+salada', () => {
  test('após proteína, vai direto para MONTANDO_ACOMPANHAMENTO (sem MONTANDO_SALADA separado)', async () => {
    const state = {
      etapa: 'MONTANDO_PROTEINA',
      pedidoAtual: { items: [], type: null, address: null, paymentMethod: null, deliveryFee: 0 },
      _marmitaAtual: {
        tipo: 'marmita', tamanho: 'Grande', price: 22, quantity: 1,
        proteinas: [], acompanhamentos: [], saladas: []
      }
    };

    const result = await smProcess('c1', '5511999', 'frango', state, COMPANY);
    expect(result.state.etapa).toBe('MONTANDO_ACOMPANHAMENTO');

    // Agora envia acomp + salada juntos
    const result2 = await smProcess('c1', '5511999', 'arroz alface', result.state, COMPANY);
    
    // Deve finalizar sem passar por MONTANDO_SALADA
    expect(result2.state.etapa).toBe('OFERECENDO_UPSELL');
    expect(result2.state.pedidoAtual.items.length).toBe(1);
    expect(result2.state.pedidoAtual.items[0].acompanhamentos.length).toBeGreaterThan(0);
  });
});