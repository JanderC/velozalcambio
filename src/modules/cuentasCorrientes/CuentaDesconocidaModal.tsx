import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Modal } from "../../components/common/Modal";

/** Lo que dice el capture de origen y destino, cuando ninguna es una cuenta de la empresa. */
export interface CuentasDelCapture {
  origen: string | null;
  destino: string | null;
}

/** ¿Es una cuenta o un teléfono de Venezuela? (0102****8515, 0102-0123-…, 04141234567): ahí están las cuentas de la empresa. */
export function esCuentaVenezolana(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return /^01\d{2}/.test(d) || /^(?:58)?0?4\d{9}$/.test(d);
}

/**
 * El capture dice una cuenta (o un teléfono de pago móvil) que no es ninguna de las cuentas registradas de la empresa.
 * Para seguir hay que confirmar dos veces: marcar que se revisó y después "registrar igual".
 */
export function CuentaDesconocidaModal({ cuentas, onResponder }: { cuentas: CuentasDelCapture; onResponder: (seguir: boolean) => void }) {
  const [revisado, setRevisado] = useState(false);
  return (
    <Modal titulo="La cuenta no es de las registradas" onCerrar={() => onResponder(false)}>
      <div className="cc-modal cc-cuenta-desconocida">
        <p className="cc-modal-nota">
          <ShieldAlert size={18} style={{ verticalAlign: "-4px", marginRight: 6, color: "#b45309" }} />
          El capture no llegó a ninguna de las cuentas registradas de la empresa (ni salió de ellas):
        </p>
        <ul>
          {cuentas.destino && (
            <li>
              Destino (donde llegó): <b>{cuentas.destino}</b>
            </li>
          )}
          {cuentas.origen && (
            <li>
              Origen (de donde salió): <b>{cuentas.origen}</b>
            </li>
          )}
        </ul>
        <p>Revisá que la plata haya llegado de verdad a una cuenta nuestra. Si sigue, no se alimenta ninguna cuenta de Capital de giros.</p>
        <label className="cc-check-doble">
          <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
          Revisé el capture y la cuenta: quiero registrarla igual
        </label>
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={() => onResponder(false)} autoFocus>
            No registrar
          </button>
          <button type="button" className="cc-guardar cc-peligro" disabled={!revisado} onClick={() => onResponder(true)}>
            Sí, registrar igual
          </button>
        </div>
      </div>
    </Modal>
  );
}
