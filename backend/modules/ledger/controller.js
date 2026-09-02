const Ledger = require('./model');
const Dealer = require('../dealers/model');

// GET /api/ledger?dealer=CODE — entries for one dealer, running balance included
async function forDealer(req, res) {
  const code = req.params.code.toUpperCase();
  const dealer = await Dealer.findOne({ code });
  if (!dealer) return res.status(404).json({ message: 'Dealer not found' });

  const rows = await Ledger.find({ dealer: code }).sort({ date: 1 });
  let bal = 0;
  const withBalance = rows.map((l) => {
    bal += (l.debit || 0) - (l.credit || 0);
    return { ...l.toObject(), balance: bal };
  });
  res.json({ dealer, entries: withBalance, balance: bal });
}

// GET /api/ledger/balances — every dealer's current outstanding, for dashboard/ageing
async function allBalances(req, res) {
  const dealers = await Dealer.find();
  const rows = await Promise.all(
    dealers.map(async (d) => {
      const entries = await Ledger.find({ dealer: d.code });
      const balance = entries.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
      const invoiceDates = entries.filter((l) => l.debit > 0).map((l) => l.date);
      const oldestInvoiceAgeDays = invoiceDates.length
        ? Math.floor((Date.now() - new Date(Math.min(...invoiceDates))) / 86400000)
        : 0;
      return { code: d.code, name: d.name, city: d.city, balance, oldestInvoiceAgeDays };
    })
  );
  res.json(rows.filter((r) => r.balance !== 0));
}

// POST /api/ledger/payment  { dealerCode, amount, mode, ref, invoiceNo?, date? }
async function recordPayment(req, res) {
  const { dealerCode, amount, mode, ref, invoiceNo, date } = req.body;
  const dealer = await Dealer.findOne({ code: dealerCode });
  if (!dealer) return res.status(400).json({ message: 'Dealer not found' });
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Amount required' });

  const entry = await Ledger.create({
    date: date || new Date(),
    dealer: dealer.code,
    type: 'Payment',
    ref: ref || invoiceNo || '—',
    debit: 0,
    credit: +amount,
    note: mode ? `Payment · ${mode}` : '',
  });
  res.status(201).json(entry);
}

module.exports = { forDealer, allBalances, recordPayment };
