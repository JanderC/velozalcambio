import { api } from "./client";

export type TipoDocumento = "CEDULA" | "RIF" | "PASAPORTE" | "COMPROBANTE_DOMICILIO" | "ORIGEN_FONDOS" | "COMPROBANTE_PAGO" | "OTRO";
export type EstadoDocumento = "PENDIENTE" | "APROBADO" | "RECHAZADO";
export type EstadoVerificacion = "VERIFICADO" | "PENDIENTE_REVISION" | "NO_VERIFICADO" | "SIN_DOCUMENTOS";

export const TIPOS_DOCUMENTO: { valor: TipoDocumento; label: string }[] = [
  { valor: "CEDULA", label: "Cédula" },
  { valor: "RIF", label: "RIF" },
  { valor: "PASAPORTE", label: "Pasaporte" },
  { valor: "COMPROBANTE_DOMICILIO", label: "Comprobante de domicilio" },
  { valor: "ORIGEN_FONDOS", label: "Soporte de origen de fondos" },
  { valor: "COMPROBANTE_PAGO", label: "Comprobante de pago (captura)" },
  { valor: "OTRO", label: "Otro" },
];

export function etiquetaTipoDocumento(tipo: TipoDocumento) {
  return TIPOS_DOCUMENTO.find((t) => t.valor === tipo)?.label ?? tipo;
}

export interface VerificacionTercero {
  estado: EstadoVerificacion;
  aprobados: number;
  pendientes: number;
  rechazados: number;
  vencidos: number;
  tiposAprobados: TipoDocumento[];
}

export interface DocumentoTercero {
  id: number;
  tercero_id: number;
  transaccion_id: number | null;
  tipo: TipoDocumento;
  descripcion: string | null;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  fecha_vencimiento: string | null; // "AAAA-MM-DD" tal cual; no pasar por new Date()
  estado: EstadoDocumento;
  motivo_rechazo: string | null;
  revisado_en: string | null;
  created_at: string;
  vencido: boolean;
  subido_por_id: number;
  subido_por_nombre: string;
  revisado_por_id: number | null;
  revisado_por_nombre: string | null;
}

export interface ArchivoDocumento {
  url: string;
  mimeType: string;
  expiraEnSegundos: number;
}

export interface SubirDocumentoInput {
  archivo: File;
  tipo: TipoDocumento;
  descripcion?: string;
  fechaVencimiento?: string;
  transaccionId?: number;
}

export type RevisionDocumento = { estado: "APROBADO" } | { estado: "RECHAZADO"; motivo: string };

export const TAMANO_MAXIMO_DOCUMENTO_MB = 10;
export const MIME_DOCUMENTO = "image/jpeg,image/png,image/webp,application/pdf";

export function getVerificacionTercero(terceroId: number) {
  return api.get<VerificacionTercero>(`/terceros/${terceroId}/verificacion`);
}

export function getDocumentosTercero(terceroId: number) {
  return api.get<DocumentoTercero[]>(`/terceros/${terceroId}/documentos`);
}

// multipart/form-data: postForm no pone Content-Type, el navegador arma el boundary.
export function subirDocumentoTercero(terceroId: number, input: SubirDocumentoInput) {
  const fd = new FormData();
  fd.append("archivo", input.archivo);
  fd.append("tipo", input.tipo);
  if (input.descripcion) fd.append("descripcion", input.descripcion);
  if (input.fechaVencimiento) fd.append("fechaVencimiento", input.fechaVencimiento);
  if (input.transaccionId) fd.append("transaccionId", String(input.transaccionId));
  return api.postForm<DocumentoTercero>(`/terceros/${terceroId}/documentos`, fd);
}

// El enlace vence a los 5 minutos: se pide cada vez que se presiona "Ver", nunca se guarda.
export function getArchivoDocumento(documentoId: number) {
  return api.get<ArchivoDocumento>(`/terceros/documentos/${documentoId}/archivo`);
}

export function revisarDocumento(documentoId: number, revision: RevisionDocumento) {
  return api.post<DocumentoTercero>(`/terceros/documentos/${documentoId}/revisar`, revision);
}
