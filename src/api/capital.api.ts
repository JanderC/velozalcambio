import { api } from "./client";

export interface CajaDelSistema {
  id: number;
  nombre: string;
  tipo: string;
  saldos: { codigo: string; monto: string }[];
}

export interface BancoDelSistema {
  id: number;
  nombre: string;
  moneda: string | null; // la moneda de la cuenta (null en las viejas: se toman como pesos)
  saldos: { codigo: string; monto: string | number }[];
}

export interface DatosDelSistema {
  cajas: CajaDelSistema[];
  // las cuentas de banco de la empresa y lo que tienen
  bancos?: BancoDelSistema[];
  // confirmaciones que se le deben a clientes y todavía no se pagaron, por moneda
  confirmacionesPorPagar: { codigo: string; total: string; cantidad: number }[];
}

export interface CuadreResumen {
  id: number;
  created_at: string;
  capital_cop: string;
  capital_divisa: string;
  capital_divisa_cop: string;
  nota: string | null;
  usuario_nombre: string;
}

export interface CuadreCompleto extends CuadreResumen {
  datos: Record<string, unknown>;
}

export const capitalApi = {
  sistema: () => api.get<DatosDelSistema>("/capital/sistema"),
  cuadres: () => api.get<CuadreResumen[]>("/capital/cuadres"),
  cuadre: (id: number) => api.get<CuadreCompleto>(`/capital/cuadres/${id}`),
  crearBanco: (nombre: string, moneda: string) => api.post<{ id: number; nombre: string }>("/capital/bancos", { nombre, moneda }),
  cargarSaldoBanco: (id: number, moneda: string, saldo: string) =>
    api.post<{ cuenta: string; antes: string; ahora: string; diferencia: string }>(`/capital/bancos/${id}/saldo`, { moneda, saldo }),
  guardar: (cuadre: { datos: Record<string, unknown>; capitalCop: number; capitalDivisa: number; capitalDivisaCop: number; nota?: string }) =>
    api.post<{ id: number; created_at: string }>("/capital/cuadres", cuadre),
};
