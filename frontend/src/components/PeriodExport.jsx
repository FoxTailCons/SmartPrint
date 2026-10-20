import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadCsv } from '../api.js';
import { buildExportDownloadPath } from '../pages/exportDownload.js';

const todayInSaoPaulo = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

export default function PeriodExport({ type, label }) {
  const [from, setFrom] = useState(todayInSaoPaulo);
  const [to, setTo] = useState(todayInSaoPaulo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const exportPeriod = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = buildExportDownloadPath(type, from, to);
      await downloadCsv(path);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={exportPeriod} className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-3">
      <label className="text-xs text-slate-600">
        De
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required className="mt-1 block rounded border px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">
        Até
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} required className="mt-1 block rounded border px-2 py-1.5 text-sm" />
      </label>
      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
        <Download size={15} /> {busy ? 'Exportando…' : label}
      </button>
      {error && <span role="alert" className="w-full text-xs text-red-700">{error}</span>}
    </form>
  );
}
