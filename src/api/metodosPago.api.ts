import { api } from "./client";

export interface MetodoPago {
  id: number;
  nombre: string;
  activo: boolean;
  cuenta_id: number | null; // cuenta de la empresa por donde entra/sale (opcional)
  cuenta_nombre: string | null;
  cuenta_banco: string | null;
}

// "Pago Móvil · Mercantil" cuando está vinculado a una cuenta; si no, solo el nombre
export function etiquetaMetodoPago(m: MetodoPago) {
  return m.cuenta_nombre ? `${m.nombre} · ${m.cuenta_nombre}` : m.nombre;
}

export function getMetodosPago(incluirInactivos = false) {
  return api.get<MetodoPago[]>(`/metodos-pago${incluirInactivos ? "?incluirInactivos=true" : ""}`);
}

export function crearMetodoPago(data: { nombre: string; cuentaId?: number | null }) {
  return api.post<MetodoPago>("/metodos-pago", data);
}

export function actualizarMetodoPago(id: number, data: { nombre?: string; cuentaId?: number | null; activo?: boolean }) {
  return api.put<MetodoPago>(`/metodos-pago/${id}`, data);
}
