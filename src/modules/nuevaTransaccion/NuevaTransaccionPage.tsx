import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleCheck,
  ClipboardList,
  Hourglass,
  UserPlus,
} from "lucide-react";
import { Header } from "../../components/common/Header";
import { buscarTerceros, obtenerTercero, type Tercero } from "../../api/terceros.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { getMetodosPago, type MetodoPago } from "../../api/metodosPago.api";
import { getCotizacionesDetalle, type CotizacionDetalle } from "../../api/tasas.api";
import { registrarCambioDivisa, type CalculoCambio, type ResultadoCambio } from "../../api/transacciones.api";
import { ApiError } from "../../api/client";
import { esDecimalValido, formatearMonto, normalizarDecimal } from "../../utils/montos";
import { nombreDivisa, ORDEN_OPERACIONES, textosOperacion, useCalculoCambio, type OperacionCambio } from "../../hooks/useCalculoCambio";
import { ErrorCambio } from "../../components/common/ErrorCambio";
import { Modal } from "../../components/common/Modal";
import { AvisoVerificacion } from "../documentosCliente/AvisoVerificacion";
import { SubirDocumentoForm } from "../documentosCliente/SubirDocumentoForm";
import { SoporteOperacion } from "../documentosCliente/SoporteOperacion";
import { SelectorCuentaCliente } from "../cuentasCliente/SelectorCuentaCliente";
import { ClienteRapidoForm } from "./ClienteRapidoForm";
import "./nuevaTransaccion.css";

const PASOS = [
  { n: 1, label: "Cliente" },
  { n: 2, label: "Operación" },
  { n: 3, label: "Tasa" },
  { n: 4, label: "Cajas y pago" },
  { n: 5, label: "Confirmar" },
];

