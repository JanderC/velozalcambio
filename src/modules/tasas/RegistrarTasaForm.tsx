import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { registrarTasa } from "../../api/tasas.api";
import { ApiError } from "../../api/client";

// Tasa interna entre dos monedas (par origen/destino), la que usa el sistema de referencia.
export function RegistrarTasaForm({ onGuardado }: { onGuardado: () => void }) {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [monedaOrigenId, setMonedaOrigenId] = useState<number | "">("");
  const [monedaDestinoId, setMonedaDestinoId] = useState<number | "">("");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then(setMonedas);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (!monedaOrigenId || !monedaDestinoId || !valor) {
      setError("Completá origen, destino y valor.");
      return;
    }
    if (monedaOrigenId === monedaDestinoId) {
      setError("La moneda de origen y destino no pueden ser la misma.");
      return;
    }
    setEnviando(true);
    try {
      await registrarTasa({ monedaOrigenId: Number(monedaOrigenId), monedaDestinoId: Number(monedaDestinoId), valor });
      setExito("Tasa registrada correctamente.");
      setValor("");
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la tasa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="registro-form" onSubmit={handleSubmit}>
      <div className="registro-fila">
        <label className="registro-campo">
          Moneda origen
          <select value={monedaOrigenId} onChange={(e) => setMonedaOrigenId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {monedas.map((m) => <option key={m.id} value={m.id}>{m.codigo}</option>)}
          </select>
        </label>
        <label className="registro-campo">
          Moneda destino
          <select value={monedaDestinoId} onChange={(e) => setMonedaDestinoId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {monedas.map((m) => <option key={m.id} value={m.id}>{m.codigo}</option>)}
          </select>
        </label>
      </div>
      <label className="registro-campo">
        Valor
        <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ej. 4150" />
      </label>

      {error && <p className="registro-error">{error}</p>}
      {exito && <p className="registro-exito">{exito}</p>}

      <button type="submit" className="registro-guardar" disabled={enviando}>
        <Save size={16} /> {enviando ? "Guardando…" : "Registrar tasa"}
      </button>
    </form>
  );
}
