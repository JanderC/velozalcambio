import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const { usuario, cargando } = useAuth();

  if (cargando) return null; // evita un parpadeo a /login mientras se lee localStorage
  if (!usuario) return <Navigate to="/login" replace />;

  return <Outlet />;
}