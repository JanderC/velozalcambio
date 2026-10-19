import type { DatosComprobante } from "./ocrComprobante";
import type { ValoresTablero } from "../tasas/tablero";

/**
 * Los métodos de pago que llegan a Confirmaciones, reconocidos por la captura: cada uno con su medio (el botón de
 * arriba) y su comisión. Las comisiones se configuran en Tasas ("Comisiones por medio") y quedan para todos.
 */
export type Metodo = "NEQUI" | "BANCOLOMBIA" | "ZELLE" | "REMITLY" | "WESTERN_BANCOLOMBIA" | "WESTERN_TAQUILLA" | "PAGO_FACTURA" | "BANCOLOMBIA_INTERNACIONAL";

export const METODOS: { clave: Metodo; nombre: string; medio: string }[] = [
  { clave: "NEQUI", nombre: "Nequi", medio: "NEQUI" },
  { clave: "BANCOLOMBIA", nombre: "Bancolombia", medio: "BANCOLOMBIA" },
  { clave: "ZELLE", nombre: "Zelle", medio: "ZELLE" },
  { clave: "REMITLY", nombre: "Remitly", medio: "BANCOLOMBIA" },
  { clave: "WESTERN_BANCOLOMBIA", nombre: "Western a Bancolombia", medio: "WESTERN_UNION" },
  { clave: "WESTERN_TAQUILLA", nombre: "Western en taquilla", medio: "WESTERN_UNION" },
  { clave: "PAGO_FACTURA", nombre: "Pago de factura (Western)", medio: "WESTERN_UNION" },
  { clave: "BANCOLOMBIA_INTERNACIONAL", nombre: "Bancolombia internacional", medio: "BANCOLOMBIA" },
];
export const nombreMetodo = (m: Metodo) => METODOS.find((x) => x.clave === m)?.nombre ?? m;

/** ¿Qué es esta captura? Lo dice la IA si la leyó; si no, se busca en el texto leído en el navegador. */
export function detectarMetodo(d: DatosComprobante | null): Metodo | null {
  if (!d) return null;
  if (d.metodo && METODOS.some((m) => m.clave === d.metodo)) return d.metodo as Metodo;
  const t = `${d.texto ?? ""} ${d.banco ?? ""}`.toLowerCase();
  const ref = d.referencia ?? "";
  if (/remitly/.test(t) || (/^R\d{9,}$/.test(ref) && /usd/.test(t) && /cop/.test(t))) return "REMITLY";
  if (/efecty|orden de servicio|valor recibido/.test(t)) return "PAGO_FACTURA";
  if (/mtcn|c[oó]digo del giro|pago de giro|banco uni[oó]n/.test(t)) return "WESTERN_TAQUILLA";
  if (/total al destinatario|id de transferencia|importe de la transferencia/.test(t)) return "BANCOLOMBIA_INTERNACIONAL";
  if (/n[uú]mero de env[ií]o|importe enviado|obtiene/.test(t) || /^ES\d{8,}$/.test(ref)) return "WESTERN_BANCOLOMBIA";
  if (/western union/.test(t)) return "WESTERN_TAQUILLA";
  if (/zelle|safebalance|chase|bank of america|wells fargo|jpm|registrado como|inscrit[oa] como|estamos enviando tu dinero|lo recibir[aá] en unos minutos/.test(t)) return "ZELLE";
  if (/nequi|env[ií]o a banco|escanea este qr/.test(t) || /^M\d{7,}$/.test(ref)) return "NEQUI";
  if (/bancolombia|transferencia exitosa|producto destino|producto origen/.test(t)) return "BANCOLOMBIA";
  return null;
}

