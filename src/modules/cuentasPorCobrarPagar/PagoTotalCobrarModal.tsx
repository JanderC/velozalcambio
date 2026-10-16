import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getCajas, type Caja } from "../../api/cajas.api";
import { registrarMovimientoCC, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
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

/**
 * El cliente paga todo lo que debe: se le anota un abono por el saldo completo, con el método de pago, y su cuenta
 * queda en cero. Se elige a dónde entra esa plata (una taquilla, la Caja Fuerte, una caja o una cuenta de la empresa)
 * y esa caja sube por el mismo monto. Es un movimiento más en su hoja (se puede anular desde ahí como cualquier otro).
 */
export function PagoTotalCobrarModal({ cuenta, onPagado, onCerrar }: { cuenta: CuentaCorrienteResumen; onPagado: () => void; onCerrar: () => void }) {
  const [metodo, setMetodo] = useState(METODOS[0]!);
  const [otroMetodo, setOtroMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  // "" = todavía no se eligió · SIN_CAJA = no entra a ninguna caja · un id = esa caja
  const [destino, setDestino] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cajaPuede = MONEDAS_DE_CAJA.includes(cuenta.moneda_codigo);

  useEffect(() => {
    if (!cajaPuede) return;
    getCajas()
      // no viene nada elegido: venía la última caja usada y pagos que no entraban a ninguna terminaban en la taquilla
      .then((lista) => setCajas(lista.filter((c) => c.activo)))
      .catch(() => setCajas([]));
  }, [cajaPuede]);

  const cajaElegida = cajas?.find((c) => String(c.id) === destino) ?? null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const metodoFinal = metodo === "Otro" ? otroMetodo.trim() : metodo;
    if (!metodoFinal) return setError("Escribí el método de pago.");
    if (cajaPuede && destino === "") return setError("Elegí a dónde entra el dinero (o \"No entra a ninguna caja\").");
    setEnviando(true);
    try {
      await registrarMovimientoCC({
        terceroId: cuenta.tercero_id,
        canalId: cuenta.canal_id,
        monedaId: cuenta.moneda_id,
        tipo: "ABONO",
        // el saldo completo, en negativo: lo que debía queda en cero
        monto: `-${cuenta.saldo_actual}`,
        descripcion:
          `Pago total ${metodoFinal === "Efectivo" ? "en efectivo" : `por ${metodoFinal}`}` + `${referencia.trim() ? ` · ${referencia.trim()}` : ""}` + `${cajaElegida ? ` (entra a ${cajaElegida.nombre})` : ""}`,
        // ...y esa misma plata entra a la caja elegida
        ...(cajaElegida ? { cajaId: cajaElegida.id, montoCaja: cuenta.saldo_actual, monedaCajaId: cuenta.moneda_id } : {}),
      });
      onPagado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el pago.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Pagar todo" onCerrar={onCerrar}>
      <form className="cc-modal cxc-form" onSubmit={guardar}>
        <p className="cxc-pago-total">
          <span>{cuenta.tercero_nombre} paga todo lo que debe</span>
          <strong>{dinero(cuenta.saldo_actual, cuenta.moneda_codigo)}</strong>
        </p>
        <div className="cxc-transf-metodo">
          <span>Método de pago</span>
          <div className="cc-chips" role="radiogroup" aria-label="Método de pago">
            {METODOS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={metodo === m} className={metodo === m ? "activo" : ""} onClick={() => setMetodo(m)}>
                {m}
              </button>
            ))}
          </div>
          {metodo === "Otro" && <input value={otroMetodo} onChange={(e) => setOtroMetodo(e.target.value)} placeholder="¿Cuál? ej. Banco de Bogotá" maxLength={40} autoComplete="off" aria-label="Otro método de pago" autoFocus />}
        </div>
        {cajaPuede ? (
          <label>
            ¿A dónde entra el dinero?
            <select value={destino} onChange={(e) => setDestino(e.target.value)} disabled={cajas === null}>
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
              {cajaElegida
                ? `${cajaElegida.nombre} sube ${dinero(cuenta.saldo_actual, cuenta.moneda_codigo)} con este pago.`
                : destino === SIN_CAJA
                  ? "Queda anotado el pago en la cuenta del cliente, sin mover ninguna caja."
                  : "La caja que elijas sube por el monto del pago."}
            </small>
          </label>
        ) : (
          <p className="cc-modal-nota">Las cajas manejan pesos, dólares y euros: este pago en {cuenta.moneda_codigo} queda anotado en la cuenta del cliente, sin mover ninguna caja.</p>
        )}
        <label>
          Referencia del pago (opcional)
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Número de comprobante, quién pagó…" maxLength={80} autoComplete="off" />
        </label>
        <p className="cc-modal-nota">Se anota un abono por el saldo completo y la cuenta queda en cero. Si paga solo una parte, el abono se anota desde su hoja.</p>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Registrando…" : `Registrar pago de ${dinero(cuenta.saldo_actual, cuenta.moneda_codigo)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
