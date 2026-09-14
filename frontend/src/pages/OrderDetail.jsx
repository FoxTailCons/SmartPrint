import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Play, Pause, RotateCcw, CheckCircle2, ThumbsUp, Banknote, Pencil, Trash2,
} from 'lucide-react';
import { api, fmt, fmtDate } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import Modal from '../components/Modal.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payInst, setPayInst] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseNote, setPauseNote] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => api(`/api/orders/${id}`).then((o) => { setOrder(o); setLoading(false); });
  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!order) return <div className="p-8 text-center">Pedido não encontrado.</div>;

  const balance = (order.finalValue || 0) - (order.amountPaid || 0);

  const action = async (path, body) => {
    try {
      const o = await api(`/api/orders/${id}/${path}`, { method: 'POST', body });
      setOrder(o);
    } catch (e) { alert(e.message); }
  };

  const submitPayment = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return alert('Informe um valor válido');
    const body = { amount, paymentMethod };
    if (payInst !== '') body.installmentIndex = Number(payInst);
    try {
      const o = await api(`/api/orders/${id}/payments`, { method: 'POST', body });
      setOrder(o);
      setPayOpen(false);
      setPayAmount('');
      setPayInst('');
      setPaymentMethod('pix');
    } catch (e) { alert(e.message); }
  };

  const pauseProduction = async () => {
    const note = pauseNote.trim();
    if (!note) return alert('Informe o motivo da pausa');
    await action('production/pause', { note });
    setPauseNote('');
    setPauseOpen(false);
  };

  const remove = async () => {
    if (!confirm('Excluir este pedido?')) return;
    await api(`/api/orders/${id}`, { method: 'DELETE' });
    navigate('/pedidos');
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/pedidos" className="text-sm text-slate-500 hover:underline">← Pedidos</Link>
          <h1 className="text-2xl font-bold mt-1">Pedido #{order.number}</h1>
          <p className="text-sm text-slate-500">{order.client?.name || 'Cliente não cadastrado'} · Criado em {fmtDate(order.createdAt)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton orderId={order._id} className="px-3 py-2" />
          <WhatsAppButton orderId={order._id} />
          <Link to={`/pedidos/${order._id}/editar`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">
            <Pencil size={16} /> Editar
          </Link>
          <button onClick={remove} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Status do pedido</div>
          <div className="mt-2"><StatusBadge value={order.status} /></div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Produção</div>
          <div className="mt-2"><StatusBadge value={order.production} /></div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Pagamento</div>
          <div className="mt-2"><StatusBadge value={order.paymentStatus} /></div>
          <div className="text-xs text-slate-500 mt-2">Saldo: <strong className={balance > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(balance)}</strong></div>
        </div>
      </div>

      {/* Ações de fluxo */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Fluxo do pedido</h2>
        <div className="flex flex-wrap gap-2">
          {order.status === 'pendente' && (
            <button onClick={() => action('approve')} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <ThumbsUp size={16} /> Aprovar orçamento
            </button>
          )}
          {order.production === 'nao_iniciado' && order.status !== 'pendente' && (
            <button onClick={() => action('production/start')} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
              <Play size={16} /> Iniciar produção
            </button>
          )}
          {order.production === 'em_producao' && (
            <button onClick={() => setPauseOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600">
              <Pause size={16} /> Pausar produção
            </button>
          )}
          {order.production === 'pausado' && (
            <button onClick={() => action('production/resume')} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
              <RotateCcw size={16} /> Retomar produção
            </button>
          )}
          {order.production !== 'concluido' && order.status !== 'pendente' && (
            <button onClick={() => action('complete')} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              <CheckCircle2 size={16} /> Concluir pedido
            </button>
          )}
          {balance > 0 && (
            <button onClick={() => setPayOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900">
              <Banknote size={16} /> Receber pagamento
            </button>
          )}
        </div>
      </div>

      {/* Itens e valores */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="font-semibold mb-3">Itens</h2>
          <div className="space-y-2 text-sm">
            {order.items?.map((it, i) => (
              <div key={i} className="flex justify-between border-b pb-2">
                <span>{it.description} <span className="text-slate-400">({it.quantity}x {fmt(it.unitPrice)})</span></span>
                <span className="font-medium">{fmt(it.total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmt(order.totalValue)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Desconto</span><span>-{fmt(order.discount)}</span></div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span className="text-brand-600">{fmt(order.finalValue)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Já recebido</span><span className="text-emerald-600">{fmt(order.amountPaid)}</span></div>
            <div className="flex justify-between text-sm font-semibold"><span>Saldo devido</span><span className={balance > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(Math.max(0, balance))}</span></div>
          </div>
          {order.observations && <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">Obs: {order.observations}</p>}
        </div>

        {/* Parcelas */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="font-semibold mb-3">Parcelas / Desdobramento</h2>
          {(!order.installments || order.installments.length === 0) ? (
            <p className="text-sm text-slate-400">Sem parcelas cadastradas (pagamento à vista).</p>
          ) : (
            <div className="space-y-2">
              {order.installments.map((p, i) => (
                <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg border ${p.paid ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50'}`}>
                  <span>{i + 1}ª · {fmtDate(p.dueDate)}</span>
                  <span className="font-medium">{fmt(p.amount)}</span>
                  <span className={`text-xs font-semibold ${p.paid ? 'text-emerald-600' : 'text-slate-400'}`}>{p.paid ? 'PAGA' : 'EM ABERTO'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 text-xs text-slate-500">
            Entrega prevista: <strong>{fmtDate(order.deliveryDate)}</strong>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Histórico</h2>
        <div className="space-y-2 text-sm">
          {order.history?.slice().reverse().map((h, i) => (
            <div key={i} className="flex gap-3 text-slate-600">
              <span className="text-slate-400 shrink-0">{fmtDate(h.at)} {new Date(h.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span><strong>{h.action}</strong>{h.by ? ` por ${h.by}` : ''}{h.note ? ` — ${h.note}` : ''}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de recebimento */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Receber pagamento (parcial ou total)">
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div>Total do pedido: <strong>{fmt(order.finalValue)}</strong></div>
            <div>Já recebido: <strong className="text-emerald-600">{fmt(order.amountPaid)}</strong></div>
            <div>Saldo: <strong className="text-red-600">{fmt(balance)}</strong></div>
          </div>
          <div>
            <label className="text-sm font-medium">Valor recebido (R$)</label>
            <input type="number" step="any" autoFocus value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={balance} className="mt-1 w-full px-3 py-2.5 border rounded-lg text-lg font-semibold" />
            <button type="button" onClick={() => setPayAmount(balance)} className="mt-1 text-xs text-brand-600 hover:underline">Preencher com saldo total</button>
          </div>
          <div>
            <label className="text-sm font-medium">Forma de pagamento</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Cartão de débito</option>
              <option value="credito">Cartão de crédito</option>
              <option value="parcelado">Crédito parcelado</option>
            </select>
          </div>
          {order.installments?.length > 0 && (
            <div>
              <label className="text-sm font-medium">Marcar parcela específica (opcional)</label>
              <select value={payInst} onChange={(e) => setPayInst(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="">Desdobrar automaticamente (pagar em ordem)</option>
                {order.installments.map((p, i) => !p.paid && <option key={i} value={i}>{i + 1}ª · {fmtDate(p.dueDate)} · {fmt(p.amount)}</option>)}
              </select>
            </div>
          )}
          <button onClick={submitPayment} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold">Confirmar recebimento</button>
        </div>
      </Modal>

      <Modal open={pauseOpen} onClose={() => setPauseOpen(false)} title="Motivo da pausa da produção">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Informe o motivo para manter o histórico do pedido completo.
          </div>
          <div>
            <label htmlFor="pause-note" className="text-sm font-medium">Observação / motivo *</label>
            <textarea
              id="pause-note"
              autoFocus
              value={pauseNote}
              onChange={(e) => setPauseNote(e.target.value)}
              rows="4"
              required
              placeholder="Ex.: aguardando material do fornecedor..."
              className="mt-1 w-full px-3 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button type="button" onClick={pauseProduction} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold">
            Confirmar pausa
          </button>
        </div>
      </Modal>
    </div>
  );
}
