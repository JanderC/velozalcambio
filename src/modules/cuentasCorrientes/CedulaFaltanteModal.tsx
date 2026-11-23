import { useState, type FormEvent } from "react";
import { IdCard } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { actualizarCedulaTercero } from "../../api/terceros.api";
import { ApiError } from "../../api/client";

// Los clientes a los que ya se les dijo "Ahora no" en esta sesión: no se les vuelve a preguntar hasta recargar
const yaPreguntados = new Set<number>();
export const debePreguntarCedula = (terceroId: number) => !yaPreguntados.has(terceroId);

/** El cliente no tiene cédula: se avisa y se le puede cargar ahí mismo. Si ya la tiene, este modal no se muestra. */
export function CedulaFaltanteModal({ terceroId, nombre, onGuardada, onCerrar }: { terceroId: number; nombre: string; onGuardada: () => void; onCerrar: () => void }) {
  const [cedula, setCedula] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ahoraNo() {
    yaPreguntados.add(terceroId);
    onCerrar();
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const limpia = cedula.trim();
    if ((limpia.match(/\d/g) ?? []).length < 4) return setError("Escribí la cédula completa.");
    setEnviando(true);
    try {
      await actualizarCedulaTercero(terceroId, limpia);
      yaPreguntados.add(terceroId);
      onGuardada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la cédula.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Cliente sin cédula" onCerrar={ahoraNo}>
      <form className="cc-modal" onSubmit={guardar}>
        <p className="cc-modal-nota">
          <IdCard size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          <strong>{nombre}</strong> no posee cédula registrada. ¿Desea actualizarla?
        </p>
        <label>
          Cédula del cliente
          <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoFocus placeholder="ej. 1113701298 o V-12345678" maxLength={30} />
        </label>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={ahoraNo}>
            Ahora no
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando || !cedula.trim()}>
            {enviando ? "Guardando…" : "Actualizar cédula"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
