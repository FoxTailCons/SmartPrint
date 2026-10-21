import { getProductionStage, productionStages } from '../pages/printshop.js';

export default function ProductionProgress({ order }) {
  const stage = getProductionStage(order);
  const label = productionStages.find(([key]) => key === stage)?.[1] || stage;

  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">Etapa: {label}</div>
      {order.production === 'pausado' && <span className="text-amber-700">Tarefa pausada.</span>}
    </div>
  );
}
