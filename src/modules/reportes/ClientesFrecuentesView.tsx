import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { getClientesFrecuentes, type ClienteFrecuente } from "../../api/reportes.api";
import { formatearMonto } from "../../utils/montos";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
function haceDias(n: number) {
  const d = new Date(`${hoy()}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const PERIODOS: { clave: string; texto: string; desde: () => string }[] = [
  { clave: "hoy", texto: "Hoy", desde: hoy },
  { clave: "7", texto: "Últimos 7 días", desde: () => haceDias(6) },
  { clave: "30", texto: "Últimos 30 días", desde: () => haceDias(29) },
  { clave: "mes", texto: "Este mes", desde: () => `${hoy().slice(0, 8)}01` },
  { clave: "todo", texto: "Desde siempre", desde: () => "2000-01-01" },
];
const dinero = (t: { codigo: string; total: string }) => {
  const n = formatearMonto(Number(t.total).toFixed(t.codigo === "COP" ? 0 : 2));
  return t.codigo === "COP" ? `$${n}` : t.codigo === "VES" ? `Bs. ${n}` : `${n} ${t.codigo}`;
};
const fecha = (f: string) => new Date(f).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });

/** Los clientes que más vienen a Confirmaciones: cuántas veces, cuántos días, cuánto y cuándo fue la última. */
export function ClientesFrecuentesView() {
  const [periodo, setPeriodo] = useState("30");
  const [datos, setDatos] = useState<ClienteFrecuente[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = PERIODOS.find((x) => x.clave === periodo)!;
    setDatos(null);
    getClientesFrecuentes(p.desde(), hoy())
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch(() => setError("No se pudo cargar el reporte."));
  }, [periodo]);

  return (
    <div>
      <div className="reportes-filtros rep-periodos" role="radiogroup" aria-label="Período">
        {PERIODOS.map((p) => (
          <button key={p.clave} type="button" role="radio" aria-checked={periodo === p.clave} className={periodo === p.clave ? "activo" : ""} onClick={() => setPeriodo(p.clave)}>
            {p.texto}
          </button>
        ))}
      </div>
      {error && <p className="reportes-hint">{error}</p>}
      {!datos && !error && <p className="reportes-hint">Cargando…</p>}
      {datos && datos.length === 0 && <p className="reportes-hint">Nadie vino a Confirmaciones en ese período.</p>}
      {datos && datos.length > 0 && (
        <div className="rep-tabla-scroll">
          <table className="reportes-tabla rep-frecuentes">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th className="num">Confirmaciones</th>
                <th className="num">Días que vino</th>
                <th className="num">Ya retiró</th>
                <th>Lo que se le confirmó</th>
                <th>Última vez</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((c, i) => (
                <tr key={c.tercero_id} className={i < 3 ? "top" : ""}>
                  <td className="rep-puesto">{i === 0 ? <Crown size={16} aria-label="El que más viene" /> : i + 1}</td>
                  <td>
                    {c.cuenta_id ? (
                      <Link to={`/cajas-confirmaciones?cuenta=${c.cuenta_id}`} title="Ver su cuenta en Confirmaciones">
                        {c.nombre}
                      </Link>
                    ) : (
                      c.nombre
                    )}
                    {c.telefono && <small>{c.telefono}</small>}
                  </td>
                  <td className="num">
                    <b>{c.confirmaciones}</b>
                  </td>
                  <td className="num">{c.dias}</td>
                  <td className="num">
                    {c.retiradas}
                    {c.retiradas < c.confirmaciones && <small className="rep-falta">{c.confirmaciones - c.retiradas} sin retirar</small>}
                  </td>
                  <td>{(c.totales ?? []).map(dinero).join(" · ")}</td>
                  <td>{fecha(c.ultima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {datos && datos.length > 0 && <p className="reportes-hint rep-nota">Los 50 que más vinieron en el período, del que más confirmaciones tiene al que menos.</p>}
    </div>
  );
}
