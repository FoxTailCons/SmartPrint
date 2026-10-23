import { Router } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import rateLimit from 'express-rate-limit';
import Order from '../models/Order.js';
import Client from '../models/Client.js';
import Product from '../models/Product.js';
import { calendarDate, effectiveStage, nextProductionStage, boardOrders, mergeProductionWorkflow, initialProductionStage } from '../services/productionWorkflow.js';
import { normalizeItemMetadata } from '../services/orderItemPricing.js';
import { buildCatalogOrderItem } from '../services/orderItemPricing.js';
import { receiveDownPayment, recalculatePaidInstallments, recalculateUnpaidInstallments } from '../services/orderInstallments.js';
import { isConfirmedOrder } from '../services/orderStatus.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';
import { protect, adminOnly, allowRoles } from '../middleware/auth.js';
import { productCategories, productCategoryLabels } from '../models/Product.js';
import { getOrderSettings } from '../config/orderSettings.js';
import { calculateOrderFinalValue, registeredClientError, requiresRegisteredClient } from '../services/orderClientRequirement.js';
import { applyOrderRoleVisibility, projectProductionOrder } from '../services/orderCostVisibility.js';
import { authorizeOrderAction } from '../services/adminAuthorization.js';
import { getOrderBalance, getOrderDiscountTotal, getOrderPaymentStatus } from '../services/orderBalance.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { recordAuditEvent } from '../services/auditLog.js';

