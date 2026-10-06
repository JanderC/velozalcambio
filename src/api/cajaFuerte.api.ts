import { api } from "./client";

export type MonedaCajaFuerte = "USD" | "COP" | "EUR";

export interface SaldoCajaFuerte {
  codigo: MonedaCajaFuerte;
  decimales: number;
  monto: string;
  entroHoy: string;
  salioHoy: string;
}

export interface MovimientoCajaFuerte {
  id: number;
  fecha: string;
  tipo: "INGRESO" | "EGRESO";
  codigo: MonedaCajaFuerte;
  monto: string;
  concepto: string; // lo escrito al cargarlo, o la transferencia que lo generó
  manual: boolean; // cargado a mano desde este módulo
  usuario: string;
  // cómo quedó cada saldo después de este movimiento (null si esa moneda todavía no se había movido)
  saldoUsd: string | null;
  saldoCop: string | null;
  saldoEur: string | null;
}

/** Una caja creada con sus saldos en dólares, pesos y euros. */
export interface SaldosDeCaja {
  id: number;
  nombre: string;
  tipo: string;
  esFuerte: boolean;
  usd: string;
  cop: string;
  eur: string;
}

export interface CajaFuerte {
  caja: { id: number; nombre: string };
  cajaMovimientos: { id: number; nombre: string }; // la caja de la que se listan los movimientos
  cajas: SaldosDeCaja[]; // todas las cajas creadas
  saldos: SaldoCajaFuerte[];
  movimientos: MovimientoCajaFuerte[];
  paginacion: { pagina: number; porPagina: number; total: number; paginas: number };
}

export interface FiltrosCajaFuerte {
  pagina: number;
  porPagina: number;
  moneda?: MonedaCajaFuerte | "";
  tipo?: "INGRESO" | "EGRESO" | "";
  cajaId?: number | null; // ver los movimientos de otra caja
}

export function getCajaFuerte(f: FiltrosCajaFuerte) {
  const q = new URLSearchParams({ pagina: String(f.pagina), porPagina: String(f.porPagina) });
  if (f.moneda) q.set("moneda", f.moneda);
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.cajaId) q.set("cajaId", String(f.cajaId));
  return api.get<CajaFuerte>(`/caja-fuerte?${q.toString()}`);
}

/** Ingresa o egresa dinero. Devuelve la primera página, con el movimiento nuevo arriba. */
export function registrarMovimientoCajaFuerte(datos: { tipo: "INGRESO" | "EGRESO"; monedaCodigo: MonedaCajaFuerte; monto: string; concepto: string; porPagina: number }) {
  return api.post<CajaFuerte>("/caja-fuerte/movimientos", datos);
}
