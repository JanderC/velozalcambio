import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { LINEAS_WA, whatsappApi, type ConexionWa, type LineaWa } from "../../api/whatsapp.api";

const CLAVE = "wa-linea-aviso"; // la misma línea que se recuerda al avisar una operación

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
 * Manda la imagen de un reporte al cliente desde uno de los WhatsApp vinculados al sistema (Bolívares, Pesos o
 * Dólares), con el texto como pie de foto. Sale como un solo mensaje, por el mismo envío protegido de siempre.
 */
export function EnviarReportePorVinculado({
  telefono,
  nombre,
  imagen,
  nombreArchivo,
  texto = "",
  monedaCodigo,
}: {
  telefono: string; // ya normalizado para WhatsApp (solo dígitos, con el país)
  nombre: string;
  imagen: Blob;
  nombreArchivo: string;
  texto?: string;
  monedaCodigo?: string;
}) {
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

  // otra imagen (otro reporte): se puede volver a enviar
  useEffect(() => {
    setEstado("");
    setError(null);
  }, [imagen]);

  const conectada = lineas.find((l) => l.linea === linea)?.estado === "CONECTADO";

  function elegir(l: LineaWa) {
    setLinea(l);
    setEstado("");
    setError(null);
    try {
      localStorage.setItem(CLAVE, String(l));
    } catch {
      // no es grave: solo no se recuerda
    }
  }

  async function enviar() {
    setEstado("enviando");
    setError(null);
    try {
      const chat = await whatsappApi.abrirChat(telefono, linea, nombre);
      await whatsappApi.enviarImagen(chat.jid, new File([imagen], nombreArchivo, { type: imagen.type || "image/png" }), texto);
      setEstado("enviado");
    } catch (e) {
      setEstado("");
      setError((e as Error).message || "No se pudo enviar el reporte.");
    }
  }

  return (
    <span className="cc-aviso-vinculado cc-reporte-vinculado">
      <select value={linea} onChange={(e) => elegir(Number(e.target.value) as LineaWa)} aria-label="Línea de WhatsApp por la que sale el reporte">
        {LINEAS_WA.map((l) => {
          const c = lineas.find((x) => x.linea === l.id);
          return (
            <option key={l.id} value={l.id}>
              {l.nombre}
              {c?.estado === "CONECTADO" ? (c.numero ? ` · +${c.numero}` : "") : " · sin vincular"}
            </option>
          );
        })}
      </select>
      <button type="button" className="cc-guardar" onClick={() => void enviar()} disabled={estado !== "" || !conectada} title={conectada ? `Le manda el reporte a ${nombre} desde el WhatsApp vinculado de esa línea` : "Esa línea no está vinculada: se vincula en WhatsApp → Líneas"}>
        <Send size={14} /> {estado === "enviando" ? "Enviando…" : estado === "enviado" ? "Enviado ✓" : "Enviar desde el vinculado"}
      </button>
      {error && <small className="cc-form-error">{error}</small>}
    </span>
  );
}
