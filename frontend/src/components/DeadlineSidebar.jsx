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
     <aside className="w-72 shrink-0 hidden xl:block border-l border-slate-200 bg-slate-50 p-3">
       <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
         <BellRing size={16} /> Avisos de prazo
       </h3>
       <div className="space-y-2">
         {items.map(o => {
           const deadline = getDeadline(o);
           const isOverdue = deadline.overdue;
           return (
             <Link key={o._id} to={`/pedidos/${o._id}`} className="group block rounded-lg border bg-white p-2 text-sm hover:bg-slate-100">
               <div className="flex items-start gap-2">
                 <span className={`mt-0.5 ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                   {isOverdue ? <AlertTriangle size={16} /> : <Clock size={16} />}
                 </span>
                 <div className="min-w-0">
                   <div className="truncate font-medium text-slate-800">Pedido #{o.number}</div>
                   <div className="text-xs text-slate-500 truncate">{o.client?.name || 'Sem cliente'}</div>
                   <div className={`mt-0.5 text-xs ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>{deadline.label}</div>
                 </div>
               </div>
             </Link>
           );
         })}
       </div>
     </aside>
   );
 }
