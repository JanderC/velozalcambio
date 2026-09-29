// Montos y tasas viajan como string ("3.2") para no perder precisión.
// Estas funciones solo tocan texto: nunca convierten a number.

// Lo que escribe la cajera -> formato que acepta el backend: dígitos y un solo punto decimal.
// La coma se toma como separador decimal ("3,2" -> "3.2").
export function normalizarDecimal(texto: string): string {
  const limpio = texto.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const punto = limpio.indexOf(".");
  if (punto === -1) return limpio;
  return limpio.slice(0, punto + 1) + limpio.slice(punto + 1).replace(/\./g, "");
}

// "3.2", "937.5", "3000.0000" — lo que el backend acepta como monto positivo.
export function esDecimalValido(texto: string): boolean {
  return /^\d+(\.\d+)?$/.test(texto) && /[1-9]/.test(texto);
}

// "1234567.5000" -> "1.234.567,5" (miles con punto, decimales con coma, sin ceros de relleno).
export function formatearMonto(valor: string): string {
  const [entero = "0", decimal = ""] = valor.trim().split(".");
  const negativo = entero.startsWith("-");
  const digitos = (negativo ? entero.slice(1) : entero).replace(/^0+(?=\d)/, "");
  const conMiles = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = decimal.replace(/0+$/, "");
  return (negativo ? "-" : "") + conMiles + (dec ? `,${dec}` : "");
}
