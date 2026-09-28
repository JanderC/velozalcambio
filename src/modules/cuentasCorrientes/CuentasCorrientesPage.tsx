import { useEffect, useState } from "react";
import { Header } from "../../components/common/Header";
import {
  getCanales,
  getCuentasCorrientes,
  type Canal,
  type CuentaCorrienteResumen,
} from "../../api/cuentasCorrientes.api";
import { EstadoCuentaView } from "./EstadoCuentaView";
import { ImportarSaldosForm } from "./ImportarSaldosForm";
import "./cuentasCorrientes.css";

export function CuentasCorrientesPage() {
  const [canales, setCanales] = useState<Canal[]>([]);
  const [canalId, setCanalId] = useState<number | "">("");
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[]>([]);
  const [seleccionada, setSeleccionada] = useState<CuentaCorrienteResumen | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    getCanales().then(setCanales).catch(() => setCanales([]));
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const data = await getCuentasCorrientes({ canalId: canalId || undefined });
      setCuentas(data);
      if (seleccionada) {
        const actualizada = data.find((c) => c.id === seleccionada.id);
        if (actualizada) setSeleccionada(actualizada);
      }
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalId]);

  return (
    <div className="cc-page">
      <Header />
      <div className="cc-header">
        <div>
          <h1>Cuentas Corrientes</h1>
          <p>Saldos corridos por cliente, canal y moneda.</p>
        </div>
        <ImportarSaldosForm onImportado={cargar} />
      </div>

      <div className="cc-filtros">
        <select value={canalId} onChange={(e) => setCanalId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todos los canales</option>
          {canales.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      <div className="cc-layout">
        <div className="cc-lista">
          {cargando ? (
            <p style={{ padding: 16, fontFamily: "Inter, sans-serif", color: "#6b7280" }}>Cargando…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tercero</th>
                  <th>Canal</th>
                  <th>Moneda</th>
                  <th>Saldo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => (
                  <tr key={c.id} className={seleccionada?.id === c.id ? "activa" : ""} onClick={() => setSeleccionada(c)}>
                    <td>{c.tercero_nombre}</td>
                    <td>{c.canal_nombre}</td>
                    <td>{c.moneda_codigo}</td>
                    <td className={Number(c.saldo_actual) >= 0 ? "cc-saldo-pos" : "cc-saldo-neg"}>
                      {Number(c.saldo_actual).toLocaleString("es-CO")}
                    </td>
                    <td>
                      <span className={`cc-estado-badge cc-estado-${c.estado.toLowerCase()}`}>{c.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {seleccionada ? (
          <EstadoCuentaView cuenta={seleccionada} onActualizar={cargar} />
        ) : (
          <div className="cc-detalle">
            <p className="cc-detalle-vacio">Elegí una cuenta de la lista para ver su historial.</p>
          </div>
        )}
      </div>
    </div>
  );
}