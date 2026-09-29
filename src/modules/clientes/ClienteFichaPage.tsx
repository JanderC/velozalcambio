import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ChevronLeft,
  CreditCard,
  FileText,
  Inbox,
  Landmark,
  Pencil,
  Scale,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Header } from "../../components/common/Header";
import { Modal } from "../../components/common/Modal";
import {
  actualizarTercero,
  obtenerResumenTercero,
  type ResumenTercero,
  type Tercero,
  type TipoTercero,
} from "../../api/terceros.api";
import { getVerificacionTercero, type VerificacionTercero } from "../../api/documentosTercero.api";
import { getCuentasTercero, ETIQUETA_TIPO_CUENTA, type CuentaTercero } from "../../api/cuentasTercero.api";
import { cambiarEstadoCuentaCorriente } from "../../api/cuentasCorrientes.api";
import { getSolicitudesPorCliente, type Solicitud } from "../../api/transacciones.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import type { Rol } from "../../types/auth.types";
import { formatearMonto } from "../../utils/montos";
import { DocumentosCliente } from "../documentosCliente/DocumentosCliente";
import { EstadoVerificacionBadge } from "../documentosCliente/EstadoVerificacionBadge";
import { RegistrarOperacionForm } from "../caja/RegistrarOperacionForm";
import "./clientes.css";

const ROLES_EDITAR: Rol[] = ["ADMIN", "ASESOR"];
const ROLES_OPERAR: Rol[] = ["ADMIN", "ASESOR", "CAJERO"];

const SECCIONES = [
  { id: "documentos", label: "Documentos", Icono: ShieldCheck },
  { id: "pagos", label: "Cuentas de pago", Icono: Landmark },
  { id: "cuentas", label: "Cuentas corrientes", Icono: CreditCard },
  { id: "deudas", label: "Por cobrar / pagar", Icono: Scale },
  { id: "solicitudes", label: "Solicitudes", Icono: Inbox },
  { id: "operar", label: "Operar", Icono: ArrowLeftRight },
] as const;

type SeccionId = (typeof SECCIONES)[number]["id"];

function esSeccion(valor: string | null): valor is SeccionId {
  return SECCIONES.some((s) => s.id === valor);
}

const TIPO_TERCERO_LABEL: Record<TipoTercero, string> = { CLIENTE: "Cliente", PROVEEDOR: "Proveedor", MIXTO: "Mixto" };

