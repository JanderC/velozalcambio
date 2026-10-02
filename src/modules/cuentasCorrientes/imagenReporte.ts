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
  cantidad: [640, "right"],
  tasa: [740, "right"],
  monto: [900, "right"],
  total: [ANCHO - MARGEN, "right"],
} as const;

const negar = (v: string) => (v.startsWith("-") ? v.slice(1) : /[1-9]/.test(v) ? `-${v}` : v);

/**
 * La hoja como imagen para mandarle al cliente: solo los movimientos y el saldo.
 * Sin nombre del cliente ni nada del sistema, y sin los movimientos anulados.
 */
export function generarImagenReporte(estado: EstadoCuenta, simbolo: string): Promise<Blob> {
  const vigentes = estado.movimientos.filter((m) => !m.anulado);
  const filas = vigentes.slice(-MAX_FILAS);
  // El saldo de arranque sale de restarle al saldo final lo que se muestra: así el total corrido siempre cierra
  let corrido = filas.reduce((saldo, m) => sumarDecimales(saldo, negar(m.monto)), estado.saldoFinal);
  const conSaldoAnterior = /[1-9]/.test(corrido);

  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO_CABEZA + (filas.length + (conSaldoAnterior ? 1 : 0) + 1) * ALTO_FILA + 12;
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

  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("No se pudo generar la imagen"))), "image/png"));
}

/** En el teléfono abre el menú de compartir (WhatsApp, etc.) con la imagen; en el computador la descarga. */
export async function compartirImagen(blob: Blob, nombreArchivo: string) {
  const archivo = new File([blob], nombreArchivo, { type: "image/png" });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e; // cerrar el menú sin compartir no es un error
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
