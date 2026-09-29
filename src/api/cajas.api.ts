import { api } from "./client";

export type TipoCaja = "FISICA" | "FUERTE" | "BANCO";

export type TipoCuentaBancaria = "AHORRO" | "CORRIENTE" | "BILLETERA";

export interface Caja {
  id: number;
  nombre: string;
  tipo: TipoCaja;
  activo: boolean;
  es_principal: boolean;
  descripcion: string | null;
  // Datos bancarios: solo se usan en las cuentas de la empresa (tipo BANCO)
  banco: string | null;
  numero_cuenta: string | null;
  tipo_cuenta: TipoCuentaBancaria | null;
  titular: string | null;
  identificacion_titular: string | null;
  telefono: string | null;
  email: string | null;
  pais: string | null;
  moneda_id: number | null;
}

// Como lo recibe el backend: undefined = no tocar, null = borrar
export interface DatosCuenta {
  banco?: string | null;
  numeroCuenta?: string | null;
  tipoCuenta?: TipoCuentaBancaria | null;
  titular?: string | null;
  identificacionTitular?: string | null;
  telefono?: string | null;
  email?: string | null;
  pais?: string | null;
  monedaId?: number | null;
}

export interface SaldoCaja {
  moneda_id: number;
  moneda_codigo: string;
  monto: string;
}

export interface TurnoAbierto {
  cierre_id: number;
  moneda_id: number;
  moneda_codigo: string;
}

export interface CajaTablero extends Caja {
  saldos: SaldoCaja[];
  turnos_abiertos: TurnoAbierto[];
  moneda_codigo: string | null;
  metodos_pago: { id: number; nombre: string }[];
}

export interface MovimientoInterno {
  id: number;
  tipo: "FONDEO" | "TRANSFERENCIA_INTERNA";
  caja_id: number;
  caja_nombre: string;
  caja_destino_id: number | null;
  caja_destino_nombre: string | null;
  moneda_id: number;
  moneda_codigo: string;
  monto: string;
  observacion: string | null;
  created_at: string;
  usuario_nombre: string;
}

export function getCajas() {
  return api.get<Caja[]>("/cajas");
}

export function getTableroCajas(incluirInactivas = false) {
  return api.get<CajaTablero[]>(`/cajas/tablero${incluirInactivas ? "?incluirInactivas=true" : ""}`);
}

export function crearCaja(data: { nombre: string; tipo: TipoCaja; descripcion?: string; esPrincipal?: boolean } & DatosCuenta) {
  return api.post<Caja>("/cajas", data);
}

export function actualizarCaja(
  id: number,
  data: { nombre?: string; tipo?: TipoCaja; descripcion?: string | null; activo?: boolean } & DatosCuenta
) {
  return api.put<Caja>(`/cajas/${id}`, data);
}

export function marcarCajaPrincipal(id: number) {
  return api.post<Caja>(`/cajas/${id}/principal`);
}

export function fondearCaja(data: { cajaId?: number; monedaId: number; monto: string; observacion?: string; abrirTurno: boolean }) {
  return api.post<{ saldoNuevo: string }>("/cajas/fondeo", data);
}

export function transferirEntreCajas(data: {
  cajaOrigenId: number;
  cajaDestinoId: number;
  monedaId: number;
  monto: string;
  observacion?: string;
  abrirTurnoDestino: boolean;
}) {
  return api.post<{ saldoOrigen: string; saldoDestino: string }>("/cajas/transferencias", data);
}

export interface MonedaEstadoCaja {
  monedaId: number;
  monedaCodigo: string;
  decimales: number;
  saldoActual: string;
  turnoAbierto: boolean;
  turnoAbiertoDesde: string | null;
  periodo: {
    movimientos: number;
    saldoInicial: string;
    ingresos: string;
    egresos: string;
    saldoFinal: string;
    cuadra: boolean;
  };
}

export interface MovimientoDeCaja {
  id: number;
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  saldo_anterior: string;
  saldo_nuevo: string;
  created_at: string;
  moneda_id: number;
  moneda_codigo: string;
  usuario_nombre: string;
  metodo_pago_nombre: string | null;
  transaccion_id: number | null;
  transaccion_tipo: string | null;
  observacion: string | null;
  tercero_nombre: string | null;
  referencia_codigo: string | null;
  contraparte_nombre: string | null;
}

export interface EstadoCaja {
  caja: Caja & { moneda_codigo: string | null };
  monedas: MonedaEstadoCaja[];
  movimientos: MovimientoDeCaja[];
  hayMas: boolean;
}

export function getEstadoCaja(
  cajaId: number,
  filtros: { monedaId?: number; desde?: string; hasta?: string; tipo?: "INGRESO" | "EGRESO"; limite?: number } = {}
) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) if (valor !== undefined && valor !== "") params.set(clave, String(valor));
  const q = params.toString();
  return api.get<EstadoCaja>(`/cajas/${cajaId}/estado${q ? `?${q}` : ""}`);
}

export function getMovimientosInternos(cajaId?: number) {
  return api.get<MovimientoInterno[]>(`/cajas/movimientos-internos${cajaId ? `?cajaId=${cajaId}` : ""}`);
}
