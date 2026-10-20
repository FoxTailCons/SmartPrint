import { Router } from 'express';
import Product from '../models/Product.js';
import { normalizePriceTiers } from '../services/orderItemPricing.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { productCategories, saleUnits } from '../models/Product.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';

const normalizeInput = (body, { allowActive = false } = {}) => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const saleUnit = body?.saleUnit;
  const rawPrice = body?.price;
  const price = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice ?? '').trim());
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const category = body?.category;

  if (!name) return { error: 'Nome do produto é obrigatório' };
  if (!saleUnits.includes(saleUnit)) return { error: 'Unidade de venda inválida' };
  if (!Number.isFinite(price) || price < 0 || String(rawPrice ?? '').trim() === '') {
    return { error: 'Informe um preço válido, maior ou igual a zero' };
  }
  if (allowActive && body.active !== undefined && typeof body.active !== 'boolean') {
    return { error: 'Status do produto inválido' };
  }
  if (category !== undefined && category !== '' && !productCategories.includes(category)) {
    return { error: 'Categoria do produto inválida' };
  }

  let priceTiers;
  try { priceTiers = normalizePriceTiers(body?.priceTiers); } catch (error) { return { error: error.message }; }
  return {
    value: {
      name,
      code: code || undefined,
      saleUnit,
      price,
      priceTiers,
      category: category || undefined,
      ...(allowActive && body.active !== undefined ? { active: body.active } : {}),
    },
  };
};

const duplicateCode = async (ProductModel, code, currentId) => {
  if (!code) return false;
  const existing = await ProductModel.findOne({ code });
  return existing && String(existing._id) !== String(currentId || '');
};

const isDuplicateKeyError = (error) => error?.code === 11000;

export function createProductsRouter({
  ProductModel = Product,
  protectMiddleware = protect,
  adminMiddleware = adminOnly,
} = {}) {
  const router = Router();
  router.use(protectMiddleware);

  router.get('/', async (req, res, next) => {
    const pagination = parsePagination(req.query);
    if (pagination?.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const includeInactive = req.query.includeInactive === 'true';
    if (includeInactive && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Acesso restrito ao administrador' });
    }

    const filter = includeInactive ? {} : { active: true };
    const query = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    if (category && category !== 'sem_categoria' && !productCategories.includes(category)) {
      return res.status(400).json({ message: 'Categoria do produto inválida' });
    }
    const conditions = [];
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conditions.push({ $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { code: { $regex: escaped, $options: 'i' } },
      ] });
    }
    if (category === 'sem_categoria') {
      conditions.push({ $or: [{ category: { $exists: false } }, { category: null }, { category: '' }] });
    } else if (category) filter.category = category;
    if (conditions.length) filter.$and = conditions;

    try {
      if (!pagination) {
        const products = await ProductModel.find(filter).sort({ name: 1 });
        return res.json(products);
      }

      const total = await ProductModel.countDocuments(filter);
      const page = getEffectivePage(pagination.page, pagination.pageSize, total);
      const products = await ProductModel.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * pagination.pageSize)
        .limit(pagination.pageSize);
      return res.json(buildPage(products, page, pagination.pageSize, total));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product || (!product.active && req.user?.role !== 'admin')) {
        return res.status(404).json({ message: 'Produto não encontrado' });
      }
      return res.json(product);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', adminMiddleware, async (req, res, next) => {
    const normalized = normalizeInput(req.body);
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    try {
      if (await duplicateCode(ProductModel, normalized.value.code)) {
        return res.status(409).json({ message: 'Já existe um produto com esse código' });
      }
      const product = new ProductModel(normalized.value);
      await product.save();
      return res.status(201).json(product);
    } catch (error) {
      if (isDuplicateKeyError(error)) return res.status(409).json({ message: 'Já existe um produto com esse código' });
      return next(error);
    }
  });

  router.put('/:id', adminMiddleware, async (req, res, next) => {
    const normalized = normalizeInput(req.body, { allowActive: true });
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Produto não encontrado' });
      if (await duplicateCode(ProductModel, normalized.value.code, product._id)) {
        return res.status(409).json({ message: 'Já existe um produto com esse código' });
      }
      Object.assign(product, normalized.value);
      await product.save();
      return res.json(product);
    } catch (error) {
      if (isDuplicateKeyError(error)) return res.status(409).json({ message: 'Já existe um produto com esse código' });
      return next(error);
    }
  });

  router.patch('/:id/deactivate', adminMiddleware, async (req, res, next) => {
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Produto não encontrado' });
      product.active = false;
      await product.save();
      return res.json(product);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export default createProductsRouter();
