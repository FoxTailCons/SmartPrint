import mongoose from 'mongoose';
import { normalizePriceTiers } from '../services/orderItemPricing.js';

const saleUnits = ['unit', 'linear_meter', 'square_meter', 'kilometer'];
const productCategories = [
  'sem_categoria',
  'impressao',
  'adesivos',
  'lonas',
  'plotagens',
  'placas',
  'fachada',
  'envelopamento',
  'servicos',
];
const productCategoryLabels = {
  sem_categoria: 'Sem categoria',
  impressao: 'Impressão',
  adesivos: 'Adesivos',
  lonas: 'Lonas',
  plotagens: 'Plotagens',
  placas: 'Placas',
  fachada: 'Fachada',
  envelopamento: 'Envelopamento',
  servicos: 'Serviços',
};

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
    costPrice: {
      type: Number,
      min: 0,
      validate: { validator: (value) => value === undefined || Number.isFinite(value), message: 'O custo deve ser um número finito' },
    },
    imageUrl: { type: String, trim: true, maxlength: 2048, default: '' },
    priceTiers: { type: [{ minQuantity: Number, price: Number, _id: false }], default: [], validate: { validator: (value) => { try { normalizePriceTiers(value); return true; } catch { return false; } }, message: 'Faixas de preço inválidas' } },
    category: { type: String, enum: productCategories },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ code: 1 }, { unique: true, sparse: true });

export { saleUnits };
export { productCategories };
export { productCategoryLabels };
export default mongoose.model('Product', productSchema);

