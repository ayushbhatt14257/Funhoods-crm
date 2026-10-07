const GiftApproval = require('./model');
const Notification = require('../notifications/model');
const { normalizeGiftsKey } = require('./normalizeGiftsKey');

// POST /api/gift-approvals — called by the dispatch screen right after a
// dispatch attempt is rejected for needing gift approval (see
// dispatch/controller.js). Upserts on (dealer, giftsKey, status: pending) so
// repeatedly clicking "Send for approval" on the same gift selection doesn't
// pile up duplicate pending requests.
async function create(req, res) {
  const { dealer, dealerName, gifts } = req.body;
  if (!dealer) return res.status(400).json({ message: 'Dealer is required' });
  if (!Array.isArray(gifts) || !gifts.length) return res.status(400).json({ message: 'No gifts to approve' });

  const giftsKey = normalizeGiftsKey(gifts);
  let request = await GiftApproval.findOne({ dealer, giftsKey, status: 'pending' });
  if (!request) {
    request = await GiftApproval.create({
      dealer, dealerName, gifts, giftsKey, requestedBy: req.user.name, status: 'pending',
    });
    await Notification.create({
      type: 'other', // no dedicated enum value for this yet — see notifications/model.js
      message: `${req.user.name} requested gift approval for ${dealerName || dealer}.`,
      relatedNo: dealer,
      byUser: req.user.name,
      forRole: 'masterAdmin',
    });
  }
  res.status(201).json(request);
}

// GET /api/gift-approvals/pending — masterAdmin only, for the Approvals page.
async function listPending(req, res) {
  const requests = await GiftApproval.find({ status: 'pending' }).sort({ createdAt: -1 });
  res.json(requests);
}

// POST /api/gift-approvals/:id/approve — masterAdmin only. Does NOT complete
// any dispatch itself — it only flips the status so the next matching
// dispatch attempt (same dealer + same exact gifts) is allowed through. See
// dispatchFromPool, which marks this 'used' the moment it actually succeeds.
async function approve(req, res) {
  const request = await GiftApproval.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Gift approval request not found' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'Already decided' });
  request.status = 'approved';
  request.decidedBy = req.user.name;
  request.decidedAt = new Date();
  await request.save();
  res.json(request);
}

module.exports = { create, listPending, approve };
