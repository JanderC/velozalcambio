import { api } from "./client";

export interface CuentaPorCobrar {
  id: number;
  tercero_id: number;
  tercero_nombre: string;
  moneda_id: number;
  moneda_codigo: string;
  monto_original: string;
  saldo_pendiente: string;
  estado: "PENDIENTE" | "ABONADA" | "PAGADA" | "VENCIDA";
  created_at: string;
}

export function getCuentasPorCobrar(estado?: string) {
  const q = estado ? `?estado=${estado}` : "";
  return api.get<CuentaPorCobrar[]>(`/cuentas-por-cobrar${q}`);
}

export function crearCuentaPorCobrar(data: { terceroId: number; monedaId: number; montoOriginal: string }) {
  return api.post<CuentaPorCobrar>("/cuentas-por-cobrar", data);
}

export function registrarAbonoCobrar(id: number, data: { monto: string; cajaId: number; metodoPagoId?: number }) {
  return api.post(`/cuentas-por-cobrar/${id}/abonos`, data);
}