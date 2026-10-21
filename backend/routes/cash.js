import { Router } from 'express';
import CashSession from '../models/CashSession.js';
import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';
import { protect, allowRoles } from '../middleware/auth.js';
import { recordAuditEvent } from '../services/auditLog.js';
import { getSaoPauloDateKey, getSaoPauloDayRange, isValidDateKey } from '../services/calendarDate.js';

export { getSaoPauloDateKey, getSaoPauloDayRange, isValidDateKey };

const methods = ['dinheiro', 'pix', 'debito', 'credito', 'parcelado'];
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
  if (error?.name === 'VersionError') return res.status(409).json({ message: 'O caixa foi atualizado por outra operação; recarregue antes de continuar' });
  return next(error);
});

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
  const supplies = (session.supplies || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expected = session.status === 'closed' && session.expected
    ? session.expected
    : { ...inflows, dinheiro: inflows.dinheiro + Number(session.openingAmount || 0) + supplies - withdrawals };
  const counted = session.counted || null;
  const differences = counted ? Object.fromEntries(methods.map((method) => [method, Number(counted[method] || 0) - expected[method]])) : null;
  return {
    dateKey,
    openingAmount: Number(session.openingAmount || 0),
    inflows,
    supplies,
    supplyDetails: (session.supplies || []).map(({ amount, note, createdAt }) => ({ amount, note, createdAt })),
    withdrawals,
    withdrawalDetails: (session.withdrawals || []).map(({ amount, note, createdAt }) => ({ amount, note, createdAt })),
    expected,
    counted,
    differences,
  };
};

export function createCashRouter({
  CashSessionModel = CashSession,
  OrderModel = Order,
  AuditLogModel = AuditLog,
  protectMiddleware = protect,
  allowRolesMiddleware = allowRoles,
} = {}) {
const router = Router();
router.use(protectMiddleware);
router.use(allowRolesMiddleware('admin', 'atendente'));

const findSession = async (dateKey) => CashSessionModel.findOne({ dateKey });
const getReport = async (session, dateKey) => {
  const { start, end } = getSaoPauloDayRange(dateKey);
  const orders = await OrderModel.find({
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
    const session = await CashSessionModel.create({ dateKey, openingAmount, openedBy: req.user._id });
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
  try {
    await recordAuditEvent({
      AuditLogModel,
      req,
      action: 'caixa.sangria',
      details: { dateKey, amount, motivo: note },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'A sangria foi registrada, mas não foi possível registrar a auditoria' });
  }
  return res.json({ session, report: await getReport(session, dateKey) });
}));

router.post('/supply', asyncRoute(async (req, res) => {
  const dateKey = getSaoPauloDateKey();
  const session = await findSession(dateKey);
  if (!session || session.status !== 'open') return res.status(409).json({ message: 'Abra o caixa antes de registrar um suprimento' });
  const amount = req.body?.amount;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !note) {
    return res.status(400).json({ message: 'Informe valor positivo e motivo do suprimento' });
  }
  session.supplies.push({ amount, note, createdBy: req.user._id });
  await session.save();
  try {
    await recordAuditEvent({
      AuditLogModel,
      req,
      action: 'caixa.suprimento',
      details: { dateKey, amount, motivo: note },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'O suprimento foi registrado, mas não foi possível registrar a auditoria' });
  }
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
  try {
    await recordAuditEvent({
      AuditLogModel,
      req,
      action: 'caixa.fechamento',
      details: { dateKey, differences: session.differences },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'O caixa foi fechado, mas não foi possível registrar a auditoria' });
  }
  return res.json({ session, report: { ...report, counted: session.counted, differences: session.differences } });
}));

return router;
}

export default createCashRouter();
