import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, Download, Landmark, LockOpen, Search, Star, TriangleAlert, X } from "lucide-react";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { getEstadoCaja, type EstadoCaja, type MovimientoDeCaja } from "../../api/cajas.api";
import { TIPO_CAJA_LABEL } from "./CajaForm";
import "./cajas.css";

const REFRESCO_MS = 8000;

type Periodo = "hoy" | "7d" | "30d" | "mes" | "todo" | "rango";
const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo" },
  { valor: "rango", etiqueta: "Rango…" },
];

// Día calendario de Colombia en formato AAAA-MM-DD (así filtra el backend)
function diaBogota(fecha: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(fecha);
}

function rangoDe(periodo: Periodo, desde: string, hasta: string): { desde?: string; hasta?: string } {
  const hoy = new Date();
  const hace = (dias: number) => diaBogota(new Date(hoy.getTime() - dias * 86400000));
  switch (periodo) {
    case "hoy":
      return { desde: diaBogota(hoy), hasta: diaBogota(hoy) };
    case "7d":
      return { desde: hace(6), hasta: diaBogota(hoy) };
    case "30d":
      return { desde: hace(29), hasta: diaBogota(hoy) };
    case "mes":
      return { desde: `${diaBogota(hoy).slice(0, 8)}01`, hasta: diaBogota(hoy) };
    case "rango":
      return { desde: desde || undefined, hasta: hasta || undefined };
    default:
      return {};
  }
}

function formatear(monto: string, decimales = 4) {
  return Number(monto).toLocaleString("es-CO", { maximumFractionDigits: decimales });
}

// Qué fue cada movimiento, en palabras
function concepto(m: MovimientoDeCaja): { titulo: string; clase: string } {
  const cliente = m.tercero_nombre ? ` · ${m.tercero_nombre}` : "";
  const entra = m.tipo === "INGRESO";
  switch (m.transaccion_tipo) {
    case "FONDEO":
      return { titulo: "Fondeo (capital que entra)", clase: "fondeo" };
    case "TRANSFERENCIA_INTERNA":
      return { titulo: entra ? `Transferencia desde ${m.contraparte_nombre ?? "otra caja"}` : `Transferencia a ${m.contraparte_nombre ?? "otra caja"}`, clase: "transferencia" };
    case "COMPRA_DIVISA":
      return { titulo: entra ? `Compra de divisa · recibido${cliente}` : `Compra de divisa · pago${cliente}`, clase: "compra" };
    case "VENTA_DIVISA":
      return { titulo: entra ? `Venta de divisa · cobro${cliente}` : `Venta de divisa · entregado${cliente}`, clase: "venta" };
    case "DEPOSITO":
      return { titulo: `Depósito${cliente}`, clase: "deposito" };
    case "RETIRO":
      return { titulo: `Retiro${cliente}`, clase: "retiro" };
    case "ABONO_CXC":
      return { titulo: `Abono de cuenta por cobrar${cliente}`, clase: "abono" };
    case "ABONO_CXP":
      return { titulo: `Abono de cuenta por pagar${cliente}`, clase: "abono" };
    default:
      return { titulo: "Abono / cuenta corriente", clase: "abono" };
  }
}

