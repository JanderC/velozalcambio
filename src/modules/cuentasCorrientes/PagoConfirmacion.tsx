import { useEffect, useState } from "react";
import { getCajas, type Caja } from "../../api/cajas.api";
import { formatearMonto, leerNumero, sumarDecimales } from "../../utils/montos";
import { conPuntos } from "../cuentasPorCobrarPagar/NuevoClienteCobrarModal";

// Confirmaciones: cómo se le paga al cliente lo que se le compró.
//   Pasa a taquilla: queda pendiente y aparece en taquilla para pagarse en efectivo (como siempre).
//   Otro método de pago: se le paga ya por Zelle, Western Union, USDT, Bancolombia, Bancolombia Internacional, Bs o
//   Efectivo: queda pagada al agregar, se queda en Confirmaciones y no aparece en taquilla.
//   Una parte por banco: esa parte se le paga ya por una cuenta de la empresa (ej. 400.000 por Bancolombia) y el resto
//   queda en taquilla para retirarlo en efectivo (la taquilla ve solo lo que falta).
export interface PagoElegido {
  modo: "taquilla" | "otro" | "parte";
  cajaId: number | null;
  nombre: string;
  monto?: string; // "parte": cuánto va por banco, como se escribe (400.000)
}
export const PAGO_POR_TAQUILLA: PagoElegido = { modo: "taquilla", cajaId: null, nombre: "" };

const CLAVE_ULTIMA = "cc-pago-otro-metodo-cuenta";
// Los métodos de pago, en este orden: cada uno se paga por su cuenta de la empresa
const METODOS: { nombre: string; cuenta: RegExp }[] = [
  { nombre: "Zelle", cuenta: /^zelle$/i },
  { nombre: "Western Union", cuenta: /^western union$/i },
  { nombre: "USDT", cuenta: /^usdt/i },
  { nombre: "Bancolombia", cuenta: /^bancolombia$/i },
  { nombre: "Bancolombia Internacional", cuenta: /^bancolombia internacional$/i },
  { nombre: "Bs", cuenta: /^bol[ií]vares$/i },
  { nombre: "Efectivo", cuenta: /^efectivo$/i },
];
// el método que se propone según el medio por el que llegó la plata
const METODO_DEL_MEDIO: Record<string, string> = { ZELLE: "Zelle", WESTERN_UNION: "Western Union", USDT: "USDT", BANCOLOMBIA: "Bancolombia", BOLIVARES: "Bs", PAGO_MOVIL: "Bs" };

/** El mensaje para el cliente cuando una parte se le pagó por banco y el resto lo retira en efectivo. */
export function avisoDePagoParcial(referencia: string, total: string, porBanco: string, banco: string, efectivo: string) {
  return `Estimado(a), le informamos que la operación ha sido confirmada.\n\nRef: ${referencia || "—"}\nMonto: ${total}\nPagado por ${banco}: ${porBanco}\nPara retirar en efectivo: ${efectivo}`;
}

/** Lo que va por banco en "una parte por banco": el número, o null si no está bien escrito o no es menos que el total. */
export function montoParte(p: PagoElegido, total: string | null) {
  const n = p.monto?.trim() ? leerNumero(p.monto) : null;
  if (!n || n.startsWith("-") || !/[1-9]/.test(n)) return null;
  return total && Number(n) < Number(total) ? n : null;
}

/** El mensaje para el cliente cuando su confirmación quedó pagada en el momento. */
export function avisoDePagada(referencia: string, monto: string, pagadoPor: string) {
  return `Estimado(a), le informamos que la operación ha sido confirmada y pagada.\n\nRef: ${referencia || "—"}\nMonto: ${monto}\nPagado por: ${pagadoPor}`;
}

