import React from 'react';
import { Printer } from 'lucide-react';
import { api } from '../api.js';
import { buildOrderThermalHtml, openThermalPrintWindow, writeThermalPrint } from '../pages/thermalPrint.js';

export function printOrderDocument(orderId, format = 'a4') {
  const printOrder = async () => {
    if (format === '80mm') {
      const printWindow = openThermalPrintWindow();
      if (!printWindow) {
        alert('Seu navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
        return;
      }
      try {
        const order = await api(`/api/orders/${orderId}`);
        writeThermalPrint(printWindow, buildOrderThermalHtml(order));
      } catch (error) {
        printWindow.close();
        alert(error.message);
      }
      return;
    }

    try {
      const base = import.meta.env.VITE_API_URL || 'https://smartprint-am7g.onrender.com';
      const tokenValue = localStorage.getItem('sp_token');
      const response = await fetch(`${base}/api/orders/${orderId}/pdf`, {
        headers: {
          'Content-Type': 'application/pdf',
          ...(tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {}),
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Não foi possível gerar o PDF do documento.');
      }

      const blob = await response.blob();
      const pdfUrl = URL.createObjectURL(blob);
      const printWindow = window.open(pdfUrl, '_blank', 'width=980,height=760');
      if (!printWindow) {
        alert('Seu navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
        return;
      }

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (e) {
      alert(e.message);
    }
  };
  return printOrder();
}

export default function PrintButton({ orderId, format = 'a4', label = format === '80mm' ? '80 mm' : 'Imprimir', className = '' }) {
  return (
    <button
      type="button"
      onClick={() => printOrderDocument(orderId, format)}
      className={`inline-flex items-center gap-2 rounded-lg border text-sm hover:bg-slate-50 ${className}`}
    >
      <Printer size={16} /> {label}
    </button>
  );
}
