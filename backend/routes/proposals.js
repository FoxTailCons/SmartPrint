import { Router } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import Proposal from '../models/Proposal.js';
import Client from '../models/Client.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : 'a combinar';

const PROPOSAL_STATUSES = ['rascunho', 'enviada', 'aceita', 'rejeitada', 'cancelada'];

// Preenche o snapshot do cliente a partir do cadastro (preserva o histórico da proposta)
const fillClientSnapshot = async (proposal) => {
  if (!proposal.client) {
    proposal.clientSnapshot = { name: '', phone: '', email: '' };
    return;
  }
  const client = await Client.findById(proposal.client);
  if (client) {
    proposal.clientSnapshot = {
      name: client.name || '',
      phone: client.phone || '',
      email: client.email || '',
    };
  }
};

// Monta texto para envio via WhatsApp (usado no front com wa.me) — segue o padrão de buildWhatsappText de orders.js
const buildWhatsappText = (proposal, client) => {
  const lines = [];
  const clientName = client?.name || proposal.clientSnapshot?.name || 'Cliente não cadastrado';
  const total = Number(proposal.totalAmount || (proposal.items || []).reduce((sum, item) => sum + Number(item.total || 0), 0));
  lines.push('*SMART PRINT*');
  lines.push('gráfica e comunicação visual');
  lines.push(`*PROPOSTA Nº ${proposal.number}*`);
  lines.push('');
  lines.push(`Cliente: ${clientName}`);
  lines.push(`Data de Emissão: ${fmtDate(proposal.createdAt)}`);
  if (proposal.validityDate) lines.push(`Validade da proposta: ${fmtDate(proposal.validityDate)}`);
  if (proposal.deliveryTime) lines.push(`Prazo de entrega: ${proposal.deliveryTime}`);
  lines.push('');
  lines.push('*Item | Descrição | Qtde | Valor Un. | Total*');
  (proposal.items || []).forEach((it, index) => {
    lines.push(`${String(index + 1).padStart(3, '0')} | ${it.description} | ${Number(it.quantity || 0).toFixed(4).replace('.', ',')} ${it.unit || ''} | ${fmtMoney(it.unitPrice)} | ${fmtMoney(it.total)}`);
  });
  lines.push(`*VALOR TOTAL: ${fmtMoney(total)}*`);
  if (proposal.paymentTerms) lines.push(`Condições de pagamento: ${proposal.paymentTerms}`);
  if (proposal.observations) lines.push(`Observações: ${proposal.observations}`);
  lines.push('');
  lines.push('O PDF desta proposta pode ser baixado pelo botão Imprimir antes do envio.');
  lines.push('Agradecemos a preferência!');
  return lines.join('\n');
};

