// Lectura de comprobantes. Primero se le pide a la IA del servidor (mucho más precisa con capturas de Zelle);
// si no está configurada o falla, se lee en el propio navegador (OCR), sin IA ni claves: se saca el texto
// de la imagen y se busca en él el monto, el número de referencia y la fecha.
import { ApiError } from "../../api/client";
import { leerComprobanteConIA } from "../../api/cuentasCorrientes.api";

export interface DatosComprobante {
  referencia: string | null;
  monto: string | null; // decimal normalizado: "1250000" o "403.5"
  moneda: string | null; // COP, USD, VES, EUR, USDT
  fecha: string | null; // AAAA-MM-DD
  banco: string | null;
  remitente: string | null;
  destinatario?: string | null; // a quién se le envió
  fuente?: "ia" | "local"; // quién la leyó: la IA del servidor o el lector del navegador
}

// El motor de OCR pesa unos MB: se carga la primera vez que se usa y queda listo para las siguientes
type Lector = { recognize: (imagen: File) => Promise<{ data: { text: string } }> };
let lector: Promise<Lector> | null = null;
function obtenerLector() {
  lector ??= import("tesseract.js")
    .then(({ createWorker }) => createWorker(["spa", "eng"]) as unknown as Promise<Lector>)
    .catch((e) => {
      lector = null; // que el próximo intento vuelva a probar
      throw e;
    });
  return lector;
}

/** "1.250.000,50", "1,250,000.50" o "403.5" -> "1250000.5" / "403.5". null si no es un número. */
export function normalizarMonto(crudo: string): string | null {
  let s = crudo.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!/\d/.test(s)) return null;
  const separador = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  // El último separador es decimal solo si deja 1 o 2 dígitos detrás; si deja 3, es de miles
  const decimales = separador >= 0 ? s.length - separador - 1 : 0;
  if (separador >= 0 && decimales >= 1 && decimales <= 2) s = `${s.slice(0, separador).replace(/[.,]/g, "")}.${s.slice(separador + 1)}`;
  else s = s.replace(/[.,]/g, "");
  const limpio = s.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return /[1-9]/.test(limpio) ? limpio : null;
}

