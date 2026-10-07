import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Vault } from "lucide-react";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { getCajaFuerte, registrarMovimientoCajaFuerte, type CajaFuerte, type MonedaCajaFuerte, type MovimientoCajaFuerte } from "../../api/cajaFuerte.api";
import { formatearMonto, leerNumero, sumarDecimales } from "../../utils/montos";
import "./cajaFuerte.css";

const MONEDAS: { codigo: MonedaCajaFuerte; nombre: string; corto: string; simbolo: string }[] = [
  { codigo: "USD", nombre: "Dólares", corto: "Dólares", simbolo: "US$" },
  { codigo: "COP", nombre: "Pesos colombianos", corto: "Pesos", simbolo: "$" },
  { codigo: "EUR", nombre: "Euros", corto: "Euros", simbolo: "€" },
];
const TAMANOS = [10, 25, 50];

/** Siempre con puntos de miles y dos decimales: "1500" -> "1.500,00", "16210.5000" -> "16.210,50". */
function montoFijo(valor: string) {
  const [entero = "0", decimal = ""] = valor.trim().split(".");
  return `${formatearMonto(entero)},${`${decimal}00`.slice(0, 2)}`;
}

/**
 * Lo que se va escribiendo en la casilla del monto, con los puntos de miles puestos solos: "1500" -> "1.500".
 * Los decimales van con coma ("1.500,5"); un punto escrito al final también abre los decimales.
 */
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^d.,]/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/D/g, "").replace(/^0+(?=d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/D/g, "").slice(0, 2);
  if (!entero && coma === -1) return "";
  return formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}

function dinero(monto: string, codigo: MonedaCajaFuerte) {
  const m = MONEDAS.find((x) => x.codigo === codigo)!;
  const negativo = monto.startsWith("-");
  return `${negativo ? "− " : ""}${m.simbolo} ${montoFijo(negativo ? monto.slice(1) : monto)}`;
}

function fechaHora(fecha: string) {
  const d = new Date(fecha);
  return {
    dia: d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric" }),
    hora: d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" }),
  };
}

/** Los números de página a mostrar: siempre la primera y la última, y las vecinas de la actual. null = puntos suspensivos. */
function paginasVisibles(actual: number, total: number): (number | null)[] {
  const cerca = new Set([1, total, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= total));
  const lista: (number | null)[] = [];
  let anterior = 0;
  for (const p of [...cerca].sort((a, b) => a - b)) {
    if (p - anterior > 1) lista.push(p - anterior === 2 ? p - 1 : null);
    lista.push(p);
    anterior = p;
  }
  return lista;
}

/**
 * Caja Fuerte: cuánto hay guardado en dólares, pesos y euros, ingresar o egresar dinero con su referencia,
 * y todos los movimientos con cómo quedó cada saldo después de cada uno.
 */
