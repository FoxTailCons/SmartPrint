import { Printer } from 'lucide-react';
import { openThermalPrintWindow, writeThermalPrint } from '../pages/thermalPrint.js';

export default function ThermalPrintButton({ html, label = '80 mm', buttonLabel = label, className = '' }) {
  const print = () => {
    const printWindow = openThermalPrintWindow();
    if (!printWindow) {
      alert('Seu navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
      return;
    }
    try {
      writeThermalPrint(printWindow, html);
    } catch (error) {
      printWindow.close();
      alert(error.message);
    }
  };

  return (
    <button
      type="button"
      onClick={print}
      aria-label={`Imprimir em bobina 80 mm${label === '80 mm' ? '' : `: ${label}`}`}
      title="Imprimir em bobina de 80 mm"
      className={`inline-flex items-center gap-1 rounded-lg border text-sm hover:bg-slate-50 ${className}`}
    >
      <Printer size={14} /> {buttonLabel}
    </button>
  );
}
