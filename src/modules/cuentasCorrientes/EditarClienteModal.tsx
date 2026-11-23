import { useState, type FormEvent } from "react";
import { errorDatosCliente, separarNombre, unirNombre } from "./datosCliente";
import { Modal } from "../../components/common/Modal";
import { actualizarTercero, type TipoTercero } from "../../api/terceros.api";
import { ApiError } from "../../api/client";
import type { CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";

/** Corregir o completar los datos del cliente de la cuenta: nombre, qué es (cliente, eventual…), teléfono y cédula. */
export function EditarClienteModal({ cuenta, onGuardado, onCerrar }: { cuenta: CuentaCorrienteResumen; onGuardado: () => void; onCerrar: () => void }) {
  const enConfirmaciones = cuenta.modulo === "CAJA";
  // en Confirmaciones el nombre y el apellido van en casillas separadas: lo guardado se reparte
  const [nombre, setNombre] = useState(() => (enConfirmaciones ? separarNombre(cuenta.tercero_nombre).nombre : cuenta.tercero_nombre));
  const [apellido, setApellido] = useState(() => (enConfirmaciones ? separarNombre(cuenta.tercero_nombre).apellido : ""));
  const nombreCompleto = enConfirmaciones ? unirNombre(nombre, apellido) : nombre.trim();
  const [telefono, setTelefono] = useState(cuenta.tercero_telefono ?? "");
  const [cedula, setCedula] = useState(cuenta.tercero_identificacion ?? "");
  const [tipo, setTipo] = useState<TipoTercero>(cuenta.tercero_tipo);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombre.trim().length < 2) return setError("Escribí el nombre.");
    // en Confirmaciones no se pueden dejar sin apellido o sin teléfono
    if (enConfirmaciones && errorDatosCliente(nombre, apellido, telefono)) return setError(errorDatosCliente(nombre, apellido, telefono));
    setEnviando(true);
    try {
      // la cédula es única en el sistema: vacía no se manda (no se puede dejar en blanco dos veces)
      await actualizarTercero(cuenta.tercero_id, { nombre: nombreCompleto, tipo, telefono: telefono.trim(), identificacion: cedula.trim() || undefined });
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
        {enConfirmaciones ? (
          <div className="cc-modal-fila">
            <label>
              Nombre (obligatorio)
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required placeholder="ej. Daniel" />
            </label>
            <label>
              Apellido (obligatorio)
              <input value={apellido} onChange={(e) => setApellido(e.target.value)} required placeholder="ej. Pérez" />
            </label>
          </div>
        ) : (
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </label>
        )}
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
          {enConfirmaciones ? "Número de teléfono (obligatorio)" : "Número de teléfono"}
          <input required={enConfirmaciones} value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Con él se le envían los mensajes por WhatsApp" />
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
