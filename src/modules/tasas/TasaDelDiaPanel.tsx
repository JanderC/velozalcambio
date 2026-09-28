import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Globe, TriangleAlert } from "lucide-react";
import { getCotizacionesDetalle, type CotizacionDetalle } from "../../api/tasas.api";

// Solo lectura: la tabla de precios del día tal como la ve el cliente.
// `recargar` cambia cuando se guarda una cotización nueva en la pantalla de registro.
export function TasaDelDiaPanel({ recargar = 0 }: { recargar?: number }) {
  const [lineas, setLineas] = useState<CotizacionDetalle[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    getCotizacionesDetalle()
      .then((l) => { if (vigente) setLineas(l); })
      .catch(() => { if (vigente) setLineas([]); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [recargar]);

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
        <BloqueDireccion titulo="Nosotros te compramos" icono={<ArrowDownToLine size={18} />} subtitulo="Recibimos" agrupado={compramos} tono="compra" />
        <BloqueDireccion titulo="Nosotros te vendemos" icono={<ArrowUpFromLine size={18} />} subtitulo="Entregamos" agrupado={vendemos} tono="venta" />
      </div>

      {giros.length > 0 && (
        <div className="tasa-dia-giros">
          <span className="tasa-dia-giros-titulo"><Globe size={16} /> Giros y Transferencias Internacionales</span>
          <div className="tasa-dia-giros-lista">
            {giros.map((l) => (
              <div className="tasa-dia-giro-item" key={l.id}>
                <span>{l.etiqueta}</span>
                <span className="tasa-dia-giro-valor">{formatearValor(l)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!cargando && lineas.length === 0 && <p className="tasa-dia-vacio">Todavía no hay cotizaciones registradas hoy.</p>}

      <span className="tasa-dia-disclaimer"><TriangleAlert size={14} /> Tasas sujetas a cambios sin previo aviso.</span>
    </div>
  );
}

function formatearValor(l: CotizacionDetalle) {
  return l.valor != null ? `$${Number(l.valor).toLocaleString("es-CO")}` : `${l.ajuste_pct}%`;
}

function agruparPorMoneda(lineas: CotizacionDetalle[]) {
  return lineas.reduce<Record<string, CotizacionDetalle[]>>((acc, l) => {
    (acc[l.moneda_codigo] ??= []).push(l);
    return acc;
  }, {});
}

function BloqueDireccion({
  titulo,
  icono,
  subtitulo,
  agrupado,
  tono,
}: {
  titulo: string;
  icono: ReactNode;
  subtitulo: string;
  agrupado: Record<string, CotizacionDetalle[]>;
  tono: "compra" | "venta";
}) {
  const entradas = Object.entries(agrupado);
  if (entradas.length === 0) return null;

  return (
    <div className={`tasa-dia-direccion tasa-dia-direccion-${tono}`}>
      <div className="tasa-dia-direccion-header">
        <span className="tasa-dia-direccion-titulo">{icono} {titulo}</span>
        <span className="tasa-dia-direccion-subtitulo">{subtitulo}</span>
      </div>
      <div className="tasa-dia-monedas">
        {entradas.map(([codigo, items]) => (
          <div className="tasa-dia-moneda-bloque" key={codigo}>
            <span className="tasa-dia-moneda-nombre">{codigo}</span>
            <div className="tasa-dia-chips">
              {items.map((l) => (
                <div key={l.id} className="tasa-dia-chip">
                  <span className="tasa-dia-chip-etiqueta">{l.etiqueta}</span>
                  <span className="tasa-dia-chip-valor">{formatearValor(l)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
