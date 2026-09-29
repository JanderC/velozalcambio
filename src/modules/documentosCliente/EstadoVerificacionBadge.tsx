import { CircleAlert, CircleCheck, CircleDashed, Clock } from "lucide-react";
import type { EstadoVerificacion } from "../../api/documentosTercero.api";

const ESTADOS: Record<EstadoVerificacion, { clase: string; texto: string; Icono: typeof CircleCheck }> = {
  VERIFICADO: { clase: "verificado", texto: "Verificado", Icono: CircleCheck },
  PENDIENTE_REVISION: { clase: "revision", texto: "Documentos en revisión", Icono: Clock },
  NO_VERIFICADO: { clase: "no-verificado", texto: "Sin documento de identidad aprobado", Icono: CircleAlert },
  SIN_DOCUMENTOS: { clase: "sin-documentos", texto: "Sin documentos", Icono: CircleDashed },
};

export function EstadoVerificacionBadge({ estado }: { estado: EstadoVerificacion }) {
  const { clase, texto, Icono } = ESTADOS[estado];
  return (
    <span className={`doc-verificacion doc-verificacion-${clase}`}>
      <Icono size={14} /> {texto}
    </span>
  );
}