export function ClienteFichaPage() {
  const { id } = useParams();
  const terceroId = Number(id);
  const idValido = Number.isInteger(terceroId) && terceroId > 0;
  const { usuario } = useAuth();
  const puedeEditar = usuario != null && ROLES_EDITAR.includes(usuario.rol);
  const puedeOperar = usuario != null && ROLES_OPERAR.includes(usuario.rol);

  const [searchParams, setSearchParams] = useSearchParams();
  const seccionParam = searchParams.get("seccion");
  const seccion: SeccionId = esSeccion(seccionParam) ? seccionParam : "documentos";

  const [resumen, setResumen] = useState<ResumenTercero | null>(null);
  const [verificacion, setVerificacion] = useState<VerificacionTercero | null>(null);
  const [cuentasPago, setCuentasPago] = useState<CuentaTercero[] | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [editando, setEditando] = useState(false);
  // Sube cuando cambian los documentos o se registra una operación, para refrescar lo que depende de eso
  const [version, setVersion] = useState(0);
  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    setResumen(null);
    setVerificacion(null);
    setCuentasPago(null);
    setSolicitudes(null);
    setNoEncontrado(false);
    setEditando(false);
  }, [terceroId]);

  useEffect(() => {
    if (!idValido) return;
    let vigente = true;
    setError(null);
    obtenerResumenTercero(terceroId)
      .then((r) => { if (vigente) setResumen(r); })
      .catch((err) => {
        if (!vigente) return;
        if (err instanceof ApiError && err.status === 404) setNoEncontrado(true);
        else setError(err instanceof ApiError ? err.message : "No se pudo cargar el cliente.");
      });
    getVerificacionTercero(terceroId).then((v) => { if (vigente) setVerificacion(v); }).catch(() => undefined);
    getCuentasTercero(terceroId, true).then((c) => { if (vigente) setCuentasPago(c); }).catch(() => { if (vigente) setCuentasPago([]); });
    getSolicitudesPorCliente(terceroId).then((s) => { if (vigente) setSolicitudes(s); }).catch(() => { if (vigente) setSolicitudes([]); });
    return () => { vigente = false; };
  }, [terceroId, idValido, version]);

  function irA(s: SeccionId) {
    setSearchParams({ seccion: s }, { replace: true });
  }

  async function cambiarEstadoCuenta(cuentaId: number, estado: "DISPONIBLE" | "BLOQUEADA" | "CERRADA") {
    try {
      await cambiarEstadoCuentaCorriente(cuentaId, estado);
      refrescar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado de la cuenta.");
    }
  }

  if (!idValido || noEncontrado) {
    return (
      <div className="ficha-page">
        <Header />
        <div className="ficha-vacia">
          <h1>Cliente no encontrado</h1>
          <p>El cliente que buscás no existe o el enlace está mal escrito.</p>
          <Link to="/clientes" className="ficha-btn-secundario"><ChevronLeft size={16} /> Volver a Clientes</Link>
        </div>
      </div>
    );
  }

  const tercero = resumen?.tercero;
  const todasCuentas = resumen ? [...resumen.cuentas.disponibles, ...resumen.cuentas.bloqueadas, ...resumen.cuentas.cerradas] : [];
  const cuentasPagoActivas = cuentasPago?.filter((c) => c.activo) ?? [];
  const conteo: Record<SeccionId, number | null> = {
    documentos: verificacion ? verificacion.aprobados + verificacion.pendientes + verificacion.rechazados : null,
    pagos: cuentasPago ? cuentasPagoActivas.length : null,
    cuentas: resumen ? todasCuentas.length : null,
    deudas: resumen ? resumen.cuentasPorCobrar.length + resumen.cuentasPorPagar.length : null,
    solicitudes: solicitudes ? solicitudes.length : null,
    operar: null,
  };

  return (
    <div className="ficha-page">
      <Header />

      <div className="ficha-migas">
        <Link to="/clientes"><ChevronLeft size={14} /> Clientes</Link>
        <span>/</span>
        <span>{tercero?.nombre ?? "Cargando…"}</span>
      </div>

      {/* ---------- Encabezado del cliente ---------- */}
      <section className="ficha-hero">
        <div className="ficha-hero-principal">
          <div className="ficha-avatar">{tercero ? iniciales(tercero.nombre) : ""}</div>
          <div>
            <div className="ficha-hero-etiquetas">
              {tercero && <span className="ficha-tipo">{TIPO_TERCERO_LABEL[tercero.tipo]}</span>}
              {verificacion && <EstadoVerificacionBadge estado={verificacion.estado} />}
            </div>
            <h1>{tercero?.nombre ?? "Cargando…"}</h1>
            {tercero && (
              <dl className="ficha-datos">
                <div><dt>Identificación</dt><dd>{tercero.identificacion ?? "—"}</dd></div>
                <div><dt>Teléfono</dt><dd>{tercero.telefono ?? "—"}</dd></div>
                <div><dt>Cliente desde</dt><dd>{new Date(tercero.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</dd></div>
                <div><dt>N° de cliente</dt><dd>#{tercero.id}</dd></div>
              </dl>
            )}
          </div>
        </div>
        <div className="ficha-hero-acciones">
          {puedeOperar && (
            <Link to={`/nueva-transaccion?cliente=${terceroId}`} className="ficha-btn-primario">
              <ArrowLeftRight size={16} /> Nueva transacción
            </Link>
          )}
          {puedeEditar && tercero && (
            <button className="ficha-btn-claro" onClick={() => setEditando(true)}>
              <Pencil size={16} /> Editar datos
            </button>
          )}
        </div>
      </section>

      {/* ---------- Indicadores ---------- */}
      <div className="ficha-kpis">
        <Kpi titulo="Documentos aprobados" valor={verificacion?.aprobados} detalle={verificacion ? `${verificacion.pendientes} en revisión · ${verificacion.vencidos} vencidos` : undefined} />
        <Kpi titulo="Cuentas de pago" valor={cuentasPago ? cuentasPagoActivas.length : undefined} detalle="activas" />
        <Kpi titulo="Cuentas corrientes" valor={resumen?.cuentas.disponibles.length} detalle={resumen ? `${resumen.cuentas.bloqueadas.length} bloqueadas` : undefined} />
        <Kpi titulo="Por cobrar" valor={resumen?.cuentasPorCobrar.length} detalle="pendientes" alerta={(resumen?.cuentasPorCobrar.length ?? 0) > 0} />
        <Kpi titulo="Por pagar" valor={resumen?.cuentasPorPagar.length} detalle="pendientes" alerta={(resumen?.cuentasPorPagar.length ?? 0) > 0} />
        <Kpi titulo="Solicitudes" valor={solicitudes?.length} detalle="por confirmar" />
      </div>

      {error && <p className="ficha-error">{error}</p>}

      {/* ---------- Secciones ---------- */}
      <nav className="ficha-tabs">
        {SECCIONES.filter((s) => s.id !== "operar" || puedeOperar).map(({ id: sid, label, Icono }) => (
          <button key={sid} className={seccion === sid ? "activo" : ""} onClick={() => irA(sid)}>
            <Icono size={16} /> {label}
            {conteo[sid] != null && <span className="ficha-tab-conteo">{conteo[sid]}</span>}
          </button>
        ))}
      </nav>

      <section className="ficha-contenido">
        {seccion === "documentos" && (
          <DocumentosCliente terceroId={terceroId} recargar={version} onCambio={refrescar} />
        )}

        {seccion === "pagos" && <CuentasPago cuentas={cuentasPago} />}

        {seccion === "cuentas" && resumen && (
          todasCuentas.length === 0 ? (
            <p className="ficha-vacio-texto">Este cliente no tiene cuentas corrientes.</p>
          ) : (
            <div className="ficha-tabla-scroll">
              <table className="ficha-tabla">
                <thead>
                  <tr><th>Canal</th><th>Moneda</th><th className="num">Saldo</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  {todasCuentas.map((c) => (
                    <tr key={c.id} className={c.estado !== "DISPONIBLE" ? "ficha-fila-apagada" : ""}>
                      <td>{c.canal_nombre}</td>
                      <td>{c.moneda_codigo}</td>
                      <td className="num">{formatearMonto(c.saldo_actual)}</td>
                      <td><span className={`ficha-estado ficha-estado-${c.estado.toLowerCase()}`}>{ESTADO_CUENTA[c.estado]}</span></td>
                      <td className="ficha-tabla-acciones">
                        {c.estado === "DISPONIBLE" && (
                          <>
                            <button onClick={() => cambiarEstadoCuenta(c.id, "BLOQUEADA")}>Bloquear</button>
                            <button onClick={() => cambiarEstadoCuenta(c.id, "CERRADA")}>Cerrar</button>
                          </>
                        )}
                        {c.estado === "BLOQUEADA" && <button onClick={() => cambiarEstadoCuenta(c.id, "DISPONIBLE")}>Desbloquear</button>}
                        {c.estado === "CERRADA" && <button onClick={() => cambiarEstadoCuenta(c.id, "DISPONIBLE")}>Reabrir</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {seccion === "deudas" && resumen && (
          <div className="ficha-deudas">
            <TablaDeuda titulo="Cuentas por cobrar" subtitulo="Lo que el cliente nos debe" filas={resumen.cuentasPorCobrar} />
            <TablaDeuda titulo="Cuentas por pagar" subtitulo="Lo que le debemos al cliente" filas={resumen.cuentasPorPagar} />
            <Link to="/cuentas-por-cobrar-pagar" className="ficha-enlace">Registrar abonos en Cuentas por Cobrar / Pagar →</Link>
          </div>
        )}

        {seccion === "solicitudes" && (
          solicitudes === null ? (
            <p className="ficha-vacio-texto">Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className="ficha-vacio-texto">Este cliente no tiene solicitudes pendientes de confirmación.</p>
          ) : (
            <div className="ficha-tabla-scroll">
              <table className="ficha-tabla">
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Caja</th><th className="num">Monto</th><th>Referencia</th><th>Registró</th></tr>
                </thead>
                <tbody>
                  {solicitudes.map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.created_at).toLocaleString("es-CO")}</td>
                      <td>{s.tipo}</td>
                      <td>{s.caja_nombre}</td>
                      <td className="num">{formatearMonto(s.monto_origen)} {s.moneda_codigo}</td>
                      <td>{s.referencia_codigo ?? "—"}</td>
                      <td>{s.creado_por_nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {seccion === "operar" && puedeOperar && (
          <div className="ficha-operar">
            <p className="ficha-vacio-texto">
              Registrá un cambio para este cliente. Para el flujo paso a paso usá{" "}
              <Link to={`/nueva-transaccion?cliente=${terceroId}`}>Nueva transacción</Link>.
            </p>
            <RegistrarOperacionForm
              terceroId={terceroId}
              onCompletado={refrescar}
              versionDocumentos={version}
              onDocumentoSubido={refrescar}
            />
          </div>
        )}

        {!resumen && seccion !== "documentos" && seccion !== "pagos" && seccion !== "solicitudes" && seccion !== "operar" && (
          <p className="ficha-vacio-texto">Cargando…</p>
        )}
      </section>

      {editando && tercero && (
        <Modal titulo="Editar datos del cliente" onCerrar={() => setEditando(false)}>
          <EditarClienteForm
            tercero={tercero}
            onGuardado={() => { setEditando(false); refrescar(); }}
            onCancelar={() => setEditando(false)}
          />
        </Modal>
      )}
    </div>
  );
}

const ESTADO_CUENTA: Record<"DISPONIBLE" | "BLOQUEADA" | "CERRADA", string> = {
  DISPONIBLE: "Disponible",
  BLOQUEADA: "Bloqueada",
  CERRADA: "Cerrada",
};

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function Kpi({ titulo, valor, detalle, alerta = false }: { titulo: string; valor: number | undefined; detalle?: string; alerta?: boolean }) {
  return (
    <div className={`ficha-kpi ${alerta ? "alerta" : ""}`}>
      <span className="ficha-kpi-titulo">{titulo}</span>
      <span className="ficha-kpi-valor">{valor ?? "—"}</span>
      {detalle && <span className="ficha-kpi-detalle">{detalle}</span>}
    </div>
  );
}

function CuentasPago({ cuentas }: { cuentas: CuentaTercero[] | null }) {
  if (cuentas === null) return <p className="ficha-vacio-texto">Cargando…</p>;
  if (cuentas.length === 0) return <p className="ficha-vacio-texto">Este cliente no tiene cuentas de pago registradas.</p>;

  return (
    <div className="ficha-cuentas-pago">
      {cuentas.map((c) => (
        <div key={c.id} className={`ficha-cuenta-pago ${c.activo ? "" : "inactiva"}`}>
          <div className="ficha-cuenta-pago-top">
            <span className="ficha-cuenta-pago-tipo"><Wallet size={15} /> {ETIQUETA_TIPO_CUENTA[c.tipo]}</span>
            {c.moneda_codigo && <span className="ficha-cuenta-pago-moneda">{c.moneda_codigo}</span>}
            {!c.activo && <span className="ficha-estado ficha-estado-cerrada">Inactiva</span>}
          </div>
          {c.alias && <strong className="ficha-cuenta-pago-alias">{c.alias}</strong>}
          <dl>
            {c.banco && <div><dt>Banco</dt><dd>{c.banco}</dd></div>}
            {c.numero_cuenta && <div><dt>Número</dt><dd>{c.numero_cuenta}{c.tipo_cuenta ? ` · ${c.tipo_cuenta === "AHORRO" ? "Ahorro" : "Corriente"}` : ""}</dd></div>}
            <div><dt>Titular</dt><dd>{c.titular}</dd></div>
            {c.identificacion_titular && <div><dt>Identificación</dt><dd>{c.identificacion_titular}</dd></div>}
            {c.telefono && <div><dt>Teléfono</dt><dd>{c.telefono}</dd></div>}
            {c.email && <div><dt>Email</dt><dd>{c.email}</dd></div>}
          </dl>
        </div>
      ))}
    </div>
  );
}

const ESTADO_DEUDA: Record<"PENDIENTE" | "ABONADA" | "PAGADA" | "VENCIDA", string> = {
  PENDIENTE: "Pendiente",
  ABONADA: "Abonada",
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
};

function TablaDeuda({
  titulo,
  subtitulo,
  filas,
}: {
  titulo: string;
  subtitulo: string;
  filas: ResumenTercero["cuentasPorCobrar"];
}) {
  return (
    <div className="ficha-deuda">
      <h3><FileText size={16} className="icono-inline" /> {titulo}</h3>
      <span className="ficha-deuda-sub">{subtitulo}</span>
      {filas.length === 0 ? (
        <p className="ficha-vacio-texto">Nada pendiente.</p>
      ) : (
        <div className="ficha-tabla-scroll">
          <table className="ficha-tabla">
            <thead>
              <tr><th>Fecha</th><th>Moneda</th><th className="num">Original</th><th className="num">Saldo</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{new Date(f.created_at).toLocaleDateString("es-CO")}</td>
                  <td>{f.moneda_codigo}</td>
                  <td className="num">{formatearMonto(f.monto_original)}</td>
                  <td className="num"><strong>{formatearMonto(f.saldo_pendiente)}</strong></td>
                  <td><span className={`ficha-estado ficha-estado-${f.estado.toLowerCase()}`}>{ESTADO_DEUDA[f.estado]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TIPOS_TERCERO: TipoTercero[] = ["CLIENTE", "PROVEEDOR", "MIXTO"];

function esTipoTercero(valor: string): valor is TipoTercero {
  return TIPOS_TERCERO.some((t) => t === valor);
}

function EditarClienteForm({ tercero, onGuardado, onCancelar }: { tercero: Tercero; onGuardado: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(tercero.nombre);
  const [identificacion, setIdentificacion] = useState(tercero.identificacion ?? "");
  const [telefono, setTelefono] = useState(tercero.telefono ?? "");
  const [tipo, setTipo] = useState<TipoTercero>(tercero.tipo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    setError(null);
    setGuardando(true);
    try {
      await actualizarTercero(tercero.id, {
        nombre: nombre.trim(),
        identificacion: identificacion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        tipo,
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="ficha-form" onSubmit={handleSubmit}>
      <label>
        Nombre completo
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
      </label>
      <div className="ficha-form-fila">
        <label>
          Identificación
          <input value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} />
        </label>
        <label>
          Teléfono
          <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
      </div>
      <label>
        Tipo
        <select value={tipo} onChange={(e) => { if (esTipoTercero(e.target.value)) setTipo(e.target.value); }}>
          {TIPOS_TERCERO.map((t) => <option key={t} value={t}>{TIPO_TERCERO_LABEL[t]}</option>)}
        </select>
      </label>
      <p className="ficha-form-nota">Dejar un campo vacío no borra el dato guardado.</p>
      {error && <p className="ficha-error">{error}</p>}
      <div className="ficha-form-acciones">
        <button type="button" className="ficha-btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="ficha-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}
