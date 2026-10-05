import { api } from "./client";

export type CodigoTaquilla = "COP" | "USD" | "EUR";

export interface SaldoTaquilla {
  moneda_id: number;
  codigo: CodigoTaquilla;
  decimales: number;
  monto: string; // lo que debe haber en la caja ahora
  inicial: string | null; // con cuánto abrió (null si la caja está cerrada)
  entradas: string; // lo que se sumó desde que abrió
  salidas: string; // lo que salió desde que abrió (pagos y descuentos)
}

/** Una solicitud de Confirmaciones: lo que hay que entregarle al cliente en efectivo. */
export interface SolicitudTaquilla {
  id: number;
  fecha: string;
  descripcion: string | null;
  monto: string;
  cantidad_base: string | null;
  tasa: string | null;
  comision_descontada: boolean;
  cuenta_destino: string | null;
  // EN_PROCESO: Western todavía no la confirmó y no se puede pagar
  estado_confirmacion: "EN_PROCESO" | "CONFIRMADA" | null;
  tiene_comprobante: boolean;
  pagado_en: string | null;
  pagado_medio: "EFECTIVO" | "BANCOLOMBIA" | null; // por Bancolombia no descuenta de la caja
  pagado_por_nombre: string | null;
  registrado_por_nombre: string;
  cuenta_id: number;
  cliente_referencia: string | null;
  moneda_codigo: string;
  canal_nombre: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_cedula: string | null;
}

export interface CierreTaquilla {
  cerrada_en: string;
  abierta_en: string;
  por: string;
  monedas: { codigo: CodigoTaquilla; saldo_inicial: string; saldo_esperado: string; saldo_real: string; diferencia: string }[];
}

/** Un ingreso o egreso de ventanilla: total = cantidad x tasa, menos la comisión. */
export interface OperacionTaquilla {
  id: number;
  tipo: "INGRESO" | "EGRESO";
  cantidad: string;
  tasa: string | null;
  comision_pct: string | null;
  divide: boolean; // cantidad ÷ tasa en vez de ×
  moneda_operacion: string | null; // qué se compró o vendió
  medio: "EFECTIVO" | "BANCOLOMBIA"; // por Bancolombia no mueve la caja
  total: string;
  descripcion: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_cedula: string | null;
  estado: "PENDIENTE" | "CONFIRMADA" | "ANULADA";
  created_at: string;
  confirmado_en: string | null;
  moneda_codigo: CodigoTaquilla;
  usuario_nombre: string;
  confirmado_por_nombre: string | null;
}

export interface Taquilla {
  // Ingresos y egresos de ventanilla de esta caja (o de hoy), más los que sigan pendientes
  operaciones: OperacionTaquilla[];
  // Pagos hechos por Bancolombia (de esta caja abierta, o de hoy si está cerrada): no tocan la caja
  pagosBancolombia: { cantidad: number; totales: { codigo: string; total: string }[] };
  caja: { id: number; nombre: string; saldos: SaldoTaquilla[] };
  sesion: { abierta: boolean; abierta_en: string | null; abierta_por: string | null };
  ultimoCierre: CierreTaquilla | null;
  pendientes: SolicitudTaquilla[];
  pagadasHoy: SolicitudTaquilla[];
}

export type MontosPorMoneda = Partial<Record<CodigoTaquilla, string>>;

export function getTaquilla() {
  return api.get<Taquilla>("/taquilla");
}

/** Abre la caja: con cuánto efectivo arranca en cada moneda. */
export function abrirCajaTaquilla(montos: MontosPorMoneda) {
  return api.post<Taquilla>("/taquilla/sesion/abrir", { montos });
}

/** Cierra y cuadra: lo que se contó en cada moneda. */
export function cerrarCajaTaquilla(contado: MontosPorMoneda) {
  return api.post<Taquilla>("/taquilla/sesion/cerrar", { contado });
}

/** monto con signo: + suma a la caja, - descuenta. */
export function moverCajaTaquilla(monedaCodigo: CodigoTaquilla, monto: string) {
  return api.post<Taquilla>("/taquilla/caja", { monedaCodigo, monto });
}

export function pagarSolicitud(id: number, medio: "EFECTIVO" | "BANCOLOMBIA" = "EFECTIVO") {
  return api.post<Taquilla>(`/taquilla/solicitudes/${id}/pagar`, { medio });
}

export interface NuevaOperacionTaquilla {
  tipo: "INGRESO" | "EGRESO";
  monedaCodigo: CodigoTaquilla;
  cantidad: string;
  monedaOperacion?: string;
  tasa?: string;
  dividir?: boolean;
  comisionPct?: string;
  medio?: "EFECTIVO" | "BANCOLOMBIA";
  descripcion?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteCedula?: string;
  confirmada?: boolean;
}

export function crearOperacionTaquilla(datos: NuevaOperacionTaquilla) {
  return api.post<Taquilla>("/taquilla/operaciones", datos);
}

export function confirmarOperacionTaquilla(id: number) {
  return api.post<Taquilla>(`/taquilla/operaciones/${id}/confirmar`);
}

export function anularOperacionTaquilla(id: number) {
  return api.post<Taquilla>(`/taquilla/operaciones/${id}/anular`);
}
