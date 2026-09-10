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
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Payable', payableSchema);
