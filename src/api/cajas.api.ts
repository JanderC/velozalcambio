import { api } from "./client";

export type TipoCaja = "FISICA" | "FUERTE" | "BANCO";

export interface Caja {
  id: number;
  nombre: string;
  tipo: TipoCaja;
  activo: boolean;
  es_principal: boolean;
  descripcion: string | null;
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

export function crearCaja(data: { nombre: string; tipo: TipoCaja; descripcion?: string; esPrincipal?: boolean }) {
  return api.post<Caja>("/cajas", data);
}

export function actualizarCaja(
  id: number,
  data: { nombre?: string; tipo?: TipoCaja; descripcion?: string | null; activo?: boolean }
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

export function getMovimientosInternos(cajaId?: number) {
  return api.get<MovimientoInterno[]>(`/cajas/movimientos-internos${cajaId ? `?cajaId=${cajaId}` : ""}`);
}
