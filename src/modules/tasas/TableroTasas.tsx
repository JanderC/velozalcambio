import { useState, type FormEvent } from "react";
import { ArrowDownRight, ArrowUpRight, Check, PencilLine, X } from "lucide-react";
import { ApiError } from "../../api/client";
import { DOLAR_COMPRA, DOLAR_VENTA, EURO_COMPRA, EURO_VENTA, OTRAS, escrita, guardarTablero, tendencia, useTablero, type Casilla, type Tablero, type ValoresTablero } from "./tablero";
import { PreferenciaTasaUsada } from "./TasasDelDia";
import { useAuth } from "../../auth/useAuth";
import "./tableroTasas.css";

const fechaCorta = (f: string) => new Date(f).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "2-digit" });
const hora = (f: string) => new Date(f).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });

/** Lo que se escribe -> como se guarda: "3.200" -> "3200" · "3,5" -> "3.5" · "5 %" -> "5%" */
function paraGuardar(texto: string) {
  const t = texto.trim();
  if (!t) return "";
  const pct = t.includes("%");
  const signo = t.startsWith("-") ? "-" : "";
  let n = t.replace(/[%\s-]/g, "");
  // con coma es decimal; con puntos solos son miles (3.200)
  n = n.includes(",") ? n.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(n) ? n.replace(/\./g, "") : n;
  return `${signo}${n}${pct ? "%" : ""}`;
}

/**
 * La "Tasa del día" tal como se publica: dólar (compra por billete y venta), euro, bolívares, Zelle, Western y USDT,
 * con la fecha y la hora de la última actualización. Quien puede, la actualiza ahí mismo y la hora cambia sola.
 * Estas son las tasas que se proponen en taquilla, Confirmaciones y cuentas.
 */
