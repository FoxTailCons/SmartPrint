import { Router } from 'express';
import CashSession from '../models/CashSession.js';
import Order from '../models/Order.js';
import { protect } from '../middleware/auth.js';

const methods = ['dinheiro', 'pix', 'debito', 'credito', 'parcelado'];
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
  if (error?.name === 'VersionError') return res.status(409).json({ message: 'O caixa foi atualizado por outra operação; recarregue antes de continuar' });
  return next(error);
});

export const getSaoPauloDateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

export const isValidDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value;

export const getSaoPauloDayRange = (dateKey) => {
  const start = new Date(`${dateKey}T03:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86400000) };
};

export const buildCashReport = (session, orders, dateKey) => {
  const { start, end } = getSaoPauloDayRange(dateKey);
  const calculatedInflows = Object.fromEntries(methods.map((method) => [method, 0]));
  for (const order of orders) {
    const paymentEntries = order.payments?.length ? order.payments : (order.history || [])
      .filter((entry) => entry.action === 'pagamento')
      .map((entry) => {
        const match = String(entry.note || '').match(/(?:Recebido|no valor de)\s+(?:R\$\s*)?([\d.,]+)/i);
        if (!match) return null;
        const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(amount) ? { amount, method: entry.paymentMethod || '', paidAt: entry.at } : null;
      })
      .filter(Boolean);
    for (const payment of paymentEntries) {
      const paidAt = new Date(payment.paidAt || 0);
      if (paidAt < start || paidAt >= end) continue;
      if (methods.includes(payment.method)) calculatedInflows[payment.method] += Number(payment.amount || 0);
    }
  }
  const inflows = session.status === 'closed' && session.inflows ? session.inflows : calculatedInflows;
  const withdrawals = (session.withdrawals || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expected = session.status === 'closed' && session.expected
    ? session.expected
    : { ...inflows, dinheiro: inflows.dinheiro + Number(session.openingAmount || 0) - withdrawals };
  const counted = session.counted || null;
  const differences = counted ? Object.fromEntries(methods.map((method) => [method, Number(counted[method] || 0) - expected[method]])) : null;
  return {
    dateKey,
    openingAmount: Number(session.openingAmount || 0),
    inflows,
    withdrawals,
    withdrawalDetails: (session.withdrawals || []).map(({ amount, note, createdAt }) => ({ amount, note, createdAt })),
    expected,
    counted,
    differences,
  };
};

const router = Router();
router.use(protect);
router.use((req, res, next) => req.user?.role === 'admin' || req.user?.role === 'atendente'
  ? next()
  : res.status(403).json({ message: 'Acesso restrito ao balcão' }));

const findSession = async (dateKey) => CashSession.findOne({ dateKey });
const getReport = async (session, dateKey) => {
  const { start, end } = getSaoPauloDayRange(dateKey);
  const orders = await Order.find({
    $or: [{ 'payments.paidAt': { $gte: start, $lt: end } }, { 'history.at': { $gte: start, $lt: end } }],
  }).select('payments history');
  return buildCashReport(session, orders, dateKey);
};

router.get('/current', asyncRoute(async (req, res) => {
  const dateKey = getSaoPauloDateKey();
  const session = await findSession(dateKey);
  return res.json({ dateKey, isToday: true, session, report: session ? await getReport(session, dateKey) : null });
}));

router.get('/:dateKey', asyncRoute(async (req, res) => {
  const { dateKey } = req.params;
  if (!isValidDateKey(dateKey)) return res.status(400).json({ message: 'Data inválida' });
  const session = await findSession(dateKey);
  if (!session) return res.status(404).json({ message: 'Não existe fechamento para a data informada' });
  return res.json({ dateKey, isToday: dateKey === getSaoPauloDateKey(), session, report: await getReport(session, dateKey) });
}));

router.post('/open', asyncRoute(async (req, res) => {
  const openingAmount = req.body?.openingAmount;
  if (typeof openingAmount !== 'number' || !Number.isFinite(openingAmount) || openingAmount < 0) {
    return res.status(400).json({ message: 'Informe um valor inicial válido para o caixa' });
  }
  const dateKey = getSaoPauloDateKey();
  if (await findSession(dateKey)) return res.status(409).json({ message: 'O caixa de hoje já foi aberto ou fechado' });
  try {
    const session = await CashSession.create({ dateKey, openingAmount, openedBy: req.user._id });
    return res.status(201).json({ session, report: await getReport(session, dateKey) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'O caixa de hoje já foi aberto' });
    throw error;
  }
}));

router.post('/withdrawals', asyncRoute(async (req, res) => {
  const dateKey = getSaoPauloDateKey();
  const session = await findSession(dateKey);
  if (!session || session.status !== 'open') return res.status(409).json({ message: 'Abra o caixa antes de registrar uma sangria' });
  const amount = req.body?.amount;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !note) {
    return res.status(400).json({ message: 'Informe valor positivo e motivo da sangria' });
  }
  const currentReport = await getReport(session, dateKey);
  if (amount > currentReport.expected.dinheiro + 0.01) return res.status(400).json({ message: 'A sangria não pode exceder o dinheiro esperado em caixa' });
  session.withdrawals.push({ amount, note, createdBy: req.user._id });
  await session.save();
  return res.json({ session, report: await getReport(session, dateKey) });
}));

router.post('/close', asyncRoute(async (req, res) => {
  const dateKey = getSaoPauloDateKey();
  const session = await findSession(dateKey);
  if (!session || session.status !== 'open') return res.status(409).json({ message: 'Não há caixa aberto para fechar' });
  const counted = req.body?.counted;
  if (!counted || methods.some((method) => typeof counted[method] !== 'number' || !Number.isFinite(counted[method]) || counted[method] < 0)) {
    return res.status(400).json({ message: 'Informe a conferência não negativa de todas as formas de pagamento' });
  }
  const report = await getReport(session, dateKey);
  session.counted = Object.fromEntries(methods.map((method) => [method, counted[method]]));
  session.inflows = report.inflows;
  session.expected = report.expected;
  session.differences = Object.fromEntries(methods.map((method) => [method, counted[method] - report.expected[method]]));
  session.status = 'closed';
  session.closedBy = req.user._id;
  session.closedAt = new Date();
  await session.save();
  return res.json({ session, report: { ...report, counted: session.counted, differences: session.differences } });
}));

export default router;
