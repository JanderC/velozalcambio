import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Send } from "lucide-react";
import { Modal } from "../common/Modal";
import { LINEAS_WA, whatsappApi, type ConexionWa, type LineaWa } from "../../api/whatsapp.api";
import { alAbrirWhatsApp, enlaceWhatsApp } from "../../utils/whatsapp";
import "./avisoCliente.css";

const CLAVE = "wa-linea-aviso"; // la misma línea que se recuerda al avisar una operación

/** Teléfono como lo pide WhatsApp: solo dígitos y con país (celular colombiano o venezolano sin él -> se le agrega). */
export function telefonoParaWhatsapp(telefono: string | null | undefined) {
  const d = (telefono ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (d.length < 8) return null;
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  if (d.length === 11 && d.startsWith("04")) return `58${d.slice(1)}`;
  return d;
}

function lineaInicial(monedaCodigo?: string): LineaWa {
  try {
    const guardada = Number(localStorage.getItem(CLAVE));
    if (guardada === 1 || guardada === 2 || guardada === 3) return guardada;
  } catch {
    // sin almacenamiento: se propone por la moneda
  }
  return monedaCodigo === "VES" ? 1 : monedaCodigo === "USD" ? 3 : 2;
}

/**
 * Taquilla confirmó o entregó: el mensaje para el cliente ya escrito (se puede corregir), a qué número va (se puede
 * cambiar) y por cuál WhatsApp vinculado sale (Bolívares, Pesos o Dólares). Se envía directo desde el sistema; si el
 * vinculado no está conectado, se puede abrir en WhatsApp.
 */
export function AvisoClienteModal({
  titulo,
  resumen,
  nombre,
  telefono,
  mensaje,
  monedaCodigo,
  onCerrar,
}: {
  titulo: string;
  resumen: string; // lo que pasó, en una línea
  nombre: string;
  telefono: string | null;
  mensaje: string;
  monedaCodigo?: string;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(mensaje);
  const [numero, setNumero] = useState(telefono ?? "");
  const [lineas, setLineas] = useState<ConexionWa[]>([]);
  const [linea, setLinea] = useState<LineaWa>(() => lineaInicial(monedaCodigo));
  const [estado, setEstado] = useState<"" | "enviando" | "enviado">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    whatsappApi
      .lineas()
      .then((l) => {
        setLineas(l);
        // si la línea propuesta no está vinculada y otra sí, se pasa a esa
        setLinea((actual) => (l.find((x) => x.linea === actual)?.estado === "CONECTADO" ? actual : (l.find((x) => x.estado === "CONECTADO")?.linea ?? actual)));
      })
      .catch(() => setLineas([]));
  }, []);

  const wa = telefonoParaWhatsapp(numero);
  const conectada = lineas.find((l) => l.linea === linea)?.estado === "CONECTADO";

  function elegir(l: LineaWa) {
    setLinea(l);
    setError(null);
    try {
      localStorage.setItem(CLAVE, String(l));
    } catch {
      // no es grave: solo no se recuerda
    }
  }

  async function enviar() {
    if (!wa) return setError("Escribí el número del cliente (con el código del país si no es de Colombia).");
    if (!texto.trim()) return setError("El mensaje está vacío.");
    setEstado("enviando");
    setError(null);
    try {
      const chat = await whatsappApi.abrirChat(wa, linea, nombre);
      await whatsappApi.enviar(chat.jid, texto.trim());
      setEstado("enviado");
      setTimeout(onCerrar, 1500);
    } catch (e) {
      setEstado("");
      setError((e as Error).message || "No se pudo enviar el mensaje.");
    }
  }

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="aviso-cliente">
        <p className="aviso-cliente-ok">
          <CheckCircle2 size={20} /> {resumen}
        </p>
        <label>
          Mensaje para {nombre}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} />
        </label>
        <label>
          Número del cliente
          <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="tel" placeholder="ej. 314 349 8481 o +58 412 1234567" />
          <small>{wa ? `Se envía a +${wa}` : "Sin número: escríbelo para enviarle el mensaje."}</small>
        </label>
        <div className="aviso-cliente-lineas">
          <span>Enviar desde el WhatsApp vinculado</span>
          <div className="cc-chips" role="radiogroup" aria-label="Línea de WhatsApp">
            {LINEAS_WA.map((l) => {
              const c = lineas.find((x) => x.linea === l.id);
              const on = c?.estado === "CONECTADO";
              return (
                <button key={l.id} type="button" role="radio" aria-checked={linea === l.id} className={linea === l.id ? "activo" : ""} onClick={() => elegir(l.id)} title={on ? "Vinculado" : "No está vinculado"}>
                  <span className={`aviso-cliente-punto ${on ? "on" : ""}`} aria-hidden="true" /> {l.nombre}
                </button>
              );
            })}
          </div>
          {!conectada && lineas.length > 0 && <small className="aviso-cliente-alerta">Esa línea no está vinculada ahora: elige otra o ábrelo en WhatsApp.</small>}
        </div>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones aviso-cliente-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            No enviar
          </button>
          {wa && (
            <a className="cc-btn-secundario aviso-cliente-abrir" href={enlaceWhatsApp(wa, texto)} onClick={(e) => alAbrirWhatsApp(e, wa, texto)} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Abrir en WhatsApp
            </a>
          )}
          <button type="button" className="cc-guardar" onClick={() => void enviar()} disabled={estado !== "" || !conectada || !wa}>
            <Send size={15} /> {estado === "enviando" ? "Enviando…" : estado === "enviado" ? "Enviado ✓" : "Enviar desde el vinculado"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
