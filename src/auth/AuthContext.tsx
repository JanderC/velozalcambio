import { createContext, useEffect, useState, type ReactNode } from "react";
import { esUsuario, type Usuario } from "../types/auth.types";

const CLAVE_TOKEN = "token";
const CLAVE_USUARIO = "usuario";

interface AuthContextValue {
  usuario: Usuario | null;
  token: string | null;
  cargando: boolean;
  // Mensaje para la pantalla de login cuando la sesión guardada ya no sirve
  avisoSesion: string | null;
  iniciarSesion: (token: string, usuario: Usuario) => void;
  cerrarSesion: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// El usuario guardado se valida al leerlo: localStorage puede tener datos viejos o editados a mano.
function leerUsuarioGuardado(): Usuario | null {
  try {
    const crudo = localStorage.getItem(CLAVE_USUARIO);
    if (!crudo) return null;
    const valor: unknown = JSON.parse(crudo);
    return esUsuario(valor) ? valor : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);

  useEffect(() => {
    const tokenGuardado = localStorage.getItem(CLAVE_TOKEN);
    if (tokenGuardado) {
      const usuarioGuardado = leerUsuarioGuardado();
      if (usuarioGuardado) {
        setToken(tokenGuardado);
        setUsuario(usuarioGuardado);
      } else {
        // Sesión abierta antes de que el login devolviera el usuario: hay que entrar de nuevo.
        localStorage.removeItem(CLAVE_TOKEN);
        localStorage.removeItem(CLAVE_USUARIO);
        setAvisoSesion("Tu sesión se actualizó. Volvé a iniciar sesión, por favor.");
      }
    }
    setCargando(false);
  }, []);

  function iniciarSesion(nuevoToken: string, nuevoUsuario: Usuario) {
    localStorage.setItem(CLAVE_TOKEN, nuevoToken);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(nuevoUsuario));
    setToken(nuevoToken);
    setUsuario(nuevoUsuario);
    setAvisoSesion(null);
  }

  function cerrarSesion() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    setToken(null);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, token, cargando, avisoSesion, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}
