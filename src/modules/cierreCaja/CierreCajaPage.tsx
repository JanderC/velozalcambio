import { useEffect, useState } from "react";
import { Header } from "../../components/common/Header";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { abrirCaja, cerrarCaja, getCierreAbierto, getHistorialCierres, type CierreCaja } from "../../api/cierreCaja.api";
import { AbrirTurnoForm } from "./AbrirTurnoForm";
import { CerrarTurnoForm } from "./CerrarTurnoForm";
import { ApiError } from "../../api/client";
import "./cierreCaja.css";

export function CierreCajaPage() {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [cajaId, setCajaId] = useState<number | "">("");
  const [monedaId, setMonedaId] = useState<number | "">("");
  const [cierreActual, setCierreActual] = useState<CierreCaja | null>(null);
  const [historial, setHistorial] = useState<CierreCaja[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCajas().then(setCajas).catch(() => setCajas([]));
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
  }, []);

  async function cargarEstado() {
    if (!cajaId || !monedaId) {
      setCierreActual(null);
      return;
    }
    setError(null);
    try {
      const cierre = await getCierreAbierto(Number(cajaId), Number(monedaId));
      setCierreActual(cierre);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar el estado de la caja.");
    }
  }

  useEffect(() => {
    cargarEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaId, monedaId]);

  useEffect(() => {
    if (cajaId) getHistorialCierres(Number(cajaId)).then(setHistorial).catch(() => setHistorial([]));
  }, [cajaId]);

  async function handleAbrir() {
    if (!cajaId || !monedaId) return;
    setError(null);
    try {
      const nuevo = await abrirCaja({ cajaId: Number(cajaId), monedaId: Number(monedaId) });
      setCierreActual(nuevo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir el turno.");
    }
  }

  async function handleCerrar(saldoReal: string) {
    if (!cierreActual) return;
    setError(null);
    try {
      const cerrado = await cerrarCaja(cierreActual.id, saldoReal);
      setCierreActual(cerrado);
      if (cajaId) getHistorialCierres(Number(cajaId)).then(setHistorial);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar el turno.");
    }
  }

  return (
    <div className="cierre-page">
      <Header />
      <div className="cierre-header">
        <h1>Cierre de Caja</h1>
        <p>Apertura y cierre de turno, con cuadre automático.</p>
      </div>

      <div className="cierre-selector">
        <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Seleccionar caja/banco…</option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Seleccionar moneda…</option>
          {monedas.map((m) => (
            <option key={m.id} value={m.id}>{m.codigo}</option>
          ))}
        </select>
      </div>

      {error && <p className="cierre-error" style={{ padding: "0 40px" }}>{error}</p>}

      {cajaId && monedaId && (
        <div className="cierre-panel">
          {!cierreActual ? (
            <AbrirTurnoForm onAbrir={handleAbrir} />
          ) : cierreActual.estado === "ABIERTA" ? (
            <CerrarTurnoForm cierre={cierreActual} onCerrar={handleCerrar} />
          ) : (
            <div>
              <p className="cierre-panel-vacio">El último turno de esta caja/moneda ya está cerrado.</p>
              <button className="cierre-btn-abrir" onClick={handleAbrir}>Abrir nuevo turno</button>
            </div>
          )}
        </div>
      )}

      {cajaId && (
        <div className="cierre-historial">
          <h3>Historial de turnos</h3>
          {historial.length === 0 ? (
            <p style={{ fontFamily: "Inter, sans-serif", color: "#6b7280" }}>Sin turnos registrados todavía.</p>
          ) : (
            <table className="cierre-historial-tabla">
              <thead>
                <tr>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Moneda</th>
                  <th>Inicial</th>
                  <th>Esperado</th>
                  <th>Real</th>
                  <th>Diferencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.fecha_apertura).toLocaleString("es-CO")}</td>
                    <td>{h.fecha_cierre ? new Date(h.fecha_cierre).toLocaleString("es-CO") : "—"}</td>
                    <td>{h.moneda_codigo}</td>
                    <td>{Number(h.saldo_inicial).toLocaleString("es-CO")}</td>
                    <td>{h.saldo_esperado ? Number(h.saldo_esperado).toLocaleString("es-CO") : "—"}</td>
                    <td>{h.saldo_real ? Number(h.saldo_real).toLocaleString("es-CO") : "—"}</td>
                    <td className={
                      h.diferencia == null ? "" : Number(h.diferencia) === 0 ? "cierre-diferencia-cero" : Number(h.diferencia) > 0 ? "cierre-diferencia-pos" : "cierre-diferencia-neg"
                    }>
                      {h.diferencia != null ? Number(h.diferencia).toLocaleString("es-CO") : "—"}
                    </td>
                    <td className={h.estado === "ABIERTA" ? "cierre-estado-abierta" : "cierre-estado-cerrada"}>{h.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}