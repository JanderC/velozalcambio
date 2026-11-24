/**
 * Lo que cobra el banco al mandar bolívares (tarifario del BCV vigente, agosto/septiembre 2026). Igual que en
 * backend/src/services/comisionesBolivares.ts (el servidor es el que la cobra; acá solo se muestra).
 */
export const ENVIOS_BOLIVARES = {
  P2P: { etiqueta: "Pago móvil a persona", corto: "0,30 % · mín. Bs 14", porcentaje: 0.3, minimo: 14 },
  P2C: { etiqueta: "Pago móvil a comercio", corto: "1,50 % · mín. Bs 14", porcentaje: 1.5, minimo: 14 },
  C2P: { etiqueta: "Pago móvil de comercio a persona", corto: "1,75 % · mín. Bs 14", porcentaje: 1.75, minimo: 14 },
  TRANSFERENCIA: { etiqueta: "Transferencia", corto: "sin comisión", porcentaje: 0, minimo: 0 },
} as const;
export type EnvioBolivares = keyof typeof ENVIOS_BOLIVARES;
export const TIPOS_ENVIO = Object.keys(ENVIOS_BOLIVARES) as EnvioBolivares[];

/** La comisión del banco por mandar ese monto en bolívares. */
export function comisionBolivares(monto: number, envio: EnvioBolivares) {
  const t = ENVIOS_BOLIVARES[envio];
  return Math.round(Math.max((Math.abs(monto) * t.porcentaje) / 100, t.minimo) * 100) / 100;
}

const CLAVE = "cc-envio-bolivares";
/** El tipo de envío que se usó la última vez en esta computadora (al principio, pago móvil a persona). */
export function envioPropuesto(): EnvioBolivares {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v && v in ENVIOS_BOLIVARES) return v as EnvioBolivares;
  } catch {
    // sin almacenamiento
  }
  return "P2P";
}
export function recordarEnvio(e: EnvioBolivares) {
  try {
    localStorage.setItem(CLAVE, e);
  } catch {
    // no es grave
  }
}
