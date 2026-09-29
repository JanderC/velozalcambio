// Mismo formato que valida el backend: positivo, hasta 4 decimales. Se acepta coma decimal.
export function normalizarMonto(texto: string): string | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(limpio) || Number(limpio) <= 0) return null;
  return limpio;
}

export function formatearMonto(monto: string) {
  return Number(monto).toLocaleString("es-CO", { maximumFractionDigits: 4 });
}
