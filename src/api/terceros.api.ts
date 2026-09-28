import { api } from "./client";

export interface Tercero {
  id: number;
  nombre: string;
  identificacion: string | null;
  telefono: string | null;
  tipo: "CLIENTE" | "PROVEEDOR" | "MIXTO";
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
  cuentasPorCobrar: unknown[];
  cuentasPorPagar: unknown[];
}

export const TIPOS_DOCUMENTO = ["Cédula", "NIT", "Pasaporte", "Cédula de Extranjería"] as const;

export function buscarTerceros(query: string) {
  return api.get<Tercero[]>(`/terceros?buscar=${encodeURIComponent(query)}`);
}

export function crearTercero(data: { nombre: string; identificacion?: string; telefono?: string; tipo: string }) {
  return api.post<Tercero>("/terceros", data);
}

export function obtenerResumenTercero(id: number) {
  return api.get<ResumenTercero>(`/terceros/${id}/resumen`);
}