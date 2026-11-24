import { useEffect, useState } from "react";
import { Copy, MessageCircle, Send } from "lucide-react";
import { ApiError } from "../../../api/client";
import { urlDeFirma, type LinkFirma } from "../../../api/contratos.api";
import { whatsappApi, type ConexionWa, type LineaWa } from "../../../api/whatsapp.api";

const soloDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const CLAVE_LINEA = "contrato-linea-wa";

/**
 * El link para firmar: copiarlo, abrir WhatsApp con el mensaje escrito o (con `vinculado`) enviarlo directo por uno
 * de los WhatsApp vinculados al sistema (Bolívares, Pesos o Dólares), sin salir de la pantalla.
 */
export function CajaLink({ link, telefono, para, mensaje, vinculado = false }: { link: LinkFirma; telefono?: string | null; para: string; mensaje?: string; vinculado?: boolean }) {
  const url = urlDeFirma(link.token);
  const [copiado, setCopiado] = useState(false);
  const texto = `Hola ${para.split(/\s+/)[0] || ""}, ${mensaje ?? "para el contrato de Pago Veloz al Cambio necesitamos tu firma"}. Ábrelo y firma con el dedo: ${url}`;
  const tel = soloDigitos(telefono);

  // ---------- por el WhatsApp vinculado
  const [lineas, setLineas] = useState<ConexionWa[] | null>(null);
  const [linea, setLinea] = useState<LineaWa | null>(null);
  const [numero, setNumero] = useState(tel);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setNumero(tel), [tel]);
  useEffect(() => {
    if (!vinculado || link.estado !== "PENDIENTE") return;
    whatsappApi
      .lineas()
      .then((l) => {
        const conectadas = l.filter((x) => x.estado === "CONECTADO");
        setLineas(conectadas);
        let guardada: number | null = null;
        try {
          guardada = Number(localStorage.getItem(CLAVE_LINEA)) || null;
        } catch {
          // sin almacenamiento
        }
        setLinea((conectadas.find((x) => x.linea === guardada) ?? conectadas[0])?.linea ?? null);
      })
      .catch(() => setLineas([]));
  }, [vinculado, link.estado]);

  async function enviarVinculado() {
    setError(null);
    if (!linea) return;
    if (soloDigitos(numero).length < 10) return setError("Escribí el teléfono con código de país (ej. 584141234567).");
    setEnviando(true);
    try {
      const chat = await whatsappApi.abrirChat(numero, linea, para || undefined);
      await whatsappApi.enviar(chat.jid, texto);
      try {
        localStorage.setItem(CLAVE_LINEA, String(linea));
      } catch {
        // no es grave
      }
      setEnviado(lineas?.find((x) => x.linea === linea)?.nombreLinea ?? "WhatsApp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar por el WhatsApp vinculado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={`cc-link-firma ${link.estado === "FIRMADO" ? "firmado" : ""}`}>
      <span>{link.estado === "FIRMADO" ? "✓ Firmado desde el link" : link.estado === "VENCIDO" ? "El link venció" : "Link para firmar (pendiente)"}</span>
      {link.estado === "PENDIENTE" && (
        <>
          <input value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Link para firmar" />
          <div className="cc-firma-botones">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                });
              }}
            >
              <Copy size={13} /> {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <a className="cc-link-wa" href={`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={13} /> Abrir WhatsApp
            </a>
          </div>
          {vinculado && (
            <div className="cc-link-vinculado">
              <span>Enviar por el WhatsApp vinculado</span>
              {lineas === null ? (
                <small>Revisando las líneas…</small>
              ) : lineas.length === 0 ? (
                <small>No hay ningún WhatsApp vinculado conectado: usá “Abrir WhatsApp” o “Copiar”.</small>
              ) : enviado ? (
                <small className="cc-link-enviado">✓ Enviado por la línea {enviado} a +{soloDigitos(numero)}. Queda en el chat de esa línea.</small>
              ) : (
                <>
                  <div className="cc-link-lineas" role="radiogroup" aria-label="Por cuál WhatsApp">
                    {lineas.map((l) => (
                      <button key={l.linea} type="button" role="radio" aria-checked={linea === l.linea} className={linea === l.linea ? "activo" : ""} onClick={() => setLinea(l.linea)}>
                        {l.nombreLinea}
                        {l.numero ? ` · ${l.numero.slice(-4)}` : ""}
                      </button>
                    ))}
                  </div>
                  <div className="cc-link-enviar">
                    <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="tel" placeholder="Teléfono con código de país" aria-label="Teléfono al que se envía" />
                    <button type="button" onClick={() => void enviarVinculado()} disabled={enviando || !linea}>
                      <Send size={13} /> {enviando ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                </>
              )}
              {error && <small className="cc-firma-error">{error}</small>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
