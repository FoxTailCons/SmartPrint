import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    document: { type: String, default: '' }, // CPF/CNPJ
    address: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Client', clientSchema);
