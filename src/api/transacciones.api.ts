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

export type TipoCambio = "COMPRA_DIVISA" | "VENTA_DIVISA";

// Exactamente uno de los dos montos: el cliente trae divisa (se multiplica por la tasa)
// o trae pesos (se divide). El tipo impide mandar los dos a la vez.
export type MontoCambio =
  | { cantidadExtranjera: string; montoLocal?: undefined }
  | { montoLocal: string; cantidadExtranjera?: undefined };

// Exactamente una forma de tasa: la del día (recomendada) o una manual.
export type TasaCambio =
  | { cotizacionDetalleId: number; tasaManual?: undefined }
  | { tasaManual: string; cotizacionDetalleId?: undefined };

export type CalculoCambioInput = {
  tipo: TipoCambio;
  monedaExtranjeraId: number;
  monedaLocalId: number;
} & MontoCambio &
  TasaCambio;

export type RegistrarCambioInput = CalculoCambioInput & {
  cajaExtranjeraId: number;
  cajaLocalId: number;
  terceroId?: number;
  metodoPagoId?: number;
  referenciaCodigo?: string;
  bancoOrigen?: string;
};

export interface CalculoCambio {
  operacion: "MULTIPLICACION" | "DIVISION";
  tasa: string;
  cotizacionDetalleId: number | null;
  cantidadExtranjera: string;
  montoLocal: string;
}

export interface ResultadoCambio {
  transaccion: { id: number };
  calculo: CalculoCambio;
  montoLocal: string;
  requiereConfirmacion: boolean;
}

// Vista previa: no guarda nada. Los montos vuelven como string y se muestran tal cual.
export function calcularCambio(input: CalculoCambioInput) {
  return api.post<CalculoCambio>("/transacciones/cambio/calcular", input);
}

export function registrarCambioDivisa(input: RegistrarCambioInput) {
  return api.post<ResultadoCambio>("/transacciones/cambio", input);
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