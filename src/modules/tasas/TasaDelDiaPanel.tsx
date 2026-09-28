import { useEffect, useState, type FormEvent } from "react";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { getCotizacionesDetalle, registrarCotizacionDetalle, getTrmColombia, type CotizacionDetalle } from "../../api/tasas.api";
import { ApiError } from "../../api/client";

const MARGENES_SUGERIDOS = [1, 2, 3, 5, 7];

export function TasaDelDiaPanel() {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [lineas, setLineas] = useState<CotizacionDetalle[]>([]);
  const [trmActual, setTrmActual] = useState<number | null>(null);

  const [monedaId, setMonedaId] = useState<number | "">("");
  const [tipo, setTipo] = useState<"COMPRA" | "VENTA">("COMPRA");
  const [categoria, setCategoria] = useState<"EFECTIVO" | "GIRO">("EFECTIVO");
  const [etiqueta, setEtiqueta] = useState("");
  const [modoValor, setModoValor] = useState<"precio" | "porcentaje">("precio");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monedaSeleccionada = monedas.find((m) => m.id === monedaId);
  const mostrarSugerencia = monedaSeleccionada?.codigo === "USD" && tipo === "COMPRA" && modoValor === "precio" && categoria === "EFECTIVO";

  async function cargar() {
    const [m, l] = await Promise.all([getMonedas(), getCotizacionesDetalle()]);
    setMonedas(m);
    setLineas(l);
  }

  useEffect(() => {
    cargar();
    getTrmColombia()
      .then((d) => setTrmActual(d.actual?.valor ?? null))
      .catch(() => setTrmActual(null));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!monedaId || !etiqueta || !valor) {
      setError("Completá moneda, etiqueta y valor.");
      return;
    }
    setEnviando(true);
    try {
      await registrarCotizacionDetalle({
        monedaId: Number(monedaId),
        tipo,
        categoria,
        etiqueta,
        valor: modoValor === "precio" ? valor : undefined,
        ajustePct: modoValor === "porcentaje" ? valor : undefined,
      });
      setEtiqueta("");
      setValor("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  const efectivo = lineas.filter((l) => l.categoria === "EFECTIVO");
  const giros = lineas.filter((l) => l.categoria === "GIRO");

  const compramos = agruparPorMoneda(efectivo.filter((l) => l.tipo === "COMPRA"));
  const vendemos = agruparPorMoneda(efectivo.filter((l) => l.tipo === "VENTA"));

  return (
    <div className="tasa-dia-panel">
      <div className="tasa-dia-header">
        <div className="tasa-dia-titulo">
          <span className="tasa-dia-eyebrow">Tasa del día</span>
          <h2>La mejor tasa del mercado</h2>
        </div>
        <span className="tasa-dia-fecha">{new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</span>
      </div>

      <div className="tasa-dia-bloques">
        <BloqueDireccion titulo="📥 Nosotros te compramos" subtitulo="Recibimos" agrupado={compramos} tono="compra" />
        <BloqueDireccion titulo="📤 Nosotros te vendemos" subtitulo="Entregamos" agrupado={vendemos} tono="venta" />
      </div>

      {giros.length > 0 && (
        <div className="tasa-dia-giros">
          <span className="tasa-dia-giros-titulo">🌐 Giros y Transferencias Internacionales</span>
          <div className="tasa-dia-giros-lista">
            {giros.map((l) => (
              <div className="tasa-dia-giro-item" key={l.id}>
                <span>{l.etiqueta}</span>
                <span className="tasa-dia-giro-valor">
                  {l.valor != null ? `$${Number(l.valor).toLocaleString("es-CO")}` : `${l.ajuste_pct}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lineas.length === 0 && <p className="tasa-dia-vacio">Todavía no hay cotizaciones registradas hoy.</p>}

      <span className="tasa-dia-disclaimer">⚠️ Tasas sujetas a cambios sin previo aviso.</span>

      <form className="tasa-dia-form" onSubmit={handleSubmit}>
        <div className="tasa-dia-form-row">
          <label>
            Moneda
            <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Seleccionar…</option>
              {monedas.map((m) => (
                <option key={m.id} value={m.id}>{m.codigo}</option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "COMPRA" | "VENTA")}>
              <option value="COMPRA">Compra</option>
              <option value="VENTA">Venta</option>
            </select>
          </label>
          <label>
            Categoría
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as "EFECTIVO" | "GIRO")}>
              <option value="EFECTIVO">Efectivo (billete)</option>
              <option value="GIRO">Giro / Transferencia</option>
            </select>
          </label>
        </div>

        <div className="tasa-dia-form-row">
          <label className="tasa-dia-etiqueta-input">
            Etiqueta
            <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder='ej. "100-50", "Deteriorado", "Western Union"' />
          </label>
        </div>

        <div className="tasa-dia-form-row">
          <label className="tasa-dia-modo">
            <input type="radio" checked={modoValor === "precio"} onChange={() => setModoValor("precio")} /> Precio fijo
          </label>
          <label className="tasa-dia-modo">
            <input type="radio" checked={modoValor === "porcentaje"} onChange={() => setModoValor("porcentaje")} /> Porcentaje (%)
          </label>
          <label className="tasa-dia-valor-input">
            {modoValor === "precio" ? "Valor" : "Porcentaje"}
            <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={modoValor === "precio" ? "3240" : "5"} />
          </label>
        </div>

        {mostrarSugerencia && trmActual != null && (
          <div className="tasa-dia-sugerencia">
            <span>💡 TRM de hoy: <strong>${trmActual.toLocaleString("es-CO")}</strong> — sugerencia de compra (TRM menos margen):</span>
            <div className="tasa-dia-sugerencia-botones">
              {MARGENES_SUGERIDOS.map((m) => {
                const sugerido = trmActual * (1 - m / 100);
                return (
                  <button type="button" key={m} onClick={() => setValor(sugerido.toFixed(0))}>
                    -{m}% → ${sugerido.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </button>
                );
              })}
            </div>
            <span className="tasa-dia-sugerencia-nota">Es solo un punto de partida — el valor final siempre lo decidís vos.</span>
          </div>
        )}

        {error && <p className="tasa-dia-error">{error}</p>}

        <button type="submit" className="tasa-dia-guardar" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar cotización"}
        </button>
      </form>
    </div>
  );
}

function agruparPorMoneda(lineas: CotizacionDetalle[]) {
  return lineas.reduce<Record<string, CotizacionDetalle[]>>((acc, l) => {
    (acc[l.moneda_codigo] ??= []).push(l);
    return acc;
  }, {});
}

function BloqueDireccion({
  titulo,
  subtitulo,
  agrupado,
  tono,
}: {
  titulo: string;
  subtitulo: string;
  agrupado: Record<string, CotizacionDetalle[]>;
  tono: "compra" | "venta";
}) {
  const entradas = Object.entries(agrupado);
  if (entradas.length === 0) return null;

  return (
    <div className={`tasa-dia-direccion tasa-dia-direccion-${tono}`}>
      <div className="tasa-dia-direccion-header">
        <span className="tasa-dia-direccion-titulo">{titulo}</span>
        <span className="tasa-dia-direccion-subtitulo">{subtitulo}</span>
      </div>
      {entradas.map(([codigo, items]) => (
        <div className="tasa-dia-moneda-bloque" key={codigo}>
          <span className="tasa-dia-moneda-nombre">{codigo}</span>
          <div className="tasa-dia-chips">
            {items.map((l) => (
              <div key={l.id} className="tasa-dia-chip">
                <span className="tasa-dia-chip-etiqueta">{l.etiqueta}</span>
                <span className="tasa-dia-chip-valor">
                  {l.valor != null ? `$${Number(l.valor).toLocaleString("es-CO")}` : `${l.ajuste_pct}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}