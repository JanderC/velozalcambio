import { useState, type FormEvent } from "react";
import { actualizarMetodoPago, crearMetodoPago, type MetodoPago } from "../../api/metodosPago.api";
import type { Caja } from "../../api/cajas.api";
import { ApiError } from "../../api/client";

// Método de pago = solo el nombre, con cuenta opcional. Sin `metodo` crea uno nuevo.
export function MetodoPagoForm({
  metodo,
  cuentas,
  onGuardado,
  onCancelar,
}: {
  metodo?: MetodoPago;
  cuentas: Caja[];
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(metodo?.nombre ?? "");
  const [cuentaId, setCuentaId] = useState<number | "">(metodo?.cuenta_id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const datos = { nombre, cuentaId: cuentaId === "" ? null : cuentaId };
    try {
      if (metodo) await actualizarMetodoPago(metodo.id, datos);
      else await crearMetodoPago(datos);
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el método de pago.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cajas-form" onSubmit={handleSubmit}>
      <label>
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Pago Móvil, Zelle, Efectivo" required autoFocus maxLength={80} />
      </label>
      <label>
        Cuenta vinculada (opcional)
        <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Sin cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}{c.banco && c.banco !== c.nombre ? ` (${c.banco})` : ""}</option>
          ))}
        </select>
      </label>
      <p className="cajas-form-nota">Por ejemplo "Pago Móvil" vinculado a Mercantil. "Efectivo" normalmente va sin cuenta.</p>

      {error && <p className="cajas-error">{error}</p>}

      <div className="cajas-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Guardando…" : metodo ? "Guardar cambios" : "Crear método"}</button>
      </div>
    </form>
  );
}
