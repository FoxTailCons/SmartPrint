import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BellRing, CheckSquare, ChevronLeft, ChevronRight,
  Clock, Loader2, Pencil, Plus, Square, Trash2, X,
} from 'lucide-react';
import { api, fmtCivilDate } from '../api';
import { getDeadline } from '../pages/printshop';

const STORAGE_KEY = 'sp_today_panel_open';

const statusLabel = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
};

function emptyForm() {
  return { activity: '', description: '', dueDate: '', assignee: '', status: 'pending' };
}

export default function TodayPanel() {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return true;
      return stored === '1';
    } catch {
      return true;
    }
  });
  const [deadlines, setDeadlines] = useState([]);
  const [todos, setTodos] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const persistOpen = (value) => {
    setOpen(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    try {
      const [dash, todoList, assignees] = await Promise.all([
        api('/api/dashboard').catch(() => null),
        api('/api/todos').catch(() => []),
        api('/api/orders/production-assignees').catch(() => []),
      ]);
      setDeadlines((dash?.dailyUrgencies?.orders || []).slice(0, 5));
      setTodos(Array.isArray(todoList) ? todoList : []);
      setUsers(Array.isArray(assignees) ? assignees : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Falha ao carregar painel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, [load]);

  const pendingTodos = todos.filter((t) => t.status !== 'completed' && t.status !== 'archived');
  const badgeCount = deadlines.length + pendingTodos.length;

  const assigneeName = (id) => {
    if (!id) return '';
    const found = users.find((u) => String(u._id) === String(id));
    return found?.name || '';
  };

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(false);
  };

  const startEdit = (todo) => {
    setEditing(todo);
    setForm({
      activity: todo.activity || '',
      description: todo.description || '',
      dueDate: todo.dueDate ? String(todo.dueDate).slice(0, 10) : '',
      assignee: todo.assignee ? String(todo.assignee) : '',
      status: todo.status || 'pending',
    });
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.activity.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      activity: form.activity.trim(),
      description: form.description.trim(),
      dueDate: form.dueDate || null,
      assignee: form.assignee || null,
      status: form.status || 'pending',
    };
    try {
      if (editing) {
        const updated = await api(`/api/todos/${editing._id}`, { method: 'PUT', body: payload });
        setTodos((list) => list.map((t) => (t._id === updated._id ? updated : t)));
      } else {
        const created = await api('/api/todos', { method: 'POST', body: payload });
        setTodos((list) => [created, ...list]);
      }
      resetForm();
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a tarefa');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (todo, status) => {
    try {
      const updated = await api(`/api/todos/${todo._id}`, {
        method: 'PUT',
        body: {
          activity: todo.activity,
          description: todo.description || '',
          dueDate: todo.dueDate || null,
          assignee: todo.assignee || null,
          status,
        },
      });
      setTodos((list) => list.map((t) => (t._id === updated._id ? updated : t)));
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o status');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir esta tarefa?')) return;
    try {
      await api(`/api/todos/${id}`, { method: 'DELETE' });
      setTodos((list) => list.filter((t) => t._id !== id));
    } catch (err) {
      setError(err.message || 'Não foi possível excluir');
    }
  };

  if (!open) {
    return (
      <div className="hidden xl:flex shrink-0 flex-col items-center border-l border-slate-200 bg-slate-50 py-3 px-1.5 gap-2">
        <button
          type="button"
          onClick={() => persistOpen(true)}
          className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100"
          title="Abrir painel de hoje"
          aria-label="Abrir painel de hoje"
        >
          <BellRing size={18} />
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => persistOpen(true)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
          aria-label="Expandir painel"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    );
  }

  return (
    <aside className="hidden xl:flex w-80 shrink-0 flex-col border-l border-slate-200 bg-slate-50">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <BellRing size={16} className="text-brand-500" />
          Hoje
          {badgeCount > 0 && (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {badgeCount}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => persistOpen(false)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
          aria-label="Recolher painel"
          title="Recolher"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            {error && (
              <p className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700" role="alert">
                {error}
              </p>
            )}

            <section className="border-b border-slate-200 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Clock size={13} /> Prazos
              </h3>
              {!deadlines.length ? (
                <p className="text-xs text-slate-400">Nenhum prazo urgente.</p>
              ) : (
                <ul className="space-y-2">
                  {deadlines.map((order) => {
                    const deadline = getDeadline(order);
                    const overdue = deadline.overdue;
                    return (
                      <li key={order._id}>
                        <Link
                          to={`/pedidos/${order._id}`}
                          className="block rounded-xl border border-slate-200 bg-white p-2.5 text-sm shadow-sm transition hover:border-brand-300 hover:shadow-md"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className={`mt-0.5 rounded-full p-1.5 ${overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                              {overdue ? <AlertTriangle size={14} /> : <Clock size={14} />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-slate-800">Pedido #{order.number}</div>
                              <div className="truncate text-xs text-slate-500">
                                {order.client?.name || order.clientInfo?.name || 'Sem cliente'}
                              </div>
                              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {deadline.label}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <CheckSquare size={13} /> Tarefas
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2 py-1 text-xs font-medium text-white hover:bg-brand-600"
                >
                  <Plus size={14} /> Nova
                </button>
              </div>

              {showForm && (
                <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {editing ? 'Editar tarefa' : 'Nova tarefa'}
                    </span>
                    <button type="button" onClick={resetForm} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar formulário">
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    required
                    value={form.activity}
                    onChange={(e) => setForm((f) => ({ ...f, activity: e.target.value }))}
                    placeholder="Atividade *"
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                  />
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Descrição (opcional)"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
                    />
                    <select
                      value={form.assignee}
                      onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
                    >
                      <option value="">Responsável</option>
                      {users.map((u) => (
                        <option key={u._id} value={u._id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  {editing && (
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
                    >
                      <option value="pending">Pendente</option>
                      <option value="in_progress">Em andamento</option>
                      <option value="completed">Concluída</option>
                    </select>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-lg bg-brand-500 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {saving ? 'Salvando…' : editing ? 'Salvar' : 'Adicionar'}
                  </button>
                </form>
              )}

              {!pendingTodos.length ? (
                <p className="text-xs text-slate-400">Nenhuma tarefa pendente.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingTodos.map((todo) => (
                    <li key={todo._id} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => handleStatus(todo, 'completed')}
                          className="mt-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-green-50 hover:text-green-600"
                          title="Marcar como concluída"
                          aria-label="Concluir tarefa"
                        >
                          <Square size={16} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{todo.activity}</p>
                          {todo.description ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{todo.description}</p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                            <span className={`rounded-full px-1.5 py-0.5 ${
                              todo.status === 'in_progress'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {statusLabel[todo.status] || todo.status}
                            </span>
                            {todo.dueDate ? <span>{fmtCivilDate(todo.dueDate)}</span> : null}
                            {todo.assignee ? <span>{assigneeName(todo.assignee)}</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => startEdit(todo)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Editar"
                            aria-label="Editar tarefa"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(todo._id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
                            aria-label="Excluir tarefa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {todo.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleStatus(todo, 'in_progress')}
                          className="mt-2 w-full rounded-lg border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Iniciar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
