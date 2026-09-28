export type Rol = "ADMIN" | "ASESOR" | "CAJERO" | "OPERADOR";

export interface Usuario {
  id: number;
  rol: Rol;
}