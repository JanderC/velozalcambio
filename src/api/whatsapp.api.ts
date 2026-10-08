import { api } from "./client";

export type EstadoConexionWa = "DESCONECTADO" | "CONECTANDO" | "ESPERANDO_QR" | "CONECTADO" | "REEMPLAZADA";

// El negocio atiende con tres WhatsApp, uno por tipo de cambio: cada línea es un teléfono vinculado
export type LineaWa = 1 | 2 | 3;
export const LINEAS_WA: { id: LineaWa; nombre: string }[] = [
  { id: 1, nombre: "Bolívares" },
  { id: 2, nombre: "Pesos" },
  { id: 3, nombre: "Dólares" },
];

export interface ConexionWa {
  linea: LineaWa;
  nombreLinea: string;
  estado: EstadoConexionWa;
  qr: string | null;
  numero: string | null;
  nombre: string | null;
  ultimoError: string | null;
  conectadoDesde: string | null;
  cola?: { enCola: number; enviadosUltimoMinuto: number; enviadosHoy: number };
  // mensajes y chats sin leer de esa línea (solo en /lineas)
  sinLeer?: { mensajes: number; chats: number };
}

export interface ChatWa {
  jid: string; // la clave del chat: lleva "#2" o "#3" si es de esas líneas
  linea: LineaWa;
  nombreLinea: string;
  telefono: string;
  nombre: string;
  nombreWhatsapp: string | null;
  nombreGuardado: string | null;
  terceroId: number | null;
  terceroNombre: string | null;
  ultimoMensaje: string | null;
  ultimoMensajeEn: string | null;
  noLeidos: number;
  botActivo: boolean;
  necesitaHumano: boolean;
  motivo: string | null;
  necesitaHumanoDesde: string | null;
  archivado: boolean;
  frio: boolean;
}

export type AutorWa = "cliente" | "bot" | "humano" | "telefono" | "sistema";
export type EstadoMensajeWa = "pendiente" | "enviado" | "entregado" | "leido" | "error";

export interface MensajeWa {
  id: string;
  jid: string;
  deMi: boolean;
  autor: AutorWa;
  tipo: "texto" | "imagen" | "audio" | "documento" | "sticker" | "video";
  texto: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  estado: EstadoMensajeWa;
  error: string | null;
  interno: boolean;
  fecha: string;
}

export type FiltroChats = "todos" | "no_leidos" | "atencion" | "bot" | "humano" | "archivados";

export interface ClienteLateral {
  chat: ChatWa;
  cliente: {
    id: number;
    nombre: string;
    identificacion: string | null;
    telefono: string | null;
    created_at: string;
    verificacion: { estado: string };
  } | null;
  operaciones: {
    id: number;
    tipo: string;
    estado: string;
    monto_origen: string;
    monto_destino: string | null;
    moneda_origen: string;
    moneda_destino: string | null;
    created_at: string;
    origen: string;
  }[];
  cuentas: { id: number; tipo: string; banco: string | null; numero_cuenta: string | null; titular: string }[];
}

export interface OutboxWa {
  id: string;
  jid: string;
  texto: string;
  estado: "EN_COLA" | "ESPERA_CLIENTE" | "ENVIANDO" | "ENVIADO" | "ERROR";
  intentos: number;
  proximo_intento: string;
  error: string | null;
  frio: boolean;
  origen: string | null;
  created_at: string;
  enviado_en: string | null;
  nombre?: string | null;
  nombre_guardado?: string | null;
  telefono?: string | null;
}

export type Proveedor = "gemini" | "openai" | "groq" | "openrouter" | "deepseek" | "anthropic";

