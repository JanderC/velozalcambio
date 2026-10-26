import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Repeat, Trash2, X } from "lucide-react";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { getCajas, type Caja } from "../../api/cajas.api";
import { gastosApi, type CategoriaGasto, type Gasto, type PlantillaGasto } from "../../api/gastos.api";
import { formatearMonto, leerNumero, sumarDecimales } from "../../utils/montos";
import "./gastos.css";

// Las secciones de la hoja de Excel, en el mismo orden
const CATEGORIAS: { id: CategoriaGasto; titulo: string }[] = [
  { id: "OFICINA", titulo: "Gasto de oficina" },
  { id: "NOMINA", titulo: "Sueldos empleados" },
  { id: "BONO", titulo: "Bonos" },
  { id: "ENTES", titulo: "Pagos a entes" },
  { id: "PAGO_BANCOLOMBIA", titulo: "Pagos por Bancolombia" },
  { id: "PAGO_BOLIVARES", titulo: "Pagos en bolívares" },
  { id: "OTRO", titulo: "Otros egresos" },
  { id: "DUENO", titulo: "Sueldo del dueño (no suma al total del mes)" },
];
const titulo = (c: CategoriaGasto) => CATEGORIAS.find((x) => x.id === c)?.titulo ?? c;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const mesActual = () => hoy().slice(0, 7);
function moverMes(p: string, n: number) {
  const [a, m] = p.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const nombreMes = (p: string) => new Date(`${p}-15T12:00:00Z`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
const fechaCorta = (f: string | null) => (f ? new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }) : "");
const pesos = (v: string) => `$${formatearMonto(v)}`;
const dolares = (v: string) => `US$${formatearMonto(v)}`;
const hay = (v: string) => /[1-9]/.test(v);
const sumar = (gs: Gasto[], campo: "monto_cop" | "monto_usd") => gs.reduce((s, g) => sumarDecimales(s, g[campo]), "0");

/**
 * Gastos administrativos del mes, como la hoja de Excel: gasto de oficina, nómina, bonos, pagos a entes, pagos por
 * Bancolombia y en bolívares. Cada gasto queda pendiente o pagado; al pagarlo se elige de dónde salió la plata.
 */