const NUMERO = String.raw`\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MONEDA = String.raw`US\$|USDT|USD|COP|VES|EUR|Bs\.?S?\.?|\$|€`;

// Pantallas de Zelle dentro de la app del banco: no siempre dicen "Zelle", pero sí el banco o "Inscrito como"
const BANCO_DE_EEUU = /bank of america|merrill|chase|wells fargo|citibank|capital one|truist|pnc bank|td bank|us bank|navy federal|inscrit[oa] como|enrolled as|enrolled with/i;

function monedaDe(simbolo: string | undefined, texto: string): string | null {
  const s = (simbolo ?? "").toUpperCase();
  if (s.startsWith("BS") || s === "VES") return "VES";
  if (s === "USDT") return "USDT";
  if (s === "USD" || s === "US$") return "USD";
  if (s === "COP") return "COP";
  if (s === "EUR" || s === "€") return "EUR";
  // Solo "$": se decide por lo que diga el resto del comprobante
  if (/usdt|binance/i.test(texto)) return "USDT";
  if (/zelle|usd|d[oó]lar/i.test(texto) || BANCO_DE_EEUU.test(texto)) return "USD";
  if (/bancolombia|nequi|daviplata|cop|pesos/i.test(texto)) return "COP";
  if (/bol[ií]var|pago m[oó]vil|banco de venezuela|banesco|mercantil/i.test(texto)) return "VES";
  return null;
}

function buscarMonto(lineas: string[], texto: string): { monto: string | null; moneda: string | null } {
  const conMoneda = new RegExp(String.raw`(${MONEDA})\s*(${NUMERO})|(${NUMERO})\s*(${MONEDA})`, "i");
  const clave = /monto|valor|total|importe|cantidad|amount|enviaste|recibiste|transferiste|pagaste|cu[aá]nto|env[ií]o de|you sent|sent/i;
  const candidatos: { monto: string; moneda: string | null; peso: number }[] = [];
  lineas.forEach((linea, i) => {
    // el monto puede venir en la misma línea que su etiqueta o en la siguiente
    const etiquetada = clave.test(linea) || (i > 0 && clave.test(lineas[i - 1]!) && !/\d/.test(lineas[i - 1]!));
    const m = conMoneda.exec(linea);
    if (m) {
      const monto = normalizarMonto(m[2] ?? m[3] ?? "");
      if (monto) candidatos.push({ monto, moneda: monedaDe(m[1] ?? m[4], texto), peso: etiquetada ? 3 : 2 });
    } else if (etiquetada) {
      const suelto = new RegExp(NUMERO).exec(linea.replace(clave, ""));
      const monto = suelto ? normalizarMonto(suelto[0]) : null;
      if (monto) candidatos.push({ monto, moneda: monedaDe(undefined, texto), peso: 1 });
    }
  });
  // Gana el mejor etiquetado; entre iguales, el más grande (comisiones y saldos de impuestos son menores)
  candidatos.sort((a, b) => b.peso - a.peso || Number(b.monto) - Number(a.monto));
  return candidatos[0] ? { monto: candidatos[0].monto, moneda: candidatos[0].moneda } : { monto: null, moneda: null };
}

function buscarReferencia(lineas: string[]): string | null {
  const clave = /referencia|ref\b\.?|comprobante|confirmaci[oó]n|confirmation|aprobaci[oó]n|n[uú]mero de (?:operaci[oó]n|transacci[oó]n|documento|recibo)|n[°ºo]\.? ?de (?:operaci[oó]n|transacci[oó]n)|operaci[oó]n|transaction id|id de (?:la )?transacci[oó]n|c[oó]digo|order id|orden|mtcn/i;
  const codigo = /[A-Z0-9][A-Z0-9-]{3,}/gi;
  // un código sirve si tiene 3 dígitos seguidos, o mezcla letras y números con 6 o más caracteres ("e8kau6vdn")
  const valido = (c: string) =>
    !/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(c) && (/\d{3,}/.test(c) || (c.length >= 6 && /\d/.test(c) && /[a-z]/i.test(c) && !/^\d+(?:st|nd|rd|th|am|pm)$/i.test(c)));
  // un número escrito con guiones ("749-924-0661") queda solo con los dígitos
  const limpiar = (c: string) => (/^[\d-]+$/.test(c) ? c.replace(/-/g, "") : c.replace(/^-+|-+$/g, ""));
  const en = (donde: string) => {
    const c = (donde.match(codigo) ?? []).find(valido);
    return c ? limpiar(c) : null;
  };
  // La etiqueta partida en dos renglones, con el código al lado del primero:
  //   "Número de        e8kau6vdn"
  //   "confirmación"
  const inicioPartido = /^(?:n[uú]mero|n[°ºo]\.?|c[oó]digo|id)\s+de\b|^(?:confirmation|reference|transaction)\b/i;
  const finPartido = /^(?:confirmaci[oó]n|referencia|transacci[oó]n|operaci[oó]n|aprobaci[oó]n|number|n[uú]mero|id)\b/i;
  for (let i = 0; i < lineas.length - 1; i++) {
    if (!inicioPartido.test(lineas[i]!) || !finPartido.test(lineas[i + 1]!)) continue;
    const encontrado = en(lineas[i]!.replace(inicioPartido, "")) ?? en(lineas[i + 1]!.replace(finPartido, ""));
    if (encontrado) return encontrado;
  }
  for (let i = 0; i < lineas.length; i++) {
    const partes = lineas[i]!.split(clave);
    if (partes.length < 2) continue;
    // lo que sigue a la etiqueta en la misma línea, o la línea de abajo
    for (const donde of [partes[partes.length - 1] ?? "", lineas[i + 1] ?? ""]) {
      const encontrado = en(donde);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

/** A quién se le envió: "A IRIS RAMIREZ", "Para ...", "Inscrito como ...". */
function buscarDestinatario(lineas: string[]): string | null {
  for (const linea of lineas) {
    const m = /^(?:[Ii]nscrit[oa] como|[Ee]nrolled as|[Ee]nviado a|[Ss]ent to|[Pp]ara|[Tt]o|[Aa])\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.' -]{3,})/.exec(linea);
    // solo nombres en mayúsculas: así no se confunde con una frase que empiece con "A" o "Para"
    const nombre = m?.[1]?.replace(/[^A-ZÁÉÍÓÚÑ.' -].*$/, "").trim();
    if (nombre && nombre.split(/\s+/).length >= 2) return nombre;
  }
  return null;
}

const MESES: Record<string, number> = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

function buscarFecha(texto: string): string | null {
  const iso = (a: number, m: number, d: number) => {
    const anio = a < 100 ? 2000 + a : a;
    if (m < 1 || m > 12 || d < 1 || d > 31 || anio < 2020 || anio > 2100) return null;
    return `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(texto);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(texto); // día/mes/año, como se escribe acá
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /\b(\d{1,2})\s*(?:de\s+)?([a-zñ]{3})[a-zñ]*\.?\s*(?:de\s+|,\s*)?(\d{4})\b/i.exec(texto); // 12 de octubre de 2026
  if (m && MESES[m[2]!.toLowerCase()]) return iso(Number(m[3]), MESES[m[2]!.toLowerCase()]!, Number(m[1]));
  m = /\b([a-zñ]{3})[a-zñ]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(texto); // Oct 12, 2026
  if (m && MESES[m[1]!.toLowerCase()]) return iso(Number(m[3]), MESES[m[1]!.toLowerCase()]!, Number(m[2]));
  return null;
}

