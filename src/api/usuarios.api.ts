import { api } from "./client";
import type { Rol } from "../types/auth.types";

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  created_at: string;
}

export function getUsuarios() {
  return api.get<Usuario[]>("/usuarios");
}

export function crearUsuario(data: { nombre: string; email: string; password: string; rol: Rol }) {
  return api.post<Usuario>("/usuarios", data);
}

export function actualizarUsuario(id: number, data: { rol?: Rol; activo?: boolean }) {
  return api.put<Usuario>(`/usuarios/${id}`, data);
}

export function resetearPassword(id: number, password: string) {
  return api.put(`/usuarios/${id}/password`, { password });
}