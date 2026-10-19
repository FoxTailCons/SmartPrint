import { Router } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import Order from '../models/Order.js';
import Client from '../models/Client.js';
import Product from '../models/Product.js';
import { buildCatalogOrderItem } from '../services/orderItemPricing.js';
import { receiveDownPayment } from '../services/orderInstallments.js';
import { isConfirmedOrder } from '../services/orderStatus.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : 'a combinar';

const orderItemError = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const buildOrderDocumentLabel = (order) => (isConfirmedOrder(order) ? 'Pedido' : 'Orçamento');

export const canReceivePayments = (order) => order.status !== 'pendente';

export const buildOrderItems = async (items, existingItems = []) => Promise.all(items.map(async (item) => {
  if (!item?.productId) return item;
  if (!mongoose.isValidObjectId(item.productId)) throw orderItemError('Produto inválido');

  const previousItem = item._id && typeof existingItems.id === 'function'
    ? existingItems.id(item._id)
    : null;
  const hasMatchingSnapshot = previousItem
    && String(previousItem.productId) === String(item.productId)
    && previousItem.productName
    && previousItem.saleUnit
    && Number.isFinite(previousItem.unitPrice);
  const product = await Product.findById(item.productId);
  if (!product || (!product.active && !hasMatchingSnapshot)) {
    throw orderItemError('Produto não encontrado ou inativo');
  }

  const pricingSnapshot = hasMatchingSnapshot
    ? {
      productName: previousItem.productName,
      saleUnit: previousItem.saleUnit,
      unitPrice: previousItem.unitPrice,
    }
    : undefined;
  const calculatedItem = buildCatalogOrderItem({
    product,
    quantity: item.quantity,
    pieceCount: item.measurements?.pieceCount ?? item.pieceCount,
    lengthPerPiece: item.measurements?.lengthPerPiece ?? item.lengthPerPiece,
    width: item.measurements?.width ?? item.width,
    height: item.measurements?.height ?? item.height,
    dimensionUnit: item.measurements?.dimensionUnit ?? item.dimensionUnit,
    moldEnabled: item.measurements?.moldEnabled ?? item.moldEnabled ?? false,
    moldFactor: item.measurements?.moldFactor ?? item.moldFactor,
    pricingSnapshot,
  });

  return { ...calculatedItem, ...(hasMatchingSnapshot ? { _id: previousItem._id } : {}) };
}));

