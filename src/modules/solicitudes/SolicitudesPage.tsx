import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Clock, Inbox, Landmark, Paperclip, Search, X } from "lucide-react";
import { Header } from "../../components/common/Header";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getSolicitudesPendientes, type Solicitud } from "../../api/transacciones.api";
import { RevisionSolicitudModal } from "./RevisionSolicitudModal";
import { antiguedadTexto, bancoDeSolicitud, flujoDeSolicitud, formatearMonto, infoTipo, minutosDesde, nombreLegible, urgencia, type LadoFlujo } from "./flujo";
import "./solicitudes.css";

const REFRESCO_MS = 8000;
const FILTROS_TIPO = [
  { valor: "", etiqueta: "Todas" },
  { valor: "COMPRA_DIVISA", etiqueta: "Compras" },
  { valor: "VENTA_DIVISA", etiqueta: "Ventas" },
  { valor: "DEPOSITO", etiqueta: "Depósitos" },
  { valor: "RETIRO", etiqueta: "Retiros" },
];

// Suma por moneda de un lado del flujo ("Por recibir" / "Por entregar")
function totalesPorMoneda(lados: (LadoFlujo | null)[]) {
  const totales = new Map<string, number>();
  for (const l of lados) if (l) totales.set(l.moneda, (totales.get(l.moneda) ?? 0) + Number(l.monto));
  return [...totales.entries()].sort((a, b) => b[1] - a[1]);
}

