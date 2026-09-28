import { useEffect, useState } from "react";
import { getCapitalConsolidado, type CapitalMoneda } from "../../api/reportes.api";

export function CapitalConsolidadoView() {
  const [datos, setDatos] = useState<CapitalMoneda[] | null>(null);

  useEffect(() => {
    getCapitalConsolidado().then(setDatos).catch(() => setDatos([]));
  }, []);

  if (datos === null) return <p className="reportes-hint">Cargando…</p>;
  if (datos.length === 0) return <p className="reportes-hint">No hay monedas activas registradas.</p>;

  return (
    <div className="capital-grid">
      {datos.map((d) => {
        const neto = Number(d.capital_neto);
        return (
          <div className="capital-card" key={d.moneda_id}>
            <h4>{d.codigo}</h4>
            <div className="capital-linea"><span>En cajas/bancos</span><span>{Number(d.total_cajas).toLocaleString("es-CO")}</span></div>
            <div className="capital-linea"><span>Por cobrar</span><span>+{Number(d.total_por_cobrar).toLocaleString("es-CO")}</span></div>
            <div className="capital-linea"><span>Por pagar</span><span>-{Number(d.total_por_pagar).toLocaleString("es-CO")}</span></div>
            <div className={`capital-neto ${neto >= 0 ? "capital-neto-pos" : "capital-neto-neg"}`}>
              <span>Capital neto</span><span>{neto.toLocaleString("es-CO")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}