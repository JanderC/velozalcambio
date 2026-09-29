import { useState, type FormEvent } from "react";
import { actualizarCaja, crearCaja, type Caja, type TipoCaja } from "../../api/cajas.api";
import { ApiError } from "../../api/client";

export const TIPO_CAJA_LABEL: Record<TipoCaja, string> = {
  FISICA: "Caja física",
  FUERTE: "Caja fuerte",
  BANCO: "Banco",
};

// Sin `caja` crea una nueva; con `caja` la edita.
export function CajaForm({ caja, onGuardada, onCancelar }: { caja?: Caja; onGuardada: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(caja?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoCaja>(caja?.tipo ?? "FISICA");
  const [descripcion, setDescripcion] = useState(caja?.descripcion ?? "");
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (caja) {
        await actualizarCaja(caja.id, { nombre, tipo, descripcion: descripcion.trim() || null });
      } else {
        await crearCaja({ nombre, tipo, descripcion: descripcion.trim() || undefined, esPrincipal });
      }
      onGuardada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la caja.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cajas-form" onSubmit={handleSubmit}>
      <label>
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Caja 2, Taquilla, Banesco" required autoFocus />
      </label>
      <label>
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCaja)}>
          {(Object.keys(TIPO_CAJA_LABEL) as TipoCaja[]).map((t) => (
            <option key={t} value={t}>{TIPO_CAJA_LABEL[t]}</option>
          ))}
        </select>
      </label>
      {tipo === "BANCO" && (
        <p className="cajas-form-nota">Los depósitos y retiros de clientes en un banco quedan pendientes de confirmación.</p>
      )}
      <label>
        Descripción (opcional)
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué se usa esta caja" />
      </label>
      {!caja && (
        <label className="cajas-form-check">
          <input type="checkbox" checked={esPrincipal} onChange={(e) => setEsPrincipal(e.target.checked)} />
          Es la caja principal (reemplaza a la actual)
        </label>
      )}

      {error && <p className="cajas-error">{error}</p>}

      <div className="cajas-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Guardando…" : caja ? "Guardar cambios" : "Crear caja"}</button>
      </div>
    </form>
  );
}