export interface ConfigWa {
  ia: { activa: boolean; proveedor: Proveedor; modelo: string; modelosRespaldo: string[]; vision: boolean };
  personalidad: { nombreAsistente: string; instrucciones: string };
  negocio: {
    nombre: string;
    descripcion: string;
    direccion: string;
    zonaHoraria: string;
    numeroWhatsapp: string;
    infoAdicional: string;
    cotizacionesPermitidas: string[];
    cajasPorMoneda: Record<string, number>;
    minutosTasa: number;
  };
  horario: { dias: { dia: number; desde: string; hasta: string }[]; responderFueraDeHorario: boolean };
  antibloqueo: {
    porMinuto: number;
    porDia: number;
    pausaMinMs: number;
    pausaMaxMs: number;
    friosPorDia: number;
    friosPausaMinS: number;
    friosPausaMaxS: number;
    friosDesde: string;
    friosHasta: string;
    antiBucleMax: number;
    viejosMinutos: number;
  };
  dueno: { nombre: string; telefono: string; avisos: boolean; resumenCadaMin: number; silencioDesde: string; silencioHasta: string };
  panel: { respuestasRapidas: string[] };
}

export interface RespuestaConfig {
  config: ConfigWa;
  claves: Partial<Record<Proveedor, string>>;
  porDefecto?: ConfigWa;
}

export interface OpcionesConfig {
  cotizaciones: { id: number; monedaCodigo: string; tipo: "COMPRA" | "VENTA"; etiqueta: string; categoria: string; valor: string; clave: string }[];
  cajas: { id: number; nombre: string; banco: string | null; numero_cuenta: string | null; moneda: string | null }[];
  monedas: { codigo: string; nombre: string }[];
}

export interface ModeloIa {
  id: string;
  nombre: string;
  vision: boolean;
}

export interface ResultadoSimulacion {
  respuestas: string[];
  sistema: string[];
  herramientas: { nombre: string; args: Record<string, unknown>; resultado: unknown }[];
  efectos: string[];
  derivaciones: string[];
  estado: Record<string, unknown>;
  registrado: boolean;
  modelo: string;
}

const j = (jid: string) => encodeURIComponent(jid);

