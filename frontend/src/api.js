const BASE = import.meta.env.VITE_API_URL || ''; // em dev usa proxy do Vite (/api -> :5000)

const token = () => localStorage.getItem('sp_token');

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
  return data;
}

export const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export const onlyDigits = (s) => (s || '').replace(/\D/g, '');
