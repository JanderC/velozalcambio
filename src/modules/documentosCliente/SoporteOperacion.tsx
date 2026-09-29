import { useState } from "react";
import { CircleCheck, Paperclip } from "lucide-react";
import { etiquetaTipoDocumento } from "../../api/documentosTercero.api";
import { Modal } from "../../components/common/Modal";
import { SubirDocumentoForm } from "./SubirDocumentoForm";
import "./documentosCliente.css";

// Después de registrar un cambio: adjuntar el soporte (origen de fondos, comprobante, etc.)
// vinculado a esa transacción. Pensado para operaciones de monto alto.
export function SoporteOperacion({
  terceroId,
  transaccionId,
  onSubido,
}: {
  terceroId: number;
  transaccionId: number;
  onSubido?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [subidos, setSubidos] = useState<string[]>([]);

  return (
    <div className="doc-soporte">
      <div>
        <strong>Soporte de la operación #{transaccionId}</strong>
        {subidos.length === 0 ? (
          <span>Si el monto es alto, adjuntá el soporte de origen de fondos o el comprobante.</span>
        ) : (
          <span className="doc-soporte-ok">
            <CircleCheck size={14} className="icono-inline" /> Cargado: {subidos.join(", ")} (pendiente de revisión)
          </span>
        )}
      </div>
      <button type="button" className="doc-btn-primario" onClick={() => setAbierto(true)}>
        <Paperclip size={16} /> {subidos.length === 0 ? "Adjuntar soporte" : "Adjuntar otro"}
      </button>

      {abierto && (
        <Modal titulo={`Soporte de la operación #${transaccionId}`} onCerrar={() => setAbierto(false)}>
          <SubirDocumentoForm
            terceroId={terceroId}
            tipoInicial="ORIGEN_FONDOS"
            transaccionIdInicial={transaccionId}
            onSubido={(d) => {
              setSubidos((s) => [...s, etiquetaTipoDocumento(d.tipo)]);
              setAbierto(false);
              onSubido?.();
            }}
            onCancelar={() => setAbierto(false)}
          />
        </Modal>
      )}
    </div>
  );
}
