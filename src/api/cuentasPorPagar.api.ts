import { api } from "./client";

export interface CuentaPorPagar {
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

export function getCuentasPorPagar(estado?: string) {
  const q = estado ? `?estado=${estado}` : "";
  return api.get<CuentaPorPagar[]>(`/cuentas-por-pagar${q}`);
}

export function crearCuentaPorPagar(data: { terceroId: number; monedaId: number; montoOriginal: string }) {
  return api.post<CuentaPorPagar>("/cuentas-por-pagar", data);
}

export function registrarAbonoPagar(id: number, data: { monto: string; cajaId: number; metodoPagoId?: number }) {
  return api.post(`/cuentas-por-pagar/${id}/abonos`, data);
}