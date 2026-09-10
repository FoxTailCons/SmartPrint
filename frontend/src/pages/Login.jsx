import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Printer, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@smartprint.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quick = (em, pw) => { setEmail(em); setPassword(pw); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <div className="w-12 h-12 rounded-xl bg-brand-500 text-white flex items-center justify-center">
              <Printer size={26} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-brand-900">SmartPrint Lindóia</h1>
              <p className="text-xs text-slate-500">PDV · Gráfica · Grandes Formatos</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                required
              />
            </div>
            {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-slate-500 mb-2">Acesso rápido (3 usuários):</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button onClick={() => quick('admin@smartprint.com', 'admin123')} className="px-2 py-1.5 border rounded hover:bg-slate-50">Admin</button>
              <button onClick={() => quick('atendente@smartprint.com', 'atend123')} className="px-2 py-1.5 border rounded hover:bg-slate-50">Atendente</button>
              <button onClick={() => quick('producao@smartprint.com', 'prod123')} className="px-2 py-1.5 border rounded hover:bg-slate-50">Produção</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
