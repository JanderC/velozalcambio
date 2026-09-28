import { createContext, useEffect, useState, type ReactNode } from "react";
import type { Rol, Usuario } from "../types/auth.types";

interface JwtPayload {
  id: number;
  rol: Rol;
}

interface AuthContextValue {
  usuario: Usuario | null;
  token: string | null;
  cargando: boolean;
  iniciarSesion: (token: string) => void;
  cerrarSesion: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Decodifica el payload del JWT SOLO para leer id/rol en el cliente y
// pintar la interfaz -- nunca se confía en esto para autorizar nada,
// esa validación real siempre la hace el backend en cada petición.
function decodificarPayload(token: string): JwtPayload | null {
  try {
    const partes = token.split(".");
    const payloadBase64 = partes[1];
    if (!payloadBase64) return null;
    const json = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    if (typeof payload.id === "number" && typeof payload.rol === "string") {
      return { id: payload.id, rol: payload.rol as Rol };
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (stored) {
      const payload = decodificarPayload(stored);
      if (payload) {
        setToken(stored);
        setUsuario({ id: payload.id, rol: payload.rol });
      } else {
        localStorage.removeItem("token");
      }
    }
    setCargando(false);
  }, []);

  function iniciarSesion(nuevoToken: string) {
    const payload = decodificarPayload(nuevoToken);
    if (!payload) return;
    localStorage.setItem("token", nuevoToken);
    setToken(nuevoToken);
    setUsuario({ id: payload.id, rol: payload.rol });
  }

  function cerrarSesion() {
    localStorage.removeItem("token");
    setToken(null);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, token, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}