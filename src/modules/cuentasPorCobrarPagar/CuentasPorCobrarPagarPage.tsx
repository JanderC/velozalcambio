import { CuentasCorrientesPage } from "../cuentasCorrientes/CuentasCorrientesPage";

/**
 * Cuentas por Cobrar / Pagar se alimenta de las cuentas corrientes: muestra a quién le debo y
 * quién me debe, y las cuentas de poco movimiento que se pasaron para acá. Se llevan con la misma hoja.
 */
export function CuentasPorCobrarPagarPage() {
  return <CuentasCorrientesPage modo="cobrar" />;
}
