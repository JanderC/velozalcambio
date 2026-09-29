import { api, ApiError } from "./client";
import { esUsuario } from "../types/auth.types";

// El usuario se valida acá: si el backend todavía no lo devuelve, no se guarda una sesión a medias.
export async function login(email: string, password: string) {
  const res = await api.post<{ token: string; usuario?: unknown }>("/auth/login", { email, password });
  if (!esUsuario(res.usuario)) {
    throw new ApiError(500, "El servidor no devolvió los datos del usuario. Avisale al administrador.");
  }
  return { token: res.token, usuario: res.usuario };
}