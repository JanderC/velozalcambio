import { Plus, X } from "lucide-react";
import type { Moneda } from "../../api/monedas.api";
import { useEffect } from "react";
import { cuentaBolivaresPropuesta, recordarCuentaBolivares, useCuentasBolivares, useCuentasDePago } from "./PagoConfirmacion";
import { dividirDecimales, factorDeComision, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

// Pago repartido: lo que envió el cliente se le entrega en varias monedas (800 USD: 400 en pesos y 400 en bolívares).
// Cada parte dice cuánto de lo enviado va ahí, en qué moneda se entrega y con qué tasa (multiplicando o dividiendo),
// o con qué comisión se le descuenta (3%, 5%…: se entrega en la misma moneda que llegó, menos el %).
export interface ParteReparto {
  cantidad: string; // de lo que llegó (en la moneda del medio)
  moneda: string; // en qué se entrega esta parte
  operador: "x" | "÷" | "%";
  tasa: string; // con "%": el porcentaje de comisión
  // cómo se le paga esta parte: sin cuenta = pasa a taquilla (como siempre); con cuenta = se le paga ya por esa cuenta
  pago?: { cajaId: number; nombre: string } | null;
}

export const partesIniciales = (primera: string, segunda: string): ParteReparto[] => [
  { cantidad: "", moneda: primera, operador: "x", tasa: "" },
  { cantidad: "", moneda: segunda, operador: "x", tasa: "" },
];

/** "$1.560.000", "Bs. 14.000", "400 USD". */
export function dineroEn(monto: string, codigo: string) {
  const n = formatearMonto(monto);
  return codigo === "COP" ? `$${n}` : codigo === "VES" ? `Bs. ${n}` : `${n} ${codigo}`;
}

/** La cuenta de una parte: cantidad × tasa (o ÷) = total en su moneda. Sin tasa solo vale si se entrega lo mismo que llegó. */
export function calcularParte(p: ParteReparto, llega: string): { cantidad: string | null; tasa: string | null; total: string | null; error: string | null } {
  const cantidad = p.cantidad.trim() ? (leerNumero(p.cantidad)?.replace(/^-/, "") ?? null) : null;
  const tasa = p.tasa.trim() ? (leerNumero(p.tasa)?.replace(/^-/, "") ?? null) : null;
  if (!cantidad || !/[1-9]/.test(cantidad)) return { cantidad: null, tasa, total: null, error: `Falta la cantidad de la parte en ${p.moneda}.` };
  const decimales = p.moneda === "COP" ? 0 : 2;
  if (p.operador === "%") {
    // comisión: se entrega en la misma moneda que llegó, menos el %
    if (p.moneda !== llega) return { cantidad, tasa, total: null, error: `Con comisión la parte se entrega en ${llega} (la moneda que llegó). Para ${p.moneda} usá × Tasa o ÷ Dividir.` };
    if (!tasa || !/[1-9]/.test(tasa)) return { cantidad, tasa: null, total: null, error: `Falta el % de comisión de la parte en ${p.moneda}.` };
    if (Number(tasa) >= 100) return { cantidad, tasa, total: null, error: "La comisión tiene que ser menor al 100%." };
    const total = multiplicarDecimales(cantidad, factorDeComision(tasa, false), decimales);
    return { cantidad, tasa, total, error: null };
  }
  if (!tasa || !/[1-9]/.test(tasa)) {
    if (p.tasa.trim()) return { cantidad, tasa: null, total: null, error: `La tasa de la parte en ${p.moneda} no es un número válido.` };
    // sin tasa: se entrega lo mismo que llegó
    if (p.moneda !== llega) return { cantidad, tasa: null, total: null, error: `Falta la tasa para pasar ${llega} a ${p.moneda}.` };
    return { cantidad, tasa: null, total: cantidad, error: null };
  }
  // misma moneda que llegó con tasa: no hay nada que convertir (3 × 116.000 daría $348.000): es comisión o nada
  if (p.moneda === llega) return { cantidad, tasa, total: null, error: `La parte en ${llega} se entrega en la misma moneda que llegó: no lleva tasa. Para descontar la comisión usá % Comisión.` };
  const total = p.operador === "÷" ? dividirDecimales(cantidad, tasa, decimales) : multiplicarDecimales(cantidad, tasa, decimales);
  if (!total || !/[1-9]/.test(total)) return { cantidad, tasa, total: null, error: `La parte en ${p.moneda} da cero: revisá la cantidad y la tasa.` };
  return { cantidad, tasa, total, error: null };
}

export function RepartoMonedas({
  llega,
  monedas,
  partes,
  totalEnviado,
  onCambio,
  conPago = false,
}: {
  llega: string; // la moneda en la que llegó la plata (la del medio)
  monedas: Moneda[];
  partes: ParteReparto[];
  totalEnviado: string | null; // lo escrito en "Cantidad", si se escribió: las partes tienen que sumar eso
  onCambio: (partes: ParteReparto[]) => void;
  // Confirmaciones (compra): cada parte dice si pasa a taquilla o se le paga ya por una cuenta de la empresa
  conPago?: boolean;
}) {
  const cuentasPago = useCuentasDePago(conPago);
  // la parte que se entrega en bolívares no pasa a taquilla: se paga desde una cuenta de bolívares
  const cuentasBs = useCuentasBolivares(conPago);
  const idsBs = new Set((cuentasBs ?? []).map((c) => c.id));
  useEffect(() => {
    if (!conPago || !cuentasBs?.length) return;
    let cambio = false;
    const nuevas = partes.map((p) => {
      if (p.moneda === "VES" && (!p.pago || !idsBs.has(p.pago.cajaId))) {
        const c = cuentaBolivaresPropuesta(cuentasBs)!;
        cambio = true;
        return { ...p, pago: { cajaId: c.id, nombre: c.nombre } };
      }
      if (p.moneda !== "VES" && p.pago && idsBs.has(p.pago.cajaId)) {
        cambio = true;
        return { ...p, pago: null };
      }
      return p;
    });
    if (cambio) onCambio(nuevas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conPago, cuentasBs, partes.map((p) => `${p.moneda}:${p.pago?.cajaId ?? ""}`).join("|")]);
  const cuentas = partes.map((p) => calcularParte(p, llega));
  const repartido = cuentas.reduce((suma, c) => (c.cantidad ? sumarDecimales(suma, c.cantidad) : suma), "0");
  const resto = totalEnviado ? sumarDecimales(totalEnviado, `-${repartido}`) : null;
  const cambiar = (i: number, cambio: Partial<ParteReparto>) => onCambio(partes.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

  return (
    <div className="cc-reparto" role="group" aria-label="Pago repartido en varias monedas">
      {partes.map((p, i) => {
        const c = cuentas[i]!;
        return (
          <div className="cc-reparto-fila" key={i}>
            <label>
              De lo enviado ({llega})
              <input value={p.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} inputMode="decimal" placeholder="ej. 400" autoComplete="off" />
            </label>
            <label>
              Se entrega en
              <select value={p.moneda} onChange={(e) => cambiar(i, { moneda: e.target.value })}>
                {monedas.map((m) => (
                  <option key={m.id} value={m.codigo}>
                    {m.nombre} ({m.codigo})
                  </option>
                ))}
              </select>
            </label>
            <div className="cc-reparto-tasa">
              <div className="cc-modo-tasa" role="group" aria-label="Multiplicar o dividir por la tasa">
                <button type="button" className={p.operador === "x" ? "activo" : ""} onClick={() => cambiar(i, { operador: "x" })} aria-pressed={p.operador === "x"}>
                  × Tasa
                </button>
                <button type="button" className={p.operador === "÷" ? "activo" : ""} onClick={() => cambiar(i, { operador: "÷" })} aria-pressed={p.operador === "÷"}>
                  ÷ Dividir
                </button>
                <button
                  type="button"
                  className={p.operador === "%" ? "activo" : ""}
                  // con comisión se entrega en la moneda que llegó
                  onClick={() => cambiar(i, { operador: "%", moneda: partes.some((x, j) => j !== i && x.moneda === llega) ? p.moneda : llega })}
                  aria-pressed={p.operador === "%"}
                  title={`Se le descuenta un % de comisión: se entrega en ${llega}, menos el %`}
                >
                  % Comisión
                </button>
              </div>
              <input
                value={p.tasa}
                onChange={(e) => cambiar(i, { tasa: p.operador === "%" ? e.target.value.replace(/%/g, "") : e.target.value })}
                inputMode="decimal"
                placeholder={p.operador === "%" ? "% ej. 3" : p.moneda === llega ? "sin tasa" : "tasa"}
                autoComplete="off"
                aria-label={p.operador === "%" ? `Comisión de la parte en ${p.moneda}` : `Tasa de la parte en ${p.moneda}`}
              />
            </div>
            {conPago && (
              <label className="cc-reparto-pago">
                Se le paga
                {p.moneda === "VES" && cuentasBs?.length ? (
                  // bolívares: siempre por pago móvil o transferencia, desde una cuenta de bolívares
                  <select
                    value={p.pago?.cajaId ?? ""}
                    onChange={(e) => {
                      const cta = cuentasBs.find((x) => String(x.id) === e.target.value);
                      if (!cta) return;
                      recordarCuentaBolivares(cta.id);
                      cambiar(i, { pago: { cajaId: cta.id, nombre: cta.nombre } });
                    }}
                    aria-label={`Desde qué cuenta de bolívares se le paga la parte ${i + 1}`}
                  >
                    {cuentasBs.map((cta) => (
                      <option key={cta.id} value={cta.id}>
                        Bs desde {cta.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={p.pago?.cajaId ?? ""}
                    onChange={(e) => {
                      const cta = cuentasPago?.find((x) => String(x.id) === e.target.value);
                      cambiar(i, { pago: cta ? { cajaId: cta.id, nombre: cta.nombre } : null });
                    }}
                    aria-label={`Cómo se le paga la parte ${i + 1}`}
                    disabled={!cuentasPago}
                  >
                    <option value="">Pasa a taquilla</option>
                    {(cuentasPago ?? []).map((cta) => (
                      <option key={cta.id} value={cta.id}>
                        Ya por {cta.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
            <output className="cc-reparto-total" title={c.error ?? undefined}>
              {c.total ? `= ${dineroEn(c.total, p.moneda)}` : "= —"}
              {p.operador === "%" && c.total && c.tasa && <small> (− {formatearMonto(c.tasa)}%)</small>}
              {!c.total && c.error && p.tasa.trim() && <small className="cc-reparto-error"> {c.error}</small>}
            </output>
            <span className="cc-reparto-acciones">
              {resto && /[1-9]/.test(resto) && !resto.startsWith("-") && !p.cantidad.trim() && (
                <button type="button" onClick={() => cambiar(i, { cantidad: formatearMonto(resto) })} title="Poner acá lo que falta repartir">
                  resto
                </button>
              )}
              {partes.length > 2 && (
                <button type="button" onClick={() => onCambio(partes.filter((_, j) => j !== i))} aria-label={`Quitar la parte en ${p.moneda}`} title="Quitar esta parte">
                  <X size={14} />
                </button>
              )}
            </span>
          </div>
        );
      })}
      <div className="cc-reparto-pie">
        {partes.length < 8 && (
          <button
            type="button"
            className="cc-reparto-agregar"
            onClick={() => {
              // la siguiente parte propone una moneda que no esté usada (si todas lo están, pesos): se puede repetir
              const libre = monedas.find((m) => !partes.some((p) => p.moneda === m.codigo)) ?? monedas.find((m) => m.codigo === "COP") ?? monedas[0];
              if (libre) onCambio([...partes, { cantidad: "", moneda: libre.codigo, operador: "x", tasa: "" }]);
            }}
          >
            <Plus size={13} /> Otra moneda
          </button>
        )}
        <span className={resto && /[1-9]/.test(resto) ? "falta" : ""}>
          Repartido: <b>{formatearMonto(repartido)} {llega}</b>
          {totalEnviado &&
            (resto && /[1-9]/.test(resto)
              ? resto.startsWith("-")
                ? ` · se pasa por ${formatearMonto(resto.slice(1))} de los ${formatearMonto(totalEnviado)} enviados`
                : ` · faltan ${formatearMonto(resto)} de los ${formatearMonto(totalEnviado)} enviados`
              : ` · completo ✓`)}
        </span>
      </div>
      <small>
        Cada parte queda como un movimiento aparte, en la cuenta del cliente en esa moneda (se le abre sola si no la tiene), con la misma referencia y la misma captura.
        {conPago && " La que pasa a taquilla se le paga allá en efectivo (y se descuenta de la taquilla); la que se paga por un banco queda pagada al registrar y no pasa a taquilla. Los bolívares nunca pasan a taquilla: salen de una cuenta de bolívares."}
      </small>
    </div>
  );
}
