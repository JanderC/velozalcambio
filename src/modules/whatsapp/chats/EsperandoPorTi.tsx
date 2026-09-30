import { useState } from "react";
import { Bot, ChevronDown, ChevronUp, MessageSquareReply, Send } from "lucide-react";
import { whatsappApi, type ChatWa } from "../../../api/whatsapp.api";
import { haceMinutos } from "../utilidades";

/** "Esperando por ti": arriba de los chats, lo que el bot pasó a una persona. */
export function EsperandoPorTi({ chats, onAbrir, onCambio }: { chats: ChatWa[]; onAbrir: (jid: string) => void; onCambio: () => void }) {
  const [abierta, setAbierta] = useState(true);
  return (
    <section className="wa-esperando" aria-label="Esperando por ti">
      <button className="wa-esperando-titulo" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
        <span>
          Esperando por ti <span className="wa-badge alerta">{chats.length}</span>
        </span>
        {abierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {abierta && (
        <ul>
          {chats.map((c) => (
            <TarjetaEspera key={c.jid} chat={c} onAbrir={onAbrir} onCambio={onCambio} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TarjetaEspera({ chat, onAbrir, onCambio }: { chat: ChatWa; onAbrir: (jid: string) => void; onCambio: () => void }) {
  const [instruccion, setInstruccion] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function accion(fn: () => Promise<unknown>, exito?: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      if (exito) setAviso(exito);
      onCambio();
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="wa-espera-item">
      <div className="wa-espera-cabeza">
        <strong>{chat.nombre}</strong>
        <span>{haceMinutos(chat.necesitaHumanoDesde)}</span>
      </div>
      <p className="wa-espera-motivo">{chat.motivo ?? "Necesita atención"}</p>
      <div className="wa-espera-acciones">
        <button
          disabled={ocupado}
          onClick={() =>
            accion(async () => {
              await whatsappApi.tomar(chat.jid);
              onAbrir(chat.jid);
            })
          }
        >
          <MessageSquareReply size={14} /> Responder
        </button>
        <button disabled={ocupado} className="secundario" onClick={() => accion(() => whatsappApi.devolverAlBot(chat.jid))}>
          <Bot size={14} /> Que lo atienda el bot
        </button>
      </div>
      <form
        className="wa-espera-instruccion"
        onSubmit={(e) => {
          e.preventDefault();
          if (!instruccion.trim()) return;
          void accion(async () => {
            const r = await whatsappApi.instruccion(chat.jid, instruccion);
            setInstruccion("");
            return r;
          }, "Listo: el bot se lo dijo con sus palabras.");
        }}
      >
        <input
          value={instruccion}
          onChange={(e) => setInstruccion(e.target.value)}
          placeholder="Dile al bot qué responder…"
          aria-label={`Instrucción para responder a ${chat.nombre}`}
          disabled={ocupado}
        />
        <button type="submit" disabled={ocupado || !instruccion.trim()} aria-label="Enviar instrucción">
          <Send size={14} />
        </button>
      </form>
      {aviso && <p className="wa-espera-aviso">{aviso}</p>}
    </li>
  );
}
