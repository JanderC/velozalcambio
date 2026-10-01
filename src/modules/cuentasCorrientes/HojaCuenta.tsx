import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Undo2 } from "lucide-react";
import {
  anularMovimientoCC,
  getEstadoCuenta,
  registrarMovimientoCC,
  type CuentaCorrienteResumen,
  type EstadoCuenta,
} from "../../api/cuentasCorrientes.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

type Periodo = "hoy" | "semana" | "mes" | "todo" | "rango";

const REFERENCIAS_COMUNES = ["Venta de bss", "Venta de USDT", "Deteriorado", "Abono dólares", "Abono efectivo", "Abono transferencia"];

/** AAAA-MM-DD de hoy en la zona del negocio. */
function hoyBogota(desplazarDias = 0) {
  const d = new Date(Date.now() + desplazarDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
}

function rangoDe(periodo: Periodo, desde: string, hasta: string) {
  if (periodo === "hoy") return { desde: hoyBogota(), hasta: hoyBogota() };
  if (periodo === "semana") return { desde: hoyBogota(-6), hasta: hoyBogota() };
  if (periodo === "mes") return { desde: `${hoyBogota().slice(0, 8)}01`, hasta: hoyBogota() };
  if (periodo === "rango") return { desde: desde || undefined, hasta: hasta || undefined };
  return {};
}

function fechaCorta(fecha: string) {
  return new Date(fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Monto({ valor, simbolo = "$" }: { valor: string; simbolo?: string }) {
  const negativo = valor.startsWith("-");
  return <span className={negativo ? "cc-neg" : ""}>{negativo ? `- ${simbolo}${formatearMonto(valor.slice(1))}` : `${simbolo}${formatearMonto(valor)}`}</span>;
}

/**
 * La hoja de una cuenta, igual que el Excel: FECHA · REFERENCIA · CANTIDAD · TASA · MONTO · TOTAL,
 * con el saldo pendiente arriba y una fila para cargar el siguiente movimiento.
 */
export function HojaCuenta({ cuenta, onActualizar, onVolver }: { cuenta: CuentaCorrienteResumen; onActualizar: () => void; onVolver: () => void }) {
  const { usuario } = useAuth();
  const puedeAnular = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setEstado(await getEstadoCuenta(cuenta.id, rangoDe(periodo, desde, hasta)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [cuenta.id, periodo, desde, hasta]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);

  async function anular(id: number, referencia: string) {
    if (!window.confirm(`¿Anular "${referencia}"? Se registra el movimiento contrario y el total vuelve a como estaba.`)) return;
    try {
      await anularMovimientoCC(id);
      await cargar();
      onActualizar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const simbolo = cuenta.moneda_codigo === "COP" ? "$" : "";
  const sufijo = cuenta.moneda_codigo === "COP" ? "" : ` ${cuenta.moneda_codigo}`;
  const referencias = useMemo(() => {
    const usadas = (estado?.movimientos ?? []).map((m) => m.descripcion).filter((d): d is string => !!d && !d.startsWith("Reverso de"));
    return [...new Set([...usadas.reverse(), ...REFERENCIAS_COMUNES])].slice(0, 30);
  }, [estado]);

  return (
    <div className="cc-hoja">
      <div className="cc-hoja-cabeza">
        <button className="cc-volver" onClick={onVolver} aria-label="Volver a la lista">
          <ArrowLeft size={18} />
        </button>
        <div className="cc-hoja-titulo">
          <h2>{cuenta.tercero_nombre}</h2>
          <span>
            {cuenta.tercero_tipo === "PROVEEDOR" ? "Proveedor" : cuenta.tercero_tipo === "CLIENTE" ? "Cliente" : "Cliente y proveedor"} · {cuenta.canal_nombre.replace(/_/g, " ")} ·{" "}
            {cuenta.moneda_codigo}
          </span>
        </div>
        <div className="cc-hoja-saldo">
          <span>Saldo</span>
          <strong>
            <Monto valor={estado?.cuenta.saldo_actual ?? cuenta.saldo_actual} simbolo={simbolo} />
            {sufijo}
          </strong>
        </div>
      </div>

      <div className="cc-periodos" role="tablist" aria-label="Período">
        {(
          [
            ["hoy", "Hoy"],
            ["semana", "7 días"],
            ["mes", "Este mes"],
            ["todo", "Todo"],
            ["rango", "Fechas"],
          ] as [Periodo, string][]
        ).map(([valor, etiqueta]) => (
          <button key={valor} role="tab" aria-selected={periodo === valor} className={periodo === valor ? "activo" : ""} onClick={() => setPeriodo(valor)}>
            {etiqueta}
          </button>
        ))}
        {periodo === "rango" && (
          <span className="cc-rango">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
            a
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
          </span>
        )}
      </div>

      {error && <p className="cc-form-error">{error}</p>}

      <div className="cc-tabla-scroll">
        <table className="cc-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Referencia</th>
              <th className="num">Cantidad</th>
              <th className="num">Tasa</th>
              <th className="num">Monto</th>
              <th className="num">Total</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {estado && periodo !== "todo" && (
              <tr className="cc-fila-saldo">
                <td colSpan={5}>Saldo pendiente anterior</td>
                <td className="num">
                  <Monto valor={estado.saldoAnterior} simbolo={simbolo} />
                </td>
                <td />
              </tr>
            )}
            {cargando && (
              <tr>
                <td colSpan={7} className="cc-tabla-aviso">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && estado?.movimientos.length === 0 && (
              <tr>
                <td colSpan={7} className="cc-tabla-aviso">
                  Sin movimientos en este período. Cargá el primero en la fila de abajo.
                </td>
              </tr>
            )}
            {estado?.movimientos.map((m) => (
              <tr key={m.id} className={m.anulado ? "cc-anulado" : ""} title={`Cargado por ${m.usuario_nombre}`}>
                <td>{fechaCorta(m.fecha)}</td>
                <td className={Number(m.monto) < 0 && !m.anulado ? "cc-ref-abono" : ""}>
                  {m.descripcion ?? m.tipo}
                  {m.anulado && !m.reverso_de_id && <em> (anulado)</em>}
                  {m.movimiento_caja_id && <span className="cc-chip-caja">caja</span>}
                </td>
                <td className="num">{m.cantidad_base ? <Monto valor={m.cantidad_base} simbolo="" /> : ""}</td>
                <td className="num">{m.tasa ? formatearMonto(m.tasa) : ""}</td>
                <td className="num">
                  <Monto valor={m.monto} simbolo={simbolo} />
                </td>
                <td className="num cc-total">
                  <Monto valor={m.total} simbolo={simbolo} />
                </td>
                <td className="cc-acciones">
                  {puedeAnular && !m.anulado && (
                    <button onClick={() => anular(m.id, m.descripcion ?? m.tipo)} aria-label={`Anular ${m.descripcion ?? m.tipo}`} title="Anular (registra el contrario)">
                      <Undo2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {estado && (
            <tfoot>
              <tr>
                <td colSpan={4}>Sumas del período</td>
                <td className="num">
                  <Monto valor={estado.sumas} simbolo={simbolo} />
                </td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={4}>Abonos del período</td>
                <td className="num">
                  <Monto valor={estado.abonos} simbolo={simbolo} />
                </td>
                <td colSpan={2} />
              </tr>
              <tr className="cc-fila-saldo">
                <td colSpan={5}>Saldo pendiente</td>
                <td className="num">
                  <Monto valor={estado.saldoFinal} simbolo={simbolo} />
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {cuenta.estado === "DISPONIBLE" ? (
        <FilaNueva
          cuenta={cuenta}
          saldo={estado?.cuenta.saldo_actual ?? cuenta.saldo_actual}
          referencias={referencias}
          onGuardado={() => {
            void cargar();
            onActualizar();
          }}
        />
      ) : (
        <p className="cc-tabla-aviso">Esta cuenta está {cuenta.estado.toLowerCase()}: no admite movimientos nuevos.</p>
      )}
    </div>
  );
}

function FilaNueva({
  cuenta,
  saldo,
  referencias,
  onGuardado,
}: {
  cuenta: CuentaCorrienteResumen;
  saldo: string;
  referencias: string[];
  onGuardado: () => void;
}) {
  const [fecha, setFecha] = useState(hoyBogota());
  const [referencia, setReferencia] = useState("");
  const [resta, setResta] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [tasa, setTasa] = useState("");
  const [montoDirecto, setMontoDirecto] = useState("");
  const [masOpciones, setMasOpciones] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<number | "">("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refInput = useRef<HTMLInputElement>(null);
  // Los guardados van en fila, uno detrás de otro: así quedan en el orden en que se cargaron
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const pendientes = useRef(0);
  const decimales = Number(cuenta.moneda_decimales ?? 0);

  useEffect(() => {
    if (masOpciones && cajas.length === 0) getCajas().then(setCajas).catch(() => setCajas([]));
  }, [masOpciones, cajas.length]);

  const nCantidad = cantidad.trim() ? leerNumero(cantidad) : null;
  const nTasa = tasa.trim() ? leerNumero(tasa) : null;
  const nDirecto = montoDirecto.trim() ? leerNumero(montoDirecto) : null;
  const conTasa = tasa.trim() !== "";
  const sinSigno = (v: string) => v.replace(/^-/, "");

  // MONTO: cantidad x tasa, o el monto escrito a mano si no hay tasa (ej. "Abono efectivo")
  let monto: string | null = null;
  if (conTasa) {
    if (nCantidad && nTasa) monto = multiplicarDecimales(sinSigno(nCantidad), nTasa, decimales);
  } else if (nDirecto) {
    monto = sinSigno(nDirecto);
  }
  const montoConSigno = monto && /[1-9]/.test(monto) ? (resta ? `-${monto}` : monto) : null;
  const totalNuevo = montoConSigno ? sumarDecimales(saldo, montoConSigno) : null;
  const simbolo = cuenta.moneda_codigo === "COP" ? "$" : "";

  function alCambiarReferencia(valor: string) {
    setReferencia(valor);
    // "Abono ..." resta, igual que en el Excel donde va en negativo
    if (/^\s*(abono|pago)/i.test(valor)) setResta(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!referencia.trim()) return setError("Escribí la referencia (a quién o qué es).");
    if (cantidad.trim() && !nCantidad) return setError("La cantidad no es un número válido.");
    if (conTasa && !nTasa) return setError("La tasa no es un número válido.");
    if (conTasa && !nCantidad) return setError("Con tasa hace falta la cantidad.");
    if (!montoConSigno) return setError(conTasa ? "El monto da cero: revisá cantidad y tasa." : "Escribí cantidad y tasa, o el monto directo.");
    if (masOpciones && cajaId === "") return setError("Elegí la caja o banco que también se mueve.");

    // La fila se limpia ya, para poder seguir cargando la siguiente sin esperar al servidor.
    // Si el guardado falla, se devuelve lo escrito (salvo que ya se esté escribiendo otra).
    const escrito = { referencia, cantidad, tasa, montoDirecto, resta };
    setReferencia("");
    setCantidad("");
    setTasa("");
    setMontoDirecto("");
    setResta(false);
    refInput.current?.focus();
    const signo = resta ? "-" : "";
    const datos = {
      terceroId: cuenta.tercero_id,
      canalId: cuenta.canal_id,
      monedaId: cuenta.moneda_id,
      tipo: resta ? ("ABONO" as const) : ("CARGO" as const),
      descripcion: referencia.trim(),
      // Hoy va con la hora real; otra fecha, al mediodía de ese día
      fecha: fecha === hoyBogota() ? undefined : `${fecha}T12:00:00-05:00`,
      ...(conTasa ? { cantidadBase: `${signo}${sinSigno(nCantidad!)}`, tasa: nTasa! } : { monto: montoConSigno }),
      cajaId: masOpciones && cajaId !== "" ? cajaId : undefined,
    };
    pendientes.current++;
    setEnviando(true);
    const turno = cola.current.then(() => registrarMovimientoCC(datos));
    cola.current = turno.catch(() => {});
    try {
      await turno;
      onGuardado();
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar el movimiento.";
      setError(`"${escrito.referencia.trim()}" no se guardó: ${mensaje}`);
      if (!refInput.current?.value) {
        setReferencia(escrito.referencia);
        setCantidad(escrito.cantidad);
        setTasa(escrito.tasa);
        setMontoDirecto(escrito.montoDirecto);
        setResta(escrito.resta);
      }
    } finally {
      pendientes.current--;
      if (pendientes.current === 0) setEnviando(false);
    }
  }

  return (
    <form className="cc-nueva" onSubmit={guardar}>
      <div className="cc-nueva-titulo">Nuevo movimiento</div>
      <div className="cc-nueva-campos">
        <label className="cc-c-fecha">
          Fecha
          <input type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="cc-c-ref">
          Referencia
          <input
            ref={refInput}
            list="cc-referencias"
            value={referencia}
            onChange={(e) => alCambiarReferencia(e.target.value)}
            placeholder="Cliente, Venta de bss, Abono dólares…"
            autoComplete="off"
          />
          <datalist id="cc-referencias">
            {referencias.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <div className="cc-c-signo" role="group" aria-label="Suma o abono">
          <button type="button" className={!resta ? "activo suma" : ""} onClick={() => setResta(false)} aria-pressed={!resta}>
            + Suma
          </button>
          <button type="button" className={resta ? "activo resta" : ""} onClick={() => setResta(true)} aria-pressed={resta}>
            − Abono
          </button>
        </div>
        <label className="cc-c-num">
          Cantidad
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="700.000" autoComplete="off" />
          <small>{nCantidad ? formatearMonto(sinSigno(nCantidad)) : " "}</small>
        </label>
        <span className="cc-operador" aria-hidden="true">
          ×
        </span>
        <label className="cc-c-num corto">
          Tasa
          <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" placeholder="3,2" autoComplete="off" />
          <small>{nTasa ? formatearMonto(nTasa) : " "}</small>
        </label>
        <span className="cc-operador" aria-hidden="true">
          =
        </span>
        <label className="cc-c-num monto">
          Monto
          {conTasa ? (
            <output className={`cc-resultado ${resta ? "cc-neg" : ""}`}>{monto ? `${resta ? "- " : ""}${simbolo}${formatearMonto(monto)}` : "—"}</output>
          ) : (
            <input value={montoDirecto} onChange={(e) => setMontoDirecto(e.target.value)} inputMode="decimal" placeholder="sin tasa: monto directo" autoComplete="off" />
          )}
          <small>{!conTasa && nDirecto ? `${resta ? "- " : ""}${simbolo}${formatearMonto(sinSigno(nDirecto))}` : " "}</small>
        </label>
        <button type="submit" className="cc-guardar">
          Agregar
        </button>
      </div>

      <div className="cc-nueva-pie">
        <label className="cc-check">
          <input type="checkbox" checked={masOpciones} onChange={(e) => setMasOpciones(e.target.checked)} />
          También entra o sale de una caja o banco
        </label>
        {masOpciones && (
          <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")} aria-label="Caja o banco">
            <option value="">Elegir caja o banco…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
        {enviando && <span className="cc-guardando">Guardando…</span>}
        {totalNuevo && (
          <span className="cc-total-nuevo">
            El total quedaría en{" "}
            <strong>
              <Monto valor={totalNuevo} simbolo={simbolo} />
            </strong>
          </span>
        )}
      </div>
      {error && <p className="cc-form-error">{error}</p>}
    </form>
  );
}
