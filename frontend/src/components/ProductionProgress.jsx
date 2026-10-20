import { useRef, useState } from 'react';
import { api } from '../api';
import { getProductionStage, productionStages } from '../pages/printshop.js';

export default function ProductionProgress({ order, onChanged, readOnly = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const stage = getProductionStage(order);
  const label = productionStages.find(([key]) => key === stage)?.[1] || stage;

  const advance = async (skip = false) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const changed = await api(`/api/orders/${order._id}/production/advance`, { method: 'POST', body: { expectedStage: stage, skip } });
      onChanged(changed);
    } catch (err) {
      setError(`${err.message} Atualize os dados antes de tentar novamente.`);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">Etapa: {label}</div>
      {!readOnly && order.status === 'aprovado' && stage !== 'entregue' && order.production !== 'pausado' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => advance()} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
            {busy ? 'Salvando...' : stage === 'aprovacao_cliente' ? 'Cliente aprovou → avançar' : stage === 'instalacao' ? 'Confirmar entrega' : `Concluir ${label.toLowerCase()} → avançar`}
          </button>
          {stage !== 'impressao' && <button type="button" disabled={busy} onClick={() => advance(true)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">Dispensar etapa</button>}
        </div>
      )}
      {order.production === 'pausado' && <span className="text-amber-700">Produção pausada{readOnly ? '.' : '; retome no detalhe.'}</span>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
