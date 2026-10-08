import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import {
  whatsappApi,
  type ChatWa,
  type ConexionWa,
  type FiltroChats,
  type LineaWa,
  type MensajeWa,
} from "../../../api/whatsapp.api";
import { useStreamWhatsapp, type EventoStream } from "../useStreamWhatsapp";
import { sonarAviso } from "../utilidades";
import { ListaChats } from "./ListaChats";
import { ChatAbierto } from "./ChatAbierto";
import { PanelCliente } from "./PanelCliente";

const TITULO_BASE = "Pago Veloz al Cambio";

function ordenar(chats: ChatWa[]) {
  return [...chats].sort((a, b) => {
    if (a.necesitaHumano !== b.necesitaHumano) return a.necesitaHumano ? -1 : 1;
    return (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? "");
  });
}

function cumpleFiltro(c: ChatWa, filtro: FiltroChats, linea: LineaWa | null) {
  if (linea && c.linea !== linea) return false;
  if (filtro === "archivados") return c.archivado;
  if (c.archivado) return false;
  if (filtro === "no_leidos") return c.noLeidos > 0;
  if (filtro === "atencion") return c.necesitaHumano;
  if (filtro === "bot") return c.botActivo;
  if (filtro === "humano") return !c.botActivo;
  if (filtro === "grupos") return c.esGrupo;
  return true;
}

