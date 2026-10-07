// El reporte de Cuentas por Cobrar como imagen, con la forma del Excel: una tabla por grupo
// (Nombre Cliente / Monto COP / TOTAL) y al final el resumen con el total de cada grupo.
import type { CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { detalleMoneda, dinero, enPesos, fechaDeHoy, totalEnPesos } from "./cobrar";

const FUENTE = '"Inter", "Segoe UI", Arial, sans-serif';
const NAVY = "#12305a";
const MARGEN = 36;
const ANCHO_COLUMNA = 470;
const SEPARACION = 26;
const ALTO_TITULO = 92;
const ALTO_CABEZA = 46;
const ALTO_ENCABEZADO = 34;
const ALTO_FILA = 40;
const ALTO_FILA_DOBLE = 56; // con el detalle de la moneda debajo del nombre
const POR_FILA = 3; // tablas por renglón, como en el Excel

export interface GrupoReporte {
  nombre: string;
  cuentas: CuentaCorrienteResumen[];
}

const altoDeFila = (c: CuentaCorrienteResumen) => (detalleMoneda(c) ? ALTO_FILA_DOBLE : ALTO_FILA);
const altoDeGrupo = (g: GrupoReporte) => ALTO_CABEZA + ALTO_ENCABEZADO + g.cuentas.reduce((s, c) => s + altoDeFila(c), 0) + (g.cuentas.length ? 0 : ALTO_FILA) + ALTO_FILA;

export function generarReporteCobrar(grupos: GrupoReporte[]): Promise<Blob> {
  const renglones: GrupoReporte[][] = [];
  for (let i = 0; i < grupos.length; i += POR_FILA) renglones.push(grupos.slice(i, i + POR_FILA));
  const columnas = Math.max(1, Math.min(POR_FILA, grupos.length));
  const ancho = MARGEN * 2 + columnas * ANCHO_COLUMNA + (columnas - 1) * SEPARACION;
  const altoResumen = ALTO_CABEZA + (grupos.length + 1) * ALTO_FILA;
  const alto = ALTO_TITULO + renglones.reduce((s, r) => s + Math.max(...r.map(altoDeGrupo)) + SEPARACION, 0) + altoResumen + MARGEN;

  const ESCALA = 2; // nítido al ampliarlo en el teléfono
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho * ESCALA;
  lienzo.height = alto * ESCALA;
  const c = lienzo.getContext("2d");
  if (!c) return Promise.reject(new Error("Este navegador no puede generar la imagen"));
  c.scale(ESCALA, ESCALA);
  c.textBaseline = "middle";
  c.fillStyle = "#f4f6f9";
  c.fillRect(0, 0, ancho, alto);

  // el texto que no entra se corta con puntos suspensivos
  const recortar = (texto: string, maximo: number) => {
    if (c.measureText(texto).width <= maximo) return texto;
    let t = texto;
    while (t.length > 1 && c.measureText(`${t}…`).width > maximo) t = t.slice(0, -1);
    return `${t}…`;
  };
  const escribir = (texto: string, x: number, y: number, o: { color?: string; peso?: number; tam?: number; derecha?: boolean; maximo?: number } = {}) => {
    c.font = `${o.peso ?? 400} ${o.tam ?? 17}px ${FUENTE}`;
    c.fillStyle = o.color ?? "#111827";
    c.textAlign = o.derecha ? "right" : "left";
    c.fillText(o.maximo ? recortar(texto, o.maximo) : texto, x, y);
  };

  // Título
  escribir("Cuentas por Cobrar", MARGEN, 38, { color: NAVY, peso: 800, tam: 30 });
  escribir(`Al ${fechaDeHoy()}`, MARGEN, 68, { color: "#5b6472", tam: 16 });
  const general = totalEnPesos(grupos.flatMap((g) => g.cuentas));
  escribir("TOTAL POR COBRAR", ancho - MARGEN, 32, { color: "#5b6472", peso: 700, tam: 13, derecha: true });
  escribir(`${dinero(general.total, "COP")} COP`, ancho - MARGEN, 62, { color: NAVY, peso: 800, tam: 28, derecha: true });

  const dibujarTabla = (x: number, y: number, titulo: string, encabezados: [string, string] | null, filas: { nombre: string; detalle: string | null; monto: string; negativo?: boolean; alto: number }[], total: string, vacio: string) => {
    const altoTabla = ALTO_CABEZA + (encabezados ? ALTO_ENCABEZADO : 0) + filas.reduce((s, f) => s + f.alto, 0) + (filas.length ? 0 : ALTO_FILA) + ALTO_FILA;
    c.fillStyle = "#ffffff";
    c.fillRect(x, y, ANCHO_COLUMNA, altoTabla);
    c.fillStyle = NAVY;
    c.fillRect(x, y, ANCHO_COLUMNA, ALTO_CABEZA);
    escribir(titulo, x + 16, y + ALTO_CABEZA / 2, { color: "#ffffff", peso: 700, tam: 18, maximo: ANCHO_COLUMNA - 32 });
    let cursor = y + ALTO_CABEZA;
    if (encabezados) {
      c.fillStyle = "#e9eef5";
      c.fillRect(x, cursor, ANCHO_COLUMNA, ALTO_ENCABEZADO);
      escribir(encabezados[0], x + 16, cursor + ALTO_ENCABEZADO / 2, { color: "#4b5563", peso: 700, tam: 12.5 });
      escribir(encabezados[1], x + ANCHO_COLUMNA - 16, cursor + ALTO_ENCABEZADO / 2, { color: "#4b5563", peso: 700, tam: 12.5, derecha: true });
      cursor += ALTO_ENCABEZADO;
    }
    if (!filas.length) {
      escribir(vacio, x + 16, cursor + ALTO_FILA / 2, { color: "#9ca3af", tam: 15 });
      cursor += ALTO_FILA;
    }
    filas.forEach((f, i) => {
      if (i % 2 === 1) {
        c.fillStyle = "#f8fafc";
        c.fillRect(x, cursor, ANCHO_COLUMNA, f.alto);
      }
      c.font = `600 17px ${FUENTE}`;
      const anchoMonto = c.measureText(f.monto).width;
      const maximoNombre = ANCHO_COLUMNA - 32 - anchoMonto - 14;
      if (f.detalle) {
        escribir(f.nombre, x + 16, cursor + 19, { maximo: maximoNombre });
        escribir(f.detalle, x + 16, cursor + 40, { color: "#6b7280", tam: 13, maximo: maximoNombre });
      } else {
        escribir(f.nombre, x + 16, cursor + f.alto / 2, { maximo: maximoNombre });
      }
      escribir(f.monto, x + ANCHO_COLUMNA - 16, cursor + (f.detalle ? 19 : f.alto / 2), { peso: 600, color: f.negativo ? "#b42318" : "#111827", derecha: true });
      cursor += f.alto;
    });
    c.fillStyle = "#fff6d6";
    c.fillRect(x, cursor, ANCHO_COLUMNA, ALTO_FILA);
    escribir("TOTAL", x + 16, cursor + ALTO_FILA / 2, { color: NAVY, peso: 800 });
    escribir(total, x + ANCHO_COLUMNA - 16, cursor + ALTO_FILA / 2, { color: NAVY, peso: 800, tam: 18, derecha: true });
    c.strokeStyle = "#d7dbe2";
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, ANCHO_COLUMNA - 1, altoTabla - 1);
  };

  // Una tabla por grupo
  let y = ALTO_TITULO;
  for (const renglon of renglones) {
    renglon.forEach((g, i) => {
      const filas = g.cuentas.map((cuenta) => {
        const pesos = enPesos(cuenta);
        return { nombre: cuenta.tercero_nombre, detalle: detalleMoneda(cuenta), monto: pesos === null ? "—" : dinero(pesos, "COP"), negativo: !!pesos?.startsWith("-"), alto: altoDeFila(cuenta) };
      });
      dibujarTabla(MARGEN + i * (ANCHO_COLUMNA + SEPARACION), y, `Cuentas por Cobrar ${g.nombre}`, ["NOMBRE CLIENTE", "MONTO COP"], filas, dinero(totalEnPesos(g.cuentas).total, "COP"), "Sin clientes");
    });
    y += Math.max(...renglon.map(altoDeGrupo)) + SEPARACION;
  }

  // El resumen: el total de cada grupo y el total general
  dibujarTabla(
    MARGEN,
    y,
    "Total por cobrar",
    null,
    grupos.map((g) => ({ nombre: g.nombre, detalle: null, monto: dinero(totalEnPesos(g.cuentas).total, "COP"), alto: ALTO_FILA })),
    dinero(general.total, "COP"),
    "Sin grupos"
  );
  // (con una sola columna no hay lugar al costado: la nota se omite)
  if (general.sinTasa > 0 && columnas > 1) {
    escribir(`${general.sinTasa} ${general.sinTasa === 1 ? "cliente no tiene" : "clientes no tienen"} tasa a pesos y no entran en el total.`, MARGEN + ANCHO_COLUMNA + SEPARACION, y + ALTO_CABEZA / 2, { color: "#9a3412", tam: 14 });
  }

  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("No se pudo generar la imagen"))), "image/png"));
}
