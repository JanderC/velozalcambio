import { useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { alternarBurbuja, registrarBotonEncabezado, useEstadoBurbuja } from "./burbujaEstado";

/**
 * El WhatsApp en la barra de arriba: un ícono con el número de mensajes sin leer que abre el panel de chats.
 * Reemplaza a la burbuja flotante, que tapaba botones y el final de las tablas. Solo aparece para quien atiende
 * chats (el panel decide si está) y no en el módulo de WhatsApp, donde ya está la bandeja completa.
 */
export function BotonWhatsappEncabezado() {
  const { montada, abierta, sinLeer, late } = useEstadoBurbuja();
  useEffect(() => registrarBotonEncabezado(), []);
  if (!montada) return null;
  return (
    <button
      type="button"
      className={`app-header-wa ${abierta ? "abierto" : ""} ${sinLeer > 0 ? "con-nuevos" : ""} ${late ? "late" : ""}`}
      onClick={alternarBurbuja}
      aria-label={sinLeer > 0 ? `WhatsApp: ${sinLeer} mensajes sin leer` : "Abrir los chats de WhatsApp"}
      aria-expanded={abierta}
      title={sinLeer > 0 ? `WhatsApp: ${sinLeer} ${sinLeer === 1 ? "mensaje sin leer" : "mensajes sin leer"}` : "Chats de WhatsApp"}
    >
      <MessageCircle size={18} />
      <span className="app-header-wa-texto">WhatsApp</span>
      {sinLeer > 0 && <b>{sinLeer > 99 ? "99+" : sinLeer}</b>}
    </button>
  );
}
