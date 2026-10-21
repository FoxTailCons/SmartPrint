import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('sp_token');
    if (t) {
      api('/api/auth/me')
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('sp_token');
        })
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  const login = async (email, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('sp_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    return api('/api/auth/logout', { method: 'POST' }).then(() => {
      localStorage.clear();
      setUser(null);
      window.location.reload();
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
