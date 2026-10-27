import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, HandCoins, Lock } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getHistorialTaquilla, textoMedio, type HistorialTaquilla as Historial } from "../../api/taquilla.api";
import { formatearMonto } from "../../utils/montos";
import { cuentaDe } from "./OperacionesTaquilla";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
function diasAtras(n: number) {
  const d = new Date(`${hoy()}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const fechaHora = (f: string) => new Date(f).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" });
function dinero(monto: string, codigo: string | null) {
  const negativo = monto.startsWith("-");
  const numero = formatearMonto(negativo ? monto.slice(1) : monto);
  const texto = codigo === "COP" ? `$${numero}` : codigo === "VES" ? `Bs. ${numero}` : codigo ? `${numero} ${codigo}` : numero;
  return negativo ? `- ${texto}` : texto;
}
const referenciaDe = (descripcion: string | null) => (descripcion ?? "").split(" · ")[1]?.trim() || "—";

type Pestana = "cierres" | "entregas" | "confirmadas" | "operaciones";

/**
 * El historial de una taquilla: sus cierres anteriores (con el cuadre de cada moneda), lo que entregó, las
 * transferencias que confirmó y sus ingresos y egresos de ventanilla, en el rango de días que se elija.
 */
export function HistorialTaquilla({ nombre, onCerrar }: { nombre: string; onCerrar: () => void }) {
  const [desde, setDesde] = useState(diasAtras(6));
  const [hasta, setHasta] = useState(hoy());
  const [pestana, setPestana] = useState<Pestana>("cierres");
  const [datos, setDatos] = useState<Historial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await getHistorialTaquilla(desde, hasta));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el historial.");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const rango = (d: string, h: string) => {
    setDesde(d);
    setHasta(h);
  };
  const pestanas: { id: Pestana; texto: string; n: number | undefined }[] = [
    { id: "cierres", texto: "Cierres", n: datos?.cierres.length },
    { id: "entregas", texto: "Entregadas", n: datos?.entregas.length },
    { id: "confirmadas", texto: "Transferencias confirmadas", n: datos?.confirmadas.length },
    { id: "operaciones", texto: "Ingresos y egresos", n: datos?.operaciones.length },
  ];

  return (
    <Modal titulo={`Historial · ${nombre}`} ancho="ancho" onCerrar={onCerrar}>
      <div className="tqh">
        <div className="tqh-rango">
          <label>
            Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} min={desde} max={hoy()} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </label>
          <div className="tqh-rapidos">
            <button type="button" onClick={() => rango(hoy(), hoy())}>
              Hoy
            </button>
            <button type="button" onClick={() => rango(diasAtras(1), diasAtras(1))}>
              Ayer
            </button>
            <button type="button" onClick={() => rango(diasAtras(6), hoy())}>
              7 días
            </button>
            <button type="button" onClick={() => rango(diasAtras(29), hoy())}>
              30 días
            </button>
          </div>
        </div>

        <nav className="tqh-pestanas" role="tablist">
          {pestanas.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? "activo" : ""} onClick={() => setPestana(p.id)}>
              {p.texto} {p.n !== undefined && <span>{p.n}</span>}
            </button>
          ))}
        </nav>

        {error && <p className="cc-form-error">{error}</p>}
        {cargando && !datos && <p className="tqh-vacio">Cargando…</p>}

        {datos && pestana === "cierres" && (
          <div className="tqh-lista">
            {datos.cierres.length === 0 && <p className="tqh-vacio">No hubo cierres en estos días.</p>}
            {datos.cierres.map((c) => (
              <article key={c.cerrada_en} className="tqh-cierre">
                <header>
                  <Lock size={15} />
                  <strong>Cerrada el {fechaHora(c.cerrada_en)}</strong>
                  <span>
                    Abierta el {fechaHora(c.abierta_en)} por {c.abrio} · {c.entregas} entregas · {c.operaciones} ingresos/egresos
                  </span>
                </header>
                <table className="tqh-tabla">
                  <thead>
                    <tr>
                      <th>Moneda</th>
                      <th className="num">Abrió con</th>
                      <th className="num">Debía haber</th>
                      <th className="num">Se contó</th>
                      <th className="num">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.monedas.map((m) => {
                      const dif = Number(m.diferencia ?? 0);
                      return (
                        <tr key={m.codigo}>
                          <td>{m.codigo}</td>
                          <td className="num">{dinero(m.inicial, m.codigo)}</td>
                          <td className="num">{m.esperado ? dinero(m.esperado, m.codigo) : "—"}</td>
                          <td className="num">{m.contado ? dinero(m.contado, m.codigo) : "—"}</td>
                          <td className={`num ${dif > 0 ? "sobra" : dif < 0 ? "falta" : "cuadra"}`}>
                            {dif === 0 ? "cuadró" : `${dif > 0 ? "sobró " : "faltó "}${dinero(String(Math.abs(dif)), m.codigo)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        )}

        {datos && pestana === "entregas" && (
          <>
            {datos.totalesEntregas.length > 0 && (
              <div className="tqh-totales">
                {datos.totalesEntregas.map((t) => (
                  <span key={`${t.codigo}-${t.medio}`}>
                    <HandCoins size={14} /> {t.medio === "EFECTIVO" ? "En efectivo" : "Por transferencia"}: <b>{dinero(t.total, t.codigo)}</b> ({t.cantidad})
                  </span>
                ))}
              </div>
            )}
            <div className="tqh-tabla-scroll">
              <table className="tqh-tabla">
                <thead>
                  <tr>
                    <th>Entregada</th>
                    <th>Cliente</th>
                    <th>Referencia</th>
                    <th>Cómo</th>
                    <th>Quién</th>
                    <th className="num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.entregas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="tqh-vacio">
                        No entregó nada en estos días.
                      </td>
                    </tr>
                  )}
                  {datos.entregas.map((s) => (
                    <tr key={s.id}>
                      <td className="tqh-fecha">{s.pagado_en ? fechaHora(s.pagado_en) : "—"}</td>
                      <td>{s.cliente_nombre}</td>
                      <td>{referenciaDe(s.descripcion)}</td>
                      <td>{textoMedio(s.pagado_medio)}</td>
                      <td>{s.pagado_por_nombre ?? "—"}</td>
                      <td className="num">{dinero(s.monto, s.moneda_codigo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {datos && pestana === "confirmadas" && (
          <div className="tqh-tabla-scroll">
            <table className="tqh-tabla">
              <thead>
                <tr>
                  <th>Confirmada</th>
                  <th>Cliente</th>
                  <th>Referencia</th>
                  <th>Quién</th>
                  <th>Estado</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {datos.confirmadas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="tqh-vacio">
                      No confirmó transferencias en estos días (Western, Zelle…).
                    </td>
                  </tr>
                )}
                {datos.confirmadas.map((c) => (
                  <tr key={c.id}>
                    <td className="tqh-fecha">{fechaHora(c.confirmado_en)}</td>
                    <td>{c.cliente_nombre}</td>
                    <td>{referenciaDe(c.descripcion)}</td>
                    <td>{c.confirmado_por_nombre ?? "—"}</td>
                    <td>
                      <CheckCircle2 size={13} /> {c.pagado_en ? "confirmada y entregada" : "confirmada, por entregar"}
                    </td>
                    <td className="num">{dinero(c.monto, c.moneda_codigo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {datos && pestana === "operaciones" && (
          <div className="tqh-tabla-scroll">
            <table className="tqh-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cuenta</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Quién</th>
                </tr>
              </thead>
              <tbody>
                {datos.operaciones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="tqh-vacio">
                      No hubo ingresos ni egresos de ventanilla en estos días.
                    </td>
                  </tr>
                )}
                {datos.operaciones.map((o) => (
                  <tr key={o.id} className={o.estado === "ANULADA" ? "anulada" : ""}>
                    <td className="tqh-fecha">{fechaHora(o.created_at)}</td>
                    <td>
                      {o.tipo === "INGRESO" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />} {o.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                      {o.medio !== "EFECTIVO" && <small> · {textoMedio(o.medio)}</small>}
                    </td>
                    <td>{cuentaDe(o)}</td>
                    <td>{o.cliente_nombre ?? "—"}</td>
                    <td>{o.estado === "PENDIENTE" ? "por confirmar" : o.estado === "ANULADA" ? "anulada" : `confirmada${o.confirmado_por_nombre ? ` (${o.confirmado_por_nombre})` : ""}`}</td>
                    <td>{o.usuario_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
