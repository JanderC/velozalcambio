import { useState } from "react";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getEstadoCuentaTercero, type CuentaEstado } from "../../api/reportes.api";

export function EstadoCuentaView() {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Tercero[]>([]);
  const [seleccionado, setSeleccionado] = useState<Tercero | null>(null);
  const [cuentas, setCuentas] = useState<CuentaEstado[] | null>(null);

  async function buscar(valor: string) {
    setQuery(valor);
    if (valor.trim().length < 2) { setResultados([]); return; }
    const data = await buscarTerceros(valor.trim());
    setResultados(data);
  }

  async function seleccionar(t: Tercero) {
    setSeleccionado(t);
    setResultados([]);
    setQuery(t.nombre);
    const data = await getEstadoCuentaTercero(t.id);
    setCuentas(data);
  }

  return (
    <div>
      <div className="estado-cuenta-buscador">
        <input placeholder="Buscar cliente por nombre o identificación..." value={query} onChange={(e) => buscar(e.target.value)} />
      </div>
      {resultados.length > 0 && (
        <ul className="estado-cuenta-resultados">
          {resultados.map((t) => (
            <li key={t.id} onClick={() => seleccionar(t)}>{t.nombre} — {t.identificacion ?? "sin identificación"}</li>
          ))}
        </ul>
      )}

      {seleccionado && cuentas === null && <p className="reportes-hint">Cargando…</p>}
      {seleccionado && cuentas?.length === 0 && <p className="reportes-hint">Este cliente no tiene cuentas corrientes.</p>}

      {cuentas?.map((c) => (
        <div className="estado-cuenta-bloque" key={c.id}>
          <h4>{c.canal_nombre} · {c.moneda_codigo}</h4>
          <p className="estado-cuenta-saldo">Saldo actual: {Number(c.saldo_actual).toLocaleString("es-CO")} {c.moneda_codigo}</p>
          {c.movimientos.length === 0 ? (
            <p className="reportes-hint">Sin movimientos.</p>
          ) : (
            <table className="reportes-tabla">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Monto</th><th>Saldo</th></tr></thead>
              <tbody>
                {c.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.fecha).toLocaleDateString("es-CO")}</td>
                    <td>{m.tipo}</td>
                    <td>{Number(m.monto).toLocaleString("es-CO")}</td>
                    <td>{Number(m.saldo_nuevo).toLocaleString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}