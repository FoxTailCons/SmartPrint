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
  if (!res.ok) throw Object.assign(new Error(data.message || `Erro ${res.status}`), { status: res.status });
  return data;
}

export async function downloadCsv(path) {
  let res;
  const authToken = token();
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o backend está ativo no Render.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Erro ${res.status} ao exportar.`);
  }
  const blob = await res.blob();
  const filename = res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || 'smartprint-export.csv';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export const onlyDigits = (s) => (s || '').replace(/\D/g, '');
