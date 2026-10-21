import mongoose from 'mongoose';
import { parsePagination } from './pagination.js';

export const auditActions = [
  'auth.login',
  'auth.logout',
  'caixa.sangria',
  'caixa.suprimento',
  'caixa.fechamento',
  'pedido.excluido',
  'produto.preco_custo_alterado',
  'usuario.status_alterado',
  'usuario.alterado',
  'usuario.arquivado',
  'pagamento.desconto_acima_limite',
  'autorizacao.desconto',
  'autorizacao.cancelamento',
];

const sensitiveKey = /password|token|authorization|secret|cookie|credential/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const validDate = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const safeDetails = (value) => {
  if (Array.isArray(value)) return value.map(safeDetails);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof mongoose.Types.ObjectId) return value.toString();
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, item]) => [key, safeDetails(item)]));
  }
  if (typeof value === 'string') return value.slice(0, 2000);
  return value;
};

export function buildAuditRecord({
  req,
  requester = req?.user,
  authorizedBy,
  action,
  details = {},
  success = true,
}) {
  if (!auditActions.includes(action)) throw new Error('Ação de auditoria inválida');
  return {
    data: new Date(),
    usuarioSolicitante: requester?._id || requester?.id || null,
    usuarioAutorizou: authorizedBy?._id || authorizedBy?.id || null,
    acao: action,
    detalhes: safeDetails(details),
    ip: typeof req?.ip === 'string' ? req.ip.slice(0, 64) : '',
    sucesso: Boolean(success),
  };
}

export async function recordAuditEvent({ AuditLogModel, ...event }) {
  const Model = AuditLogModel || (await import('../models/AuditLog.js')).default;
  return Model.create(buildAuditRecord(event));
}

export function parseAuditFilters(query = {}) {
  const filter = {};
  if (query.usuarioSolicitante) {
    if (!mongoose.isValidObjectId(query.usuarioSolicitante)) {
      throw Object.assign(new Error('Usuário inválido'), { statusCode: 400 });
    }
    filter.usuarioSolicitante = query.usuarioSolicitante;
  }
  if (query.acao) {
    if (!auditActions.includes(query.acao)) {
      throw Object.assign(new Error('Ação de auditoria inválida'), { statusCode: 400 });
    }
    filter.acao = query.acao;
  }
  if (query.de !== undefined || query.ate !== undefined) {
    if (!validDate(query.de) || !validDate(query.ate) || query.de > query.ate) {
      throw Object.assign(new Error('Informe um período válido'), { statusCode: 400 });
    }
    const start = new Date(`${query.de}T00:00:00.000Z`);
    const endExclusive = new Date(new Date(`${query.ate}T00:00:00.000Z`).getTime() + 86400000);
    const maximumEnd = new Date(start);
    maximumEnd.setUTCFullYear(maximumEnd.getUTCFullYear() + 1);
    if (endExclusive > maximumEnd) {
      throw Object.assign(new Error('O período máximo permitido é de um ano'), { statusCode: 400 });
    }
    filter.data = { $gte: start, $lt: endExclusive };
  }
  const parsed = parsePagination(query, { defaultPageSize: 20, maxPageSize: 100 });
  if (parsed?.error) throw Object.assign(new Error(parsed.error), { statusCode: 400 });
  return { filter, pagination: parsed || { page: 1, pageSize: 20, skip: 0 } };
}