function nombreLegible(texto: string) {
  if (texto !== texto.toUpperCase()) return texto;
  const t = texto.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function exportarCsv(nombreCaja: string, moneda: string, movimientos: MovimientoDeCaja[]) {
  const filas = [
    ["Fecha", "Concepto", "Operación", "Referencia", "Método", "Usuario", "Entrada", "Salida", "Saldo anterior", "Saldo"],
    ...movimientos.map((m) => [
      new Date(m.created_at).toLocaleString("es-CO"),
      concepto(m).titulo,
      m.transaccion_id ? `#${m.transaccion_id}` : "",
      m.referencia_codigo ?? "",
      m.metodo_pago_nombre ? nombreLegible(m.metodo_pago_nombre) : "",
      m.usuario_nombre,
      m.tipo === "INGRESO" ? m.monto : "",
      m.tipo === "EGRESO" ? m.monto : "",
      m.saldo_anterior,
      m.saldo_nuevo,
    ]),
  ];
  const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreCaja}-${moneda}-${diaBogota(new Date())}.csv`.replace(/\s+/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}

export function CajaDetallePage() {
  const { id } = useParams();
  const cajaId = Number(id);

  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [monedaId, setMonedaId] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState<"" | "INGRESO" | "EGRESO">("");
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);
  const [nuevos, setNuevos] = useState<Set<number>>(new Set());
  const idsVistos = useRef<Set<number> | null>(null);
  // Cada consulta lleva un número; solo se aplica la respuesta de la última
  // (si cambian los filtros rápido, una respuesta vieja no pisa a la nueva)
  const ultimaConsulta = useRef(0);
  const [consultando, setConsultando] = useState(false);

  const rango = rangoDe(periodo, desde, hasta);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!Number.isInteger(cajaId)) return setError("Caja inválida.");
      const numero = ++ultimaConsulta.current;
      if (!silencioso) setConsultando(true);
      try {
        const datos = await getEstadoCaja(cajaId, { ...rango, monedaId: monedaId ?? undefined, tipo: tipo || undefined });
        if (numero !== ultimaConsulta.current) return;
        // Resaltar los movimientos que llegaron desde la última lectura
        const vistos = idsVistos.current;
        if (vistos && silencioso) {
          const llegaron = new Set(datos.movimientos.filter((m) => !vistos.has(m.id)).map((m) => m.id));
          if (llegaron.size > 0) {
            setNuevos(llegaron);
            setTimeout(() => setNuevos(new Set()), 3000);
          }
        }
        idsVistos.current = new Set(datos.movimientos.map((m) => m.id));
        setEstado(datos);
        setActualizadoEn(new Date());
        setError(null);
        // Primera carga: arrancar en la moneda con más plata
        if (monedaId === null && datos.monedas.length > 0) {
          const principal = [...datos.monedas].sort((a, b) => Number(b.saldoActual) - Number(a.saldoActual))[0]!;
          setMonedaId(principal.monedaId);
        }
      } catch (err) {
        if (!silencioso && numero === ultimaConsulta.current) setError(err instanceof ApiError ? err.message : "No se pudo cargar la caja.");
      } finally {
        if (numero === ultimaConsulta.current) setConsultando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cajaId, monedaId, tipo, rango.desde, rango.hasta]
  );

  useEffect(() => {
    idsVistos.current = null;
    cargar();
    const intervalo = setInterval(() => {
      if (!document.hidden) cargar(true);
    }, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  const moneda = estado?.monedas.find((m) => m.monedaId === monedaId) ?? null;

  const movimientos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = estado?.movimientos.filter((m) => monedaId === null || m.moneda_id === monedaId) ?? [];
    if (!q) return lista;
    return lista.filter((m) =>
      [concepto(m).titulo, m.referencia_codigo, m.usuario_nombre, m.observacion, m.transaccion_id ? `#${m.transaccion_id}` : null]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [estado, monedaId, busqueda]);

  if (!estado) {
    return (
      <div className="cajas-page">
        <Header />
        <div className="cajas-header">
          <div>
            <Link to="/cajas" className="caja-det-volver"><ChevronLeft size={15} /> Cajas</Link>
            <p>{error ?? "Cargando la caja…"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { caja } = estado;
  const esBanco = caja.tipo === "BANCO";
  const dec = moneda?.decimales ?? 2;

  return (
    <div className="cajas-page">
      <Header />

      {/* ---------- Encabezado de la caja ---------- */}
      <section className="caja-det-hero">
        <Link to="/cajas" className="caja-det-volver"><ChevronLeft size={15} /> Todas las cajas</Link>
        <div className="caja-det-hero-fila">
          <div>
            <h1>
              {esBanco && <Landmark size={22} />} {caja.nombre}
              {caja.es_principal && <span className="caja-tarjeta-principal-badge"><Star size={13} /> Principal</span>}
            </h1>
            <div className="caja-det-etiquetas">
              <span>{TIPO_CAJA_LABEL[caja.tipo]}</span>
              {caja.banco && <span>{caja.banco}</span>}
              {caja.numero_cuenta && <span>N.º {caja.numero_cuenta}</span>}
              {caja.titular && <span>{caja.titular}</span>}
              {!caja.activo && <span className="caja-det-inactiva">Inactiva</span>}
            </div>
          </div>
          <span className="cajas-en-vivo caja-det-vivo">
            <span className="cajas-pulso" /> En vivo · cada {REFRESCO_MS / 1000} s
            {actualizadoEn && <> · {actualizadoEn.toLocaleTimeString("es-CO")}</>}
          </span>
        </div>

        {/* Una pestaña por moneda: cada una se ve por separado */}
        <div className="caja-det-monedas" role="tablist">
          {estado.monedas.length === 0 && <span className="caja-det-sin">Esta caja todavía no tuvo movimientos.</span>}
          {estado.monedas.map((m) => (
            <button key={m.monedaId} role="tab" aria-selected={m.monedaId === monedaId} className={m.monedaId === monedaId ? "activo" : ""} onClick={() => setMonedaId(m.monedaId)}>
              <span>{m.monedaCodigo}</span>
              <strong>{formatear(m.saldoActual, m.decimales)}</strong>
              <small className={m.turnoAbierto ? "abierto" : ""}>{m.turnoAbierto ? "Turno abierto" : "Turno cerrado"}</small>
            </button>
          ))}
        </div>
      </section>

      {error && <p className="cajas-banner cajas-banner-error">{error}</p>}

      {moneda && (
        <>
          {/* ---------- Período ---------- */}
          <section className="caja-det-periodo">
            <div className="cajas-chips">
              {PERIODOS.map((p) => (
                <button key={p.valor} className={periodo === p.valor ? "activo" : ""} onClick={() => setPeriodo(p.valor)}>
                  {p.etiqueta}
                </button>
              ))}
            </div>
            {periodo === "rango" && (
              <div className="caja-det-rango">
                <label>Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
                <label>Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
              </div>
            )}
          </section>

          {/* ---------- Cuadre del período ---------- */}
          <section className="caja-det-resumen">
            <div className="caja-det-kpi">
              <span>Saldo al inicio</span>
              <strong>{formatear(moneda.periodo.saldoInicial, dec)}</strong>
              <small>{moneda.monedaCodigo}</small>
            </div>
            <div className="caja-det-kpi caja-det-kpi-entra">
              <span><ArrowDownLeft size={13} /> Entradas</span>
              <strong>+{formatear(moneda.periodo.ingresos, dec)}</strong>
              <small>{moneda.monedaCodigo}</small>
            </div>
            <div className="caja-det-kpi caja-det-kpi-sale">
              <span><ArrowUpRight size={13} /> Salidas</span>
              <strong>−{formatear(moneda.periodo.egresos, dec)}</strong>
              <small>{moneda.monedaCodigo}</small>
            </div>
            <div className="caja-det-kpi caja-det-kpi-final">
              <span>Saldo final</span>
              <strong>{formatear(moneda.periodo.saldoFinal, dec)}</strong>
              <small className={moneda.periodo.cuadra ? "cuadra" : "descuadre"}>
                {moneda.periodo.cuadra ? <><CheckCircle2 size={12} /> Cuadra</> : <><TriangleAlert size={12} /> No cuadra</>} · {moneda.periodo.movimientos} movimientos
              </small>
            </div>
          </section>

          <p className="caja-det-nota">
            Saldo actual de {caja.nombre}: <strong>{formatear(moneda.saldoActual, dec)} {moneda.monedaCodigo}</strong>
            {moneda.turnoAbierto ? (
              <>
                {" "}· turno abierto desde {new Date(moneda.turnoAbiertoDesde!).toLocaleString("es-CO")} ·{" "}
                <Link to={`/cierre-caja?cajaId=${caja.id}&monedaId=${moneda.monedaId}`}><LockOpen size={13} className="icono-inline" /> cerrar turno</Link>
              </>
            ) : (
              " · turno cerrado"
            )}
          </p>

          {/* ---------- Movimientos ---------- */}
          <section className={`caja-det-movs${consultando ? " caja-det-consultando" : ""}`} aria-busy={consultando}>
            <div className="caja-det-movs-barra">
              <div className="cajas-chips cajas-chips-tipo">
                {([["", "Todos"], ["INGRESO", "Entradas"], ["EGRESO", "Salidas"]] as const).map(([valor, etiqueta]) => (
                  <button key={valor} className={tipo === valor ? "activo" : ""} onClick={() => setTipo(valor)}>{etiqueta}</button>
                ))}
              </div>
              <label className="cajas-buscar">
                <Search size={15} />
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente, referencia, usuario o #" />
                {busqueda && <button onClick={() => setBusqueda("")} aria-label="Limpiar"><X size={14} /></button>}
              </label>
              <button className="cajas-btn-secundario caja-det-exportar" onClick={() => exportarCsv(caja.nombre, moneda.monedaCodigo, movimientos)} disabled={movimientos.length === 0}>
                <Download size={15} /> Exportar
              </button>
            </div>

            {movimientos.length === 0 ? (
              <p className="caja-det-sin">No hay movimientos en {moneda.monedaCodigo} con estos filtros.</p>
            ) : (
              <div className="cajas-tabla-wrap">
                <table className="cajas-tabla caja-det-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th>Usuario</th>
                      <th className="num">Entrada</th>
                      <th className="num">Salida</th>
                      <th className="num">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => {
                      const c = concepto(m);
                      return (
                        <tr key={m.id} className={nuevos.has(m.id) ? "saldo-cambio" : ""}>
                          <td className="caja-det-fecha">
                            {new Date(m.created_at).toLocaleDateString("es-CO")}
                            <small>{new Date(m.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</small>
                          </td>
                          <td>
                            <span className={`caja-det-concepto caja-det-${c.clase}`}>{c.titulo}</span>
                            <small className="caja-det-detalle">
                              {[
                                m.transaccion_id ? `Operación #${m.transaccion_id}` : null,
                                m.referencia_codigo ? `Ref. ${m.referencia_codigo}` : null,
                                m.metodo_pago_nombre ? nombreLegible(m.metodo_pago_nombre) : null,
                                m.observacion,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </td>
                          <td>{m.usuario_nombre}</td>
                          <td className="num caja-det-entra">{m.tipo === "INGRESO" ? `+${formatear(m.monto, dec)}` : ""}</td>
                          <td className="num caja-det-sale">{m.tipo === "EGRESO" ? `−${formatear(m.monto, dec)}` : ""}</td>
                          <td className="num caja-det-saldo">{formatear(m.saldo_nuevo, dec)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {estado.hayMas && <p className="caja-det-sin">Se muestran los movimientos más recientes. Acotá el período para ver los anteriores.</p>}
          </section>
        </>
      )}
    </div>
  );
}
