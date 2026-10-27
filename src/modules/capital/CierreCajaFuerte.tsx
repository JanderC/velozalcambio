import { Plus, X } from "lucide-react";
import { formatearMonto, leerNumero } from "../../utils/montos";
import { conPuntos } from "./CuadroBancos";

/*
 * El cierre de la Caja Fuerte: todo se escribe a mano (el USDT también, en sus filas). Lo que el sistema sabe sale al lado como
 * sugerencia ("sistema: $…"), y con tocarlo se copia en la casilla; pero lo que cuenta es lo que se escribe.
 */

export interface FilaCierre {
  nombre: string;
  cantidad: string; // como se escribe: "15.000" · "1.234,56"
  tasa: string; // vacía: la tasa de referencia (o 1 si es en pesos)
}
export interface CierreManual {
  cop: string;
  usd: string;
  tasaUsd: string;
  eur: string;
  tasaEur: string;
  porCobrar: string;
  bancolombia: string;
  bolivares: string; // ya en pesos
  pagarFuera: string;
  cobrarFuera: string;
  usdt: FilaCierre[];
  otras: FilaCierre[];
}
export const filaCierre = (nombre = ""): FilaCierre => ({ nombre, cantidad: "", tasa: "" });
export const CIERRE_INICIAL: CierreManual = {
  cop: "",
  usd: "",
  tasaUsd: "",
  eur: "",
  tasaEur: "",
  porCobrar: "",
  bancolombia: "",
  bolivares: "",
  pagarFuera: "",
  cobrarFuera: "",
  usdt: [filaCierre("USDT 1"), filaCierre("USDT 2"), filaCierre("USDT 3")],
  otras: [filaCierre()],
};

const num = (texto: string | undefined) => {
  const n = texto && texto.trim() ? leerNumero(texto) : null;
  return n ? Number(n) : 0;
};
const pesos = (n: number) => `${n < 0 ? "−" : ""}$${formatearMonto(String(Math.round(Math.abs(n))))}`;
const conDecimales = (n: number) => `${n < 0 ? "−" : ""}${formatearMonto(Math.abs(n).toFixed(2))}`;
// un número del sistema escrito como se escribe a mano (para copiarlo en la casilla)
const comoEscrito = (n: number, decimales: boolean) => conPuntos(decimales ? n.toFixed(2).replace(".", ",") : String(Math.round(n)));

type Clave = "cop" | "usd" | "eur" | "porCobrar" | "bancolombia" | "bolivares" | "pagarFuera" | "cobrarFuera";
export interface Sugerencias {
  cop: number;
  usd: number;
  eur: number;
  porCobrar: number;
  bancolombia: number;
  bolivares: number;
  pagarFuera: number;
  cobrarFuera: number;
}

/** Las casillas fijas del cierre, en el orden en que se cuentan. */
const FIJAS: { clave: Clave; nombre: string; moneda: "COP" | "USD" | "EUR"; resta?: boolean }[] = [
  { clave: "cop", nombre: "Saldo en pesos", moneda: "COP" },
  { clave: "usd", nombre: "Saldo en dólares", moneda: "USD" },
  { clave: "eur", nombre: "Saldo en euros", moneda: "EUR" },
  { clave: "porCobrar", nombre: "Por cobrar", moneda: "COP" },
  { clave: "bancolombia", nombre: "Bancolombia (total)", moneda: "COP" },
  { clave: "bolivares", nombre: "Bolívares (total en pesos)", moneda: "COP" },
  { clave: "pagarFuera", nombre: "Por pagar fuera del sistema", moneda: "COP", resta: true },
  { clave: "cobrarFuera", nombre: "Por cobrar fuera del sistema", moneda: "COP" },
];

/** Cada renglón del cierre en pesos (el total y lo que se guarda con el cuadre salen de acá). */
export function cuentasDelCierre(c: CierreManual, tasaDolar: number, tasaEuro: number) {
  const tasaDe = (clave: Clave) => (clave === "usd" ? num(c.tasaUsd) || tasaDolar : clave === "eur" ? num(c.tasaEur) || tasaEuro : 1);
  const fijas = FIJAS.map((f) => {
    const cantidad = num(c[f.clave]);
    const tasa = tasaDe(f.clave);
    return { ...f, cantidad, tasa, pesos: cantidad * tasa * (f.resta ? -1 : 1) };
  });
  const usdt = c.usdt.map((f) => ({ cantidad: num(f.cantidad), tasa: num(f.tasa) || tasaDolar })).map((f) => ({ ...f, pesos: f.cantidad * f.tasa }));
  const otras = c.otras.map((f) => ({ cantidad: num(f.cantidad), tasa: num(f.tasa) || 1 })).map((f) => ({ ...f, pesos: f.cantidad * f.tasa }));
  const total = [...fijas, ...usdt, ...otras].reduce((s, f) => s + f.pesos, 0);
  return { fijas, usdt, otras, total };
}

