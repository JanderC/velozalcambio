// Un cliente puede mandar el monto en varias transferencias (varias capturas): se leen todas, se suman los montos,
// se juntan las referencias y las imágenes quedan guardadas juntas con el movimiento.
import { codigosDeReferencia } from "../../api/cuentasCorrientes.api";
import { sumarDecimales } from "../../utils/montos";
import { leerComprobante, type DatosComprobante } from "./ocrComprobante";

export interface LecturaCapturas {
  aceptadas: File[]; // las capturas nuevas (sin las que ya estaban cargadas)
  primera: DatosComprobante | null; // lo leído de la primera aceptada: quién envió, fecha
  referencias: string[]; // la referencia de cada captura aceptada
  total: string | null; // la suma de los montos leídos
  moneda: string | null;
  conIA: boolean; // todas las capturas aceptadas las leyó la IA del servidor
  repetidas: number; // capturas que ya estaban cargadas (misma referencia): no se suman dos veces
}

/** Lee las capturas una por una. yaEscrito: las referencias que ya están cargadas en el formulario. */
export async function leerCapturas(archivos: File[], yaEscrito: string): Promise<LecturaCapturas> {
  const vistas = new Set(codigosDeReferencia(yaEscrito).map((c) => c.toLowerCase()));
  const r: LecturaCapturas = { aceptadas: [], primera: null, referencias: [], total: null, moneda: null, conIA: true, repetidas: 0 };
  for (const archivo of archivos) {
    const d = await leerComprobante(archivo);
    const clave = d.referencia?.toLowerCase();
    if (clave && vistas.has(clave)) {
      r.repetidas++;
      continue;
    }
    if (clave) vistas.add(clave);
    r.aceptadas.push(archivo);
    if (d.fuente !== "ia") r.conIA = false;
    r.primera ??= d;
    if (d.referencia) r.referencias.push(d.referencia);
    if (d.monto) r.total = r.total ? sumarDecimales(r.total, d.monto) : d.monto;
    r.moneda ??= d.moneda;
  }
  if (!r.aceptadas.length) r.conIA = false;
  return r;
}

function cargarImagen(archivo: File) {
  return new Promise<HTMLImageElement>((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolver(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("No se pudo abrir una de las imágenes."));
    };
    imagen.src = url;
  });
}

/** Varias capturas quedan en una sola imagen, una debajo de la otra. Una sola se devuelve tal cual. */
export async function unirImagenes(archivos: File[]): Promise<File> {
  if (archivos.length === 1) return archivos[0]!;
  const imagenes = await Promise.all(archivos.map(cargarImagen));
  const SEPARACION = 12;
  let ancho = Math.min(1100, Math.max(...imagenes.map((i) => i.naturalWidth)));
  const altoCon = (a: number) => imagenes.reduce((suma, i) => suma + Math.round((i.naturalHeight * a) / i.naturalWidth), 0) + SEPARACION * (imagenes.length - 1);
  // muchas capturas largas: se achica para que el lienzo no se pase de lo que aguanta el navegador
  const ALTO_MAXIMO = 14000;
  if (altoCon(ancho) > ALTO_MAXIMO) ancho = Math.max(400, Math.floor((ancho * ALTO_MAXIMO) / altoCon(ancho)));
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = altoCon(ancho);
  const c = lienzo.getContext("2d");
  if (!c) throw new Error("Este navegador no puede unir las imágenes.");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, lienzo.width, lienzo.height);
  let y = 0;
  for (const i of imagenes) {
    const alto = Math.round((i.naturalHeight * ancho) / i.naturalWidth);
    c.drawImage(i, 0, y, ancho, alto);
    y += alto + SEPARACION;
  }
  const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", 0.82));
  if (!blob) throw new Error("No se pudieron unir las imágenes.");
  return new File([blob], "comprobantes.jpg", { type: "image/jpeg" });
}