export const buildOrderPdfBuffer = async (order) => {
  const client = order?.client || {};
  const items = Array.isArray(order.items) ? order.items : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 30;
    const right = pageWidth - 30;
    const contentWidth = right - left;
    const tableRows = items;
    const subtotal = Number(order.totalValue || tableRows.reduce((sum, item) => sum + Number(item.total || 0), 0));
    const discount = Number(order.discount || 0);
    const finalValue = Number(order.finalValue ?? Math.max(0, subtotal - discount));
    const documentLabel = buildOrderDocumentLabel(order);
    const paymentLabel = {
      pix: 'PIX', dinheiro: 'DINHEIRO', debito: 'DÉBITO', credito: 'CRÉDITO', parcelado: 'PARCELADO',
    }[order.paymentMethod] || String(order.paymentMethod || 'A COMBINAR').toUpperCase();

    const drawLogo = (x, y) => {
      doc.save();
      doc.circle(x + 18, y + 18, 18).fill('#111827');
      doc.rect(x, y, 18, 18).fill('#00a6c7');
      doc.rect(x + 18, y, 18, 18).fill('#e91e73');
      doc.rect(x + 18, y + 18, 18, 18).fill('#f4d21f');
      doc.rect(x, y + 18, 18, 18).fill('#111827');
      doc.lineWidth(1.5).strokeColor('#111827').moveTo(x + 18, y).lineTo(x + 18, y + 36).stroke();
      doc.moveTo(x, y + 18).lineTo(x + 36, y + 18).stroke();
      doc.circle(x + 18, y + 18, 5).fill('#fff').stroke('#111827');
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(25).fillColor('#111827').text('smart print.', x, y + 43);
      doc.font('Helvetica').fontSize(8).fillColor('#111827').text('gráfica e comunicação visual', x + 3, y + 72);
    };

    const labelValue = (label, value, x, y, width) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`${label}:`, x, y, { continued: true });
      doc.font('Helvetica').text(` ${value || '—'}`, { width });
    };

    drawLogo(left + 8, 16);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(client.name || 'Cliente não cadastrado', 330, 18, { width: 235, align: 'right' });
    doc.font('Helvetica').fontSize(10).text(`Cnpj: ${client.document || '—'}`, 330, 34, { width: 235, align: 'right' });
    doc.text(client.address || '—', 330, 50, { width: 235, align: 'right' });
    doc.text(`${client.city || '—'} - ${client.state || '—'} | Cep: ${client.zipCode || '—'}`, 330, 66, { width: 235, align: 'right' });
    doc.moveTo(left, 91).lineTo(right, 91).lineWidth(1).stroke('#6b7280');

    doc.rect(left + 18, 96, contentWidth - 36, 27).fill('#000');
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#fff').text(`${documentLabel} Nº ${order.number || '00000'}`, left + 18, 103, { width: contentWidth - 36, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text('Orçamento aos cuidados do(a) Sr(a):', left, 133, { width: contentWidth, align: 'center' });

    labelValue('Data de Emissão', fmtDate(order.createdAt), left + 40, 153, 220);
    labelValue('Prev. Entrega', fmtDate(order.deliveryDate), 350, 153, 190);
    labelValue('Cliente', client.name || 'Cliente não cadastrado', left + 48, 175, contentWidth - 96);
    labelValue('Endereço', client.address || '—', left + 48, 197, 230);
    labelValue('Bairro', client.neighborhood || '—', 355, 197, 180);
    labelValue('Cidade', client.city || '—', left + 48, 219, 230);
    labelValue('Estado', client.state || '—', 355, 219, 180);
    labelValue('CEP', client.zipCode || '—', left + 48, 241, 230);
    labelValue('CNPJ/CPF', client.document || '—', 355, 241, 180);
    labelValue('Fone', client.phone || '—', left + 48, 263, 230);
    labelValue('Inscrição Est', client.stateRegistration || '—', 355, 263, 180);
    labelValue('E-mail', client.email || '—', left + 48, 285, 230);
    labelValue('Contato', client.contact || '—', 355, 285, 180);

    const tableY = 310;
    const cols = { code: left, description: left + 42, quantity: 320, unit: 385, discount: 450, total: 520 };
    doc.rect(left, tableY, contentWidth, 22).fill('#000');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
    doc.text('Cod', cols.code + 4, tableY + 6);
    doc.text('Produto', cols.description + 4, tableY + 6);
    doc.text('Qtde', cols.quantity, tableY + 6, { width: 45, align: 'right' });
    doc.text('Valor Un.', cols.unit, tableY + 6, { width: 55, align: 'right' });
    doc.text('Desc R$', cols.discount, tableY + 6, { width: 55, align: 'right' });
    doc.text('Total', cols.total, tableY + 6, { width: 45, align: 'right' });

    let currentY = tableY + 30;
    tableRows.forEach((item, index) => {
      const description = String(item.description || 'Item sem descrição');
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const total = Number(item.total ?? quantity * unitPrice);
      const descriptionHeight = doc.heightOfString(description, { width: 265, fontSize: 9 });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(item.code || String(index + 1).padStart(3, '0'), cols.code + 4, currentY);
      doc.text(description, cols.description + 4, currentY, { width: 265 });
      doc.text(quantity.toFixed(4).replace('.', ','), cols.quantity, currentY, { width: 45, align: 'right' });
      doc.text(fmtMoney(unitPrice), cols.unit, currentY, { width: 55, align: 'right' });
      doc.text('0,0000', cols.discount, currentY, { width: 55, align: 'right' });
      doc.text(fmtMoney(total), cols.total, currentY, { width: 45, align: 'right' });
      currentY += Math.max(22, descriptionHeight + 7);
    });

    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#6b7280').text('—', cols.description + 4, currentY);
    doc.font('Helvetica-BoldOblique').fontSize(10).text('Total Desconto: ', 315, currentY, { continued: true });
    doc.text(fmtMoney(discount));
    doc.font('Helvetica-BoldOblique').fontSize(12).fillColor('#111827').text('Valor', 450, currentY, { continued: true });
    doc.text(` ${fmtMoney(finalValue)}`);
    doc.text('Total:', 450, currentY + 14);

    const paymentY = currentY + 42;
    doc.rect(left, paymentY, contentWidth, 39).stroke('#111827');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Forma de Pagamento:', left + 185, paymentY + 11, { continued: true });
    doc.font('Helvetica').text(` ${paymentLabel}`);
    doc.font('Helvetica-Bold').fontSize(9).text('Observações:', left + 42, paymentY + 46);
    doc.moveTo(left + 42, paymentY + 66).lineTo(right, paymentY + 66).stroke('#6b7280');
    doc.font('Helvetica-Bold').fontSize(9).text('Informações Complementares:', left + 42, paymentY + 78);
    doc.moveTo(left, paymentY + 110).lineTo(right, paymentY + 110).stroke('#6b7280');
    if (order.observations) doc.font('Helvetica').fontSize(9).text(order.observations, left + 42, paymentY + 48, { width: contentWidth - 55 });

    const signatureY = Math.min(paymentY + 180, 700);
    doc.moveTo(left, signatureY).lineTo(left + 220, signatureY).stroke('#111827');
    doc.moveTo(right - 220, signatureY).lineTo(right, signatureY).stroke('#111827');
    doc.font('Helvetica').fontSize(8).fillColor('#111827').text(client.name || 'Cliente', left, signatureY + 7, { width: 220, align: 'center' });
    doc.text('LINDOIANO FONTES DE AGUAS MINERAIS LTDA', right - 220, signatureY + 7, { width: 220, align: 'center' });
    doc.moveTo(left, 805).lineTo(right, 805).stroke('#111827');

    doc.end();
  });
};

