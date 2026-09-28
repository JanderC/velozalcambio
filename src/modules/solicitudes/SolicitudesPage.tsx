import { useEffect, useState, useCallback } from "react";
import { Header } from "../../components/common/Header";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getSolicitudesPendientes, confirmarSolicitud, rechazarSolicitud, type Solicitud } from "../../api/transacciones.api";
import { ApiError } from "../../api/client";

const REFRESCO_MS = 8000;

export function SolicitudesPage() {
  const [bancos, setBancos] = useState<Caja[]>([]);
  const [bancoSeleccionado, setBancoSeleccionado] = useState<number | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [conteosPorBanco, setConteosPorBanco] = useState<Record<number, number>>({});
  const [procesando, setProcesando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCajas().then((data) => setBancos(data.filter((c) => c.tipo === "BANCO")));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const [todas, filtradas] = await Promise.all([
        getSolicitudesPendientes(),
        bancoSeleccionado ? getSolicitudesPendientes(bancoSeleccionado) : getSolicitudesPendientes(),
      ]);
      const conteos: Record<number, number> = {};
      for (const s of todas) conteos[s.caja_id] = (conteos[s.caja_id] ?? 0) + 1;
      setConteosPorBanco(conteos);
      setSolicitudes(bancoSeleccionado ? filtradas.filter((s) => s.caja_id === bancoSeleccionado) : filtradas);
    } catch {
      setError("No se pudieron cargar las solicitudes.");
    }
  }, [bancoSeleccionado]);

  useEffect(() => {
    cargar();
    const interval = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(interval);
  }, [cargar]);

  async function handleConfirmar(id: number) {
    setProcesando(id);
    setError(null);
    try {
      await confirmarSolicitud(id);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
    } finally {
      setProcesando(null);
    }
  }

  async function handleRechazar(id: number) {
    const motivo = window.prompt("Motivo del rechazo (opcional):") ?? undefined;
    setProcesando(id);
    setError(null);
    try {
      await rechazarSolicitud(id, motivo);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="solicitudes-page">
      <Header />
      <div className="solicitudes-layout">
        <aside className="solicitudes-sidebar">
          <button
            className={bancoSeleccionado === null ? "activo" : ""}
            onClick={() => setBancoSeleccionado(null)}
          >
            <span>Todas</span>
            <span className="badge">{Object.values(conteosPorBanco).reduce((a, b) => a + b, 0)}</span>
          </button>
          {bancos.map((b) => (
            <button
              key={b.id}
              className={bancoSeleccionado === b.id ? "activo" : ""}
              onClick={() => setBancoSeleccionado(b.id)}
            >
              <span>{b.nombre}</span>
              <span className="badge">{conteosPorBanco[b.id] ?? 0}</span>
            </button>
          ))}
        </aside>

        <main className="solicitudes-main">
          <h1>Bandeja de Solicitudes</h1>
          <p className="solicitudes-hint">Se actualiza automáticamente — no hace falta recargar la página.</p>

          {error && <p className="solicitudes-error">{error}</p>}

          {solicitudes.length === 0 ? (
            <p className="solicitudes-vacio">No hay solicitudes pendientes por confirmar.</p>
          ) : (
            <table className="solicitudes-tabla">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Banco</th>
                  <th>Monto</th>
                  <th>Referencia</th>
                  <th>Registrada por</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.created_at).toLocaleTimeString("es-CO")}</td>
                    <td>{s.tercero_nombre ?? "—"}</td>
                    <td>{s.caja_nombre}</td>
                    <td>
                      {Number(s.monto_origen).toLocaleString("es-CO")} {s.moneda_codigo}
                    </td>
                    <td>{s.referencia_codigo ?? "—"}</td>
                    <td>{s.creado_por_nombre}</td>
                    <td className="solicitudes-acciones">
                      <button
                        className="btn-confirmar"
                        disabled={procesando === s.id}
                        onClick={() => handleConfirmar(s.id)}
                      >
                        Confirmar pago
                      </button>
                      <button
                        className="btn-rechazar"
                        disabled={procesando === s.id}
                        onClick={() => handleRechazar(s.id)}
                      >
                        Rechazar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>
    </div>
  );
}