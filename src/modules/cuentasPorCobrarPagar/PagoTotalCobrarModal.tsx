import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getCajas, type Caja } from "../../api/cajas.api";
import { registrarMovimientoCC, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, leerNumero, sumarDecimales } from "../../utils/montos";
import { dinero } from "./cobrar";

const METODOS = ["Efectivo", "Bancolombia", "Nequi", "Zelle", "Daviplata", "Otro"];
const SIN_CAJA = "ninguna";
// Las cajas manejan efectivo en estas monedas
const MONEDAS_DE_CAJA = ["COP", "USD", "EUR"];
const GRUPOS: { tipo: Caja["tipo"]; titulo: string }[] = [
  { tipo: "FISICA", titulo: "Taquillas y cajas" },
  { tipo: "FUERTE", titulo: "Caja Fuerte" },
  { tipo: "BANCO", titulo: "Cuentas de la empresa" },
];

/** Una parte del pago: cuánto, por qué método y a dónde entra. */
interface Parte {
  metodo: string;
  otroMetodo: string;
  monto: string; // lo escrito, con puntos de miles
  // "" = todavía no se eligió · SIN_CAJA = no entra a ninguna caja · un id = esa caja
  destino: string;
  referencia: string;
}
const parteNueva = (metodo = METODOS[0]!): Parte => ({ metodo, otroMetodo: "", monto: "", destino: "", referencia: "" });

/** Lo que se va escribiendo, con los puntos de miles puestos solos y decimales con coma. */
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,]/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return "";
  return formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}
const esPositivo = (v: string) => !v.startsWith("-") && /[1-9]/.test(v);

/**
 * El cliente paga lo que debe: con un solo método (abono por el saldo completo) o repartido en varios (una parte en
 * efectivo, otra por Bancolombia…). Cada parte es un abono en su hoja con su método, y entra a la caja o cuenta que se
 * elija para esa parte (o a ninguna). Con varios métodos puede pagar solo una parte: queda debiendo el resto.
 */
