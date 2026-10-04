import { api } from "./client";
import type { CuentaPorCobrar } from "./cuentasPorCobrar.api";
import type { CuentaPorPagar } from "./cuentasPorPagar.api";

export interface Tercero {
  id: number;
  nombre: string;
  identificacion: string | null;
  telefono: string | null;
  tipo: "CLIENTE" | "PROVEEDOR" | "MIXTO" | "AMIGO";
  created_at: string;
}

export interface CuentaCorriente {
  id: number;
  canal_nombre: string;
  moneda_codigo: string;
  saldo_actual: string;
  estado: "DISPONIBLE" | "BLOQUEADA" | "CERRADA";
}

export interface ResumenTercero {
  tercero: Tercero;
  cuentas: {
    disponibles: CuentaCorriente[];
    bloqueadas: CuentaCorriente[];
    cerradas: CuentaCorriente[];
  };
  // Solo las que no están PAGADAS; el resumen no trae tercero_nombre (es el mismo cliente)
  cuentasPorCobrar: Omit<CuentaPorCobrar, "tercero_nombre">[];
  cuentasPorPagar: Omit<CuentaPorPagar, "tercero_nombre">[];
}

export const TIPOS_DOCUMENTO = ["Cédula", "NIT", "Pasaporte", "Cédula de Extranjería"] as const;

export function buscarTerceros(query: string) {
  return api.get<Tercero[]>(`/terceros?buscar=${encodeURIComponent(query)}`);
}

export function crearTercero(data: { nombre: string; identificacion?: string; telefono?: string; tipo: string }) {
  return api.post<Tercero>("/terceros", data);
}

export type TipoTercero = Tercero["tipo"];

export function obtenerTercero(id: number) {
  return api.get<Tercero>(`/terceros/${id}`);
}

// El backend solo reemplaza lo que se manda; un campo vacío no borra el valor guardado.
export function actualizarTercero(id: number, data: { nombre?: string; identificacion?: string; telefono?: string; tipo?: TipoTercero }) {
  return api.put<Tercero>(`/terceros/${id}`, data);
}

export function obtenerResumenTercero(id: number) {
  return api.get<ResumenTercero>(`/terceros/${id}/resumen`);
}