export function CajaFuertePage() {
  const { usuario } = useAuth();
  const puedeMover = usuario?.rol === "ADMIN";
  const [datos, setDatos] = useState<CajaFuerte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [filtroMoneda, setFiltroMoneda] = useState<MonedaCajaFuerte | "">("");
  const [filtroTipo, setFiltroTipo] = useState<"INGRESO" | "EGRESO" | "">("");
  // Saldos por caja: desplegable con todas las cajas; tocar una muestra sus movimientos (null = la Caja Fuerte)
  const [cajasAbierto, setCajasAbierto] = useState(false);
  const [cajaVista, setCajaVista] = useState<number | null>(null);
  // En vivo: la pantalla se refresca sola y los movimientos que van llegando se resaltan
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [llegados, setLlegados] = useState<Set<number>>(new Set());
  const vistos = useRef<{ clave: string; maximo: number } | null>(null);

  // formulario
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [moneda, setMoneda] = useState<MonedaCajaFuerte>("COP");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recienCargado, setRecienCargado] = useState<number | null>(null);
  const refMonto = useRef<HTMLInputElement>(null);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const nuevos = await getCajaFuerte({ pagina, porPagina, moneda: filtroMoneda, tipo: filtroTipo, cajaId: cajaVista });
        // lo que llegó desde la última lectura de esta misma vista se resalta
        const clave = `${cajaVista}|${filtroMoneda}|${filtroTipo}`;
        const maximo = Math.max(0, ...nuevos.movimientos.map((m) => m.id));
        const previo = vistos.current;
        if (silencioso && previo && previo.clave === clave && pagina === 1) {
          const recien = nuevos.movimientos.filter((m) => m.id > previo.maximo).map((m) => m.id);
          if (recien.length) setLlegados(new Set(recien));
        }
        vistos.current = { clave, maximo: Math.max(maximo, previo && previo.clave === clave ? previo.maximo : 0) };
        setDatos(nuevos);
        setActualizado(new Date());
        setError(null);
      } catch (e) {
        // en un refresco silencioso un corte de red no tapa la pantalla: se reintenta solo
        if (!silencioso) setError(e instanceof ApiError ? e.message : "No se pudo cargar la Caja Fuerte.");
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [pagina, porPagina, filtroMoneda, filtroTipo, cajaVista]
  );
  useEffect(() => {
    void cargar();
    // tiempo real: se vuelve a leer cada pocos segundos (y al volver a la pestaña)
    const reloj = setInterval(() => document.visibilityState === "visible" && void cargar(true), 6000);
    const alVolver = () => document.visibilityState === "visible" && void cargar(true);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  function verCaja(id: number | null) {
    setCajaVista(id);
    setPagina(1);
  }
  const totalDe = (campo: "usd" | "cop" | "eur") => (datos?.cajas ?? []).reduce((suma, c) => sumarDecimales(suma, c[campo]), "0");
  const viendoOtra = !!datos && datos.cajaMovimientos.id !== datos.caja.id;

  const saldoDe = (codigo: MonedaCajaFuerte) => datos?.saldos.find((s) => s.codigo === codigo);
  const nMonto = monto.trim() ? (leerNumero(monto)?.replace(/^-/, "") ?? null) : null;
  const montoValido = !!nMonto && /[1-9]/.test(nMonto);
  const saldoActual = saldoDe(moneda)?.monto ?? "0";
  const quedaria = montoValido ? sumarDecimales(saldoActual, `${tipo === "EGRESO" ? "-" : ""}${nMonto}`) : null;
  const noAlcanza = !!quedaria && quedaria.startsWith("-");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setErrorForm(null);
    if (!montoValido) return setErrorForm("Escribí el monto.");
    if (concepto.trim().length < 3) return setErrorForm("Escribí la referencia: de dónde viene o a dónde va el dinero.");
    if (noAlcanza) return setErrorForm(`La Caja Fuerte no tiene tanto en ${MONEDAS.find((m) => m.codigo === moneda)!.corto.toLowerCase()}.`);
    if (!window.confirm(`¿${tipo === "INGRESO" ? "Ingresar" : "Egresar"} ${dinero(nMonto!, moneda)} ${tipo === "INGRESO" ? "a" : "de"} la Caja Fuerte?\n\n${concepto.trim()}`)) return;
    setEnviando(true);
    try {
      const nueva = await registrarMovimientoCajaFuerte({ tipo, monedaCodigo: moneda, monto: nMonto!, concepto: concepto.trim(), porPagina });
      // se vuelve a la primera página sin filtros, donde el movimiento nuevo queda arriba y resaltado
      setFiltroMoneda("");
      setFiltroTipo("");
      setPagina(1);
      setCajaVista(null);
      setDatos(nueva);
      setRecienCargado(nueva.movimientos[0]?.id ?? null);
      setMonto("");
      setConcepto("");
      refMonto.current?.focus();
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : "No se pudo registrar el movimiento.");
    } finally {
      setEnviando(false);
    }
  }

  const pag = datos?.paginacion;
  const desde = pag && pag.total > 0 ? (pag.pagina - 1) * pag.porPagina + 1 : 0;
  const hasta = pag ? Math.min(pag.total, pag.pagina * pag.porPagina) : 0;
  const irA = (p: number) => pag && setPagina(Math.min(pag.paginas, Math.max(1, p)));

  // cada celda de saldo: resaltada si fue la moneda que se movió
  const celdaSaldo = (m: MovimientoCajaFuerte, codigo: MonedaCajaFuerte, valor: string | null) => (
    <td className={`cf-num ${m.codigo === codigo ? `cf-movida ${m.tipo === "INGRESO" ? "sube" : "baja"}` : ""}`}>
      {valor === null ? <span className="cf-vacio">—</span> : dinero(valor, codigo)}
      {m.codigo === codigo && (
        <small>
          {m.tipo === "INGRESO" ? "+" : "−"} {montoFijo(m.monto)}
        </small>
      )}
    </td>
  );

  return (
    <div className="cf-page">
      <Header />

      <header className="cf-hero">
        <div className="cf-hero-titulo">
          <span className="cf-hero-icono">
            <Vault size={26} />
          </span>
          <div>
            <h1>Caja Fuerte</h1>
            <p>Lo guardado en dólares, pesos y euros, y cada movimiento que entra o sale.</p>
          </div>
        </div>
        <div className="cf-saldos">
          {MONEDAS.map((m) => {
            const s = saldoDe(m.codigo);
            return (
              <article key={m.codigo} className={`cf-saldo cf-${m.codigo.toLowerCase()}`}>
                <span className="cf-saldo-etiqueta">Saldo en {m.nombre.toLowerCase()}</span>
                <strong>{s ? dinero(s.monto, m.codigo) : "…"}</strong>
                <span className="cf-saldo-hoy">
                  <span className="sube">
                    <ArrowDownToLine size={13} /> Hoy entró {s ? montoFijo(s.entroHoy) : "0,00"}
                  </span>
                  <span className="baja">
                    <ArrowUpFromLine size={13} /> salió {s ? montoFijo(s.salioHoy) : "0,00"}
                  </span>
                </span>
              </article>
            );
          })}
        </div>

        {/* Los mismos saldos, caja por caja */}
        <div className={`cf-cajas ${cajasAbierto ? "abierto" : ""}`}>
          <button type="button" className="cf-cajas-boton" onClick={() => setCajasAbierto((a) => !a)} aria-expanded={cajasAbierto}>
            <span>
              <ChevronDown size={17} /> Saldos por caja {datos && <b>{datos.cajas.length}</b>}
            </span>
            <span className="cf-vivo" title="Se actualiza solo cada pocos segundos">
              <i /> En vivo{actualizado ? ` · ${actualizado.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}
            </span>
          </button>
          {cajasAbierto && datos && (
            <div className="cf-cajas-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Saldo en dólares</th>
                    <th>Saldo en pesos colombianos</th>
                    <th>Saldo en euros</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.cajas.map((c) => (
                    <tr
                      key={c.id}
                      className={c.id === datos.cajaMovimientos.id ? "elegida" : ""}
                      onClick={() => verCaja(c.esFuerte ? null : c.id)}
                      title={`Ver los movimientos de ${c.nombre}`}
                    >
                      <td>
                        {c.nombre}
                        {c.esFuerte && <em>esta caja</em>}
                        {c.tipo === "BANCO" && <em>banco</em>}
                      </td>
                      <td>{dinero(c.usd, "USD")}</td>
                      <td>{dinero(c.cop, "COP")}</td>
                      <td>{dinero(c.eur, "EUR")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total en todas las cajas</td>
                    <td>{dinero(totalDe("usd"), "USD")}</td>
                    <td>{dinero(totalDe("cop"), "COP")}</td>
                    <td>{dinero(totalDe("eur"), "EUR")}</td>
                  </tr>
                </tfoot>
              </table>
              <p>Tocá una caja para ver sus movimientos abajo.</p>
            </div>
          )}
        </div>
      </header>

      {error && <p className="cf-error">{error}</p>}

      <div className="cf-cuerpo">
        {puedeMover && (
          <form className={`cf-form ${tipo === "EGRESO" ? "egreso" : "ingreso"}`} onSubmit={guardar}>
            <h2>Nuevo movimiento</h2>
            <div className="cf-tipo" role="group" aria-label="Ingreso o egreso">
              <button type="button" className={tipo === "INGRESO" ? "activo ingreso" : ""} onClick={() => setTipo("INGRESO")} aria-pressed={tipo === "INGRESO"}>
                <ArrowDownToLine size={17} /> Ingreso
              </button>
              <button type="button" className={tipo === "EGRESO" ? "activo egreso" : ""} onClick={() => setTipo("EGRESO")} aria-pressed={tipo === "EGRESO"}>
                <ArrowUpFromLine size={17} /> Egreso
              </button>
            </div>

            <span className="cf-etiqueta">Moneda</span>
            <div className="cf-monedas" role="group" aria-label="Moneda">
              {MONEDAS.map((m) => (
                <button key={m.codigo} type="button" className={moneda === m.codigo ? "activo" : ""} onClick={() => setMoneda(m.codigo)} aria-pressed={moneda === m.codigo}>
                  <b>{m.simbolo}</b> {m.corto}
                </button>
              ))}
            </div>

            <label className="cf-monto">
              <span className="cf-etiqueta">Monto</span>
              <span className="cf-monto-caja">
                <span>{MONEDAS.find((m) => m.codigo === moneda)!.simbolo}</span>
                <input
                  ref={refMonto}
                  value={monto}
                  onChange={(e) => setMonto(conPuntos(e.target.value))}
                  // al salir de la casilla queda completo: 1.500 -> 1.500,00
                  onBlur={() => nMonto && /[1-9]/.test(nMonto) && setMonto(montoFijo(nMonto))}
                  inputMode="decimal"
                  placeholder="0,00"
                  autoComplete="off"
                  aria-label="Monto"
                />
              </span>
            </label>

            <label>
              <span className="cf-etiqueta">Referencia</span>
              <textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} rows={2} maxLength={300} placeholder={tipo === "INGRESO" ? "De dónde viene: ej. capital, cobro a proveedor…" : "A dónde va: ej. pago a proveedor, retiro…"} />
            </label>

            <div className={`cf-vista ${noAlcanza ? "mal" : ""}`}>
              <span>
                Hay <b>{dinero(saldoActual, moneda)}</b>
              </span>
              <span>
                {quedaria ? (
                  noAlcanza ? (
                    <b>No alcanza para ese egreso</b>
                  ) : (
                    <>
                      Quedará en <b>{dinero(quedaria, moneda)}</b>
                    </>
                  )
                ) : (
                  "Escribí el monto para ver cómo queda"
                )}
              </span>
            </div>

            {errorForm && <p className="cf-error-form">{errorForm}</p>}
            <button type="submit" className="cf-guardar" disabled={enviando || !datos}>
              {enviando ? "Registrando…" : tipo === "INGRESO" ? "Registrar ingreso" : "Registrar egreso"}
            </button>
          </form>
        )}

        <section className="cf-movimientos" aria-label="Movimientos de la Caja Fuerte">
          <div className="cf-mov-cabeza">
            <h2>
              Movimientos{viendoOtra ? ` de ${datos!.cajaMovimientos.nombre}` : ""} {pag && <span>{pag.total}</span>}
              {viendoOtra && (
                <button type="button" className="cf-volver" onClick={() => verCaja(null)}>
                  Volver a Caja Fuerte
                </button>
              )}
            </h2>
            <div className="cf-filtros">
              <select
                value={filtroMoneda}
                onChange={(e) => {
                  setFiltroMoneda(e.target.value as MonedaCajaFuerte | "");
                  setPagina(1);
                }}
                aria-label="Filtrar por moneda"
              >
                <option value="">Todas las monedas</option>
                {MONEDAS.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <select
                value={filtroTipo}
                onChange={(e) => {
                  setFiltroTipo(e.target.value as "INGRESO" | "EGRESO" | "");
                  setPagina(1);
                }}
                aria-label="Filtrar por tipo"
              >
                <option value="">Ingresos y egresos</option>
                <option value="INGRESO">Solo ingresos</option>
                <option value="EGRESO">Solo egresos</option>
              </select>
            </div>
          </div>

          <div className={`cf-tabla-marco ${cargando ? "cargando" : ""}`}>
            <table className="cf-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Referencia</th>
                  <th className="cf-num">Saldo en dólares</th>
                  <th className="cf-num">Saldo en pesos colombianos</th>
                  <th className="cf-num">Saldo en euros</th>
                </tr>
              </thead>
              <tbody>
                {(datos?.movimientos ?? []).map((m) => {
                  const f = fechaHora(m.fecha);
                  return (
                    <tr key={m.id} className={m.id === recienCargado || llegados.has(m.id) ? "cf-nuevo" : ""}>
                      <td className="cf-fecha">
                        {f.dia}
                        <small>{f.hora}</small>
                      </td>
                      <td className="cf-concepto">
                        <span className={`cf-chip ${m.tipo === "INGRESO" ? "sube" : "baja"}`}>
                          {m.tipo === "INGRESO" ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                          {m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                        </span>
                        <span className="cf-concepto-texto">{m.concepto}</span>
                        <small>{m.usuario}</small>
                      </td>
                      {celdaSaldo(m, "USD", m.saldoUsd)}
                      {celdaSaldo(m, "COP", m.saldoCop)}
                      {celdaSaldo(m, "EUR", m.saldoEur)}
                    </tr>
                  );
                })}
                {datos && datos.movimientos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="cf-sin-datos">
                      {filtroMoneda || filtroTipo ? "Ningún movimiento coincide con el filtro." : `Todavía no hay movimientos en ${datos.cajaMovimientos.nombre}.`}
                    </td>
                  </tr>
                )}
                {!datos && !error && (
                  <tr>
                    <td colSpan={5} className="cf-sin-datos">
                      Cargando…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pag && pag.total > 0 && (
            <nav className="cf-paginacion" aria-label="Paginación de movimientos">
              <span className="cf-pag-resumen">
                Mostrando <b>{desde}</b>–<b>{hasta}</b> de <b>{pag.total}</b>
              </span>
              <div className="cf-pag-botones">
                <button onClick={() => irA(1)} disabled={pag.pagina === 1} aria-label="Primera página" title="Primera página">
                  <ChevronsLeft size={16} />
                </button>
                <button onClick={() => irA(pag.pagina - 1)} disabled={pag.pagina === 1} aria-label="Página anterior" title="Anterior">
                  <ChevronLeft size={16} />
                </button>
                {paginasVisibles(pag.pagina, pag.paginas).map((p, i) =>
                  p === null ? (
                    <span key={`puntos-${i}`} className="cf-pag-puntos">
                      …
                    </span>
                  ) : (
                    <button key={p} className={p === pag.pagina ? "activo" : ""} onClick={() => irA(p)} aria-current={p === pag.pagina ? "page" : undefined}>
                      {p}
                    </button>
                  )
                )}
                <button onClick={() => irA(pag.pagina + 1)} disabled={pag.pagina === pag.paginas} aria-label="Página siguiente" title="Siguiente">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => irA(pag.paginas)} disabled={pag.pagina === pag.paginas} aria-label="Última página" title="Última página">
                  <ChevronsRight size={16} />
                </button>
              </div>
              <label className="cf-pag-tamano">
                Por página
                <select
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value));
                    setPagina(1);
                  }}
                >
                  {TAMANOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
