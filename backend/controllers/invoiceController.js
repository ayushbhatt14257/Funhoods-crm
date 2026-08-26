const XLSX = require('xlsx');
const Invoice = require('../models/Invoice');
const Dealer = require('../models/Dealer');

async function list(req, res) {
  const { q, status, by, dealer, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (dealer) filter.dealer = dealer;
  if (by) filter.by = by;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(new Date(to).getTime() + 86399999);
  }
  if (q) filter.$or = [{ no: new RegExp(q, 'i') }, { dealerName: new RegExp(q, 'i') }];
  if (['field', 'mhead'].includes(req.user.role)) {
    const myDealers = await Dealer.find({ assignedTo: req.user.name }).select('code');
    filter.dealer = { $in: myDealers.map((d) => d.code) };
  }
  const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
  res.json(invoices);
}

async function getOne(req, res) {
  const inv = await Invoice.findOne({ no: req.params.no });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });
  res.json(inv);
}

async function markDelivered(req, res) {
  const inv = await Invoice.findOneAndUpdate(
    { no: req.params.no },
    { status: 'Delivered', deliveredDate: new Date() },
    { new: true }
  );
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });
  res.json(inv);
}

// GET /api/invoices/:no/packing-list.xlsx
async function packingListExcel(req, res) {
  const inv = await Invoice.findOne({ no: req.params.no });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });

  const rows = [['Carton #', 'Product Code', 'Product Name', 'Pieces', 'Mixed Carton?']];
  inv.packing.forEach((c) => {
    c.items.forEach((it) => rows.push([c.no, it.code, it.name, it.pcs, c.mixed ? 'Yes' : 'No']));
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Packing List');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename=Packing_List_${inv.no}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

module.exports = { list, getOne, markDelivered, packingListExcel };
