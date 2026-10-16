import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { actualizarTercero, type TipoTercero } from "../../api/terceros.api";
import { ApiError } from "../../api/client";
import type { CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";

/** Corregir o completar los datos del cliente de la cuenta: nombre, qué es (cliente, eventual…), teléfono y cédula. */
export function EditarClienteModal({ cuenta, onGuardado, onCerrar }: { cuenta: CuentaCorrienteResumen; onGuardado: () => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(cuenta.tercero_nombre);
  const [telefono, setTelefono] = useState(cuenta.tercero_telefono ?? "");
  const [cedula, setCedula] = useState(cuenta.tercero_identificacion ?? "");
  const [tipo, setTipo] = useState<TipoTercero>(cuenta.tercero_tipo);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombre.trim().length < 2) return setError("Escribí el nombre.");
    setEnviando(true);
    try {
      // la cédula es única en el sistema: vacía no se manda (no se puede dejar en blanco dos veces)
      await actualizarTercero(cuenta.tercero_id, { nombre: nombre.trim(), tipo, telefono: telefono.trim(), identificacion: cedula.trim() || undefined });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron guardar los datos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Datos del cliente" onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={guardar}>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <label>
          Es
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTercero)}>
            <option value="CLIENTE">Cliente</option>
            <option value="EVENTUAL">Cliente eventual</option>
            <option value="PROVEEDOR">Proveedor</option>
            <option value="MIXTO">Cliente y proveedor</option>
            <option value="AMIGO">Amigo</option>
          </select>
        </label>
        <label>
          Número de teléfono
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Con él se le envían los mensajes por WhatsApp" />
        </label>
        <label>
          Cédula
          <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" placeholder="Para encontrarlo después por la cédula" />
        </label>
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
