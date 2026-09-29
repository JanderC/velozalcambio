import { useState, type FormEvent } from "react";
import { transferirEntreCajas, type CajaTablero } from "../../api/cajas.api";
import type { Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { formatearMonto, normalizarMonto } from "./montos";

// Mueve plata entre dos cajas en la misma moneda. Por defecto sale de la principal.
export function TransferenciaForm({
  cajas,
  monedas,
  origenInicialId,
  onRegistrada,
  onCancelar,
}: {
  cajas: CajaTablero[];
  monedas: Moneda[];
  origenInicialId?: number;
  onRegistrada: () => void;
  onCancelar: () => void;
}) {
  const activas = cajas.filter((c) => c.activo);
  const [origenId, setOrigenId] = useState<number | "">(origenInicialId ?? activas.find((c) => c.es_principal)?.id ?? "");
  const [destinoId, setDestinoId] = useState<number | "">("");
  const [monedaId, setMonedaId] = useState<number | "">(monedas[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [abrirTurnoDestino, setAbrirTurnoDestino] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origen = activas.find((c) => c.id === origenId);
  const destino = activas.find((c) => c.id === destinoId);
  const saldoOrigen = origen?.saldos.find((s) => s.moneda_id === monedaId)?.monto ?? "0";
  const origenConTurno = origen?.turnos_abiertos.some((t) => t.moneda_id === monedaId) ?? false;
  const monedaCodigo = monedas.find((m) => m.id === monedaId)?.codigo ?? "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const montoValido = normalizarMonto(monto);
    if (!origenId || !destinoId || !monedaId) return setError("Elegí origen, destino y moneda.");
    if (origenId === destinoId) return setError("El origen y el destino deben ser cajas distintas.");
    if (!montoValido) return setError("Ingresá un monto mayor que cero (hasta 4 decimales).");

    setEnviando(true);
    try {
      await transferirEntreCajas({
        cajaOrigenId: Number(origenId),
        cajaDestinoId: Number(destinoId),
        monedaId: Number(monedaId),
        monto: montoValido,
        observacion: observacion.trim() || undefined,
        abrirTurnoDestino,
      });
      onRegistrada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la transferencia.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cajas-form" onSubmit={handleSubmit}>
      <div className="cajas-form-fila">
        <label>
          Desde
          <select
            value={origenId}
            onChange={(e) => {
              const nuevo = e.target.value ? Number(e.target.value) : "";
              setOrigenId(nuevo);
              if (nuevo === destinoId) setDestinoId("");
            }}
          >
            <option value="">Seleccionar…</option>
            {activas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.es_principal ? " (principal)" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          Hacia
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {activas.filter((c) => c.id !== origenId).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.es_principal ? " (principal)" : ""}</option>
            ))}
          </select>
        </label>
      </div>
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
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0.00" required />
        </label>
      </div>

      {origen && monedaId && (
        <p className="cajas-form-nota">
          Disponible en {origen.nombre}: <strong>{formatearMonto(saldoOrigen)} {monedaCodigo}</strong>
          {!origenConTurno && <> · <span className="cajas-texto-alerta">sin turno abierto en {monedaCodigo}</span></>}
        </p>
      )}

      <label>
        Observación (opcional)
        <input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Ej. Base del día" maxLength={300} />
      </label>
      <label className="cajas-form-check">
        <input type="checkbox" checked={abrirTurnoDestino} onChange={(e) => setAbrirTurnoDestino(e.target.checked)} />
        Abrir el turno de {destino?.nombre ?? "la caja destino"} si está cerrado
      </label>

      {error && <p className="cajas-error">{error}</p>}

      <div className="cajas-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Transfiriendo…" : "Transferir"}</button>
      </div>
    </form>
  );
}
