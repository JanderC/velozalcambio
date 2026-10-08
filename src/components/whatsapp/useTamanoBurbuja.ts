import { useCallback, useState, type CSSProperties, type PointerEvent } from "react";

// El tamaño de la burbuja de WhatsApp lo elige cada persona: con los tamaños ya hechos (botón del encabezado) o
// estirándola desde la esquina de arriba a la izquierda. Se recuerda en este navegador.
interface Tamano {
  ancho: number;
  alto: number;
}

export const TAMANOS: { nombre: string; t: Tamano }[] = [
  { nombre: "Normal", t: { ancho: 440, alto: 680 } },
  { nombre: "Grande", t: { ancho: 560, alto: 800 } },
  { nombre: "Muy grande", t: { ancho: 720, alto: 940 } },
];
// La letra va aparte del tamaño de la ventana: cuánto se agranda todo el texto de la burbuja
export const LETRAS: { nombre: string; escala: number }[] = [
  { nombre: "normal", escala: 1 },
  { nombre: "grande", escala: 1.15 },
  { nombre: "más grande", escala: 1.3 },
  { nombre: "enorme", escala: 1.5 },
];
const LETRA_INICIAL = 1; // "grande": la letra de antes se veía chica
const CLAVE_LETRA = "wa-burbuja-letra";
const CLAVE = "wa-burbuja-tamano";
const MIN_ANCHO = 340;
const MIN_ALTO = 420;

function leer(): Tamano {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<Tamano> | null;
    if (g && Number.isFinite(g.ancho) && Number.isFinite(g.alto)) return { ancho: g.ancho!, alto: g.alto! };
  } catch {
    // sin almacenamiento o dato roto: el tamaño normal
  }
  return TAMANOS[0]!.t;
}

function guardar(t: Tamano) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(t));
  } catch {
    // no es grave: solo no se recuerda
  }
}

function leerLetra(): number {
  try {
    const i = Number(localStorage.getItem(CLAVE_LETRA) ?? LETRA_INICIAL);
    if (Number.isInteger(i) && LETRAS[i]) return i;
  } catch {
    // sin almacenamiento: la letra inicial
  }
  return LETRA_INICIAL;
}

export function useTamanoBurbuja() {
  const [tamano, setTamano] = useState<Tamano>(leer);
  const [letra, setLetra] = useState(leerLetra);
  const letraSiguiente = (letra + 1) % LETRAS.length;
  const pasarLetra = useCallback(() => {
    setLetra(letraSiguiente);
    try {
      localStorage.setItem(CLAVE_LETRA, String(letraSiguiente));
    } catch {
      // no es grave: solo no se recuerda
    }
  }, [letraSiguiente]);

  // El tamaño ya hecho que está puesto (-1 si se estiró a mano)
  const actual = TAMANOS.findIndex((x) => x.t.ancho === tamano.ancho && x.t.alto === tamano.alto);
  const siguiente = TAMANOS[(actual + 1) % TAMANOS.length]!;
  const pasarAlSiguiente = useCallback(() => {
    setTamano(siguiente.t);
    guardar(siguiente.t);
  }, [siguiente]);

  // Estirar: la burbuja está pegada abajo a la derecha, así que crece hacia arriba y hacia la izquierda
  const alEmpezarAEstirar = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const panel = e.currentTarget.parentElement;
      if (!panel) return;
      e.preventDefault();
      const tirador = e.currentTarget;
      tirador.setPointerCapture(e.pointerId);
      const caja = panel.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ultimo: Tamano = { ancho: caja.width, alto: caja.height };
      const alMover = (m: globalThis.PointerEvent) => {
        ultimo = {
          ancho: Math.round(Math.max(MIN_ANCHO, Math.min(window.innerWidth - 40, caja.width + (x0 - m.clientX)))),
          alto: Math.round(Math.max(MIN_ALTO, Math.min(window.innerHeight - 110, caja.height + (y0 - m.clientY)))),
        };
        setTamano(ultimo);
      };
      const alSoltar = () => {
        tirador.removeEventListener("pointermove", alMover);
        tirador.removeEventListener("pointerup", alSoltar);
        tirador.removeEventListener("pointercancel", alSoltar);
        guardar(ultimo);
      };
      tirador.addEventListener("pointermove", alMover);
      tirador.addEventListener("pointerup", alSoltar);
      tirador.addEventListener("pointercancel", alSoltar);
    },
    []
  );

  const estilo = { "--wb-ancho": `${tamano.ancho}px`, "--wb-alto": `${tamano.alto}px`, "--wb-escala": LETRAS[letra]!.escala } as CSSProperties;
  return { estilo, siguiente: siguiente.nombre, pasarAlSiguiente, alEmpezarAEstirar, letraSiguiente: LETRAS[letraSiguiente]!.nombre, pasarLetra };
}
