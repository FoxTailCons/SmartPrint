import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const TodoSidebar = () => {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

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

    loadTodos();

    const interval = setInterval(loadTodos, 30000);
    return () => clearInterval(interval);
  }, []);

  const todoCount = todos.filter((t) => t.status !== 'completed').length;

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-slate-800 text-white transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-56'} ${sidebarCollapsed ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className={`border-b border-white/10 ${sidebarCollapsed ? 'p-2 lg:flex lg:justify-center' : 'p-4'}`}>
        <h2 className="font-semibold text-white px-2">Tarefas</h2>
        {sidebarCollapsed && <div className="hidden min-w-0 flex-1 lg:block" aria-hidden="true" />}
      </div>
      <nav aria-label="Tarefas" className={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'p-2 lg:px-1.5' : 'p-3'}`}>
        <div className="space-y-2">
          {loading ? (
            <p className="text-white/60 p-2">Carregando tarefas...</p>
          ) : todoCount === 0 ? (
            <p className="text-white/60 p-2">Nenhuma tarefa</p>
          ) : (
            <div className="text-sm text-white/70">
              {todos.length} tarefa(s) pendente(s)
            </div>
          )}
          {todos.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-80 overflow-y-auto">
              {todos.map((todo) => (
                <li key={todo._id} className="flex items-center px-2 py-1 text-sm hover:bg-white/10">
                  <span className={todo.status === 'completed' ? 'line-through text-slate-500' : 'text-white/70'}>
                    {todo.activity}: {todo.description}
                  </span>
                  <span className={`ml-auto text-xxs ${todo.status === 'completed' ? 'text-slate-500' : 'text-slate-400'}`}>
                    {new Date(todo.dueDate).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
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