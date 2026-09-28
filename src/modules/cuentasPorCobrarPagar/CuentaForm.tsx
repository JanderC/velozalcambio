import { useState, type FormEvent } from "react";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { useEffect } from "react";

export function CuentaForm({
  onGuardar,
  onCancelar,
}: {
  onGuardar: (data: { terceroId: number; monedaId: number; montoOriginal: string }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Tercero[]>([]);
  const [terceroSeleccionado, setTerceroSeleccionado] = useState<Tercero | null>(null);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [monedaId, setMonedaId] = useState<number | "">("");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
  }, []);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      buscarTerceros(busqueda.trim()).then(setResultados).catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!terceroSeleccionado || !monedaId || !monto) {
      setError("Completá cliente/proveedor, moneda y monto.");
      return;
    }
    setEnviando(true);
    try {
      await onGuardar({ terceroId: terceroSeleccionado.id, monedaId: Number(monedaId), montoOriginal: monto });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cuenta-form" onSubmit={handleSubmit}>
      <label>
        Cliente / Proveedor
        {terceroSeleccionado ? (
          <div className="cuenta-form-tercero-elegido">
            {terceroSeleccionado.nombre}
            <button type="button" onClick={() => setTerceroSeleccionado(null)}>Cambiar</button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o identificación..."
            />
            {resultados.length > 0 && (
              <ul className="cuenta-form-resultados">
                {resultados.map((t) => (
                  <li key={t.id} onClick={() => { setTerceroSeleccionado(t); setResultados([]); }}>
                    {t.nombre} <span>{t.identificacion ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </label>

      <label>
        Moneda
        <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Seleccionar…</option>
          {monedas.map((m) => (
            <option key={m.id} value={m.id}>{m.codigo}</option>
          ))}
        </select>
      </label>

      <label>
        Monto
        <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
      </label>

      {error && <p className="cuenta-form-error">{error}</p>}

      <div className="cuenta-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</button>
      </div>
    </form>
  );
}