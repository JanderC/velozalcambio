import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, CircleCheck, ClipboardList, Hourglass, UserPlus } from "lucide-react";
import { Header } from "../../components/common/Header";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { getMetodosPago, type MetodoPago } from "../../api/metodosPago.api";
import { getCotizacionesDetalle, type CotizacionDetalle } from "../../api/tasas.api";
import { registrarCambioDivisa } from "../../api/transacciones.api";
import { ApiError } from "../../api/client";
import { ClienteRapidoForm } from "./ClienteRapidoForm";
import "./nuevaTransaccion.css";

type Direccion = "COMPRA_DIVISA" | "VENTA_DIVISA";

const PASOS = [
  { n: 1, label: "Cliente" },
  { n: 2, label: "Operación" },
  { n: 3, label: "Tasa" },
  { n: 4, label: "Cajas y pago" },
  { n: 5, label: "Confirmar" },
];

export function NuevaTransaccionPage() {
  const [paso, setPaso] = useState(1);
  const [resultado, setResultado] = useState<{ requiereConfirmacion: boolean; montoLocal: string } | null>(null);

  // Datos de catálogo
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionDetalle[]>([]);

  // Paso 1: cliente
  const [busqueda, setBusqueda] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState<Tercero[]>([]);
  const [cliente, setCliente] = useState<Tercero | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [busquedaResuelta, setBusquedaResuelta] = useState("");
  const [creandoCliente, setCreandoCliente] = useState(false);

  // Paso 2: dirección, divisa, monto
  const [direccion, setDireccion] = useState<Direccion | null>(null);
  const [monedaExtranjeraId, setMonedaExtranjeraId] = useState<number | "">("");
  const [cantidad, setCantidad] = useState("");

  // Paso 3: tasa
  const [cotizacionId, setCotizacionId] = useState<number | "">("");
  const [tasaManual, setTasaManual] = useState("");

  // Paso 4: cajas y pago
  const [cajaExtranjeraId, setCajaExtranjeraId] = useState<number | "">("");
  const [monedaLocalId, setMonedaLocalId] = useState<number | "">("");
  const [cajaLocalId, setCajaLocalId] = useState<number | "">("");
  const [metodoPagoId, setMetodoPagoId] = useState<number | "">("");
  const [referenciaCodigo, setReferenciaCodigo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then((m) => {
      setMonedas(m);
      const cop = m.find((x) => x.codigo === "COP");
      if (cop) setMonedaLocalId(cop.id);
    });
    getCajas().then(setCajas);
    getMetodosPago().then(setMetodos);
    getCotizacionesDetalle().then(setCotizaciones);
  }, []);

  useEffect(() => {
    const termino = busqueda.trim();
    if (termino.length < 2) { setResultadosCliente([]); setBusquedaResuelta(""); return; }
    let vigente = true;
    setBuscandoCliente(true);
    const t = setTimeout(() => {
      buscarTerceros(termino)
        .then((r) => { if (vigente) setResultadosCliente(r); })
        .catch(() => { if (vigente) setResultadosCliente([]); })
        .finally(() => {
          if (!vigente) return;
          setBuscandoCliente(false);
          setBusquedaResuelta(termino);
        });
    }, 300);
    return () => { vigente = false; clearTimeout(t); };
  }, [busqueda]);

  function clienteCreado(nuevo: Tercero) {
    setCliente(nuevo);
    setCreandoCliente(false);
    setResultadosCliente([]);
    setPaso(2);
  }

  const busquedaSinResultados =
    !buscandoCliente && busquedaResuelta !== "" && busquedaResuelta === busqueda.trim() && resultadosCliente.length === 0;

  const monedaExtranjeraCodigo = monedas.find((m) => m.id === monedaExtranjeraId)?.codigo;
  const tipoCotizacion = direccion === "COMPRA_DIVISA" ? "COMPRA" : "VENTA";

  const billetesDisponibles = useMemo(() => {
    if (!monedaExtranjeraCodigo || !direccion) return [];
    return cotizaciones.filter(
      (c) => c.moneda_codigo === monedaExtranjeraCodigo && c.tipo === tipoCotizacion && c.categoria === "EFECTIVO" && c.valor != null
    );
  }, [cotizaciones, monedaExtranjeraCodigo, direccion, tipoCotizacion]);

  const tasaAplicada = useMemo(() => {
    if (cotizacionId) return Number(billetesDisponibles.find((b) => b.id === cotizacionId)?.valor ?? 0) || null;
    return tasaManual ? Number(tasaManual) : null;
  }, [cotizacionId, tasaManual, billetesDisponibles]);

  const totalCOP = tasaAplicada && cantidad ? Number(cantidad) * tasaAplicada : null;

  useEffect(() => {
    if (cajaExtranjeraId && !cajaLocalId) setCajaLocalId(cajaExtranjeraId);
  }, [cajaExtranjeraId, cajaLocalId]);

  const nombreCaja = (id: number | "") => cajas.find((c) => c.id === id)?.nombre ?? null;
  const nombreMetodo = (id: number | "") => metodos.find((m) => m.id === id)?.nombre ?? null;

  function puedeAvanzar(): boolean {
    if (paso === 1) return cliente != null;
    if (paso === 2) return direccion != null && !!monedaExtranjeraId && !!cantidad;
    if (paso === 3) return tasaAplicada != null;
    if (paso === 4) return !!cajaExtranjeraId && !!monedaLocalId && !!cajaLocalId;
    return true;
  }

  async function confirmar() {
    if (!cliente || !direccion || !monedaExtranjeraId || !monedaLocalId || !cajaExtranjeraId || !cajaLocalId) return;
    setError(null);
    setEnviando(true);
    try {
      const res = await registrarCambioDivisa({
        tipo: direccion,
        terceroId: cliente.id,
        monedaExtranjeraId: Number(monedaExtranjeraId),
        cantidadExtranjera: cantidad,
        cotizacionDetalleId: cotizacionId || undefined,
        tasaManual: !cotizacionId ? tasaManual : undefined,
        cajaExtranjeraId: Number(cajaExtranjeraId),
        monedaLocalId: Number(monedaLocalId),
        cajaLocalId: Number(cajaLocalId),
        metodoPagoId: metodoPagoId || undefined,
        referenciaCodigo: referenciaCodigo || undefined,
      });
      setResultado(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la operación.");
    } finally {
      setEnviando(false);
    }
  }

  function nuevaOperacion() {
    setPaso(1);
    setResultado(null);
    setCliente(null);
    setBusqueda("");
    setCreandoCliente(false);
    setDireccion(null);
    setMonedaExtranjeraId("");
    setCantidad("");
    setCotizacionId("");
    setTasaManual("");
    setCajaExtranjeraId("");
    setCajaLocalId("");
    setMetodoPagoId("");
    setReferenciaCodigo("");
    setError(null);
  }

  return (
    <div className="nt-page">
      <Header />
      <div className="nt-header">
        <h1>Nueva Transacción</h1>
        <p>Registrá un cambio de divisas paso a paso.</p>
      </div>

      {!resultado && (
        <>
          <div className="nt-stepper">
            {PASOS.map((p, i) => (
              <div key={p.n} style={{ display: "flex", alignItems: "center", flex: i < PASOS.length - 1 ? 1 : undefined }}>
                <div className={`nt-step ${paso === p.n ? "activo" : ""} ${paso > p.n ? "completo" : ""}`}>
                  <div className="nt-step-circle">{paso > p.n ? <Check size={16} strokeWidth={3} /> : p.n}</div>
                  <span className="nt-step-label">{p.label}</span>
                </div>
                {i < PASOS.length - 1 && <div className={`nt-step-linea ${paso > p.n ? "completa" : ""}`} />}
              </div>
            ))}
          </div>

          <div className="nt-layout">
            <div className="nt-form-panel">
              {paso === 1 && (
                <>
                  <h2>¿Quién es el cliente?</h2>
                  <p className="nt-form-panel-sub">Buscalo por nombre o identificación. Si no existe, lo creás acá mismo.</p>
                  {cliente ? (
                    <div className="nt-cliente-seleccionado">
                      <span><strong>{cliente.nombre}</strong> — {cliente.identificacion ?? "sin identificación"}</span>
                      <button onClick={() => setCliente(null)}>Cambiar</button>
                    </div>
                  ) : creandoCliente ? (
                    <ClienteRapidoForm
                      textoBuscado={busqueda}
                      onCreado={clienteCreado}
                      onCancelar={() => setCreandoCliente(false)}
                    />
                  ) : (
                    <div className="nt-cliente-buscador">
                      <input placeholder="Nombre o identificación..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
                      {buscandoCliente && <p className="nt-cliente-hint">Buscando…</p>}
                      {resultadosCliente.length > 0 && (
                        <ul className="nt-cliente-lista">
                          {resultadosCliente.map((t) => (
                            <li key={t.id} onClick={() => { setCliente(t); setResultadosCliente([]); setPaso(2); }}>
                              <span>{t.nombre}</span>
                              <span style={{ color: "#9ca3af" }}>{t.identificacion ?? ""}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {busquedaSinResultados && (
                        <div className="nt-cliente-vacio">
                          <span>No encontramos a "{busqueda.trim()}".</span>
                          <button className="nt-cliente-nuevo-btn" onClick={() => setCreandoCliente(true)}>
                            <UserPlus size={16} /> Crear cliente nuevo
                          </button>
                        </div>
                      )}
                      {!busquedaSinResultados && (
                        <button className="nt-cliente-nuevo-link" onClick={() => setCreandoCliente(true)}>
                          <UserPlus size={14} /> ¿No está? Crear cliente nuevo
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {paso === 2 && (
                <>
                  <h2>¿Qué operación es?</h2>
                  <p className="nt-form-panel-sub">Elegí la dirección, la divisa y la cantidad.</p>
                  <div className="nt-direccion-cards">
                    <div className={`nt-direccion-card ${direccion === "COMPRA_DIVISA" ? "activa" : ""}`} onClick={() => setDireccion("COMPRA_DIVISA")}>
                      <div className="nt-direccion-icono"><ArrowDownToLine size={34} /></div>
                      <div className="nt-direccion-titulo">Le compramos</div>
                      <div className="nt-direccion-sub">El cliente entrega divisa</div>
                    </div>
                    <div className={`nt-direccion-card ${direccion === "VENTA_DIVISA" ? "activa" : ""}`} onClick={() => setDireccion("VENTA_DIVISA")}>
                      <div className="nt-direccion-icono"><ArrowUpFromLine size={34} /></div>
                      <div className="nt-direccion-titulo">Le vendemos</div>
                      <div className="nt-direccion-sub">El cliente entrega pesos</div>
                    </div>
                  </div>

                  {direccion && (
                    <div className="nt-fila-dos" style={{ marginTop: 20 }}>
                      <label className="nt-campo">
                        Divisa
                        <select value={monedaExtranjeraId} onChange={(e) => { setMonedaExtranjeraId(e.target.value ? Number(e.target.value) : ""); setCotizacionId(""); }}>
                          <option value="">Seleccionar…</option>
                          {monedas.filter((m) => m.codigo !== "COP").map((m) => (
                            <option key={m.id} value={m.id}>{m.codigo}</option>
                          ))}
                        </select>
                      </label>
                      <label className="nt-campo">
                        Cantidad
                        <input type="text" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0.00" />
                      </label>
                    </div>
                  )}
                </>
              )}

              {paso === 3 && (
                <>
                  <h2>¿A qué tasa?</h2>
                  <p className="nt-form-panel-sub">Elegí el billete según nuestra Tasa del Día, o ingresá una manual.</p>
                  <span className="nt-billetes-label">Nuestra tasa de {tipoCotizacion.toLowerCase()} hoy para {monedaExtranjeraCodigo}:</span>
                  {billetesDisponibles.length === 0 ? (
                    <div className="nt-billetes-vacio">No hay cotización cargada hoy para esta divisa — usá la tasa manual abajo.</div>
                  ) : (
                    <div className="nt-billetes-chips">
                      {billetesDisponibles.map((b) => (
                        <button key={b.id} className={cotizacionId === b.id ? "activo" : ""} onClick={() => { setCotizacionId(b.id); setTasaManual(""); }}>
                          {b.etiqueta}: ${Number(b.valor).toLocaleString("es-CO")}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="nt-campo">
                    Tasa manual (opcional)
                    <input type="text" inputMode="decimal" value={tasaManual} onChange={(e) => { setTasaManual(e.target.value); setCotizacionId(""); }} placeholder="ej. 3270" />
                  </label>

                  {totalCOP != null && (
                    <div className="nt-total-preview">
                      Total: <strong>${totalCOP.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP</strong>
                    </div>
                  )}
                </>
              )}

              {paso === 4 && (
                <>
                  <h2>¿Dónde se mueve el dinero?</h2>
                  <p className="nt-form-panel-sub">Caja de la divisa, caja de los pesos, y cómo se paga.</p>
                  <div className="nt-fila-dos">
                    <label className="nt-campo">
                      Caja de la divisa
                      <select value={cajaExtranjeraId} onChange={(e) => setCajaExtranjeraId(e.target.value ? Number(e.target.value) : "")}>
                        <option value="">Seleccionar…</option>
                        {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </label>
                    <label className="nt-campo">
                      {direccion === "COMPRA_DIVISA" ? "Pagamos por" : "Cobramos por"}
                      <select value={cajaLocalId} onChange={(e) => setCajaLocalId(e.target.value ? Number(e.target.value) : "")}>
                        <option value="">Seleccionar…</option>
                        {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="nt-fila-dos">
                    <label className="nt-campo">
                      Método de pago
                      <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value ? Number(e.target.value) : "")}>
                        <option value="">Seleccionar…</option>
                        {metodos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    </label>
                    <label className="nt-campo">
                      Referencia (si aplica)
                      <input type="text" value={referenciaCodigo} onChange={(e) => setReferenciaCodigo(e.target.value)} />
                    </label>
                  </div>
                </>
              )}

              {paso === 5 && (
                <>
                  <h2>Confirmá la operación</h2>
                  <p className="nt-form-panel-sub">Revisá el resumen a la derecha. Si todo está bien, confirmá.</p>
                  {error && <p className="nt-error">{error}</p>}
                  <button className="nt-btn-confirmar" onClick={confirmar} disabled={enviando}>
                    {enviando ? "Registrando…" : <><CircleCheck size={18} /> Confirmar y registrar</>}
                  </button>
                </>
              )}

              {paso < 5 && (
                <div className="nt-nav">
                  <button className="nt-btn-volver" onClick={() => setPaso((p) => Math.max(1, p - 1))} disabled={paso === 1}>
                    ← Atrás
                  </button>
                  <button className="nt-btn-siguiente" onClick={() => setPaso((p) => p + 1)} disabled={!puedeAvanzar()}>
                    Siguiente →
                  </button>
                </div>
              )}
              {paso === 5 && (
                <div className="nt-nav">
                  <button className="nt-btn-volver" onClick={() => setPaso(4)}>← Atrás</button>
                </div>
              )}
            </div>

            <div className="nt-resumen">
              <div className="nt-resumen-card">
                <div className="nt-resumen-titulo"><ClipboardList size={16} /> Resumen de la operación</div>

                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Cliente</span>
                  <span className={`nt-resumen-fila-valor ${!cliente ? "nt-resumen-fila-vacio" : ""}`}>{cliente?.nombre ?? "sin elegir"}</span>
                </div>
                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Operación</span>
                  <span className={`nt-resumen-fila-valor ${!direccion ? "nt-resumen-fila-vacio" : ""}`}>
                    {direccion === "COMPRA_DIVISA" ? "Le compramos" : direccion === "VENTA_DIVISA" ? "Le vendemos" : "sin elegir"}
                  </span>
                </div>
                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Divisa / Cantidad</span>
                  <span className={`nt-resumen-fila-valor ${!monedaExtranjeraId ? "nt-resumen-fila-vacio" : ""}`}>
                    {monedaExtranjeraId ? `${cantidad || "0"} ${monedaExtranjeraCodigo}` : "sin elegir"}
                  </span>
                </div>
                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Tasa aplicada</span>
                  <span className={`nt-resumen-fila-valor ${!tasaAplicada ? "nt-resumen-fila-vacio" : ""}`}>
                    {tasaAplicada ? `$${tasaAplicada.toLocaleString("es-CO")}` : "sin elegir"}
                  </span>
                </div>
                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Caja divisa</span>
                  <span className={`nt-resumen-fila-valor ${!cajaExtranjeraId ? "nt-resumen-fila-vacio" : ""}`}>{nombreCaja(cajaExtranjeraId) ?? "sin elegir"}</span>
                </div>
                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Caja pesos</span>
                  <span className={`nt-resumen-fila-valor ${!cajaLocalId ? "nt-resumen-fila-vacio" : ""}`}>{nombreCaja(cajaLocalId) ?? "sin elegir"}</span>
                </div>
                <div className="nt-resumen-fila">
                  <span className="nt-resumen-fila-label">Método de pago</span>
                  <span className={`nt-resumen-fila-valor ${!metodoPagoId ? "nt-resumen-fila-vacio" : ""}`}>{nombreMetodo(metodoPagoId) ?? "—"}</span>
                </div>

                <div className="nt-resumen-total">
                  <span className="nt-resumen-total-label">Total COP</span>
                  <span className="nt-resumen-total-valor">{totalCOP != null ? `$${totalCOP.toLocaleString("es-CO", { maximumFractionDigits: 0 })}` : "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {resultado && (
        <div className="nt-layout">
          <div className="nt-form-panel" style={{ flex: 1 }}>
            <div className="nt-exito">
              <div className="nt-exito-icono">{resultado.requiereConfirmacion ? <Hourglass size={56} /> : <CircleCheck size={56} />}</div>
              <h2>{resultado.requiereConfirmacion ? "Solicitud registrada" : "Operación confirmada"}</h2>
              <p>
                {resultado.requiereConfirmacion
                  ? `Por $${Number(resultado.montoLocal).toLocaleString("es-CO")} COP — queda pendiente de confirmación en la bandeja de Solicitudes.`
                  : `Por $${Number(resultado.montoLocal).toLocaleString("es-CO")} COP, aplicada al instante.`}
              </p>
              <button onClick={nuevaOperacion}>+ Registrar otra operación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}