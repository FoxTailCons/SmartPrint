import { Printer } from 'lucide-react';
import ThermalPrintButton from './ThermalPrintButton.jsx';
import { buildPaymentThermalHtml, printCompany } from '../pages/thermalPrint.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export default function PaymentReceiptPrintButton({ text }) {
  const thermalHtml = buildPaymentThermalHtml(text);
  const printReceipt = () => {
    const printWindow = window.open('', '_blank', 'width=980,height=760');
    if (!printWindow) {
      alert('Seu navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
      return;
    }

    const receiptText = escapeHtml(text.replace(/^\*SMART PRINT\*\n/, '').replace(/\*/g, ''));
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Recibo de pagamento</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { color: #111827; font: 14px Arial, sans-serif; }
            h1 { margin: 0 0 8px; font-size: 22px; }
            .business { margin-bottom: 20px; line-height: 1.5; }
            pre { white-space: pre-wrap; font: inherit; line-height: 1.8; }
            @media screen {
              body { max-width: 700px; margin: 40px auto; padding: 32px; border: 1px solid #d1d5db; }
            }
          </style>
        </head>
        <body><h1>${printCompany.name}</h1><div class="business">
          CNPJ: ${printCompany.cnpj}<br>
          ${printCompany.address}<br>
          ${printCompany.neighborhood} · ${printCompany.city} · CEP: ${printCompany.zipCode}<br>
          Tel: ${printCompany.phone}
        </div><pre>${receiptText}</pre></body>
      </html>`);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  return (
    <>
      <button
        type="button"
        onClick={printReceipt}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
      >
        <Printer size={15} /> Imprimir recibo
      </button>
      <ThermalPrintButton html={thermalHtml} label="Recibo 80 mm" className="px-3 py-2" />
    </>
  );
}