// Monta texto para envio via WhatsApp (usado no front com wa.me)
const buildWhatsappText = (order, client) => {
  const lines = [];
  const clientName = client?.name || 'Cliente não cadastrado';
  const subtotal = Number(order.totalValue || (order.items || []).reduce((sum, item) => sum + Number(item.total || 0), 0));
  const discount = Number(order.discount || 0);
  const finalValue = Number(order.finalValue ?? Math.max(0, subtotal - discount));
  const documentLabel = buildOrderDocumentLabel(order).toUpperCase();
  lines.push('*SMART PRINT*');
  lines.push('gráfica e comunicação visual');
  lines.push(`*${documentLabel} Nº ${order.number}*`);
  lines.push('');
  lines.push(`Cliente: ${clientName}`);
  lines.push(`Data de Emissão: ${fmtDate(order.createdAt)}`);
  lines.push(`Prev. Entrega: ${fmtDate(order.deliveryDate)}`);
  lines.push('');
  lines.push('*Cod | Produto | Qtde | Valor Un. | Desc R$ | Total*');
  (order.items || []).forEach((it, index) => {
    lines.push(`${it.code || String(index + 1).padStart(3, '0')} | ${it.description} | ${Number(it.quantity || 0).toFixed(4).replace('.', ',')} | ${fmtMoney(it.unitPrice)} | R$ 0,00 | ${fmtMoney(it.total)}`);
  });
  lines.push(`Total Desconto: ${fmtMoney(discount)}`);
  lines.push(`*VALOR TOTAL: ${fmtMoney(finalValue)}*`);
  lines.push(`Forma de Pagamento: ${String(order.paymentMethod || 'a combinar').toUpperCase()}`);
  if (order.amountPaid > 0) lines.push(`Pago: ${fmtMoney(order.amountPaid)} | Saldo: ${fmtMoney(finalValue - order.amountPaid)}`);
  if (order.observations) lines.push(`Observações: ${order.observations}`);
  lines.push('');
  lines.push('O PDF neste mesmo formato pode ser baixado pelo botão Imprimir antes do envio.');
  lines.push('Agradecemos a preferência!');
  return lines.join('\n');
};

