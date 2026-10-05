import { api } from "./client";

export interface SaldoTaquilla {
  moneda_id: number;
  codigo: "COP" | "USD" | "EUR";
  decimales: number;
  monto: string;
}

/** Una solicitud confirmada en Confirmaciones: lo que hay que entregarle al cliente. */
export interface SolicitudTaquilla {
  id: number;
  fecha: string;
  descripcion: string | null;
  monto: string;
  cantidad_base: string | null;
  tasa: string | null;
  comision_descontada: boolean;
  pagado_en: string | null;
  pagado_por_nombre: string | null;
  cuenta_id: number;
  moneda_codigo: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_cedula: string | null;
}

export interface Taquilla {
  caja: { id: number; nombre: string; saldos: SaldoTaquilla[] };
  pendientes: SolicitudTaquilla[];
  pagadasHoy: SolicitudTaquilla[];
}

export function getTaquilla() {
  return api.get<Taquilla>("/taquilla");
}

/** monto con signo: + suma a la caja, - descuenta. */
export function moverCajaTaquilla(monedaCodigo: SaldoTaquilla["codigo"], monto: string) {
  return api.post<Taquilla>("/taquilla/caja", { monedaCodigo, monto });
}

export function pagarSolicitud(id: number) {
  return api.post<Taquilla>(`/taquilla/solicitudes/${id}/pagar`);
}