/** Cierre de la Caja Fuerte: saldo en pesos, dólares y euros, por cobrar, bancos, bolívares, USDT y otras, todo a mano. */
export function CierreCajaFuerte({
  valor,
  onCambio,
  soloLectura,
  tasaDolar,
  tasaEuro,
  sugerencias,
}: {
  valor: CierreManual;
  onCambio: (c: CierreManual) => void;
  soloLectura: boolean;
  tasaDolar: number;
  tasaEuro: number;
  sugerencias: Sugerencias | null;
}) {
  const c = cuentasDelCierre(valor, tasaDolar, tasaEuro);
  const poner = (cambio: Partial<CierreManual>) => onCambio({ ...valor, ...cambio });
  const cambiarFila = (lista: "usdt" | "otras", i: number, cambio: Partial<FilaCierre>) => poner({ [lista]: valor[lista].map((f, j) => (j === i ? { ...f, ...cambio } : f)) });
  const quitarFila = (lista: "usdt" | "otras", i: number) => {
    const nueva = valor[lista].filter((_, j) => j !== i);
    poner({ [lista]: nueva.length ? nueva : [filaCierre()] });
  };
  const simbolo = (m: "COP" | "USD" | "EUR") => (m === "EUR" ? "€" : "$");

  const filaLibre = (lista: "usdt" | "otras", f: FilaCierre, i: number) => {
    const calc = (lista === "usdt" ? c.usdt : c.otras)[i]!;
    return (
      <tr key={`${lista}-${i}`}>
        <td>
          <input
            value={f.nombre}
            onChange={(e) => cambiarFila(lista, i, { nombre: e.target.value })}
            placeholder={lista === "usdt" ? "Cuenta USDT" : "Otra (ej. Caja 1 sencillo)"}
            disabled={soloLectura}
            aria-label="Nombre"
          />
        </td>
        <td className="num">
          <input value={f.cantidad} onChange={(e) => cambiarFila(lista, i, { cantidad: conPuntos(e.target.value) })} inputMode="decimal" placeholder={lista === "usdt" ? "USDT 0" : "$ 0"} disabled={soloLectura} aria-label="Cantidad" />
        </td>
        <td className="num">
          <input
            value={f.tasa}
            onChange={(e) => cambiarFila(lista, i, { tasa: conPuntos(e.target.value) })}
            inputMode="decimal"
            placeholder={lista === "usdt" ? (tasaDolar ? formatearMonto(String(tasaDolar)) : "tasa") : "1"}
            disabled={soloLectura}
            aria-label="Tasa"
          />
        </td>
        <td className="num cap-calculado">{calc.cantidad ? pesos(calc.pesos) : "—"}</td>
        <td className="cap-quitar">
          {!soloLectura && (
            <button type="button" onClick={() => quitarFila(lista, i)} aria-label="Quitar esta fila" title="Quitar">
              <X size={13} />
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <section className="cap-bloque oscuro ancho cap-cierre-cf">
      <h2>Cierre Caja Fuerte</h2>
      <div className="cap-tabla">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="num">Cantidad</th>
              <th className="num">Tasa</th>
              <th className="num">Pesos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.fijas.map((f) => {
              const sug = sugerencias?.[f.clave];
              const conTasa = f.clave === "usd" || f.clave === "eur";
              return (
                <tr key={f.clave} className={f.resta ? "cap-cierre-resta" : ""}>
                  <td>
                    {f.nombre}
                    {f.resta && <small> (resta)</small>}
                    {!soloLectura && sug ? (
                      <button type="button" className="cap-sugerido" onClick={() => poner({ [f.clave]: comoEscrito(sug, f.moneda !== "COP") })} title="Copiar lo que dice el sistema">
                        sistema: {simbolo(f.moneda)}
                        {f.moneda === "COP" ? formatearMonto(String(Math.round(sug))) : conDecimales(sug)}
                      </button>
                    ) : null}
                  </td>
                  <td className="num">
                    <input value={valor[f.clave]} onChange={(e) => poner({ [f.clave]: conPuntos(e.target.value) })} inputMode="decimal" placeholder={`${simbolo(f.moneda)} 0`} disabled={soloLectura} aria-label={f.nombre} />
                  </td>
                  <td className="num">
                    {conTasa ? (
                      <input
                        value={f.clave === "usd" ? valor.tasaUsd : valor.tasaEur}
                        onChange={(e) => poner(f.clave === "usd" ? { tasaUsd: conPuntos(e.target.value) } : { tasaEur: conPuntos(e.target.value) })}
                        inputMode="decimal"
                        placeholder={f.tasa ? formatearMonto(String(f.tasa)) : "tasa"}
                        disabled={soloLectura}
                        aria-label={`Tasa de ${f.nombre}`}
                      />
                    ) : (
                      <span className="cap-tasa-fija">× 1</span>
                    )}
                  </td>
                  <td className="num cap-calculado">{f.cantidad ? pesos(f.pesos) : "—"}</td>
                  <td />
                </tr>
              );
            })}
            {valor.usdt.map((f, i) => filaLibre("usdt", f, i))}
            {!soloLectura && (
              <tr className="cap-agregar">
                <td colSpan={5}>
                  <button type="button" onClick={() => poner({ usdt: [...valor.usdt, filaCierre(`USDT ${valor.usdt.length + 1}`)] })}>
                    <Plus size={13} /> Agregar USDT
                  </button>
                </td>
              </tr>
            )}
            {valor.otras.map((f, i) => filaLibre("otras", f, i))}
            {!soloLectura && (
              <tr className="cap-agregar">
                <td colSpan={5}>
                  <button type="button" onClick={() => poner({ otras: [...valor.otras, filaCierre()] })}>
                    <Plus size={13} /> Otra opción
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="cap-fila-oscura">
              <td>Total cierre</td>
              <td className="num">{tasaDolar ? `US$${conDecimales(c.total / tasaDolar)}` : ""}</td>
              <td />
              <td className="num">{pesos(c.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