export function TableroTasas({ puedeEditar }: { puedeEditar: boolean }) {
  const tablero = useTablero();
  const { usuario } = useAuth();
  const [editando, setEditando] = useState<ValoresTablero | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const valores = tablero?.actual?.valores ?? {};

  function empezar() {
    // se edita como se ve: 3.200, 5%
    const v: ValoresTablero = {};
    for (const c of [...DOLAR_COMPRA, ...DOLAR_VENTA, ...EURO_COMPRA, EURO_VENTA, ...OTRAS.flatMap((o) => o.casillas)])
      v[c.clave] = valores[c.clave] ? `${escrita(valores[c.clave])}${/%/.test(valores[c.clave]!) ? "%" : ""}` : "";
    setEditando(v);
    setError(null);
  }
  async function guardar(e?: FormEvent) {
    e?.preventDefault();
    if (!editando) return;
    const limpio: ValoresTablero = {};
    for (const [k, v] of Object.entries(editando)) {
      const g = paraGuardar(v);
      if (g) limpio[k] = g;
    }
    setGuardando(true);
    try {
      await guardarTablero(limpio);
      setEditando(null);
      setError(null);
      setAviso("Tasas actualizadas: ya salen en taquilla, Confirmaciones y cuentas.");
      setTimeout(() => setAviso(null), 6000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron guardar las tasas.");
    } finally {
      setGuardando(false);
    }
  }

  const casilla = (c: Casilla, grande = false) => (
    <Valor key={c.clave} casilla={c} tablero={tablero} grande={grande} editando={editando} onCambio={(v) => setEditando((e) => (e ? { ...e, [c.clave]: v } : e))} />
  );

  return (
    <form className="tt" onSubmit={guardar}>
      <header className="tt-cabeza">
        <div className="tt-titulo">
          <span>Tasa del día</span>
          <h2>La mejor tasa del mercado</h2>
        </div>
        <div className="tt-fecha">
          <div>
            <span>Fecha</span>
            <strong>{tablero?.actual ? fechaCorta(tablero.actual.actualizado) : "—"}</strong>
          </div>
          <div>
            <span>Hora act.</span>
            <strong>{tablero?.actual ? hora(tablero.actual.actualizado) : "—"}</strong>
          </div>
        </div>
        {puedeEditar &&
          (editando ? (
            <div className="tt-acciones">
              <button type="submit" className="tt-guardar" disabled={guardando}>
                <Check size={16} /> {guardando ? "Guardando…" : "Guardar tasas"}
              </button>
              <button type="button" className="tt-cancelar" onClick={() => setEditando(null)} aria-label="Cancelar">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button type="button" className="tt-editar" onClick={empezar}>
              <PencilLine size={16} /> Actualizar tasas
            </button>
          ))}
      </header>
      {tablero?.actual?.por && !editando && <p className="tt-por">Actualizada por {tablero.actual.por}</p>}
      {error && <p className="tt-error">{error}</p>}
      {aviso && <p className="tt-ok">{aviso}</p>}

      <div className="tt-cuerpo">
        <section className="tt-bloque tt-dolar">
          <h3>Dólar</h3>
          <div className="tt-dos">
            <div>
              <h4>Compra</h4>
              {DOLAR_COMPRA.map((c) => casilla(c))}
            </div>
            <div>
              <h4>Venta</h4>
              {DOLAR_VENTA.map((c) => casilla(c))}
            </div>
          </div>
        </section>

        <section className="tt-bloque tt-euro">
          <h3>Euro</h3>
          <div className="tt-dos">
            <div>
              <h4>Compra</h4>
              {EURO_COMPRA.map((c) => casilla(c))}
            </div>
            <div className="tt-euro-venta">
              <h4>Venta</h4>
              {casilla({ ...EURO_VENTA, etiqueta: "" }, true)}
            </div>
          </div>
        </section>

        <section className="tt-bloque tt-otras">
          {OTRAS.map((o) => (
            <div key={o.titulo} className="tt-otra">
              <h3>{o.titulo}</h3>
              {o.casillas.map((c) => casilla(o.casillas.length === 1 ? { ...c, etiqueta: "" } : c))}
            </div>
          ))}
        </section>
      </div>
      {editando && <p className="tt-nota">Escribe cada tasa como se publica (3.200 · 3,5 · 5%). Al guardar, la fecha y la hora se actualizan solas.</p>}
      {puedeEditar && usuario && !editando && <PreferenciaTasaUsada usuarioId={usuario.id} />}
      {!tablero?.actual && !editando && <p className="tt-nota">Todavía no hay tasas del día{puedeEditar ? ": toca “Actualizar tasas” para cargarlas." : "."}</p>}
    </form>
  );
}

/** Una casilla: su etiqueta, el valor (o el campo para escribirlo) y si subió o bajó desde la versión anterior. */
function Valor({
  casilla,
  tablero,
  grande,
  editando,
  onCambio,
}: {
  casilla: Casilla;
  tablero: Tablero | null;
  grande: boolean;
  editando: ValoresTablero | null;
  onCambio: (v: string) => void;
}) {
  const v = tablero?.actual?.valores[casilla.clave];
  const t = tendencia(tablero, casilla.clave);
  return (
    <label className={`tt-fila ${grande ? "grande" : ""}`}>
      {casilla.etiqueta && <span className="tt-etiqueta">{casilla.etiqueta}</span>}
      {editando ? (
        <input value={editando[casilla.clave] ?? ""} onChange={(e) => onCambio(e.target.value)} inputMode="decimal" placeholder="—" aria-label={casilla.etiqueta || casilla.clave} />
      ) : (
        <span className="tt-valor">
          {v ? `${escrita(v)}${/%/.test(v) ? " %" : ""}` : "—"}
          {t === "sube" && <ArrowUpRight size={15} className="tt-sube" aria-label="subió" />}
          {t === "baja" && <ArrowDownRight size={15} className="tt-baja" aria-label="bajó" />}
        </span>
      )}
    </label>
  );
}
