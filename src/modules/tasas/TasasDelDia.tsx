import { useState } from "react";
import { Sparkles } from "lucide-react";
import { guardarUnaTasa, preferenciaTasa, recordarPreferenciaTasa, type PreferenciaTasa, type Sugerencia } from "./tablero";
import "./tableroTasas.css";

/**
 * Las tasas del día que aplican a este movimiento, para tocarlas y ponerlas. La principal va primero. Si se quiere usar
 * otra, se escribe a mano: no obliga.
 */
export function ChipsTasaDelDia({ sugerencias, actual, onElegir }: { sugerencias: Sugerencia[]; actual: string; onElegir: (s: Sugerencia) => void }) {
  if (!sugerencias.length) return null;
  return (
    <div className="td-chips" role="group" aria-label="Tasa del día">
      <span>
        <Sparkles size={13} /> Tasa del día
      </span>
      {sugerencias.slice(0, 5).map((s, i) => (
        <button
          key={s.clave}
          type="button"
          className={`${i === 0 ? "principal" : ""} ${actual.trim() === s.valor ? "activo" : ""}`}
          onClick={() => onElegir(s)}
          title={`${s.etiqueta}: ${s.valor}${s.porcentaje ? " %" : ""}`}
        >
          <small>{s.etiqueta}</small> {s.valor}
          {s.porcentaje ? "%" : ""}
        </button>
      ))}
    </div>
  );
}

export interface PropuestaTasa {
  clave: string;
  etiqueta: string;
  nueva: string; // como número ("3250")
  actual: string; // como se ve ("3.280")
}

/**
 * Se usó otra tasa que la del día: ¿se guarda como la nueva tasa del día o se sigue con la misma? Se pregunta una sola
 * vez: la respuesta queda recordada y después se hace solo (se cambia en Tasas).
 */
export function decidirTasaUsada(usuarioId: number, p: PropuestaTasa, preguntar: (p: PropuestaTasa) => void, avisar: (texto: string) => void) {
  const pref = preferenciaTasa(usuarioId);
  if (pref === "no-guardar") return;
  if (pref === "guardar") {
    void guardarUnaTasa(p.clave, p.nueva)
      .then(() => avisar(`Tasa del día de ${p.etiqueta} actualizada a ${p.nueva.replace(".", ",")}.`))
      .catch(() => {});
    return;
  }
  preguntar(p);
}

export function AvisoGuardarTasa({ usuarioId, propuesta, onListo }: { usuarioId: number; propuesta: PropuestaTasa; onListo: (texto?: string) => void }) {
  const [enviando, setEnviando] = useState(false);
  const nueva = propuesta.nueva.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  async function responder(p: PreferenciaTasa) {
    recordarPreferenciaTasa(usuarioId, p);
    if (p !== "guardar") return onListo();
    setEnviando(true);
    try {
      await guardarUnaTasa(propuesta.clave, propuesta.nueva);
      onListo(`Listo: la tasa del día de ${propuesta.etiqueta} ahora es ${nueva}.`);
    } catch {
      onListo("No se pudo guardar la tasa del día.");
    }
  }
  return (
    <div className="td-propuesta" role="alertdialog" aria-label="Guardar la tasa usada">
      <p>
        Usaste <b>{nueva}</b>, y la tasa del día de <b>{propuesta.etiqueta}</b> es <b>{propuesta.actual}</b>. ¿La guardo como la nueva tasa del día?
      </p>
      <div>
        <button type="button" className="si" onClick={() => void responder("guardar")} disabled={enviando}>
          Sí, guardar {nueva}
        </button>
        <button type="button" onClick={() => void responder("no-guardar")} disabled={enviando}>
          No, seguir con {propuesta.actual}
        </button>
      </div>
      <small>Tu respuesta queda recordada y este mensaje no vuelve a salir. Se puede cambiar en Tasas.</small>
    </div>
  );
}

/** En Tasas: qué hacer cuando en una cuenta se usa otra tasa (lo que se respondió la primera vez). */
export function PreferenciaTasaUsada({ usuarioId }: { usuarioId: number }) {
  const [pref, setPref] = useState<PreferenciaTasa>(() => preferenciaTasa(usuarioId));
  const elegir = (p: PreferenciaTasa) => {
    recordarPreferenciaTasa(usuarioId, p);
    setPref(p);
  };
  return (
    <div className="td-pref">
      <span>Cuando uses otra tasa en un movimiento:</span>
      {(
        [
          ["preguntar", "Preguntarme"],
          ["guardar", "Guardarla como tasa del día"],
          ["no-guardar", "Seguir con la del día"],
        ] as [PreferenciaTasa, string][]
      ).map(([p, t]) => (
        <button key={p} type="button" className={pref === p ? "activo" : ""} onClick={() => elegir(p)} aria-pressed={pref === p}>
          {t}
        </button>
      ))}
    </div>
  );
}
