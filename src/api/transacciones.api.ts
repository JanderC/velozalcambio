import { api } from "./client";

interface RegistrarTransaccionInput {
  tipo: "COMPRA_DIVISA" | "VENTA_DIVISA" | "DEPOSITO" | "RETIRO";
  cajaId: number;
  terceroId?: number;
  monedaOrigenId: number;
  montoOrigen: string;
  referenciaCodigo?: string;
}

export interface Solicitud {
  id: number;
  tipo: string;
  monto_origen: string;
  moneda_codigo: string;
  caja_id: number;
  caja_nombre: string;
  tercero_nombre: string | null;
  creado_por_nombre: string;
  referencia_codigo: string | null;
  created_at: string;
}

export interface Transaccion {
  id: number;
  tipo: string;
  estado: string;
  monto_origen: string;
  moneda_codigo: string;
  caja_nombre: string;
  tercero_nombre: string | null;
  creado_por_nombre: string;
  referencia_codigo: string | null;
  created_at: string;
}

interface FiltrosTransacciones {
  desde?: string;
  hasta?: string;
  monedaId?: number;
  cajaId?: number;
  estado?: string;
  tipo?: string;
}

interface RegistrarCambioInput {
  tipo: "COMPRA_DIVISA" | "VENTA_DIVISA";
  terceroId?: number;
  monedaExtranjeraId: number;
  cantidadExtranjera: string;
  cotizacionDetalleId?: number;
  tasaManual?: string;
  cajaExtranjeraId: number;
  monedaLocalId: number;
  cajaLocalId: number;
  metodoPagoId?: number;
  referenciaCodigo?: string;
}

export function registrarCambioDivisa(input: RegistrarCambioInput) {
  return api.post<{ requiereConfirmacion: boolean; montoLocal: string }>("/transacciones/cambio", input);
}
export function getTransacciones(filtros: FiltrosTransacciones) {
  const params = new URLSearchParams();
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.monedaId) params.set("monedaId", String(filtros.monedaId));
  if (filtros.cajaId) params.set("cajaId", String(filtros.cajaId));
  if (filtros.estado) params.set("estado", filtros.estado);
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  const query = params.toString();
  return api.get<Transaccion[]>(`/transacciones${query ? `?${query}` : ""}`);
}

export function registrarTransaccion(input: RegistrarTransaccionInput) {
  return api.post<{ requiereConfirmacion: boolean; transaccion: { id: number } }>("/transacciones", input);
}

export function getSolicitudesPendientes(cajaId?: number) {
  const query = cajaId ? `?cajaId=${cajaId}` : "";
  return api.get<Solicitud[]>(`/transacciones/solicitudes${query}`);
}

export function confirmarSolicitud(id: number) {
  return api.post(`/transacciones/${id}/confirmar`);
}

export function rechazarSolicitud(id: number, motivo?: string) {
  return api.post(`/transacciones/${id}/rechazar`, { motivo });
}

export function getSolicitudesPorCliente(terceroId: number) {
  return api.get<Solicitud[]>(`/transacciones/solicitudes?terceroId=${terceroId}`);
}