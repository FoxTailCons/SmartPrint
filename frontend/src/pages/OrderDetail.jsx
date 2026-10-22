import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ThumbsUp, Banknote, Pencil, Trash2, MessageCircle,
} from 'lucide-react';
import { api, fmt, fmtCivilDate, fmtDate } from '../api';
import { formatInstantTime } from '../dateUtils.js';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import PaymentReceiptPrintButton from '../components/PaymentReceiptPrintButton.jsx';
import ThermalPrintButton from '../components/ThermalPrintButton.jsx';
import Modal from '../components/Modal.jsx';
import { createPaymentReceipt, getPaymentLabel } from './paymentReceipt.js';
import { getOrderDocumentLabel } from './orderPresentation.js';
import { getDeadline, itemMetadata, priorityLabels } from './printshop.js';
import { buildBalanceThermalHtml } from './thermalPrint.js';
import { getOrderBalance, getOrderPaymentStatus, getPaymentDiscountTotal } from './orderBalance.js';
import ProductionProgress from '../components/ProductionProgress.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const paymentMethodLabels = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Cartão débito', credito: 'Cartão crédito', parcelado: 'Crédito parcelado' };

export const buildPaymentPayload = ({
  amount, discount, paymentMethod, receiptUrl, installmentIndex,
  discountReason, adminEmail, adminPassword, role,
}) => {
  const body = { amount, discount, paymentMethod, receiptUrl };
  if (installmentIndex !== undefined) body.installmentIndex = installmentIndex;
  if (discount > 0) body.discountReason = discountReason;
  if (discount > 0 && role === 'atendente') {
    body.adminAuthorization = { email: adminEmail, password: adminPassword };
  }
  return body;
};

export const buildCancelPayload = ({ reason, role, adminEmail, adminPassword }) => {
  const body = {};
  if (reason?.trim()) body.reason = reason.trim();
  if (role === 'atendente') body.adminAuthorization = { email: adminEmail, password: adminPassword };
  return body;
};

