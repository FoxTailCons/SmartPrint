import { useState } from 'react';
import { MessageCircle, Copy, Check, Download } from 'lucide-react';
import { api } from '../api';
import Modal from './Modal.jsx';

export default function WhatsAppButton({ orderId, className = '', disabled = false }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [destinationPhone, setDestinationPhone] = useState('');

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

  const prepareLink = async () => {
    setLoading(true);
    try {
      const d = await api(`/api/orders/${orderId}/whatsapp?phone=${encodeURIComponent(destinationPhone)}`);
      setData(d);
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

  const downloadPdf = async () => {
    try {
      const base = import.meta.env.VITE_API_URL || 'https://smartprint-am7g.onrender.com';
      const tokenValue = localStorage.getItem('sp_token');
      const response = await fetch(`${base}/api/orders/${orderId}/pdf`, {
        headers: tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {},
      });
      if (!response.ok) throw new Error('Não foi possível gerar o PDF do documento.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data?.documentLabel?.toLowerCase() || 'documento'}-${orderId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        disabled={loading || disabled}
        title={disabled ? 'WhatsApp indisponível para este pedido' : undefined}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition disabled:opacity-50 ${className}`}
      >
        <MessageCircle size={16} /> {loading ? 'Gerando...' : 'WhatsApp'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Enviar ${data?.documentLabel?.toLowerCase() || 'documento'} via WhatsApp`} wide>
        {data && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Telefone:</span>
              <span className="font-mono font-semibold">{data.phone ? `+${data.phone}` : 'Informe um telefone de destino'}</span>
            </div>
            {data.requiresPhone && (
              <div className="flex flex-wrap gap-2">
                <label className="min-w-56 flex-1 text-sm">
                  WhatsApp de destino (com DDD)
                  <input
                    type="tel"
                    value={destinationPhone}
                    onChange={(event) => setDestinationPhone(event.target.value)}
                    placeholder="(51) 99999-9999"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <button type="button" onClick={prepareLink} disabled={loading} className="self-end rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-50">
                  {loading ? 'Preparando...' : 'Preparar WhatsApp'}
                </button>
              </div>
            )}
            <pre className="whitespace-pre-wrap bg-slate-50 border rounded-xl p-4 text-sm font-sans text-slate-700">
              {data.text}
            </pre>
            <div className="flex flex-wrap gap-2">
              {data.link && <a
                href={data.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
              >
                <MessageCircle size={16} /> Abrir no WhatsApp
              </a>}
              <button
                onClick={copy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50 font-medium"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar mensagem'}
              </button>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50 font-medium"
              >
                <Download size={16} /> Baixar {data.documentLabel?.toLowerCase() || 'documento'} em PDF
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Dica: abra o WhatsApp e, se necessário, anexe o PDF baixado para enviar o orçamento com o mesmo layout impresso.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
