import { useState, type FormEvent } from "react";
import { fondearCaja, type CajaTablero } from "../../api/cajas.api";
import type { Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { normalizarMonto } from "./montos";

// Alimenta una caja (por defecto la principal) con plata que entra al negocio.
export function FondeoForm({
  cajas,
  monedas,
  onRegistrado,
  onCancelar,
}: {
  cajas: CajaTablero[];
  monedas: Moneda[];
  onRegistrado: () => void;
  onCancelar: () => void;
}) {
  const activas = cajas.filter((c) => c.activo);
  const principal = activas.find((c) => c.es_principal);
  const [cajaId, setCajaId] = useState<number | "">(principal?.id ?? "");
  const [monedaId, setMonedaId] = useState<number | "">(monedas[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [abrirTurno, setAbrirTurno] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caja = activas.find((c) => c.id === cajaId);
  const cajaConTurno = caja?.turnos_abiertos.some((t) => t.moneda_id === monedaId) ?? false;
  const monedaCodigo = monedas.find((m) => m.id === monedaId)?.codigo ?? "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const montoValido = normalizarMonto(monto);
    if (!cajaId || !monedaId) return setError("Elegí la caja y la moneda.");
    if (!montoValido) return setError("Ingresá un monto mayor que cero (hasta 4 decimales).");

    setEnviando(true);
    try {
      await fondearCaja({
        cajaId: Number(cajaId),
        monedaId: Number(monedaId),
        monto: montoValido,
        observacion: observacion.trim() || undefined,
        abrirTurno,
      });
      onRegistrado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el fondeo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cajas-form" onSubmit={handleSubmit}>
      {!principal && <p className="cajas-form-nota">No hay caja principal configurada: elegí a qué caja entra la plata.</p>}
      <label>
        Caja
        <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Seleccionar…</option>
          {activas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}{c.es_principal ? " (principal)" : ""}</option>
          ))}
        </select>
      </label>
      <div className="cajas-form-fila">
        <label>
          Moneda
          <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>{m.codigo}</option>
            ))}
          </select>
        </label>
        <label>
          Monto
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0.00" required autoFocus />
        </label>
      </div>
      <label>
        Observación (opcional)
        <input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Ej. Capital inicial, reposición de efectivo" maxLength={300} />
      </label>
      <label className="cajas-form-check">
        <input type="checkbox" checked={abrirTurno} onChange={(e) => setAbrirTurno(e.target.checked)} />
        Abrir el turno de la caja en esta moneda si está cerrado
      </label>
      {caja && monedaId && !cajaConTurno && (
        <p className="cajas-form-nota">
          {abrirTurno ? (
            <>Se abrirá un turno de <strong>{caja.nombre}</strong> en <strong>{monedaCodigo}</strong>. Recordá cerrarlo al final del día.</>
          ) : (
            <span className="cajas-texto-alerta">{caja.nombre} no tiene turno abierto en {monedaCodigo}: el fondeo será rechazado.</span>
          )}
        </p>
      )}

      {error && <p className="cajas-error">{error}</p>}

      <div className="cajas-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Alimentar caja"}</button>
      </div>
    </form>
  );
}
