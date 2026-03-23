/**
 * Testes dos skills de humanização: ecoResponse e smartSuggestion
 */

const ecoResponse = require('./src/skills/ecoResponse');
const smartSuggestion = require('./src/skills/smartSuggestion');

describe('ecoResponse', () => {
  describe('gerarEco', () => {
    test('proteína simples', () => {
      expect(ecoResponse.gerarEco(['Frango'], 'proteina')).toBe('Frango 👍');
    });

    test('proteínas múltiplas', () => {
      expect(ecoResponse.gerarEco(['Frango', 'Churrasco'], 'proteina')).toBe('Frango + Churrasco 👍');
    });

    test('acompanhamentos', () => {
      expect(ecoResponse.gerarEco(['Arroz', 'Feijão'], 'acompanhamento')).toBe('Arroz + Feijão ✅');
    });

    test('salada', () => {
      expect(ecoResponse.gerarEco(['Maionese'], 'salada')).toBe('Maionese 🥗');
    });

    test('array vazio retorna string vazia', () => {
      expect(ecoResponse.gerarEco([], 'proteina')).toBe('');
    });

    test('aceita objetos com .name', () => {
      expect(ecoResponse.gerarEco([{ name: 'Frango' }], 'proteina')).toBe('Frango 👍');
    });
  });

  describe('gerarEcoGrupos', () => {
    test('grupos múltiplos', () => {
      const grupos = [
        { tamanho: 'Grande', qty: 3 },
        { tamanho: 'Pequena', qty: 1 }
      ];
      expect(ecoResponse.gerarEcoGrupos(grupos)).toBe('✅ 3 Grandes + 1 Pequena = 4 marmita(s)');
    });

    test('grupo único', () => {
      const grupos = [{ tamanho: 'Grande', qty: 2 }];
      expect(ecoResponse.gerarEcoGrupos(grupos)).toBe('✅ 2 Grandes = 2 marmita(s)');
    });
  });

  describe('combinarEcoEPergunta', () => {
    test('combina eco e pergunta', () => {
      const result = ecoResponse.combinarEcoEPergunta('Frango 👍', 'Acompanhamentos?');
      expect(result).toBe('Frango 👍\n\nAcompanhamentos?');
    });

    test('só pergunta se eco vazio', () => {
      const result = ecoResponse.combinarEcoEPergunta('', 'Acompanhamentos?');
      expect(result).toBe('Acompanhamentos?');
    });
  });
});

describe('smartSuggestion', () => {
  describe('sugerirAcompanhamento', () => {
    test('sugere para Churrasco', () => {
      const sug = smartSuggestion.sugerirAcompanhamento(['Churrasco']);
      expect(sug).not.toBeNull();
      expect(sug.sugestao).toEqual(['Arroz', 'Feijão']);
      expect(sug.mensagem).toContain('clássico com churrasco');
    });

    test('sugere para Frango', () => {
      const sug = smartSuggestion.sugerirAcompanhamento(['Frango']);
      expect(sug).not.toBeNull();
      expect(sug.sugestao).toEqual(['Arroz', 'Purê']);
    });

    test('sugere para Costela', () => {
      const sug = smartSuggestion.sugerirAcompanhamento(['Costela']);
      expect(sug).not.toBeNull();
      expect(sug.sugestao).toContain('Tropeiro');
    });

    test('retorna null se sem proteína', () => {
      const sug = smartSuggestion.sugerirAcompanhamento([]);
      expect(sug).toBeNull();
    });

    test('aceita objetos com .name', () => {
      const sug = smartSuggestion.sugerirAcompanhamento([{ name: 'Churrasco' }]);
      expect(sug).not.toBeNull();
      expect(sug.sugestao).toEqual(['Arroz', 'Feijão']);
    });
  });

  describe('detectarAceitacaoSugestao', () => {
    test('detecta "sim"', () => {
      expect(smartSuggestion.detectarAceitacaoSugestao('sim')).toBe(true);
    });

    test('detecta "pode"', () => {
      expect(smartSuggestion.detectarAceitacaoSugestao('pode')).toBe(true);
    });

    test('detecta "isso"', () => {
      expect(smartSuggestion.detectarAceitacaoSugestao('isso')).toBe(true);
    });

    test('detecta "beleza"', () => {
      expect(smartSuggestion.detectarAceitacaoSugestao('beleza')).toBe(true);
    });

    test('não detecta frases longas', () => {
      expect(smartSuggestion.detectarAceitacaoSugestao('sim mas quero outro')).toBe(false);
    });

    test('não detecta negação', () => {
      expect(smartSuggestion.detectarAceitacaoSugestao('não')).toBe(false);
    });
  });

  describe('detectarRejeicaoSugestao', () => {
    test('detecta "não"', () => {
      expect(smartSuggestion.detectarRejeicaoSugestao('não')).toBe(true);
    });

    test('detecta "outro"', () => {
      expect(smartSuggestion.detectarRejeicaoSugestao('outro')).toBe(true);
    });

    test('detecta "prefiro"', () => {
      expect(smartSuggestion.detectarRejeicaoSugestao('prefiro macarrão')).toBe(true);
    });
  });

  describe('sugerirMaisPedidos', () => {
    test('sugere acompanhamento padrão', () => {
      const sug = smartSuggestion.sugerirMaisPedidos('acompanhamento');
      expect(sug.sugestao).toEqual(['Arroz', 'Feijão']);
      expect(sug.mensagem).toContain('mais pedidos');
    });

    test('sugere salada padrão', () => {
      const sug = smartSuggestion.sugerirMaisPedidos('salada');
      expect(sug.sugestao).toEqual(['Maionese']);
    });
  });
});
