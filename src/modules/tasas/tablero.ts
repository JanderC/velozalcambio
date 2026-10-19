import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatearMonto } from "../../utils/montos";

/**
 * La "Tasa del día": las mismas tasas que se publican, para todo el sistema. Se cargan una vez (y cada minuto) y se
 * proponen en taquilla, Confirmaciones y cuentas; si en un movimiento se usa otra, se usa esa.
 */
export type ValoresTablero = Record<string, string>;
export interface Tablero {
  actual: { valores: ValoresTablero; actualizado: string; por: string | null } | null;
  anterior: { valores: ValoresTablero; actualizado: string } | null;
}

// Lo que tiene el tablero, en el orden en que se publica
export interface Casilla {
  clave: string;
  etiqueta: string;
  porcentaje?: boolean; // Western: es una comisión (5 %), no una tasa
}
export const DOLAR_COMPRA: Casilla[] = [
  { clave: "dolar.compra.100-50", etiqueta: "100-50" },
  { clave: "dolar.compra.20-10-5", etiqueta: "20-10-5" },
  { clave: "dolar.compra.1", etiqueta: "De 1" },
  { clave: "dolar.compra.deteriorado", etiqueta: "Deteriorado" },
];
export const DOLAR_VENTA: Casilla[] = [
  { clave: "dolar.venta.100-50", etiqueta: "100-50" },
  { clave: "dolar.venta.menor", etiqueta: "Menor DN" },
  { clave: "dolar.venta.bancolombia", etiqueta: "Bancolombia" },
];
export const EURO_COMPRA: Casilla[] = [
  { clave: "euro.compra.50-20-10-5", etiqueta: "50-20-10-5" },
  { clave: "euro.compra.200-100", etiqueta: "200-100" },
  { clave: "euro.compra.500", etiqueta: "500" },
];
export const EURO_VENTA: Casilla = { clave: "euro.venta", etiqueta: "Venta" };
export const OTRAS: { titulo: string; casillas: Casilla[] }[] = [
  { titulo: "Bs", casillas: [{ clave: "bs", etiqueta: "Bs" }] },
  { titulo: "Zelle", casillas: [{ clave: "zelle", etiqueta: "Zelle" }, { clave: "zelle.ajuste", etiqueta: "Ajuste", porcentaje: true }] },
  { titulo: "Western", casillas: [{ clave: "western", etiqueta: "Western", porcentaje: true }] },
  { titulo: "USDT", casillas: [{ clave: "usdt.compra", etiqueta: "Compra" }, { clave: "usdt.venta", etiqueta: "Venta" }] },
];

// ---------- leerlo una vez para todo el sistema ----------
let cache: Tablero | null = null;
let pedido: Promise<Tablero> | null = null;
const oyentes = new Set<(t: Tablero) => void>();
export function obtenerTablero(forzar = false): Promise<Tablero> {
  if (cache && !forzar) return Promise.resolve(cache);
  if (!pedido || forzar) {
    pedido = api
      .get<Tablero>("/tasas/tablero")
      .then((t) => {
        cache = t;
        oyentes.forEach((f) => f(t));
        return t;
      })
      .finally(() => {
        pedido = null;
      });
  }
  return pedido;
}
/** Al guardar el tablero (desde Tasas o desde una cuenta), todas las pantallas abiertas lo ven de una vez. */
export function avisarTablero(t: Tablero) {
  cache = t;
  oyentes.forEach((f) => f(t));
}
export function guardarTablero(valores: ValoresTablero) {
  return api.put<Tablero>("/tasas/tablero", { valores }).then((t) => (avisarTablero(t), t));
}
export function guardarUnaTasa(clave: string, valor: string) {
  return api.patch<Tablero>("/tasas/tablero", { clave, valor }).then((t) => (avisarTablero(t), t));
}

/** El tablero vigente; se refresca solo cada minuto. */
export function useTablero() {
  const [t, setT] = useState<Tablero | null>(cache);
  useEffect(() => {
    oyentes.add(setT);
    void obtenerTablero().catch(() => {});
    const i = setInterval(() => void obtenerTablero(true).catch(() => {}), 60_000);
    return () => {
      oyentes.delete(setT);
      clearInterval(i);
    };
  }, []);
  return t;
}

