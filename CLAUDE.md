# CLAUDE.md — Ana Food: Reestruturação Híbrida

## MISSÃO
Reestruturar o sistema de atendimento como **híbrido determinístico + IA**:
- **Código** controla o fluxo e decisões (sempre)
- **IA** apenas humaniza o texto da resposta (nunca decide)
- **Banco** fornece memória de clientes e cardápio do dia
- **Cache 24h** elimina custo repetido do system prompt

---

## FASE 1 — DIAGNÓSTICO (obrigatório antes de codar)

1. Leia todos os arquivos em `plugins/marmitaria/`
2. Localize e leia: `aiInterpreter.js`, `stateMachine.js`, `actionProcessor.js`, `templates.js`
3. Conecte ao banco `postgres:root@localhost:5432` (banco: `evolution`) e execute:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '<cada_tabela>';
```
4. **Escreva `DIAGNOSTICO.md`** com: fluxo atual, o que a IA faz hoje, tabelas existentes, o que falta.
5. Só avance para a Fase 2 após o diagnóstico estar completo.

---

## FASE 2 — ARQUITETURA A IMPLEMENTAR

```
CÓDIGO decide → passa instrução estruturada → IA humaniza → retorna string
```

### O humanizador recebe instrução, não pergunta aberta:
```js
// ❌ ERRADO
ia.perguntar("cliente disse: " + msg)

// ✅ CERTO
humanizador.gerar({
  instrucao: 'PEDIR_PROTEINA',
  dados: { tamanho: 'Grande', opcoes: [...], cliente_nome: 'João', ultimo_pedido: 'Frango' },
  contexto: { periodo: 'almoco', temPressa: false }
})
```

### Novos arquivos a criar:
- `plugins/marmitaria/aiPrompt.js` — humanizador com cache 24h
- `services/clienteService.js` — busca/salva contexto do cliente no banco
- `services/cardapioService.js` — cardápio do dia vindo do banco
- `migrations/001_memoria_clientes.sql` — tabelas novas

---

## FASE 3 — BANCO: TABELAS A CRIAR

```sql
CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  whatsapp VARCHAR(20) UNIQUE NOT NULL,
  nome VARCHAR(100),
  total_pedidos INTEGER DEFAULT 0,
  ultimo_pedido_at TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  resumo JSONB NOT NULL,
  total DECIMAL(10,2),
  tipo VARCHAR(20),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cardapio_dia (
  id SERIAL PRIMARY KEY,
  data DATE DEFAULT CURRENT_DATE,
  tipo VARCHAR(30) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  preco DECIMAL(10,2),
  disponivel BOOLEAN DEFAULT TRUE
);
```

---

## FASE 4 — CACHE 24H (aiPrompt.js)

Regras obrigatórias:
- System prompt estático: **mínimo 1024 tokens** (`texto.length / 4 > 1024`)
- Cardápio do dia: injetar como `user/assistant`, nunca no system prompt
- Sempre usar: `prompt_cache_key: 'ana-food-v1'` e `prompt_cache_retention: '24h'`
- Logar `usage.prompt_tokens_details.cached_tokens` em todo request

---

## REGRAS

**Fazer:**
- Diagnóstico completo antes de qualquer mudança
- `index.js` permanece código puro — sem chamadas IA dentro do state machine
- CommonJS (`require`/`module.exports`) — sem TypeScript
- Arquivos completos, não trechos

**Não fazer:**
- Não reescrever o que já funciona
- Não instalar dependências sem checar `package.json`
- Não alterar banco sem criar migration SQL primeiro

---

## CRITÉRIO DE SUCESSO
- [ ] Pedido completo possível sem IA (fluxo determinístico)
- [ ] IA só humaniza respostas já decididas pelo código
- [ ] 2º atendimento do dia: >70% tokens cacheados
- [ ] Cliente recorrente é reconhecido e personalizado
- [ ] Cardápio vem do banco, não do arquivo estático