import mongoose from 'mongoose';

const measurementsSchema = new mongoose.Schema(
  {
    pieceCount: { type: Number, min: 1 },
    lengthPerPiece: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    dimensionUnit: { type: String, enum: ['cm', 'm'] },
    moldEnabled: { type: Boolean },
    moldFactor: { type: Number, min: 0 },
  },
  { _id: false }
);

// Itens do orçamento/pedido (serviços da gráfica: grandes formatos, adesivagem, etc.)
const itemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0 },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  saleUnit: { type: String, enum: ['unit', 'linear_meter', 'square_meter'] },
  measurements: { type: measurementsSchema },
});

// Parcelas / desdobramento de pagamento
const installmentSchema = new mongoose.Schema({
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0 },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date },
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  method: { type: String, default: 'pix' },
  paidAt: { type: Date, default: Date.now },
});

// Histórico de produção e status
const historySchema = new mongoose.Schema({
  action: { type: String, required: true }, // criado, aprovado, producao_iniciada, pausado, retomado, concluido, pagamento, etc.
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
});

const orderSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    items: [itemSchema],
    totalValue: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    finalValue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    payments: [paymentSchema],
    paymentMethod: {
      type: String,
      enum: ['pix', 'dinheiro', 'debito', 'credito', 'parcelado'],
      default: 'pix',
    },
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
    const lastNumber = String(last?.number || '').replace(/\D/g, '');
    const seq = (parseInt(lastNumber, 10) || 0) + 1;
    this.number = String(seq).padStart(5, '0');
  }
  // Calcula totais
  this.items = (this.items || []).filter((item) => item.description?.trim());
  this.items.forEach((item) => {
    item.description = item.description.trim();
    item.total = Number(item.quantity || 0) * Number(item.unitPrice || 0);
  });
  const itemsTotal = this.items.reduce((s, i) => s + i.total, 0);
  this.totalValue = itemsTotal;
  this.finalValue = Math.max(0, itemsTotal - (this.discount || 0));
  next();
});

export default mongoose.model('Order', orderSchema);
