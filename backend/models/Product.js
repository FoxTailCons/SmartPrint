import mongoose from 'mongoose';
import { normalizePriceTiers } from '../services/orderItemPricing.js';

const saleUnits = ['unit', 'linear_meter', 'square_meter'];

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      trim: true,
      set: (value) => {
        const trimmed = String(value || '').trim();
        return trimmed || undefined;
      },
    },
    saleUnit: { type: String, enum: saleUnits, required: true },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isFinite, message: 'O preço deve ser um número finito' },
    },
    priceTiers: { type: [{ minQuantity: Number, price: Number, _id: false }], default: [], validate: { validator: (value) => { try { normalizePriceTiers(value); return true; } catch { return false; } }, message: 'Faixas de preço inválidas' } },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ code: 1 }, { unique: true, sparse: true });

export { saleUnits };
export default mongoose.model('Product', productSchema);