const router = Router();
export const adminAuthorizationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === 'admin' || !req.body?.adminAuthorization,
  message: { message: 'Muitas tentativas de autorização administrativa. Tente novamente em alguns minutos.' },
});
router.use(protect);
router.use((req, res, next) => {
  if (req.user?.role === 'admin') return next();
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(applyOrderRoleVisibility(body, req.user?.role));
  return next();
});

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d) =>
  d ? new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-03:00` : d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'a combinar';

const orderItemError = (message) => Object.assign(new Error(message), { statusCode: 400 });
export const normalizeOrderAttachments = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) throw orderItemError('Lista de anexos inválida');
  return value.map((attachment) => {
    const label = typeof attachment?.label === 'string' ? attachment.label.trim() : '';
    const url = typeof attachment?.url === 'string' ? attachment.url.trim() : '';
    if (!label || label.length > 100 || url.length > 2048) throw orderItemError('Informe nome e link válido para cada anexo');
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error();
    } catch {
      throw orderItemError('Links de anexos devem usar HTTP ou HTTPS');
    }
    return { label, url };
  });
};

export const buildOrderDocumentLabel = (order) => (
  order?.status === 'cancelado' ? 'Cancelado' : isConfirmedOrder(order) ? 'Pedido' : 'Orçamento'
);
export const buildQuoteValidityDate = (order, validityDays) => {
  if (buildOrderDocumentLabel(order) !== 'Orçamento') return null;
  const createdAt = new Date(order.createdAt || Date.now());
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Data de emissão do orçamento inválida');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(createdAt);
  const date = new Date(Date.UTC(
    Number(parts.find((part) => part.type === 'year').value),
    Number(parts.find((part) => part.type === 'month').value) - 1,
    Number(parts.find((part) => part.type === 'day').value) + validityDays,
  ));
  return date.toISOString().slice(0, 10);
};

export const normalizeWhatsappPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return null;
};

export const canReceivePayments = (order) => !['pendente', 'cancelado'].includes(order.status);
const printCompany = {
  name: 'SMART PRINT LINDÓIA',
  cnpj: '30.792.498/0001-33',
  address: 'Rua Doutor Francisco Tozzi, 235',
  neighborhood: 'Jardim Redentor',
  city: 'Lindóia',
  state: 'SP',
  zipCode: '13958-040',
  phone: '(19) 99803-1407',
};

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

export const buildOrderItems = async (items, existingItems = [], ProductModel = Product) => Promise.all(items.map(async (item) => {
  const previousItem = item?._id && typeof existingItems.id === 'function'
    ? existingItems.id(item._id)
    : null;
  const metadata = normalizeItemMetadata({ ...(previousItem?.toObject?.() ?? previousItem), ...item });
  if (!item?.productId) {
    if (!item || typeof item.description !== 'string' || !item.description.trim() || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 || typeof item.unitPrice !== 'number' || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw orderItemError('Item ou preço inválido');
    if (!Number.isFinite(item.quantity * item.unitPrice + (metadata.installationFee || 0) + (metadata.travelFee || 0))) throw orderItemError('Total do item inválido');
    if (item.category && !productCategories.includes(item.category)) throw orderItemError('Categoria do item inválida');
    const { costUnitPrice, ...freeItem } = item;
    return { ...freeItem, ...metadata, category: item.category || undefined, productId: undefined, pricingBasis: undefined };
  }
  if (!mongoose.isValidObjectId(item.productId)) throw orderItemError('Produto inválido');

  const hasMatchingSnapshot = previousItem
    && String(previousItem.productId) === String(item.productId)
    && previousItem.productName
    && previousItem.saleUnit
    && Number.isFinite(previousItem.unitPrice);
  const product = await ProductModel.findById(item.productId);
  if (!product || (!product.active && !hasMatchingSnapshot)) {
    throw orderItemError('Produto não encontrado ou inativo');
  }

  const pricingSnapshot = hasMatchingSnapshot
    ? {
      productName: previousItem.productName,
      saleUnit: previousItem.saleUnit,
      unitPrice: previousItem.unitPrice,
      ...(typeof previousItem.costUnitPrice === 'number' ? { costUnitPrice: previousItem.costUnitPrice } : {}),
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

  return { ...calculatedItem, category: product.category, ...(hasMatchingSnapshot ? { _id: previousItem._id } : {}) };
}));

export const itemDocumentDetails = (item) => {
  const labels = {category:'Categoria',serviceName:'Serviço',material:'Material',finishing:'Acabamento',applicationLocation:'Local',promisedDate:'Prazo',artworkUrl:'Arte',installationNotes:'Instalação'};
  const lines = Object.entries(labels).filter(([key])=>item[key]).map(([key,label])=>`${label}: ${key==='promisedDate'?fmtDate(item[key]):key==='category'?productCategoryLabels[item[key]]:item[key]}`);
  for (const [key,label] of [['installationFee','Instalação'],['travelFee','Deslocamento']]) if(item[key]) lines.push(`${label}: ${fmtMoney(item[key])}`);
  return lines;
};

export const buildOrderPdfBuffer = async (order, settings = getOrderSettings()) => {
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
    const validityDate = buildQuoteValidityDate(order, settings.quoteValidityDays);
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
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(printCompany.name, 330, 18, { width: 235, align: 'right' });
    doc.font('Helvetica').fontSize(10).text(`CNPJ: ${printCompany.cnpj}`, 330, 34, { width: 235, align: 'right' });
    doc.text(printCompany.address, 330, 50, { width: 235, align: 'right' });
    doc.text(`${printCompany.neighborhood} · ${printCompany.city}-${printCompany.state}`, 330, 66, { width: 235, align: 'right' });
    doc.moveTo(left, 91).lineTo(right, 91).lineWidth(1).stroke('#6b7280');

    doc.rect(left + 18, 96, contentWidth - 36, 27).fill('#000');
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#fff').text(`${documentLabel} Nº ${order.number || '00000'}`, left + 18, 103, { width: contentWidth - 36, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(
      validityDate ? `Válido até: ${fmtDate(validityDate)}` : 'Documento SmartPrint',
      left, 133, { width: contentWidth, align: 'center' }
    );

    labelValue('Data de Emissão', fmtDate(order.createdAt), left + 40, 153, 220);
    labelValue('Prev. Entrega', fmtDate(calendarDate(order.deliveryDate)), 350, 153, 190);
    labelValue('Cliente', client.name || 'Cliente não cadastrado', left + 48, 175, contentWidth - 96);
    const clientAddress = [
      [client.address, client.addressNumber].filter(Boolean).join(', '),
      client.addressComplement,
    ].filter(Boolean).join(' - ');
    labelValue('Endereço', clientAddress || '—', left + 48, 197, 230);
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
    const pixKey = order.paymentMethod === 'pix' ? settings.businessPixKey : '';
    const paymentBoxHeight = pixKey ? 54 : 39;
    doc.rect(left, paymentY, contentWidth, paymentBoxHeight).stroke('#111827');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Forma de Pagamento:', left + 185, paymentY + 8, { continued: true });
    doc.font('Helvetica').text(` ${paymentLabel}`);
    if (pixKey) doc.font('Helvetica').fontSize(9).text(`PIX: ${pixKey}`, left + 42, paymentY + 30, { width: contentWidth - 84, align: 'center' });
    currentY = paymentY + paymentBoxHeight + 7;
    doc.font('Helvetica-Bold').fontSize(9).text('Observa\u00e7\u00f5es:', left + 42, currentY);
    currentY += 15;
    doc.font('Helvetica').fontSize(9);
    const attachmentText = (order.attachments || []).map((item) => `${item.label}: ${item.url}`).join('\n');
    const observationText = [order.observations, attachmentText].filter(Boolean).join('\n');
    const observationLines = observationText ? wrapLines(observationText, contentWidth - 55) : [];
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
    const businessDetails = [
      `CNPJ: ${printCompany.cnpj}`,
      `Endereço: ${printCompany.address} · ${printCompany.neighborhood} · ${printCompany.city}-${printCompany.state}`,
      `CEP: ${printCompany.zipCode}`,
      `Telefone: ${printCompany.phone}`,
      settings.businessAddress && settings.businessAddress !== `${printCompany.address} · ${printCompany.neighborhood} · ${printCompany.city}-${printCompany.state}`
        && `Endereço adicional: ${settings.businessAddress}`,
      settings.businessPhone && settings.businessPhone !== printCompany.phone
        && `Telefone adicional: ${settings.businessPhone}`,
      settings.businessInstagram && `Instagram: ${settings.businessInstagram}`,
    ].filter(Boolean).join(' · ');
    const businessLines = businessDetails ? wrapLines(businessDetails, contentWidth - 84) : [];
    businessLines.forEach((line, index) => doc.font('Helvetica').fontSize(8).text(line, left + 42, complementY + 39 + index * 10, { width: contentWidth - 84 }));
    const signatureY = Math.max(complementY + 75 + Math.max(0, businessLines.length - 3) * 10, currentY >= paymentY && paymentY + 180 < pageBottom ? paymentY + 180 : 0);
    doc.moveTo(left, signatureY).lineTo(left + 220, signatureY).stroke('#111827');
    doc.moveTo(right - 220, signatureY).lineTo(right, signatureY).stroke('#111827');
    doc.font('Helvetica').fontSize(8).fillColor('#111827').text(client.name || 'Cliente', left, signatureY + 7, { width: 220, align: 'center' });
    doc.text('SmartPrint', right - 220, signatureY + 7, { width: 220, align: 'center' });
    doc.moveTo(left, 805).lineTo(right, 805).stroke('#111827');

    doc.end();
  });
};

// Monta texto para envio via WhatsApp (usado no front com wa.me)
export const buildWhatsappText = (order, client, settings = getOrderSettings()) => {
  if (!String(order?.number || '').trim()) throw new Error('Número do pedido inválido para compartilhar');
  if (!Array.isArray(order?.items) || order.items.length === 0) throw new Error('O pedido não possui itens para compartilhar');
  if (order.items.some((item) => (
    !String(item.description || '').trim()
    || !Number.isFinite(Number(item.quantity))
    || !Number.isFinite(Number(item.unitPrice))
    || !Number.isFinite(Number(item.total))
  ))) throw new Error('O pedido contém item ou valores inválidos para compartilhar');
  const lines = [];
  const clientName = client?.name || 'Cliente não cadastrado';
  const subtotal = Number(order.totalValue ?? order.items.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const discount = Number(order.discount || 0);
  const finalValue = Number(order.finalValue ?? calculateOrderFinalValue(order.items, discount));
  if (!Number.isFinite(subtotal) || !Number.isFinite(finalValue)) throw new Error('O pedido possui total inválido para compartilhar');
  const documentLabel = buildOrderDocumentLabel(order).toUpperCase();
  const validityDate = buildQuoteValidityDate(order, settings.quoteValidityDays);
  lines.push('*SMART PRINT*');
  lines.push('gráfica e comunicação visual');
  lines.push(`*${documentLabel} Nº ${order.number}*`);
  lines.push('');
  lines.push(`Cliente: ${clientName}`);
  lines.push(`Data de Emissão: ${fmtDate(order.createdAt)}`);
  lines.push(`Prev. Entrega: ${fmtDate(calendarDate(order.deliveryDate))}`);
  if (validityDate) lines.push(`Válido até: ${fmtDate(validityDate)}`);
  if (settings.businessAddress) lines.push(`Endereço: ${settings.businessAddress}`);
  if (settings.businessPhone) lines.push(`Telefone: ${settings.businessPhone}`);
  if (settings.businessInstagram) lines.push(`Instagram: ${settings.businessInstagram}`);
  lines.push('');
  lines.push('*Cod | Produto | Qtde | Valor Un. | Desc R$ | Total*');
  (order.items || []).forEach((it, index) => {
    lines.push(...itemDocumentDetails(it));
    lines.push(`${it.code || String(index + 1).padStart(3, '0')} | ${it.description} | ${Number(it.quantity || 0).toFixed(4).replace('.', ',')} | ${fmtMoney(it.unitPrice)} | R$ 0,00 | ${fmtMoney(it.total)}`);
  });
  lines.push(`Total Desconto: ${fmtMoney(discount)}`);
  lines.push(`*VALOR TOTAL: ${fmtMoney(finalValue)}*`);
  lines.push(`Forma de Pagamento: ${String(order.paymentMethod || 'a combinar').toUpperCase()}`);
  if (order.paymentMethod === 'pix' && settings.businessPixKey) lines.push(`PIX: ${settings.businessPixKey}`);
  if (getOrderDiscountTotal(order) > 0) lines.push(`Desconto no recebimento: ${fmtMoney(getOrderDiscountTotal(order))}`);
  if (order.amountPaid > 0) lines.push(`Pago: ${fmtMoney(order.amountPaid)} | Saldo: ${fmtMoney(getOrderBalance(order))}`);
  if (order.observations) lines.push(`Observações: ${order.observations}`);
  for (const attachment of order.attachments || []) lines.push(`Anexo — ${attachment.label}: ${attachment.url}`);
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
  if (status === 'active') filter.status = { $in: ['pendente', 'aprovado'] };
  else if (status === 'closed') filter.status = { $in: ['concluido', 'cancelado'] };
  else if (status) filter.status = status;
  if (paymentStatus && paymentStatusExpressions[paymentStatus]) {
    filter.$expr = paymentStatusExpressions[paymentStatus];
  } else if (paymentStatus) filter.paymentStatus = paymentStatus;
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
    for (const order of orders) {
      if (order.finalValue !== undefined && order.finalValue !== null) order.paymentStatus = getOrderPaymentStatus(order);
    }
    return res.json(orders);
  }

  const total = await OrderModel.countDocuments(filter);
  const page = getEffectivePage(pagination.page, pagination.pageSize, total);
  const items = await OrderModel.find(filter)
    .populate('client', 'name phone')
    .sort({ createdAt: -1 })
    .skip((page - 1) * pagination.pageSize)
    .limit(pagination.pageSize);
  for (const order of items) {
    if (order.finalValue !== undefined && order.finalValue !== null) order.paymentStatus = getOrderPaymentStatus(order);
  }
  return res.json(buildPage(items, page, pagination.pageSize, total));
};

router.get('/', allowRoles('admin', 'atendente'), createOrderListHandler());

const confirmedOrdersFilter = {
  status: { $ne: 'cancelado' },
  $or: [
    { status: { $in: ['aprovado', 'concluido'] } },
    { amountPaid: { $gt: 0 } },
  ],
};

const paymentDiscountTotalExpression = {
  $sum: {
    $map: {
      input: { $ifNull: ['$paymentDiscounts', []] },
      as: 'discount',
      in: {
        $cond: [
          { $ifNull: ['$$discount.canceledAt', false] },
          0,
          { $ifNull: ['$$discount.amount', 0] },
        ],
      },
    },
  },
};

const receivableBalanceExpression = {
  $max: [
    0,
    {
      $subtract: [
        {
          $subtract: [
            { $ifNull: ['$finalValue', 0] },
            { $ifNull: ['$amountPaid', 0] },
          ],
        },
        paymentDiscountTotalExpression,
      ],
    },
  ],
};

const paymentStatusExpressions = {
  quitado: { $lte: [receivableBalanceExpression, 0.01] },
  pago: { $lte: [receivableBalanceExpression, 0.01] },
  parcial: {
    $and: [
      { $gt: [receivableBalanceExpression, 0.01] },
      {
        $or: [
          { $gt: [{ $ifNull: ['$amountPaid', 0] }, 0] },
          { $gt: [paymentDiscountTotalExpression, 0] },
        ],
      },
    ],
  },
  aberto: {
    $and: [
      { $gt: [receivableBalanceExpression, 0.01] },
      { $lte: [{ $ifNull: ['$amountPaid', 0] }, 0] },
      { $lte: [paymentDiscountTotalExpression, 0] },
    ],
  },
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

router.get('/receivables', allowRoles('admin', 'atendente'), createReceivablesListHandler());

export function createProductionBoardHandler({ OrderModel = Order, now = () => new Date() } = {}) {
  return async (req,res) => {
    try {
      const at = now();
      const rows = await OrderModel.find({$or:[{status:'aprovado'},{status:'concluido',completedAt:{$gte:new Date(at-7*86400000)}}],quickSaleKey:{$exists:false}}).populate('client','name phone').populate('productionAssignee','name role').lean();
      return res.json(boardOrders(rows,req.query,at).map(projectProductionOrder));
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
const taskRoles = ['admin', 'atendente', 'producao'];
const taskStages = ['arte', 'impressao', 'acabamento'];
const taskActionStates = {
  start: { production: 'nao_iniciado', next: 'em_producao', history: 'producao_iniciada' },
  pause: { production: 'em_producao', next: 'pausado', history: 'pausado' },
  resume: { production: 'pausado', next: 'em_producao', history: 'retomado' },
  complete: { production: 'em_producao' },
};
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

export function createProductionAssignmentHandler({ OrderModel = Order, UserModel = User } = {}) {
  return async (req, res) => {
    try {
      if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Somente o administrador pode alocar profissionais' });
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
      const { expectedStage, assigneeId } = req.body || {};
      if (!taskStages.includes(expectedStage) || (assigneeId !== null && !mongoose.isValidObjectId(assigneeId))) {
        return res.status(400).json({ message: 'Etapa ou profissional inválido' });
      }
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
      if (order.status !== 'aprovado' || order.production === 'concluido' || effectiveStage(order) !== expectedStage) {
        return res.status(409).json({ message: 'Etapa alterada; atualize o pedido' });
      }
      let assignee = null;
      if (assigneeId) {
        assignee = await UserModel.findById(assigneeId);
        if (!assignee || !assignee.active || assignee.archivedAt || !['atendente', 'producao'].includes(assignee.role)) {
          return res.status(400).json({ message: 'Selecione um atendente ou profissional de produção ativo' });
        }
      }
      const at = new Date();
      const filter = {
        _id: order._id,
        status: 'aprovado',
        production: order.production,
        productionStage: order.productionStage ?? { $exists: false },
        productionAssignee: order.productionAssignee || null,
      };
      const updated = await OrderModel.findOneAndUpdate(filter, {
        $set: { productionAssignee: assignee?._id || null },
        $push: { history: {
          action: 'producao.alocada',
          by: req.user.name,
          at,
          note: assignee ? `Alocado para ${assignee.name}` : 'Alocação removida',
          assignedTo: assignee?._id,
          assignedName: assignee?.name || '',
          fromStage: expectedStage,
        } },
      }, { new: true, runValidators: true });
      if (!updated) return res.status(409).json({ message: 'Pedido alterado; atualize os dados' });
      return res.json(updated);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível alocar o profissional' });
    }
  };
}

export function createProductionTaskHandler({ OrderModel = Order } = {}) {
  return async (req, res) => {
    try {
      if (!taskRoles.includes(req.user?.role)) return res.status(403).json({ message: 'Perfil sem permissão para tarefas de produção' });
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
      const { action, expectedStage, note } = req.body || {};
      const transition = taskActionStates[action];
      if (!transition || !taskStages.includes(expectedStage)) return res.status(400).json({ message: 'Ação ou etapa inválida' });
      const cleanNote = typeof note === 'string' ? note.trim() : '';
      if (['pause', 'complete'].includes(action) && (!cleanNote || cleanNote.length > 500)) {
        return res.status(400).json({ message: 'Informe uma justificativa de 1 a 500 caracteres' });
      }
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
      if (order.status !== 'aprovado' || effectiveStage(order) !== expectedStage || order.production !== transition.production) {
        return res.status(409).json({ message: 'Etapa ou status alterado; atualize o pedido' });
      }
      if (req.user.role !== 'admin' && !sameId(order.productionAssignee, req.user._id)) {
        return res.status(403).json({ message: 'Somente o profissional alocado pode executar esta tarefa' });
      }
      const at = new Date();
      const filter = {
        _id: order._id,
        status: 'aprovado',
        production: transition.production,
        productionStage: order.productionStage ?? { $exists: false },
        productionAssignee: order.productionAssignee || null,
      };
      const next = action === 'complete' ? nextProductionStage(order, expectedStage) : null;
      const delivered = next?.toStage === 'entregue';
      const set = action === 'complete'
        ? {
            productionStage: next.toStage,
            skippedStages: next.skippedStages,
            production: delivered ? 'concluido' : 'nao_iniciado',
            productionAssignee: null,
            productionPausedAt: null,
            ...(delivered ? { status: 'concluido', completedAt: at } : {}),
            ...(!order.productionStartedAt ? { productionStartedAt: at } : {}),
          }
        : {
            production: transition.next,
            ...(action === 'start' && !order.productionStage ? { productionStage: expectedStage } : {}),
            ...(action === 'start' && !order.productionStartedAt ? { productionStartedAt: at } : {}),
            ...(action === 'pause' ? { productionPausedAt: at } : {}),
            ...(action === 'resume' ? { productionPausedAt: null } : {}),
          };
      const updated = await OrderModel.findOneAndUpdate(filter, {
        $set: set,
        $push: { history: {
          action: action === 'complete' ? (delivered ? 'concluido' : 'etapa_concluida') : transition.history,
          by: req.user.name,
          at,
          note: cleanNote,
          ...(action === 'complete' ? { fromStage: next.fromStage, toStage: next.toStage, skippedStages: next.skippedStages } : {}),
        } },
      }, { new: true, runValidators: true });
      if (!updated) return res.status(409).json({ message: 'Tarefa alterada; atualize os dados' });
      return res.json(updated);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Não foi possível atualizar a tarefa' });
    }
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

router.get('/production-board', allowRoles('admin', 'atendente', 'producao'), createProductionBoardHandler());
router.get('/production-assignees', allowRoles('admin', 'atendente', 'producao'), async (_req, res) => {
  try {
    const users = await User.find({ active: true, archivedAt: null, role: { $in: ['atendente', 'producao'] } }).select('_id name role').sort({ name: 1 }).lean();
    return res.json(users);
  } catch {
    return res.status(500).json({ message: 'Não foi possível carregar os profissionais ativos' });
  }
});
router.get('/settings', allowRoles('admin', 'atendente'), (req, res) => {
  try {
    const { clientRequiredThreshold } = getOrderSettings();
    return res.json({ clientRequiredThreshold });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
router.post('/quick-sale', allowRoles('admin', 'atendente'), createQuickSaleHandler());
router.post('/:id/production/assignment', allowRoles('admin'), createProductionAssignmentHandler());
router.post('/:id/production/task', allowRoles('admin', 'atendente', 'producao'), createProductionTaskHandler());
router.post('/:id/production/advance', allowRoles('admin', 'atendente'), createProductionAdvanceHandler());

router.get('/:id', allowRoles('admin', 'atendente', 'producao'), async (req, res) => {
  const order = await Order.findById(req.params.id).populate('client');
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  res.json(req.user?.role === 'producao' ? projectProductionOrder(order) : order);
});

// Criar orçamento/pedido
export function createOrderCreateHandler({
  OrderModel = Order,
  ClientModel = Client,
  ProductModel = Product,
  settingsProvider = getOrderSettings,
} = {}) {
  return async (req, res) => {
    try {
      if ('quickOrder' in (req.body || {}) && typeof req.body.quickOrder !== 'boolean') {
        return res.status(400).json({ message: 'Opção de pedido rápido inválida' });
      }
      if (req.body.quickOrder === true) {
        return res.status(400).json({ message: 'Pedido rápido deve usar o fluxo de venda rápida' });
      }
      const rawClientId = req.body?.client;
      if (rawClientId && !mongoose.isValidObjectId(rawClientId)) return res.status(400).json({ message: 'Cliente inválido' });
      const client = rawClientId ? await ClientModel.findById(rawClientId) : null;
      if (rawClientId && !client) return res.status(400).json({ message: 'Cliente não encontrado' });
      if (!Array.isArray(req.body?.items) || !req.body.items.some((item) => item?.productId || item?.description?.trim())) {
        return res.status(400).json({ message: 'Informe pelo menos um item do pedido' });
      }
      const fields = ['client', 'items', 'discount', 'downPayment', 'deliveryDate', 'observations', 'installments', 'paymentMethod', 'priority', 'skippedStages'];
      const payload = Object.fromEntries(fields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
      if ('attachments' in req.body) payload.attachments = normalizeOrderAttachments(req.body.attachments);
      if (payload.client === '') payload.client = null;
      payload.items = await buildOrderItems(payload.items, [], ProductModel);
      const { clientRequiredThreshold } = settingsProvider();
      const finalValue = calculateOrderFinalValue(payload.items, payload.discount);
      if (requiresRegisteredClient({ finalValue, items: payload.items, clientRequiredThreshold })) {
        const validationError = registeredClientError(client);
        if (validationError) return res.status(400).json({ message: validationError });
      }
      const order = await OrderModel.create({ ...payload, productionStage: initialProductionStage(payload.skippedStages), createdBy: req.user._id });
      initializeNewOrder(order, { userName: req.user.name });
      await order.save();
      return res.status(201).json(order);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  };
}
router.post('/', allowRoles('admin', 'atendente'), createOrderCreateHandler());

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
    if (orders.some((order) => order.status === 'cancelado')) {
      throw new Error('Pedidos cancelados não podem ser agregados');
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

export function createOrderUpdateHandler({
  OrderModel = Order,
  ClientModel = Client,
  ProductModel = Product,
  settingsProvider = getOrderSettings,
} = {}) {
  return async (req, res) => {
    try {
      const editableFields = ['client', 'items', 'discount', 'downPayment', 'deliveryDate', 'observations', 'installments', 'paymentMethod', 'priority', 'skippedStages'];
      const changes = Object.fromEntries(editableFields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
      if ('attachments' in req.body) changes.attachments = normalizeOrderAttachments(req.body.attachments);
      if (changes.client === '') changes.client = null;
      if (changes.client && !mongoose.isValidObjectId(changes.client)) {
        return res.status(400).json({ message: 'Cliente inválido ou não encontrado' });
      }
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
      if (order.quickSaleKey) return res.status(400).json({ message: 'Vendas de balcão concluídas possuem recibo individual e não podem ser editadas' });
      if (order.status === 'cancelado') return res.status(409).json({ message: 'Pedidos cancelados não podem ser editados' });
      if (order.status !== 'pendente' && 'downPayment' in changes
        && Number(changes.downPayment) !== Number(order.downPayment || 0)) {
        return res.status(400).json({ message: 'A entrada não pode ser alterada após a aprovação do pedido' });
      }
      if ('items' in changes) {
        if (!Array.isArray(changes.items)) return res.status(400).json({ message: 'Lista de itens inválida' });
        changes.items = await buildOrderItems(changes.items, order.items, ProductModel);
      }
      const candidateItems = changes.items || order.items;
      const candidateDiscount = 'discount' in changes ? changes.discount : order.discount;
      const { clientRequiredThreshold } = settingsProvider();
      const finalValue = calculateOrderFinalValue(candidateItems, candidateDiscount);
      const candidateClientId = 'client' in changes ? changes.client : order.client;
      let candidateClient = null;
      if (candidateClientId && 'client' in changes) {
        candidateClient = await ClientModel.findById(candidateClientId);
        if (!candidateClient) return res.status(400).json({ message: 'Cliente inválido ou não encontrado' });
      }
      if (order.status === 'pendente' && requiresRegisteredClient({ finalValue, items: candidateItems, clientRequiredThreshold })) {
        if (candidateClientId && !candidateClient) candidateClient = await ClientModel.findById(candidateClientId);
        const validationError = registeredClientError(candidateClient);
        if (validationError) return res.status(400).json({ message: validationError });
      }
      Object.assign(order, changes);
      await order.save();
      return res.json(await order.populate('client'));
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  };
}
router.put('/:id', allowRoles('admin', 'atendente'), createOrderUpdateHandler());

export function createOrderDeleteHandler({ OrderModel = Order, AuditLogModel = AuditLog } = {}) {
  return async (req, res) => {
    let order;
    try {
      if (!mongoose.isValidObjectId(req.params.id)) throw new Error('Identificador de pedido inválido');
      order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
      if (order.quickSaleKey) throw new Error('Vendas de balcão mantêm o recibo para impedir cobrança duplicada e não podem ser excluídas');
      await OrderModel.findByIdAndDelete(req.params.id);
    } catch (error) { return res.status(400).json({ message: error.message }); }
    try {
      await recordAuditEvent({
        AuditLogModel,
        req,
        action: 'pedido.excluido',
        details: { pedidoId: String(order._id), numero: order.number || '' },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'O pedido foi excluído, mas não foi possível registrar a auditoria' });
    }
    return res.json({ ok: true });
  };
}
router.delete('/:id', adminOnly, createOrderDeleteHandler());

export function createOrderCancelHandler({
  OrderModel = Order,
  UserModel = User,
  AuditLogModel = AuditLog,
} = {}) {
  return async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
    const requestedReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const reason = requestedReason || (req.user?.role === 'admin'
      ? 'Cancelamento realizado diretamente pelo administrador.'
      : '');
    if (!reason || reason.length > 500) return res.status(400).json({ message: 'Informe o motivo do cancelamento (até 500 caracteres)' });
    const order = await OrderModel.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (order.status === 'cancelado' || order.status === 'concluido') {
      return res.status(409).json({ message: 'Este pedido não permite cancelamento' });
    }
    const hasPayments = Number(order.amountPaid || 0) !== 0
      || (order.payments || []).length > 0
      || (order.history || []).some((entry) => entry.action === 'pagamento');
    if (hasPayments) return res.status(409).json({ message: 'Pedidos com pagamentos registrados não podem ser cancelados' });

    const authorizedBy = await authorizeOrderAction({
      requester: req.user,
      adminAuthorization: req.body?.adminAuthorization,
      UserModel,
    });
    if (!authorizedBy) {
      try {
        await recordAuditEvent({
          AuditLogModel,
          req,
          action: 'autorizacao.cancelamento',
          details: { pedidoId: String(order._id), numero: order.number || '', motivo: reason },
          success: false,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Não foi possível registrar a tentativa de autorização' });
      }
      return res.status(401).json({ message: 'Credenciais de autorização administrativa inválidas' });
    }

    order.status = 'cancelado';
    order.history.push({
      action: 'cancelado',
      by: req.user.name,
      note: `Motivo: ${reason}. Autorizado por ${authorizedBy.name}.`,
    });
    try {
      await order.save();
    } catch (error) {
      if (error?.name === 'VersionError') return res.status(409).json({ message: 'O pedido foi atualizado por outra operação; recarregue antes de cancelar' });
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível cancelar o pedido' });
    }
    try {
      await recordAuditEvent({
        AuditLogModel,
        req,
        authorizedBy,
        action: 'autorizacao.cancelamento',
        details: { pedidoId: String(order._id), numero: order.number || '', motivo: reason },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'O pedido foi cancelado, mas não foi possível registrar a auditoria' });
    }
    return res.json(order);
  };
}
router.post('/:id/cancel', allowRoles('admin', 'atendente'), adminAuthorizationLimiter, createOrderCancelHandler());

// ---- Ações de fluxo ----

// Aprovar orçamento (pendente -> aprovado)
router.post('/:id/approve', allowRoles('admin', 'atendente'), async (req, res) => {
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
    order.paymentStatus = getOrderPaymentStatus(order);
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
export function createPaymentHandler({ OrderModel = Order, UserModel = User, AuditLogModel = AuditLog } = {}) {
  return async (req, res) => {
    const {
      amount, date, installmentIndex, paymentMethod = 'pix', receiptUrl = '',
      discount = 0, discountReason, adminAuthorization,
    } = req.body || {};
    if (!['admin', 'atendente'].includes(req.user?.role)) {
      return res.status(403).json({ message: 'Perfil sem permissão para registrar pagamentos' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de pedido inválido' });
    const pay = Number(amount);
    const discountAmount = Number(discount);
    if (!Number.isFinite(pay) || pay <= 0) return res.status(400).json({ message: 'Valor recebido inválido' });
    if (!Number.isFinite(discountAmount) || discountAmount < 0) return res.status(400).json({ message: 'Valor do desconto inválido' });
    const reason = typeof discountReason === 'string' ? discountReason.trim() : '';
    if (discountAmount > 0 && (!reason || reason.length > 500)) {
      return res.status(400).json({ message: 'Informe o motivo do desconto (até 500 caracteres)' });
    }
    const methods = ['pix', 'dinheiro', 'debito', 'credito', 'parcelado'];
    if (!methods.includes(paymentMethod)) return res.status(400).json({ message: 'Forma de pagamento inválida' });
    if (typeof receiptUrl !== 'string') return res.status(400).json({ message: 'Link do comprovante inválido' });
    if (receiptUrl) {
      try {
        if (!['http:', 'https:'].includes(new URL(receiptUrl).protocol)) throw new Error();
      } catch {
        return res.status(400).json({ message: 'Link do comprovante deve usar HTTP ou HTTPS' });
      }
    }
    const paidAt = date ? new Date(date) : new Date();
    if (!Number.isFinite(paidAt.getTime())) return res.status(400).json({ message: 'Data de pagamento inválida' });

    const order = await OrderModel.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (order.status === 'cancelado') {
      return res.status(409).json({ message: 'Pedidos cancelados não aceitam pagamentos' });
    }
    if (!canReceivePayments(order)) {
      return res.status(400).json({ message: 'Aprove o orçamento antes de registrar pagamentos' });
    }
    const balanceBefore = getOrderBalance(order);
    if (pay + discountAmount > balanceBefore + 1e-8) {
      return res.status(400).json({ message: `Pagamento e desconto não podem exceder o saldo de ${fmtMoney(balanceBefore)}` });
    }
    if (installmentIndex !== undefined) {
      if (!Number.isInteger(installmentIndex) || !order.installments?.[installmentIndex]) {
        return res.status(400).json({ message: 'Parcela inválida' });
      }
      if (order.installments[installmentIndex].paid) return res.status(400).json({ message: 'Esta parcela já está paga' });
      if (pay + 0.01 < order.installments[installmentIndex].amount) {
        return res.status(400).json({ message: 'O pagamento precisa quitar a parcela selecionada ou ser lançado sem selecionar parcela' });
      }
    }

    let authorizedBy = null;
    if (discountAmount > 0) {
      authorizedBy = await authorizeOrderAction({ requester: req.user, adminAuthorization, UserModel });
      if (!authorizedBy) {
        try {
          await recordAuditEvent({
            AuditLogModel,
            req,
            action: 'autorizacao.desconto',
            details: { pedidoId: String(order._id), valor: discountAmount },
            success: false,
          });
        } catch (error) {
          console.error(error);
          return res.status(500).json({ message: 'Não foi possível registrar a tentativa de autorização' });
        }
        return res.status(401).json({ message: 'Credenciais de autorização administrativa inválidas' });
      }
      try {
        await recordAuditEvent({
          AuditLogModel,
          req,
          authorizedBy,
          action: 'autorizacao.desconto',
          details: { pedidoId: String(order._id), valor: discountAmount },
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Não foi possível registrar a autorização do desconto' });
      }
    }

    const payments = order.payments || [];
    const installments = order.installments || [];
    order.amountPaid = (order.amountPaid || 0) + pay;
    order.paymentMethod = paymentMethod;
    payments.push({
      amount: pay,
      method: paymentMethod,
      paidAt,
      receiptUrl,
      ...(installmentIndex !== undefined && installments[installmentIndex]._id
        ? { installmentIds: [installments[installmentIndex]._id] }
        : {}),
    });
    order.payments = payments;
    const recordedPayment = payments[payments.length - 1];

    if (installmentIndex !== undefined) {
      const installment = installments[installmentIndex];
      installment.paid = true;
      installment.paidAt = paidAt;
    } else {
      let remaining = pay;
      for (const installment of installments) {
        if (remaining <= 0) break;
        if (!installment.paid && installment.amount <= remaining) {
          installment.paid = true;
          installment.paidAt = paidAt;
          if (installment._id) (recordedPayment.installmentIds ||= []).push(installment._id);
          remaining -= installment.amount;
        }
      }
    }

    order.history.push({
      action: 'pagamento',
      by: req.user.name,
      paymentMethod,
      note: `Recebido ${fmtMoney(pay)} via ${paymentMethod}`,
    });
    if (discountAmount > 0) {
      order.paymentDiscounts.push({
        amount: discountAmount,
        reason,
        by: req.user.name,
        authorizedBy: { userId: authorizedBy._id, name: authorizedBy.name },
        paymentId: recordedPayment._id,
        at: paidAt,
      });
      order.history.push({
        action: 'desconto_pagamento',
        by: req.user.name,
        note: `Desconto de ${fmtMoney(discountAmount)} autorizado por ${authorizedBy.name}: ${reason}`,
      });
    }

    const balance = getOrderBalance(order);
    order.paymentStatus = getOrderPaymentStatus(order);
    if (balance <= 0.01) {
      order.installments = installments.filter((installment) => installment.paid);
    } else {
      recalculateUnpaidInstallments(installments, balance);
      order.installments = installments;
    }

    try {
      await order.save();
      if (discountAmount > balanceBefore * 0.1) {
        try {
          await recordAuditEvent({
            AuditLogModel,
            req,
            authorizedBy,
            action: 'pagamento.desconto_acima_limite',
            details: {
              pedidoId: String(order._id),
              desconto: discountAmount,
              saldoAnterior: balanceBefore,
              percentual: Number((discountAmount / balanceBefore * 100).toFixed(2)),
            },
          });
        } catch (error) {
          console.error(error);
          return res.status(500).json({ message: 'O pagamento foi registrado, mas não foi possível registrar a auditoria do desconto' });
        }
      }
      return res.json(order);
    } catch (error) {
      if (error?.name === 'VersionError') {
        return res.status(409).json({ message: 'O saldo foi alterado por outra operação. Atualize o pedido e tente novamente.' });
      }
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível registrar o pagamento' });
    }
  };
}

router.post('/:id/payments', allowRoles('admin', 'atendente'), adminAuthorizationLimiter, createPaymentHandler());

export function createPaymentCancellationHandler({
  OrderModel = Order,
  UserModel = User,
  AuditLogModel = AuditLog,
} = {}) {
  return async (req, res) => {
    if (!['admin', 'atendente'].includes(req.user?.role)) {
      return res.status(403).json({ message: 'Perfil sem permissão para estornar pagamentos' });
    }
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.paymentId)) {
      return res.status(400).json({ message: 'Identificador inválido' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 500) {
      return res.status(400).json({ message: 'Informe o motivo do estorno (até 500 caracteres)' });
    }

    const order = await OrderModel.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    const payment = (order.payments || []).find((entry) => String(entry._id) === req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Pagamento não encontrado' });
    if (payment.canceledAt) return res.status(409).json({ message: 'Este pagamento já foi estornado' });

    const authorizedBy = await authorizeOrderAction({
      requester: req.user,
      adminAuthorization: req.body?.adminAuthorization,
      UserModel,
    });
    if (!authorizedBy) {
      try {
        await recordAuditEvent({
          AuditLogModel,
          req,
          action: 'pagamento.estornado',
          details: {
            pedidoId: String(order._id),
            numero: order.number || '',
            pagamentoId: req.params.paymentId,
            valor: Number(payment.amount) || 0,
            motivo: reason,
          },
          success: false,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Não foi possível registrar a tentativa de estorno' });
      }
      return res.status(401).json({ message: 'Credenciais de autorização administrativa inválidas' });
    }

    const canceledAt = new Date();
    payment.canceledAt = canceledAt;
    payment.canceledBy = req.user.name;
    payment.cancellationReason = reason;
    for (const discount of order.paymentDiscounts || []) {
      if (String(discount.paymentId) === String(payment._id)) discount.canceledAt = canceledAt;
    }
    order.amountPaid = Math.max(0, (Number(order.amountPaid) || 0) - (Number(payment.amount) || 0));
    recalculatePaidInstallments(order);
    const balance = getOrderBalance(order);
    order.paymentStatus = getOrderPaymentStatus(order);
    if (balance <= 0.01) order.installments = (order.installments || []).filter((installment) => installment.paid);
    else recalculateUnpaidInstallments(order.installments || [], balance);
    order.history.push({
      action: 'pagamento_estornado',
      by: req.user.name,
      paymentMethod: payment.method,
      note: `Estornado ${fmtMoney(payment.amount)}: ${reason}`,
    });

    try {
      await order.save();
    } catch (error) {
      if (error?.name === 'VersionError') {
        return res.status(409).json({ message: 'O pedido foi atualizado por outra operação; recarregue antes de estornar' });
      }
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível estornar o pagamento' });
    }

    try {
      await recordAuditEvent({
        AuditLogModel,
        req,
        authorizedBy,
        action: 'pagamento.estornado',
        details: {
          pedidoId: String(order._id),
          numero: order.number || '',
          pagamentoId: req.params.paymentId,
          valor: Number(payment.amount) || 0,
          motivo: reason,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'O pagamento foi estornado, mas não foi possível registrar a auditoria' });
    }

    return res.json(order);
  };
}

router.post('/:id/payments/:paymentId/cancel', allowRoles('admin', 'atendente'), adminAuthorizationLimiter, createPaymentCancellationHandler());

export function createWhatsappHandler({ OrderModel = Order } = {}) {
  return async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Identificador de pedido inválido' });
      }
      const order = await OrderModel.findById(req.params.id).populate('client');
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
      const settings = getOrderSettings();
      const text = buildWhatsappText(order, order.client, settings);

      if (!order.client && !req.query.phone) {
        return res.json({ requiresPhone: true, text, documentLabel: buildOrderDocumentLabel(order) });
      }
      if (order.client && !String(order.client.phone || '').trim()) {
        return res.status(400).json({ message: 'Cadastre um telefone/WhatsApp para este cliente' });
      }
      const phone = normalizeWhatsappPhone(order.client?.phone || req.query.phone);
      if (!phone) {
        return res.status(400).json({ message: order.client
          ? 'O telefone cadastrado é inválido'
          : 'Informe um telefone WhatsApp válido com DDD' });
      }
      return res.json({
        text,
        phone,
        documentLabel: buildOrderDocumentLabel(order),
        link: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  };
}

router.get('/:id/whatsapp', allowRoles('admin', 'atendente'), createWhatsappHandler());

router.get('/:id/pdf', allowRoles('admin', 'atendente'), async (req, res) => {
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