function Lado({ lado, direccion }: { lado: LadoFlujo | null; direccion: "entra" | "sale" }) {
  if (!lado) return <div className={`bdj-lado bdj-lado-vacio`}>{direccion === "entra" ? "No entra plata" : "No sale plata"}</div>;
  return (
    <div className={`bdj-lado bdj-lado-${direccion}`}>
      <span className="bdj-lado-etiqueta">
        {direccion === "entra" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
        {direccion === "entra" ? "Recibimos" : "Entregamos"}
      </span>
      <strong>{formatearMonto(lado.monto)} <small>{lado.moneda}</small></strong>
      <span className="bdj-lado-caja">{lado.esBanco ? <Landmark size={12} /> : null} {lado.caja}</span>
    </div>
  );
}

export function SolicitudesPage() {
  const [bancos, setBancos] = useState<Caja[]>([]);
  const [bancoSeleccionado, setBancoSeleccionado] = useState<number | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [todas, setTodas] = useState<Solicitud[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo: "ok" | "rechazo" } | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    getCajas().then((data) => setBancos(data.filter((c) => c.tipo === "BANCO"))).catch(() => setBancos([]));
  }, []);

  const cargar = useCallback(async () => {
    try {
      setTodas(await getSolicitudesPendientes());
      setError(null);
    } catch {
      setError("No se pudieron cargar las solicitudes. Se reintenta solo.");
    } finally {
      setCargado(true);
      setAhora(Date.now());
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const conteoPorBanco = useMemo(() => {
    const conteo: Record<number, number> = {};
    for (const s of todas) {
      const banco = bancoDeSolicitud(s);
      if (banco) conteo[banco] = (conteo[banco] ?? 0) + 1;
    }
    return conteo;
  }, [todas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return todas.filter((s) => {
      if (bancoSeleccionado !== null && bancoDeSolicitud(s) !== bancoSeleccionado) return false;
      if (tipoFiltro && s.tipo !== tipoFiltro) return false;
      if (!q) return true;
      return [s.tercero_nombre, s.tercero_identificacion, s.referencia_codigo, String(s.id), s.creado_por_nombre]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [todas, bancoSeleccionado, tipoFiltro, busqueda]);

  const flujos = visibles.map(flujoDeSolicitud);
  const porRecibir = totalesPorMoneda(flujos.map((f) => f.entra));
  const porEntregar = totalesPorMoneda(flujos.map((f) => f.sale));
  const masAntigua = visibles.length > 0 ? Math.max(...visibles.map((s) => minutosDesde(s.created_at, ahora))) : 0;
  const urgentes = visibles.filter((s) => urgencia(minutosDesde(s.created_at, ahora)) === "urgente").length;

  return (
    <div className="bdj-page">
      <Header />

      {/* ---------- Encabezado con indicadores ---------- */}
      <section className="bdj-hero">
        <div className="bdj-hero-titulo">
          <div>
            <h1>Bandeja de Solicitudes</h1>
            <p>Revisá cada pago antes de confirmarlo: lo que llega y lo que se le entrega al cliente.</p>
          </div>
          <span className="bdj-en-vivo"><span className="bdj-pulso" /> En vivo · cada {REFRESCO_MS / 1000} s</span>
        </div>
        <div className="bdj-kpis">
          <div className="bdj-kpi">
            <span>Pendientes</span>
            <strong>{visibles.length}</strong>
            {urgentes > 0 && <em className="bdj-kpi-alerta">{urgentes} esperando +30 min</em>}
          </div>
          <div className="bdj-kpi">
            <span><ArrowDownLeft size={13} /> Por recibir</span>
            {porRecibir.length === 0 ? <strong>—</strong> : porRecibir.slice(0, 3).map(([m, v]) => <strong key={m} className="bdj-kpi-monto">{formatearMonto(String(v), 2)} <small>{m}</small></strong>)}
          </div>
          <div className="bdj-kpi">
            <span><ArrowUpRight size={13} /> Por entregar</span>
            {porEntregar.length === 0 ? <strong>—</strong> : porEntregar.slice(0, 3).map(([m, v]) => <strong key={m} className="bdj-kpi-monto">{formatearMonto(String(v), 2)} <small>{m}</small></strong>)}
          </div>
          <div className="bdj-kpi">
            <span><Clock size={13} /> Más antigua</span>
            <strong>{visibles.length === 0 ? "—" : antiguedadTexto(masAntigua).replace("hace ", "")}</strong>
          </div>
        </div>
      </section>

      <div className="bdj-layout">
        {/* ---------- Bancos ---------- */}
        <aside className="bdj-bancos">
          <h3>Por banco</h3>
          <button className={bancoSeleccionado === null ? "activo" : ""} onClick={() => setBancoSeleccionado(null)}>
            <span><Inbox size={15} /> Todas</span>
            <span className="bdj-badge">{todas.length}</span>
          </button>
          {bancos.map((b) => (
            <button key={b.id} className={bancoSeleccionado === b.id ? "activo" : ""} onClick={() => setBancoSeleccionado(b.id)}>
              <span><Landmark size={15} /> {b.nombre}</span>
              <span className={`bdj-badge${(conteoPorBanco[b.id] ?? 0) > 0 ? " bdj-badge-lleno" : ""}`}>{conteoPorBanco[b.id] ?? 0}</span>
            </button>
          ))}
        </aside>

        <main className="bdj-main">
          {/* ---------- Filtros ---------- */}
          <div className="bdj-filtros">
            <div className="bdj-chips">
              {FILTROS_TIPO.map((f) => (
                <button key={f.valor} className={tipoFiltro === f.valor ? "activo" : ""} onClick={() => setTipoFiltro(f.valor)}>
                  {f.etiqueta}
                </button>
              ))}
            </div>
            <label className="bdj-buscar">
              <Search size={15} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente, cédula, referencia o #" />
              {busqueda && <button onClick={() => setBusqueda("")} aria-label="Limpiar"><X size={14} /></button>}
            </label>
          </div>

          {aviso && (
            <p className={`bdj-aviso bdj-aviso-${aviso.tipo}`}>
              {aviso.tipo === "ok" ? <CheckCircle2 size={16} /> : <X size={16} />} {aviso.texto}
            </p>
          )}
          {error && <p className="bdj-aviso bdj-aviso-rechazo">{error}</p>}

          {/* ---------- Tarjetas ---------- */}
          {!cargado ? (
            <div className="bdj-lista">{[0, 1, 2].map((i) => <div key={i} className="bdj-tarjeta bdj-esqueleto" />)}</div>
          ) : visibles.length === 0 ? (
            <div className="bdj-vacio">
              <CheckCircle2 size={40} />
              <h3>{todas.length === 0 ? "Todo al día" : "Nada con estos filtros"}</h3>
              <p>{todas.length === 0 ? "No hay solicitudes pendientes por confirmar." : "Probá con otro banco, tipo o búsqueda."}</p>
            </div>
          ) : (
            <div className="bdj-lista">
              {visibles.map((s, i) => {
                const tipo = infoTipo(s.tipo);
                const { entra, sale } = flujos[i]!;
                const minutos = minutosDesde(s.created_at, ahora);
                return (
                  <article key={s.id} className={`bdj-tarjeta bdj-borde-${tipo.clase}`} onClick={() => setAbierta(s.id)}>
                    <div className="bdj-tarjeta-cabecera">
                      <span className={`bdj-tipo bdj-tipo-${tipo.clase}`}>{tipo.corta}</span>
                      <span className="bdj-id">#{s.id}</span>
                      <span className={`bdj-espera bdj-espera-${urgencia(minutos)}`}><Clock size={12} /> {antiguedadTexto(minutos)}</span>
                    </div>

                    <div className="bdj-tarjeta-cliente">
                      <strong>{s.tercero_nombre ?? "Sin cliente"}</strong>
                      {s.tercero_identificacion && <span>{s.tercero_identificacion}</span>}
                    </div>

                    <div className="bdj-flujo">
                      <Lado lado={entra} direccion="entra" />
                      <ArrowRight size={16} className="bdj-flujo-flecha" />
                      <Lado lado={sale} direccion="sale" />
                    </div>

                    <div className="bdj-tarjeta-pie">
                      <span className="bdj-meta">
                        {s.referencia_codigo ? <>Ref. <strong>{s.referencia_codigo}</strong></> : "Sin referencia"}
                        {s.metodo_pago_nombre && <> · {nombreLegible(s.metodo_pago_nombre)}</>}
                      </span>
                      <span className={`bdj-docs${(s.documentos ?? 0) > 0 ? " bdj-docs-si" : ""}`} title="Capturas y comprobantes">
                        <Paperclip size={13} /> {s.documentos ?? 0}
                      </span>
                      <span className="bdj-meta">por {s.creado_por_nombre}</span>
                      <button
                        className="bdj-btn-revisar"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAbierta(s.id);
                        }}
                      >
                        Revisar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {abierta !== null && (
        <RevisionSolicitudModal
          solicitudId={abierta}
          onCerrar={() => {
            setAbierta(null);
            cargar();
          }}
          onResuelta={(texto, tipo) => {
            setAbierta(null);
            setAviso({ texto, tipo });
            cargar();
          }}
        />
      )}
    </div>
  );
}
