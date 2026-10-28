import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getTaquillas, rutaDeTaquilla, type TaquillaConfig } from "../api/taquillas.api";
import { MODULOS } from "../modules/launcher/modulos.config";
import type { ModuloConfig } from "../types/modulo.types";

// Las taquillas que hay (se crean y habilitan en Configuración › Taquillas). Se piden una vez y se recuerdan en
// este navegador, así el panel de módulos las muestra apenas abre, sin esperar al servidor.
const CLAVE = "veloz.taquillas";
const PRIMERA: TaquillaConfig[] = [{ numero: 1, nombre: "Taquilla 1", activo: true, caja_id: 0, abierta: false, saldos: [] }];
const oyentes = new Set<() => void>();
let pedida = false;
let lista: TaquillaConfig[] = (() => {
  try {
    const guardada: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    return Array.isArray(guardada) && guardada.length > 0 ? (guardada as TaquillaConfig[]) : PRIMERA;
  } catch {
    return PRIMERA;
  }
})();

/** Deja la lista nueva (la que devolvió el servidor al crear o editar) y avisa a todas las pantallas. */
export function guardarTaquillas(nueva: TaquillaConfig[]) {
  lista = nueva;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(nueva));
  } catch {
    // sin espacio o en modo privado: queda mientras dure la pestaña
  }
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

/** Todas las taquillas (habilitadas y deshabilitadas). */
export function useTaquillas() {
  const actual = useSyncExternalStore(suscribir, () => lista);
  useEffect(() => {
    if (pedida) return;
    pedida = true;
    getTaquillas()
      .then(guardarTaquillas)
      .catch(() => {
        // sin permiso (operador) o sin conexión: se queda con la que tenía
      });
  }, []);
  return actual;
}

/** El módulo del panel para una taquilla: igual que la Taquilla 1, con su nombre y su ruta. */
function moduloDeTaquilla(plantilla: ModuloConfig, t: TaquillaConfig): ModuloConfig {
  return { ...plantilla, id: t.numero === 1 ? "taquilla" : `taquilla-${t.numero}`, titulo: t.nombre, ruta: rutaDeTaquilla(t.numero) };
}

/** Los módulos del panel, con una tarjeta por cada taquilla habilitada en el lugar de la Taquilla 1. */
export function useModulos() {
  const taquillas = useTaquillas();
  return useMemo(() => {
    const i = MODULOS.findIndex((m) => m.id === "taquilla");
    const plantilla = MODULOS[i];
    if (!plantilla) return MODULOS;
    const generados = taquillas.filter((t) => t.activo).map((t) => moduloDeTaquilla(plantilla, t));
    return [...MODULOS.slice(0, i), ...generados, ...MODULOS.slice(i + 1)];
  }, [taquillas]);
}
