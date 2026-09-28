import { useEffect, useState } from "react";
import { getCuadresCaja, type CuadreCaja } from "../../api/reportes.api";
import { getCajas, type Caja } from "../../api/cajas.api";

export function CuadresCajaView() {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<number | "">("");
  const [datos, setDatos] = useState<CuadreCaja[]>([]);

  useEffect(() => {
    getCajas().then(setCajas).catch(() => setCajas([]));
  }, []);

  useEffect(() => {
    getCuadresCaja({ cajaId: cajaId || undefined }).then(setDatos).catch(() => setDatos([]));
  }, [cajaId]);

  return (
    <div>
      <div className="reportes-filtros">
        <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todas las cajas</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {datos.length === 0 ? (
        <p className="reportes-hint">No hay cierres registrados.</p>
      ) : (
        <table className="reportes-tabla">
          <thead>
            <tr><th>Caja</th><th>Moneda</th><th>Apertura</th><th>Cierre</th><th>Esperado</th><th>Real</th><th>Diferencia</th><th>Por</th></tr>
          </thead>
          <tbody>
            {datos.map((c) => (
              <tr key={c.id}>
                <td>{c.caja_nombre}</td>
                <td>{c.moneda_codigo}</td>
                <td>{new Date(c.fecha_apertura).toLocaleString("es-CO")}</td>
                <td>{c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleString("es-CO") : "—"}</td>
                <td>{c.saldo_esperado ? Number(c.saldo_esperado).toLocaleString("es-CO") : "—"}</td>
                <td>{c.saldo_real ? Number(c.saldo_real).toLocaleString("es-CO") : "—"}</td>
                <td>{c.diferencia ? Number(c.diferencia).toLocaleString("es-CO") : "—"}</td>
                <td>{c.usuario_nombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}