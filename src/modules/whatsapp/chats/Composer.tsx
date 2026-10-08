import { useEffect, useRef, useState } from "react";
import { ImagePlus, MessageSquareText, Send, Smile, Sticker, X } from "lucide-react";
import { whatsappApi } from "../../../api/whatsapp.api";
import { EMOJIS, imagenDelPortapapeles, traeImagen } from "../utilidades";
import { STICKERS_WA } from "../stickers";

/** Enter envía, Shift+Enter hace salto de línea. Escribir acá pausa el bot en este chat. */
export function Composer({ jid, botActivo, respuestasRapidas }: { jid: string; botActivo: boolean; respuestasRapidas: string[] }) {
  const [texto, setTexto] = useState("");
  const [menu, setMenu] = useState<"emojis" | "rapidas" | "stickers" | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [vistaFoto, setVistaFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  useEffect(() => {
    if (!foto) return setVistaFoto(null);
    const url = URL.createObjectURL(foto);
    setVistaFoto(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  // Pegar una captura o una foto (Ctrl+V) la deja lista para enviar, igual que en WhatsApp Web.
  // Se escucha en toda la pantalla: no hace falta tener el cursor en la casilla del mensaje.
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      if (!traeImagen(e.clipboardData)) return; // texto: se pega normal
      e.preventDefault();
      void imagenDelPortapapeles(e.clipboardData).then((imagen) => {
        if (!imagen) return setError("No se pudo leer esa imagen. Probá guardarla y adjuntarla con el botón de foto.");
        setError(null);
        setFoto(imagen);
        area.current?.focus();
      });
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, []);

  async function enviar() {
    if (enviando || (!texto.trim() && !foto)) return;
    setEnviando(true);
    setError(null);
    try {
      if (foto) await whatsappApi.enviarImagen(jid, foto, texto);
      else await whatsappApi.enviar(jid, texto.trim());
      setTexto("");
      setFoto(null);
      setMenu(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
      area.current?.focus();
    }
  }

  // Los stickers salen al tocarlos, como en WhatsApp
  async function enviarSticker(id: string) {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await whatsappApi.enviarSticker(jid, id);
      setMenu(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
      area.current?.focus();
    }
  }

  function insertar(t: string) {
    const el = area.current;
    if (!el) return setTexto((x) => x + t);
    const ini = el.selectionStart ?? texto.length;
    const fin = el.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + t + texto.slice(fin));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = ini + t.length;
    });
  }

  return (
    <div className="wa-composer">
      {error && (
        <div className="wa-composer-error" role="alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X size={13} />
          </button>
        </div>
      )}
      {vistaFoto && (
        <div className="wa-composer-foto">
          <img src={vistaFoto} alt="Foto a enviar" />
          <span>El texto de abajo va como pie de foto.</span>
          <button onClick={() => setFoto(null)} aria-label="Quitar foto">
            <X size={15} />
          </button>
        </div>
      )}
      {menu === "emojis" && (
        <div className="wa-popover emojis" role="listbox" aria-label="Emojis">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => insertar(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      )}
      {menu === "stickers" && (
        <div className="wa-popover stickers" role="listbox" aria-label="Stickers">
          {STICKERS_WA.map((s) => (
            <button key={s.id} onClick={() => void enviarSticker(s.id)} disabled={enviando} title={`Enviar el sticker ${s.nombre}`} aria-label={`Enviar el sticker ${s.nombre}`}>
              <img src={s.src} alt={s.nombre} />
            </button>
          ))}
        </div>
      )}
      {menu === "rapidas" && (
        <div className="wa-popover rapidas" role="listbox" aria-label="Respuestas rápidas">
          {respuestasRapidas.length === 0 && <p>No hay respuestas rápidas. Un administrador puede cargarlas en Bot e IA.</p>}
          {respuestasRapidas.map((r) => (
            <button
              key={r}
              onClick={() => {
                setTexto(r);
                setMenu(null);
                area.current?.focus();
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <div className="wa-composer-fila">
        <button className={`wa-icono ${menu === "emojis" ? "activo" : ""}`} onClick={() => setMenu(menu === "emojis" ? null : "emojis")} aria-label="Emojis">
          <Smile size={21} />
        </button>
        <button className={`wa-icono ${menu === "rapidas" ? "activo" : ""}`} onClick={() => setMenu(menu === "rapidas" ? null : "rapidas")} aria-label="Respuestas rápidas">
          <MessageSquareText size={20} />
        </button>
        <button className={`wa-icono ${menu === "stickers" ? "activo" : ""}`} onClick={() => setMenu(menu === "stickers" ? null : "stickers")} aria-label="Stickers" title="Stickers">
          <Sticker size={20} />
        </button>
        <button className="wa-icono" onClick={() => archivo.current?.click()} aria-label="Enviar foto">
          <ImagePlus size={20} />
        </button>
        <input
          ref={archivo}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            setFoto(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <textarea
          ref={area}
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escribí un mensaje, o pegá una imagen con Ctrl+V"
          title={botActivo ? "Si escribís, el bot se pausa en este chat" : undefined}
          aria-label="Mensaje"
        />
        <button className="wa-enviar" onClick={enviar} disabled={enviando || (!texto.trim() && !foto)} aria-label="Enviar">
          <Send size={19} />
        </button>
      </div>
    </div>
  );
}
