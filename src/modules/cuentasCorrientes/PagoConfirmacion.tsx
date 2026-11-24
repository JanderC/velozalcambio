import { useEffect, useState } from "react";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas } from "../../api/monedas.api";
import { ENVIOS_BOLIVARES, TIPOS_ENVIO, comisionBolivares, envioPropuesto, recordarEnvio, type EnvioBolivares } from "./comisionesBolivares";
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
  bolivares?: boolean; // se le paga en bolívares por una cuenta de bolívares (pago móvil o transferencia)
  envio?: EnvioBolivares; // en bolívares: pago móvil P2P/P2C/C2P o transferencia (la comisión del banco sale de la cuenta)
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

/** Las cuentas de la empresa por las que se le paga al cliente (Zelle, Bancolombia, Bs…), en el orden de siempre. */
export function useCuentasDePago(activo = true) {
  const [cuentas, setCuentas] = useState<Caja[] | null>(null);
  useEffect(() => {
    if (!activo || cuentas) return;
    getCajas()
      .then((lista) => {
        const activas = lista.filter((c) => c.tipo === "BANCO" && c.activo);
        setCuentas(METODOS.flatMap((m) => activas.filter((c) => m.cuenta.test(c.nombre)).slice(0, 1).map((c) => ({ ...c, nombre: m.nombre }))));
      })
      .catch(() => setCuentas([]));
  }, [activo, cuentas]);
  return cuentas;
}

/**
 * Las cuentas de bolívares de la empresa (todas: Banco de Venezuela 8515, Provincial 1788…). Los bolívares nunca se
 * entregan en taquilla: se pagan por pago móvil o transferencia desde una de estas.
 */
export function useCuentasBolivares(activo = true) {
  const [cuentas, setCuentas] = useState<Caja[] | null>(null);
  useEffect(() => {
    if (!activo || cuentas) return;
    Promise.all([getCajas(), getMonedas()])
      .then(([lista, monedas]) => {
        const ves = monedas.find((m) => m.codigo === "VES")?.id;
        setCuentas(lista.filter((c) => c.tipo === "BANCO" && c.activo && ves !== undefined && c.moneda_id === ves));
      })
      .catch(() => setCuentas([]));
  }, [activo, cuentas]);
  return cuentas;
}
const CLAVE_BOLIVARES = "cc-pago-bolivares-cuenta";
/** La cuenta de bolívares que se propone: la última usada, o la primera. */
export function cuentaBolivaresPropuesta(cuentas: Caja[]) {
  let ultima: string | null = null;
  try {
    ultima = localStorage.getItem(CLAVE_BOLIVARES);
  } catch {
    // sin almacenamiento: la primera
  }
  return cuentas.find((c) => String(c.id) === ultima) ?? cuentas[0] ?? null;
}
export function recordarCuentaBolivares(id: number) {
  try {
    localStorage.setItem(CLAVE_BOLIVARES, String(id));
  } catch {
    // no es grave
  }
}

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
  // Se le entregan bolívares: no viene a retirar; se le paga por pago móvil o transferencia desde una cuenta de bolívares
  const enBolivares = codigo === "VES";
  const cuentasBs = useCuentasBolivares(enBolivares);
  useEffect(() => {
    if (enBolivares) {
      if (!cuentasBs || !cuentasBs.length) return;
      if (valor.bolivares && cuentasBs.some((c) => c.id === valor.cajaId)) return;
      const c = cuentaBolivaresPropuesta(cuentasBs)!;
      onCambio({ modo: "otro", cajaId: c.id, nombre: c.nombre, bolivares: true, envio: valor.envio ?? envioPropuesto() });
    } else if (valor.bolivares) {
      onCambio(PAGO_POR_TAQUILLA); // dejó de ser en bolívares: vuelve a lo de siempre
    }
  }, [enBolivares, cuentasBs, valor.bolivares, valor.cajaId, onCambio]);
  // por banco (todo o una parte): hace falta la cuenta de la empresa
  const otro = !enBolivares && (valor.modo === "otro" || valor.modo === "parte");
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

  if (enBolivares) {
    return (
      <div className="cc-pago-conf otro cc-pago-bs">
        <span>¿Cómo se le paga?</span>
        <b>En bolívares: pago móvil o transferencia. No pasa a taquilla.</b>
        {cuentasBs === null ? (
          <small>Cargando las cuentas de bolívares…</small>
        ) : cuentasBs.length === 0 ? (
          <small>No hay cuentas de bolívares en Capital de giros: creala ahí para pagar desde esa cuenta. Mientras tanto queda para taquilla.</small>
        ) : (
          <>
            <select
              value={valor.bolivares ? (valor.cajaId ?? "") : ""}
              onChange={(e) => {
                const c = cuentasBs.find((x) => String(x.id) === e.target.value);
                if (!c) return;
                recordarCuentaBolivares(c.id);
                onCambio({ modo: "otro", cajaId: c.id, nombre: c.nombre, bolivares: true, envio: valor.envio ?? envioPropuesto() });
              }}
              aria-label="Desde qué cuenta de bolívares se le paga"
            >
              {cuentasBs.map((c) => (
                <option key={c.id} value={c.id}>
                  Desde {c.nombre}
                </option>
              ))}
            </select>
            <select
              value={valor.envio ?? "P2P"}
              onChange={(e) => {
                const envio = e.target.value as EnvioBolivares;
                recordarEnvio(envio);
                onCambio({ ...valor, envio });
              }}
              aria-label="Cómo se le manda (la comisión del banco)"
            >
              {TIPOS_ENVIO.map((t) => (
                <option key={t} value={t}>
                  {ENVIOS_BOLIVARES[t].etiqueta} ({ENVIOS_BOLIVARES[t].corto})
                </option>
              ))}
            </select>
            {(() => {
              const envio = valor.envio ?? "P2P";
              const n = total ? Number(total) : 0;
              const comision = n > 0 ? comisionBolivares(n, envio) : 0;
              return (
                <small className="cc-comision-bs">
                  {comision > 0
                    ? `Comisión del banco: Bs. ${formatearMonto(comision.toFixed(2))}. Sale de esa cuenta aparte del pago (en total salen Bs. ${formatearMonto((n + comision).toFixed(2))}).`
                    : envio === "TRANSFERENCIA"
                      ? "Transferencia: sin comisión aparte."
                      : `La comisión (${ENVIOS_BOLIVARES[envio].corto}) se calcula con el monto.`}{" "}
                  Queda pagada al agregar.
                </small>
              );
            })()}
          </>
        )}
      </div>
    );
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
