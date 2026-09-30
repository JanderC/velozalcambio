import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { whatsappApi } from "../../api/whatsapp.api";

/**
 * Al terminar una operación: el cliente escanea el QR, se abre WhatsApp con un mensaje
 * prellenado con su código (VC-123) y es él quien escribe primero. Al llegar el código, el
 * sistema une la operación a su chat y le manda el recibo. Así el número no queda como "spam".
 */
export function RecibirPorWhatsapp({ transaccionId }: { transaccionId: number }) {
  const [datos, setDatos] = useState<{ url: string; codigo: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function mostrar() {
    setCargando(true);
    setError(null);
    try {
      setDatos(await whatsappApi.recibirPorWhatsapp(transaccionId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  if (!datos) {
    return (
      <div className="wa-recibir">
        <button type="button" className="wa-recibir-btn" onClick={mostrar} disabled={cargando}>
          <MessageCircle size={17} /> {cargando ? "Generando…" : "Recibir por WhatsApp"}
        </button>
        {error && <p className="wa-recibir-error">{error}</p>}
      </div>
    );
  }
  return (
    <div className="wa-recibir abierto">
      <img src={datos.qr} alt={`QR para recibir el comprobante ${datos.codigo} por WhatsApp`} />
      <div>
        <strong>Que el cliente escanee este código</strong>
        <p>
          Se le abre WhatsApp con el mensaje listo (código <b>{datos.codigo}</b>). Cuando lo envíe, le llega el comprobante por el mismo chat.
        </p>
        <a href={datos.url} target="_blank" rel="noreferrer">
          Abrir el enlace
        </a>
      </div>
    </div>
  );
}
