import { Bot, Search, UserRound, X } from "lucide-react";
import { LINEAS_WA, type ChatWa, type ConexionWa, type FiltroChats, type LineaWa } from "../../../api/whatsapp.api";
import { fechaLista } from "../utilidades";
import { EsperandoPorTi } from "./EsperandoPorTi";

const FILTROS: { valor: FiltroChats; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "no_leidos", etiqueta: "No leídos" },
  { valor: "atencion", etiqueta: "Atención" },
  { valor: "bot", etiqueta: "Bot" },
  { valor: "humano", etiqueta: "Persona" },
  { valor: "archivados", etiqueta: "Archivados" },
];

export function iniciales(nombre: string) {
  const limpio = nombre.replace(/^\+/, "").trim();
  if (/^\d/.test(limpio)) return "#";
  return (
    limpio
      .split(/\s+/)
      .map((p) => p.replace(/[^\p{L}]/gu, ""))
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "#"
  );
}

interface Props {
  chats: ChatWa[];
  esperando: ChatWa[];
  filtro: FiltroChats;
  onFiltro: (f: FiltroChats) => void;
  // Cuál de los tres teléfonos se mira (null = todos)
  linea: LineaWa | null;
  onLinea: (l: LineaWa | null) => void;
  lineas: ConexionWa[];
  busqueda: string;
  onBusqueda: (q: string) => void;
  abierto: string | null;
  onAbrir: (jid: string) => void;
  cargando: boolean;
  error: string | null;
  onEsperandoCambio: () => void;
}

export function ListaChats(p: Props) {
  return (
    <aside className="wa-lista" aria-label="Lista de chats">
      <div className="wa-lista-busqueda">
        <Search size={16} />
        <input
          value={p.busqueda}
          onChange={(e) => p.onBusqueda(e.target.value)}
          placeholder="Buscar nombre, teléfono o mensaje"
          aria-label="Buscar chats"
        />
        {p.busqueda && (
          <button onClick={() => p.onBusqueda("")} aria-label="Limpiar búsqueda">
            <X size={14} />
          </button>
        )}
      </div>
      {/* Las tres líneas: cada una es un teléfono del negocio */}
      <div className="wa-lineas-chips" role="tablist" aria-label="Línea de WhatsApp">
        <button role="tab" aria-selected={p.linea === null} className={p.linea === null ? "activo" : ""} onClick={() => p.onLinea(null)}>
          Todas
        </button>
        {LINEAS_WA.map((l) => {
          const estado = p.lineas.find((x) => x.linea === l.id);
          const sinLeer = p.chats.filter((c) => c.linea === l.id).reduce((s, c) => s + c.noLeidos, 0);
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={p.linea === l.id}
              className={`l${l.id} ${p.linea === l.id ? "activo" : ""}`}
              onClick={() => p.onLinea(l.id)}
              title={estado?.estado === "CONECTADO" ? `Línea ${l.nombre}: conectada${estado.numero ? ` (+${estado.numero})` : ""}` : `Línea ${l.nombre}: sin vincular o desconectada`}
            >
              <i className={estado?.estado === "CONECTADO" ? "ok" : "mal"} />
              {l.nombre}
              {sinLeer > 0 && <b>{sinLeer}</b>}
            </button>
          );
        })}
      </div>
      <div className="wa-filtros" role="tablist">
        {FILTROS.map((f) => (
          <button key={f.valor} role="tab" aria-selected={p.filtro === f.valor} className={p.filtro === f.valor ? "activo" : ""} onClick={() => p.onFiltro(f.valor)}>
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className="wa-lista-scroll">
        {p.esperando.length > 0 && !p.busqueda && (
          <EsperandoPorTi chats={p.esperando} onAbrir={p.onAbrir} onCambio={p.onEsperandoCambio} />
        )}

        {p.error && <p className="wa-lista-aviso error">{p.error}</p>}
        {p.cargando && <p className="wa-lista-aviso">Cargando chats…</p>}
        {!p.cargando && p.chats.length === 0 && !p.error && (
          <p className="wa-lista-aviso">{p.busqueda ? "No hay chats que coincidan." : "Todavía no hay chats en esta vista."}</p>
        )}

        <ul className="wa-lista-chats">
          {p.chats.map((c) => (
            <li key={c.jid}>
              <button className={`wa-item ${p.abierto === c.jid ? "activo" : ""}`} onClick={() => p.onAbrir(c.jid)}>
                <span className={`wa-avatar ${c.necesitaHumano ? "alerta" : ""}`}>{iniciales(c.nombre)}</span>
                <span className="wa-item-cuerpo">
                  <span className="wa-item-fila">
                    <span className="wa-item-nombre">{c.nombre}</span>
                    <span className={`wa-item-fecha ${c.noLeidos > 0 ? "nuevo" : ""}`}>{fechaLista(c.ultimoMensajeEn)}</span>
                  </span>
                  <span className="wa-item-fila">
                    <span className="wa-item-ultimo">
                      {c.necesitaHumano ? <strong className="wa-item-motivo">⚠ {c.motivo ?? "Necesita atención"}</strong> : c.ultimoMensaje ?? ""}
                    </span>
                    <span className="wa-item-marcas">
                      {p.linea === null && <span className={`wa-linea-chip l${c.linea}`}>{c.nombreLinea}</span>}
                      {c.botActivo ? (
                        <Bot size={14} aria-label="Lo atiende el bot" className="wa-marca-bot" />
                      ) : (
                        <UserRound size={14} aria-label="Lo atiende una persona" className="wa-marca-humano" />
                      )}
                      {c.noLeidos > 0 && <span className="wa-badge">{c.noLeidos}</span>}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