// Gera o PDF da proposta (mesmo estilo visual do PDF de pedidos)
export const buildProposalPdfBuffer = async (proposal) => {
  const client = proposal?.client || proposal?.clientSnapshot || {};
  const items = Array.isArray(proposal.items) ? proposal.items : [];
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 30;
    const right = pageWidth - 30;
    const contentWidth = right - left;

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
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#111827').text('smart print.', x, y + 42);
      doc.font('Helvetica').fontSize(7).fillColor('#111827').text('gráfica & comunicação visual', x + 3, y + 68);
    };

    drawLogo(left, 20);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(client.name || 'Cliente não cadastrado', 320, 22, { width: 245, align: 'right' });
    doc.font('Helvetica').fontSize(9).text(`Fone: ${client.phone || '—'}`, 320, 36, { width: 245, align: 'right' });
    doc.text(`E-mail: ${client.email || '—'}`, 320, 50, { width: 245, align: 'right' });

    doc.moveDown(4);
    doc.rect(left, doc.y, contentWidth, 24).fill('#111827');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#fff').text(`PROPOSTA Nº ${proposal.number || '00000'} — TÉCNICA & COMERCIAL`, left, doc.y - 17, { width: contentWidth, align: 'center' });
    doc.moveDown(1.5);

    if (proposal.projectTitle) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#00a6c7').text(proposal.projectTitle, left, doc.y, { width: contentWidth });
      doc.moveDown(0.5);
    }

    const infoTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Emissão:', left, infoTop, { continued: true });
    doc.font('Helvetica').text(` ${fmtDate(proposal.createdAt)}`);
    doc.font('Helvetica-Bold').text('Validade:', left + 180, infoTop, { continued: true });
    doc.font('Helvetica').text(` ${fmtDate(proposal.validityDate)}`);
    doc.font('Helvetica-Bold').text('Prazo:', left + 360, infoTop, { continued: true });
    doc.font('Helvetica').text(` ${proposal.deliveryTime || '—'}`);
    doc.moveDown(0.8);

    // Seções descritivas estruturadas (como no documento Soraya Cury)
    if (proposal.projectDescription) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('1. DESCRIÇÃO DO PROJETO');
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(proposal.projectDescription, { width: contentWidth });
      doc.moveDown(0.6);
    }

    if (proposal.areasContemplated) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('▌ 2. ÁREAS CONTEMPLADAS');
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(proposal.areasContemplated, { width: contentWidth });
      doc.moveDown(0.6);
    }

    if (proposal.executionProcess) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('▌ 3. PROCESSO DE EXECUÇÃO TÉCNICA');
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(proposal.executionProcess, { width: contentWidth });
      doc.moveDown(0.6);
    }

    if (proposal.specialCourtesy) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#00a6c7').text('★ CORTESIA ESPECIAL SMARTPRINT');
      doc.font('Helvetica').fontSize(9).fillColor('#111827').text(proposal.specialCourtesy, { width: contentWidth });
      doc.moveDown(0.6);
    }

    // 4. Investimento e Condições de Pagamento
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('▌ 4. INVESTIMENTO E CONDIÇÕES DE PAGAMENTO');
    doc.moveDown(0.3);

    const tableY = doc.y;
    const cols = { code: left, description: left + 35, quantity: 310, unit: 375, unitPrice: 440, total: 510 };
    doc.rect(left, tableY, contentWidth, 20).fill('#111827');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
    doc.text('Cod', cols.code + 4, tableY + 6);
    doc.text('Descrição', cols.description + 4, tableY + 6);
    doc.text('Qtde', cols.quantity, tableY + 6, { width: 45, align: 'right' });
    doc.text('Un.', cols.unit, tableY + 6, { width: 45, align: 'right' });
    doc.text('Valor Un.', cols.unitPrice, tableY + 6, { width: 55, align: 'right' });
    doc.text('Total', cols.total, tableY + 6, { width: 50, align: 'right' });

    let currentY = tableY + 24;
    items.forEach((item, index) => {
      const desc = String(item.description || '');
      const q = Number(item.quantity || 0);
      const up = Number(item.unitPrice || 0);
      const tot = Number(item.total ?? q * up);
      doc.font('Helvetica').fontSize(8).fillColor('#111827');
      doc.text(String(index + 1).padStart(3, '0'), cols.code + 4, currentY);
      doc.text(desc, cols.description + 4, currentY, { width: 260 });
      doc.text(q.toFixed(4).replace('.', ','), cols.quantity, currentY, { width: 45, align: 'right' });
      doc.text(String(item.unit || ''), cols.unit, currentY, { width: 45, align: 'right' });
      doc.text(fmtMoney(up), cols.unitPrice, currentY, { width: 55, align: 'right' });
      doc.text(fmtMoney(tot), cols.total, currentY, { width: 50, align: 'right' });
      currentY += 20;
    });

    currentY += 10;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(`VALOR TOTAL: ${fmtMoney(Number(proposal.totalAmount || 0))}`, left, currentY, { width: contentWidth, align: 'right' });
    currentY += 25;

    if (proposal.paymentTerms) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Condições de Pagamento:', left, currentY);
      doc.font('Helvetica').fontSize(9).text(proposal.paymentTerms, left, currentY + 12);
      currentY += 25;
    }

    if (proposal.observations) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Observações Gerais:', left, currentY);
      doc.font('Helvetica').fontSize(9).text(proposal.observations, left, currentY + 12);
      currentY += 25;
    }

    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('Smartprint Gráfica Rápida & Comunicação Visual — Contato / WhatsApp: (19) 99803-1407', left, 780, { width: contentWidth, align: 'center' });
    doc.text(`Proposta válida por ${proposal.validityDate ? 'data informada' : '15 dias'}`, left, 792, { width: contentWidth, align: 'center' });

    doc.end();
  });
};

