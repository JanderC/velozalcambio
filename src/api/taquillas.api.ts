import { api } from "./client";

/** Una taquilla: su número (la ruta es /taquilla, /taquilla-2…), su nombre y si está habilitada. */
export interface TaquillaConfig {
  numero: number;
  nombre: string;
  activo: boolean;
  caja_id: number;
  abierta: boolean; // tiene la caja abierta ahora
  saldos: { codigo: string; monto: string }[]; // el efectivo que tiene (solo lo que no está en cero)
}

/** La ruta de una taquilla: la 1 es /taquilla y las demás /taquilla-N. */
export const rutaDeTaquilla = (numero: number) => (numero === 1 ? "/taquilla" : `/taquilla-${numero}`);

export function getTaquillas() {
  return api.get<TaquillaConfig[]>("/taquillas");
}
export function crearTaquilla(nombre?: string) {
  return api.post<TaquillaConfig[]>("/taquillas", { nombre: nombre?.trim() || undefined });
}
export function editarTaquilla(numero: number, cambios: { nombre?: string; activo?: boolean }) {
  return api.patch<TaquillaConfig[]>(`/taquillas/${numero}`, cambios);
}
