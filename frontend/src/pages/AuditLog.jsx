import { useEffect, useState } from 'react';
import { formatInstantDateTime } from '../dateUtils.js';
import { api } from '../api';
import { useServerPagination } from '../hooks/useServerPagination.js';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';

const actionLabels = {
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'caixa.sangria': 'Sangria',
  'caixa.suprimento': 'Suprimento',
  'caixa.fechamento': 'Fechamento de caixa',
  'pedido.excluido': 'Exclusão de pedido/venda',
  'produto.preco_custo_alterado': 'Alteração de preço/custo',
  'usuario.status_alterado': 'Alteração de acesso',
  'usuario.alterado': 'Alteração de usuário',
  'usuario.arquivado': 'Usuário excluído/arquivado',
  'pagamento.desconto_acima_limite': 'Desconto acima de 10%',
  'autorizacao.desconto': 'Autorização de desconto',
  'autorizacao.cancelamento': 'Autorização de cancelamento',
};

export default function AuditLog() {
  const [filters, setFilters] = useState({ usuarioSolicitante: '', de: '', ate: '', acao: '' });
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = new URLSearchParams();
  if (filters.usuarioSolicitante) query.set('usuarioSolicitante', filters.usuarioSolicitante);
  if (filters.de && filters.ate) {
    query.set('de', filters.de);
    query.set('ate', filters.ate);
  }
  if (filters.acao) query.set('acao', filters.acao);
  const list = useServerPagination('/api/audit', query.toString(), page, pageSize);

  useEffect(() => {
    api('/api/auth/users')
      .then(setUsers)
      .catch((error) => setUsersError(error.message));
  }, []);

  const updateFilter = (name, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Auditoria</h1>
        <p className="text-sm text-slate-500">Histórico de ações administrativas e operações sensíveis.</p>
      </div>
      {(usersError || list.error) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {usersError || list.error}
          {list.error && <button type="button" onClick={list.retry} className="ml-3 underline">Tentar novamente</button>}
        </div>
      )}
      <section aria-label="Filtros de auditoria" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="min-w-48 text-sm text-slate-600">
          Usuário
          <select value={filters.usuarioSolicitante} onChange={(event) => updateFilter('usuarioSolicitante', event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
            <option value="">Todos</option>
            {users.map((user) => <option key={user._id} value={user._id}>{user.name} · {user.email}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          De
          <input type="date" value={filters.de} onChange={(event) => updateFilter('de', event.target.value)} className="mt-1 block rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm text-slate-600">
          Até
          <input type="date" value={filters.ate} onChange={(event) => updateFilter('ate', event.target.value)} className="mt-1 block rounded-lg border px-3 py-2" />
        </label>
        <label className="min-w-52 text-sm text-slate-600">
          Ação
          <select value={filters.acao} onChange={(event) => updateFilter('acao', event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
            <option value="">Todas</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm" aria-label="Registros de auditoria">
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Autorizou</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Detalhes</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.loading ? <tr><td colSpan="7"><ListSkeleton variant="table" rows={4} /></td></tr>
                : list.items.length === 0 ? <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Nenhum registro encontrado.</td></tr>
                  : list.items.map((entry) => (
                    <tr key={entry._id}>
                      <td className="whitespace-nowrap px-4 py-3">{formatInstantDateTime(entry.data)}</td>
                      <td className="px-4 py-3">{entry.usuarioSolicitante?.name || entry.detalhes?.email || '—'}</td>
                      <td className="px-4 py-3">{entry.usuarioAutorizou?.name || '—'}</td>
                      <td className="px-4 py-3">{actionLabels[entry.acao] || entry.acao}</td>
                      <td className="max-w-sm whitespace-pre-wrap break-words px-4 py-3">{JSON.stringify(entry.detalhes)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{entry.ip || '—'}</td>
                      <td className={`px-4 py-3 font-medium ${entry.sucesso ? 'text-emerald-700' : 'text-red-700'}`}>{entry.sucesso ? 'Sucesso' : 'Falha'}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
