export type Rol = "ADMIN" | "ASESOR" | "CAJERO" | "OPERADOR";

export const ROLES: Rol[] = ["ADMIN", "ASESOR", "CAJERO", "OPERADOR"];

// Tal como lo devuelve POST /auth/login y se guarda junto al token.
export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

// Solo sirve para pintar la interfaz; la autorización real la hace el backend en cada petición.
export function esUsuario(valor: unknown): valor is Usuario {
  if (typeof valor !== "object" || valor === null) return false;
  if (!("id" in valor) || !("nombre" in valor) || !("email" in valor) || !("rol" in valor)) return false;
  return (
    typeof valor.id === "number" &&
    typeof valor.nombre === "string" &&
    typeof valor.email === "string" &&
    ROLES.some((r) => r === valor.rol)
  );
}