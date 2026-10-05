import type { EstadoCuenta } from "../../api/cuentasCorrientes.api";
import { formatearMonto, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

const ANCHO = 1080;
const MARGEN = 28;
const ALTO_FILA = 50;
const ALTO_CABEZA = 58;
// Más filas que esto no caben en una imagen que el teléfono pueda abrir: se muestran las últimas
const MAX_FILAS = 250;
const FUENTE = '"Inter", "Segoe UI", Arial, sans-serif';
// Dónde va cada columna: [x, alineación]
const COL = {
  fecha: [MARGEN, "left"],
  referencia: [150, "left"],
  cantidad: [590, "right"],
  tasa: [670, "right"],
  monto: [850, "right"],
  total: [ANCHO - MARGEN, "right"],
} as const;

const SEPARACION_CUADRO = 18;

// Una línea del cuadrito de abajo: texto a la izquierda, monto a la derecha
interface LineaCuadro {
  texto: string;
  monto: string; // con signo, ya en la moneda que se muestra
  prefijo: string;
  total?: boolean;
}

type MonedaTasa = "USD" | "USDT" | "EUR" | "VES";
const NOMBRE_MONEDA: Record<MonedaTasa, string> = { USD: "dólares", USDT: "USDT", EUR: "euros", VES: "bolívares" };
const cantidadTexto = (cantidad: string, moneda: MonedaTasa) => (moneda === "VES" ? `Bs. ${formatearMonto(cantidad)}` : `${formatearMonto(cantidad)} ${moneda}`);

// A qué moneda corresponde una tasa en pesos: primero por la referencia del movimiento, si no por su tamaño
// (un dólar vale miles de pesos; un bolívar, unos pocos).
function monedaDeLaTasa(tasa: string, referencia = ""): MonedaTasa | null {
  if (/euro/i.test(referencia)) return "EUR";
  if (/usdt/i.test(referencia)) return "USDT";
  if (/zelle|d[oó]lar/i.test(referencia)) return "USD";
  if (/bss|bol[ií]var|pago m[oó]vil/i.test(referencia)) return "VES";
  const n = Number(tasa);
  if (n >= 1000) return "USD";
  if (n >= 2 && n < 100) return "VES";
  return null;
}

/**
 * El cuadrito de abajo. Las tasas cambian de un movimiento a otro, así que no se convierte todo con una sola:
 * por cada moneda va una línea por tasa (3 USD × 3.100 = $9.300) y al final el total de esa moneda, en cantidad y en pesos.
 * Las ventas y los abonos van en líneas aparte.
 */
function lineasDelCuadro(estado: EstadoCuenta): { titulo: string; lineas: LineaCuadro[] } {
  // Cuenta en otra moneda: su saldo en pesos, al valor de esa moneda
  if (estado.cuenta.moneda_codigo !== "COP") {
    const valor = estado.cuenta.valor_moneda;
    if (!valor || !/[1-9]/.test(estado.saldoFinal)) return { titulo: "", lineas: [] };
    return {
      titulo: "El saldo pendiente equivale a",
      lineas: [{ texto: `En pesos, 1 ${estado.cuenta.moneda_codigo} = $${formatearMonto(valor)}`, monto: multiplicarDecimales(estado.saldoFinal, valor, 0), prefijo: "$", total: true }],
    };
  }
  const grupos = new Map<string, { moneda: MonedaTasa; tasa: string; abono: boolean; cantidad: string; pesos: string }>();
  for (const m of estado.movimientos) {
    // Solo lo que se movió en otra moneda: los abonos y demás movimientos en pesos ya están en la tabla
    if (m.anulado || !m.tasa || m.tasa_es_porcentaje || !m.cantidad_base) continue;
    const moneda = monedaDeLaTasa(m.tasa, m.descripcion ?? "");
    if (!moneda) continue;
    const abono = m.monto.startsWith("-");
    const clave = `${moneda}|${Number(m.tasa)}|${abono}`;
    const g = grupos.get(clave) ?? { moneda, tasa: m.tasa, abono, cantidad: "0", pesos: "0" };
    g.cantidad = sumarDecimales(g.cantidad, m.cantidad_base);
    g.pesos = sumarDecimales(g.pesos, m.monto);
    grupos.set(clave, g);
  }
  const lineas: LineaCuadro[] = [];
  for (const moneda of ["USD", "USDT", "EUR", "VES"] as const) {
    const deLaMoneda = [...grupos.values()].filter((g) => g.moneda === moneda).sort((a, b) => Number(a.abono) - Number(b.abono) || Number(a.tasa) - Number(b.tasa));
    if (deLaMoneda.length === 0) continue;
    let cantidad = "0";
    let pesos = "0";
    for (const g of deLaMoneda) {
      cantidad = sumarDecimales(cantidad, g.cantidad);
      pesos = sumarDecimales(pesos, g.pesos);
      lineas.push({ texto: `${g.cantidad.startsWith("-") ? "- " : ""}${cantidadTexto(g.cantidad.replace(/^-/, ""), moneda)} × ${formatearMonto(g.tasa)}`, monto: g.pesos, prefijo: "$" });
    }
    lineas.push({ texto: `Total ${NOMBRE_MONEDA[moneda]}: ${cantidad.startsWith("-") ? "- " : ""}${cantidadTexto(cantidad.replace(/^-/, ""), moneda)}`, monto: pesos, prefijo: "$", total: true });
  }
  return { titulo: "Por moneda y tasa", lineas };
}

/** Es un abono si la referencia lo dice; si no dice nada (ni abono ni venta), cuando resta. */
function esAbono(descripcion: string | null, monto: string) {
  if (/^\s*(abono|pago)/i.test(descripcion ?? "")) return true;
  if (/^\s*venta/i.test(descripcion ?? "")) return false;
  return monto.startsWith("-");
}

/** Todo lo abonado en el día: lo que resta y también los abonos cargados como suma (ej. un abono por transferencia). */
function abonadoEnElDia(estado: EstadoCuenta) {
  return estado.movimientos
    .filter((m) => !m.anulado && esAbono(m.descripcion, m.monto))
    .reduce((suma, m) => sumarDecimales(suma, m.monto.replace(/^-/, "")), "0");
}

const negar = (v: string) => (v.startsWith("-") ? v.slice(1) : /[1-9]/.test(v) ? `-${v}` : v);

/**
 * La hoja como imagen para mandarle al cliente: solo los movimientos y el saldo.
 * Sin nombre del cliente ni nada del sistema, y sin los movimientos anulados.
 */
export function generarImagenReporte(estado: EstadoCuenta, simbolo: string): Promise<Blob> {
  const vigentes = estado.movimientos.filter((m) => !m.anulado);
  const cuadro = lineasDelCuadro(estado);
  const filas = vigentes.slice(-MAX_FILAS);
  // El saldo de arranque sale de restarle al saldo final lo que se muestra: así el total corrido siempre cierra
  let corrido = filas.reduce((saldo, m) => sumarDecimales(saldo, negar(m.monto)), estado.saldoFinal);
  const conSaldoAnterior = /[1-9]/.test(corrido);

  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  const altoCuadro = cuadro.lineas.length ? SEPARACION_CUADRO + (cuadro.lineas.length + 1) * ALTO_FILA : 0;
  lienzo.height = ALTO_CABEZA + (filas.length + (conSaldoAnterior ? 1 : 0) + 2) * ALTO_FILA + altoCuadro + 12;
  const c = lienzo.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, lienzo.width, lienzo.height);
  c.textBaseline = "middle";

  const dinero = (v: string) => (v.startsWith("-") ? `- ${simbolo}${formatearMonto(v.slice(1))}` : `${simbolo}${formatearMonto(v)}`);
  function texto(valor: string, columna: keyof typeof COL, y: number, color: string, negrita = false, anchoMax?: number) {
    const [x, alineacion] = COL[columna];
    c.font = `${negrita ? "700" : "400"} 22px ${FUENTE}`;
    c.fillStyle = color;
    c.textAlign = alineacion;
    let visible = valor;
    if (anchoMax) while (visible.length > 1 && c.measureText(visible).width > anchoMax) visible = `${visible.slice(0, -2)}…`;
    c.fillText(visible, x, y);
  }
  const colorMonto = (v: string) => (v.startsWith("-") ? "#c0392b" : "#111827");

  // Encabezado
  c.fillStyle = "#12305a";
  c.fillRect(0, 0, ANCHO, ALTO_CABEZA);
  for (const [columna, titulo] of [["fecha", "FECHA"], ["referencia", "REFERENCIA"], ["cantidad", "CANTIDAD"], ["tasa", "TASA"], ["monto", "MONTO"], ["total", "TOTAL"]] as const) {
    texto(titulo, columna, ALTO_CABEZA / 2, "#ffffff", true);
  }

  let y = ALTO_CABEZA;
  function franja(etiqueta: string, saldo: string) {
    c.fillStyle = "#e6f7fb";
    c.fillRect(0, y, ANCHO, ALTO_FILA);
    texto(etiqueta, "fecha", y + ALTO_FILA / 2, "#12305a", true);
    texto(dinero(saldo), "total", y + ALTO_FILA / 2, colorMonto(saldo), true);
    y += ALTO_FILA;
  }

  if (conSaldoAnterior) franja("Saldo pendiente anterior", corrido);
  filas.forEach((m, i) => {
    corrido = sumarDecimales(corrido, m.monto);
    if (i % 2 === 1) {
      c.fillStyle = "#f7f8fa";
      c.fillRect(0, y, ANCHO, ALTO_FILA);
    }
    const medio = y + ALTO_FILA / 2;
    const fecha = new Date(m.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "2-digit" });
    texto(fecha, "fecha", medio, "#4b5563");
    texto(`${m.descripcion ?? m.tipo}${m.cuenta_destino ? ` → ${m.cuenta_destino}` : ""}`, "referencia", medio, "#111827", false, m.cantidad_base ? 290 : 500);
    if (m.cantidad_base) texto(formatearMonto(m.cantidad_base), "cantidad", medio, colorMonto(m.cantidad_base));
    if (m.tasa) texto(m.tasa_es_porcentaje ? `${formatearMonto(multiplicarDecimales(m.tasa, "100", 6))}%` : formatearMonto(m.tasa), "tasa", medio, "#4b5563");
    texto(dinero(m.monto), "monto", medio, colorMonto(m.monto));
    texto(dinero(corrido), "total", medio, colorMonto(corrido), true);
    y += ALTO_FILA;
  });
  // Lo que abonó el cliente en el día, en la moneda de la cuenta
  c.fillStyle = "#eef7f0";
  c.fillRect(0, y, ANCHO, ALTO_FILA);
  texto("Abonado en el día", "fecha", y + ALTO_FILA / 2, "#1a7f37", true);
  texto(dinero(abonadoEnElDia(estado)), "total", y + ALTO_FILA / 2, "#1a7f37", true);
  y += ALTO_FILA;
  franja("Saldo pendiente", estado.saldoFinal);

  // Cuadrito debajo de la tabla: por moneda, cada tasa en su línea y el total
  if (cuadro.lineas.length) {
    y += SEPARACION_CUADRO;
    const alto = (cuadro.lineas.length + 1) * ALTO_FILA;
    c.fillStyle = "#f7f9fc";
    c.fillRect(MARGEN, y, ANCHO - MARGEN * 2, alto);
    cuadro.lineas.forEach((l, i) => {
      if (!l.total) return;
      c.fillStyle = "#e6f7fb";
      c.fillRect(MARGEN, y + (i + 1) * ALTO_FILA, ANCHO - MARGEN * 2, ALTO_FILA);
    });
    c.strokeStyle = "#12305a";
    c.lineWidth = 2;
    c.strokeRect(MARGEN, y, ANCHO - MARGEN * 2, alto);
    c.font = `700 22px ${FUENTE}`;
    c.fillStyle = "#12305a";
    c.textAlign = "left";
    c.fillText(cuadro.titulo, MARGEN + 18, y + ALTO_FILA / 2);
    cuadro.lineas.forEach((l, i) => {
      const medio = y + (i + 1) * ALTO_FILA + ALTO_FILA / 2;
      c.font = `${l.total ? "700" : "400"} 22px ${FUENTE}`;
      c.fillStyle = l.total ? "#12305a" : "#374151";
      c.textAlign = "left";
      c.fillText(l.texto, MARGEN + 18, medio);
      c.font = `${l.total ? "700" : "400"} 24px ${FUENTE}`;
      c.fillStyle = colorMonto(l.monto);
      c.textAlign = "right";
      const cifra = l.monto.startsWith("-") ? `- ${l.prefijo}${formatearMonto(l.monto.slice(1))}` : `${l.prefijo}${formatearMonto(l.monto)}`;
      c.fillText(l.total ? `Total COP: ${cifra}` : `= ${cifra}`, ANCHO - MARGEN - 18, medio);
    });
  }

  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("No se pudo generar la imagen"))), "image/png"));
}

/** Guarda un archivo generado en el navegador. El enlace va en el documento y la URL se libera después: si no, algunos navegadores navegan en vez de descargar. */
export function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Copia la imagen al portapapeles, para pegarla en WhatsApp Web o donde haga falta. */
export async function copiarImagen(blob: Blob) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/**
 * En el teléfono abre el menú de compartir (WhatsApp, etc.) con la imagen y devuelve true.
 * En el computador no hay un menú así que sirva: devuelve false para que se muestre la imagen con copiar y descargar.
 */
export async function compartirImagen(blob: Blob, nombreArchivo: string): Promise<boolean> {
  const archivo = new File([blob], nombreArchivo, { type: "image/png" });
  const esTactil = window.matchMedia("(pointer: coarse)").matches;
  if (!esTactil || !navigator.canShare?.({ files: [archivo] })) return false;
  try {
    await navigator.share({ files: [archivo] });
    return true;
  } catch (e) {
    return (e as Error).name === "AbortError"; // cerrar el menú sin compartir no es un error
  }
}
