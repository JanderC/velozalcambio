import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, CheckCheck, Clock, FileText, Receipt, Reply, X } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { whatsappApi, type MensajeWa } from "../../../api/whatsapp.api";
import { horaCorta, partesFormato } from "../utilidades";

const AUTORES: Record<string, string> = { bot: "Bot", sistema: "Sistema", humano: "Asesor", telefono: "Desde el teléfono" };

function TextoFormateado({ texto, resaltar }: { texto: string; resaltar?: string }) {
  return (
    <>
      {partesFormato(texto).map((p, i) => {
        let contenido: React.ReactNode = p.t;
        if (resaltar?.trim()) {
          const idx = p.t.toLowerCase().indexOf(resaltar.trim().toLowerCase());
          if (idx >= 0) {
            const fin = idx + resaltar.trim().length;
            contenido = (
              <>
                {p.t.slice(0, idx)}
                <mark>{p.t.slice(idx, fin)}</mark>
                {p.t.slice(fin)}
              </>
            );
          }
        }
        if (p.estilo === "b") return <strong key={i}>{contenido}</strong>;
        if (p.estilo === "i") return <em key={i}>{contenido}</em>;
        if (p.estilo === "s") return <s key={i}>{contenido}</s>;
        return <span key={i}>{contenido}</span>;
      })}
    </>
  );
}

function Ticks({ m }: { m: MensajeWa }) {
  if (m.estado === "pendiente") return <Clock size={13} aria-label="Enviando" className="wa-tick" />;
  if (m.estado === "error") return <AlertCircle size={14} aria-label={`Error: ${m.error ?? ""}`} className="wa-tick error" />;
  if (m.estado === "enviado") return <Check size={15} aria-label="Enviado" className="wa-tick" />;
  return <CheckCheck size={15} aria-label={m.estado === "leido" ? "Leído" : "Entregado"} className={`wa-tick ${m.estado === "leido" ? "leido" : ""}`} />;
}

export function Burbuja({
  mensaje: m,
  resaltar,
  onVerImagen,
  onResponder,
}: {
  mensaje: MensajeWa;
  resaltar?: string;
  onVerImagen: (url: string) => void;
  /** Responder a este mensaje: queda citado arriba de lo que se escriba */
  onResponder?: (m: MensajeWa) => void;
}) {
  const [comprobante, setComprobante] = useState(false);

  if (m.interno) {
    return (
      <div className="wa-nota">
        <span>{m.texto}</span>
        <time>{horaCorta(m.fecha)}</time>
      </div>
    );
  }

  const clase = `wa-burbuja ${m.deMi ? "mia" : "suya"} autor-${m.autor}`;
  return (
    <div className={`wa-fila ${m.deMi ? "mia" : "suya"}`}>
      <div className={clase}>
        {/* El mensaje al que responde, citado */}
        {m.cita && (
          <span className={`wa-cita ${m.cita.deMi ? "mia" : "suya"}`}>
            <b>{m.cita.deMi ? "Tú" : "Cliente"}</b>
            <span>{m.cita.texto}</span>
          </span>
        )}
        {onResponder && m.estado !== "error" && m.estado !== "pendiente" && (
          <button className="wa-responder" onClick={() => onResponder(m)} aria-label="Responder a este mensaje" title="Responder a este mensaje">
            <Reply size={15} />
          </button>
        )}
        {m.deMi && m.autor !== "humano" && <span className="wa-autor">{AUTORES[m.autor]}</span>}
        {/* En un grupo: quién escribió */}
        {!m.deMi && m.remitente && <span className="wa-autor wa-remitente">{m.remitente}</span>}

        {(m.tipo === "imagen" || m.tipo === "sticker") &&
          (m.mediaUrl ? (
            <button className={`wa-media-img ${m.tipo}`} onClick={() => onVerImagen(m.mediaUrl!)} aria-label="Ver foto">
              <img src={m.mediaUrl} alt={m.texto ?? "Foto"} loading="lazy" />
            </button>
          ) : (
            <span className="wa-media-falta">📷 Foto no disponible</span>
          ))}
        {m.tipo === "audio" &&
          (m.mediaUrl ? <audio controls preload="none" src={m.mediaUrl} className="wa-audio" /> : <span className="wa-media-falta">🎤 Nota de voz no disponible</span>)}
        {m.tipo === "video" &&
          (m.mediaUrl ? <video controls preload="none" src={m.mediaUrl} className="wa-video" /> : <span className="wa-media-falta">🎥 Video no disponible</span>)}
        {m.tipo === "documento" && (
          <a className="wa-documento" href={m.mediaUrl ?? undefined} target="_blank" rel="noreferrer">
            <FileText size={22} />
            <span>{m.texto ?? "Documento"}</span>
          </a>
        )}

        {m.texto && m.tipo !== "documento" && (
          <p className="wa-texto">
            <TextoFormateado texto={m.texto} resaltar={resaltar} />
          </p>
        )}

        <span className="wa-meta">
          <time>{horaCorta(m.fecha)}</time>
          {m.deMi && <Ticks m={m} />}
        </span>
        {m.estado === "error" && m.error && <span className="wa-error-envio">No se envió: {m.error}</span>}
      </div>

      {!m.deMi && m.tipo === "imagen" && m.mediaUrl && (
        <button className="wa-btn-comprobante" onClick={() => setComprobante(true)}>
          <Receipt size={13} /> Este es el comprobante
        </button>
      )}
      {comprobante && <ModalComprobante mensajeId={m.id} onCerrar={() => setComprobante(false)} />}
    </div>
  );
}

function ModalComprobante({ mensajeId, onCerrar }: { mensajeId: string; onCerrar: () => void }) {
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [banco, setBanco] = useState("");
  const [estado, setEstado] = useState<{ ok?: string; error?: string; enviando?: boolean }>({});

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setEstado({ enviando: true });
    try {
      const r = await whatsappApi.marcarComprobante(mensajeId, {
        monto: monto.trim() || undefined,
        referencia: referencia.trim() || undefined,
        banco: banco.trim() || undefined,
      });
      setEstado({ ok: `Registrado en la solicitud #${r.solicitud}. Queda pendiente de aprobación en la Bandeja.${r.alerta ? ` Atención: ${r.alerta}.` : ""}` });
    } catch (err) {
      setEstado({ error: (err as Error).message });
    }
  }

  return (
    <Modal titulo="Registrar comprobante" onCerrar={onCerrar}>
      {estado.ok ? (
        <div className="wa-form">
          <p className="wa-ok">{estado.ok}</p>
          <button className="wa-btn" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      ) : (
        <form className="wa-form" onSubmit={registrar}>
          <p className="wa-ayuda">Se adjunta a la solicitud pendiente de este cliente. Los datos son opcionales: completalos si los ves en la foto.</p>
          <label>
            Monto
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="ej. 100" />
          </label>
          <label>
            Referencia
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Número de operación" />
          </label>
          <label>
            Banco
            <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="ej. Bancolombia" />
          </label>
          {estado.error && <p className="wa-error">{estado.error}</p>}
          <button className="wa-btn" type="submit" disabled={estado.enviando}>
            {estado.enviando ? "Registrando…" : "Registrar comprobante"}
          </button>
        </form>
      )}
    </Modal>
  );
}

export function VisorImagen({ url, onCerrar }: { url: string; onCerrar: () => void }) {
  return createPortal(
    <div className="wa-visor" onClick={onCerrar} role="dialog" aria-label="Foto">
      <button className="wa-visor-cerrar" onClick={onCerrar} aria-label="Cerrar">
        <X size={22} />
      </button>
      <img src={url} alt="Foto ampliada" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body
  );
}
