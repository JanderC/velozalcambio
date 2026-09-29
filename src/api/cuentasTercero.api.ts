import { api } from "./client";

// Cuentas donde el cliente recibe o envía dinero (bancos, pago móvil, billeteras).
// No confundir con las cuentas corrientes internas de la casa de cambio.
export type TipoCuentaTercero = "CUENTA_BANCARIA" | "PAGO_MOVIL" | "ZELLE" | "NEQUI" | "DAVIPLATA" | "OTRO";

export const ETIQUETA_TIPO_CUENTA: Record<TipoCuentaTercero, string> = {
  CUENTA_BANCARIA: "Cuenta bancaria",
  PAGO_MOVIL: "Pago Móvil",
  ZELLE: "Zelle",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  OTRO: "Otro",
};

export interface CuentaTercero {
  id: number;
  tercero_id: number;
  moneda_id: number | null;
  moneda_codigo: string | null;
  tipo: TipoCuentaTercero;
  banco: string | null;
  numero_cuenta: string | null;
  tipo_cuenta: "AHORRO" | "CORRIENTE" | null;
  titular: string;
  identificacion_titular: string | null;
  telefono: string | null;
  email: string | null;
  alias: string | null;
  activo: boolean;
  created_at: string;
}

export function getCuentasTercero(terceroId: number, incluirInactivas = false) {
  const q = incluirInactivas ? "?incluirInactivas=true" : "";
  return api.get<CuentaTercero[]>(`/terceros/${terceroId}/cuentas${q}`);
}
