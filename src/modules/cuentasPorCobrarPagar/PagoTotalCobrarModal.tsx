import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { registrarMovimientoCC, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { dinero } from "./cobrar";

const METODOS = ["Efectivo", "Bancolombia", "Nequi", "Zelle", "Daviplata", "Otro"];

/**
 * El cliente paga todo lo que debe: se le anota un abono por el saldo completo, con el método de pago, y su cuenta
 * queda en cero. Es un movimiento más en su hoja (se puede anular desde ahí como cualquier otro).
 */
export function PagoTotalCobrarModal({ cuenta, onPagado, onCerrar }: { cuenta: CuentaCorrienteResumen; onPagado: () => void; onCerrar: () => void }) {
  const [metodo, setMetodo] = useState(METODOS[0]!);
  const [otroMetodo, setOtroMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const metodoFinal = metodo === "Otro" ? otroMetodo.trim() : metodo;
    if (!metodoFinal) return setError("Escribí el método de pago.");
    setEnviando(true);
    try {
      await registrarMovimientoCC({
        terceroId: cuenta.tercero_id,
        canalId: cuenta.canal_id,
        monedaId: cuenta.moneda_id,
        tipo: "ABONO",
        // el saldo completo, en negativo: lo que debía queda en cero
        monto: `-${cuenta.saldo_actual}`,
        descripcion: `Pago total ${metodoFinal === "Efectivo" ? "en efectivo" : `por ${metodoFinal}`}${referencia.trim() ? ` · ${referencia.trim()}` : ""}`,
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
