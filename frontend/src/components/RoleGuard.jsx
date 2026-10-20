import { canAccess } from '../roleAccess.js';

export default function RoleGuard({ role, permission, children }) {
  if (!canAccess(role, permission)) {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        Seu perfil não tem permissão para acessar esta tela.
      </div>
    );
  }
  return children;
}
