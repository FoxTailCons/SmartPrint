import { useEffect, useState } from 'react';
import { api } from '../api';

const emptyForm = { name: '', email: '', password: '', role: 'atendente' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadUsers = () => api('/api/auth/users')
    .then(setUsers)
    .catch((loadError) => setError(loadError.message))
    .finally(() => setLoading(false));

  useEffect(() => { loadUsers(); }, []);

  const createUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/auth/users', { method: 'POST', body: form });
      setForm(emptyForm);
      await loadUsers();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    setError('');
    try {
      await api(`/api/auth/users/${user._id}/active`, { method: 'PATCH', body: { active: !user.active } });
      await loadUsers();
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
        <p className="text-sm text-slate-500">Cadastre e gerencie os acessos de atendentes e produção.</p>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={createUser} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Novo usuário</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Nome
            <input required maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            E-mail
            <input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Senha inicial (mínimo 12 caracteres)
            <input required type="password" minLength="12" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Perfil
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="atendente">Atendente</option>
              <option value="producao">Produção</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Cadastrar usuário'}
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-5 py-4 font-semibold text-slate-800">Acessos cadastrados</h2>
        {loading ? <p className="p-5 text-sm text-slate-500">Carregando usuários...</p> : users.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="divide-y">
            {users.map((user) => (
              <div key={user._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="font-medium text-slate-800">{user.name}</div>
                  <div className="text-sm text-slate-500">{user.email} · {user.role === 'producao' ? 'Produção' : user.role === 'admin' ? 'Administrador' : 'Atendente'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${user.active ? 'text-emerald-700' : 'text-slate-500'}`}>{user.active ? 'Ativo' : 'Inativo'}</span>
                  <button type="button" onClick={() => toggleActive(user)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">
                    {user.active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
