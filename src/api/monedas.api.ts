import { api } from "./client";

export interface Moneda {
  id: number;
  codigo: string;
  nombre: string;
}

// Las monedas casi nunca cambian: una vez que llegan quedan guardadas mientras la página esté abierta. Si el servidor
// no responde (por ejemplo, mientras se reinicia), se vuelve a intentar unas veces antes de rendirse: antes, una pantalla
// abierta durante un reinicio se quedaba sin monedas ("Elegí la moneda") hasta recargar.
let guardadas: Moneda[] | null = null;
let pidiendo: Promise<Moneda[]> | null = null;

export function getMonedas(): Promise<Moneda[]> {
  if (guardadas) return Promise.resolve(guardadas);
  pidiendo ??= (async () => {
    let ultimoError: unknown = null;
    for (let intento = 0; intento < 6; intento++) {
      try {
        const lista = await api.get<Moneda[]>("/monedas");
        if (lista.length) guardadas = lista;
        return lista;
      } catch (e) {
        ultimoError = e;
        await new Promise((listo) => setTimeout(listo, 1500 * (intento + 1)));
      }
    }
    throw ultimoError;
  })().finally(() => {
    pidiendo = null;
  });
  return pidiendo;
}
