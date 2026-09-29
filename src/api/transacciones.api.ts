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
  tercero_id: number | null;
  tercero_nombre: string | null;
  creado_por_nombre: string;
  referencia_codigo: string | null;
  created_at: string;
  usuario_id: number;
  // Contexto extra para la bandeja
  caja_tipo?: "FISICA" | "FUERTE" | "BANCO";
  caja_destino_id?: number | null;
  caja_destino_nombre?: string | null;
  caja_destino_tipo?: "FISICA" | "FUERTE" | "BANCO" | null;
  monto_destino?: string | null;
  moneda_destino_codigo?: string | null;
  tasa_aplicada?: string | null;
  tercero_identificacion?: string | null;
  metodo_pago_nombre?: string | null;
  referencia_banco_origen?: string | null;
  documentos?: number;
}

export interface CajaDePata {
  id: number;
  nombre: string;
  tipo: "FISICA" | "FUERTE" | "BANCO";
  banco: string | null;
  numeroCuenta: string | null;
  tipoCuenta: string | null;
  titular: string | null;
  identificacionTitular: string | null;
  telefono: string | null;
  email: string | null;
}

// Un movimiento que aplicaría confirmar: qué entra o sale, dónde, y cómo queda esa caja
export interface PataSolicitud {
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  monedaId: number;
  monedaCodigo: string;
  decimales: number;
  caja: CajaDePata;
  saldoActual: string;
  saldoDespues: string;
  turnoAbierto: boolean;
  saldoSuficiente: boolean;
}

export interface DocumentoSolicitud {
  id: number;
  tipo: string;
  descripcion: string | null;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  estado: string;
  created_at: string;
  subido_por_nombre: string;
}

export interface DetalleSolicitud {
  transaccion: Solicitud & {
    estado: string;
    operacion_calculo: "MULTIPLICACION" | "DIVISION" | null;
    metodo_pago_cuenta_nombre: string | null;
    referencia_estado: string | null;
  };
  patas: PataSolicitud[];
  cliente: {
    id: number;
    nombre: string;
    identificacion: string | null;
    telefono: string | null;
    clienteDesde: string;
    operacionesConfirmadas: number;
    operacionesRechazadas: number;
    otrasPendientes: number;
    verificacion: { estado: "VERIFICADO" | "PENDIENTE_REVISION" | "NO_VERIFICADO" | "SIN_DOCUMENTOS" };
  } | null;
  cuentaCliente: {
    id: number;
    tipo: string;
    banco: string | null;
    numero_cuenta: string | null;
    tipo_cuenta: string | null;
    titular: string;
    identificacion_titular: string | null;
    telefono: string | null;
    email: string | null;
    alias: string | null;
    moneda_codigo: string | null;
  } | null;
  documentos: DocumentoSolicitud[];
  alertas: { nivel: "bloqueante" | "advertencia" | "info"; mensaje: string }[];
}

export interface VerificacionConfirmacion {
  montoVerificado?: string;
  checklist?: string[];
  nota?: string;
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
  // Cuenta del cliente a donde se le paga (exige terceroId; debe ser suya y estar activa)
  cuentaTerceroId?: number;
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

export function confirmarSolicitud(id: number, verificacion?: VerificacionConfirmacion) {
  return api.post(`/transacciones/${id}/confirmar`, verificacion);
}

export function getDetalleSolicitud(id: number) {
  return api.get<DetalleSolicitud>(`/transacciones/${id}/detalle`);
}

export function rechazarSolicitud(id: number, motivo?: string) {
  return api.post(`/transacciones/${id}/rechazar`, { motivo });
}

export function getSolicitudesPorCliente(terceroId: number) {
  return api.get<Solicitud[]>(`/transacciones/solicitudes?terceroId=${terceroId}`);
}