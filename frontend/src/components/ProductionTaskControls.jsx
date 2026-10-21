import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { getProductionStage, productionStages } from '../pages/printshop.js';

export default function ProductionTaskControls({ order, user, users = [], onChanged }) {
  const [assigneeId, setAssigneeId] = useState(order.productionAssignee?._id || '');
  const [pauseNote, setPauseNote] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const stage = getProductionStage(order);
  const label = productionStages.find(([key]) => key === stage)?.[1] || stage;
  const assignedToUser = Boolean(order.productionAssignee && (user?._id || user?.id))
    && String(order.productionAssignee?._id || order.productionAssignee) === String(user?._id || user?.id);
  const canOperate = user?.role === 'admin' || assignedToUser;
  const action = {
    nao_iniciado: 'start',
    em_producao: 'pause',
    pausado: 'resume',
  }[order.production];
  useEffect(() => setAssigneeId(order.productionAssignee?._id || ''), [order.productionAssignee?._id]);

  const submit = async (path, body) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body });
      setPauseNote('');
      setCompletionNote('');
      onChanged();
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
      <p className="text-xs text-slate-600">
        Responsável: {order.productionAssignee?.name || 'Não alocado'}
      </p>
      {order.productionHistory?.slice(-2).map((event, index) => (
        <p key={`${event.action}-${event.at || index}`} className="break-words text-xs text-slate-500">
          {event.action === 'pausado' ? 'Pausado' : event.action === 'etapa_concluida' || event.action === 'concluido' ? 'Concluído' : event.action === 'retomado' ? 'Retomado' : event.action === 'producao.alocada' ? 'Alocação' : 'Iniciado'}
          {event.by ? ` por ${event.by}` : ''}{event.note ? ` · ${event.note}` : ''}
        </p>
      ))}
      {user?.role === 'admin' && order.status === 'aprovado' && stage !== 'entregue' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`assignee-${order._id}`}>Profissional responsável</label>
          <select
            id={`assignee-${order._id}`}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className="min-w-0 rounded-lg border px-2 py-2 text-xs"
            disabled={busy}
          >
            <option value="">Sem responsável</option>
            {users.map((person) => <option key={person._id} value={person._id}>{person.name} · {person.role === 'atendente' ? 'Atendente' : 'Produção'}</option>)}
          </select>
          <button
            type="button"
            disabled={busy || assigneeId === String(order.productionAssignee?._id || '')}
            onClick={() => submit(`/api/orders/${order._id}/production/assignment`, { expectedStage: stage, assigneeId: assigneeId || null })}
            className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
          >Alocar</button>
        </div>
      )}
      {order.status === 'aprovado' && stage !== 'entregue' && canOperate && (
        <div className="space-y-2">
          {action === 'pause' && (
            <label className="block text-xs text-slate-600">
              Justificativa da pausa
              <textarea
                value={pauseNote}
                onChange={(event) => setPauseNote(event.target.value)}
                maxLength={500}
                rows={2}
                className="mt-1 block w-full rounded-lg border px-2 py-1 text-sm"
                required
              />
            </label>
          )}
          {action && (
            <button
              type="button"
              disabled={busy || (action === 'pause' && !pauseNote.trim())}
              onClick={() => submit(`/api/orders/${order._id}/production/task`, { action, expectedStage: stage, note: pauseNote })}
              className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >{busy ? 'Salvando...' : action === 'start' ? `Iniciar ${label.toLowerCase()}` : action === 'pause' ? 'Pausar tarefa' : 'Retomar tarefa'}</button>
          )}
          {order.production === 'em_producao' && (
            <div className="space-y-1">
              <label className="block text-xs text-slate-600">
                Justificativa da conclusão
                <textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border px-2 py-1 text-sm" required />
              </label>
              <button
                type="button"
                disabled={busy || !completionNote.trim()}
                onClick={() => submit(`/api/orders/${order._id}/production/task`, { action: 'complete', expectedStage: stage, note: completionNote })}
                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
              >Concluir {label.toLowerCase()}</button>
            </div>
          )}
        </div>
      )}
      {order.status === 'aprovado' && !canOperate && <p className="text-xs text-slate-500">Somente o responsável alocado ou o administrador pode operar esta tarefa.</p>}
      {order.production === 'concluido' && <p className="text-xs text-emerald-700">Pedido entregue.</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
