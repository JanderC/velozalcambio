import { useEffect, useSyncExternalStore } from "react";
import { whatsappApi, type RespuestaRapidaWa } from "../../../api/whatsapp.api";

// Las respuestas rápidas se comparten entre el módulo de WhatsApp y la burbuja: se piden una vez y todos ven lo mismo.
// Quien las edita llama a ponerRapidas() y el selector de cualquier chat se actualiza al instante.
let lista: RespuestaRapidaWa[] = [];
let cargadas = false;
let pidiendo: Promise<void> | null = null;
let ultimaCarga = 0;
const oyentes = new Set<() => void>();

export function ponerRapidas(nueva: RespuestaRapidaWa[]) {
  lista = nueva;
  cargadas = true;
  ultimaCarga = Date.now();
  oyentes.forEach((avisar) => avisar());
}

export function recargarRapidas(): Promise<void> {
  pidiendo ??= whatsappApi
    .rapidas()
    .then(ponerRapidas)
    .catch(() => {
      // sin conexión o sin permiso: queda lo que había
    })
    .finally(() => {
      pidiendo = null;
    });
  return pidiendo;
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

/** Las respuestas rápidas cargadas. Con activo=true se piden (y se refrescan si otro las cambió hace rato). */
export function useRespuestasRapidas(activo = true) {
  const rapidas = useSyncExternalStore(suscribir, () => lista);
  useEffect(() => {
    if (activo && (!cargadas || Date.now() - ultimaCarga > 60_000)) void recargarRapidas();
  }, [activo]);
  return rapidas;
}

const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Las que coinciden con lo buscado: primero las que coinciden por título, después por el texto. */
export function filtrarRapidas(rapidas: RespuestaRapidaWa[], busqueda: string) {
  const q = sinAcentos(busqueda.trim());
  if (!q) return rapidas;
  const porTitulo = rapidas.filter((r) => sinAcentos(r.titulo).includes(q));
  const porTexto = rapidas.filter((r) => !porTitulo.includes(r) && sinAcentos(r.texto).includes(q));
  return [...porTitulo, ...porTexto];
}
