import type { Solicitud } from "../../api/transacciones.api";

export type TipoSolicitud = "COMPRA_DIVISA" | "VENTA_DIVISA" | "DEPOSITO" | "RETIRO";

export const TIPO_INFO: Record<string, { etiqueta: string; corta: string; clase: string; explicacion: string }> = {
  COMPRA_DIVISA: { etiqueta: "Compra de divisa", corta: "Compra", clase: "compra", explicacion: "El cliente nos vende divisa y le pagamos" },
  VENTA_DIVISA: { etiqueta: "Venta de divisa", corta: "Venta", clase: "venta", explicacion: "El cliente nos paga y le entregamos divisa" },
  DEPOSITO: { etiqueta: "Depósito", corta: "Depósito", clase: "deposito", explicacion: "El cliente deposita en nuestra cuenta" },
  RETIRO: { etiqueta: "Retiro", corta: "Retiro", clase: "retiro", explicacion: "Le pagamos al cliente desde nuestra cuenta" },
};

export function infoTipo(tipo: string) {
  return TIPO_INFO[tipo] ?? { etiqueta: tipo, corta: tipo, clase: "otro", explicacion: "" };
}

export interface LadoFlujo {
  monto: string;
  moneda: string;
  caja: string;
  esBanco: boolean;
}

/**
 * Qué entra y qué sale al confirmar. Misma regla que patasDeTransaccion en el backend:
 * COMPRA entra la divisa (caja) y sale el pago (caja destino); VENTA al revés.
 */
export function flujoDeSolicitud(s: Solicitud): { entra: LadoFlujo | null; sale: LadoFlujo | null } {
  const origen: LadoFlujo = { monto: s.monto_origen, moneda: s.moneda_codigo, caja: s.caja_nombre, esBanco: s.caja_tipo === "BANCO" };
  const destino: LadoFlujo | null =
    s.caja_destino_nombre && s.monto_destino && s.moneda_destino_codigo
      ? { monto: s.monto_destino, moneda: s.moneda_destino_codigo, caja: s.caja_destino_nombre, esBanco: s.caja_destino_tipo === "BANCO" }
      : null;

  if (s.tipo === "COMPRA_DIVISA") return { entra: origen, sale: destino };
  if (s.tipo === "VENTA_DIVISA") return { entra: destino, sale: origen };
  if (s.tipo === "DEPOSITO") return { entra: origen, sale: null };
  return { entra: null, sale: origen };
}

// El banco "de la solicitud" es la pata que pasa por un banco (la que hay que verificar)
export function bancoDeSolicitud(s: Solicitud): number | null {
  if (s.caja_tipo === "BANCO") return s.caja_id;
  if (s.caja_destino_tipo === "BANCO" && s.caja_destino_id) return s.caja_destino_id;
  return null;
}

// "TRANSFERENCIA_BANCARIA" -> "Transferencia bancaria" (los métodos viejos se guardaron en mayúsculas)
export function nombreLegible(texto: string) {
  if (texto !== texto.toUpperCase()) return texto;
  const t = texto.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function formatearMonto(monto: string, decimales = 4) {
  return Number(monto).toLocaleString("es-CO", { maximumFractionDigits: decimales });
}

export function minutosDesde(fecha: string, ahora: number) {
  return Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 60000));
}

export function antiguedadTexto(minutos: number) {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h ${minutos % 60} min`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

// Semáforo de espera: el cliente está esperando su plata
export function urgencia(minutos: number): "ok" | "atencion" | "urgente" {
  if (minutos >= 30) return "urgente";
  if (minutos >= 10) return "atencion";
  return "ok";
}

/**
 * Lecturas posibles de lo que escribió la persona: "790.000" puede ser 790000
 * (punto de miles, como se escribe en Colombia) o 790 (punto decimal).
 */
function lecturasPosibles(texto: string): string[] {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return [];
  const lecturas: string[] = [];
  if (t.includes(",")) lecturas.push(t.replace(/\./g, "").replace(",", ".")); // 1.234,56
  else {
    lecturas.push(t.replace(/\./g, "")); // puntos de miles
    if ((t.match(/\./g) ?? []).length === 1) lecturas.push(t); // punto decimal
  }
  return lecturas.filter((l) => /^\d+(\.\d+)?$/.test(l));
}

/** Devuelve el monto normalizado ("790000") si alguna lectura coincide con el esperado; si no, null. */
export function montoQueCoincide(texto: string, esperado: string): string | null {
  return lecturasPosibles(texto).find((l) => Number(l) === Number(esperado)) ?? null;
}