export function GastosPage() {
  const [periodo, setPeriodo] = useState(mesActual);
  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ categoria: CategoriaGasto; gasto?: Gasto } | null>(null);
  const [pagando, setPagando] = useState<Gasto | null>(null);
  const [plantillas, setPlantillas] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setGastos(await gastosApi.listar(periodo));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los gastos.");
    }
  }, [periodo]);
  useEffect(() => {
    setGastos(null);
    void cargar();
  }, [cargar]);
  useEffect(() => {
    // los gastos salen de la Caja Fuerte o de una cuenta de la empresa, no de una taquilla
    getCajas()
      .then((cs) => setCajas(cs.filter((c) => c.activo && c.tipo !== "FISICA")))
      .catch(() => setCajas([]));
  }, []);

  const lista = useMemo(() => gastos ?? [], [gastos]);
  const delMes = lista.filter((g) => g.categoria !== "DUENO");
  const pagados = delMes.filter((g) => g.estado === "PAGADO");
  const pendientes = delMes.filter((g) => g.estado === "PENDIENTE");

  async function generar(frecuencia: "MENSUAL" | "SEMANAL") {
    setAviso(null);
    try {
      const { creados } = await gastosApi.generar(periodo, frecuencia);
      setAviso(creados ? `Se cargaron ${creados} pagos pendientes de ${nombreMes(periodo)}.` : "Ya estaban cargados todos los de este mes (o no hay plantillas).");
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar.");
    }
  }

  async function borrar(g: Gasto) {
    const msg = g.caja_nombre ? `¿Borrar "${g.descripcion}"?\n\nLa plata vuelve a ${g.caja_nombre}.` : `¿Borrar "${g.descripcion}"?`;
    if (!window.confirm(msg)) return;
    try {
      await gastosApi.borrar(g.id);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  }

  return (
    <div className="gas-page">
      <Header />
      <div className="gas-cabeza">
        <div>
          <h1>
            <Receipt size={26} /> Gastos administrativos
          </h1>
          <p>Nómina, sueldos, gastos de oficina y cualquier egreso del negocio.</p>
        </div>
        <div className="gas-mes">
          <button type="button" onClick={() => setPeriodo((p) => moverMes(p, -1))} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
          <button type="button" onClick={() => setPeriodo((p) => moverMes(p, 1))} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="gas-totales">
        <div className="gas-total-mes">
          <span>Total gasto de {nombreMes(periodo)}</span>
          <strong>{pesos(sumar(delMes, "monto_cop"))}</strong>
          <strong>{dolares(sumar(delMes, "monto_usd"))}</strong>
        </div>
        <div>
          <span>Pagado</span>
          <strong>{pesos(sumar(pagados, "monto_cop"))}</strong>
          <small>{dolares(sumar(pagados, "monto_usd"))}</small>
        </div>
        <div>
          <span>Pendiente por pagar</span>
          <strong>{pesos(sumar(pendientes, "monto_cop"))}</strong>
          <small>
            {dolares(sumar(pendientes, "monto_usd"))} · {pendientes.length} pagos
          </small>
        </div>
      </div>

      <div className="gas-acciones">
        <button type="button" className="gas-principal" onClick={() => setFormulario({ categoria: "OFICINA" })}>
          <Plus size={16} /> Nuevo gasto
        </button>
        <button type="button" onClick={() => void generar("MENSUAL")} title="Deja pendiente el sueldo de cada empleado de este mes">
          <CalendarClock size={16} /> Cargar nómina del mes
        </button>
        <button type="button" onClick={() => void generar("SEMANAL")} title="Deja pendiente cada pago semanal en los días que tocan este mes">
          <CalendarClock size={16} /> Cargar pagos semanales
        </button>
        <button type="button" onClick={() => setPlantillas(true)}>
          <Repeat size={16} /> Nómina y pagos fijos
        </button>
      </div>

      {error && <p className="gas-error">{error}</p>}
      {aviso && <p className="gas-aviso">{aviso}</p>}
      {!gastos && !error && <p className="gas-cargando">Cargando…</p>}

      {gastos && (
        <div className="gas-secciones">
          {CATEGORIAS.map((c) => {
            const filas = lista.filter((g) => g.categoria === c.id);
            if (!filas.length && (c.id === "OTRO" || c.id === "DUENO")) return null;
            const pag = filas.filter((g) => g.estado === "PAGADO");
            return (
              <section key={c.id} className={`gas-seccion${c.id === "DUENO" ? " gas-aparte" : ""}`}>
                <header>
                  <h2>{c.titulo}</h2>
                  <button type="button" onClick={() => setFormulario({ categoria: c.id })}>
                    <Plus size={14} /> Agregar
                  </button>
                </header>
                {filas.length === 0 ? (
                  <p className="gas-vacio">Nada cargado este mes.</p>
                ) : (
                  <div className="gas-tabla-scroll">
                    <table className="gas-tabla">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Descripción</th>
                          <th className="num">Pesos</th>
                          <th className="num">Dólares</th>
                          <th>Estado</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((g) => (
                          <tr key={g.id} className={g.estado === "PENDIENTE" ? "gas-pendiente" : ""}>
                            <td className="gas-fecha">{g.fecha ? fechaCorta(g.fecha) : g.fecha_programada ? <em>toca {fechaCorta(g.fecha_programada)}</em> : "—"}</td>
                            <td>
                              {g.descripcion}
                              {g.nota && <small>{g.nota}</small>}
                            </td>
                            <td className="num">{hay(g.monto_cop) ? pesos(g.monto_cop) : ""}</td>
                            <td className="num">{hay(g.monto_usd) ? dolares(g.monto_usd) : ""}</td>
                            <td>
                              {g.estado === "PAGADO" ? (
                                <span className="gas-pagado" title={g.pagado_por_nombre ? `Lo registró ${g.pagado_por_nombre}` : undefined}>
                                  <Check size={13} /> Pagado{g.caja_nombre ? ` · ${g.caja_nombre}` : ""}
                                </span>
                              ) : (
                                <button type="button" className="gas-pagar" onClick={() => setPagando(g)}>
                                  Pagar
                                </button>
                              )}
                            </td>
                            <td className="gas-iconos">
                              <button type="button" onClick={() => setFormulario({ categoria: g.categoria, gasto: g })} aria-label="Editar">
                                <Pencil size={14} />
                              </button>
                              <button type="button" onClick={() => void borrar(g)} aria-label="Borrar">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>Total</td>
                          <td className="num">{pesos(sumar(filas, "monto_cop"))}</td>
                          <td className="num">{dolares(sumar(filas, "monto_usd"))}</td>
                          <td colSpan={2} className="gas-cancelado">
                            {pag.length < filas.length && `Cancelado: ${pesos(sumar(pag, "monto_cop"))}${hay(sumar(pag, "monto_usd")) ? ` · ${dolares(sumar(pag, "monto_usd"))}` : ""}`}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {formulario && (
        <FormularioGasto
          periodo={periodo}
          categoria={formulario.categoria}
          gasto={formulario.gasto}
          cajas={cajas}
          onCerrar={() => setFormulario(null)}
          onListo={async () => {
            setFormulario(null);
            await cargar();
          }}
        />
      )}
      {pagando && (
        <PagarGasto
          gasto={pagando}
          cajas={cajas}
          onCerrar={() => setPagando(null)}
          onListo={async () => {
            setPagando(null);
            await cargar();
          }}
        />
      )}
      {plantillas && <Plantillas onCerrar={() => setPlantillas(false)} />}
    </div>
  );
}

function SaleDe({ cajas, valor, onCambio }: { cajas: Caja[]; valor: string; onCambio: (v: string) => void }) {
  return (
    <label>
      ¿De dónde sale la plata?
      <select value={valor} onChange={(e) => onCambio(e.target.value)}>
        <option value="">De ninguna caja del sistema</option>
        {cajas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.tipo === "BANCO" ? " (cuenta)" : ""}
          </option>
        ))}
      </select>
      <small>Si eliges una caja, baja por lo que se pagó.</small>
    </label>
  );
}

function FormularioGasto({
  periodo,
  categoria: inicial,
  gasto,
  cajas,
  onCerrar,
  onListo,
}: {
  periodo: string;
  categoria: CategoriaGasto;
  gasto?: Gasto;
  cajas: Caja[];
  onCerrar: () => void;
  onListo: () => Promise<void>;
}) {
  const [categoria, setCategoria] = useState<CategoriaGasto>(gasto?.categoria ?? inicial);
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? "");
  const [cop, setCop] = useState(gasto && hay(gasto.monto_cop) ? formatearMonto(gasto.monto_cop) : "");
  const [usd, setUsd] = useState(gasto && hay(gasto.monto_usd) ? formatearMonto(gasto.monto_usd) : "");
  const [pagado, setPagado] = useState(true);
  const [fecha, setFecha] = useState(() => (hoy().startsWith(periodo) ? hoy() : `${periodo}-01`));
  const [cajaId, setCajaId] = useState("");
  const [nota, setNota] = useState(gasto?.nota ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const yaSalioDeCaja = !!gasto?.caja_id;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const montoCop = cop.trim() ? leerNumero(cop) : "0";
    const montoUsd = usd.trim() ? leerNumero(usd) : "0";
    if (montoCop === null || montoUsd === null || montoCop.startsWith("-") || montoUsd.startsWith("-")) return setError("Revisa los montos.");
    if (!hay(montoCop) && !hay(montoUsd)) return setError("Escribe el monto en pesos o en dólares.");
    if (!descripcion.trim()) return setError("Escribe qué se pagó o a quién.");
    setEnviando(true);
    try {
      if (gasto) await gastosApi.editar(gasto.id, { categoria, descripcion, montoCop, montoUsd, nota });
      else await gastosApi.crear({ periodo, categoria, descripcion, montoCop, montoUsd, pagado, fecha: pagado ? fecha : undefined, cajaId: pagado && cajaId ? Number(cajaId) : null, nota });
      await onListo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="gas-fondo" onClick={onCerrar}>
      <form className="gas-modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <header>
          <h3>{gasto ? "Editar gasto" : `Nuevo gasto · ${nombreMes(periodo)}`}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <label>
          Sección
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          {categoria === "NOMINA" || categoria === "BONO" || categoria === "DUENO" ? "Empleado" : "Descripción"}
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={categoria === "OFICINA" ? "Ej. Arriendo, internet, papelería" : ""} autoFocus />
        </label>
        <div className="gas-dos">
          <label>
            Monto en pesos
            <input value={cop} onChange={(e) => setCop(e.target.value)} inputMode="decimal" placeholder="0" disabled={yaSalioDeCaja} />
          </label>
          <label>
            Monto en dólares
            <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal" placeholder="0" disabled={yaSalioDeCaja} />
          </label>
        </div>
        {yaSalioDeCaja && <small className="gas-nota">Este gasto ya salió de {gasto?.caja_nombre}: para cambiar el monto, bórralo y cárgalo de nuevo.</small>}
        {!gasto && (
          <>
            <label className="gas-check">
              <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} /> Ya se pagó
            </label>
            {pagado && (
              <>
                <label>
                  Fecha de pago
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </label>
                <SaleDe cajas={cajas} valor={cajaId} onCambio={setCajaId} />
              </>
            )}
          </>
        )}
        <label>
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
        {error && <p className="gas-error">{error}</p>}
        <button type="submit" className="gas-principal" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}

function PagarGasto({ gasto, cajas, onCerrar, onListo }: { gasto: Gasto; cajas: Caja[]; onCerrar: () => void; onListo: () => Promise<void> }) {
  const [fecha, setFecha] = useState(hoy);
  const [cajaId, setCajaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pagar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await gastosApi.pagar(gasto.id, { fecha, cajaId: cajaId ? Number(cajaId) : null });
      await onListo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el pago.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="gas-fondo" onClick={onCerrar}>
      <form className="gas-modal" onClick={(e) => e.stopPropagation()} onSubmit={pagar}>
        <header>
          <h3>Pagar · {gasto.descripcion}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <p className="gas-monto-pagar">
          {hay(gasto.monto_cop) && <strong>{pesos(gasto.monto_cop)}</strong>}
          {hay(gasto.monto_usd) && <strong>{dolares(gasto.monto_usd)}</strong>}
          <span>{titulo(gasto.categoria)}</span>
        </p>
        <label>
          Fecha de pago
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <SaleDe cajas={cajas} valor={cajaId} onCambio={setCajaId} />
        {error && <p className="gas-error">{error}</p>}
        <button type="submit" className="gas-principal" disabled={enviando}>
          {enviando ? "Registrando…" : "Registrar pago"}
        </button>
      </form>
    </div>
  );
}

const vacia = (frecuencia: "MENSUAL" | "SEMANAL"): PlantillaGasto => ({
  categoria: frecuencia === "MENSUAL" ? "NOMINA" : "ENTES",
  descripcion: "",
  monto_cop: "",
  monto_usd: "",
  frecuencia,
  dia_semana: frecuencia === "SEMANAL" ? 1 : null,
});

/** Lo que se paga siempre: el sueldo de cada empleado (cada mes) y los pagos de cada semana (qué día). */
function Plantillas({ onCerrar }: { onCerrar: () => void }) {
  const [filas, setFilas] = useState<PlantillaGasto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    gastosApi
      .plantillas()
      .then((ps) => setFilas(ps.map((p) => ({ ...p, monto_cop: hay(p.monto_cop) ? formatearMonto(p.monto_cop) : "", monto_usd: hay(p.monto_usd) ? formatearMonto(p.monto_usd) : "" }))))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar."));
  }, []);

  const cambiar = (i: number, d: Partial<PlantillaGasto>) => {
    setGuardado(false);
    setFilas((fs) => fs!.map((f, j) => (j === i ? { ...f, ...d } : f)));
  };

  async function guardar() {
    setError(null);
    const listas: PlantillaGasto[] = [];
    for (const f of filas ?? []) {
      if (!f.descripcion.trim()) continue;
      const cop = f.monto_cop.trim() ? leerNumero(f.monto_cop) : "0";
      const usd = f.monto_usd.trim() ? leerNumero(f.monto_usd) : "0";
      if (cop === null || usd === null || cop.startsWith("-") || usd.startsWith("-")) return setError(`Revisa los montos de ${f.descripcion}.`);
      listas.push({ ...f, monto_cop: cop, monto_usd: usd });
    }
    try {
      await gastosApi.guardarPlantillas(listas);
      setGuardado(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
    }
  }

  const grupo = (frecuencia: "MENSUAL" | "SEMANAL") => (
    <section>
      <header>
        <h4>{frecuencia === "MENSUAL" ? "Cada mes (nómina, bonos…)" : "Cada semana (pagos a entes…)"}</h4>
        <button type="button" onClick={() => setFilas((fs) => [...(fs ?? []), vacia(frecuencia)])}>
          <Plus size={14} /> Agregar
        </button>
      </header>
      {(filas ?? []).map((f, i) =>
        f.frecuencia !== frecuencia ? null : (
          <div key={i} className="gas-plantilla">
            <input value={f.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} placeholder="Nombre" />
            <select value={f.categoria} onChange={(e) => cambiar(i, { categoria: e.target.value as CategoriaGasto })}>
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo}
                </option>
              ))}
            </select>
            {frecuencia === "SEMANAL" && (
              <select value={f.dia_semana ?? 1} onChange={(e) => cambiar(i, { dia_semana: Number(e.target.value) })}>
                {DIAS.map((d, n) => (
                  <option key={n} value={n}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <input value={f.monto_cop} onChange={(e) => cambiar(i, { monto_cop: e.target.value })} placeholder="Pesos" inputMode="decimal" />
            <input value={f.monto_usd} onChange={(e) => cambiar(i, { monto_usd: e.target.value })} placeholder="Dólares" inputMode="decimal" />
            <button type="button" onClick={() => setFilas((fs) => fs!.filter((_, j) => j !== i))} aria-label="Quitar">
              <Trash2 size={14} />
            </button>
          </div>
        )
      )}
    </section>
  );

  return (
    <div className="gas-fondo" onClick={onCerrar}>
      <div className="gas-modal gas-modal-ancho" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Nómina y pagos fijos</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <p className="gas-nota">Lo que se paga siempre. Con "Cargar nómina del mes" y "Cargar pagos semanales" quedan pendientes en el mes que estés viendo.</p>
        {!filas && !error && <p className="gas-cargando">Cargando…</p>}
        {filas && grupo("MENSUAL")}
        {filas && grupo("SEMANAL")}
        {error && <p className="gas-error">{error}</p>}
        {guardado && <p className="gas-aviso">Guardado.</p>}
        <button type="button" className="gas-principal" onClick={() => void guardar()} disabled={!filas}>
          Guardar
        </button>
      </div>
    </div>
  );
}
