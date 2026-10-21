import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { name: '', username: '', email: '', password: '', role: 'atendente' };

export const buildUserUpdatePayload = ({ name, username, email, password, role }) => ({
  name: name.trim(),
  username: username.trim().toLowerCase(),
  email: email.trim().toLowerCase(),
  role,
  ...(password ? { password } : {}),
});

export const buildAdminIdentityPayload = ({ username, email }) => ({
  username: username.trim().toLowerCase(),
  email: email.trim().toLowerCase(),
});

export default function Users() {
  const currentUser = useAuth()?.user;
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

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

  const startEditing = (user) => {
    setEditingId(user._id);
    setEditForm({ name: user.name, username: user.username || '', email: user.email, password: '', role: user.role });
    setError('');
  };

  const updateUser = async (event, user) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/api/auth/users/${user._id}`, {
        method: 'PATCH',
        body: user.role === 'admin'
          ? buildAdminIdentityPayload(editForm)
          : buildUserUpdatePayload(editForm),
      });
      setEditingId(null);
      setEditForm(emptyForm);
      await loadUsers();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user) => {
    if (!confirm(`Excluir ${user.name}? O acesso será desativado e o histórico será preservado.`)) return;
    setError('');
    try {
      await api(`/api/auth/users/${user._id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const userFields = (value, setValue, editing = false) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">
        Nome
        <input required maxLength="120" value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Nome de usuário
        <input required minLength="3" maxLength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" autoComplete="username" value={value.username} onChange={(event) => setValue({ ...value, username: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        E-mail
        <input required type="email" autoComplete="email" value={value.email} onChange={(event) => setValue({ ...value, email: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        {editing ? 'Nova senha (opcional, exatamente 6 caracteres)' : 'Senha inicial (exatamente 6 caracteres)'}
        <input required={!editing} type="password" minLength="6" maxLength="6" autoComplete="new-password" value={value.password} onChange={(event) => setValue({ ...value, password: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Perfil
        <select value={value.role} onChange={(event) => setValue({ ...value, role: event.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
          <option value="atendente">Atendente</option>
          <option value="producao">Produção</option>
        </select>
      </label>
    </div>
  );
  const adminIdentityFields = (value, setValue) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">
        Nome de usuário
        <input required minLength="3" maxLength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" autoComplete="username" value={value.username} onChange={(event) => setValue({ ...value, username: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        E-mail
        <input required type="email" autoComplete="email" value={value.email} onChange={(event) => setValue({ ...value, email: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
        <p className="text-sm text-slate-500">Cadastre e gerencie os acessos de atendentes e produção.</p>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={createUser} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Novo usuário</h2>
        {userFields(form, setForm)}
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
                {editingId === user._id ? (
                  <form onSubmit={(event) => updateUser(event, user)} className="w-full space-y-4">
                    <h3 className="font-medium text-slate-800">Editar {user.name}</h3>
                    {user.role === 'admin' ? adminIdentityFields(editForm, setEditForm) : userFields(editForm, setEditForm, true)}
                    <div className="flex gap-2">
                      <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                        {saving ? 'Salvando...' : 'Salvar alterações'}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <div className="font-medium text-slate-800">{user.name}</div>
                      <div className="text-sm text-slate-500">{user.username || 'Usuário não definido'} · {user.email} · {user.role === 'producao' ? 'Produção' : user.role === 'admin' ? 'Administrador' : 'Atendente'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold ${user.active ? 'text-emerald-700' : 'text-slate-500'}`}>{user.active ? 'Ativo' : 'Inativo'}</span>
                      <button type="button" onClick={() => toggleActive(user)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">
                        {user.active ? 'Desativar' : 'Ativar'}
                      </button>
                      {user.role !== 'admin' && <>
                        <button type="button" aria-label={`Editar ${user.name}`} onClick={() => startEditing(user)} className="rounded-lg border p-2 hover:bg-slate-50">
                          <Pencil size={16} />
                        </button>
                        <button type="button" aria-label={`Excluir ${user.name}`} onClick={() => deleteUser(user)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50">
                          <Trash2 size={16} />
                        </button>
                      </>}
                      {user.role === 'admin' && String(currentUser?.id || currentUser?._id) === String(user._id) && (
                        <button type="button" aria-label="Editar meu nome de usuário e e-mail" onClick={() => startEditing(user)} className="rounded-lg border p-2 hover:bg-slate-50">
                          <Pencil size={16} />
                        </button>
                      )}
                    </div>
                  </>
                )}
                </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
