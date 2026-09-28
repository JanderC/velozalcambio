import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { getHistoricoMercado, type HistoricoDia, type MetricasMercado } from "../../api/tasas.api";

const PERIODOS = [7, 30, 90];

function formatearFecha(fecha: string) {
  const d = new Date(fecha);
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
}

function MetricCard({
  titulo,
  valor,
  variacion,
  destacado = false,
}: {
  titulo: string;
  valor: string;
  variacion?: number | null;
  destacado?: boolean;
}) {
  const positivo = variacion != null && variacion >= 0;
  return (
    <div className={`metric-card ${destacado ? "metric-card-destacado" : ""}`}>
      <span className="metric-card-titulo">{titulo}</span>
      <span className="metric-card-valor">{valor}</span>
      {variacion != null && (
        <span className={`metric-card-variacion ${positivo ? "variacion-pos" : "variacion-neg"}`}>
          {positivo ? "▲" : "▼"} {Math.abs(variacion).toFixed(1)}% (7d)
        </span>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tasas-chart-tooltip">
      <p className="tasas-chart-tooltip-fecha">{formatearFecha(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value != null ? Number(p.value).toLocaleString("es-VE") : "—"}
        </p>
      ))}
    </div>
  );
}

export function MercadoDashboard() {
  const [periodo, setPeriodo] = useState(30);
  const [historico, setHistorico] = useState<HistoricoDia[] | null>(null);
  const [metricas, setMetricas] = useState<MetricasMercado | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getHistoricoMercado(periodo)
      .then((data) => {
        setHistorico(data.historico);
        setMetricas(data.metricas);
        setError(false);
      })
      .catch(() => setError(true));
  }, [periodo]);

  return (
    <div className="mercado-dashboard">
      <div className="mercado-dashboard-header">
        <div>
          <h2>Mercado cambiario — Venezuela</h2>
          <p>Dólar BCV (oficial) vs. paralelo, fuente DolarApi.com</p>
        </div>
        <div className="mercado-periodo-selector">
          {PERIODOS.map((p) => (
            <button key={p} className={periodo === p ? "activo" : ""} onClick={() => setPeriodo(p)}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="tasas-externas-error">No se pudo consultar el histórico del mercado.</p>}

      {metricas && (
        <div className="metric-grid">
          <MetricCard
            titulo="Dólar BCV (oficial)"
            valor={metricas.oficialActual != null ? metricas.oficialActual.toLocaleString("es-VE") : "—"}
            variacion={metricas.variacionOficial7d}
            destacado
          />
          <MetricCard
            titulo="Dólar Paralelo"
            valor={metricas.paraleloActual != null ? metricas.paraleloActual.toLocaleString("es-VE") : "—"}
            variacion={metricas.variacionParalelo7d}
            destacado
          />
          <MetricCard
            titulo="Brecha cambiaria"
            valor={metricas.brechaPct != null ? `${metricas.brechaPct.toFixed(1)}%` : "—"}
          />
        </div>
      )}

      <div className="mercado-chart-wrap">
        {historico === null && !error && <p className="tasas-externas-hint">Cargando gráfico…</p>}
        {historico && historico.length === 0 && <p className="tasas-externas-hint">Sin datos históricos disponibles.</p>}
        {historico && historico.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={historico} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="fecha" tickFormatter={formatearFecha} tick={{ fontSize: 11, fontFamily: "Inter" }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} stroke="#9ca3af" width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12 }} />
              <Line type="monotone" dataKey="oficial" name="Oficial (BCV)" stroke="#14406F" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="paralelo" name="Paralelo (Yadio)" stroke="#B29746" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}