function buscarBanco(texto: string): string | null {
  const bancos = ["Zelle", "Bancolombia", "Nequi", "Daviplata", "Binance", "Western Union", "Banco de Venezuela", "Banesco", "Mercantil", "Provincial", "Pago Móvil"];
  return bancos.find((b) => new RegExp(b.replace("ó", "[oó]"), "i").test(texto)) ?? (BANCO_DE_EEUU.test(texto) ? "Zelle" : null);
}

/** Saca los datos del texto ya leído de un comprobante. Separado del OCR para poder probarlo. */
export function extraerDatos(texto: string): DatosComprobante {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const { monto, moneda } = buscarMonto(lineas, texto);
  return { referencia: buscarReferencia(lineas), monto, moneda, fecha: buscarFecha(texto), banco: buscarBanco(texto), remitente: null, destinatario: buscarDestinatario(lineas) };
}

/** Lee la imagen de un comprobante en el navegador (OCR): referencia, monto y fecha de la transacción. */
async function leerEnElNavegador(imagen: File): Promise<DatosComprobante> {
  let texto: string;
  try {
    texto = (await (await obtenerLector()).recognize(imagen)).data.text;
  } catch {
    throw new Error("No se pudo leer la imagen. Revisá la conexión (el lector se descarga la primera vez) y probá de nuevo.");
  }
  return extraerDatos(texto);
}

/** Achica la captura antes de mandarla a la IA: viaja más rápido y entra en el límite de tamaño. */
async function achicar(imagen: File, ladoMaximo = 1600): Promise<File> {
  try {
    const mapa = await createImageBitmap(imagen);
    const escala = Math.min(1, ladoMaximo / Math.max(mapa.width, mapa.height));
    if (escala === 1 && imagen.size < 1_500_000) return imagen;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(mapa.width * escala);
    lienzo.height = Math.round(mapa.height * escala);
    const c = lienzo.getContext("2d");
    if (!c) return imagen;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", 0.88));
    return blob ? new File([blob], "comprobante.jpg", { type: "image/jpeg" }) : imagen;
  } catch {
    return imagen; // si el navegador no puede, va tal cual
  }
}

/**
 * Prepara la captura para el OCR: la agranda si es chica (las letras pequeñas se leen mal), la pasa a grises con más
 * contraste y, si es una pantalla en modo oscuro (letras claras sobre fondo oscuro), la invierte. null si no hizo falta
 * o el navegador no puede.
 */
async function prepararParaOcr(imagen: File): Promise<File | null> {
  try {
    const mapa = await createImageBitmap(imagen);
    const escala = Math.min(2.5, Math.max(1, 1500 / mapa.width));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(mapa.width * escala);
    lienzo.height = Math.round(mapa.height * escala);
    // un lienzo demasiado grande tumba el navegador en teléfonos: ahí se deja la imagen como está
    if (lienzo.width * lienzo.height > 16_000_000) return null;
    const c = lienzo.getContext("2d", { willReadFrequently: true });
    if (!c) return null;
    c.imageSmoothingQuality = "high";
    c.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const datos = c.getImageData(0, 0, lienzo.width, lienzo.height);
    const px = datos.data;
    let suma = 0;
    for (let i = 0; i < px.length; i += 4) {
      const gris = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
      px[i] = gris;
      suma += gris;
    }
    const oscura = suma / (px.length / 4) < 110;
    if (!oscura && escala === 1) return null; // captura normal y grande: el OCR la lee bien tal cual
    for (let i = 0; i < px.length; i += 4) {
      let gris = oscura ? 255 - px[i]! : px[i]!;
      gris = Math.max(0, Math.min(255, (gris - 128) * 1.35 + 128)); // un poco más de contraste
      px[i] = px[i + 1] = px[i + 2] = gris;
    }
    c.putImageData(datos, 0, 0);
    const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/png"));
    return blob ? new File([blob], "comprobante-ocr.png", { type: "image/png" }) : null;
  } catch {
    return null;
  }
}

