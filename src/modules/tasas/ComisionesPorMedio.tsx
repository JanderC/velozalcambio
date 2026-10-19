import { useState } from "react";
import { Check, PencilLine, Percent, X } from "lucide-react";
import { ApiError } from "../../api/client";
import { COMISIONES, valorComision } from "../cuentasCorrientes/metodoPago";
import { guardarTablero, useTablero, type ValoresTablero } from "./tablero";
import { formatearMonto } from "../../utils/montos";

const ver = (v: string, sufijo: string) => (!v.trim() ? "—" : sufijo === "%" ? `${v.replace(".", ",")} %` : `${formatearMonto(v)} ${sufijo}`);

/**
 * Las comisiones de cada método de pago en Confirmaciones: al cargar la captura se reconoce el método (Nequi, Zelle,
 * Remitly…) y se aplica la que toca según el monto. Se guardan con la Tasa del día, para todos.
 */
export function ComisionesPorMedio({ puedeEditar }: { puedeEditar: boolean }) {
  const tablero = useTablero();
  const valores = tablero?.actual?.valores;
  const [editando, setEditando] = useState<ValoresTablero | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function empezar() {
    const v: ValoresTablero = {};
    for (const g of COMISIONES) for (const c of g.campos) v[c.clave] = valorComision(valores, c.clave);
    setEditando(v);
    setError(null);
  }
  async function guardar() {
    if (!editando) return;
    for (const [k, v] of Object.entries(editando)) if (v.trim() && !/^\d+([.,]\d+)?$/.test(v.trim())) return setError(`"${v}" no es un número (${k}).`);
    setGuardando(true);
    try {
      // las demás tasas quedan como están: solo cambian las comisiones
      const limpio: ValoresTablero = { ...(valores ?? {}) };
      for (const [k, v] of Object.entries(editando)) limpio[k] = v.trim().replace(",", ".");
      await guardarTablero(limpio);
      setEditando(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron guardar las comisiones.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="cpm">
      <header>
        <h3>
          <Percent size={17} /> Comisiones por medio
        </h3>
        <p>En Confirmaciones, al cargar la captura se reconoce el banco y se pone sola la comisión que le toca.</p>
        {puedeEditar &&
          (editando ? (
            <span className="cpm-acciones">
              <button type="button" className="si" onClick={() => void guardar()} disabled={guardando}>
                <Check size={15} /> {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={() => setEditando(null)} aria-label="Cancelar">
                <X size={15} />
              </button>
            </span>
          ) : (
            <button type="button" className="cpm-editar" onClick={empezar}>
              <PencilLine size={15} /> Cambiar
            </button>
          ))}
      </header>
      {error && <p className="cpm-error">{error}</p>}
      <div className="cpm-grupos">
        {COMISIONES.map((g) => (
          <div key={g.titulo} className="cpm-grupo">
            <h4>{g.titulo}</h4>
            {g.campos.map((c) => (
              <label key={c.clave}>
                <span>{c.etiqueta}</span>
                {editando ? (
                  <span className="cpm-campo">
                    <input value={editando[c.clave] ?? ""} onChange={(e) => setEditando((v) => (v ? { ...v, [c.clave]: e.target.value } : v))} inputMode="decimal" placeholder="—" />
                    <small>{c.sufijo}</small>
                  </span>
                ) : (
                  <b>{ver(valorComision(valores, c.clave), c.sufijo)}</b>
                )}
              </label>
            ))}
            <small>{g.nota}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
