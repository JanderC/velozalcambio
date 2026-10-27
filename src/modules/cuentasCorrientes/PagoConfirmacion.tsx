import { useEffect, useState } from "react";
import { getCajas, type Caja } from "../../api/cajas.api";
import { formatearMonto, leerNumero, sumarDecimales } from "../../utils/montos";
import { conPuntos } from "../cuentasPorCobrarPagar/NuevoClienteCobrarModal";

// Confirmaciones: cómo se le paga al cliente lo que se le compró.
//   Pasa a taquilla: queda pendiente y aparece en taquilla para pagarse en efectivo (como siempre).
//   Otro método de pago: se le paga ya por una cuenta de la empresa (Bancolombia, Nequi, bolívares, USDT…): queda pagada
//   al agregar, sale de esa cuenta y no aparece en taquilla.
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
// la cuenta que se propone según el medio por el que llegó la plata
const CUENTA_DEL_MEDIO: Record<string, RegExp> = { BANCOLOMBIA: /bancolombia/i, NEQUI: /nequi/i, BOLIVARES: /bol[ií]vares/i, PAGO_MOVIL: /bol[ií]vares/i, USDT: /usdt/i };

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
      .then((lista) => setCuentas(lista.filter((c) => c.tipo === "BANCO" && c.activo)))
      .catch(() => setCuentas([]));
  }, [otro, cuentas]);

  // Al pasar a "otro método" viene puesta la cuenta del medio (Bancolombia → Bancolombia) o la última usada
  useEffect(() => {
    if (!otro || !cuentas || valor.cajaId) return;
    const delMedio = medioNombre && CUENTA_DEL_MEDIO[medioNombre] ? cuentas.find((c) => CUENTA_DEL_MEDIO[medioNombre]!.test(c.nombre)) : undefined;
    let ultima: Caja | undefined;
    try {
      ultima = cuentas.find((c) => String(c.id) === localStorage.getItem(CLAVE_ULTIMA));
    } catch {
      // sin almacenamiento: se elige a mano
    }
    const sugerida = delMedio ?? ultima;
    if (sugerida) onCambio({ ...valor, cajaId: sugerida.id, nombre: sugerida.nombre });
  }, [otro, cuentas, valor, medioNombre, onCambio]);

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
          onClick={() => onCambio({ modo: "parte", cajaId: valor.cajaId, nombre: valor.nombre, monto: valor.monto ?? "" })}
          title="Una parte se le transfiere ya y el resto lo retira en efectivo en taquilla"
        >
          Parte por banco, resto en efectivo
        </button>
      </div>
      {otro && (
        <select value={valor.cajaId ?? ""} onChange={(e) => elegirCuenta(e.target.value)} aria-label="Cuenta de la empresa de la que se le paga" disabled={!cuentas}>
          <option value="">{cuentas ? "¿De qué cuenta se le paga?" : "Cargando cuentas…"}</option>
          {(cuentas ?? []).map((c) => (
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
            ? "Queda pagada al agregar y sale de esa cuenta de la empresa. No pasa a taquilla."
            : "Queda pendiente y aparece en taquilla para pagarse en efectivo."}
      </small>
    </div>
  );
}
