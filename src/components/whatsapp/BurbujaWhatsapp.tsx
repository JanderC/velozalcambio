import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, CheckCheck, ClipboardList, Clock, ExternalLink, ImagePlus, Maximize2, MessageCircle, Reply, Search, Send, Sticker, Users, X } from "lucide-react";
import { ApiError } from "../../api/client";
import { useTamanoBurbuja } from "./useTamanoBurbuja";
import { useAuth } from "../../auth/useAuth";
import { LINEAS_WA, whatsappApi, type ChatWa, type ConexionWa, type LineaWa, type MensajeWa } from "../../api/whatsapp.api";
import { useStreamWhatsapp } from "../../modules/whatsapp/useStreamWhatsapp";
import { etiquetaDia, fechaLista, horaCorta, imagenDelPortapapeles, resumenDeMensaje, sonarAviso, traeImagen } from "../../modules/whatsapp/utilidades";
import { STICKERS_WA } from "../../modules/whatsapp/stickers";
import { SelectorRapidas } from "../../modules/whatsapp/rapidas/SelectorRapidas";
import "./burbujaWhatsapp.css";

/** Lo que otro módulo le pide a la burbuja: abrir el chat de un teléfono en una línea, con un texto ya escrito. */
export interface PedidoAbrirChat {
  telefono: string;
  linea: LineaWa;
  nombre?: string;
  texto?: string;
}
const EVENTO_ABRIR = "wa:abrir-chat";
/** Para usar desde cualquier pantalla: abre la burbuja en el chat de ese cliente sin salir del módulo. */
export function abrirChatEnBurbuja(pedido: PedidoAbrirChat) {
  window.dispatchEvent(new CustomEvent<PedidoAbrirChat>(EVENTO_ABRIR, { detail: pedido }));
}

const ROLES = ["ADMIN", "ASESOR", "CAJERO"];
const INICIAL = (nombre: string) => (/^[+\d]/.test(nombre.trim()) ? "#" : (nombre.trim()[0] ?? "#").toUpperCase());

function ordenar(chats: ChatWa[]) {
  return [...chats].sort((a, b) => (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? ""));
}

function Ticks({ m }: { m: MensajeWa }) {
  if (m.estado === "pendiente") return <Clock size={12} aria-label="Enviando" />;
  if (m.estado === "error") return <AlertCircle size={13} aria-label="No se envió" className="wb-tick-error" />;
  if (m.estado === "enviado") return <Check size={14} aria-label="Enviado" />;
  return <CheckCheck size={14} aria-label={m.estado === "leido" ? "Leído" : "Entregado"} className={m.estado === "leido" ? "wb-tick-leido" : ""} />;
}

/**
 * La burbuja de WhatsApp que se ve en todos los módulos: avisa cuando un cliente escribe (con el número de mensajes
 * sin leer), muestra los chats de las tres líneas y deja leer y responder ahí mismo, sin salir de la pantalla.
 * En el módulo de WhatsApp no se muestra: ahí ya está la bandeja completa.
 */
export function BurbujaWhatsapp() {
  const { usuario } = useAuth();
  const ruta = useLocation().pathname;
  const visible = !!usuario && ROLES.includes(usuario.rol) && !ruta.startsWith("/whatsapp") && ruta !== "/login";
  if (!visible) return null;
  return <Burbuja />;
}

