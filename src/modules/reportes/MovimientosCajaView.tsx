import { useEffect, useState } from "react";
import { getMovimientosCajaReporte, type MovimientoCajaReporte } from "../../api/reportes.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";

export function MovimientosCajaView() {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cajaId, setCajaId] = useState<number | "">("");
  const [monedaId, setMonedaId] = useState<number | "">("");
  const [datos, setDatos] = useState<MovimientoCajaReporte[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    getCajas().then(setCajas).catch(() => setCajas([]));
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar() {
    setCargando(true);
    try {
      const data = await getMovimientosCajaReporte({
        desde: desde || undefined,
        hasta: hasta || undefined,
        cajaId: cajaId || undefined,
        monedaId: monedaId || undefined,
      });
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
        <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todas las cajas</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todas las monedas</option>
          {monedas.map((m) => <option key={m.id} value={m.id}>{m.codigo}</option>)}
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
            <tr><th>Fecha</th><th>Caja</th><th>Tipo</th><th>Monto</th><th>Saldo resultante</th></tr>
          </thead>
          <tbody>
            {datos.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.created_at).toLocaleString("es-CO")}</td>
                <td>{m.caja_nombre}</td>
                <td className={m.tipo === "INGRESO" ? "tipo-ingreso" : "tipo-egreso"}>{m.tipo}</td>
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