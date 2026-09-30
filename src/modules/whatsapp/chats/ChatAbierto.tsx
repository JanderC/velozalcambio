import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Bot, IdCard, Search, UserRound, X } from "lucide-react";
import { whatsappApi, type ChatWa, type MensajeWa } from "../../../api/whatsapp.api";
import { etiquetaDia } from "../utilidades";
import { Burbuja, VisorImagen } from "./Burbuja";
import { Composer } from "./Composer";
import { iniciales } from "./ListaChats";

interface Props {
  chat: ChatWa;
  mensajes: MensajeWa[];
  hayMas: boolean;
  onVerAnteriores: () => Promise<void>;
  onCerrar: () => void;
  onChatActualizado: (c: ChatWa) => void;
  onVerCliente: () => void;
  verCliente: boolean;
  respuestasRapidas: string[];
}

export function ChatAbierto(p: Props) {
  const { chat } = p;
  const scroll = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);
  const alturaAntes = useRef<number | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<MensajeWa[] | null>(null);
  const [visor, setVisor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mantener abajo al llegar mensajes (si el usuario ya estaba abajo) y la posición al cargar anteriores
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (alturaAntes.current !== null) {
      el.scrollTop = el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    } else if (pegadoAbajo.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [p.mensajes]);

  useEffect(() => {
    if (!buscando || !q.trim()) {
      setResultados(null);
      return;
    }
    const t = setTimeout(() => {
      whatsappApi
        .mensajes(chat.jid, { q })
        .then((r) => setResultados(r.mensajes))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, buscando, chat.jid]);

  // Las fotos cargan después del primer render: si el usuario estaba abajo, se sigue abajo
  const contenido = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroll.current;
    const interior = contenido.current;
    if (!el || !interior) return;
    const obs = new ResizeObserver(() => {
      if (pegadoAbajo.current) el.scrollTop = el.scrollHeight;
    });
    obs.observe(interior);
    return () => obs.disconnect();
  }, []);

  async function anteriores() {
    alturaAntes.current = scroll.current?.scrollHeight ?? null;
    await p.onVerAnteriores();
  }

  async function accion(fn: () => Promise<ChatWa>) {
    setError(null);
    try {
      p.onChatActualizado(await fn());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const lista = resultados ?? p.mensajes;

  return (
    <section className="wa-chat" aria-label={`Chat con ${chat.nombre}`}>
      <header className="wa-chat-cabeza">
        <button className="wa-icono wa-solo-movil" onClick={p.onCerrar} aria-label="Volver a la lista">
          <ArrowLeft size={20} />
        </button>
        <span className={`wa-avatar ${chat.necesitaHumano ? "alerta" : ""}`}>{iniciales(chat.nombre)}</span>
        <button className="wa-chat-titulo" onClick={p.onVerCliente} title="Ver datos del cliente">
          <strong>{chat.nombre}</strong>
          <span>
            +{chat.telefono}
            {chat.frio ? " · nunca nos escribió" : ""}
          </span>
        </button>
        <div className="wa-chat-acciones">
          {chat.botActivo ? (
            <button className="wa-chip bot" onClick={() => accion(() => whatsappApi.tomar(chat.jid))} title="Pausar el bot y atender yo">
              <Bot size={14} /> <span>Bot activo</span>
            </button>
          ) : (
            <button className="wa-chip humano" onClick={() => accion(() => whatsappApi.devolverAlBot(chat.jid))} title="Devolver este chat al bot">
              <UserRound size={14} /> <span>Persona · </span>
              <u>devolver al bot</u>
            </button>
          )}
          <button className={`wa-icono ${buscando ? "activo" : ""}`} onClick={() => setBuscando((b) => !b)} aria-label="Buscar en el chat">
            <Search size={18} />
          </button>
          <button
            className="wa-icono"
            onClick={() => accion(() => whatsappApi.actualizarChat(chat.jid, { archivado: !chat.archivado }))}
            aria-label={chat.archivado ? "Desarchivar" : "Archivar"}
            title={chat.archivado ? "Desarchivar" : "Archivar"}
          >
            {chat.archivado ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
          <button className={`wa-icono ${p.verCliente ? "activo" : ""}`} onClick={p.onVerCliente} aria-label="Datos del cliente">
            <IdCard size={18} />
          </button>
        </div>
      </header>

      {chat.necesitaHumano && (
        <div className="wa-chat-alerta" role="status">
          ⚠ Necesita atención: {chat.motivo ?? "sin motivo"}. El bot está en pausa en este chat.
        </div>
      )}
      {error && <div className="wa-chat-alerta error">{error}</div>}

      {buscando && (
        <div className="wa-chat-buscar">
          <Search size={15} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en esta conversación" />
          {resultados && <span>{resultados.length} resultado(s)</span>}
          <button
            onClick={() => {
              setBuscando(false);
              setQ("");
            }}
            aria-label="Cerrar búsqueda"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div
        className="wa-mensajes"
        ref={scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div ref={contenido} className="wa-mensajes-contenido">
        {!resultados && p.hayMas && (
          <button className="wa-ver-anteriores" onClick={anteriores}>
            Ver mensajes anteriores
          </button>
        )}
        {lista.map((m, i) => {
          const anterior = lista[i - 1];
          const nuevoDia = !anterior || new Date(anterior.fecha).toDateString() !== new Date(m.fecha).toDateString();
          return (
            <Fragment key={m.id}>
              {nuevoDia && <div className="wa-dia">{etiquetaDia(m.fecha)}</div>}
              <Burbuja mensaje={m} resaltar={resultados ? q : undefined} onVerImagen={setVisor} />
            </Fragment>
          );
        })}
        </div>
      </div>

      <Composer jid={chat.jid} botActivo={chat.botActivo} respuestasRapidas={p.respuestasRapidas} />
      {visor && <VisorImagen url={visor} onCerrar={() => setVisor(null)} />}
    </section>
  );
}
