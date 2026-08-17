// Ported from the working demo's parser: matches dealer name + product nicknames/qty
// from a pasted WhatsApp-style order message. No AI/GPT — plain regex + alias lookup,
// per the agreed spec (simple parser, not LLM-based, for now).

function normText(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function matchDealer(line, Dealer) {
  const norm = normText(line);
  if (!norm) return null;
  const dealers = await Dealer.find({ active: { $ne: false } });
  return dealers.find((d) => normText(d.name).includes(norm) || norm.includes(normText(d.name))) || null;
}

async function matchProduct(text, Product, Alias) {
  const norm = normText(text);
  if (!norm) return null;

  const alias = await Alias.findOne({ alias: norm });
  if (alias) {
    const p = await Product.findOne({ code: alias.code });
    if (p) return { p, via: 'alias' };
  }

  const products = await Product.find({ active: { $ne: false } });
  const exact = products.find((p) => normText(p.name) === norm || normText(p.code) === norm);
  if (exact) return { p: exact, via: 'exact' };

  const candidates = products.filter((p) => normText(p.name).includes(norm) || norm.includes(normText(p.name)));
  if (candidates.length === 1) return { p: candidates[0], via: 'fuzzy' };
  if (candidates.length > 1) return { via: 'ambiguous', cands: candidates };

  return null;
}

function parseQty(text, product) {
  const t = normText(text);
  let m = t.match(/(\d+(?:\.\d+)?)\s*(case|carton|cartoon|ctn|box|master)/);
  if (m) return { mode: 'outer', mult: parseFloat(m[1]) };
  if (/^(case|carton|cartoon|ctn|box|master)$/.test(t)) return { mode: 'outer', mult: 1 };
  m = t.match(/(\d+(?:\.\d+)?)\s*(inner|half)/);
  if (m) return { mode: 'inner', mult: parseFloat(m[1]) };
  if (/^(inner|half|half carton)$/.test(t)) return { mode: 'inner', mult: 1 };
  m = t.match(/(\d+(?:\.\d+)?)\s*(pc|pcs|piece|pieces|nos)/);
  if (m) {
    const qty = parseFloat(m[1]);
    if (product) {
      if (qty === product.cartonOuter) return { mode: 'outer', mult: 1 };
      if (qty === product.cartonInner) return { mode: 'inner', mult: 1 };
      if (product.cartonOuter && qty % product.cartonOuter === 0) return { mode: 'outer', mult: qty / product.cartonOuter };
      if (product.cartonInner && qty % product.cartonInner === 0) return { mode: 'inner', mult: qty / product.cartonInner };
    }
    return { mode: 'pcs', mult: qty };
  }
  m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) {
    const qty = parseFloat(m[1]);
    if (product) {
      if (qty === product.cartonOuter) return { mode: 'outer', mult: 1 };
      if (qty === product.cartonInner) return { mode: 'inner', mult: 1 };
    }
    return { mode: 'outer', mult: qty };
  }
  return null;
}

async function parseOrderText(text, { Dealer, Product, Alias }) {
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('Order needs a dealer line + at least one product line');

  let dealer = null, dealerLine = 0;
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const d = await matchDealer(lines[i], Dealer);
    if (d) { dealer = d; dealerLine = i; break; }
  }

  const itemLines = [];
  for (let i = dealerLine + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^order$/i.test(normText(l))) continue;
    if (/advance|payment|dalege|party$/i.test(l)) continue;
    if (l.length < 3) continue;
    itemLines.push(l);
  }

  const parsed = [];
  for (const line of itemLines) {
    let clean = line.replace(/^\s*\d+\s*[.)]\s*/, '').trim();
    let productText = clean, qtyText = '';
    const sep = clean.match(/^(.+?)[\s\-.:]+(\d[\d\s.a-zA-Z]*)$/);
    if (sep) { productText = sep[1].trim(); qtyText = sep[2].trim(); }
    const flip = clean.match(/^(\d+)\s*(case|carton|ctn|inner|pc|pcs|piece|nos|box)\s+(.+)$/i);
    if (flip) { qtyText = flip[1] + ' ' + flip[2]; productText = flip[3].trim(); }
    if (!qtyText) {
      const inline = clean.match(/(.+?)\s+(inner|half|carton|case|ctn|1 case|1 carton|1 ctn|\d+\s*(pc|pcs|piece|nos|case|carton|ctn|box|inner))/i);
      if (inline) { productText = inline[1].trim(); qtyText = inline[2].trim(); }
    }
    if (!qtyText && clean.includes('-')) {
      const parts = clean.split('-').map((x) => x.trim());
      productText = parts[0]; qtyText = parts.slice(1).join(' ');
    }

    const match = await matchProduct(productText, Product, Alias);
    if (!match || !match.p) {
      if (match && match.via === 'ambiguous') {
        parsed.push({ line, productText, qtyText, ambiguous: true, cands: match.cands.map((c) => c.code), error: `"${productText}" matches multiple SKUs — pick the right one.` });
      } else {
        parsed.push({ line, productText, qtyText, error: `Unknown product "${productText}" — add nickname or fix spelling.` });
      }
      continue;
    }
    const qty = parseQty(qtyText, match.p);
    if (!qty) { parsed.push({ line, productText, qtyText, product: match.p.code, error: `Could not read quantity "${qtyText}"` }); continue; }

    let pcs = 0;
    if (qty.mode === 'outer') pcs = qty.mult * match.p.cartonOuter;
    else if (qty.mode === 'inner') pcs = qty.mult * match.p.cartonInner;
    else pcs = qty.mult;

    if (qty.mode === 'pcs') {
      parsed.push({ line, productText, product: match.p.code, qty, pcs, error: `Quantity "${qty.mult} pcs" doesn't equal outer (${match.p.cartonOuter}) or inner (${match.p.cartonInner}) — clarify.` });
      continue;
    }

    parsed.push({
      line, productText, qtyText,
      product: match.p, // full product doc for line-building
      qty, pcs,
      outers: qty.mode === 'outer' ? qty.mult : 0,
      inners: qty.mode === 'inner' ? qty.mult : 0,
    });
  }

  return { dealer, dealerText: lines[dealerLine], lines: parsed };
}

module.exports = { parseOrderText, normText };
