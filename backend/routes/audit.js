import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { buildPage, getEffectivePage } from '../services/pagination.js';
import { parseAuditFilters } from '../services/auditLog.js';

export function createAuditListHandler({ AuditLogModel = AuditLog } = {}) {
  return async (req, res, next) => {
    try {
      const { filter, pagination } = parseAuditFilters(req.query);
      const total = await AuditLogModel.countDocuments(filter);
      const page = getEffectivePage(pagination.page, pagination.pageSize, total);
      const items = await AuditLogModel.find(filter)
        .sort({ data: -1 })
        .skip((page - 1) * pagination.pageSize)
        .limit(pagination.pageSize)
        .populate('usuarioSolicitante', 'name email')
        .populate('usuarioAutorizou', 'name email')
        .lean();
      return res.json(buildPage(items, page, pagination.pageSize, total));
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
      return next(error);
    }
  };
}

export function createAuditRouter({
  AuditLogModel = AuditLog,
  protectMiddleware = protect,
  adminMiddleware = adminOnly,
} = {}) {
  const router = Router();
  router.use(protectMiddleware);
  router.use(adminMiddleware);
  router.get('/', createAuditListHandler({ AuditLogModel }));
  return router;
}

export default createAuditRouter();
