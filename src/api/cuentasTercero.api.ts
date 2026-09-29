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

// Campos en camelCase, como los espera el backend. En el alta los vacíos no se envían;
// en la edición solo va lo que cambió, y `null` borra un campo opcional.
export interface DatosCuentaTercero {
  tipo: TipoCuentaTercero;
  monedaId?: number | null;
  banco?: string | null;
  numeroCuenta?: string | null;
  tipoCuenta?: "AHORRO" | "CORRIENTE" | null;
  titular: string;
  identificacionTitular?: string | null;
  telefono?: string | null;
  email?: string | null;
  alias?: string | null;
}

export type CambiosCuentaTercero = Partial<DatosCuentaTercero> & { activo?: boolean };

export function crearCuentaTercero(terceroId: number, datos: DatosCuentaTercero) {
  return api.post<CuentaTercero>(`/terceros/${terceroId}/cuentas`, datos);
}

export function actualizarCuentaTercero(cuentaId: number, cambios: CambiosCuentaTercero) {
  return api.put<CuentaTercero>(`/terceros/cuentas/${cuentaId}`, cambios);
}

// No borra: la deja inactiva (solo ADMIN/ASESOR). Se reactiva con actualizarCuentaTercero(id, { activo: true }).
export function desactivarCuentaTercero(cuentaId: number) {
  return api.delete<CuentaTercero>(`/terceros/cuentas/${cuentaId}`);
}