function Burbuja() {
  const [abierta, setAbierta] = useState(false);
  const tamano = useTamanoBurbuja();
  const [chats, setChats] = useState<ChatWa[]>([]);
  const [lineas, setLineas] = useState<ConexionWa[]>([]);
  const [filtroLinea, setFiltroLinea] = useState<LineaWa | null>(null);
  const [buscar, setBuscar] = useState("");
  const [chat, setChat] = useState<ChatWa | null>(null);
  const [mensajes, setMensajes] = useState<MensajeWa[]>([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [texto, setTexto] = useState("");
  // Foto a enviar: adjuntada con el botón o pegada con Ctrl+V (una captura, por ejemplo)
  const [foto, setFoto] = useState<File | null>(null);
  const [vistaFoto, setVistaFoto] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [verStickers, setVerStickers] = useState(false);
  // El portapapeles de respuestas rápidas: tocar una la deja escrita en el mensaje
  const [verRapidas, setVerRapidas] = useState(false);
  function ponerRapida(t: string) {
    setTexto(t);
    setVerRapidas(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  }
  // El mensaje que se está respondiendo: lo que se envíe sale citándolo
  const [respondiendo, setRespondiendo] = useState<MensajeWa | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recien, setRecien] = useState(false); // acaba de llegar un mensaje: la burbuja late
  const abiertaRef = useRef(false);
  abiertaRef.current = abierta;
  const chatRef = useRef<ChatWa | null>(null);
  chatRef.current = chat;
  const finRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // ---------- Carga inicial ----------
  const cargar = useCallback(() => {
    whatsappApi
      .chats("todos", "")
      .then((lista) => setChats(ordenar(lista)))
      .catch(() => {});
    whatsappApi
      .lineas()
      .then(setLineas)
      .catch(() => {});
  }, []);
  useEffect(cargar, [cargar]);

  // ---------- Tiempo real ----------
  const conectado = useStreamWhatsapp((tipo, datos) => {
    if (tipo === "chat") {
      const c = datos as ChatWa;
      setChats((lista) => (c.archivado ? lista.filter((x) => x.jid !== c.jid) : ordenar([c, ...lista.filter((x) => x.jid !== c.jid)])));
      setChat((actual) => (actual?.jid === c.jid ? c : actual));
    }
    if (tipo === "mensaje") {
      const m = datos as MensajeWa;
      const enPantalla = abiertaRef.current && chatRef.current?.jid === m.jid && !document.hidden;
      if (chatRef.current?.jid === m.jid) {
        setMensajes((lista) => (lista.some((x) => x.id === m.id) ? lista.map((x) => (x.id === m.id ? m : x)) : [...lista, m]));
        if (m.autor === "cliente" && enPantalla) void whatsappApi.leer(m.jid).catch(() => {});
      }
      if (m.autor === "cliente" && !m.interno && !enPantalla) {
        sonarAviso();
        setRecien(true);
        setTimeout(() => setRecien(false), 4_000);
      }
    }
    if (tipo === "estado") {
      const e = datos as { id: string; estado: MensajeWa["estado"]; error: string | null };
      setMensajes((lista) => lista.map((x) => (String(x.id) === String(e.id) ? { ...x, estado: e.estado, error: e.error } : x)));
    }
    if (tipo === "conexion") {
      const c = datos as ConexionWa;
      setLineas((lista) => (lista.some((l) => l.linea === c.linea) ? lista.map((l) => (l.linea === c.linea ? { ...l, ...c } : l)) : [...lista, c]));
    }
  });
  // si se cortó el tiempo real y volvió, se relee todo (pudo haberse perdido algún mensaje)
  const estabaConectado = useRef(false);
  useEffect(() => {
    if (conectado && !estabaConectado.current) cargar();
    estabaConectado.current = conectado;
  }, [conectado, cargar]);

  useEffect(() => {
    if (!foto) return setVistaFoto(null);
    const url = URL.createObjectURL(foto);
    setVistaFoto(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  // Pegar una imagen en la casilla del mensaje la deja lista para enviar. Se frena ahí mismo para que la pantalla
  // de atrás (ej. Confirmaciones, que lee comprobantes pegados) no la tome también.
  function alPegar(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!traeImagen(e.clipboardData)) return; // texto: se pega normal
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    void imagenDelPortapapeles(e.clipboardData).then((imagen) => {
      if (!imagen) return setError("No se pudo leer esa imagen. Probá adjuntarla con el botón de foto.");
      setError(null);
      setFoto(imagen);
    });
  }

  // ---------- Abrir un chat ----------
  const abrirChat = useCallback(async (c: ChatWa, textoInicial?: string) => {
    setChat(c);
    setMensajes([]);
    setError(null);
    setTexto(textoInicial ?? "");
    setFoto(null);
    setVerStickers(false);
    setRespondiendo(null);
    setCargandoChat(true);
    try {
      const r = await whatsappApi.mensajes(c.jid);
      if (chatRef.current?.jid !== c.jid) return;
      setMensajes(r.mensajes);
      if (c.noLeidos > 0) await whatsappApi.leer(c.jid);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los mensajes.");
    } finally {
      setCargandoChat(false);
      areaRef.current?.focus();
    }
  }, []);

  // Otro módulo pide abrir el chat de un cliente (ej. Confirmaciones, para avisarle sin salir de la pantalla)
  useEffect(() => {
    const alPedir = (ev: Event) => {
      const p = (ev as CustomEvent<PedidoAbrirChat>).detail;
      setAbierta(true);
      setError(null);
      whatsappApi
        .abrirChat(p.telefono, p.linea, p.nombre)
        .then((c) => abrirChat(c, p.texto))
        .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo abrir el chat."));
    };
    window.addEventListener(EVENTO_ABRIR, alPedir);
    return () => window.removeEventListener(EVENTO_ABRIR, alPedir);
  }, [abrirChat]);

  // siempre al último mensaje
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes, chat]);

  async function enviar() {
    const t = texto.trim();
    if (!chat || (!t && !foto) || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      // con foto, el texto va como pie de foto
      if (foto) await whatsappApi.enviarImagen(chat.jid, foto, t, respondiendo?.id);
      else await whatsappApi.enviar(chat.jid, t, respondiendo?.id);
      setTexto("");
      setFoto(null);
      setRespondiendo(null);
    } catch (e) {
      // acá llegan las protecciones: "ya se le escribió y no respondió", "esa línea no está conectada"…
      setError(e instanceof ApiError ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      setEnviando(false);
      areaRef.current?.focus();
    }
  }
  // Los stickers del negocio salen al tocarlos
  async function enviarSticker(id: string) {
    if (!chat || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await whatsappApi.enviarSticker(chat.jid, id, respondiendo?.id);
      setRespondiendo(null);
      setVerStickers(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar el sticker.");
    } finally {
      setEnviando(false);
    }
  }
  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  // ---------- Lo que se muestra ----------
  const sinLeerDe = useCallback((linea: LineaWa | null) => chats.filter((c) => !linea || c.linea === linea).reduce((s, c) => s + c.noLeidos, 0), [chats]);
  const totalSinLeer = sinLeerDe(null);
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return chats
      .filter((c) => !filtroLinea || c.linea === filtroLinea)
      .filter((c) => !q || c.nombre.toLowerCase().includes(q) || (digitos.length >= 3 && c.telefono.includes(digitos)) || (c.ultimoMensaje ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(b.noLeidos > 0) - Number(a.noLeidos > 0) || (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? ""));
  }, [chats, filtroLinea, buscar]);
  const lineaDe = (id: LineaWa) => lineas.find((l) => l.linea === id);
  const lineaDelChat = chat ? lineaDe(chat.linea) : undefined;
  const chatSinLinea = !!chat && lineaDelChat?.estado !== "CONECTADO";

  // título de la pestaña con los sin leer, para verlo aunque el sistema esté en otra pestaña
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = totalSinLeer > 0 ? `(${totalSinLeer}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [totalSinLeer]);

  return (
    <div className="wb-raiz">
      {abierta && (
        <section className="wb-panel" role="dialog" aria-label="Chats de WhatsApp" style={tamano.estilo}>
          {/* Se estira desde esta esquina: crece hacia arriba y hacia la izquierda, y queda guardado */}
          <span className="wb-estirar" onPointerDown={tamano.alEmpezarAEstirar} title="Arrastrá para agrandar o achicar la ventana" aria-hidden="true" />
          {chat ? (
            // ---------- Una conversación ----------
            <>
              <header className="wb-cabeza">
                <button className="wb-icono" onClick={() => setChat(null)} aria-label="Volver a la lista de chats">
                  <ArrowLeft size={18} />
                </button>
                <span className={`wb-avatar ${chat.esGrupo ? "grupo" : ""}`}>{chat.esGrupo ? <Users size={18} aria-label="Grupo" /> : INICIAL(chat.nombre)}</span>
                <div className="wb-cabeza-datos">
                  <strong>{chat.nombre}</strong>
                  <span>{chat.esGrupo ? `Grupo · línea ${chat.nombreLinea}` : `+${chat.telefono} · línea ${chat.nombreLinea}`}</span>
                </div>
                <button className="wb-icono wb-letra" onClick={tamano.pasarLetra} title={`Cambiar el tamaño de la letra (pasa a ${tamano.letraSiguiente})`} aria-label={`Cambiar el tamaño de la letra a ${tamano.letraSiguiente}`}>
                  Aa
                </button>
                <button className="wb-icono wb-tamano" onClick={tamano.pasarAlSiguiente} title={`Cambiar el tamaño de la ventana (pasa a ${tamano.siguiente}). También se estira desde la esquina de arriba a la izquierda.`} aria-label={`Cambiar el tamaño de la ventana a ${tamano.siguiente}`}>
                  <Maximize2 size={15} />
                </button>
                <Link className="wb-icono" to="/whatsapp" title="Abrir el módulo de WhatsApp" aria-label="Abrir el módulo de WhatsApp">
                  <ExternalLink size={16} />
                </Link>
                <button className="wb-icono" onClick={() => setAbierta(false)} aria-label="Cerrar">
                  <X size={18} />
                </button>
              </header>

              <div className="wb-mensajes">
                {cargandoChat && <p className="wb-aviso">Cargando…</p>}
                {!cargandoChat && mensajes.length === 0 && (
                  <p className="wb-aviso">
                    {chat.esGrupo ? "Todavía no hay mensajes de este grupo guardados acá." : chat.frio ? "Este cliente todavía no le escribió a esta línea. Se le puede mandar un solo mensaje hasta que responda." : "Sin mensajes todavía."}
                  </p>
                )}
                {mensajes.map((m, i) => {
                  const cambiaDia = i === 0 || new Date(mensajes[i - 1]!.fecha).toDateString() !== new Date(m.fecha).toDateString();
                  return (
                    <div key={m.id}>
                      {cambiaDia && <div className="wb-dia">{etiquetaDia(m.fecha)}</div>}
                      {m.interno ? (
                        <div className="wb-nota">{m.texto}</div>
                      ) : (
                        <div className={`wb-fila ${m.deMi ? "mia" : "suya"}`}>
                          <div className={`wb-globo ${m.estado === "error" ? "error" : ""}`}>
                            {!m.deMi && m.remitente && <b className="wb-remitente">{m.remitente}</b>}
                            {m.cita && (
                              <span className={`wb-cita ${m.cita.deMi ? "mia" : "suya"}`}>
                                <b>{m.cita.deMi ? "Tú" : "Cliente"}</b>
                                <span>{m.cita.texto}</span>
                              </span>
                            )}
                            {m.estado !== "error" && m.estado !== "pendiente" && (
                              <button
                                className="wb-responder"
                                onClick={() => {
                                  setRespondiendo(m);
                                  areaRef.current?.focus();
                                }}
                                aria-label="Responder a este mensaje"
                                title="Responder a este mensaje"
                              >
                                <Reply size={14} />
                              </button>
                            )}
                            {(m.tipo === "imagen" || m.tipo === "sticker") &&
                              (m.mediaUrl ? (
                                <a href={m.mediaUrl} target="_blank" rel="noreferrer" title="Ver la foto en grande">
                                  <img src={m.mediaUrl} alt={m.texto ?? "Foto"} loading="lazy" />
                                </a>
                              ) : (
                                <em>📷 Foto no disponible</em>
                              ))}
                            {m.tipo === "audio" && (m.mediaUrl ? <audio controls preload="none" src={m.mediaUrl} /> : <em>🎤 Nota de voz</em>)}
                            {m.tipo === "video" && (m.mediaUrl ? <video controls preload="none" src={m.mediaUrl} /> : <em>🎥 Video</em>)}
                            {m.tipo === "documento" && (
                              <a href={m.mediaUrl ?? undefined} target="_blank" rel="noreferrer">
                                📄 {m.texto ?? "Documento"}
                              </a>
                            )}
                            {m.texto && m.tipo !== "documento" && <p>{m.texto}</p>}
                            <span className="wb-meta">
                              {horaCorta(m.fecha)}
                              {m.deMi && <Ticks m={m} />}
                            </span>
                            {m.estado === "error" && m.error && <span className="wb-no-salio">No se envió: {m.error}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={finRef} />
              </div>

              {error && (
                <p className="wb-error" role="alert">
                  {error}
                </p>
              )}
              {chatSinLinea && !error && <p className="wb-error suave">La línea {chat.nombreLinea} no está conectada: los mensajes no salen hasta que se vincule de nuevo.</p>}
              {respondiendo && (
                <div className="wb-respondiendo">
                  <Reply size={15} />
                  <span>
                    <b>Respondiendo a {respondiendo.deMi ? "tu mensaje" : "su mensaje"}</b>
                    <span>{resumenDeMensaje(respondiendo) || "Mensaje"}</span>
                  </span>
                  <button onClick={() => setRespondiendo(null)} aria-label="No responder a ese mensaje">
                    <X size={14} />
                  </button>
                </div>
              )}
              {vistaFoto && (
                <div className="wb-foto">
                  <img src={vistaFoto} alt="Foto a enviar" />
                  <span>Lista para enviar. Lo que escribas abajo va como pie de foto.</span>
                  <button onClick={() => setFoto(null)} aria-label="Quitar la foto">
                    <X size={15} />
                  </button>
                </div>
              )}
              {verRapidas && <SelectorRapidas compacto onElegir={ponerRapida} onCerrar={() => setVerRapidas(false)} />}
              {verStickers && (
                <div className="wb-stickers" role="listbox" aria-label="Stickers">
                  {STICKERS_WA.map((s) => (
                    <button key={s.id} onClick={() => void enviarSticker(s.id)} disabled={enviando} title={`Enviar el sticker ${s.nombre}`} aria-label={`Enviar el sticker ${s.nombre}`}>
                      <img src={s.src} alt={s.nombre} />
                    </button>
                  ))}
                </div>
              )}
              <div className="wb-redactar">
                <button
                  className={`wb-adjuntar ${verStickers ? "activo" : ""}`}
                  onClick={() => {
                    setVerStickers((v) => !v);
                    setVerRapidas(false);
                  }}
                  aria-label="Stickers"
                  title="Stickers"
                >
                  <Sticker size={19} />
                </button>
                <button
                  className={`wb-adjuntar ${verRapidas ? "activo" : ""}`}
                  onClick={() => {
                    setVerRapidas((v) => !v);
                    setVerStickers(false);
                  }}
                  aria-label="Respuestas rápidas"
                  title="Respuestas rápidas"
                >
                  <ClipboardList size={19} />
                </button>
                <button className="wb-adjuntar" onClick={() => archivoRef.current?.click()} aria-label="Adjuntar una foto" title="Adjuntar una foto (o pegala con Ctrl+V)">
                  <ImagePlus size={19} />
                </button>
                <input
                  ref={archivoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => {
                    setFoto(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <textarea
                  ref={areaRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={alTeclear}
                  onPaste={alPegar}
                  rows={texto.includes("\n") || texto.length > 60 ? 3 : 1}
                  placeholder="Mensaje (Enter envía) · Ctrl+V pega una imagen"
                  aria-label="Mensaje"
                  maxLength={4000}
                />
                <button className="wb-enviar" onClick={() => void enviar()} disabled={enviando || (!texto.trim() && !foto)} aria-label="Enviar mensaje" title="Enviar">
                  <Send size={18} />
                </button>
              </div>
            </>
          ) : (
            // ---------- La lista de chats ----------
            <>
              <header className="wb-cabeza">
                <span className="wb-logo">
                  <MessageCircle size={18} />
                </span>
                <div className="wb-cabeza-datos">
                  <strong>WhatsApp</strong>
                  <span>{totalSinLeer > 0 ? `${totalSinLeer} ${totalSinLeer === 1 ? "mensaje sin leer" : "mensajes sin leer"}` : conectado ? "Al día" : "Reconectando…"}</span>
                </div>
                <button className="wb-icono wb-letra" onClick={tamano.pasarLetra} title={`Cambiar el tamaño de la letra (pasa a ${tamano.letraSiguiente})`} aria-label={`Cambiar el tamaño de la letra a ${tamano.letraSiguiente}`}>
                  Aa
                </button>
                <button className="wb-icono wb-tamano" onClick={tamano.pasarAlSiguiente} title={`Cambiar el tamaño de la ventana (pasa a ${tamano.siguiente}). También se estira desde la esquina de arriba a la izquierda.`} aria-label={`Cambiar el tamaño de la ventana a ${tamano.siguiente}`}>
                  <Maximize2 size={15} />
                </button>
                <Link className="wb-icono" to="/whatsapp" title="Abrir el módulo de WhatsApp" aria-label="Abrir el módulo de WhatsApp">
                  <ExternalLink size={16} />
                </Link>
                <button className="wb-icono" onClick={() => setAbierta(false)} aria-label="Cerrar">
                  <X size={18} />
                </button>
              </header>

              <div className="wb-lineas" role="tablist" aria-label="Línea de WhatsApp">
                <button role="tab" aria-selected={filtroLinea === null} className={filtroLinea === null ? "activo" : ""} onClick={() => setFiltroLinea(null)}>
                  Todas
                </button>
                {LINEAS_WA.map((l) => {
                  const estado = lineaDe(l.id)?.estado;
                  const n = sinLeerDe(l.id);
                  return (
                    <button
                      key={l.id}
                      role="tab"
                      aria-selected={filtroLinea === l.id}
                      className={filtroLinea === l.id ? "activo" : ""}
                      onClick={() => setFiltroLinea(l.id)}
                      title={estado === "CONECTADO" ? `Línea ${l.nombre}: conectada` : `Línea ${l.nombre}: sin vincular o desconectada`}
                    >
                      <i className={estado === "CONECTADO" ? "ok" : "mal"} />
                      {l.nombre}
                      {n > 0 && <b>{n}</b>}
                    </button>
                  );
                })}
              </div>

              <div className="wb-buscar">
                <Search size={15} />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, teléfono o mensaje" aria-label="Buscar chat" />
              </div>
              {error && (
                <p className="wb-error" role="alert">
                  {error}
                </p>
              )}

              <ul className="wb-lista">
                {lista.map((c) => (
                  <li key={c.jid}>
                    <button onClick={() => void abrirChat(c)} className={c.noLeidos > 0 ? "sin-leer" : ""}>
                      <span className={`wb-avatar ${c.esGrupo ? "grupo" : ""}`}>{c.esGrupo ? <Users size={18} aria-label="Grupo" /> : INICIAL(c.nombre)}</span>
                      <span className="wb-item">
                        <span className="wb-item-fila">
                          <strong>{c.nombre}</strong>
                          <time>{fechaLista(c.ultimoMensajeEn)}</time>
                        </span>
                        <span className="wb-item-fila">
                          <span className="wb-ultimo">{c.ultimoMensaje ?? ""}</span>
                          <span className={`wb-etiqueta l${c.linea}`}>{c.nombreLinea}</span>
                          {c.noLeidos > 0 && <b className="wb-contador">{c.noLeidos}</b>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {lista.length === 0 && (
                  <li className="wb-aviso">
                    {buscar
                      ? "Ningún chat coincide."
                      : lineas.length > 0 && !lineas.some((l) => l.estado === "CONECTADO")
                        ? "Todavía no hay ninguna línea vinculada. Se vinculan en WhatsApp → Líneas."
                        : "Todavía no hay chats."}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>
      )}

      <button
        className={`wb-boton ${totalSinLeer > 0 ? "con-nuevos" : ""} ${recien ? "late" : ""}`}
        onClick={() => setAbierta((a) => !a)}
        aria-label={totalSinLeer > 0 ? `WhatsApp: ${totalSinLeer} mensajes sin leer` : "Abrir los chats de WhatsApp"}
        aria-expanded={abierta}
        title="Chats de WhatsApp"
      >
        {abierta ? <X size={24} /> : <MessageCircle size={26} />}
        {totalSinLeer > 0 && !abierta && <span className="wb-globito">{totalSinLeer > 99 ? "99+" : totalSinLeer}</span>}
      </button>
    </div>
  );
}
