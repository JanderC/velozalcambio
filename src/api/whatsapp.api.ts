import { api } from "./client";

export interface EstadoWhatsapp {
  estado: "DESCONECTADO" | "ESPERANDO_QR" | "CONECTADO";
  qr: string | null;
}

export interface MensajeWhatsapp {
  id: number;
  telefono: string;
  nombre_contacto: string | null;
  mensaje: string;
  monto_detectado: string | null;
  moneda_codigo: string | null;
  tercero_id: number | null;
  tercero_nombre: string | null;
  estado: "SIN_REVISAR" | "CONVERTIDO" | "DESCARTADO";
  created_at: string;
}

export function getEstadoWhatsapp() {
  return api.get<EstadoWhatsapp>("/whatsapp/estado");
}
export function iniciarWhatsapp() {
  return api.post<EstadoWhatsapp>("/whatsapp/iniciar");
}
export function getMensajesWhatsapp(estado?: string) {
  return api.get<MensajeWhatsapp[]>(`/whatsapp/mensajes${estado ? `?estado=${estado}` : ""}`);
}
export function marcarMensajeWhatsapp(id: number, estado: "CONVERTIDO" | "DESCARTADO", terceroId?: number) {
  return api.put(`/whatsapp/mensajes/${id}`, { estado, terceroId });
}
export function getConfiguracionWhatsapp() {
  return api.get<{ respuesta_automatica_activa: boolean; mensaje_automatico: string }>("/whatsapp/configuracion");
}
export function actualizarConfiguracionWhatsapp(activa: boolean, mensaje: string) {
  return api.put("/whatsapp/configuracion", { activa, mensaje });
}