export const createOrderListHandler = ({ OrderModel = Order, ClientModel = Client } = {}) => async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination?.error) return res.status(400).json({ message: pagination.error });

  const { status, paymentStatus, production, client, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (production) filter.production = production;
  if (client) filter.client = client;
  if (q) {
    const clients = await ClientModel.find({ name: { $regex: q, $options: 'i' } }).select('_id');
    filter.$or = [{ number: { $regex: q, $options: 'i' } }, { client: { $in: clients.map((c) => c._id) } }];
  }

  if (!pagination) {
    const orders = await OrderModel.find(filter)
      .populate('client', 'name phone')
      .sort({ createdAt: -1 })
      .limit(500);
    return res.json(orders);
  }

  const total = await OrderModel.countDocuments(filter);
  const page = getEffectivePage(pagination.page, pagination.pageSize, total);
  const items = await OrderModel.find(filter)
    .populate('client', 'name phone')
    .sort({ createdAt: -1 })
    .skip((page - 1) * pagination.pageSize)
    .limit(pagination.pageSize);
  return res.json(buildPage(items, page, pagination.pageSize, total));
};

router.get('/', createOrderListHandler());

const confirmedOrdersFilter = {
  $or: [
    { status: { $in: ['aprovado', 'concluido'] } },
    { amountPaid: { $gt: 0 } },
  ],
};

const receivableBalanceExpression = {
  $subtract: [
    { $ifNull: ['$finalValue', 0] },
    { $ifNull: ['$amountPaid', 0] },
  ],
};

const buildReceivablesFilter = (filter) => {
  if (filter === 'all') return confirmedOrdersFilter;

  return {
    $and: [
      confirmedOrdersFilter,
      {
        $expr: filter === 'paid'
          ? { $lte: [receivableBalanceExpression, 0.01] }
          : { $gt: [receivableBalanceExpression, 0.01] },
      },
    ],
  };
};

export const createReceivablesListHandler = ({ OrderModel = Order } = {}) => async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination?.error) return res.status(400).json({ message: pagination.error });

  const filter = req.query.filter || 'open';
  if (!['open', 'paid', 'all'].includes(filter)) {
    return res.status(400).json({ message: 'Filtro de recebíveis inválido' });
  }

  const pageQuery = pagination || parsePagination({ page: '1' });
  const queryFilter = buildReceivablesFilter(filter);
  const [total, summaryRows, upcoming,] = await Promise.all([
    OrderModel.countDocuments(queryFilter),
    OrderModel.aggregate([
      { $match: confirmedOrdersFilter },
      {
        $group: {
          _id: null,
          totalOpen: {
            $sum: {
              $cond: [
                { $gt: [receivableBalanceExpression, 0.01] },
                receivableBalanceExpression,
                0,
              ],
            },
          },
          totalReceived: { $sum: { $ifNull: ['$amountPaid', 0] } },
        },
      },
    ]),
    OrderModel.aggregate([
      { $match: confirmedOrdersFilter },
      { $unwind: { path: '$installments', includeArrayIndex: 'installmentIndex' } },
      { $match: { 'installments.paid': { $ne: true } } },
      { $sort: { 'installments.dueDate': 1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'clients',
          localField: 'client',
          foreignField: '_id',
          as: 'client',
        },
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          order: { number: '$number', client: { name: '$client.name' } },
          parcela: { $add: ['$installmentIndex', 1] },
          dueDate: '$installments.dueDate',
          amount: '$installments.amount',
        },
      },
    ]),
  ]);
  const page = getEffectivePage(pageQuery.page, pageQuery.pageSize, total);
  const items = await OrderModel.find(queryFilter)
    .populate('client', 'name phone')
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageQuery.pageSize)
    .limit(pageQuery.pageSize);
  const totals = summaryRows[0] || { totalOpen: 0, totalReceived: 0 };

  return res.json({
    ...buildPage(items, page, pageQuery.pageSize, total),
    summary: {
      totalOpen: filter === 'paid' ? 0 : totals.totalOpen,
      totalReceived: totals.totalReceived,
      upcoming,
    },
  });
};

