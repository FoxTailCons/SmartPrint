import { Router } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Client from '../models/Client.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : 'a combinar';

// Monta texto para envio via WhatsApp (usado no front com wa.me)
const buildWhatsappText = (order, client) => {
  const lines = [];
  lines.push(`*SmartPrint Lindóia* - Gráfica e Grandes Formatos`);
  lines.push(`--------------------------------`);
  lines.push(`*Pedido/Orçamento Nº ${order.number}*`);
  lines.push(`Cliente: ${client.name}`);
  lines.push(`Status: ${order.status}`);
  lines.push(`Entrega: ${fmtDate(order.deliveryDate)}`);
  lines.push(`--------------------------------`);
  order.items.forEach((it) => {
    lines.push(`• ${it.description} (${it.quantity}x) = ${fmtMoney(it.total)}`);
  });
  if (order.discount > 0) lines.push(`Desconto: -${fmtMoney(order.discount)}`);
  lines.push(`*TOTAL: ${fmtMoney(order.finalValue)}*`);
  if (order.amountPaid > 0) {
    lines.push(`Pago: ${fmtMoney(order.amountPaid)} | Saldo: ${fmtMoney(order.finalValue - order.amountPaid)}`);
  }
  if (order.installments?.length) {
    lines.push(`--------------------------------`);
    lines.push(`*Parcelas:*`);
    order.installments.forEach((p, i) => {
      lines.push(`${i + 1}ª) ${fmtDate(p.dueDate)} - ${fmtMoney(p.amount)} ${p.paid ? '✔PAGO' : ''}`);
    });
  }
  if (order.observations) lines.push(`Obs: ${order.observations}`);
  lines.push(`--------------------------------`);
  lines.push(`Agradecemos a preferência!`);
  return lines.join('\n');
};

// Listar pedidos com filtros
router.get('/', async (req, res) => {
  const { status, paymentStatus, production, client, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (production) filter.production = production;
  if (client) filter.client = client;
  if (q) {
    const clients = await Client.find({ name: { $regex: q, $options: 'i' } }).select('_id');
    filter.$or = [{ number: { $regex: q, $options: 'i' } }, { client: { $in: clients.map((c) => c._id) } }];
  }
  const orders = await Order.find(filter)
    .populate('client', 'name phone')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json(orders);
});

router.get('/:id', async (req, res) => {
  const order = await Order.findById(req.params.id).populate('client');
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  res.json(order);
});

// Criar orçamento/pedido
router.post('/', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.body?.client)) return res.status(400).json({ message: 'Cliente inválido' });
    if (!await Client.exists({ _id: req.body.client })) return res.status(400).json({ message: 'Cliente não encontrado' });
    if (!Array.isArray(req.body?.items) || !req.body.items.some((item) => item.description?.trim())) {
      return res.status(400).json({ message: 'Informe pelo menos um item do pedido' });
    }
    const fields = ['client', 'items', 'discount', 'deliveryDate', 'observations', 'installments', 'paymentMethod'];
    const payload = Object.fromEntries(fields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
    const order = await Order.create({ ...payload, createdBy: req.user._id });
    order.history.push({ action: 'criado', by: req.user.name });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
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
  const editableFields = ['client', 'items', 'discount', 'deliveryDate', 'observations', 'installments', 'paymentMethod'];
  const changes = Object.fromEntries(editableFields.filter((field) => field in req.body).map((field) => [field, req.body[field]]));
  if (changes.client && (!mongoose.isValidObjectId(changes.client) || !await Client.exists({ _id: changes.client }))) {
    return res.status(400).json({ message: 'Cliente inválido ou não encontrado' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
  Object.assign(order, changes);
  await order.save();
  res.json(await order.populate('client'));
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
      link: `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
