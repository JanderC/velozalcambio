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

// Lo que se escribe como en el Excel -> decimal normalizado con signo, o null si no es un número.
// "700.000" -> "700000", "3,2" -> "3.2", "1.234.567,5" -> "1234567.5", "3.22" -> "3.22", "-12.500" -> "-12500".
// Un solo punto seguido de exactamente 3 dígitos se lee como miles (así se escribe en Colombia).
export function leerNumero(texto: string): string | null {
  let s = texto.trim().replace(/[\s$]/g, "");
  const negativo = s.startsWith("-");
  if (negativo) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const comas = (s.match(/,/g) ?? []).length;
  const puntos = (s.match(/\./g) ?? []).length;
  let entero = s;
  let decimal = "";
  if (comas === 1) {
    [entero = "", decimal = ""] = s.split(",");
    entero = entero.replace(/\./g, "");
  } else if (comas > 1) {
    return null;
  } else if (puntos === 1) {
    const [a = "", b = ""] = s.split(".");
    if (b.length === 3 && a.length >= 1 && a.length <= 3 && a !== "0") entero = a + b;
    else [entero, decimal] = [a, b];
  } else if (puntos > 1) {
    entero = s.replace(/\./g, "");
  }
  if (entero.includes(".") || decimal.includes(".")) return null;
  entero = entero.replace(/^0+(?=\d)/, "") || "0";
  decimal = decimal.replace(/0+$/, "");
  const valor = decimal ? `${entero}.${decimal}` : entero;
  return negativo && /[1-9]/.test(valor) ? `-${valor}` : valor;
}

// cantidad x tasa con enteros grandes (sin float), redondeado a `decimales`. Solo para mostrar
// el resultado mientras se escribe: el monto que se guarda lo calcula el backend.
export function multiplicarDecimales(a: string, b: string, decimales: number): string {
  const partes = (v: string) => {
    const negativo = v.startsWith("-");
    const [e = "0", d = ""] = (negativo ? v.slice(1) : v).split(".");
    return { n: BigInt(e + d) * (negativo ? -1n : 1n), escala: d.length };
  };
  const x = partes(a);
  const y = partes(b);
  let producto = x.n * y.n;
  const negativo = producto < 0n;
  if (negativo) producto = -producto;
  const escala = x.escala + y.escala;
  if (escala > decimales) {
    const divisor = 10n ** BigInt(escala - decimales);
    producto = (producto + divisor / 2n) / divisor;
  } else {
    producto *= 10n ** BigInt(decimales - escala);
  }
  const texto = producto.toString().padStart(decimales + 1, "0");
  const entero = decimales ? texto.slice(0, -decimales) : texto;
  const dec = decimales ? texto.slice(-decimales).replace(/0+$/, "") : "";
  return (negativo && producto !== 0n ? "-" : "") + entero + (dec ? `.${dec}` : "");
}

// a / b con enteros grandes (sin float), redondeado a `decimales`. Ej. pesos recibidos / tasa = dólares.
export function dividirDecimales(a: string, b: string, decimales: number): string | null {
  const partes = (v: string) => {
    const negativo = v.startsWith("-");
    const [e = "0", d = ""] = (negativo ? v.slice(1) : v).split(".");
    return { n: BigInt(e + d) * (negativo ? -1n : 1n), escala: d.length };
  };
  const x = partes(a);
  const y = partes(b);
  if (y.n === 0n) return null;
  const negativo = x.n < 0n !== y.n < 0n;
  const numerador = (x.n < 0n ? -x.n : x.n) * 10n ** BigInt(y.escala + decimales);
  const divisor = (y.n < 0n ? -y.n : y.n) * 10n ** BigInt(x.escala);
  const cociente = (numerador + divisor / 2n) / divisor;
  const texto = cociente.toString().padStart(decimales + 1, "0");
  const entero = decimales ? texto.slice(0, -decimales) : texto;
  const dec = decimales ? texto.slice(-decimales).replace(/0+$/, "") : "";
  return (negativo && cociente !== 0n ? "-" : "") + entero + (dec ? `.${dec}` : "");
}

export function sumarDecimales(a: string, b: string): string {
  const escala = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const aEntero = (v: string) => {
    const negativo = v.startsWith("-");
    const [e = "0", d = ""] = (negativo ? v.slice(1) : v).split(".");
    return BigInt(e + d.padEnd(escala, "0")) * (negativo ? -1n : 1n);
  };
  const suma = aEntero(a) + aEntero(b);
  const negativo = suma < 0n;
  const texto = (negativo ? -suma : suma).toString().padStart(escala + 1, "0");
  const entero = escala ? texto.slice(0, -escala) : texto;
  const dec = escala ? texto.slice(-escala).replace(/0+$/, "") : "";
  return (negativo ? "-" : "") + entero + (dec ? `.${dec}` : "");
}
