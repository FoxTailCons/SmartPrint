 import { useEffect, useState } from 'react';
 import { Link } from 'react-router-dom';
 import { AlertTriangle, Clock, BellRing } from 'lucide-react';
 import { api, fmtCivilDate } from '../api';
 import { getDeadline } from '../pages/printshop';

 export default function DeadlineSidebar() {
   const [items, setItems] = useState([]);
   useEffect(() => {
     api('/api/dashboard').then(data => {
       const urgentOrders = (data?.dailyUrgencies?.orders || []).slice(0, 5);
       setItems(urgentOrders);
     }).catch(() => setItems([]));
   }, []);

   if (!items.length) return null;

   return (
    <aside className="w-72 shrink-0 hidden xl:flex flex-col border-l border-slate-200 bg-slate-50">
      <div className="sticky top-0 z-10 bg-slate-50 px-3 pt-3 pb-2 border-b border-slate-200">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
         <BellRing size={16} /> Avisos de prazo
       </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
         {items.map(o => {
           const deadline = getDeadline(o);
           const isOverdue = deadline.overdue;
           return (
            <Link key={o._id} to={`/pedidos/${o._id}`} className="group block rounded-xl border bg-white p-3 text-sm shadow-sm hover:shadow-md hover:border-brand-300 transition">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                   {isOverdue ? <AlertTriangle size={16} /> : <Clock size={16} />}
                 </span>
                 <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">Pedido #{o.number}</div>
                  <div className="text-xs text-slate-500 truncate">{o.client?.name || 'Sem cliente'}</div>
                  <div className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{deadline.label}</div>
                 </div>
               </div>
             </Link>
           );
         })}
       </div>
     </aside>
   );
 }
