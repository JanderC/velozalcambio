import { api } from "./client";

export interface CapitalMoneda {
  moneda_id: number;
  codigo: string;
  nombre: string;
  total_cajas: string;
  total_por_cobrar: string;
  total_por_pagar: string;
  capital_neto: string;
}

export interface MovimientoCajaReporte {
  id: number;
  caja_nombre: string;
  moneda_codigo: string;
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  saldo_anterior: string;
  saldo_nuevo: string;
  created_at: string;
}

export interface MovimientoCCReporte {
  id: number;
  tercero_nombre: string;
  canal_nombre: string;
  moneda_codigo: string;
  tipo: string;
  monto: string;
  saldo_nuevo: string;
  fecha: string;
}

export interface CuadreCaja {
  id: number;
  caja_nombre: string;
  moneda_codigo: string;
  usuario_nombre: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  saldo_inicial: string;
  saldo_esperado: string | null;
  saldo_real: string | null;
  diferencia: string | null;
  estado: string;
}

export interface CuentaEstado {
  id: number;
  canal_nombre: string;
  moneda_codigo: string;
  saldo_actual: string;
  movimientos: MovimientoCCReporte[];
}

export function getCapitalConsolidado() {
  return api.get<CapitalMoneda[]>("/reportes/capital-consolidado");
}

export function getMovimientosCajaReporte(filtros: { desde?: string; hasta?: string; cajaId?: number; monedaId?: number }) {
  const p = new URLSearchParams();
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.cajaId) p.set("cajaId", String(filtros.cajaId));
  if (filtros.monedaId) p.set("monedaId", String(filtros.monedaId));
  const q = p.toString();
  return api.get<MovimientoCajaReporte[]>(`/reportes/movimientos-caja${q ? `?${q}` : ""}`);
}

export function getMovimientosCCReporte(filtros: { desde?: string; hasta?: string; terceroId?: number; canalId?: number }) {
  const p = new URLSearchParams();
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.terceroId) p.set("terceroId", String(filtros.terceroId));
  if (filtros.canalId) p.set("canalId", String(filtros.canalId));
  const q = p.toString();
  return api.get<MovimientoCCReporte[]>(`/reportes/movimientos-cuenta-corriente${q ? `?${q}` : ""}`);
}

export function getEstadoCuentaTercero(terceroId: number) {
  return api.get<CuentaEstado[]>(`/reportes/estado-cuenta/${terceroId}`);
}

export function getCuadresCaja(filtros: { cajaId?: number; estado?: string }) {
  const p = new URLSearchParams();
  if (filtros.cajaId) p.set("cajaId", String(filtros.cajaId));
  if (filtros.estado) p.set("estado", filtros.estado);
  const q = p.toString();
  return api.get<CuadreCaja[]>(`/reportes/cuadres-caja${q ? `?${q}` : ""}`);
}
// ---------- Rendimiento del día por empleado ----------
export interface TotalMoneda {
  codigo: string;
  cantidad: number;
  total: string;
}
export interface RendimientoEmpleado {
  usuarioId: number;
  nombre: string;
  rol: string;
  confirmaciones: { cantidad: number; clientes: number; porMoneda: TotalMoneda[] };
  pagadas: { cantidad: number; porMoneda: TotalMoneda[] };
  ventanilla: { cantidad: number; ingresos: TotalMoneda[]; egresos: TotalMoneda[] };
  clientesTaquilla: number;
  cuentasCorrientes: number;
  cuentasPorCobrar: number;
}
export interface Rendimiento {
  dia: string;
  empleados: RendimientoEmpleado[];
}

/** El administrador recibe a todo el equipo; los demás, solo lo suyo. */
export function getRendimiento(dia: string) {
  return api.get<Rendimiento>(`/reportes/rendimiento?dia=${dia}`);
}

// ---------- Clientes que más vienen (Confirmaciones) ----------
export interface ClienteFrecuente {
  tercero_id: number;
  nombre: string;
  telefono: string | null;
  confirmaciones: number;
  dias: number;
  retiradas: number;
  primera: string;
  ultima: string;
  totales: { codigo: string; total: string }[] | null;
  cuenta_id: number | null;
}
export function getClientesFrecuentes(desde: string, hasta: string) {
  return api.get<ClienteFrecuente[]>(`/reportes/clientes-frecuentes?desde=${desde}&hasta=${hasta}`);
}
