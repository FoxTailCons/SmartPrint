import { Router } from 'express';
import Product from '../models/Product.js';
import { normalizePriceTiers } from '../services/orderItemPricing.js';
import { protect, adminOnly, allowRoles } from '../middleware/auth.js';
import { productCategories, saleUnits } from '../models/Product.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';
import AuditLog from '../models/AuditLog.js';
import { recordAuditEvent } from '../services/auditLog.js';

const normalizeInput = (body, { allowActive = false, allowCostPrice = false } = {}) => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const saleUnit = body?.saleUnit;
  const rawPrice = body?.price;
  const price = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice ?? '').trim());
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const category = body?.category;
  const hasCostPrice = allowCostPrice && Object.prototype.hasOwnProperty.call(body || {}, 'costPrice');
  const rawCostPrice = hasCostPrice ? body.costPrice : undefined;
  const costPrice = rawCostPrice === undefined || rawCostPrice === null || rawCostPrice === '' ? undefined
    : typeof rawCostPrice === 'number' ? rawCostPrice : Number(String(rawCostPrice).trim());
  if (body?.imageUrl !== undefined && typeof body.imageUrl !== 'string') {
    return { error: 'Link da imagem inválido' };
  }
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';

  if (!name) return { error: 'Nome do produto é obrigatório' };
  if (!saleUnits.includes(saleUnit)) return { error: 'Unidade de venda inválida' };
  if (!Number.isFinite(price) || price < 0 || String(rawPrice ?? '').trim() === '') {
    return { error: 'Informe um preço válido, maior ou igual a zero' };
  }
  if (costPrice !== undefined && (!Number.isFinite(costPrice) || costPrice < 0)) {
    return { error: 'Informe um custo válido, maior ou igual a zero' };
  }
  if (imageUrl.length > 2048) return { error: 'Link da imagem muito longo' };
  if (imageUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) throw new Error();
    } catch {
      return { error: 'Link da imagem deve usar HTTP ou HTTPS' };
    }
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
      ...(hasCostPrice ? { costPrice } : {}),
      ...(Object.prototype.hasOwnProperty.call(body || {}, 'imageUrl') ? { imageUrl } : {}),
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
const hideCost = (product, user) => {
  if (user?.role === 'admin') return product;
  const sanitize = (value) => {
    if (!value) return value;
    const { costPrice, ...visible } = value.toObject ? value.toObject() : value;
    return visible;
  };
  return Array.isArray(product) ? product.map(sanitize) : sanitize(product);
};

export function createProductsRouter({
  ProductModel = Product,
  AuditLogModel = AuditLog,
  protectMiddleware = protect,
  adminMiddleware = adminOnly,
} = {}) {
  const router = Router();
  router.use(protectMiddleware);

  router.get('/', allowRoles('admin', 'atendente'), async (req, res, next) => {
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
        return res.json(hideCost(products, req.user));
      }

      const total = await ProductModel.countDocuments(filter);
      const page = getEffectivePage(pagination.page, pagination.pageSize, total);
      const products = await ProductModel.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * pagination.pageSize)
        .limit(pagination.pageSize);
      return res.json({ ...buildPage(products, page, pagination.pageSize, total), items: hideCost(products, req.user) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id', allowRoles('admin', 'atendente'), async (req, res, next) => {
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product || (!product.active && req.user?.role !== 'admin')) {
        return res.status(404).json({ message: 'Produto não encontrado' });
      }
      return res.json(hideCost(product, req.user));
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', allowRoles('admin', 'atendente'), async (req, res, next) => {
    const isAdmin = req.user?.role === 'admin';
    const normalized = normalizeInput(req.body, { allowCostPrice: isAdmin });
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    try {
      if (await duplicateCode(ProductModel, normalized.value.code)) {
        return res.status(409).json({ message: 'Já existe um produto com esse código' });
      }
      const product = new ProductModel(normalized.value);
      await product.save();
      return res.status(201).json(hideCost(product, req.user));
    } catch (error) {
      if (isDuplicateKeyError(error)) return res.status(409).json({ message: 'Já existe um produto com esse código' });
      return next(error);
    }
  });

  router.put('/:id', allowRoles('admin', 'atendente'), async (req, res, next) => {
    const isAdmin = req.user?.role === 'admin';
    const normalized = normalizeInput(req.body, { allowActive: isAdmin, allowCostPrice: isAdmin });
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Produto não encontrado' });
      if (await duplicateCode(ProductModel, normalized.value.code, product._id)) {
        return res.status(409).json({ message: 'Já existe um produto com esse código' });
      }
      const previousPrice = Number(product.price);
      const previousCostPrice = product.costPrice == null ? null : Number(product.costPrice);
      Object.assign(product, normalized.value);
      await product.save();
      const details = { produtoId: String(product._id), nome: product.name };
      if (previousPrice !== Number(product.price)) {
        details.preco = { antes: previousPrice, depois: Number(product.price) };
      }
      const currentCostPrice = product.costPrice == null ? null : Number(product.costPrice);
      if (previousCostPrice !== currentCostPrice) {
        details.custo = { antes: previousCostPrice, depois: currentCostPrice };
      }
      if (details.preco || details.custo) {
        try {
          await recordAuditEvent({
            AuditLogModel,
            req,
            action: 'produto.preco_custo_alterado',
            details,
          });
        } catch (error) {
          console.error(error);
          return res.status(500).json({ message: 'O produto foi alterado, mas não foi possível registrar a auditoria' });
        }
      }
      return res.json(hideCost(product, req.user));
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
