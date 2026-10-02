import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { configurarCobroCuenta, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { formatearMonto, leerNumero } from "../../utils/montos";

/** En qué moneda se le cobra a esta cuenta y a qué tasa (manual). La contabilidad sigue en su moneda. */
export function CobroModal({ cuenta, onGuardado, onCerrar }: { cuenta: CuentaCorrienteResumen; onGuardado: () => void; onCerrar: () => void }) {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [monedaCobroId, setMonedaCobroId] = useState<number | "">(cuenta.moneda_cobro_id ?? "");
  const [tasa, setTasa] = useState(cuenta.tasa_cobro ? formatearMonto(cuenta.tasa_cobro) : "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
  }, []);

  const cobro = monedas.find((m) => m.id === monedaCobroId);
  const nTasa = tasa.trim() ? leerNumero(tasa) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (monedaCobroId !== "" && (!nTasa || !/[1-9]/.test(nTasa) || nTasa.startsWith("-"))) return setError("Escribí la tasa para hacer la conversión.");
    setEnviando(true);
    try {
      await configurarCobroCuenta(cuenta.id, monedaCobroId === "" ? { monedaCobroId: null } : { monedaCobroId, tasaCobro: nTasa! });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Moneda de cobro" onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={guardar}>
        <p className="cc-modal-nota">
          La contabilidad de {cuenta.tercero_nombre} se lleva en <strong>{cuenta.moneda_codigo}</strong>. Acá se elige en qué moneda se le cobra.
        </p>
        <label>
          Le cobro en
          <select value={monedaCobroId} onChange={(e) => setMonedaCobroId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">{cuenta.moneda_codigo} (la misma de la contabilidad)</option>
            {monedas
              .filter((m) => m.id !== cuenta.moneda_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo} · {m.nombre}
                </option>
              ))}
          </select>
        </label>
        {cobro && (
          <label>
            Tasa: 1 {cuenta.moneda_codigo} = cuántos {cobro.codigo}
            <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" placeholder="ej. 4.000" autoFocus />
            <small>{nTasa ? `1 ${cuenta.moneda_codigo} = ${formatearMonto(nTasa)} ${cobro.codigo}` : "La tasa es manual: se puede cambiar cuando haga falta."}</small>
          </label>
        )}
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
