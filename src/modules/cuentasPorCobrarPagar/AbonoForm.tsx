import { useEffect, useState, type FormEvent } from "react";
import { getCajas, type Caja } from "../../api/cajas.api";
import { etiquetaMetodoPago, getMetodosPago, type MetodoPago } from "../../api/metodosPago.api";
import { ApiError } from "../../api/client";

export function AbonoForm({
  saldoPendiente,
  monedaCodigo,
  onGuardar,
  onCancelar,
}: {
  saldoPendiente: string;
  monedaCodigo: string;
  onGuardar: (data: { monto: string; cajaId: number; metodoPagoId?: number }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [monto, setMonto] = useState("");
  const [cajaId, setCajaId] = useState<number | "">("");
  const [metodoPagoId, setMetodoPagoId] = useState<number | "">("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCajas().then(setCajas).catch(() => setCajas([]));
    getMetodosPago().then(setMetodos).catch(() => setMetodos([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!monto || !cajaId) {
      setError("Completá el monto y la caja/banco.");
      return;
    }
    setEnviando(true);
    try {
      await onGuardar({ monto, cajaId: Number(cajaId), metodoPagoId: metodoPagoId || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el abono.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="abono-form" onSubmit={handleSubmit}>
      <p className="abono-form-saldo">
        Saldo pendiente: <strong>{Number(saldoPendiente).toLocaleString("es-CO")} {monedaCodigo}</strong>
      </p>
      <div className="abono-form-row">
        <label>
          Monto a abonar
          <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
        </label>
        <label>
          Caja / Banco
          <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Método de pago
          <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">(opcional)</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.id}>{etiquetaMetodoPago(m)}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="abono-form-error">{error}</p>}

      <div className="cuenta-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar abono"}</button>
      </div>
    </form>
  );
}