export function PagoConfirmacion({
  valor,
  onCambio,
  medioNombre,
  total,
  codigo,
}: {
  valor: PagoElegido;
  onCambio: (p: PagoElegido) => void;
  medioNombre?: string;
  total?: string | null; // lo que se le paga en total (para "una parte por banco")
  codigo?: string;
}) {
  const [cuentas, setCuentas] = useState<Caja[] | null>(null);
  // por banco (todo o una parte): hace falta la cuenta de la empresa
  const otro = valor.modo === "otro" || valor.modo === "parte";
  const parte = valor.modo === "parte";

  useEffect(() => {
    if (!otro || cuentas) return;
    getCajas()
      .then((lista) => {
        const activas = lista.filter((c) => c.tipo === "BANCO" && c.activo);
        setCuentas(METODOS.flatMap((m) => activas.filter((c) => m.cuenta.test(c.nombre)).slice(0, 1).map((c) => ({ ...c, nombre: m.nombre }))));
      })
      .catch(() => setCuentas([]));
  }, [otro, cuentas]);

  // Al pasar a "otro método" viene puesta la cuenta del medio (Bancolombia → Bancolombia) o la última usada
  useEffect(() => {
    if (!otro || !cuentas || valor.cajaId) return;
    const delMedio = medioNombre ? cuentas.find((c) => c.nombre === METODO_DEL_MEDIO[medioNombre]) : undefined;
    let ultima: Caja | undefined;
    try {
      ultima = cuentas.find((c) => String(c.id) === localStorage.getItem(CLAVE_ULTIMA));
    } catch {
      // sin almacenamiento: se elige a mano
    }
    const sugerida = delMedio ?? ultima;
    if (sugerida && !(parte && sugerida.nombre === "Efectivo")) onCambio({ ...valor, cajaId: sugerida.id, nombre: sugerida.nombre });
  }, [otro, parte, cuentas, valor, medioNombre, onCambio]);

  function elegirCuenta(id: string) {
    const c = cuentas?.find((x) => String(x.id) === id);
    onCambio({ ...valor, cajaId: c?.id ?? null, nombre: c?.nombre ?? "" });
    try {
      if (c) localStorage.setItem(CLAVE_ULTIMA, String(c.id));
    } catch {
      // no es grave: solo no se recuerda
    }
  }

  return (
    <div className={`cc-pago-conf ${otro ? "otro" : ""}`}>
      <span>¿Cómo se le paga?</span>
      <div className="cc-chips" role="radiogroup" aria-label="Cómo se le paga al cliente">
        <button type="button" role="radio" aria-checked={!otro} className={!otro ? "activo" : ""} onClick={() => onCambio(PAGO_POR_TAQUILLA)}>
          Pasa a taquilla
        </button>
        <button type="button" role="radio" aria-checked={valor.modo === "otro"} className={valor.modo === "otro" ? "activo" : ""} onClick={() => onCambio({ modo: "otro", cajaId: valor.cajaId, nombre: valor.nombre })}>
          Otro método de pago
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={parte}
          className={parte ? "activo" : ""}
          // el resto ya va en efectivo: lo que va por banco no puede ser Efectivo
          onClick={() => onCambio({ modo: "parte", ...(valor.nombre === "Efectivo" ? { cajaId: null, nombre: "" } : { cajaId: valor.cajaId, nombre: valor.nombre }), monto: valor.monto ?? "" })}
          title="Una parte se le transfiere ya y el resto lo retira en efectivo en taquilla"
        >
          Parte por banco, resto en efectivo
        </button>
      </div>
      {otro && (
        <select value={valor.cajaId ?? ""} onChange={(e) => elegirCuenta(e.target.value)} aria-label="Por dónde se le paga" disabled={!cuentas}>
          <option value="">{cuentas ? "¿Por dónde se le paga?" : "Cargando…"}</option>
          {(cuentas ?? [])
            .filter((c) => !parte || c.nombre !== "Efectivo")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </select>
      )}
      {parte && (
        <label className="cc-pago-parte">
          ¿Cuánto se le paga por banco?
          <input value={valor.monto ?? ""} onChange={(e) => onCambio({ ...valor, monto: conPuntos(e.target.value) })} inputMode="decimal" placeholder="Ej. 400.000" aria-label="Lo que se le paga por banco" />
        </label>
      )}
      <small>
        {parte
          ? (() => {
              const n = valor.monto?.trim() ? leerNumero(valor.monto) : null;
              if (!total || !n) return "Escribí cuánto va por banco: el resto queda en taquilla para retirarlo en efectivo.";
              if (Number(n) >= Number(total)) return `Tiene que ser menos que el total (${formatearMonto(total)}${codigo ? ` ${codigo}` : ""}). Si es todo, elegí "Otro método de pago".`;
              return `Por ${valor.nombre || "banco"}: ${formatearMonto(n)} · En efectivo en taquilla: ${formatearMonto(sumarDecimales(total, `-${n}`))}${codigo ? ` ${codigo}` : ""}`;
            })()
          : otro
            ? "Queda pagada al agregar y se queda en Confirmaciones. No pasa a taquilla."
            : "Queda pendiente y aparece en taquilla para pagarse en efectivo."}
      </small>
    </div>
  );
}