// ---------- Las comisiones de cada método (configurables en Tasas) ----------
export interface CampoComision {
  clave: string;
  etiqueta: string;
  porDefecto: string; // vacío: sin comisión fija (se escribe a mano)
  sufijo: string;
}
export const COMISIONES: { titulo: string; nota: string; campos: CampoComision[] }[] = [
  {
    titulo: "Nequi y Bancolombia (giros nacionales)",
    nota: "Desde el límite (en pesos) se cobra el % menor",
    campos: [
      { clave: "com.nacional.limite", etiqueta: "Límite", porDefecto: "100000", sufijo: "COP" },
      { clave: "com.nacional.menor", etiqueta: "Menos del límite", porDefecto: "5", sufijo: "%" },
      { clave: "com.nacional.mayor", etiqueta: "Desde el límite", porDefecto: "3", sufijo: "%" },
    ],
  },
  {
    titulo: "Zelle",
    nota: "Menos del límite (en dólares) se cobra el % mayor",
    campos: [
      { clave: "com.zelle.limite", etiqueta: "Límite", porDefecto: "300", sufijo: "USD" },
      { clave: "com.zelle.menor", etiqueta: "Menos del límite", porDefecto: "10", sufijo: "%" },
      { clave: "com.zelle.mayor", etiqueta: "Desde el límite", porDefecto: "6", sufijo: "%" },
    ],
  },
  {
    titulo: "Otros",
    nota: "Vacío: la comisión se escribe a mano en cada confirmación",
    campos: [
      { clave: "com.remitly", etiqueta: "Remitly", porDefecto: "", sufijo: "%" },
      { clave: "com.western", etiqueta: "Western (a Bancolombia y taquilla)", porDefecto: "", sufijo: "%" },
      { clave: "com.facturas", etiqueta: "Pago de facturas", porDefecto: "", sufijo: "%" },
      { clave: "com.internacional", etiqueta: "Bancolombia internacional", porDefecto: "", sufijo: "%" },
    ],
  },
];
const PORDEFECTO = Object.fromEntries(COMISIONES.flatMap((g) => g.campos.map((c) => [c.clave, c.porDefecto])));
export const valorComision = (v: ValoresTablero | undefined, clave: string) => {
  const x = v?.[clave];
  return x !== undefined ? x : (PORDEFECTO[clave] ?? "");
};

/**
 * La comisión que le toca a esta captura según su método y su monto: "5" (con la regla dicha en palabras), o null si
 * ese método no tiene comisión configurada.
 */
export function comisionPara(metodo: Metodo, monto: string | null, v: ValoresTablero | undefined): { pct: string; regla: string } | null {
  const n = monto ? Number(monto) : null;
  const num = (clave: string) => {
    const x = Number(valorComision(v, clave).replace(/%/g, "").replace(",", "."));
    return Number.isFinite(x) && valorComision(v, clave).trim() !== "" ? x : null;
  };
  const conLimite = (grupo: string, unidad: string) => {
    const limite = num(`com.${grupo}.limite`);
    const menor = num(`com.${grupo}.menor`);
    const mayor = num(`com.${grupo}.mayor`);
    if (limite === null || menor === null || mayor === null || n === null) return null;
    const arriba = n >= limite;
    const lim = unidad === "COP" ? `$${limite.toLocaleString("es-CO")}` : `${limite.toLocaleString("es-CO")} ${unidad}`;
    return { pct: String(arriba ? mayor : menor), regla: arriba ? `desde ${lim}` : `menos de ${lim}` };
  };
  const fija = (clave: string) => {
    const x = num(clave);
    return x === null ? null : { pct: String(x), regla: "comisión fija" };
  };
  switch (metodo) {
    case "NEQUI":
    case "BANCOLOMBIA":
      return conLimite("nacional", "COP");
    case "ZELLE":
      return conLimite("zelle", "USD");
    case "REMITLY":
      return fija("com.remitly");
    case "WESTERN_BANCOLOMBIA":
    case "WESTERN_TAQUILLA":
      return fija("com.western");
    case "PAGO_FACTURA":
      return fija("com.facturas");
    case "BANCOLOMBIA_INTERNACIONAL":
      return fija("com.internacional");
  }
}
