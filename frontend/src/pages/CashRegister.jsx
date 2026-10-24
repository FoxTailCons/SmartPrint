import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api';

const methods = [
  ['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['debito', 'Cartão débito'],
  ['credito', 'Cartão crédito'], ['parcelado', 'Crédito parcelado'],
];
const emptyCounts = Object.fromEntries(methods.map(([key]) => [key, '']));

export function CashMovementForm({ title, path, movement, setMovement, submit, busy }) {
  const label = title.toLowerCase();
  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(path, { amount: Number(movement.amount), note: movement.note }); }} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]">
      <label className="text-sm">{title} (R$)<input required type="number" min="0.01" step="0.01" value={movement.amount} onChange={(event) => setMovement({ ...movement, amount: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" /></label>
      <label className="text-sm">Motivo<input required value={movement.note} onChange={(event) => setMovement({ ...movement, note: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" /></label>
      <button disabled={busy} className="self-end rounded border px-3 py-2 text-sm">Registrar {label}</button>
    </form>
  );
}

export default function CashRegister() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [withdrawal, setWithdrawal] = useState({ amount: '', note: '' });
  const [supply, setSupply] = useState({ amount: '', note: '' });
  const [counted, setCounted] = useState(emptyCounts);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (dateKey = '') => {
    setLoading(true);
    try {
      const result = await api(dateKey ? `/api/cash/${dateKey}` : '/api/cash/current');
      setData(result);
      setReportDate(result.dateKey || dateKey);
      setError('');
    } catch (loadError) {
      setData(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      setData(await api(`/api/cash/${path}`, { method: 'POST', body }));
      setWithdrawal({ amount: '', note: '' });
      setSupply({ amount: '', note: '' });
      if (path === 'close') setCounted(emptyCounts);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const session = data?.session;
  const report = data?.report;
  const isOpen = session?.status === 'open';
  const parseCounts = () => Object.fromEntries(methods.map(([key]) => [key, Number(counted[key])]));

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Fechamento de caixa</h1>
        <p className="text-sm text-slate-500">Conferência diária por forma de pagamento · data de São Paulo</p>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); if (reportDate) load(reportDate); }} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Consultar fechamento
          <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="mt-1 block rounded border px-3 py-2" />
        </label>
        <button disabled={loading || !reportDate} className="rounded border px-3 py-2 text-sm">Consultar dia</button>
        <button type="button" disabled={loading} onClick={() => load()} className="rounded border px-3 py-2 text-sm">Hoje</button>
      </form>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Carregando caixa...</div>}
      {!loading && !data && <button type="button" onClick={load} className="rounded border px-3 py-2 text-sm">Tentar novamente</button>}
      {!loading && data?.isToday && !session && (
        <form onSubmit={(event) => { event.preventDefault(); submit('open', { openingAmount: Number(openingAmount) }); }} className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Abertura do caixa</h2>
          <label className="mt-3 block text-sm">Saldo inicial em dinheiro (R$)
            <input required type="number" min="0" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <button disabled={busy} className="mt-3 rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Abrir caixa</button>
        </form>
      )}
      {!loading && report && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold">Resumo de {report.dateKey}</h2><p className={`text-sm ${isOpen ? 'text-amber-700' : 'text-emerald-700'}`}>{isOpen ? 'Caixa aberto' : 'Caixa fechado'}</p></div>
            <button type="button" onClick={() => window.print()} className="rounded border px-3 py-2 text-sm">Imprimir relatório</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">Saldo inicial <strong className="float-right">{fmt(report.openingAmount)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">Suprimentos <strong className="float-right">{fmt(report.supplies || 0)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">Sangrias <strong className="float-right">{fmt(report.withdrawals)}</strong></div>
          </div>
          {report.supplyDetails?.length > 0 && <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-medium">Suprimentos registrados</h3>
            <ul className="space-y-1 text-xs text-slate-600">{report.supplyDetails.map((item, index) => <li key={`${item.createdAt}-${index}`} className="flex justify-between gap-3"><span>{item.note}</span><strong>{fmt(item.amount)}</strong></li>)}</ul>
          </div>}
          {report.withdrawalDetails?.length > 0 && <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-medium">Sangrias registradas</h3>
            <ul className="space-y-1 text-xs text-slate-600">{report.withdrawalDetails.map((item, index) => <li key={`${item.createdAt}-${index}`} className="flex justify-between gap-3"><span>{item.note}</span><strong>{fmt(item.amount)}</strong></li>)}</ul>
          </div>}
          <div className="min-w-0">
            <table className="responsive-table text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">Forma</th><th className="py-2 text-right">Entradas</th><th className="py-2 text-right">Esperado</th>{report.counted && <><th className="py-2 text-right">Conferido</th><th className="py-2 text-right">Diferença</th></>}</tr></thead>
              <tbody>{methods.map(([key, label]) => <tr key={key} className="border-b">
                <td data-label="Forma" className="py-2">{label}</td><td data-label="Entradas" className="py-2 text-right">{fmt(report.inflows[key])}</td><td data-label="Esperado" className="py-2 text-right">{fmt(report.expected[key])}</td>
                {report.counted && <><td data-label="Conferido" className="py-2 text-right">{fmt(report.counted[key])}</td><td data-label="Diferença" className={`py-2 text-right ${report.differences[key] ? 'font-semibold text-red-600' : 'text-emerald-700'}`}>{fmt(report.differences[key])}</td></>}
              </tr>)}</tbody>
            </table>
          </div>
          {isOpen && data.isToday && (
            <>
              <CashMovementForm title="Sangria" path="withdrawals" movement={withdrawal} setMovement={setWithdrawal} submit={submit} busy={busy} />
              <CashMovementForm title="Suprimento" path="supply" movement={supply} setMovement={setSupply} submit={submit} busy={busy} />
              <form onSubmit={(event) => { event.preventDefault(); submit('close', { counted: parseCounts() }); }} className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                <h3 className="font-medium">Conferência e fechamento</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.map(([key, label]) => <label key={key} className="text-sm">{label} contado (R$)
                    <input required type="number" min="0" step="0.01" value={counted[key]} onChange={(event) => setCounted({ ...counted, [key]: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
                  </label>)}
                </div>
                <button disabled={busy} className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Conferir e fechar caixa</button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
