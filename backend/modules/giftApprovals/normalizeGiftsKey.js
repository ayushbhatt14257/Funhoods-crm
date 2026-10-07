// Builds a deterministic string from a dispatch request's raw `gifts` array
// so the SAME gift selection can be recognized again later — once when the
// approval request is created, and again when the dispatch is resubmitted
// after approval. Shared between dispatch/controller.js and
// giftApprovals/controller.js so both sides compute it identically.
function normalizeGiftsKey(gifts) {
  const parts = (gifts || []).map((g) =>
    g.custom
      ? `custom:${(g.name || '').trim().toLowerCase()}:${+g.worth || 0}`
      : `${(g.code || '').trim().toUpperCase()}:${+g.outers || 0}:${+g.inners || 0}:${+g.directPcs || 0}`
  );
  return parts.sort().join('|');
}

module.exports = { normalizeGiftsKey };
