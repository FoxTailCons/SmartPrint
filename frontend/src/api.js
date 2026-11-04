const BASE = import.meta.env.VITE_API_URL || 'https://smartprint-am7g.onrender.com'; // em dev usa proxy do Vite (/api -> :5000)
const token = () => localStorage.getItem('sp_token');
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o backend está ativo no Render.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
  return data;
}
export const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';
export const onlyDigits = (s) => (s || '').replace(/\D/g, '');

// ---- Módulo de Propostas (wrappers do helper genérico api(), mesmo padrão usado nas páginas) ----
export const getProposals = (params = '') => api(`/api/proposals${params ? `?${params}` : ''}`);
export const getProposal = (id) => api(`/api/proposals/${id}`);
export const createProposal = (data) => api('/api/proposals', { method: 'POST', body: data });
export const updateProposal = (id, data) => api(`/api/proposals/${id}`, { method: 'PUT', body: data });
export const deleteProposal = (id) => api(`/api/proposals/${id}`, { method: 'DELETE' });
export const updateProposalStatus = (id, status) => api(`/api/proposals/${id}/status`, { method: 'PATCH', body: { status } });
export const getProposalWhatsApp = (id) => api(`/api/proposals/${id}/whatsapp`);
