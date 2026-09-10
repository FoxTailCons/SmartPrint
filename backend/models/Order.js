import mongoose from 'mongoose';

// Itens do orçamento/pedido (serviços da gráfica: grandes formatos, adesivagem, etc.)
const itemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});

// Parcelas / desdobramento de pagamento
const installmentSchema = new mongoose.Schema({
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date },
});

// Histórico de produção e status
const historySchema = new mongoose.Schema({
  action: { type: String, required: true }, // criado, aprovado, producao_iniciada, pausado, retomado, concluido, pagamento, etc.
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
});

const orderSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    items: [itemSchema],
    totalValue: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    finalValue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    // Status do pedido/orçamento
    status: {
      type: String,
      enum: ['pendente', 'aprovado', 'concluido'],
      default: 'pendente',
      index: true,
    },
    // Controle de pagamento
    paymentStatus: {
      type: String,
      enum: ['aberto', 'parcial', 'pago', 'quitado'],
      default: 'aberto',
      index: true,
    },
    // Controle de produção
    production: {
      type: String,
      enum: ['nao_iniciado', 'em_producao', 'pausado', 'concluido'],
      default: 'nao_iniciado',
    },
    productionStartedAt: { type: Date },
    productionPausedAt: { type: Date },
    completedAt: { type: Date },
    installments: [installmentSchema],
    history: [historySchema],
    deliveryDate: { type: Date },
    observations: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    whatsappSentAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.pre('validate', async function (next) {
  if (!this.number) {
    const last = await mongoose.models.Order.findOne().sort({ createdAt: -1 });
    const seq = last ? (parseInt(last.number.replace(/\D/g, '')) || 0) + 1 : 1;
    this.number = String(seq).padStart(5, '0');
  }
  // Calcula totais
  const itemsTotal = this.items.reduce((s, i) => s + (i.total || i.quantity * i.unitPrice || 0), 0);
  this.totalValue = itemsTotal;
  this.finalValue = Math.max(0, itemsTotal - (this.discount || 0));
  next();
});

export default mongoose.model('Order', orderSchema);
