import { Router } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import Order from '../models/Order.js';
import Client from '../models/Client.js';
import Product from '../models/Product.js';
import { calendarDate, nextProductionStage, boardOrders, mergeProductionWorkflow, initialProductionStage } from '../services/productionWorkflow.js';
import { normalizeItemMetadata } from '../services/orderItemPricing.js';
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
  d ? new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-03:00` : d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'a combinar';

const orderItemError = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const buildOrderDocumentLabel = (order) => (isConfirmedOrder(order) ? 'Pedido' : 'Orçamento');

export const canReceivePayments = (order) => order.status !== 'pendente';

export const initializeNewOrder = (order, { quickOrder = false, userName = '' } = {}) => {
  order.history.push({ action: 'criado', by: userName });
  if (!quickOrder) return;

  order.status = 'aprovado';
  order.history.push({ action: 'aprovado', by: userName, note: 'Pedido rápido' });
  const downPayment = Number(order.downPayment) || 0;
  if (downPayment > 0) {
    receiveDownPayment(order);
    order.history.push({
      action: 'pagamento',
      by: userName,
      paymentMethod: order.paymentMethod,
      note: `Entrada recebida no valor de ${fmtMoney(downPayment)} via ${order.paymentMethod}`,
    });
  }
};

export const buildOrderItems = async (items, existingItems = []) => Promise.all(items.map(async (item) => {
  const previousItem = item?._id && typeof existingItems.id === 'function'
    ? existingItems.id(item._id)
    : null;
  const metadata = normalizeItemMetadata({ ...(previousItem?.toObject?.() ?? previousItem), ...item });
  if (!item?.productId) {
    if (!item || typeof item.description !== 'string' || !item.description.trim() || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 || typeof item.unitPrice !== 'number' || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw orderItemError('Item ou preço inválido');
    if (!Number.isFinite(item.quantity * item.unitPrice + (metadata.installationFee || 0) + (metadata.travelFee || 0))) throw orderItemError('Total do item inválido');
    return { ...item, ...metadata, productId: undefined, pricingBasis: undefined };
  }
  if (!mongoose.isValidObjectId(item.productId)) throw orderItemError('Produto inválido');

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
      pricingBasis: previousItem.pricingBasis?.basePrice !== undefined ? previousItem.pricingBasis.toObject?.() ?? previousItem.pricingBasis : undefined,
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
    ...metadata,
  });

  return { ...calculatedItem, ...(hasMatchingSnapshot ? { _id: previousItem._id } : {}) };
}));

export const itemDocumentDetails = (item) => {
  const labels = {serviceName:'Serviço',material:'Material',finishing:'Acabamento',applicationLocation:'Local',promisedDate:'Prazo',artworkUrl:'Arte',installationNotes:'Instalação'};
  const lines = Object.entries(labels).filter(([key])=>item[key]).map(([key,label])=>`${label}: ${key==='promisedDate'?fmtDate(item[key]):item[key]}`);
  for (const [key,label] of [['installationFee','Instalação'],['travelFee','Deslocamento']]) if(item[key]) lines.push(`${label}: ${fmtMoney(item[key])}`);
  return lines;
};

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
    labelValue('Prev. Entrega', fmtDate(calendarDate(order.deliveryDate)), 350, 153, 190);
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

    const cols = { code: left, description: left + 42, quantity: 320, unit: 385, discount: 450, total: 520 };
    const pageBottom = 780;
    const drawTableHeader = (y) => {
    doc.rect(left, y, contentWidth, 22).fill('#000');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
    doc.text('Cod', cols.code + 4, y + 6);
    doc.text('Produto', cols.description + 4, y + 6);
    doc.text('Qtde', cols.quantity, y + 6, { width: 45, align: 'right' });
    doc.text('Valor Un.', cols.unit, y + 6, { width: 55, align: 'right' });
    doc.text('Desc R$', cols.discount, y + 6, { width: 55, align: 'right' });
    doc.text('Total', cols.total, y + 6, { width: 45, align: 'right' });

    };
    const newPage = (table = true) => {
      doc.moveTo(left, 805).lineTo(right, 805).stroke('#111827');
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(`${documentLabel} ${order.number || ''}`, left, 30);
      if (table) drawTableHeader(60);
      return table ? 90 : 60;
    };
    // Wrap explicitly so a single long URL or installation note can span pages without PDFKit moving columns independently.
    const wrapLines = (value, width) => {
      const lines = [];
      for (const paragraph of String(value).split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          if (line && doc.widthOfString(`${line} ${word}`) <= width) { line += ` ${word}`; continue; }
          if (line) { lines.push(line); line = ''; }
          for (const character of word) {
            if (line && doc.widthOfString(line + character) > width) { lines.push(line); line = ''; }
            line += character;
          }
        }
        lines.push(line);
      }
      return lines;
    };
    drawTableHeader(310);
    let currentY = 340;
    tableRows.forEach((item, index) => {
      doc.font('Helvetica').fontSize(9);
      const lines = wrapLines([item.description || 'Item', ...itemDocumentDetails(item)].join('\n'), 235);
      const lineHeight = doc.currentLineHeight(true);
      let firstChunk = true;
      while (lines.length) {
        if (currentY + Math.min(lines.length * lineHeight + 7, 70) > pageBottom) currentY = newPage();
        doc.font('Helvetica').fontSize(9).fillColor('#111827');
        const count = Math.max(1, Math.floor((pageBottom - currentY - 7) / lineHeight));
        const chunk = lines.splice(0, count);
        doc.text(item.code || String(index + 1).padStart(3, '0'), cols.code + 4, currentY, { width: 35, lineBreak: false });
        chunk.forEach((line, lineIndex) => doc.text(line, cols.description + 4, currentY + lineIndex * lineHeight, { width: 235, lineBreak: false }));
        if (firstChunk) {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unitPrice || 0);
          doc.text(quantity.toFixed(4).replace('.', ','), cols.quantity, currentY, { width: 45, align: 'right', lineBreak: false });
          doc.text(fmtMoney(unitPrice), cols.unit, currentY, { width: 55, align: 'right', lineBreak: false });
          doc.text('0,0000', cols.discount, currentY, { width: 55, align: 'right', lineBreak: false });
          doc.text(fmtMoney(item.total ?? quantity * unitPrice), cols.total, currentY, { width: 45, align: 'right', lineBreak: false });
        }
        currentY += Math.max(22, chunk.length * lineHeight + 7);
        firstChunk = false;
        if (lines.length) currentY = newPage();
      }
    });
    if (currentY + 240 > pageBottom) currentY = newPage(false);

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
    currentY = paymentY + 46;
    doc.font('Helvetica-Bold').fontSize(9).text('Observa\u00e7\u00f5es:', left + 42, currentY);
    currentY += 15;
    doc.font('Helvetica').fontSize(9);
    const observationLines = order.observations ? wrapLines(order.observations, contentWidth - 55) : [];
    const observationLineHeight = doc.currentLineHeight(true);
    for (const line of observationLines) {
      if (currentY + observationLineHeight > pageBottom) currentY = newPage(false);
      doc.font('Helvetica').fontSize(9).fillColor('#111827').text(line, left + 42, currentY, {width: contentWidth - 55, lineBreak: false});
      currentY += observationLineHeight;
    }
    if (currentY + 130 > pageBottom) currentY = newPage(false);
    const complementY = Math.max(currentY + 12, paymentY + 78 <= pageBottom - 120 && currentY >= paymentY ? paymentY + 78 : currentY + 12);
    doc.moveTo(left + 42, currentY + 3).lineTo(right, currentY + 3).stroke('#6b7280');
    doc.font('Helvetica-Bold').fontSize(9).text('Informa\u00e7\u00f5es Complementares:', left + 42, complementY);
    doc.moveTo(left, complementY + 32).lineTo(right, complementY + 32).stroke('#6b7280');
    const signatureY = Math.max(complementY + 75, currentY >= paymentY && paymentY + 180 < pageBottom ? paymentY + 180 : 0);
    doc.moveTo(left, signatureY).lineTo(left + 220, signatureY).stroke('#111827');
    doc.moveTo(right - 220, signatureY).lineTo(right, signatureY).stroke('#111827');
    doc.font('Helvetica').fontSize(8).fillColor('#111827').text(client.name || 'Cliente', left, signatureY + 7, { width: 220, align: 'center' });
    doc.text('LINDOIANO FONTES DE AGUAS MINERAIS LTDA', right - 220, signatureY + 7, { width: 220, align: 'center' });
    doc.moveTo(left, 805).lineTo(right, 805).stroke('#111827');

    doc.end();
  });
};

// Monta texto para envio via WhatsApp (usado no front com wa.me)
export const buildWhatsappText = (order, client) => {
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
  lines.push(`Prev. Entrega: ${fmtDate(calendarDate(order.deliveryDate))}`);
  lines.push('');
  lines.push('*Cod | Produto | Qtde | Valor Un. | Desc R$ | Total*');
  (order.items || []).forEach((it, index) => {
    lines.push(...itemDocumentDetails(it));
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

export function createProductionBoardHandler({ OrderModel = Order, now = () => new Date() } = {}) {
  return async (req,res) => {
    try {
      const at = now();
      const rows = await OrderModel.find({$or:[{status:'aprovado'},{status:'concluido',completedAt:{$gte:new Date(at-7*86400000)}}],quickSaleKey:{$exists:false}}).populate('client','name phone').lean();
      return res.json(boardOrders(rows,req.query,at));
    } catch(error) { return res.status(400).json({message:error.message}); }
  };
}
export function createProductionAdvanceHandler({ OrderModel = Order } = {}) {
  return async (req,res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) throw new Error('Identificador de pedido inválido');
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({message:'Pedido não encontrado'});
      if (order.status !== 'aprovado' || order.production === 'pausado') throw new Error('Pedido deve estar aprovado e não pausado');
      const transition = nextProductionStage(order,req.body?.expectedStage,req.body?.skip ?? false);
      const at = new Date();
      const delivered = transition.toStage === 'entregue';
      const filter = {_id:order._id,status:'aprovado',production:order.production,productionStage:order.productionStage ?? {$exists:false}};
      const updated = await OrderModel.findOneAndUpdate(filter, {
        $set: {productionStage:transition.toStage,skippedStages:transition.skippedStages,production:delivered?'concluido':'em_producao',...(delivered?{status:'concluido',completedAt:at}:{}),...(!order.productionStartedAt?{productionStartedAt:at}:{})},
        $push: {history:{action:delivered?'concluido':req.body?.skip?'etapa_dispensada':'etapa_avancada',by:req.user.name,at,...transition}},
      },{new:true,runValidators:true});
      if (!updated) return res.status(409).json({message:'Etapa alterada; atualize o pedido'});
      return res.json(updated);
    } catch(error) { return res.status(error.statusCode || 400).json({message:error.message}); }
  };
}
export function createQuickSaleHandler({ OrderModel = Order, ProductModel = Product } = {}) {
  return async (req,res) => {
    let quickSaleKey;
    try {
      const {items,paymentMethod,requestId} = req.body || {};
      if (typeof requestId !== 'string' || !requestId.trim() || requestId.length>120) throw orderItemError('Identificador da venda inválido');
      quickSaleKey = `${req.user._id}:${requestId}`;
      const existing = await OrderModel.findOne({quickSaleKey});
      if (existing) return res.json(existing);
      if (!['pix','dinheiro','debito','credito'].includes(paymentMethod)) throw orderItemError('Forma de pagamento inválida');
      if (!Array.isArray(items) || !items.length) throw orderItemError('Informe os itens da venda');
      const quantities = new Map();
      for (const item of items) {
        if (!mongoose.isValidObjectId(item?.productId) || !Number.isSafeInteger(item.quantity) || item.quantity<=0) throw orderItemError('Produto ou quantidade inválida');
        quantities.set(item.productId,(quantities.get(item.productId)||0)+item.quantity);
      }
      const pricedItems = await Promise.all([...quantities].map(async ([productId,quantity])=>{
        const product = await ProductModel.findById(productId);
        if (!product?.active || product.saleUnit!=='unit') throw orderItemError('Venda rápida aceita apenas produtos ativos por unidade');
        try { return buildCatalogOrderItem({product,quantity}); } catch (error) { throw orderItemError(error.message); }
      }));
      const finalValue = Math.ceil(Math.round(pricedItems.reduce((sum,item)=>sum+item.total,0)*100)/100);
      if (!Number.isFinite(finalValue)) throw orderItemError('Total inválido');
      const at = new Date();
      const order = await OrderModel.create({quickSaleKey,client:null,items:pricedItems,finalValue,amountPaid:finalValue,paymentMethod,paymentStatus:'quitado',status:'concluido',production:'concluido',productionStage:'entregue',completedAt:at,createdBy:req.user._id,payments:[{amount:finalValue,method:paymentMethod,type:'pagamento',paidAt:at}],history:[{action:'venda_rapida',by:req.user.name,at,paymentMethod}]});
      return res.status(201).json(order);
    } catch(error) {
      if (error.code===11000 && quickSaleKey) {
        try { const existing = await OrderModel.findOne({quickSaleKey}); if(existing) return res.json(existing); } catch { return res.status(500).json({message:'Falha ao confirmar venda; tente novamente com a mesma venda'}); }
      }
      if (error.statusCode === 400 || error.name === 'ValidationError') return res.status(400).json({message:error.message});
      return res.status(500).json({message:'Falha ao confirmar venda; tente novamente com a mesma venda'});
    }
  };
}

router.get('/production-board', createProductionBoardHandler());
router.post('/quick-sale', createQuickSaleHandler());
router.post('/:id/production/advance', createProductionAdvanceHandler());

router.get('/:id', async (req, res) => {
  const order = await Order.findById(req.params.id).populate('client');
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  res.json(order);
});

// Criar orçamento/pedido
router.post('/', async (req, res) => {
  try {
    if ('quickOrder' in (req.body || {}) && typeof req.body.quickOrder !== 'boolean') {
      return res.status(400).json({ message: 'Opção de pedido rápido inválida' });
    }
    const rawClientId = req.body?.client;
    if (rawClientId && !mongoose.isValidObjectId(rawClientId)) return res.status(400).json({ message: 'Cliente inválido' });
    if (rawClientId && !await Client.exists({ _id: rawClientId })) return res.status(400).json({ message: 'Cliente não encontrado' });
    if (!Array.isArray(req.body?.items) || !req.body.items.some((item) => item?.productId || item?.description?.trim())) {
      return res.status(400).json({ message: 'Informe pelo menos um item do pedido' });
    }
    const fields = ['client', 'items', 'discount', 'downPayment', 'deliveryDate', 'observations', 'installments', 'paymentMethod', 'priority', 'skippedStages'];
    const payload = Object.fromEntries(fields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    if (payload.client === '') payload.client = null;
    payload.items = await buildOrderItems(payload.items);
    const order = await Order.create({ ...payload, productionStage: initialProductionStage(payload.skippedStages), createdBy: req.user._id });
    initializeNewOrder(order, { quickOrder: req.body.quickOrder === true, userName: req.user.name });
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
      ...mergeProductionWorkflow(orders),
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
      priority: orders.some(order=>order.priority==='urgente') ? 'urgente' : orders.some(order=>order.priority==='alta') ? 'alta' : 'normal',
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
    const editableFields = ['client', 'items', 'discount', 'downPayment', 'deliveryDate', 'observations', 'installments', 'paymentMethod', 'priority', 'skippedStages'];
    const changes = Object.fromEntries(editableFields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    if (changes.client === '') changes.client = null;
    if (changes.client && (!mongoose.isValidObjectId(changes.client) || !await Client.exists({ _id: changes.client }))) {
      return res.status(400).json({ message: 'Cliente inválido ou não encontrado' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (order.quickSaleKey) return res.status(400).json({ message: 'Vendas de balcão concluídas possuem recibo individual e não podem ser editadas' });
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

export function createOrderDeleteHandler({ OrderModel = Order } = {}) {
  return async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) throw new Error('Identificador de pedido inválido');
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
      if (order.quickSaleKey) throw new Error('Vendas de balcão mantêm o recibo para impedir cobrança duplicada e não podem ser excluídas');
      await OrderModel.findByIdAndDelete(req.params.id);
      return res.json({ ok: true });
    } catch (error) { return res.status(400).json({ message: error.message }); }
  };
}
router.delete('/:id', adminOnly, createOrderDeleteHandler());

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

export function createProductionStateHandler(action, { OrderModel = Order } = {}) {
  const requiredProduction = {start:'nao_iniciado',pause:'em_producao',resume:'pausado'}[action];
  return async (req,res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) throw new Error('Identificador de pedido inv\u00e1lido');
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({message:'Pedido n\u00e3o encontrado'});
      if (order.status !== 'aprovado' || order.production !== requiredProduction) throw new Error('O pedido n\u00e3o permite esta a\u00e7\u00e3o de produ\u00e7\u00e3o');
      if (action === 'pause' && (typeof req.body?.note !== 'string' || !req.body.note.trim())) throw new Error('O motivo da pausa \u00e9 obrigat\u00f3rio');
      const at = new Date();
      const updated = await OrderModel.findOneAndUpdate({_id:order._id,status:'aprovado',production:requiredProduction,productionStage:order.productionStage ?? {$exists:false}}, {
        $set:{production:action==='pause'?'pausado':'em_producao',...(action==='pause'?{productionPausedAt:at}:{}),...(action==='start'&&!order.productionStartedAt?{productionStartedAt:at}:{})},
        $push:{history:{action:{start:'producao_iniciada',pause:'pausado',resume:'retomado'}[action],by:req.user.name,at,...(action==='pause'?{note:req.body.note.trim()}:{})}},
      },{new:true,runValidators:true});
      if (!updated) return res.status(409).json({message:'Produ\u00e7\u00e3o alterada; atualize o pedido'});
      return res.json(updated);
    } catch(error) { return res.status(400).json({message:error.message}); }
  };
}
router.post('/:id/production/start', createProductionStateHandler('start'));
router.post('/:id/production/pause', createProductionStateHandler('pause'));
router.post('/:id/production/resume', createProductionStateHandler('resume'));

// Concluir pedido (produção concluída + status concluído)
router.post('/:id/complete', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  if (order.status !== 'aprovado' || !['em_producao', 'pausado'].includes(order.production)) return res.status(400).json({ message: 'O pedido precisa estar em produção para ser concluído' });
  if (order.productionStage && nextProductionStage(order, order.productionStage).toStage !== 'entregue') return res.status(400).json({ message: 'Avance pelas etapas antes de concluir o pedido' });
  order.productionStage = 'entregue';
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
