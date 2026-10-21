const statusStyles = {
  pendente: 'bg-amber-100 text-amber-700 border-amber-200',
  aprovado: 'bg-blue-100 text-blue-700 border-blue-200',
  concluido: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelado: 'bg-red-100 text-red-700 border-red-200',
  aberto: 'bg-slate-100 text-slate-700 border-slate-200',
  parcial: 'bg-orange-100 text-orange-700 border-orange-200',
  pago: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  quitado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  nao_iniciado: 'bg-slate-100 text-slate-600 border-slate-200',
  em_producao: 'bg-blue-100 text-blue-700 border-blue-200',
  pausado: 'bg-red-100 text-red-700 border-red-200',
};

const labels = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  aberto: 'Aberto',
  parcial: 'Parcial',
  pago: 'Pago',
  quitado: 'Quitado',
  nao_iniciado: 'Não iniciado',
  em_producao: 'Em produção',
  pausado: 'Pausado',
};

export function StatusBadge({ value }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyles[value] || 'bg-slate-100 text-slate-600'}`}>
      {labels[value] || value}
    </span>
  );
}