const cuantos = (d: DatosComprobante) => [d.referencia, d.monto, d.fecha].filter(Boolean).length;

/** Lectura local blindada: se lee la captura preparada y, si no sale monto y referencia, también la original; queda la mejor. */
async function leerLocal(imagen: File): Promise<DatosComprobante> {
  const preparada = await prepararParaOcr(imagen);
  if (!preparada) return leerEnElNavegador(imagen);
  const a = await leerEnElNavegador(preparada).catch(() => null);
  if (a && a.monto && a.referencia) return a;
  const b = await leerEnElNavegador(imagen).catch(() => null);
  if (!a && !b) throw new Error("No se pudo leer la imagen. Revisá la conexión (el lector se descarga la primera vez) y probá de nuevo.");
  if (!a || !b) return (a ?? b)!;
  const [mejor, otro] = cuantos(b) > cuantos(a) ? [b, a] : [a, b];
  return {
    referencia: mejor.referencia ?? otro.referencia,
    monto: mejor.monto ?? otro.monto,
    moneda: mejor.moneda ?? otro.moneda,
    fecha: mejor.fecha ?? otro.fecha,
    banco: mejor.banco ?? otro.banco,
    remitente: mejor.remitente ?? otro.remitente,
    destinatario: mejor.destinatario ?? otro.destinatario,
  };
}

// Si el servidor dice que la IA no está disponible (501), no se le vuelve a preguntar por un rato
let iaPausadaHasta = 0;
const ESPERA_IA_MS = 14_000;

/**
 * Lee la imagen de un comprobante: referencia, monto, moneda y fecha de la transacción.
 * Se piden las dos lecturas a la vez: la IA del servidor y la lectura local en el navegador. Si la IA responde con
 * monto y referencia, gana ella; si no está configurada, falla, tarda demasiado o le falta algo, se usa la local
 * (y lo que una no vio se completa con la otra). Así la lectura nunca depende de que la IA esté disponible.
 */
export async function leerComprobante(imagen: File): Promise<DatosComprobante> {
  const local = leerLocal(imagen).then(
    (d) => ({ d, error: null as Error | null }),
    (e: unknown) => ({ d: null, error: e as Error })
  );
  let deLaIA: DatosComprobante | null = null;
  if (Date.now() >= iaPausadaHasta) {
    try {
      deLaIA = await Promise.race([
        achicar(imagen).then(leerComprobanteConIA),
        new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("la IA tardó demasiado")), ESPERA_IA_MS)),
      ]);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 501 || e.status === 403)) iaPausadaHasta = Date.now() + 5 * 60_000;
    }
  }
  if (deLaIA && deLaIA.monto && deLaIA.referencia) return { ...deLaIA, fuente: "ia" };
  const { d: delNavegador, error } = await local;
  if (!deLaIA) {
    if (!delNavegador) throw error ?? new Error("No se pudo leer la imagen.");
    return { ...delNavegador, fuente: "local" };
  }
  if (!delNavegador) return { ...deLaIA, fuente: "ia" };
  return {
    referencia: deLaIA.referencia ?? delNavegador.referencia,
    monto: deLaIA.monto ?? delNavegador.monto,
    moneda: deLaIA.moneda ?? delNavegador.moneda,
    fecha: deLaIA.fecha ?? delNavegador.fecha,
    banco: deLaIA.banco ?? delNavegador.banco,
    remitente: deLaIA.remitente ?? delNavegador.remitente,
    destinatario: deLaIA.destinatario ?? delNavegador.destinatario,
    fuente: "ia",
  };
}
