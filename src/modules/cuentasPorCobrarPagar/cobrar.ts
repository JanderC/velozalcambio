// Cuentas por Cobrar: cómo se agrupan los clientes y cuánto vale cada saldo en pesos.
import type { CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

// Los grupos con los que arranca el tablero, como las columnas del Excel. Se pueden crear más al registrar un cliente.
export const GRUPOS_BASE = ["Cerveloza", "Zelle", "Préstamos"];
export const SIN_GRUPO = "Sin grupo";

export const grupoDe = (c: CuentaCorrienteResumen) => c.grupo_cobro?.trim() || SIN_GRUPO;

/** Los grupos a mostrar: los de base, más los que tengan clientes, en ese orden. "Sin grupo" solo si hay alguno. */
export function gruposDe(cuentas: CuentaCorrienteResumen[]): string[] {
  const vistos = new Map<string, string>(); // en minúsculas -> como se escribe
  for (const g of GRUPOS_BASE) vistos.set(g.toLowerCase(), g);
  for (const c of cuentas) {
    const g = grupoDe(c);
    if (g !== SIN_GRUPO && !vistos.has(g.toLowerCase())) vistos.set(g.toLowerCase(), g);
  }
  const lista = [...vistos.values()];
  if (cuentas.some((c) => grupoDe(c) === SIN_GRUPO)) lista.push(SIN_GRUPO);
  return lista;
}

export const mismoGrupo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** El saldo en pesos: el propio si la cuenta es en pesos; si no, a su tasa (null si todavía no tiene tasa). */
export function enPesos(c: CuentaCorrienteResumen): string | null {
  if (c.moneda_codigo === "COP") return c.saldo_actual;
  if (!c.valor_moneda) return null;
  const negativo = c.saldo_actual.startsWith("-");
  const valor = multiplicarDecimales(negativo ? c.saldo_actual.slice(1) : c.saldo_actual, c.valor_moneda, 0);
  return negativo && /[1-9]/.test(valor) ? `-${valor}` : valor;
}

/** La tasa a pesos es la fijada para este cliente (y no la última usada en el sistema). */
export const tasaFijada = (c: CuentaCorrienteResumen) => c.moneda_cobro_codigo === "COP" && !!c.tasa_cobro;

export function totalEnPesos(cuentas: CuentaCorrienteResumen[]) {
  let total = "0";
  let sinTasa = 0;
  for (const c of cuentas) {
    const p = enPesos(c);
    if (p === null) sinTasa++;
    else total = sumarDecimales(total, p);
  }
  return { total, sinTasa };
}

/** Lo que se debe en cada moneda distinta de pesos, tal como está anotado (sin convertir). */
export function totalesPorMoneda(cuentas: CuentaCorrienteResumen[]) {
  const totales = new Map<string, string>();
  for (const c of cuentas) {
    if (c.moneda_codigo === "COP" || !/[1-9]/.test(c.saldo_actual)) continue;
    totales.set(c.moneda_codigo, sumarDecimales(totales.get(c.moneda_codigo) ?? "0", c.saldo_actual));
  }
  return [...totales.entries()].map(([codigo, total]) => ({ codigo, total }));
}

/** "$1.200.000", "122,37 USD", "− $50.000". */
export function dinero(monto: string, codigo: string) {
  const negativo = monto.startsWith("-");
  const numero = formatearMonto(negativo ? monto.slice(1) : monto);
  const texto = codigo === "COP" ? `$${numero}` : `${numero} ${codigo}`;
  return negativo && /[1-9]/.test(numero) ? `− ${texto}` : texto;
}

/** Lo que va debajo del nombre cuando la cuenta no es en pesos: "122,37 USD × 2.950". */
export function detalleMoneda(c: CuentaCorrienteResumen): string | null {
  if (c.moneda_codigo === "COP") return null;
  const propio = dinero(c.saldo_actual, c.moneda_codigo);
  return c.valor_moneda ? `${propio} × ${formatearMonto(c.valor_moneda)}${tasaFijada(c) ? "" : " (tasa del día)"}` : `${propio} · sin tasa a pesos`;
}

export function fechaDeHoy() {
  return new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** El mensaje de cobro para el cliente, listo para WhatsApp. */
export function mensajeDeCobro(c: CuentaCorrienteResumen) {
  const pesos = enPesos(c);
  const saldo = dinero(c.saldo_actual.replace(/^-/, ""), c.moneda_codigo);
  const equivalente = c.moneda_codigo !== "COP" && pesos ? ` (equivale a ${dinero(pesos.replace(/^-/, ""), "COP")} COP)` : "";
  if (!/[1-9]/.test(c.saldo_actual)) return `Estimado(a) ${c.tercero_nombre}, le informamos que al ${fechaDeHoy()} no tiene saldo pendiente con nosotros. Gracias.`;
  if (c.saldo_actual.startsWith("-")) return `Estimado(a) ${c.tercero_nombre}, le informamos que al ${fechaDeHoy()} tiene un saldo a su favor de ${saldo}${equivalente}.`;
  return `Estimado(a) ${c.tercero_nombre}, le informamos su saldo pendiente por pagar al ${fechaDeHoy()}:\n\n${saldo}${equivalente}\n\nAgradecemos su pago. Gracias.`;
}
