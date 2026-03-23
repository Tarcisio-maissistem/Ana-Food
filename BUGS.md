# ANÁLISE DE BUGS — AGENTE ANA

## BUGS CRÍTICOS (causam valor errado ou quebra de fluxo)

### BUG #1 — Double-counting de extras ⚠️ FINANCEIRO
Arquivo: stateMachine.js linha 185 + 435

```js
// linha 185 — modifica o preço base do item
item.price += extra.price;  // X-Burger vai de 25 → 28

// linha 435 — soma extras DE NOVO sobre o preço já modificado
(Number(item.price) + extrasTotal) * item.quantity
//   (28 + 3) * 1 = R$ 31 — deveria ser R$ 28
```

Impacto: cliente pagaria R$ 3,00 a mais por extra.

---

### BUG #2 — sendCardapio chamada com companyId null
Arquivo: stateMachine.js linha 115

```js
// Assinatura real: sendCardapio(companyId, state, greeting)
return sendCardapio(null, state, 'Tudo bem!...', state._companyId);
//                  ^^^^                          ^^^^^^^^^^^^^^
//          companyId = null            4º arg ignorado pela função
```

Impacto: cardápio retorna vazio quando cliente rejeita repetição de pedido.

---

### BUG #3 — _productsCache stale no Redis
Arquivo: stateMachine.js linhas 137, 200, 213

Produtos são salvos no estado Redis. Se um produto for desativado
no banco, o cache ainda oferece ele ao cliente. Além disso, ocupa
memória significativa no Redis por 2 horas.

---

### BUG #4 — Subtotal errado em askContinueOrFinish
Arquivo: stateMachine.js linha 530

```js
// Não inclui extras no subtotal mostrado ao cliente
const subtotal = state.pedidoAtual.items.reduce(
  (acc, i) => acc + (Number(i.price) * i.quantity), 0
);
```

Impacto: cliente vê subtotal menor do que o real durante a montagem.

---

### BUG #5 — Falso positivo em interpretConfirmation
Arquivo: aiInterpreter.js linha 19

```js
if (positivos.some(p => lower.includes(p))) return 'sim';
// "sim" está na lista
// "assim" → includes("sim") → TRUE → retorna 'sim' ❌
// "isso" → ok, mas "isso mesmo" também está na lista

if (negativos.some(n => lower.includes(n))) return 'nao';
// "n" está na lista
// "bom" → includes("n")? não, mas "tem" → não... 
// "cancelar" → includes("cancela") → ok
// "nao" → ok mas "não sei" → includes("não") → 'nao' quando cliente está incerto
```

Impacto: confirmações e negações incorretas em frases compostas.

---

### BUG #6 — Race condition na seleção de extras
Arquivo: stateMachine.js linha 178

```js
if (confirmacao === 'sim' || text.match(/\d/)) {
  const extraIdx = parseInt(text.trim()) - 1;
```

Se cliente digita "Não quero 1" (negando com número no texto):
- `interpretConfirmation` retorna 'nao' → confirmacao !== 'sim' ✓
- `text.match(/\d/)` → TRUE (tem o "1") ❌ → adiciona extra errado

---

### BUG #7 — buildOrderSummary preço inconsistente
Arquivo: stateMachine.js linha 443

```js
// item.price foi modificado para incluir extras (BUG #1)
texto += `${item.quantity}x ${item.name} – R$ ${(Number(item.price) * item.quantity).toFixed(2)}\n`;
// E depois mostra extras separados:
texto += item.extras.map(e => `   + ${e.name}`).join('\n') + '\n';
// → preço já inclui extra, mas visual mostra como se fosse adicional
```

---

### BUG #8 — interpretQuantity captura número errado
Arquivo: aiInterpreter.js linha 68

```js
const numMatch = lower.match(/\b(\d+)\b/);
// "quero o 2 com queijo extra no 3" → captura "2", ok
// "X-Burger 1 com queijo no prato 3" → captura "1", ok
// "quero o número 15" → captura "15" como quantidade ❌ (produto #15 inexistente)
```

---

## PROBLEMAS DE PADRÃO

### P1 — Mensagens hardcoded em 12 lugares diferentes
Impossível garantir tom consistente. Qualquer ajuste requer varredura
em todo o arquivo.

### P2 — Sem logs estruturados
Apenas console.log soltos. Impossível monitorar em produção, rastrear
erros ou auditar pedidos.

### P3 — Sem validação de entrada no webhook
Texto vazio, muito longo (> 500 chars), apenas emojis, scripts
injetados — nada é filtrado antes de chegar na stateMachine.

### P4 — Nomenclatura inconsistente
Estado usa `paymentMethod` (camelCase).
Banco retorna `payment_method` (snake_case).
Isso causa comparações que silenciosamente falham.

### P5 — _currentProduct pode ser undefined
Em handleMontandoPedido fase 1, `state._currentProduct` é lido
sem verificar se existe (pode ter expirado junto com o TTL Redis).
