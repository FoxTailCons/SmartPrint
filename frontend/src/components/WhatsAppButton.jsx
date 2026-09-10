import { useState } from 'react';
import { MessageCircle, Copy, Check } from 'lucide-react';
import { api } from '../api';
import Modal from './Modal.jsx';

export default function WhatsAppButton({ orderId, className = '' }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const openModal = async () => {
    setLoading(true);
    try {
      const d = await api(`/api/orders/${orderId}/whatsapp`);
      setData(d);
      setOpen(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(data?.text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <button
        onClick={openModal}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition disabled:opacity-50 ${className}`}
      >
        <MessageCircle size={16} /> {loading ? 'Gerando...' : 'WhatsApp'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Enviar pedido via WhatsApp" wide>
        {data && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Telefone:</span>
              <span className="font-mono font-semibold">+55 {data.phone || '—'}</span>
            </div>
            <pre className="whitespace-pre-wrap bg-slate-50 border rounded-xl p-4 text-sm font-sans text-slate-700">
              {data.text}
            </pre>
            <div className="flex flex-wrap gap-2">
              <a
                href={data.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
              >
                <MessageCircle size={16} /> Abrir no WhatsApp
              </a>
              <button
                onClick={copy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50 font-medium"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar mensagem'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Dica: se o número não abrir direto, copie a mensagem e envie manualmente no WhatsApp Web.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
