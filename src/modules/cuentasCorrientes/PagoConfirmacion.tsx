import { useEffect, useState } from "react";
import { getCajas, type Caja } from "../../api/cajas.api";

// Confirmaciones: cómo se le paga al cliente lo que se le compró.
//   Pasa a taquilla: queda pendiente y aparece en taquilla para pagarse en efectivo (como siempre).
//   Otro método de pago: se le paga ya por una cuenta de la empresa (Bancolombia, Nequi, bolívares, USDT…): queda pagada
//   al agregar, sale de esa cuenta y no aparece en taquilla.
export interface PagoElegido {
  modo: "taquilla" | "otro";
  cajaId: number | null;
  nombre: string;
}
export const PAGO_POR_TAQUILLA: PagoElegido = { modo: "taquilla", cajaId: null, nombre: "" };

const CLAVE_ULTIMA = "cc-pago-otro-metodo-cuenta";
// la cuenta que se propone según el medio por el que llegó la plata
const CUENTA_DEL_MEDIO: Record<string, RegExp> = { BANCOLOMBIA: /bancolombia/i, NEQUI: /nequi/i, BOLIVARES: /bol[ií]vares/i, PAGO_MOVIL: /bol[ií]vares/i, USDT: /usdt/i };

/** El mensaje para el cliente cuando su confirmación quedó pagada en el momento. */
export function avisoDePagada(referencia: string, monto: string, pagadoPor: string) {
  return `Estimado(a), le informamos que la operación ha sido confirmada y pagada.\n\nRef: ${referencia || "—"}\nMonto: ${monto}\nPagado por: ${pagadoPor}`;
}

export function PagoConfirmacion({ valor, onCambio, medioNombre }: { valor: PagoElegido; onCambio: (p: PagoElegido) => void; medioNombre?: string }) {
  const [cuentas, setCuentas] = useState<Caja[] | null>(null);
  const otro = valor.modo === "otro";

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
    if (sugerida) onCambio({ modo: "otro", cajaId: sugerida.id, nombre: sugerida.nombre });
  }, [otro, cuentas, valor.cajaId, medioNombre, onCambio]);

  function elegirCuenta(id: string) {
    const c = cuentas?.find((x) => String(x.id) === id);
    onCambio({ modo: "otro", cajaId: c?.id ?? null, nombre: c?.nombre ?? "" });
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
        <button type="button" role="radio" aria-checked={otro} className={otro ? "activo" : ""} onClick={() => onCambio({ modo: "otro", cajaId: null, nombre: "" })}>
          Otro método de pago
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
      <small>
        {otro
          ? "Queda pagada al agregar y sale de esa cuenta de la empresa. No pasa a taquilla."
          : "Queda pendiente y aparece en taquilla para pagarse en efectivo."}
      </small>
    </div>
  );
}