// Lista com paginação + busca por número da proposta ou nome do cliente + filtro por status
// Segue exatamente o padrão de createOrderListHandler em orders.js
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination?.error) return res.status(400).json({ message: pagination.error });
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const clients = await Client.find({ name: { $regex: q, $options: 'i' } }).select('_id');
    filter.$or = [
      { number: { $regex: q, $options: 'i' } },
      { client: { $in: clients.map((c) => c._id) } },
      { 'clientSnapshot.name': { $regex: q, $options: 'i' } },
    ];
  }
  if (!pagination) {
    const proposals = await Proposal.find(filter)
      .populate('client', 'name phone')
      .sort({ createdAt: -1 })
      .limit(500);
    return res.json(proposals);
  }
  const total = await Proposal.countDocuments(filter);
  const page = getEffectivePage(pagination.page, pagination.pageSize, total);
  const items = await Proposal.find(filter)
    .populate('client', 'name phone')
    .sort({ createdAt: -1 })
    .skip((page - 1) * pagination.pageSize)
    .limit(pagination.pageSize);
  return res.json(buildPage(items, page, pagination.pageSize, total));
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identificador de proposta inválido' });
  }
  const proposal = await Proposal.findById(req.params.id).populate('client');
  if (!proposal) return res.status(404).json({ message: 'Proposta não encontrada' });
  res.json(proposal);
});

// Criar proposta
router.post('/', async (req, res) => {
  try {
    const rawClientId = req.body?.client;
    if (rawClientId && !mongoose.isValidObjectId(rawClientId)) return res.status(400).json({ message: 'Cliente inválido' });
    if (rawClientId && !await Client.exists({ _id: rawClientId })) return res.status(400).json({ message: 'Cliente não encontrado' });
    if (!Array.isArray(req.body?.items) || !req.body.items.some((item) => item?.productId || item?.description?.trim())) {
      return res.status(400).json({ message: 'Informe pelo menos um item da proposta' });
    }
    if (req.body?.status && !PROPOSAL_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: 'Status de proposta inválido' });
    }
    const fields = ['client', 'projectTitle', 'projectDescription', 'areasContemplated', 'executionProcess', 'specialCourtesy', 'items', 'status', 'validityDate', 'paymentTerms', 'deliveryTime', 'observations'];
    const payload = Object.fromEntries(fields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    if (payload.client === '') payload.client = null;
    const proposal = await Proposal.create({ ...payload, createdBy: req.user._id });
    await fillClientSnapshot(proposal);
    await proposal.save();
    res.status(201).json(await proposal.populate('client'));
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
});

// Atualizar proposta
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de proposta inválido' });
    }
    const editableFields = ['client', 'items', 'status', 'validityDate', 'paymentTerms', 'deliveryTime', 'observations'];
    const changes = Object.fromEntries(editableFields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    if (changes.client === '') changes.client = null;
    if (changes.client && (!mongoose.isValidObjectId(changes.client) || !await Client.exists({ _id: changes.client }))) {
      return res.status(400).json({ message: 'Cliente inválido ou não encontrado' });
    }
    if (changes.status && !PROPOSAL_STATUSES.includes(changes.status)) {
      return res.status(400).json({ message: 'Status de proposta inválido' });
    }
    if ('items' in changes) {
      if (!Array.isArray(changes.items)) return res.status(400).json({ message: 'Lista de itens inválida' });
    }
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposta não encontrada' });
    Object.assign(proposal, changes);
    if ('client' in changes) await fillClientSnapshot(proposal);
    await proposal.save();
    return res.json(await proposal.populate('client'));
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

// Alterar status da proposta
router.patch('/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de proposta inválido' });
    }
    const { status } = req.body || {};
    if (!PROPOSAL_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status de proposta inválido' });
    }
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposta não encontrada' });
    proposal.status = status;
    await proposal.save();
    res.json(await proposal.populate('client'));
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identificador de proposta inválido' });
  }
  await Proposal.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Gerar texto WhatsApp + link (mesmo padrão de /api/orders/:id/whatsapp)
router.get('/:id/whatsapp', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de proposta inválido' });
    }
    const proposal = await Proposal.findById(req.params.id).populate('client');
    if (!proposal) return res.status(404).json({ message: 'Proposta não encontrada' });
    const client = proposal.client || proposal.clientSnapshot || {};
    const phone = String(client.phone || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ message: 'Cadastre um telefone/WhatsApp para este cliente' });
    const text = buildWhatsappText(proposal, client);
    proposal.whatsappSentAt = new Date();
    if (proposal.status === 'rascunho') proposal.status = 'enviada';
    await proposal.save();
    res.json({
      text,
      phone,
      documentLabel: 'Proposta',
      link: `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Gerar PDF da proposta para impressão (mesmo padrão de /api/orders/:id/pdf)
router.get('/:id/pdf', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de proposta inválido' });
    }
    const proposal = await Proposal.findById(req.params.id).populate('client');
    if (!proposal) return res.status(404).json({ message: 'Proposta não encontrada' });
    const obj = proposal.toObject();
    if (!obj.client && obj.clientSnapshot) obj.client = obj.clientSnapshot;
    const pdfBuffer = await buildProposalPdfBuffer(obj);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposta-${proposal.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