export const whatsappApi = {
  // Las tres líneas: estado, número vinculado, cola de envío y mensajes sin leer
  lineas: () => api.get<ConexionWa[]>("/whatsapp/lineas"),
  estado: (linea: LineaWa = 1) => api.get<ConexionWa>(`/whatsapp/estado?linea=${linea}`),
  iniciar: (linea: LineaWa = 1) => api.post<ConexionWa>(`/whatsapp/conexion/iniciar?linea=${linea}`),
  reconectar: (linea: LineaWa = 1) => api.post<ConexionWa>(`/whatsapp/conexion/reconectar?linea=${linea}`),
  pedirCodigo: (numero: string, linea: LineaWa = 1) => api.post<{ codigo: string }>(`/whatsapp/conexion/codigo?linea=${linea}`, { numero }),
  cerrarSesion: (linea: LineaWa = 1) => api.post<ConexionWa>(`/whatsapp/conexion/cerrar-sesion?linea=${linea}`),
  reset: (linea: LineaWa = 1) => api.post<ConexionWa>(`/whatsapp/conexion/reset?linea=${linea}`),

  // linea: solo los chats de ese teléfono; sin ella, los de los tres
  chats: (filtro: FiltroChats, q: string, linea?: LineaWa | null) =>
    api.get<ChatWa[]>(`/whatsapp/chats?filtro=${filtro}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}${linea ? `&linea=${linea}` : ""}`),
  // El chat de un teléfono en una línea (lo crea vacío si no existía). No envía nada.
  abrirChat: (telefono: string, linea: LineaWa, nombre?: string) => api.post<ChatWa>("/whatsapp/chats/abrir", { telefono, linea, nombre }),
  mensajes: (jid: string, opciones: { antesDe?: string; q?: string } = {}) => {
    const p = new URLSearchParams();
    if (opciones.antesDe) p.set("antesDe", opciones.antesDe);
    if (opciones.q?.trim()) p.set("q", opciones.q.trim());
    return api.get<{ mensajes: MensajeWa[]; hayMas: boolean }>(`/whatsapp/chats/${j(jid)}/mensajes?${p}`);
  },
  leer: (jid: string) => api.post<void>(`/whatsapp/chats/${j(jid)}/leer`),
  enviar: (jid: string, texto: string) => api.post<{ id: string }>(`/whatsapp/chats/${j(jid)}/mensajes`, { texto }),
  enviarImagen: (jid: string, archivo: File, texto: string) => {
    const fd = new FormData();
    fd.append("archivo", archivo);
    if (texto.trim()) fd.append("texto", texto.trim());
    return api.postForm<{ id: string }>(`/whatsapp/chats/${j(jid)}/imagen`, fd);
  },
  // Un sticker del negocio ("pago", "pagos-y-salvos"): sale como sticker de WhatsApp
  enviarSticker: (jid: string, sticker: string) => api.post<{ id: string }>(`/whatsapp/chats/${j(jid)}/sticker`, { sticker }),
  actualizarChat: (jid: string, cambios: { nombreGuardado?: string | null; archivado?: boolean; terceroId?: number | null }) =>
    api.put<ChatWa>(`/whatsapp/chats/${j(jid)}`, cambios),
  devolverAlBot: (jid: string) => api.post<ChatWa>(`/whatsapp/chats/${j(jid)}/devolver-bot`),
  tomar: (jid: string) => api.post<ChatWa>(`/whatsapp/chats/${j(jid)}/tomar`),
  instruccion: (jid: string, texto: string) => api.post<{ enviado: string }>(`/whatsapp/chats/${j(jid)}/instruccion`, { texto }),
  cliente: (jid: string) => api.get<ClienteLateral>(`/whatsapp/chats/${j(jid)}/cliente`),
  marcarComprobante: (mensajeId: string, datos: { monto?: string; referencia?: string; banco?: string }) =>
    api.post<{ registrado: true; solicitud: number; alerta?: string }>(`/whatsapp/mensajes/${mensajeId}/comprobante`, datos),
  esperando: () => api.get<ChatWa[]>("/whatsapp/atencion"),

  outbox: () => api.get<OutboxWa[]>("/whatsapp/outbox"),
  reintentarOutbox: (id: string) => api.post<void>(`/whatsapp/outbox/${id}/reintentar`),
  recibirPorWhatsapp: (txId: number) => api.get<{ url: string; codigo: string; qr: string }>(`/whatsapp/recibir/${txId}`),

  config: () => api.get<RespuestaConfig>("/whatsapp/config"),
  guardarConfig: (config: ConfigWa) => api.put<RespuestaConfig>("/whatsapp/config", config),
  guardarClave: (clave: string, proveedor?: Proveedor) =>
    api.put<RespuestaConfig & { proveedor: Proveedor }>("/whatsapp/config/clave", { clave, proveedor }),
  opciones: () => api.get<OpcionesConfig>("/whatsapp/config/opciones"),
  modelos: (proveedor: Proveedor) => api.get<ModeloIa[]>(`/whatsapp/ia/modelos?proveedor=${proveedor}`),
  probar: (proveedor: Proveedor, modelo: string) =>
    api.post<{ ok: boolean; usaHerramientas?: boolean; respuesta?: string; modelo?: string; ms?: number; error?: string }>("/whatsapp/ia/probar", {
      proveedor,
      modelo,
    }),
  simular: (entrada: { historial: { rol: "cliente" | "bot" | "sistema"; texto: string }[]; estado?: Record<string, unknown>; registrado?: boolean }) =>
    api.post<ResultadoSimulacion>("/whatsapp/ia/simular", entrada),
};

/** URL del stream SSE (EventSource no manda cabeceras: el token va en la query). */
export function urlStreamWhatsapp() {
  const token = localStorage.getItem("token") ?? "";
  return `${import.meta.env.VITE_API_URL}/whatsapp/stream?token=${encodeURIComponent(token)}`;
}
