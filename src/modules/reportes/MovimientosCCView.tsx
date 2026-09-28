import { useEffect, useState } from "react";
import { getMovimientosCCReporte, type MovimientoCCReporte } from "../../api/reportes.api";
import { getCanales, type Canal } from "../../api/cuentasCorrientes.api";

export function MovimientosCCView() {
  const [canales, setCanales] = useState<Canal[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [canalId, setCanalId] = useState<number | "">("");
  const [datos, setDatos] = useState<MovimientoCCReporte[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    getCanales().then(setCanales).catch(() => setCanales([]));
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar() {
    setCargando(true);
    try {
      const data = await getMovimientosCCReporte({ desde: desde || undefined, hasta: hasta || undefined, canalId: canalId || undefined });
      setDatos(data);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <div className="reportes-filtros">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <select value={canalId} onChange={(e) => setCanalId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={buscar}>Buscar</button>
      </div>

      {cargando ? (
        <p className="reportes-hint">Cargando…</p>
      ) : datos.length === 0 ? (
        <p className="reportes-hint">No hay movimientos con esos filtros.</p>
      ) : (
        <table className="reportes-tabla">
          <thead>
            <tr><th>Fecha</th><th>Tercero</th><th>Canal</th><th>Tipo</th><th>Monto</th><th>Saldo</th></tr>
          </thead>
          <tbody>
            {datos.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.fecha).toLocaleString("es-CO")}</td>
                <td>{m.tercero_nombre}</td>
                <td>{m.canal_nombre}</td>
                <td>{m.tipo}</td>
                <td>{Number(m.monto).toLocaleString("es-CO")} {m.moneda_codigo}</td>
                <td>{Number(m.saldo_nuevo).toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}