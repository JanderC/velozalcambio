import { api } from "./client";

export type CodigoTaquilla = "COP" | "USD" | "EUR";

// Hay dos taquillas que trabajan igual, cada una con su caja: /taquilla (la 1) y /taquilla-2.
// La pantalla dice cuál es al montarse y todas las llamadas de este archivo van a esa.
let base = "/taquilla";
export function usarTaquilla(numero: 1 | 2) {
  base = numero === 2 ? "/taquilla-2" : "/taquilla";
}

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
  tiene_comprobante: boolean; // tiene guardada la imagen del comprobante
  // lo que mueve la caja (total) va en moneda_codigo; puede ser lo que trajo el cliente o el resultado de la cuenta
  moneda_codigo: string;
  resultado: string | null; // lo que sale de la cuenta, en moneda_resultado
  moneda_resultado: string | null;
  caja_lado: "MONTO" | "RESULTADO" | "AMBOS"; // AMBOS: efectivo por efectivo, entra un lado y sale el otro
  usuario_nombre: string;
  confirmado_por_nombre: string | null;
}

export interface Taquilla {
  // La Caja Fuerte: alimenta a la taquilla y recibe lo contado al cerrar
  cajaFuerte: { id: number; nombre: string; saldos: { codigo: CodigoTaquilla; monto: string }[] };
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
  return api.get<Taquilla>(base);
}

/** Abre la caja: con cuánto efectivo arranca en cada moneda. */
/** desdeCajaFuerte: el efectivo con que arranca sale de la Caja Fuerte. */
export function abrirCajaTaquilla(montos: MontosPorMoneda, desdeCajaFuerte: boolean) {
  return api.post<Taquilla>(`${base}/sesion/abrir`, { montos, desdeCajaFuerte });
}

/** Traer efectivo de la Caja Fuerte a la taquilla, o enviárselo. */
export function moverConCajaFuerte(monedaCodigo: CodigoTaquilla, monto: string, sentido: "TRAER" | "ENVIAR") {
  return api.post<Taquilla>(`${base}/caja-fuerte`, { monedaCodigo, monto, sentido });
}

/** Cierra y cuadra: lo que se contó en cada moneda. */
export function cerrarCajaTaquilla(contado: MontosPorMoneda) {
  return api.post<Taquilla>(`${base}/sesion/cerrar`, { contado });
}

/** monto con signo: + suma a la caja, - descuenta. */
export function moverCajaTaquilla(monedaCodigo: CodigoTaquilla, monto: string) {
  return api.post<Taquilla>(`${base}/caja`, { monedaCodigo, monto });
}

export function pagarSolicitud(id: number, medio: "EFECTIVO" | "BANCOLOMBIA" = "EFECTIVO") {
  return api.post<Taquilla>(`${base}/solicitudes/${id}/pagar`, { medio });
}

export interface NuevaOperacionTaquilla {
  tipo: "INGRESO" | "EGRESO";
  cantidad: string;
  monedaOperacion: string;
  tasa?: string;
  dividir?: boolean;
  comisionPct?: string;
  monedaResultado: string;
  cajaLado: "MONTO" | "RESULTADO" | "AMBOS";
  resultado?: string; // ya calculado, cuando no es una sola tasa (dólares por billete)
  medio?: "EFECTIVO" | "BANCOLOMBIA";
  descripcion?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteCedula?: string;
  confirmada?: boolean;
}

export function crearOperacionTaquilla(datos: NuevaOperacionTaquilla) {
  // operacionId: la que se acaba de crear, para guardarle la imagen del comprobante
  return api.post<Taquilla & { operacionId: number }>(`${base}/operaciones`, datos);
}

export function confirmarOperacionTaquilla(id: number) {
  return api.post<Taquilla>(`${base}/operaciones/${id}/confirmar`);
}

export function anularOperacionTaquilla(id: number) {
  return api.post<Taquilla>(`${base}/operaciones/${id}/anular`);
}

/** Guarda la imagen del comprobante con el ingreso o egreso ya creado. */
export function subirComprobanteOperacion(id: number, imagen: File) {
  const formData = new FormData();
  formData.append("imagen", imagen);
  return api.postForm<Taquilla>(`${base}/operaciones/${id}/comprobante`, formData);
}

/** Enlace temporal para ver la imagen del comprobante de un ingreso o egreso. */
export async function getUrlComprobanteOperacion(id: number) {
  return (await api.get<{ url: string }>(`${base}/operaciones/${id}/comprobante`)).url;
}
