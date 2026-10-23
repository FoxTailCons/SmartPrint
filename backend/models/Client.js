import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '' },
    document: { type: String, default: '' }, // CPF/CNPJ
    address: { type: String, trim: true, default: '' },
    addressNumber: { type: String, trim: true, default: '' },
    addressComplement: { type: String, trim: true, default: '' },
    neighborhood: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    zipCode: { type: String, trim: true, default: '' },
    stateRegistration: { type: String, trim: true, default: '' },
    contact: { type: String, trim: true, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Client', clientSchema);