// ---------- leer los valores ----------
/** "3200" -> 3.200 · "5%" -> 5 · "-10%" -> -10 (como número, para comparar y calcular) */
export function numeroDe(v: string | undefined | null): number | null {
  if (!v) return null;
  // se guarda con punto decimal y sin miles ("3200", "3.5", "5%")
  const n = Number(v.replace(/%/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
/** Como se escribe en los formularios: 3.200 · 3,5 · 5 */
export function escrita(v: string | undefined | null) {
  const n = numeroDe(v);
  if (n === null) return "";
  const s = String(n);
  return formatearMonto(s.startsWith("-") ? s.slice(1) : s).replace(/^/, s.startsWith("-") ? "-" : "");
}
/** ¿Subió o bajó respecto a la versión anterior? */
export function tendencia(t: Tablero | null, clave: string): "sube" | "baja" | null {
  const a = numeroDe(t?.actual?.valores[clave]);
  const b = numeroDe(t?.anterior?.valores[clave]);
  if (a === null || b === null || a === b) return null;
  return a > b ? "sube" : "baja";
}

// ---------- qué tasa se propone en cada caso ----------
export interface Sugerencia {
  clave: string;
  etiqueta: string; // "Dólar venta 100-50"
  valor: string; // como se escribe en el formulario
  porcentaje: boolean;
  // sin nada que diga qué tasa es (ni medio, ni moneda, ni referencia): se muestran, pero no se ponen solas
  porDefecto?: boolean;
}
const NOMBRES: Record<string, string> = {
  "dolar.compra.100-50": "Dólar compra 100-50",
  "dolar.compra.20-10-5": "Dólar compra 20-10-5",
  "dolar.compra.1": "Dólar compra de 1",
  "dolar.compra.deteriorado": "Dólar deteriorado",
  "dolar.venta.100-50": "Dólar venta 100-50",
  "dolar.venta.menor": "Dólar venta menor",
  "dolar.venta.bancolombia": "Dólar Bancolombia",
  "euro.compra.50-20-10-5": "Euro compra 50-20-10-5",
  "euro.compra.200-100": "Euro compra 200-100",
  "euro.compra.500": "Euro compra 500",
  "euro.venta": "Euro venta",
  bs: "Bolívares",
  "zelle.ajuste": "Zelle (ajuste)",
  zelle: "Zelle",
  western: "Western",
  "usdt.compra": "USDT compra",
  "usdt.venta": "USDT venta",
};
export const nombreDeTasa = (clave: string) => NOMBRES[clave] ?? clave;

/**
 * Las tasas del día que aplican a un movimiento, la principal primero. Se decide por el medio (Confirmaciones), la
 * moneda de lo que llega o se entrega, si es compra o venta y lo que dice la referencia ("Venta de Zelle"…).
 */
export function sugerenciasDeTasa(
  t: Tablero | null,
  c: { medio?: string | null; moneda?: string | null; entrega?: string | null; venta?: boolean; referencia?: string; porcentaje?: boolean }
): Sugerencia[] {
  const v = t?.actual?.valores;
  if (!v) return [];
  const medio = (c.medio ?? "").toUpperCase();
  const ref = (c.referencia ?? "").toLowerCase();
  const monedas = [c.moneda, c.entrega].map((m) => (m ?? "").toUpperCase());
  // llega y se entrega en la misma moneda: no hay tasa que proponer
  if (c.moneda && c.entrega && monedas[0] === monedas[1] && !medio && !ref.trim()) return [];
  let porDefecto = false;
  let claves: string[];
  // en comisión %: Western (5 %) o el ajuste de Zelle (−10 %); en los demás no hay un % del día
  if (c.porcentaje) claves = medio === "ZELLE" || /zelle/.test(ref) ? ["zelle.ajuste"] : medio === "WESTERN_UNION" || /western/.test(ref) ? ["western"] : [];
  else if (medio === "ZELLE" || /zelle/.test(ref)) claves = ["zelle"];
  else if (medio === "WESTERN_UNION" || /western/.test(ref)) claves = ["western"];
  else if (medio === "USDT" || monedas.includes("USDT") || /usdt/.test(ref)) claves = c.venta ? ["usdt.venta", "usdt.compra"] : ["usdt.compra", "usdt.venta"];
  else if (medio === "BOLIVARES" || monedas.includes("VES") || /\bbs\b|bss|bol[ií]var/.test(ref)) claves = ["bs"];
  else if (monedas.includes("EUR") || /euro/.test(ref))
    claves = c.venta ? ["euro.venta", ...EURO_COMPRA.map((x) => x.clave)] : [...EURO_COMPRA.map((x) => x.clave), "euro.venta"];
  // por Bancolombia o Nequi llegan pesos: hay tasa si se entregan dólares (los bolívares ya salieron arriba)
  else if (medio === "BANCOLOMBIA" || medio === "NEQUI") claves = monedas.includes("USD") ? ["dolar.venta.bancolombia", "dolar.venta.100-50"] : [];
  else if (monedas.includes("USD") || /d[oó]lar|usd/.test(ref))
    claves = c.venta ? [...DOLAR_VENTA.map((x) => x.clave), ...DOLAR_COMPRA.map((x) => x.clave)] : [...DOLAR_COMPRA.map((x) => x.clave), ...DOLAR_VENTA.map((x) => x.clave)];
  else {
    porDefecto = true;
    claves = c.venta ? ["dolar.venta.100-50", "dolar.compra.100-50", "bs", "zelle", "usdt.venta"] : ["dolar.compra.100-50", "dolar.venta.100-50", "bs", "zelle", "usdt.compra"];
  }
  return claves
    .filter((k) => numeroDe(v[k]) !== null)
    .map((k) => {
      const porcentaje = /%/.test(v[k] ?? "") || k === "western";
      // un % se usa como comisión: sin el signo (el −10 % de Zelle es una comisión de 10)
      return { clave: k, etiqueta: nombreDeTasa(k), valor: porcentaje ? escrita(v[k]).replace(/^-/, "") : escrita(v[k]), porcentaje, porDefecto };
    });
}

// ---------- ¿guardar la tasa que se cambió a mano? (se pregunta una vez y se recuerda la respuesta) ----------
export type PreferenciaTasa = "preguntar" | "guardar" | "no-guardar";
const clavePref = (usuarioId: number) => `tasa-dia-preferencia-${usuarioId}`;
export function preferenciaTasa(usuarioId: number): PreferenciaTasa {
  try {
    const v = localStorage.getItem(clavePref(usuarioId));
    return v === "guardar" || v === "no-guardar" ? v : "preguntar";
  } catch {
    return "preguntar";
  }
}
export function recordarPreferenciaTasa(usuarioId: number, p: PreferenciaTasa) {
  try {
    if (p === "preguntar") localStorage.removeItem(clavePref(usuarioId));
    else localStorage.setItem(clavePref(usuarioId), p);
  } catch {
    // sin almacenamiento: se vuelve a preguntar
  }
}