export function NuevaTransaccionPage() {
  const [paso, setPaso] = useState(1);
  const [resultado, setResultado] = useState<ResultadoCambio | null>(null);

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

  // Paso 2: operación, divisa y el monto que trae el cliente
  const [operacion, setOperacion] = useState<OperacionCambio | null>(null);
  const [monedaExtranjeraId, setMonedaExtranjeraId] = useState<number | "">("");
  const [monto, setMonto] = useState("");

  // Paso 3: tasa
  const [cotizacionId, setCotizacionId] = useState<number | "">("");
  const [tasaManual, setTasaManual] = useState("");

  // Paso 4: cajas y pago
  const [cajaExtranjeraId, setCajaExtranjeraId] = useState<number | "">("");
  const [monedaLocalId, setMonedaLocalId] = useState<number | "">("");
  const [cajaLocalId, setCajaLocalId] = useState<number | "">("");
  const [metodoPagoId, setMetodoPagoId] = useState<number | "">("");
  const [referenciaCodigo, setReferenciaCodigo] = useState("");
  const [bancoOrigen, setBancoOrigen] = useState("");
  const [cuentaTerceroId, setCuentaTerceroId] = useState<number | "">("");

  // Documentos del cliente: subir desde el aviso sin salir del wizard
  const [subiendoDocumento, setSubiendoDocumento] = useState(false);
  const [versionDocumentos, setVersionDocumentos] = useState(0);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [errorGenerico, setErrorGenerico] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then((m) => {
      setMonedas(m);
      const cop = m.find((x) => x.codigo === "COP");
      if (cop) setMonedaLocalId(cop.id);
      const ves = m.find((x) => x.codigo === "VES");
      if (ves) setMonedaExtranjeraId(ves.id);
    });
    getCajas().then(setCajas);
    getMetodosPago().then(setMetodos);
    getCotizacionesDetalle().then(setCotizaciones);
  }, []);

  // Desde la ficha del cliente se llega con ?cliente=ID: se precarga y se salta al paso 2.
  const [searchParams] = useSearchParams();
  const clienteParam = Number(searchParams.get("cliente"));
  useEffect(() => {
    if (!Number.isInteger(clienteParam) || clienteParam <= 0) return;
    let vigente = true;
    obtenerTercero(clienteParam)
      .then((t) => { if (!vigente) return; setCliente(t); setPaso(2); })
      .catch(() => undefined); // si no existe, se busca a mano como siempre
    return () => { vigente = false; };
  }, [clienteParam]);

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

  const {
    divisa,
    tipo,
    clienteTraePesos,
    montoEnPesos,
    tipoCotizacion,
    tasasDisponibles,
    usaTasaManual,
    calculoInput,
    calculoVigente,
    calculando,
    errorCalculo,
  } = useCalculoCambio({
    operacion,
    monedas,
    monedaExtranjeraId,
    monedaLocalId,
    monto,
    cotizaciones,
    cotizacionId,
    tasaManual,
  });

  useEffect(() => {
    if (cajaExtranjeraId && !cajaLocalId) setCajaLocalId(cajaExtranjeraId);
  }, [cajaExtranjeraId, cajaLocalId]);

  // Se le paga al cliente desde la caja de lo que él recibe: pesos en COMPRA_DIVISA, la divisa en VENTA_DIVISA.
  // Si esa caja es un banco, es una transferencia y corresponde elegir la cuenta del cliente.
  const cajaPagoId = tipo === "COMPRA_DIVISA" ? cajaLocalId : cajaExtranjeraId;
  const pagoPorTransferencia = cliente != null && cajas.find((c) => c.id === cajaPagoId)?.tipo === "BANCO";
  const monedaPagoId = tipo === "COMPRA_DIVISA" ? monedaLocalId : monedaExtranjeraId;
  const monedaPagoCodigo = monedas.find((m) => m.id === monedaPagoId)?.codigo;

  const nombreCaja = (id: number | "") => cajas.find((c) => c.id === id)?.nombre ?? null;
  const nombreMetodo = (id: number | "") => metodos.find((m) => m.id === id)?.nombre ?? null;

  function elegirOperacion(op: OperacionCambio) {
    if (op === operacion) return;
    // Cambia qué monto se escribe y el tipo de tasa: lo anterior ya no aplica.
    setOperacion(op);
    setMonto("");
    setCotizacionId("");
  }

  function elegirDivisa(id: number) {
    setMonedaExtranjeraId(id);
    setCotizacionId("");
  }

  function puedeAvanzar(): boolean {
    if (paso === 1) return cliente != null;
    if (paso === 2) return operacion != null && !!monedaExtranjeraId && esDecimalValido(monto);
    if (paso === 3) return calculoVigente != null;
    if (paso === 4) return !!cajaExtranjeraId && !!monedaLocalId && !!cajaLocalId;
    return true;
  }

  async function confirmar() {
    if (!calculoInput || !calculoVigente || !cajaExtranjeraId || !cajaLocalId) return;
    setError(null);
    setErrorGenerico(null);
    setEnviando(true);
    try {
      const res = await registrarCambioDivisa({
        ...calculoInput,
        cajaExtranjeraId,
        cajaLocalId,
        terceroId: cliente?.id,
        cuentaTerceroId: pagoPorTransferencia && cuentaTerceroId ? cuentaTerceroId : undefined,
        metodoPagoId: metodoPagoId || undefined,
        referenciaCodigo: referenciaCodigo.trim() || undefined,
        bancoOrigen: bancoOrigen.trim() || undefined,
      });
      setResultado(res);
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setErrorGenerico("No se pudo registrar la operación.");
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
    setOperacion(null);
    setMonto("");
    setCotizacionId("");
    setTasaManual("");
    setCajaExtranjeraId("");
    setCajaLocalId("");
    setMetodoPagoId("");
    setReferenciaCodigo("");
    setBancoOrigen("");
    setCuentaTerceroId("");
    setSubiendoDocumento(false);
    setError(null);
    setErrorGenerico(null);
  }

  // Qué entrega y qué recibe el cliente, tal como lo devolvió el backend.
  const entregaCliente = calculoVigente
    ? clienteTraePesos ? `$${formatearMonto(calculoVigente.montoLocal)} COP` : `${formatearMonto(calculoVigente.cantidadExtranjera)} ${divisa}`
    : null;
  const recibeCliente = calculoVigente
    ? clienteTraePesos ? `${formatearMonto(calculoVigente.cantidadExtranjera)} ${divisa}` : `$${formatearMonto(calculoVigente.montoLocal)} COP`
    : null;

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
              {cliente && (
                <AvisoVerificacion
                  terceroId={cliente.id}
                  recargar={versionDocumentos}
                  onSubirDocumento={() => setSubiendoDocumento(true)}
                />
              )}
              {cliente && subiendoDocumento && (
                <Modal titulo={`Documento de ${cliente.nombre}`} onCerrar={() => setSubiendoDocumento(false)}>
                  <SubirDocumentoForm
                    terceroId={cliente.id}
                    tipoInicial="CEDULA"
                    onSubido={() => { setSubiendoDocumento(false); setVersionDocumentos((v) => v + 1); }}
                    onCancelar={() => setSubiendoDocumento(false)}
                  />
                </Modal>
              )}
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
                  <p className="nt-form-panel-sub">Elegí la divisa, si compramos o vendemos, y cuánto trae el cliente.</p>

                  <span className="nt-billetes-label">Divisa</span>
                  <div className="nt-billetes-chips">
                    {monedas.filter((m) => m.codigo !== "COP").map((m) => (
                      <button key={m.id} className={monedaExtranjeraId === m.id ? "activo" : ""} onClick={() => elegirDivisa(m.id)}>
                        {nombreDivisa(m.codigo)}
                      </button>
                    ))}
                  </div>

                  <div className="nt-direccion-cards nt-direccion-cards-cuatro">
                    {ORDEN_OPERACIONES.map((op) => {
                      const t = textosOperacion(op, divisa);
                      return (
                        <div key={op} className={`nt-direccion-card ${operacion === op ? "activa" : ""}`} onClick={() => elegirOperacion(op)}>
                          <div className="nt-direccion-icono">{t.esCompra ? <ArrowDownToLine size={28} /> : <ArrowUpFromLine size={28} />}</div>
                          <div className="nt-direccion-titulo">{t.titulo}</div>
                          <div className="nt-direccion-sub">{t.flujo}</div>
                        </div>
                      );
                    })}
                  </div>

                  {operacion && (
                    <label className="nt-campo" style={{ marginTop: 20 }}>
                      {textosOperacion(operacion, divisa).etiquetaMonto}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={monto}
                        onChange={(e) => setMonto(normalizarDecimal(e.target.value))}
                        placeholder={montoEnPesos ? "ej. 300000" : "ej. 1500.50"}
                        autoFocus
                      />
                      {esDecimalValido(monto) && (
                        <span className="nt-campo-lectura">
                          Se registra como: <strong>{montoEnPesos ? `$${formatearMonto(monto)} COP` : `${formatearMonto(monto)} ${divisa}`}</strong>
                        </span>
                      )}
                      <span className="nt-campo-ayuda">
                        Sin puntos de miles; la coma o el punto solo para decimales.{" "}
                        {textosOperacion(operacion, divisa).ayudaMonto}
                      </span>
                    </label>
                  )}
                </>
              )}

              {paso === 3 && (
                <>
                  <h2>¿A qué tasa?</h2>
                  <p className="nt-form-panel-sub">
                    Tasa de {tipoCotizacion.toLowerCase()} de hoy para {divisa}. El resultado lo calcula el sistema.
                  </p>
                  {usaTasaManual ? (
                    <>
                      <div className="nt-billetes-vacio">
                        No hay tasa de {tipoCotizacion.toLowerCase()} cargada hoy para {divisa} — ingresá una tasa manual.
                      </div>
                      <label className="nt-campo">
                        Tasa manual
                        <input
                          type="text"
                          inputMode="decimal"
                          value={tasaManual}
                          onChange={(e) => setTasaManual(normalizarDecimal(e.target.value))}
                          placeholder="ej. 3.2"
                          autoFocus
                        />
                      </label>
                    </>
                  ) : (
                    <div className="nt-billetes-chips">
                      {tasasDisponibles.map((b) => (
                        <button key={b.id} className={cotizacionId === b.id ? "activo" : ""} onClick={() => setCotizacionId(b.id)}>
                          {b.etiqueta}
                          {b.categoria === "GIRO" ? " (giro)" : ""}: {b.valor != null ? formatearMonto(b.valor) : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  {calculando && <p className="nt-calculo-estado">Calculando…</p>}
                  {errorCalculo && !calculando && <p className="nt-error">{errorCalculo}</p>}
                  {calculoVigente && !calculando && (
                    <div className="nt-calculo">
                      <div className="nt-calculo-fila">
                        <span>El cliente entrega</span>
                        <strong>{entregaCliente}</strong>
                      </div>
                      <div className="nt-calculo-fila">
                        <span>Tasa aplicada</span>
                        <strong>{formatearMonto(calculoVigente.tasa)}</strong>
                      </div>
                      <div className="nt-calculo-fila nt-calculo-destacado">
                        <span>Le entregamos</span>
                        <strong>{recibeCliente}</strong>
                      </div>
                    </div>
                  )}
                </>
              )}

              {paso === 4 && (
                <>
                  <h2>¿Dónde se mueve el dinero?</h2>
                  <p className="nt-form-panel-sub">Caja de {divisa}, caja de los pesos, y cómo se paga.</p>
                  <div className="nt-fila-dos">
                    <label className="nt-campo">
                      Caja de {divisa}
                      <select value={cajaExtranjeraId} onChange={(e) => setCajaExtranjeraId(e.target.value ? Number(e.target.value) : "")}>
                        <option value="">Seleccionar…</option>
                        {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </label>
                    <label className="nt-campo">
                      {tipo === "COMPRA_DIVISA" ? "Pagamos los pesos por" : "Cobramos los pesos por"}
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
                  <label className="nt-campo">
                    Banco de origen (si aplica)
                    <input type="text" value={bancoOrigen} onChange={(e) => setBancoOrigen(e.target.value)} placeholder="ej. Bancolombia" />
                  </label>
                  {pagoPorTransferencia && cliente && (
                    <div className="nt-campo">
                      Cuenta del cliente (a dónde se le transfiere)
                      <SelectorCuentaCliente
                        terceroId={cliente.id}
                        titularSugerido={cliente.nombre}
                        monedaCodigo={monedaPagoCodigo}
                        monedaId={monedaPagoId || undefined}
                        value={cuentaTerceroId}
                        onChange={setCuentaTerceroId}
                      />
                    </div>
                  )}
                </>
              )}

              {paso === 5 && (
                <>
                  <h2>Confirmá la operación</h2>
                  <p className="nt-form-panel-sub">Revisá el resumen a la derecha. Si todo está bien, registrala.</p>
                  {error && <ErrorCambio error={error} />}
                  {errorGenerico && <p className="nt-error">{errorGenerico}</p>}
                  <button className="nt-btn-confirmar" onClick={confirmar} disabled={enviando || !calculoVigente}>
                    {enviando ? "Registrando…" : <><CircleCheck size={18} /> Registrar</>}
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

                <FilaResumen label="Cliente" valor={cliente?.nombre} />
                <FilaResumen
                  label="Operación"
                  valor={operacion ? textosOperacion(operacion, divisa).titulo : null}
                />
                <FilaResumen label="Tasa aplicada" valor={calculoVigente ? formatearMonto(calculoVigente.tasa) : null} />
                <FilaResumen label="El cliente entrega" valor={entregaCliente} />
                <FilaResumen label="Caja divisa" valor={nombreCaja(cajaExtranjeraId)} />
                <FilaResumen label="Caja pesos" valor={nombreCaja(cajaLocalId)} />
                <FilaResumen label="Método de pago" valor={nombreMetodo(metodoPagoId)} vacio="—" />
                {pagoPorTransferencia && (
                  <FilaResumen label="Cuenta del cliente" valor={cuentaTerceroId ? "Elegida" : null} vacio="sin elegir" />
                )}

                <div className="nt-resumen-total">
                  <span className="nt-resumen-total-label">Le entregamos</span>
                  <span className="nt-resumen-total-valor">{recibeCliente ?? "—"}</span>
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
              <div className="nt-exito-icono">
                {resultado.requiereConfirmacion ? <Hourglass size={56} /> : <CircleCheck size={56} />}
              </div>
              <h2>{resultado.requiereConfirmacion ? "Pendiente de confirmación" : "Operación completada"}</h2>
              {resultado.requiereConfirmacion ? (
                <p>
                  Una de las cajas es un banco, así que la operación quedó <strong>pendiente</strong>. La tiene que confirmar
                  otro usuario en <Link to="/solicitudes">Solicitudes por Confirmar</Link>.
                </p>
              ) : (
                <p>La operación se aplicó al instante.</p>
              )}
              <ResumenCalculo calculo={resultado.calculo} divisa={divisa} clienteTraePesos={clienteTraePesos} />
              {cliente && (
                <div className="nt-exito-soporte">
                  <SoporteOperacion terceroId={cliente.id} transaccionId={resultado.transaccion.id} />
                </div>
              )}
              <button onClick={nuevaOperacion}>+ Registrar otra operación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilaResumen({ label, valor, vacio = "sin elegir" }: { label: string; valor: string | null | undefined; vacio?: string }) {
  return (
    <div className="nt-resumen-fila">
      <span className="nt-resumen-fila-label">{label}</span>
      <span className={`nt-resumen-fila-valor ${!valor ? "nt-resumen-fila-vacio" : ""}`}>{valor || vacio}</span>
    </div>
  );
}

function ResumenCalculo({ calculo, divisa, clienteTraePesos }: { calculo: CalculoCambio; divisa: string; clienteTraePesos: boolean }) {
  const pesos = `$${formatearMonto(calculo.montoLocal)} COP`;
  const extranjera = `${formatearMonto(calculo.cantidadExtranjera)} ${divisa}`;
  return (
    <div className="nt-calculo nt-calculo-exito">
      <div className="nt-calculo-fila">
        <span>El cliente entregó</span>
        <strong>{clienteTraePesos ? pesos : extranjera}</strong>
      </div>
      <div className="nt-calculo-fila">
        <span>Tasa</span>
        <strong>{formatearMonto(calculo.tasa)}</strong>
      </div>
      <div className="nt-calculo-fila nt-calculo-destacado">
        <span>Le entregamos</span>
        <strong>{clienteTraePesos ? extranjera : pesos}</strong>
      </div>
    </div>
  );
}
