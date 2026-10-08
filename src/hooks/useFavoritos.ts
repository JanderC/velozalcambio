import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "../auth/useAuth";

// Módulos favoritos de cada usuario: se guardan en este navegador (por usuario), en el orden en que los marcó.
const clave = (usuarioId: number) => `veloz.favoritos.${usuarioId}`;
const oyentes = new Set<() => void>();
const cache = new Map<number, string[]>();
const VACIO: string[] = [];

function leer(usuarioId: number): string[] {
  const enCache = cache.get(usuarioId);
  if (enCache) return enCache;
  let lista: string[] = [];
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(clave(usuarioId)) ?? "[]");
    if (Array.isArray(guardado)) lista = guardado.filter((x): x is string => typeof x === "string");
  } catch {
    lista = [];
  }
  cache.set(usuarioId, lista);
  return lista;
}

function guardar(usuarioId: number, lista: string[]) {
  cache.set(usuarioId, lista);
  try {
    localStorage.setItem(clave(usuarioId), JSON.stringify(lista));
  } catch {
    // sin espacio o en modo privado: quedan mientras dure la pestaña
  }
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  // otra pestaña cambió los favoritos: se vuelve a leer
  const alCambiar = (e: StorageEvent) => {
    if (e.key?.startsWith("veloz.favoritos.")) {
      cache.clear();
      avisar();
    }
  };
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", alCambiar);
  };
}

/** Los ids de los módulos favoritos del usuario y cómo marcar o desmarcar uno. */
export function useFavoritos() {
  const { usuario } = useAuth();
  const usuarioId = usuario?.id ?? null;
  const favoritos = useSyncExternalStore(suscribir, () => (usuarioId == null ? VACIO : leer(usuarioId)));
  const alternar = useCallback(
    (moduloId: string) => {
      if (usuarioId == null) return;
      const actual = leer(usuarioId);
      guardar(usuarioId, actual.includes(moduloId) ? actual.filter((x) => x !== moduloId) : [...actual, moduloId]);
    },
    [usuarioId]
  );
  return { favoritos, alternar, esFavorito: (moduloId: string) => favoritos.includes(moduloId) };
}
