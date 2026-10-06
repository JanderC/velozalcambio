import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Vault } from "lucide-react";
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

function dinero(monto: string, codigo: MonedaCajaFuerte) {
  const m = MONEDAS.find((x) => x.codigo === codigo)!;
  const negativo = monto.startsWith("-");
  return `${negativo ? "− " : ""}${m.simbolo} ${formatearMonto(negativo ? monto.slice(1) : monto)}`;
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
 * Caja Fuerte: cuánto hay guardado en dólares, pesos y euros, ingresar o egresar dinero con su concepto,
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

  // formulario
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [moneda, setMoneda] = useState<MonedaCajaFuerte>("COP");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recienCargado, setRecienCargado] = useState<number | null>(null);
  const refMonto = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await getCajaFuerte({ pagina, porPagina, moneda: filtroMoneda, tipo: filtroTipo }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la Caja Fuerte.");
    } finally {
      setCargando(false);
    }
  }, [pagina, porPagina, filtroMoneda, filtroTipo]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

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
    if (concepto.trim().length < 3) return setErrorForm("Escribí el concepto: de dónde viene o a dónde va el dinero.");
    if (noAlcanza) return setErrorForm(`La Caja Fuerte no tiene tanto en ${MONEDAS.find((m) => m.codigo === moneda)!.corto.toLowerCase()}.`);
    if (!window.confirm(`¿${tipo === "INGRESO" ? "Ingresar" : "Egresar"} ${dinero(nMonto!, moneda)} ${tipo === "INGRESO" ? "a" : "de"} la Caja Fuerte?\n\n${concepto.trim()}`)) return;
    setEnviando(true);
    try {
      const nueva = await registrarMovimientoCajaFuerte({ tipo, monedaCodigo: moneda, monto: nMonto!, concepto: concepto.trim(), porPagina });
      // se vuelve a la primera página sin filtros, donde el movimiento nuevo queda arriba y resaltado
      setFiltroMoneda("");
      setFiltroTipo("");
      setPagina(1);
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
          {m.tipo === "INGRESO" ? "+" : "−"} {formatearMonto(m.monto)}
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
                    <ArrowDownToLine size={13} /> Hoy entró {s ? formatearMonto(s.entroHoy) : "0"}
                  </span>
                  <span className="baja">
                    <ArrowUpFromLine size={13} /> salió {s ? formatearMonto(s.salioHoy) : "0"}
                  </span>
                </span>
              </article>
            );
          })}
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
                <input ref={refMonto} value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" autoComplete="off" aria-label="Monto" />
              </span>
            </label>

            <label>
              <span className="cf-etiqueta">Concepto</span>
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
              Movimientos {pag && <span>{pag.total}</span>}
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
                  <th>Concepto</th>
                  <th className="cf-num">Saldo en dólares</th>
                  <th className="cf-num">Saldo en pesos colombianos</th>
                  <th className="cf-num">Saldo en euros</th>
                </tr>
              </thead>
              <tbody>
                {(datos?.movimientos ?? []).map((m) => {
                  const f = fechaHora(m.fecha);
                  return (
                    <tr key={m.id} className={m.id === recienCargado ? "cf-nuevo" : ""}>
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
                      {filtroMoneda || filtroTipo ? "Ningún movimiento coincide con el filtro." : "Todavía no hay movimientos en la Caja Fuerte."}
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
