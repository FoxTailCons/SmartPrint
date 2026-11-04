import mongoose from 'mongoose';

// Itens da proposta/orçamento (serviços da gráfica: grandes formatos, adesivagem, etc.)
// Espelha o itemSchema de Order.js, adaptado para proposta livre (unidade de medida texto livre).
const proposalItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 1, min: 0 },
  unit: { type: String, default: 'un' }, // un, m, m², pc, kg, etc.
  unitPrice: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0 },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
});

const proposalSchema = new mongoose.Schema(
  {
    // Numeração sequencial da proposta (mesmo padrão do campo `number` de Order.js)
    number: { type: String, unique: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    projectTitle: { type: String, default: '' },
    projectDescription: { type: String, default: '' },
    areasContemplated: { type: String, default: '' },
    executionProcess: { type: String, default: '' },
    specialCourtesy: { type: String, default: '' },
    // Snapshot dos dados do cliente no momento da proposta (para preservar histórico mesmo se o cliente for editado)
    clientSnapshot: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    items: [proposalItemSchema],
    totalAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['rascunho', 'enviada', 'aceita', 'rejeitada', 'cancelada'],
      default: 'rascunho',
      index: true,
    },
    validityDate: { type: Date },
    paymentTerms: { type: String, default: '' },
    deliveryTime: { type: String, default: '' },
    observations: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    whatsappSentAt: { type: Date },
  },
  { timestamps: true }
);

proposalSchema.pre('validate', async function (next) {
  if (!this.number) {
    const last = await mongoose.models.Proposal.findOne().sort({ createdAt: -1 });
    const lastNumber = String(last?.number || '').replace(/\D/g, '');
    const seq = (parseInt(lastNumber, 10) || 0) + 1;
    this.number = String(seq).padStart(5, '0');
  }
  // Calcula totais (mesma lógica de Order.js)
  this.items = (this.items || []).filter((item) => item.description?.trim());
  this.items.forEach((item) => {
    item.description = item.description.trim();
    item.total = Number(item.quantity || 0) * Number(item.unitPrice || 0);
  });
  const itemsTotal = this.items.reduce((s, i) => s + i.total, 0);
  // Mesma regra de arredondamento para cima usada em Order.finalValue / roundOrderTotalUp
  this.totalAmount = Math.ceil(Math.round(Math.max(0, itemsTotal) * 100) / 100);
  next();
});

export default mongoose.model('Proposal', proposalSchema);
