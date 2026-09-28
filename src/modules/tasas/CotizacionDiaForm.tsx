import { useEffect, useState, type FormEvent } from "react";
import { Lightbulb, Save } from "lucide-react";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { registrarCotizacionDetalle, getTrmColombia } from "../../api/tasas.api";
import { ApiError } from "../../api/client";

const MARGENES_SUGERIDOS = [1, 2, 3, 5, 7];

type Tipo = "COMPRA" | "VENTA";
type Categoria = "EFECTIVO" | "GIRO";

const TIPOS: { valor: Tipo; label: string }[] = [
  { valor: "COMPRA", label: "Compra" },
  { valor: "VENTA", label: "Venta" },
];
const CATEGORIAS: { valor: Categoria; label: string }[] = [
  { valor: "EFECTIVO", label: "Efectivo (billete)" },
  { valor: "GIRO", label: "Giro / Transferencia" },
];

export function CotizacionDiaForm({ onGuardado }: { onGuardado: () => void }) {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [trmActual, setTrmActual] = useState<number | null>(null);

  const [monedaId, setMonedaId] = useState<number | "">("");
  const [tipo, setTipo] = useState<Tipo>("COMPRA");
  const [categoria, setCategoria] = useState<Categoria>("EFECTIVO");
  const [etiqueta, setEtiqueta] = useState("");
  const [modoValor, setModoValor] = useState<"precio" | "porcentaje">("precio");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then(setMonedas);
    getTrmColombia()
      .then((d) => setTrmActual(d.actual?.valor ?? null))
      .catch(() => setTrmActual(null));
  }, []);

  const monedaSeleccionada = monedas.find((m) => m.id === monedaId);
  const mostrarSugerencia = monedaSeleccionada?.codigo === "USD" && tipo === "COMPRA" && modoValor === "precio" && categoria === "EFECTIVO";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (!monedaId || !etiqueta.trim() || !valor) {
      setError("Completá moneda, etiqueta y valor.");
      return;
    }
    setEnviando(true);
    try {
      await registrarCotizacionDetalle({
        monedaId: Number(monedaId),
        tipo,
        categoria,
        etiqueta: etiqueta.trim(),
        valor: modoValor === "precio" ? valor : undefined,
        ajustePct: modoValor === "porcentaje" ? valor : undefined,
      });
      setExito(`Guardado: ${monedaSeleccionada?.codigo ?? ""} ${tipo.toLowerCase()} · ${etiqueta.trim()}`);
      // Se mantienen moneda, tipo y categoría: lo habitual es cargar varias etiquetas seguidas de la misma moneda.
      setEtiqueta("");
      setValor("");
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="registro-form" onSubmit={handleSubmit}>
      <label className="registro-campo">
        Moneda
        <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Seleccionar…</option>
          {monedas.filter((m) => m.codigo !== "COP").map((m) => (
            <option key={m.id} value={m.id}>{m.codigo}</option>
          ))}
        </select>
      </label>

      <div className="registro-fila">
        <div className="registro-campo">
          Tipo
          <div className="registro-chips">
            {TIPOS.map((t) => (
              <button type="button" key={t.valor} className={tipo === t.valor ? "activo" : ""} onClick={() => setTipo(t.valor)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="registro-campo">
          Categoría
          <div className="registro-chips">
            {CATEGORIAS.map((c) => (
              <button type="button" key={c.valor} className={categoria === c.valor ? "activo" : ""} onClick={() => setCategoria(c.valor)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="registro-campo">
        Etiqueta
        <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder='ej. "100-50", "Deteriorado", "Western Union"' />
      </label>

      <div className="registro-fila">
        <div className="registro-campo">
          Se expresa como
          <div className="registro-chips">
            <button type="button" className={modoValor === "precio" ? "activo" : ""} onClick={() => setModoValor("precio")}>Precio fijo</button>
            <button type="button" className={modoValor === "porcentaje" ? "activo" : ""} onClick={() => setModoValor("porcentaje")}>Porcentaje (%)</button>
          </div>
        </div>
        <label className="registro-campo">
          {modoValor === "precio" ? "Valor (COP)" : "Porcentaje"}
          <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={modoValor === "precio" ? "3240" : "5"} />
        </label>
      </div>

      {mostrarSugerencia && trmActual != null && (
        <div className="registro-sugerencia">
          <span><Lightbulb size={15} className="icono-inline" /> TRM de hoy: <strong>${trmActual.toLocaleString("es-CO")}</strong> — sugerencia de compra (TRM menos margen):</span>
          <div className="registro-sugerencia-botones">
            {MARGENES_SUGERIDOS.map((m) => {
              const sugerido = trmActual * (1 - m / 100);
              return (
                <button type="button" key={m} onClick={() => setValor(sugerido.toFixed(0))}>
                  -{m}% → ${sugerido.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                </button>
              );
            })}
          </div>
          <span className="registro-sugerencia-nota">Es solo un punto de partida — el valor final siempre lo decidís vos.</span>
        </div>
      )}

      {error && <p className="registro-error">{error}</p>}
      {exito && <p className="registro-exito">{exito}</p>}

      <button type="submit" className="registro-guardar" disabled={enviando}>
        <Save size={16} /> {enviando ? "Guardando…" : "Guardar cotización"}
      </button>
    </form>
  );
}
