import { useState, type FormEvent } from "react";
import { UserCheck, Users } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import type { QuienRetira, SolicitudTaquilla } from "../../api/taquilla.api";

/**
 * Antes de pagar en efectivo: ¿lo retira el mismo cliente (ya viene marcado) u otra persona? Los datos de quien
 * retira son opcionales: se guarda lo que se escriba con la solicitud, y va en el mensaje al cliente.
 */
export function QuienRetiraModal({
  solicitud: s,
  monto,
  onPagar,
  onCerrar,
}: {
  solicitud: SolicitudTaquilla;
  monto: string;
  onPagar: (retira: QuienRetira | null) => void;
  onCerrar: () => void;
}) {
  const [esCliente, setEsCliente] = useState(true);
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = { nombre: nombre.trim(), cedula: cedula.trim(), telefono: telefono.trim() };
    onPagar(esCliente || !(r.nombre || r.cedula || r.telefono) ? null : r);
  }

  return (
    <Modal titulo="¿Quién retira?" onCerrar={onCerrar}>
      <form className="tq-retira" onSubmit={enviar}>
        <p>
          Se le entregan <b>{monto}</b> en efectivo. Se descuenta de la caja de taquilla.
        </p>
        <button type="button" className={`tq-retira-opcion ${esCliente ? "activo" : ""}`} onClick={() => setEsCliente(true)}>
          <UserCheck size={20} />
          <span>
            <b>Es el mismo cliente</b>
            <small>
              {s.cliente_nombre}
              {s.cliente_cedula ? ` · C.I. ${s.cliente_cedula}` : ""}
              {s.cliente_telefono ? ` · Telf. ${s.cliente_telefono}` : ""}
            </small>
          </span>
        </button>
        <button type="button" className={`tq-retira-opcion ${!esCliente ? "activo" : ""}`} onClick={() => setEsCliente(false)}>
          <Users size={20} />
          <span>
            <b>Retira otra persona</b>
            <small>Opcional: sus datos quedan guardados</small>
          </span>
        </button>
        {!esCliente && (
          <fieldset>
            <label>
              Nombre y apellido (opcional)
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus autoComplete="off" />
            </label>
            <label>
              Cédula (opcional)
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoComplete="off" />
            </label>
            <label>
              Teléfono (opcional)
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="off" />
            </label>
          </fieldset>
        )}
        <div className="tq-retira-botones">
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="tq-pagar" autoFocus>
            Se pagó
          </button>
        </div>
      </form>
    </Modal>
  );
}
