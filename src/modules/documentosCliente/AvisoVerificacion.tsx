import { useEffect, useState } from "react";
import { TriangleAlert, Upload } from "lucide-react";
import { getVerificacionTercero, type VerificacionTercero } from "../../api/documentosTercero.api";
import { EstadoVerificacionBadge } from "./EstadoVerificacionBadge";
import "./documentosCliente.css";

// Aviso en las pantallas de cambio de divisas. Solo informa: nunca bloquea la operación.
// `recargar` cambia cuando se sube un documento desde la misma pantalla.
export function AvisoVerificacion({
  terceroId,
  recargar = 0,
  onSubirDocumento,
}: {
  terceroId: number;
  recargar?: number;
  onSubirDocumento?: () => void;
}) {
  const [verificacion, setVerificacion] = useState<VerificacionTercero | null>(null);

  useEffect(() => {
    let vigente = true;
    getVerificacionTercero(terceroId)
      .then((v) => { if (vigente) setVerificacion(v); })
      .catch(() => { if (vigente) setVerificacion(null); });
    return () => { vigente = false; };
  }, [terceroId, recargar]);

  if (!verificacion || verificacion.estado === "VERIFICADO") return null;

  return (
    <div className="doc-aviso-cambio">
      <TriangleAlert size={18} />
      <div className="doc-aviso-cambio-texto">
        <strong>Cliente sin documentos verificados</strong>
        <span>
          <EstadoVerificacionBadge estado={verificacion.estado} /> Podés seguir con la operación; si el monto es alto, cargá la documentación.
        </span>
      </div>
      {onSubirDocumento && (
        <button type="button" className="doc-btn-mini" onClick={onSubirDocumento}>
          <Upload size={14} /> Subir documento
        </button>
      )}
    </div>
  );
}
