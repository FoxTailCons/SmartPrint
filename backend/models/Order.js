import mongoose from 'mongoose';
import { initialProductionStage } from '../services/productionWorkflow.js';

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
  pricingBasis: { basePrice: Number, priceTiers: [{ minQuantity: Number, price: Number, _id: false }] },
  serviceName: String, material: String, finishing: String, applicationLocation: String,
  promisedDate: String, artworkUrl: String, installationNotes: String,
  installationFee: { type: Number, min: 0, validate: Number.isFinite, default: 0 },
  travelFee: { type: Number, min: 0, validate: Number.isFinite, default: 0 },
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
  type: { type: String, enum: ['entrada', 'pagamento'], default: 'pagamento' },
  paidAt: { type: Date, default: Date.now },
});

// Histórico de produção e status
const historySchema = new mongoose.Schema({
  action: { type: String, required: true }, // criado, aprovado, producao_iniciada, pausado, retomado, concluido, pagamento, etc.
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  fromStage: String, toStage: String, skippedStages: [String],
});

const orderSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    items: [itemSchema],
    totalValue: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    finalValue: { type: Number, default: 0 },
    downPayment: { type: Number, default: 0, min: 0 },
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
    productionStage: { type: String, enum: ['arte','aprovacao_cliente','impressao','instalacao','entregue'] },
    skippedStages: { type: [String], enum: ['arte','aprovacao_cliente','impressao','instalacao'], default: [], validate: { validator: (value) => { try { initialProductionStage(value); return true; } catch { return false; } }, message: 'Mantenha pelo menos uma etapa de produção válida' } },
    priority: { type: String, enum: ['normal','alta','urgente'], default: 'normal' },
    quickSaleKey: { type: String },
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

orderSchema.index({ quickSaleKey: 1 }, { unique: true, sparse: true });

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
    item.total = Number(item.quantity || 0) * Number(item.unitPrice || 0) + Number(item.installationFee || 0) + Number(item.travelFee || 0);
  });
  const itemsTotal = this.items.reduce((s, i) => s + i.total, 0);
  this.totalValue = itemsTotal;
  this.finalValue = Math.ceil(Math.round(Math.max(0, itemsTotal - (this.discount || 0)) * 100) / 100);
  if (this.downPayment > this.finalValue) {
    this.invalidate('downPayment', 'Entrada não pode ser maior que o total do pedido');
  }
  next();
});

export default mongoose.model('Order', orderSchema);
