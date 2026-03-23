// validator.test.js
// ═══════════════════════════════════════════════════════════════
// Testes para validações de entrada — endereço, nome, quantidade.
// ═══════════════════════════════════════════════════════════════

const {
    validateEndereco,
    validateNome,
    validateQuantity,
    validateMessage,
    validatePhone
} = require('./validator');

// ═══════════════════════════════════════════════════════════════════════════════
// Endereço — "Rua das Flores" sem número deve ser rejeitado
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateEndereco', () => {
    test('❌ "Rua das Flores" (sem número) deve ser rejeitado', () => {
        const result = validateEndereco('Rua das Flores');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('endereco_no_number');
    });

    test('❌ endereço curto demais', () => {
        const result = validateEndereco('Rua 1');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('endereco_too_short');
    });

    test('❌ endereço vazio', () => {
        const result = validateEndereco('');
        expect(result.valid).toBe(false);
    });

    test('❌ endereço null', () => {
        const result = validateEndereco(null);
        expect(result.valid).toBe(false);
    });

    test('✅ "Rua das Flores, 123, Centro" deve aceitar', () => {
        const result = validateEndereco('Rua das Flores, 123, Centro');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('Rua das Flores, 123, Centro');
    });

    test('✅ "Av Brasil 500, apto 201, Copacabana" deve aceitar', () => {
        const result = validateEndereco('Av Brasil 500, apto 201, Copacabana');
        expect(result.valid).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Nome — validação de nome do cliente
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateNome', () => {
    test('✅ "João" deve aceitar', () => {
        const result = validateNome('João');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('João');
    });

    test('✅ "Maria Silva" deve aceitar', () => {
        const result = validateNome('Maria Silva');
        expect(result.valid).toBe(true);
    });

    test('❌ "A" (1 char) deve rejeitar', () => {
        const result = validateNome('A');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('nome_too_short');
    });

    test('❌ "123" (sem letras) deve rejeitar', () => {
        const result = validateNome('123');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('nome_no_letters');
    });

    test('❌ null deve rejeitar', () => {
        const result = validateNome(null);
        expect(result.valid).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Quantidade — range 1 a 50
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateQuantity', () => {
    test('✅ 1 é válido', () => {
        expect(validateQuantity(1).valid).toBe(true);
    });

    test('✅ 50 é válido (limite)', () => {
        expect(validateQuantity(50).valid).toBe(true);
    });

    test('❌ 0 é inválido', () => {
        expect(validateQuantity(0).valid).toBe(false);
    });

    test('❌ 51 é inválido', () => {
        expect(validateQuantity(51).valid).toBe(false);
    });

    test('❌ null é inválido', () => {
        expect(validateQuantity(null).valid).toBe(false);
    });

    test('❌ 1.5 (não inteiro) é inválido', () => {
        expect(validateQuantity(1.5).valid).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mensagem — validação de texto de entrada
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMessage', () => {
    test('✅ texto normal deve aceitar', () => {
        const result = validateMessage('quero um x-burger');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('quero um x-burger');
    });

    test('❌ texto vazio deve rejeitar', () => {
        expect(validateMessage('').valid).toBe(false);
    });

    test('❌ apenas emojis deve rejeitar', () => {
        expect(validateMessage('😊👍🎉').valid).toBe(false);
    });

    test('❌ texto muito longo (>500) deve rejeitar', () => {
        const long = 'a'.repeat(501);
        expect(validateMessage(long).valid).toBe(false);
    });

    test('✅ "1" deve aceitar (número é alfanumérico)', () => {
        expect(validateMessage('1').valid).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Telefone — validação básica
// ═══════════════════════════════════════════════════════════════════════════════

describe('validatePhone', () => {
    test('✅ "5511999998888" deve aceitar', () => {
        const result = validatePhone('5511999998888');
        expect(result.valid).toBe(true);
    });

    test('❌ "123" (curto demais) deve rejeitar', () => {
        expect(validatePhone('123').valid).toBe(false);
    });

    test('❌ vazio deve rejeitar', () => {
        expect(validatePhone('').valid).toBe(false);
    });
});
