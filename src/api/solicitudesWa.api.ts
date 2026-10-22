import { api } from "./client";

export type TipoSolicitudWa = "TASA" | "CUENTA" | "COMPROBANTE" | "PAGO" | "CONFIRMAR" | "RETIRO" | "COMPRA";

/** Lo que pidió un cliente por WhatsApp (uno o varios mensajes seguidos de lo mismo). */
export interface SolicitudWa {
  id: number;
  jid: string; // el chat (con su línea)
  linea: 1 | 2 | 3;
  tipo: TipoSolicitudWa;
  texto: string | null;
  datos: { medio?: string; moneda?: string; monto?: string };
  mensajes: number;
  estado: "PENDIENTE" | "ATENDIDA" | "DESCARTADA";
  nota: string | null;
  created_at: string;
  updated_at: string;
  atendida_en: string | null;
  atendida_por_nombre: string | null;
  nombre: string | null; // como sale en WhatsApp
  nombre_guardado: string | null;
  telefono: string | null;
  cliente: string | null; // el cliente del sistema, si el chat está vinculado
}

export const solicitudesWaApi = {
  listar: (estado: "PENDIENTE" | "ATENDIDA") => api.get<SolicitudWa[]>(`/solicitudes-wa?estado=${estado}`),
  contador: () => api.get<Record<string, number>>("/solicitudes-wa/contador"),
  atender: (id: number, nota?: string) => api.post<{ id: number }>(`/solicitudes-wa/${id}/atender`, { nota }),
  descartar: (id: number) => api.post<{ id: number }>(`/solicitudes-wa/${id}/atender`, { descartar: true }),
};
