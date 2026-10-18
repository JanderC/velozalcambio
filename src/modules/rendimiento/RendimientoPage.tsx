import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, FileCheck2, NotebookPen, TrendingUp, Users } from "lucide-react";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../auth/useAuth";
import { ApiError } from "../../api/client";
import { getRendimiento, type Rendimiento, type RendimientoEmpleado, type TotalMoneda } from "../../api/reportes.api";
import { formatearMonto } from "../../utils/montos";
import "./rendimiento.css";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
function moverDia(dia: string, dias: number) {
  const d = new Date(`${dia}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
const dinero = (t: TotalMoneda) => {
  const n = formatearMonto(String(t.total));
  return t.codigo === "COP" ? `$${n}` : t.codigo === "VES" ? `Bs. ${n}` : `${n} ${t.codigo}`;
};
const ROL: Record<string, string> = { ADMIN: "Administrador", ASESOR: "Asesor", CAJERO: "Cajero" };
const total = (e: RendimientoEmpleado) => e.confirmaciones.cantidad + e.clientesTaquilla + e.cuentasCorrientes + e.cuentasPorCobrar;

/**
 * Rendimiento del día: cuántas confirmaciones registró cada empleado, cuántos clientes atendió en taquilla y cuánto
 * movió. El dueño ve a todo el equipo; cada empleado ve el suyo.
 */
export function RendimientoPage() {
  const { usuario } = useAuth();
  const esDueno = usuario?.rol === "ADMIN";
  const [dia, setDia] = useState(hoy());
  const [datos, setDatos] = useState<Rendimiento | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await getRendimiento(dia));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el rendimiento.");
    }
  }, [dia]);
  useEffect(() => {
    setDatos(null);
    void cargar();
    // el día de hoy se va actualizando solo
    if (dia !== hoy()) return;
    const t = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar, dia]);

  const empleados = datos?.empleados ?? [];
  const activos = esDueno ? empleados.filter((e) => total(e) > 0) : empleados;
  const sinNada = esDueno ? empleados.filter((e) => total(e) === 0) : [];
  const suma = (f: (e: RendimientoEmpleado) => number) => empleados.reduce((s, e) => s + f(e), 0);

  return (
    <div className="rend-page">
      <Header />
      <div className="rend-cabeza">
        <div>
          <h1>
            <TrendingUp size={24} /> {esDueno ? "Rendimiento del equipo" : "Mi rendimiento"}
          </h1>
          <p>{esDueno ? "Lo que hizo cada empleado en el día: confirmaciones, clientes atendidos en taquilla y lo que movió." : "Lo que llevas hecho en el día."}</p>
        </div>
        <div className="rend-dia">
          <button type="button" onClick={() => setDia(moverDia(dia, -1))} aria-label="Día anterior">
            <ChevronLeft size={18} />
          </button>
          <input type="date" value={dia} max={hoy()} onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Día" />
          <button type="button" onClick={() => setDia(moverDia(dia, 1))} disabled={dia >= hoy()} aria-label="Día siguiente">
            <ChevronRight size={18} />
          </button>
          {dia !== hoy() && (
            <button type="button" className="rend-hoy" onClick={() => setDia(hoy())}>
              Hoy
            </button>
          )}
        </div>
      </div>
      <p className="rend-fecha">{dia === hoy() ? `Hoy, ${fechaLarga(dia)}` : fechaLarga(dia)}</p>

      {error && <p className="rend-error">{error}</p>}
      {!datos && !error && <p className="rend-cargando">Cargando…</p>}

      {datos && esDueno && (
        <section className="rend-totales">
          <div>
            <FileCheck2 size={20} />
            <span>Confirmaciones</span>
            <strong>{suma((e) => e.confirmaciones.cantidad)}</strong>
          </div>
          <div>
            <Users size={20} />
            <span>Clientes atendidos en taquilla</span>
            <strong>{suma((e) => e.clientesTaquilla)}</strong>
          </div>
          <div>
            <NotebookPen size={20} />
            <span>Movimientos en cuentas</span>
            <strong>{suma((e) => e.cuentasCorrientes + e.cuentasPorCobrar)}</strong>
          </div>
        </section>
      )}

      {datos && (
        <section className="rend-lista">
          {activos.map((e, i) => (
            <article key={e.usuarioId} className="rend-tarjeta">
              <header>
                {esDueno && <span className="rend-puesto">{i + 1}</span>}
                <div>
                  <h2>{e.nombre}</h2>
                  <small>{ROL[e.rol] ?? e.rol}</small>
                </div>
              </header>
              <div className="rend-numeros">
                <div className="rend-numero">
                  <FileCheck2 size={16} />
                  <strong>{e.confirmaciones.cantidad}</strong>
                  <span>confirmaciones</span>
                  {e.confirmaciones.clientes > 0 && <small>{e.confirmaciones.clientes} clientes</small>}
                </div>
                <div className="rend-numero">
                  <Users size={16} />
                  <strong>{e.clientesTaquilla}</strong>
                  <span>clientes en taquilla</span>
                  {e.clientesTaquilla > 0 && (
                    <small>
                      {e.ventanilla.cantidad} en ventanilla · {e.pagadas.cantidad} pagos
                    </small>
                  )}
                </div>
                <div className="rend-numero">
                  <CreditCard size={16} />
                  <strong>{e.cuentasCorrientes + e.cuentasPorCobrar}</strong>
                  <span>movimientos en cuentas</span>
                  {e.cuentasCorrientes + e.cuentasPorCobrar > 0 && (
                    <small>
                      {e.cuentasCorrientes} corrientes · {e.cuentasPorCobrar} por cobrar
                    </small>
                  )}
                </div>
              </div>
              {(e.confirmaciones.porMoneda.length > 0 || e.pagadas.porMoneda.length > 0 || e.ventanilla.ingresos.length > 0 || e.ventanilla.egresos.length > 0) && (
                <dl className="rend-montos">
                  {e.confirmaciones.porMoneda.length > 0 && (
                    <div>
                      <dt>Confirmado</dt>
                      <dd>{e.confirmaciones.porMoneda.map(dinero).join(" · ")}</dd>
                    </div>
                  )}
                  {e.pagadas.porMoneda.length > 0 && (
                    <div>
                      <dt>Pagado a clientes</dt>
                      <dd>{e.pagadas.porMoneda.map(dinero).join(" · ")}</dd>
                    </div>
                  )}
                  {e.ventanilla.ingresos.length > 0 && (
                    <div>
                      <dt>Ingresos de ventanilla</dt>
                      <dd>{e.ventanilla.ingresos.map((t) => `${dinero(t)} (${t.cantidad})`).join(" · ")}</dd>
                    </div>
                  )}
                  {e.ventanilla.egresos.length > 0 && (
                    <div>
                      <dt>Egresos de ventanilla</dt>
                      <dd>{e.ventanilla.egresos.map((t) => `${dinero(t)} (${t.cantidad})`).join(" · ")}</dd>
                    </div>
                  )}
                </dl>
              )}
            </article>
          ))}
          {activos.length === 0 && <p className="rend-vacio">{esDueno ? "Nadie registró nada este día." : "Todavía no hay nada registrado este día."}</p>}
        </section>
      )}
      {sinNada.length > 0 && <p className="rend-sin-nada">Sin movimientos este día: {sinNada.map((e) => e.nombre).join(", ")}.</p>}
    </div>
  );
}
