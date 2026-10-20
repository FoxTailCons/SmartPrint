import { Router } from 'express';
import Order from '../models/Order.js';
import Payable from '../models/Payable.js';
import CashSession from '../models/CashSession.js';
import { allowRoles, protect } from '../middleware/auth.js';
import { buildFinanceExportRows, buildOrderExportRows, parseExportDateRange, toCsvFile } from '../services/csvExport.js';

const orderColumns = [
  ['createdAt', 'Data de criação'], ['number', 'Pedido'], ['client', 'Cliente'], ['phone', 'Telefone'],
  ['items', 'Itens'], ['total', 'Total'], ['received', 'Recebido'], ['balance', 'Saldo'],
  ['status', 'Status'], ['production', 'Produção'], ['deadline', 'Prazo'],
];
const financeColumns = [
  ['date', 'Data'], ['type', 'Tipo'], ['reference', 'Referência'], ['description', 'Descrição'],
  ['method', 'Forma de pagamento'], ['amount', 'Valor'],
];
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
  if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
  return next(error);
});

const sendCsv = (res, filename, columns, rows) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(toCsvFile(columns, rows));
};

const dateRange = (req) => parseExportDateRange({ from: req.query.from, to: req.query.to });

export const createExportsRouter = ({
  OrderModel = Order,
  PayableModel = Payable,
  CashSessionModel = CashSession,
  protectMiddleware = protect,
} = {}) => {
  const router = Router();
  router.use(protectMiddleware);

  router.get('/orders', allowRoles('admin', 'atendente'), asyncRoute(async (req, res) => {
    const { start, endExclusive } = dateRange(req);
    const orders = await OrderModel.find({ createdAt: { $gte: start, $lt: endExclusive } })
      .populate('client', 'name phone')
      .sort({ createdAt: 1 });
    const filename = `pedidos-${req.query.from}-a-${req.query.to}.csv`;
    return sendCsv(res, filename, orderColumns, buildOrderExportRows(orders));
  }));

  router.get('/finance', allowRoles('admin'), asyncRoute(async (req, res) => {
    const { start, endExclusive } = dateRange(req);
    const [orders, payables, sessions] = await Promise.all([
      OrderModel.find({
        $or: [
          { 'payments.paidAt': { $gte: start, $lt: endExclusive } },
          { 'history.at': { $gte: start, $lt: endExclusive } },
        ],
      }).select('number paymentMethod payments history'),
      PayableModel.find({ paid: true, paidAt: { $gte: start, $lt: endExclusive } })
        .select('description category value paymentMethod paidAt'),
      CashSessionModel.find({
        dateKey: { $gte: req.query.from, $lte: req.query.to },
        withdrawals: { $elemMatch: { createdAt: { $gte: start, $lt: endExclusive } } },
      }).select('dateKey withdrawals'),
    ]);
    const rows = buildFinanceExportRows({ orders, payables, sessions, from: start, endExclusive });
    const filename = `movimentacao-financeira-${req.query.from}-a-${req.query.to}.csv`;
    return sendCsv(res, filename, financeColumns, rows);
  }));

  return router;
};

export default createExportsRouter();
