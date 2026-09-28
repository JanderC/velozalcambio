import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";
import type { Rol } from "../types/auth.types";

interface Props {
  roles: Rol[];
}

export function RequireRole({ roles }: Props) {
  const { usuario } = useAuth();

  if (!usuario || !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}