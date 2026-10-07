const mongoose = require('mongoose');

// One gift line as the dispatch screen submitted it — mirrors the shape
// Dispatch.jsx sends (see dispatch/controller.js buildGiftLines): either a
// custom (non-catalog) gift, or a catalog product gift by code + the
// outer/inner/direct-pcs split that was staged.
const giftLineSchema = new mongoose.Schema(
  {
    custom: { type: Boolean, default: false },
    name: String,
    worth: Number,
    code: String,
    outers: Number,
    inners: Number,
    directPcs: Number,
  },
  { _id: false }
);

// Created whenever a non-masterAdmin tries to dispatch with a gift attached
// — the whole dispatch is blocked until Master Admin approves this exact
// set of gifts for this dealer (see dispatch/controller.js dispatchFromPool,
// and giftApprovals/controller.js for the matching key). Once approved, the
// SAME gifts must be resubmitted from the dispatch screen to actually go
// out — approving here does not auto-complete the dispatch, it only
// unblocks the next attempt (status flips to 'used' the moment that
// dispatch succeeds, so one approval can't silently cover a different,
// later gift selection).
const giftApprovalSchema = new mongoose.Schema(
  {
    dealer: { type: String, required: true }, // Dealer.code
    dealerName: String,
    gifts: [giftLineSchema],
    // Deterministic string built from `gifts` (see normalizeGiftsKey) —
    // how an approval is matched back to a later dispatch attempt without
    // doing a deep-equality check against a live request every time.
    giftsKey: { type: String, required: true },
    requestedBy: String,
    status: { type: String, enum: ['pending', 'approved', 'used'], default: 'pending' },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

giftApprovalSchema.index({ dealer: 1, status: 1, giftsKey: 1 });

module.exports = mongoose.model('GiftApproval', giftApprovalSchema);
