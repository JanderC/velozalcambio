import type { EstadoCuenta } from "../../api/cuentasCorrientes.api";
import { dividirDecimales, formatearMonto, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

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
  cantidad: [640, "right"],
  tasa: [740, "right"],
  monto: [900, "right"],
  total: [ANCHO - MARGEN, "right"],
} as const;

const SEPARACION_CUADRO = 18;

interface Equivalente {
  nombre: string;
  tasa: string;
  monto: string;
  prefijo: string;
  sufijo: string;
}

// A qué moneda corresponde una tasa en pesos: primero por la referencia del movimiento, si no por su tamaño
// (un dólar vale miles de pesos; un bolívar, unos pocos).
function monedaDeLaTasa(tasa: string, referencia = ""): "USD" | "VES" | null {
  if (/euro/i.test(referencia)) return null;
  if (/zelle|usdt|d[oó]lar/i.test(referencia)) return "USD";
  if (/bss|bol[ií]var|pago m[oó]vil/i.test(referencia)) return "VES";
  const n = Number(tasa);
  if (n >= 1000) return "USD";
  if (n >= 2 && n < 100) return "VES";
  return null;
}

/**
 * El saldo pendiente (en pesos) pasado a dólares y a bolívares con las últimas tasas usadas en sus movimientos:
 * primero las del reporte, y si ese día no se usó alguna, las últimas de la cuenta.
 */
function equivalentesDelSaldo(estado: EstadoCuenta, tasasRespaldo: string[]): Equivalente[] {
  if (estado.cuenta.moneda_codigo !== "COP" || !/[1-9]/.test(estado.saldoFinal)) return [];
  const tasas: Partial<Record<"USD" | "VES", string>> = {};
  const candidatas = [
    ...estado.movimientos
      .filter((m) => !m.anulado && m.tasa && !m.tasa_es_porcentaje)
      .reverse()
      .map((m) => ({ tasa: m.tasa!, referencia: m.descripcion ?? "" })),
    ...tasasRespaldo.map((tasa) => ({ tasa, referencia: "" })),
  ];
  for (const { tasa, referencia } of candidatas) {
    const moneda = monedaDeLaTasa(tasa, referencia);
    if (moneda && !tasas[moneda]) tasas[moneda] = tasa;
  }
  const lista: Equivalente[] = [];
  const usd = tasas.USD && dividirDecimales(estado.saldoFinal, tasas.USD, 2);
  if (usd) lista.push({ nombre: "En dólares", tasa: tasas.USD!, monto: usd, prefijo: "", sufijo: " USD" });
  const ves = tasas.VES && dividirDecimales(estado.saldoFinal, tasas.VES, 2);
  if (ves) lista.push({ nombre: "En bolívares", tasa: tasas.VES!, monto: ves, prefijo: "Bs. ", sufijo: "" });
  return lista;
}

const negar = (v: string) => (v.startsWith("-") ? v.slice(1) : /[1-9]/.test(v) ? `-${v}` : v);

/**
 * La hoja como imagen para mandarle al cliente: solo los movimientos y el saldo.
 * Sin nombre del cliente ni nada del sistema, y sin los movimientos anulados.
 */
export function generarImagenReporte(estado: EstadoCuenta, simbolo: string, tasasRespaldo: string[] = []): Promise<Blob> {
  const vigentes = estado.movimientos.filter((m) => !m.anulado);
  const equivalentes = equivalentesDelSaldo(estado, tasasRespaldo);
  const filas = vigentes.slice(-MAX_FILAS);
  // El saldo de arranque sale de restarle al saldo final lo que se muestra: así el total corrido siempre cierra
  let corrido = filas.reduce((saldo, m) => sumarDecimales(saldo, negar(m.monto)), estado.saldoFinal);
  const conSaldoAnterior = /[1-9]/.test(corrido);

  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  const altoCuadro = equivalentes.length ? SEPARACION_CUADRO + (equivalentes.length + 1) * ALTO_FILA : 0;
  lienzo.height = ALTO_CABEZA + (filas.length + (conSaldoAnterior ? 1 : 0) + 1) * ALTO_FILA + altoCuadro + 12;
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
    texto(m.descripcion ?? m.tipo, "referencia", medio, "#111827", false, m.cantidad_base ? 330 : 560);
    if (m.cantidad_base) texto(formatearMonto(m.cantidad_base), "cantidad", medio, colorMonto(m.cantidad_base));
    if (m.tasa) texto(m.tasa_es_porcentaje ? `${formatearMonto(multiplicarDecimales(m.tasa, "100", 6))}%` : formatearMonto(m.tasa), "tasa", medio, "#4b5563");
    texto(dinero(m.monto), "monto", medio, colorMonto(m.monto));
    texto(dinero(corrido), "total", medio, colorMonto(corrido), true);
    y += ALTO_FILA;
  });
  franja("Saldo pendiente", estado.saldoFinal);

  // Cuadrito debajo de la tabla: el saldo pendiente en dólares y en bolívares, a las tasas de sus movimientos
  if (equivalentes.length) {
    y += SEPARACION_CUADRO;
    const alto = (equivalentes.length + 1) * ALTO_FILA;
    c.fillStyle = "#f7f9fc";
    c.fillRect(MARGEN, y, ANCHO - MARGEN * 2, alto);
    c.strokeStyle = "#12305a";
    c.lineWidth = 2;
    c.strokeRect(MARGEN, y, ANCHO - MARGEN * 2, alto);
    c.font = `700 22px ${FUENTE}`;
    c.fillStyle = "#12305a";
    c.textAlign = "left";
    c.fillText("El saldo pendiente equivale a", MARGEN + 18, y + ALTO_FILA / 2);
    equivalentes.forEach((e, i) => {
      const medio = y + (i + 1) * ALTO_FILA + ALTO_FILA / 2;
      c.font = `400 22px ${FUENTE}`;
      c.fillStyle = "#4b5563";
      c.textAlign = "left";
      c.fillText(`${e.nombre} (tasa ${formatearMonto(e.tasa)})`, MARGEN + 18, medio);
      c.font = `700 24px ${FUENTE}`;
      c.fillStyle = colorMonto(e.monto);
      c.textAlign = "right";
      c.fillText(e.monto.startsWith("-") ? `- ${e.prefijo}${formatearMonto(e.monto.slice(1))}${e.sufijo}` : `${e.prefijo}${formatearMonto(e.monto)}${e.sufijo}`, ANCHO - MARGEN - 18, medio);
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
