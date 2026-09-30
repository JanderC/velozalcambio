import { useEffect, useRef, useState } from "react";
import { urlStreamWhatsapp } from "../../api/whatsapp.api";

export type EventoStream = "mensaje" | "estado" | "chat" | "conexion" | "outbox" | "atencion";

/**
 * Tiempo real del panel por SSE. EventSource reconecta solo; si el servidor se reinicia
 * o se corta la red, `conectado` pasa a false hasta que vuelve.
 */
export function useStreamWhatsapp(manejar: (tipo: EventoStream, datos: unknown) => void) {
  const manejador = useRef(manejar);
  manejador.current = manejar;
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const fuente = new EventSource(urlStreamWhatsapp());
    const tipos: EventoStream[] = ["mensaje", "estado", "chat", "conexion", "outbox", "atencion"];
    const oyentes = tipos.map((tipo) => {
      const fn = (e: MessageEvent) => {
        try {
          manejador.current(tipo, JSON.parse(e.data));
        } catch {
          // evento mal formado: se ignora
        }
      };
      fuente.addEventListener(tipo, fn);
      return { tipo, fn };
    });
    fuente.onopen = () => setConectado(true);
    fuente.onerror = () => setConectado(false);
    return () => {
      oyentes.forEach(({ tipo, fn }) => fuente.removeEventListener(tipo, fn));
      fuente.close();
    };
  }, []);

  return conectado;
}
