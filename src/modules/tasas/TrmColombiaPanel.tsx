import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getTrmColombia, type TrmColombiaData } from "../../api/tasas.api";

function formatearFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function VariacionChip({ label, valor }: { label: string; valor: number | null }) {
  if (valor == null) return null;
  const positivo = valor >= 0;
  return (
    <span className={`trm-variacion-chip ${positivo ? "chip-pos" : "chip-neg"}`}>
      {positivo ? "▲" : "▼"} {Math.abs(valor).toFixed(2)}% <span className="trm-variacion-label">{label}</span>
    </span>
  );
}

export function TrmColombiaPanel() {
  const [datos, setDatos] = useState<TrmColombiaData | null>(null);
  const [monto, setMonto] = useState("100");
  const [error, setError] = useState(false);

  useEffect(() => {
    getTrmColombia()
      .then(setDatos)
      .catch(() => setError(true));
  }, []);

  const trm = datos?.actual?.valor ?? null;
  const montoNum = Number(monto.replace(/,/g, "")) || 0;
  const resultadoCOP = trm ? montoNum * trm : 0;

  return (
    <div className="trm-panel">
      <div className="trm-panel-glow" />

      <div className="trm-panel-hero">
        <div className="trm-panel-hero-left">
          <span className="trm-panel-live">
            <span className="trm-panel-live-dot" /> TRM OFICIAL · COLOMBIA
          </span>
          <div className="trm-panel-valor">
            {trm != null ? (
              <>
                <span className="trm-panel-simbolo">$</span>
                {trm.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="trm-panel-unidad">COP</span>
              </>
            ) : error ? (
              <span className="trm-panel-error">No se pudo consultar la TRM</span>
            ) : (
              <span className="trm-panel-cargando">Consultando…</span>
            )}
          </div>
          {datos?.actual && (
            <span className="trm-panel-fecha">
              1 USD · Actualizado {new Date(datos.actual.fechaActualizacion).toLocaleString("es-CO")}
            </span>
          )}
          <div className="trm-variacion-row">
            <VariacionChip label="vs. ayer" valor={datos?.variacionDiaAnteriorPct ?? null} />
            <VariacionChip label="7 días" valor={datos?.variacion7dPct ?? null} />
            <VariacionChip label="30 días" valor={datos?.variacion30dPct ?? null} />
          </div>
        </div>

        <div className="trm-panel-conversor">
          <span className="trm-conversor-label">Conversor rápido</span>
          <div className="trm-conversor-row">
            <span className="trm-conversor-moneda">USD</span>
            <input
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="trm-conversor-igual">=</div>
          <div className="trm-conversor-resultado">
            $ {resultadoCOP.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
            <span className="trm-conversor-moneda-resultado">COP</span>
          </div>
        </div>
      </div>

      <div className="trm-panel-chart">
        {datos && datos.historico.length > 1 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={datos.historico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trmGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F4D751" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#F4D751" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" tickFormatter={formatearFecha} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
              <Tooltip
                contentStyle={{ background: "#0B0E13", border: "1px solid #F4D751", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => formatearFecha(v as string)}
                formatter={(v: number) => [`$${v.toLocaleString("es-CO")}`, "TRM"]}
              />
              <Area type="monotone" dataKey="valor" stroke="#F4D751" strokeWidth={2} fill="url(#trmGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="trm-panel-building">
            <TrendingUp size={16} className="icono-inline" /> Construyendo el histórico propio desde hoy — volvé mañana y ya vas a ver la curva empezar a moverse.
          </p>
        )}
      </div>
    </div>
  );
}