import { useSyncExternalStore } from "react";

// Lo que el panel de WhatsApp le cuenta al resto de la pantalla (el botón del encabezado): si está, si está abierto,
// cuántos mensajes hay sin leer y si acaba de llegar uno. Y cuántos botones de encabezado hay en pantalla: si no hay
// ninguno (una pantalla sin encabezado), el panel muestra su propio botón flotante, como antes.
interface EstadoBurbuja {
  montada: boolean;
  abierta: boolean;
  sinLeer: number;
  late: boolean;
  botones: number;
}

let estado: EstadoBurbuja = { montada: false, abierta: false, sinLeer: 0, late: false, botones: 0 };
const oyentes = new Set<() => void>();

export function ponerEstadoBurbuja(cambio: Partial<EstadoBurbuja>) {
  const claves = Object.keys(cambio) as (keyof EstadoBurbuja)[];
  if (claves.every((k) => estado[k] === cambio[k])) return;
  estado = { ...estado, ...cambio };
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

export function useEstadoBurbuja() {
  return useSyncExternalStore(suscribir, () => estado);
}

/** El encabezado avisa que tiene su botón de WhatsApp en pantalla. Devuelve cómo avisar que ya no está. */
export function registrarBotonEncabezado() {
  ponerEstadoBurbuja({ botones: estado.botones + 1 });
  return () => ponerEstadoBurbuja({ botones: Math.max(0, estado.botones - 1) });
}

export const EVENTO_ALTERNAR = "wa:alternar-panel";
/** Abre o cierra el panel de WhatsApp desde cualquier parte de la pantalla. */
export function alternarBurbuja() {
  window.dispatchEvent(new Event(EVENTO_ALTERNAR));
}