export default function OrderDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payInst, setPayInst] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [paymentDiscount, setPaymentDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelAdminEmail, setCancelAdminEmail] = useState('');
  const [cancelAdminPassword, setCancelAdminPassword] = useState('');
  const [paymentToCancel, setPaymentToCancel] = useState(null);
  const [paymentCancelReason, setPaymentCancelReason] = useState('');
  const [paymentCancelAdminEmail, setPaymentCancelAdminEmail] = useState('');
  const [paymentCancelAdminPassword, setPaymentCancelAdminPassword] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => api(`/api/orders/${id}`).then((o) => { setOrder(o); setLoading(false); });
  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!order) return <div className="p-8 text-center">Pedido não encontrado.</div>;

  const isProductionUser = user?.role === 'producao';
  const isCanceled = order.status === 'cancelado';
  const balance = getOrderBalance(order);
  const paymentDiscounts = getPaymentDiscountTotal(order);
  const deadline = getDeadline(order);
  const hasPayments = Number(order.amountPaid || 0) !== 0
    || order.payments?.length > 0
    || order.history?.some((entry) => entry.action === 'pagamento');
  const canCancel = !isProductionUser
    && ['pendente', 'aprovado'].includes(order.status)
    && !order.quickSaleKey
    && !hasPayments;

  const action = async (path, body) => {
    try {
      const o = await api(`/api/orders/${id}/${path}`, { method: 'POST', body });
      setOrder(o);
    } catch (e) { alert(e.message); }
  };

  const submitPayment = async () => {
    const amount = Number(payAmount);
    const discount = paymentDiscount.trim() ? Number(paymentDiscount) : 0;
    if (!Number.isFinite(amount) || amount <= 0) return alert('Informe um valor válido');
    if (!Number.isFinite(discount) || discount < 0) return alert('Informe um desconto válido');
    if (discount > 0 && !discountReason.trim()) return alert('Informe o motivo do desconto');
    if (discount > 0 && user?.role === 'atendente' && (!adminEmail.trim() || !adminPassword)) {
      return alert('Informe as credenciais do administrador para autorizar o desconto');
    }
    const body = buildPaymentPayload({
      amount,
      discount,
      paymentMethod,
      receiptUrl: receiptUrl.trim(),
      installmentIndex: payInst === '' ? undefined : Number(payInst),
      discountReason: discountReason.trim(),
      adminEmail: adminEmail.trim(),
      adminPassword,
      role: user?.role,
    });
    try {
      const o = await api(`/api/orders/${id}/payments`, { method: 'POST', body });
      setOrder(o);
      setPayOpen(false);
      setPayAmount('');
      setPayInst('');
      setPaymentMethod('pix');
      setReceiptUrl('');
      setPaymentDiscount('');
      setDiscountReason('');
      setAdminEmail('');
      setAdminPassword('');
    } catch (e) {
      setAdminPassword('');
      alert(e.message);
    }
  };

  const closePayment = () => {
    setPayOpen(false);
    setAdminPassword('');
  };

  const closeCancel = () => {
    setCancelOpen(false);
    setCancelAdminPassword('');
  };

  const closePaymentCancellation = () => {
    setPaymentToCancel(null);
    setPaymentCancelReason('');
    setPaymentCancelAdminEmail('');
    setPaymentCancelAdminPassword('');
  };

  const submitPaymentCancellation = async () => {
    const payment = order.payments?.[paymentToCancel];
    const reason = paymentCancelReason.trim();
    if (!payment?._id) return alert('Não foi possível identificar este pagamento');
    if (!reason) return alert('Informe o motivo do estorno');
    if (reason.length > 500) return alert('O motivo deve ter até 500 caracteres');
    if (user?.role === 'atendente' && (!paymentCancelAdminEmail.trim() || !paymentCancelAdminPassword)) {
      return alert('Informe as credenciais do administrador para autorizar o estorno');
    }
    try {
      const canceled = await api(`/api/orders/${id}/payments/${payment._id}/cancel`, {
        method: 'POST',
        body: buildCancelPayload({
          reason,
          role: user?.role,
          adminEmail: paymentCancelAdminEmail.trim(),
          adminPassword: paymentCancelAdminPassword,
        }),
      });
      setOrder(canceled);
      closePaymentCancellation();
    } catch (error) {
      setPaymentCancelAdminPassword('');
      alert(error.message);
    }
  };

  const submitCancel = async () => {
    const reason = cancelReason.trim();
    if (!reason && user?.role !== 'admin') return alert('Informe o motivo do cancelamento');
    if (reason.length > 500) return alert('O motivo deve ter até 500 caracteres');
    if (user?.role === 'atendente' && (!cancelAdminEmail.trim() || !cancelAdminPassword)) {
      return alert('Informe as credenciais do administrador para autorizar o cancelamento');
    }
    try {
      const canceled = await api(`/api/orders/${id}/cancel`, {
        method: 'POST',
        body: buildCancelPayload({
          reason,
          role: user?.role,
          adminEmail: cancelAdminEmail.trim(),
          adminPassword: cancelAdminPassword,
        }),
      });
      setOrder(canceled);
      setCancelReason('');
      setCancelAdminEmail('');
      setCancelAdminPassword('');
      setCancelOpen(false);
    } catch (error) {
      setCancelAdminPassword('');
      alert(error.message);
    }
  };

  const remove = async () => {
    if (!confirm('Excluir este pedido?')) return;
    await api(`/api/orders/${id}`, { method: 'DELETE' });
    navigate('/pedidos');
  };

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to={isProductionUser ? '/producao' : '/pedidos'} className="text-sm text-slate-500 hover:underline">
            {isProductionUser ? '← Produção' : '← Pedidos / Orçamentos'}
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            {getOrderDocumentLabel(order)} #{order.number}
          </h1>
          <p className="text-sm text-slate-500">{order.client?.name || 'Cliente não cadastrado'} · Criado em {fmtDate(order.createdAt)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isProductionUser && !isCanceled && <PrintButton orderId={order._id} className="px-3 py-2" />}
          {!isProductionUser && !isCanceled && <PrintButton orderId={order._id} format="80mm" className="px-3 py-2" />}
          {!isProductionUser && !isCanceled && balance > 0 && (order.status !== 'pendente' || order.amountPaid > 0) && <ThermalPrintButton html={buildBalanceThermalHtml(order)} label="Pendência" className="px-3 py-2" />}
          {!isProductionUser && !isCanceled && <WhatsAppButton orderId={order._id} />}
          {!isProductionUser && !isCanceled && !order.quickSaleKey && <Link to={`/pedidos/${order._id}/editar`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">
            <Pencil size={16} /> Editar
          </Link>}
          {canCancel && <button onClick={user?.role === 'admin' ? submitCancel : () => setCancelOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 text-sm hover:bg-amber-50">
            Cancelar pedido
          </button>}
          {user?.role === 'admin' && !order.quickSaleKey && <button onClick={remove} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
            <Trash2 size={16} /> Excluir
          </button>}
        </div>
      </div>

      {/* Status cards */}
      <div className={`grid grid-cols-1 ${isProductionUser ? 'md:grid-cols-1' : 'md:grid-cols-3'} gap-4`}>
        {!isProductionUser && <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Status do pedido</div>
          <div className="mt-2"><StatusBadge value={order.status} /></div>
        </div>}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Produção</div>
          <div className="mt-2"><StatusBadge value={isCanceled ? 'cancelado' : order.production} /></div>
          <p className={`mt-2 text-xs ${deadline.overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{deadline.label}</p>
          <p className="mt-1 text-xs text-slate-500">Prioridade: {priorityLabels[order.priority || 'normal']}</p>
        </div>
        {!isProductionUser && <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Pagamento</div>
          <div className="mt-2"><StatusBadge value={getOrderPaymentStatus(order)} /></div>
          <div className="text-xs text-slate-500 mt-2">Saldo: <strong className={balance > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(balance)}</strong></div>
        </div>}
      </div>

      {/* Ações de fluxo */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Fluxo do pedido</h2>
        {!isCanceled && <div className="mb-4"><ProductionProgress order={order} /></div>}
        {order.status === 'aprovado' && <Link to="/producao" className="mb-3 inline-flex rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">Abrir painel de Produção</Link>}
        <div className="flex flex-wrap gap-2">
          {isCanceled && <p className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-700">Este pedido foi cancelado; pagamentos e alterações não estão disponíveis.</p>}
          {!isProductionUser && order.status === 'pendente' && (
            <button onClick={() => action('approve')} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <ThumbsUp size={16} /> Aprovar orçamento
            </button>
          )}
          {!isProductionUser && !isCanceled && balance > 0 && order.status !== 'pendente' && (
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
              <div key={i} className="flex justify-between gap-3 border-b pb-2">
                <div>{it.description} <span className="text-slate-400">({isProductionUser ? it.quantity : `${it.quantity}x ${fmt(it.unitPrice)}`})</span>
                  <dl className="mt-2 space-y-1 text-xs text-slate-500">
                    {itemMetadata(it).map(([label, value]) => <div key={label} className="break-words"><dt className="inline font-medium">{label}: </dt><dd className="inline">{label === 'Arte' && /^https?:\/\//i.test(value) ? <a href={value} target="_blank" rel="noreferrer" className="text-brand-700 underline">Abrir arquivo de arte</a> : value}</dd></div>)}
                  </dl>
                </div>
                {!isProductionUser && <span className="font-medium">{fmt(it.total)}</span>}
              </div>
            ))}
          </div>
          {!isProductionUser && <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmt(order.totalValue)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Desconto</span><span>-{fmt(order.discount)}</span></div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span className="text-brand-600">{fmt(order.finalValue)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Já recebido</span><span className="text-emerald-600">{fmt(order.amountPaid)}</span></div>
            {paymentDiscounts > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Descontos no pagamento</span><span>{fmt(paymentDiscounts)}</span></div>}
            <div className="flex justify-between text-sm font-semibold"><span>Saldo devido</span><span className={balance > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(Math.max(0, balance))}</span></div>
          </div>}
          {order.observations && <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">Obs: {order.observations}</p>}
        </div>

        {/* Parcelas */}
        {!isProductionUser && <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="font-semibold mb-3">Parcelas</h2>
          {(!order.installments || order.installments.length === 0) ? (
            <p className="text-sm text-slate-400">Sem parcelas cadastradas (pagamento à vista).</p>
          ) : (
            <div className="space-y-2">
              {order.installments.map((p, i) => (
                <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg border ${p.paid ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50'}`}>
                  <span>{i + 1}ª · {fmtCivilDate(p.dueDate)}</span>
                  <span className="font-medium">{fmt(p.amount)}</span>
                  <span className={`text-xs font-semibold ${p.paid ? 'text-emerald-600' : 'text-slate-400'}`}>{p.paid ? 'PAGA' : 'EM ABERTO'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 text-xs text-slate-500">
            Entrega prevista: <strong className={deadline.overdue ? 'text-red-700' : ''}>{deadline.label}</strong>
          </div>
        </div>}
      </div>

      {order.attachments?.length > 0 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Fotos e anexos</h2>
          <div className="flex flex-wrap gap-2">
            {order.attachments.map((attachment) => <a key={`${attachment.label}-${attachment.url}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm text-brand-700 hover:bg-brand-50">{attachment.label}</a>)}
          </div>
        </section>
      )}

      {/* Pagamentos recebidos */}
      {!isProductionUser && <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Pagamentos recebidos</h2>
        {!order.payments?.length ? (
          <p className="text-sm text-slate-400">Nenhum pagamento recebido.</p>
        ) : (
          <div className="space-y-2">
            {order.payments.map((payment, index) => {
              const receipt = createPaymentReceipt(order, index);
              return (
                <div key={`${payment.paidAt}-${index}`} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm">
                  <div>
                    <div className={`font-medium ${payment.canceledAt ? 'text-slate-400 line-through' : ''}`}>{getPaymentLabel(order.payments, index)} · {fmt(payment.amount)}</div>
                    <div className="text-xs text-slate-500">{paymentMethodLabels[payment.method] || payment.method} · {fmtDate(payment.paidAt)}</div>
                    {payment.canceledAt ? (
                      <div className="mt-1 text-xs text-red-600">
                        Estornado por {payment.canceledBy || 'usuário'} em {fmtDate(payment.canceledAt)}: {payment.cancellationReason}
                      </div>
                    ) : payment.receiptUrl && <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-600 underline">Ver comprovante</a>}
                  </div>
                  {payment.canceledAt ? (
                    <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">ESTORNADO</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => { setPaymentToCancel(index); setPaymentCancelReason(''); }} className="rounded-lg border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50">
                        Estornar
                      </button>
                      {receipt && <>
                        <PaymentReceiptPrintButton text={receipt.text} />
                        {receipt.link ? (
                          <a href={receipt.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-white hover:bg-emerald-600">
                            <MessageCircle size={15} /> Enviar recibo
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">Cadastre o WhatsApp do cliente para enviar o recibo.</span>
                        )}
                      </>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* Histórico */}
      {!isProductionUser && <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Histórico</h2>
        <div className="space-y-2 text-sm">
          {order.history?.slice().reverse().map((h, i) => (
            <div key={i} className="flex gap-3 text-slate-600">
              <span className="text-slate-400 shrink-0">{fmtDate(h.at)} {formatInstantTime(h.at)}</span>
              <span><strong>{h.action}</strong>{h.by ? ` por ${h.by}` : ''}{h.note ? ` — ${h.note}` : ''}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* Modal de recebimento */}
      {!isProductionUser && <Modal open={payOpen} onClose={closePayment} title="Receber pagamento (parcial ou total)">
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div>Total do pedido: <strong>{fmt(order.finalValue)}</strong></div>
            <div>Já recebido: <strong className="text-emerald-600">{fmt(order.amountPaid)}</strong></div>
            {paymentDiscounts > 0 && <div>Descontos já aplicados: <strong>{fmt(paymentDiscounts)}</strong></div>}
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
          <div>
            <label className="text-sm font-medium">Desconto neste recebimento (R$) <span className="font-normal text-slate-500">(opcional)</span></label>
            <input type="number" min="0" max={balance} step="0.01" value={paymentDiscount} onChange={(event) => {
              setPaymentDiscount(event.target.value);
              if (Number(event.target.value) <= 0) setAdminPassword('');
            }} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </div>
          {Number(paymentDiscount) > 0 && (
            <>
              <label className="block text-sm font-medium">
                Motivo do desconto
                <textarea required maxLength="500" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              {user?.role === 'atendente' && (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">Autorização do administrador</p>
                  <label className="block text-sm font-medium">
                    E-mail do administrador
                    <input type="email" autoComplete="username" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                  <label className="block text-sm font-medium">
                    Senha do administrador
                    <input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                </div>
              )}
            </>
          )}
          <div>
            <label className="text-sm font-medium">Link do comprovante <span className="font-normal text-slate-500">(opcional)</span></label>
            <input type="url" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {order.installments?.length > 0 && (
            <div>
              <label className="text-sm font-medium">Marcar parcela específica (opcional)</label>
              <select value={payInst} onChange={(e) => setPayInst(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="">Pagar automaticamente (em ordem)</option>
                {order.installments.map((p, i) => !p.paid && <option key={i} value={i}>{i + 1}ª · {fmtCivilDate(p.dueDate)} · {fmt(p.amount)}</option>)}
              </select>
            </div>
          )}
          <button onClick={submitPayment} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold">Confirmar recebimento</button>
        </div>
      </Modal>}

      {!isProductionUser && <Modal open={paymentToCancel !== null} onClose={closePaymentCancellation} title="Estornar pagamento">
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            O pagamento será marcado como estornado, mantido no histórico e removido do total recebido.
          </p>
          <label className="block text-sm font-medium">
            Motivo do estorno *
            <textarea autoFocus maxLength="500" rows="3" value={paymentCancelReason} onChange={(event) => setPaymentCancelReason(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          {user?.role === 'atendente' && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Autorização do administrador</p>
              <label className="block text-sm font-medium">
                E-mail do administrador
                <input type="email" autoComplete="username" value={paymentCancelAdminEmail} onChange={(event) => setPaymentCancelAdminEmail(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">
                Senha do administrador
                <input type="password" autoComplete="current-password" value={paymentCancelAdminPassword} onChange={(event) => setPaymentCancelAdminPassword(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            </div>
          )}
          <button type="button" onClick={submitPaymentCancellation} className="w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700">
            Confirmar estorno
          </button>
        </div>
      </Modal>}

      {user?.role === 'atendente' && <Modal open={cancelOpen} onClose={closeCancel} title="Cancelar pedido">
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            O pedido será mantido no histórico como cancelado. Pedidos com pagamentos registrados não podem ser cancelados.
          </p>
          <label className="block text-sm font-medium">
            Motivo do cancelamento *
            <textarea autoFocus maxLength="500" rows="3" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          {user?.role === 'atendente' && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Autorização do administrador</p>
              <label className="block text-sm font-medium">
                E-mail do administrador
                <input type="email" autoComplete="username" value={cancelAdminEmail} onChange={(event) => setCancelAdminEmail(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">
                Senha do administrador
                <input type="password" autoComplete="current-password" value={cancelAdminPassword} onChange={(event) => setCancelAdminPassword(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            </div>
          )}
          <button type="button" onClick={submitCancel} className="w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700">
            Confirmar cancelamento
          </button>
        </div>
      </Modal>}
    </div>
  );
}