export function ChatsPanel() {
  const [chats, setChats] = useState<ChatWa[]>([]);
  const [esperando, setEsperando] = useState<ChatWa[]>([]);
  const [filtro, setFiltro] = useState<FiltroChats>("todos");
  // Cuál de los tres teléfonos se está mirando (null = los tres juntos)
  const [linea, setLinea] = useState<LineaWa | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeWa[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [verCliente, setVerCliente] = useState(false);
  const [lineas, setLineas] = useState<ConexionWa[]>([]);
  const [respuestasRapidas, setRespuestasRapidas] = useState<string[]>([]);
  const abiertoRef = useRef<string | null>(null);
  abiertoRef.current = abierto;

  // ---------- Carga ----------
  const cargarChats = useCallback(async () => {
    try {
      setChats(await whatsappApi.chats(filtro, busqueda, linea));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [filtro, busqueda, linea]);

  useEffect(() => {
    const t = setTimeout(cargarChats, busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargarChats, busqueda]);

  const cargarEsperando = useCallback(() => {
    whatsappApi.esperando().then(setEsperando).catch(() => {});
  }, []);

  useEffect(() => {
    cargarEsperando();
    whatsappApi.lineas().then(setLineas).catch(() => {});
    whatsappApi
      .config()
      .then((r) => setRespuestasRapidas(r.config.panel?.respuestasRapidas ?? []))
      .catch(() => {});
  }, [cargarEsperando]);

  const abrir = useCallback(async (jid: string) => {
    setAbierto(jid);
    setMensajes([]);
    setHayMas(false);
    try {
      const r = await whatsappApi.mensajes(jid);
      if (abiertoRef.current !== jid) return;
      setMensajes(r.mensajes);
      setHayMas(r.hayMas);
      await whatsappApi.leer(jid);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  async function verAnteriores() {
    if (!abierto || mensajes.length === 0) return;
    const r = await whatsappApi.mensajes(abierto, { antesDe: mensajes[0]!.id });
    setMensajes((m) => [...r.mensajes, ...m]);
    setHayMas(r.hayMas);
  }

  // ---------- Tiempo real ----------
  const streamConectado = useStreamWhatsapp((tipo: EventoStream, datos: unknown) => {
    if (tipo === "chat") {
      const chat = datos as ChatWa;
      setChats((lista) => {
        // Con búsqueda activa solo se actualiza lo que ya está en pantalla
        if (busqueda) return lista.map((c) => (c.jid === chat.jid ? chat : c));
        const sin = lista.filter((c) => c.jid !== chat.jid);
        return cumpleFiltro(chat, filtro, linea) ? ordenar([chat, ...sin]) : sin;
      });
      setEsperando((lista) => {
        const sin = lista.filter((c) => c.jid !== chat.jid);
        return chat.necesitaHumano ? [...sin, chat] : sin;
      });
    }
    if (tipo === "mensaje") {
      const m = datos as MensajeWa;
      if (m.jid === abiertoRef.current) {
        setMensajes((lista) => (lista.some((x) => x.id === m.id) ? lista.map((x) => (x.id === m.id ? m : x)) : [...lista, m]));
        if (m.autor === "cliente" && !document.hidden) void whatsappApi.leer(m.jid);
      }
      if (m.autor === "cliente" && (document.hidden || m.jid !== abiertoRef.current)) sonarAviso();
    }
    if (tipo === "estado") {
      const e = datos as { id: string; estado: MensajeWa["estado"]; error: string | null };
      setMensajes((lista) => lista.map((x) => (String(x.id) === String(e.id) ? { ...x, estado: e.estado, error: e.error } : x)));
    }
    if (tipo === "atencion") cargarEsperando();
    if (tipo === "conexion") {
      const c = datos as ConexionWa;
      setLineas((lista) => (lista.some((l) => l.linea === c.linea) ? lista.map((l) => (l.linea === c.linea ? { ...l, ...c } : l)) : [...lista, c]));
    }
  });

  // Al volver a la pestaña, lo abierto queda leído
  useEffect(() => {
    const alVolver = () => {
      if (!document.hidden && abiertoRef.current) void whatsappApi.leer(abiertoRef.current);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  // Contador en la pestaña del navegador
  const totalNoLeidos = useMemo(() => chats.reduce((s, c) => s + (c.jid === abierto && !document.hidden ? 0 : c.noLeidos), 0), [chats, abierto]);
  useEffect(() => {
    document.title = totalNoLeidos > 0 ? `(${totalNoLeidos}) WhatsApp · ${TITULO_BASE}` : `WhatsApp · ${TITULO_BASE}`;
    return () => {
      document.title = TITULO_BASE;
    };
  }, [totalNoLeidos]);

  const sinConectar = lineas.filter((l) => l.estado !== "CONECTADO");
  const chatAbierto = chats.find((c) => c.jid === abierto) ?? esperando.find((c) => c.jid === abierto) ?? null;

  function actualizarLocal(chat: ChatWa) {
    setChats((lista) => lista.map((c) => (c.jid === chat.jid ? chat : c)));
  }

  return (
    <div className={`wa-chats ${abierto ? "con-chat" : ""} ${verCliente && abierto ? "con-cliente" : ""}`}>
      {!streamConectado || (lineas.length > 0 && sinConectar.length > 0) ? (
        <div className="wa-banner-conexion" role="status">
          <WifiOff size={15} />
          {!streamConectado
            ? "Reconectando con el servidor…"
            : sinConectar.length === lineas.length
              ? "Ninguna línea de WhatsApp está conectada: se vinculan en la pestaña Líneas."
              : `Sin conectar: ${sinConectar.map((l) => l.nombreLinea).join(" y ")}. Los mensajes de esas líneas no entran ni salen hasta vincularlas.`}
        </div>
      ) : null}

      <ListaChats
        chats={chats}
        esperando={esperando}
        filtro={filtro}
        onFiltro={setFiltro}
        linea={linea}
        onLinea={setLinea}
        lineas={lineas}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        abierto={abierto}
        onAbrir={abrir}
        cargando={cargando}
        error={error}
        onEsperandoCambio={cargarEsperando}
      />

      {chatAbierto ? (
        <ChatAbierto
          key={chatAbierto.jid}
          chat={chatAbierto}
          mensajes={mensajes}
          hayMas={hayMas}
          onVerAnteriores={verAnteriores}
          onCerrar={() => setAbierto(null)}
          onChatActualizado={actualizarLocal}
          onVerCliente={() => setVerCliente((v) => !v)}
          verCliente={verCliente}
          respuestasRapidas={respuestasRapidas}
        />
      ) : (
        <div className="wa-vacio">
          <div className="wa-vacio-icono">💬</div>
          <h3>Chats de WhatsApp</h3>
          <p>Elegí un chat para leerlo y responder. Si escribís vos, el bot se pausa en ese chat.</p>
        </div>
      )}

      {verCliente && chatAbierto && <PanelCliente jid={chatAbierto.jid} onCerrar={() => setVerCliente(false)} onChatActualizado={actualizarLocal} />}
    </div>
  );
}
