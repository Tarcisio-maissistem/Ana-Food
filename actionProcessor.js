// actionProcessor.js
// ═══════════════════════════════════════════════════════════════
// Valida e normaliza a saída da IA antes de confiar nela.
// Garante que nomes, preços e estrutura correspondem ao CARDÁPIO real.
// ═══════════════════════════════════════════════════════════════

const { normalizar } = require('./aiInterpreter');

// ─── MATCH DE ITEM CONTRA CATÁLOGO ──────────────────────────────────────

/**
 * Tenta casar um nome vindo da IA com um item real do catálogo.
 * Retorna o item do catálogo se encontrado, ou null.
 */
function matchItemCatalog(nameFromAI, catalog) {
  if (!nameFromAI || !catalog || !Array.isArray(catalog)) return null;
  const norm = normalizar(nameFromAI);

  for (const item of catalog) {
    const itemNorm = normalizar(item.name);
    if (itemNorm === norm) return item;

    // Verifica apelidos
    const apelidos = item.apelidos ? item.apelidos.map(normalizar) : [];
    if (apelidos.includes(norm)) return item;

    // Substring match — "frango" casa com "Frango Grelhado" etc.
    if (itemNorm.includes(norm) || norm.includes(itemNorm)) return item;
  }

  return null;
}

// ─── VALIDAÇÃO DE FAST TRACK ────────────────────────────────────────────

/**
 * Valida o resultado do fast track contra o cardápio real.
 * Remove itens que não existem no cardápio e normaliza nomes.
 */
function processAction(ftResult, cardapio) {
  if (!ftResult || !ftResult.sucesso) return ftResult;

  // Valida tamanho
  if (!['Pequena', 'Grande'].includes(ftResult.tamanho)) {
    ftResult.sucesso = false;
    return ftResult;
  }

  // Valida e normaliza proteínas
  ftResult.proteinas = (ftResult.proteinas || [])
    .map(name => matchItemCatalog(name, cardapio.proteinas))
    .filter(Boolean)
    .map(item => item.name);

  // Valida e normaliza acompanhamentos
  ftResult.acompanhamentos = (ftResult.acompanhamentos || [])
    .map(name => matchItemCatalog(name, cardapio.acompanhamentos))
    .filter(Boolean)
    .map(item => item.name);

  // Valida e normaliza saladas
  ftResult.saladas = (ftResult.saladas || [])
    .map(name => matchItemCatalog(name, cardapio.saladas))
    .filter(Boolean)
    .map(item => item.name);

  // Se a IA retornou proteínas mas nenhuma bateu com o catálogo, invalida
  if (ftResult.proteinas.length === 0) {
    ftResult.sucesso = false;
  }

  return ftResult;
}

// ─── VALIDAÇÃO DE MODIFICAÇÃO ───────────────────────────────────────────

/**
 * Valida itens modificados pela IA contra o cardápio.
 * Corrige nomes e preços para os valores reais do catálogo.
 * Retorna null se a modificação for inválida.
 */
function processModification(itensModificados, cardapio) {
  if (!itensModificados || !Array.isArray(itensModificados)) return null;
  if (itensModificados.length === 0) return null;

  const allCatalog = [
    ...cardapio.proteinas,
    ...cardapio.acompanhamentos,
    ...cardapio.saladas,
    ...cardapio.upsellsBebida,
    ...(cardapio.upsellsSobremesa || [])
  ];

  for (const item of itensModificados) {
    // Marmitas: valida proteínas, acompanhamentos e saladas internas
    if (item.tipo === 'marmita') {
      if (item.proteinas) {
        item.proteinas = item.proteinas
          .map(p => {
            const match = matchItemCatalog(p.name || p, cardapio.proteinas);
            return match ? { name: match.name } : null;
          })
          .filter(Boolean);
      }
      if (item.acompanhamentos) {
        item.acompanhamentos = item.acompanhamentos
          .map(a => {
            const match = matchItemCatalog(a.name || a, cardapio.acompanhamentos);
            return match ? { name: match.name } : null;
          })
          .filter(Boolean);
      }
      if (item.saladas) {
        item.saladas = item.saladas
          .map(s => {
            const match = matchItemCatalog(s.name || s, cardapio.saladas);
            return match ? { name: match.name } : null;
          })
          .filter(Boolean);
      }

      // Corrige preço da marmita baseado no tamanho
      if (item.tamanho === 'Grande') item.price = 22;
      else if (item.tamanho === 'Pequena') item.price = 20;
    }

    // Extras: valida nome e corrige preço
    if (item.tipo === 'extra') {
      const match = matchItemCatalog(item.name, allCatalog);
      if (!match) return null; // Item extra desconhecido — rejeita toda a modificação
      item.name = match.name;
      if (match.price) item.price = match.price;
    }

    // Garante quantity válida
    if (!item.quantity || item.quantity < 1) item.quantity = 1;
  }

  return itensModificados;
}

module.exports = {
  matchItemCatalog,
  processAction,
  processModification
};
