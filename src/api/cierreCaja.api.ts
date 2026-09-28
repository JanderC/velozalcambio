import { api, ApiError } from "./client";

export interface CierreCaja {
  id: number;
  caja_id: number;
  caja_nombre: string;
  moneda_id: number;
  moneda_codigo: string;
  usuario_nombre?: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  saldo_inicial: string;
  saldo_esperado: string | null;
  saldo_real: string | null;
  diferencia: string | null;
  estado: "ABIERTA" | "CERRADA";
}

export function abrirCaja(data: { cajaId: number; monedaId: number }) {
  return api.post<CierreCaja>("/cierres-caja/abrir", data);
}

export function cerrarCaja(cierreId: number, saldoReal: string) {
  return api.post<CierreCaja>(`/cierres-caja/${cierreId}/cerrar`, { saldoReal });
}

export async function getCierreAbierto(cajaId: number, monedaId: number): Promise<CierreCaja | null> {
  try {
    return await api.get<CierreCaja>(`/cierres-caja/abierto?cajaId=${cajaId}&monedaId=${monedaId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function getHistorialCierres(cajaId?: number) {
  const q = cajaId ? `?cajaId=${cajaId}` : "";
  return api.get<CierreCaja[]>(`/cierres-caja${q}`);
}