router.get('/receivables', createReceivablesListHandler());

router.get('/:id', async (req, res) => {
  const order = await Order.findById(req.params.id).populate('client');
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  res.json(order);
});

// Criar orçamento/pedido
router.post('/', async (req, res) => {
  try {
    const rawClientId = req.body?.client;
    if (rawClientId && !mongoose.isValidObjectId(rawClientId)) return res.status(400).json({ message: 'Cliente inválido' });
    if (rawClientId && !await Client.exists({ _id: rawClientId })) return res.status(400).json({ message: 'Cliente não encontrado' });
    if (!Array.isArray(req.body?.items) || !req.body.items.some((item) => item?.productId || item?.description?.trim())) {
      return res.status(400).json({ message: 'Informe pelo menos um item do pedido' });
    }
    const fields = ['client', 'items', 'discount', 'downPayment', 'deliveryDate', 'observations', 'installments', 'paymentMethod'];
    const payload = Object.fromEntries(fields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    if (payload.client === '') payload.client = null;
    payload.items = await buildOrderItems(payload.items);
    const order = await Order.create({ ...payload, createdBy: req.user._id });
    order.history.push({ action: 'criado', by: req.user.name });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
});

// Consolida dois ou mais pedidos do mesmo cliente em um único pedido.
router.post('/merge', adminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const ids = Array.isArray(req.body?.orderIds) ? [...new Set(req.body.orderIds)] : [];
    if (ids.length < 2) return res.status(400).json({ message: 'Selecione pelo menos dois pedidos' });
    if (ids.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Um ou mais IDs de pedido são inválidos' });

    let merged;
    await session.withTransaction(async () => {
      const orders = await Order.find({ _id: { $in: ids } }).sort({ createdAt: 1 }).session(session);
    if (orders.length !== ids.length) throw new Error('Um ou mais pedidos não foram encontrados');

    const clientId = String(orders[0].client);
    if (orders.some((order) => String(order.client) !== clientId)) {
      throw new Error('Só é possível agregar pedidos do mesmo cliente');
    }

    const allConcluded = orders.every((order) => order.status === 'concluido');
    const hasApproved = orders.some((order) => order.status === 'aprovado');
    const hasProduction = orders.some((order) => ['em_producao', 'pausado'].includes(order.production));
    const totalPaid = orders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const sourceNumbers = orders.map((order) => `#${order.number}`).join(', ');
    [merged] = await Order.create([{
      client: orders[0].client,
      items: orders.flatMap((order) => order.items.map((item) => item.toObject())),
      discount: orders.reduce((sum, order) => sum + (order.discount || 0), 0),
      amountPaid: totalPaid,
      payments: orders.flatMap((order) => (order.payments || []).map((payment) => payment.toObject())),
      history: [
        ...orders.flatMap((order) => (order.history || []).map((entry) => entry.toObject())),
        { action: 'agregado', by: req.user.name, note: `Origem: ${sourceNumbers}` },
      ],
      status: allConcluded ? 'concluido' : hasApproved ? 'aprovado' : 'pendente',
      production: allConcluded ? 'concluido' : hasProduction ? 'em_producao' : 'nao_iniciado',
      deliveryDate: orders.map((order) => order.deliveryDate).filter(Boolean).sort((a, b) => a - b)[0],
      observations: `Agregado dos pedidos ${sourceNumbers}.`,
      createdBy: req.user._id,
    }], { session });

    if (totalPaid >= merged.finalValue - 0.01) merged.paymentStatus = 'quitado';
    else if (totalPaid > 0) merged.paymentStatus = 'parcial';
    await merged.save({ session });
    await Order.deleteMany({ _id: { $in: ids } }, { session });
    });

    res.status(201).json(await merged.populate('client', 'name phone'));
  } catch (err) {
    res.status(400).json({ message: err.message });
  } finally {
    await session.endSession();
  }
});

router.put('/:id', async (req, res) => {
  try {
    const editableFields = ['client', 'items', 'discount', 'downPayment', 'deliveryDate', 'observations', 'installments', 'paymentMethod'];
    const changes = Object.fromEntries(editableFields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    if (changes.client === '') changes.client = null;
    if (changes.client && (!mongoose.isValidObjectId(changes.client) || !await Client.exists({ _id: changes.client }))) {
      return res.status(400).json({ message: 'Cliente inválido ou não encontrado' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (order.status !== 'pendente' && 'downPayment' in changes
      && Number(changes.downPayment) !== Number(order.downPayment || 0)) {
      return res.status(400).json({ message: 'A entrada não pode ser alterada após a aprovação do pedido' });
    }
    if ('items' in changes) {
      if (!Array.isArray(changes.items)) return res.status(400).json({ message: 'Lista de itens inválida' });
      changes.items = await buildOrderItems(changes.items, order.items);
    }
    Object.assign(order, changes);
    await order.save();
    return res.json(await order.populate('client'));
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  await Order.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---- Ações de fluxo ----

// Aprovar orçamento (pendente -> aprovado)
router.post('/:id/approve', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de pedido inválido' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (order.status !== 'pendente') return res.status(400).json({ message: 'Somente pedidos pendentes podem ser aprovados' });
    order.status = 'aprovado';
    order.history.push({ action: 'aprovado', by: req.user.name, note: req.body?.note || '' });
    const downPayment = Number(order.downPayment) || 0;
    if (downPayment > 0) {
      receiveDownPayment(order);
      order.history.push({
        action: 'pagamento',
        by: req.user.name,
        paymentMethod: order.paymentMethod,
        note: `Entrada recebida no valor de ${fmtMoney(downPayment)} via ${order.paymentMethod}`,
      });
    }
    if (order.amountPaid >= order.finalValue - 0.01) order.paymentStatus = 'quitado';
    else if (order.amountPaid > 0) order.paymentStatus = 'parcial';
    else order.paymentStatus = 'aberto';
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Iniciar produção
router.post('/:id/production/start', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  if (order.status !== 'aprovado' || order.production !== 'nao_iniciado') return res.status(400).json({ message: 'O pedido precisa estar aprovado e não iniciado para começar a produção' });
  order.production = 'em_producao';
  if (!order.productionStartedAt) order.productionStartedAt = new Date();
  order.history.push({ action: 'producao_iniciada', by: req.user.name });
  await order.save();
  res.json(order);
});

// Pausar produção
router.post('/:id/production/pause', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  if (order.production !== 'em_producao') return res.status(400).json({ message: 'Somente uma produção ativa pode ser pausada' });
  if (!req.body?.note?.trim()) return res.status(400).json({ message: 'O motivo da pausa é obrigatório' });
  order.production = 'pausado';
  order.productionPausedAt = new Date();
  order.history.push({ action: 'pausado', by: req.user.name, note: req.body.note.trim() });
  await order.save();
  res.json(order);
});

// Retomar produção
router.post('/:id/production/resume', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  if (order.production !== 'pausado') return res.status(400).json({ message: 'Somente uma produção pausada pode ser retomada' });
  order.production = 'em_producao';
  order.history.push({ action: 'retomado', by: req.user.name });
  await order.save();
  res.json(order);
});

// Concluir pedido (produção concluída + status concluído)
router.post('/:id/complete', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  if (order.status !== 'aprovado' || !['em_producao', 'pausado'].includes(order.production)) return res.status(400).json({ message: 'O pedido precisa estar em produção para ser concluído' });
  order.production = 'concluido';
  order.status = 'concluido';
  order.completedAt = new Date();
  order.history.push({ action: 'concluido', by: req.user.name });
  await order.save();
  res.json(order);
});

// Registrar pagamento (parcial ou total) - desdobra nas parcelas
router.post('/:id/payments', async (req, res) => {
  const { amount, date, installmentIndex, paymentMethod = 'pix' } = req.body;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
  const order = await Order.findById(req.params.id);
  const pay = Number(amount) || 0;
  if (pay <= 0) return res.status(400).json({ message: 'Valor inválido' });
  const methods = ['pix', 'dinheiro', 'debito', 'credito', 'parcelado'];
  if (!methods.includes(paymentMethod)) return res.status(400).json({ message: 'Forma de pagamento inválida' });
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  if (!canReceivePayments(order)) {
    return res.status(400).json({ message: 'Aprove o orçamento antes de registrar pagamentos' });
  }
  const balanceBefore = Math.max(0, (order.finalValue || 0) - (order.amountPaid || 0));
  if (pay > balanceBefore + 0.01) return res.status(400).json({ message: `O pagamento não pode exceder o saldo de ${fmtMoney(balanceBefore)}` });
  if (installmentIndex !== undefined && !order.installments[installmentIndex]) {
    return res.status(400).json({ message: 'Parcela inválida' });
  }

  order.amountPaid = (order.amountPaid || 0) + pay;
  order.paymentMethod = paymentMethod;
  order.payments.push({ amount: pay, method: paymentMethod, paidAt: date || new Date() });

  // Se houver parcela indicada, marca ela
  if (installmentIndex !== undefined) {
    const inst = order.installments[installmentIndex];
    if (inst.paid) return res.status(400).json({ message: 'Esta parcela já está paga' });
    if (pay + 0.01 < inst.amount) return res.status(400).json({ message: 'O pagamento precisa quitar a parcela selecionada ou ser lançado sem selecionar parcela' });
    inst.paid = true;
    inst.paidAt = date || new Date();
  } else {
    // Desdobra automaticamente: paga as parcelas em ordem
    let remaining = pay;
    for (const inst of order.installments) {
      if (remaining <= 0) break;
      if (!inst.paid && inst.amount <= remaining) {
        inst.paid = true;
        inst.paidAt = date || new Date();
        remaining -= inst.amount;
      }
    }
  }

  const balance = order.finalValue - order.amountPaid;
  if (balance <= 0.01) order.paymentStatus = 'quitado';
  else if (order.amountPaid > 0) order.paymentStatus = 'parcial';

  order.history.push({ action: 'pagamento', by: req.user.name, paymentMethod, note: `Recebido ${fmtMoney(pay)} via ${paymentMethod}` });
  await order.save();
  res.json(order);
});

// Gerar texto WhatsApp + link
router.get('/:id/whatsapp', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de pedido inválido' });
    }
    const order = await Order.findById(req.params.id).populate('client');
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (!order.client) return res.status(400).json({ message: 'Este pedido não possui um cliente vinculado' });

    const text = buildWhatsappText(order, order.client);
    const phone = String(order.client.phone || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ message: 'Cadastre um telefone/WhatsApp para este cliente' });

    order.whatsappSentAt = new Date();
    await order.save();
    res.json({
      text,
      phone,
      documentLabel: buildOrderDocumentLabel(order),
      link: `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de pedido inválido' });
    }
    const order = await Order.findById(req.params.id).populate('client');
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });

    const pdfBuffer = await buildOrderPdfBuffer(order.toObject());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${buildOrderDocumentLabel(order).toLowerCase()}-${order.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
