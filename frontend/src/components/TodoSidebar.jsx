import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const TodoSidebar = () => {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [todos, setTodos] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [formData, setFormData] = useState({
    activity: '',
    description: '',
    dueDate: '',
    assignee: '',
    status: 'pending'
  });

  useEffect(() => {
    const loadTodos = async () => {
      try {
        const res = await fetch('/api/todos');
        const data = await res.json();
        setTodos(data);
      } catch (error) {
        console.error('Failed to load todos:', error);
      } finally {
        setLoading(false);
      }
    };

    const loadUsers = async () => {
      try {
        const res = await fetch('/api/orders/production-assignees');
        const data = await res.json();
        setUsers(data);
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };

    loadTodos();
    loadUsers();

    const interval = setInterval(loadTodos, 30000);
    return () => clearInterval(interval);
  }, []);

  const todoCount = todos.filter((t) => t.status !== 'completed').length;

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTodo) {
        const res = await fetch(`/api/todos/${editingTodo._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (res.ok) {
          const updated = await res.json();
          setTodos(todos.map(t => t._id === editingTodo._id ? updated : t));
        }
      } else {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (res.ok) {
          const created = await res.json();
          setTodos([created, ...todos]);
        }
      }
      resetForm();
    } catch (error) {
      console.error('Failed to save todo:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir esta tarefa?')) return;
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTodos(todos.filter(t => t._id !== id));
      }
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const handleEdit = (todo) => {
    setEditingTodo(todo);
    setFormData({
      activity: todo.activity || '',
      description: todo.description || '',
      dueDate: todo.dueDate ? todo.dueDate.split('T')[0] : '',
      assignee: todo.assignee || '',
      status: todo.status || 'pending'
    });
    setShowForm(true);
  };

  const handleStatusChange = async (todo, newStatus) => {
    try {
      const res = await fetch(`/api/todos/${todo._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...todo, status: newStatus })
      });
      if (res.ok) {
        const updated = await res.json();
        setTodos(todos.map(t => t._id === todo._id ? updated : t));
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const resetForm = () => {
    setEditingTodo(null);
    setFormData({ activity: '', description: '', dueDate: '', assignee: '', status: 'pending' });
    setShowForm(false);
  };

  const getAssigneeName = (assigneeId) => {
    const u = users.find(user => user._id === assigneeId);
    return u ? u.name : '—';
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-slate-800 text-white transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-56'} ${sidebarCollapsed ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className={`border-b border-white/10 ${sidebarCollapsed ? 'p-2 lg:flex lg:justify-center' : 'p-4'}`}>
        <h2 className="font-semibold text-white px-2">Tarefas</h2>
        {sidebarCollapsed && <div className="hidden min-w-0 flex-1 lg:block" aria-hidden="true" />}
      </div>

      <nav aria-label="Tarefas" className={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'p-2 lg:px-1.5' : 'p-3'}`}>
        {!sidebarCollapsed && (
          <div className="space-y-2">
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white bg-brand-500 rounded-lg hover:bg-brand-400"
            >
              + Nova Tarefa
            </button>

            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-2 p-2 bg-slate-700/50 rounded-lg">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Atividade</label>
                  <input
                    type="text"
                    value={formData.activity}
                    onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
                    className="w-full px-2 py-1 text-sm bg-slate-600 border border-slate-500 rounded text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    required
                    placeholder="Ex: Ligação, Reunião, Entrega"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Descrição</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-2 py-1 text-sm bg-slate-600 border border-slate-500 rounded text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    rows={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Data</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-2 py-1 text-sm bg-slate-600 border border-slate-500 rounded text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Responsável</label>
                  <select
                    value={formData.assignee}
                    onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                    className="w-full px-2 py-1 text-sm bg-slate-600 border border-slate-500 rounded text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">— Selecionar —</option>
                    {users.map(u => (
                      <option key={u._id} value={u._id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-2 py-1 text-sm bg-brand-500 text-white rounded hover:bg-brand-400"
                  >
                    {editingTodo ? 'Salvar' : 'Criar'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-2 py-1 text-sm bg-slate-600 text-white rounded hover:bg-slate-500"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="text-white/60 p-2">Carregando tarefas...</p>
            ) : todoCount === 0 ? (
              <p className="text-white/60 p-2 text-center py-4">Nenhuma tarefa pendente</p>
            ) : (
              <ul className="mt-2 space-y-1 max-h-80 overflow-y-auto">
                {todos
                  .filter(t => t.status !== 'completed')
                  .map((todo) => (
                    <li key={todo._id} className="bg-slate-700/50 rounded-lg p-2">
                      <div className="flex items-start gap-2">
                        <select
                          value={todo.status}
                          onChange={(e) => handleStatusChange(todo, e.target.value)}
                          className={`px-2 py-1 text-xs rounded border ${
                            todo.status === 'completed' ? 'bg-green-500/20 text-green-300 border-green-500/50' :
                            todo.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' :
                            'bg-slate-600 text-slate-300 border-slate-500'
                          }`}
                        >
                          <option value="pending">Pendente</option>
                          <option value="in_progress">Em andamento</option>
                          <option value="completed">Concluída</option>
                        </select>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{todo.activity}</p>
                          <p className="text-xs text-slate-300 truncate">{todo.description}</p>
                          <div className="flex items-center gap-2 mt-1 text-xxs text-slate-400">
                            <span>📅 {new Date(todo.dueDate).toLocaleDateString()}</span>
                            {todo.assignee && <span>👤 {getAssigneeName(todo.assignee)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-1 mt-2">
                        <button
                          onClick={() => handleEdit(todo)}
                          className="px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-600 rounded"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(todo._id)}
                          className="px-2 py-1 text-xs text-slate-300 hover:text-red-300 hover:bg-slate-600 rounded"
                          title="Excluir"
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </nav>

      <div className={`border-t border-white/10 ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
        <button
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expandir barra lateral de tarefas' : 'Recolher barra lateral de tarefas'}
          className={`w-full flex items-center rounded-lg text-sm text-slate-700 transition hover:bg-slate-200 ${sidebarCollapsed ? 'justify-center px-2 py-2 lg:mx-auto lg:w-auto' : 'gap-2 px-3 py-2'}`}
        >
          {sidebarCollapsed ? 'Ver todas' : 'Fechar'}
        </button>
      </div>
    </aside>
  );
};

export default TodoSidebar;