export function PagoTotalCobrarModal({ cuenta, onPagado, onCerrar }: { cuenta: CuentaCorrienteResumen; onPagado: () => void; onCerrar: () => void }) {
  const [varios, setVarios] = useState(false);
  const [partes, setPartes] = useState<Parte[]>([parteNueva()]);
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cajaPuede = MONEDAS_DE_CAJA.includes(cuenta.moneda_codigo);
  const saldo = cuenta.saldo_actual;

  useEffect(() => {
    if (!cajaPuede) return;
    getCajas()
      // no viene nada elegido: venía la última caja usada y pagos que no entraban a ninguna terminaban en la taquilla
      .then((lista) => setCajas(lista.filter((c) => c.activo)))
      .catch(() => setCajas([]));
  }, [cajaPuede]);

  function cambiar(i: number, cambios: Partial<Parte>) {
    setPartes((lista) => lista.map((p, j) => (j === i ? { ...p, ...cambios } : p)));
  }
  function elegirVarios(si: boolean) {
    setVarios(si);
    setError(null);
    // con varios métodos arranca con dos partes: la que ya estaba y otra por Bancolombia
    setPartes((lista) => (si ? (lista.length < 2 ? [{ ...lista[0]!, monto: "" }, parteNueva("Bancolombia")] : lista) : [{ ...lista[0]!, monto: "" }]));
  }

  // con varios métodos: cuánto suman las partes y cuánto falta para el saldo
  const montos = partes.map((p) => (varios ? leerNumero(p.monto) : saldo));
  const suma = montos.reduce<string>((s, m) => (m && esPositivo(m) ? sumarDecimales(s, m) : s), "0");
  const falta = sumarDecimales(saldo, `-${suma}`.replace("--", ""));
  const sobra = falta.startsWith("-");
  const completo = !/[1-9]/.test(falta);

  function completarCon(i: number) {
    // a esta parte le va lo que falta (sin contar lo que ya tenía escrito)
    const propia = montos[i] && esPositivo(montos[i]!) ? montos[i]! : "0";
    const resto = sumarDecimales(falta, propia);
    if (esPositivo(resto)) cambiar(i, { monto: conPuntos(resto.replace(".", ",")) });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    for (const [i, p] of partes.entries()) {
      const cual = varios ? ` (parte ${i + 1})` : "";
      if (!(p.metodo === "Otro" ? p.otroMetodo.trim() : p.metodo)) return setError(`Escribí el método de pago${cual}.`);
      if (varios && !(montos[i] && esPositivo(montos[i]!))) return setError(`Escribí cuánto pagó${cual}.`);
      if (cajaPuede && p.destino === "") return setError(`Elegí a dónde entra el dinero${cual} (o "No entra a ninguna caja").`);
    }
    if (varios) {
      if (sobra) return setError(`Las partes suman ${dinero(suma, cuenta.moneda_codigo)}: es más de lo que debe (${dinero(saldo, cuenta.moneda_codigo)}).`);
      if (!completo && !window.confirm(`Las partes suman ${dinero(suma, cuenta.moneda_codigo)}. Queda debiendo ${dinero(falta, cuenta.moneda_codigo)}. ¿Registrar así?`)) return;
    }
    setEnviando(true);
    const hechas: number[] = [];
    try {
      for (const [i, p] of partes.entries()) {
        const monto = montos[i]!;
        const metodo = p.metodo === "Otro" ? p.otroMetodo.trim() : p.metodo;
        const caja = cajas?.find((c) => String(c.id) === p.destino) ?? null;
        const como = metodo === "Efectivo" ? "en efectivo" : `por ${metodo}`;
        const titulo = !varios ? `Pago total ${como}` : completo ? `Pago total · parte ${i + 1} de ${partes.length} ${como}` : `Abono ${como}`;
        await registrarMovimientoCC({
          cuentaId: cuenta.id,
          terceroId: cuenta.tercero_id,
          canalId: cuenta.canal_id,
          monedaId: cuenta.moneda_id,
          tipo: "ABONO",
          // en negativo: baja lo que debe
          monto: `-${monto}`,
          descripcion: titulo + `${p.referencia.trim() ? ` · ${p.referencia.trim()}` : ""}` + `${caja ? ` (entra a ${caja.nombre})` : ""}`,
          // ...y esa misma plata entra a la caja elegida para esta parte
          ...(caja ? { cajaId: caja.id, montoCaja: monto, monedaCajaId: cuenta.moneda_id } : {}),
        });
        hechas.push(i);
      }
      onPagado();
    } catch (err) {
      const motivo = err instanceof ApiError ? err.message : "No se pudo registrar el pago.";
      if (hechas.length) {
        // las que ya entraron no se repiten: quedan en la lista solo las que faltan
        setPartes((lista) => lista.filter((_, j) => !hechas.includes(j)));
        setError(`Se registraron ${hechas.length} de ${partes.length} partes. La siguiente falló: ${motivo}. Revisá y registrá las que quedan.`);
      } else setError(motivo);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={varios ? "Registrar pago" : "Pagar todo"} onCerrar={onCerrar}>
      <form className="cc-modal cxc-form" onSubmit={guardar}>
        <p className="cxc-pago-total">
          <span>{cuenta.tercero_nombre} debe</span>
          <strong>{dinero(saldo, cuenta.moneda_codigo)}</strong>
        </p>
        <div className="cc-chips" role="radiogroup" aria-label="Cómo pagó">
          <button type="button" role="radio" aria-checked={!varios} className={!varios ? "activo" : ""} onClick={() => elegirVarios(false)}>
            Un solo método
          </button>
          <button type="button" role="radio" aria-checked={varios} className={varios ? "activo" : ""} onClick={() => elegirVarios(true)}>
            Varios métodos
          </button>
        </div>

        {partes.map((p, i) => {
          const caja = cajas?.find((c) => String(c.id) === p.destino) ?? null;
          return (
            <fieldset key={i} className={varios ? "cxc-parte" : "cxc-parte sola"}>
              {varios && (
                <legend>
                  Parte {i + 1}
                  {partes.length > 1 && (
                    <button type="button" onClick={() => setPartes((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar la parte ${i + 1}`} title="Quitar esta parte">
                      <X size={14} />
                    </button>
                  )}
                </legend>
              )}
              <div className="cxc-transf-metodo">
                <span>Método de pago</span>
                <div className="cc-chips" role="radiogroup" aria-label={`Método de pago${varios ? ` de la parte ${i + 1}` : ""}`}>
                  {METODOS.map((m) => (
                    <button type="button" key={m} role="radio" aria-checked={p.metodo === m} className={p.metodo === m ? "activo" : ""} onClick={() => cambiar(i, { metodo: m })}>
                      {m}
                    </button>
                  ))}
                </div>
                {p.metodo === "Otro" && (
                  <input value={p.otroMetodo} onChange={(e) => cambiar(i, { otroMetodo: e.target.value })} placeholder="¿Cuál? ej. Banco de Bogotá" maxLength={40} autoComplete="off" aria-label="Otro método de pago" autoFocus />
                )}
              </div>
              {varios && (
                <label>
                  Cuánto pagó así ({cuenta.moneda_codigo})
                  <span className="cxc-parte-monto">
                    <input value={p.monto} onChange={(e) => cambiar(i, { monto: conPuntos(e.target.value) })} inputMode="decimal" placeholder="0" autoComplete="off" />
                    {!completo && !sobra && (
                      <button type="button" className="cc-btn-secundario" onClick={() => completarCon(i)} title="Poner acá lo que falta para completar lo que debe">
                        Lo que falta
                      </button>
                    )}
                  </span>
                </label>
              )}
              {cajaPuede ? (
                <label>
                  ¿A dónde entra {varios ? "esta parte" : "el dinero"}?
                  <select value={p.destino} onChange={(e) => cambiar(i, { destino: e.target.value })} disabled={cajas === null}>
                    <option value="">{cajas === null ? "Cargando las cajas…" : "Elegir taquilla, caja o cuenta…"}</option>
                    {GRUPOS.map((g) => {
                      const delGrupo = (cajas ?? []).filter((c) => c.tipo === g.tipo);
                      return delGrupo.length ? (
                        <optgroup key={g.tipo} label={g.titulo}>
                          {delGrupo.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                    <option value={SIN_CAJA}>No entra a ninguna caja (solo anotar el pago)</option>
                  </select>
                  <small>
                    {caja
                      ? `${caja.nombre} sube ${varios ? "lo de esta parte" : dinero(saldo, cuenta.moneda_codigo)}.`
                      : p.destino === SIN_CAJA
                        ? "Queda anotado en la cuenta del cliente, sin mover ninguna caja."
                        : "La caja que elijas sube por ese monto."}
                  </small>
                </label>
              ) : (
                i === 0 && <p className="cc-modal-nota">Las cajas manejan pesos, dólares y euros: este pago en {cuenta.moneda_codigo} queda anotado en la cuenta del cliente, sin mover ninguna caja.</p>
              )}
              <label>
                Referencia (opcional)
                <input value={p.referencia} onChange={(e) => cambiar(i, { referencia: e.target.value })} placeholder="Número de comprobante, quién pagó…" maxLength={80} autoComplete="off" />
              </label>
            </fieldset>
          );
        })}

        {varios && (
          <>
            <button type="button" className="cxc-parte-agregar" onClick={() => setPartes((l) => [...l, parteNueva()])}>
              <Plus size={14} /> Agregar otro método
            </button>
            <p className={`cxc-parte-resumen ${sobra ? "mal" : completo ? "ok" : ""}`}>
              <span>Suman {dinero(suma, cuenta.moneda_codigo)}</span>
              <strong>
                {sobra ? `Sobran ${dinero(falta.slice(1), cuenta.moneda_codigo)}` : completo ? "Completo: queda en cero" : `Queda debiendo ${dinero(falta, cuenta.moneda_codigo)}`}
              </strong>
            </p>
          </>
        )}
        {!varios && <p className="cc-modal-nota">Se anota un abono por el saldo completo y la cuenta queda en cero. Si pagó por varios métodos, elegí "Varios métodos".</p>}
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando || (varios && (sobra || suma === "0"))}>
            {enviando ? "Registrando…" : varios ? `Registrar ${partes.length} pagos por ${dinero(suma, cuenta.moneda_codigo)}` : `Registrar pago de ${dinero(saldo, cuenta.moneda_codigo)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
