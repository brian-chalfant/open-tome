import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

/**
 * Redirects unauthenticated users to /login.
 * Returns null while the initial session check is in flight to avoid flash redirects.
 */
export default function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
