import mongoose from 'mongoose';

// Contas a pagar (despesas de consumo: energia, internet, insumos, aluguel, etc.)
const payableSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    category: { type: String, default: 'consumo' }, // consumo, insumo, aluguel, funcionario, outro
    value: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date },
    recurring: { type: Boolean, default: false },
    recurrenceId: { type: String, index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

payableSchema.index({ recurrenceId: 1, dueDate: 1 }, { unique: true, sparse: true });

export default mongoose.model('Payable', payableSchema);
