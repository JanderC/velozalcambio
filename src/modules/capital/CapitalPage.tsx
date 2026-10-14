import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, History, Landmark, Plus, Save, X } from "lucide-react";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { capitalApi, type CuadreResumen, type DatosDelSistema } from "../../api/capital.api";
import { getCuentasCorrientes, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, leerNumero } from "../../utils/montos";
import { enPesos, grupoDe, gruposDe, mismoGrupo } from "../cuentasPorCobrarPagar/cobrar";
import "./capital.css";

/*
 * Capital de giros: el cuadre de todo el negocio, con el mismo formato del Excel.
 *   Lo que el sistema ya sabe sale solo: por cobrar por grupo (Cuentas por Cobrar), lo que se le debe a esos clientes,
 *   los pesos, dólares y euros de las taquillas y la Caja Fuerte, y las confirmaciones sin pagar.
 *   Lo que está fuera del sistema se llena a mano: bancos y personas en bolívares y en pesos, cobros y deudas fuera del
 *   sistema, dólares por pagar y las tasas.
 * Da el capital en pesos y el capital en divisas, y cada cuadre queda guardado con fecha y quién lo hizo.
 */

interface Fila {
  nombre: string;
  monto: string; // como se escribe: "1.500.000"
}
interface FilaDivisa {
  nombre: string;
  cantidad: string; // dólares
  tasa: string; // vacía: la tasa del dólar de arriba
}
interface Manual {
  tasaDolar: string;
  tasaEuro: string;
  tasaBolivar: string; // pesos por bolívar
  tasasCaja: Record<string, string>; // tasa propia de una caja (vacía: la general)
  cobrarFuera: Fila[];
  pagarFuera: Fila[];
  bolivares: Fila[];
  pesos: Fila[];
  dolaresFuera: FilaDivisa[]; // dólares que no están en las cajas del sistema
  dolaresPorPagar: FilaDivisa[];
  restarConfirmaciones: boolean;
}
// lo que el sistema traía, guardado con el cuadre para verlo después tal cual
interface Foto {
  porCobrar: { grupo: string; total: number; clientes: number }[];
  porPagarCuentas: { nombre: string; monto: number }[];
  cajas: DatosDelSistema["cajas"];
  confirmaciones: DatosDelSistema["confirmacionesPorPagar"];
}

const filaVacia = (): Fila => ({ nombre: "", monto: "" });
const divisaVacia = (): FilaDivisa => ({ nombre: "", cantidad: "", tasa: "" });
const MANUAL_INICIAL: Manual = {
  tasaDolar: "",
  tasaEuro: "",
  tasaBolivar: "",
  tasasCaja: {},
  cobrarFuera: [filaVacia()],
  pagarFuera: [filaVacia()],
  bolivares: [filaVacia()],
  pesos: [filaVacia()],
  dolaresFuera: [divisaVacia()],
  dolaresPorPagar: [divisaVacia()],
  restarConfirmaciones: false,
};

const num = (texto: string | undefined) => {
  const n = texto && texto.trim() ? leerNumero(texto) : null;
  return n ? Number(n) : 0;
};
/** 1234567.4 -> "$1.234.567" · con decimales -> "1.234,56". */
const pesos = (n: number) => `${n < 0 ? "−" : ""}$${formatearMonto(String(Math.round(Math.abs(n))))}`;
const conDecimales = (n: number) => `${n < 0 ? "−" : ""}${formatearMonto(Math.abs(n).toFixed(2))}`;
/** Lo que se va escribiendo, con los puntos de miles puestos solos y decimales con coma. */
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,-]/g, "");
  const negativo = t.startsWith("-");
  t = t.replace(/-/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return negativo ? "-" : "";
  return (negativo ? "-" : "") + formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}
const fechaHora = (f: string) => new Date(f).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });

export function CapitalPage() {
  const [sistema, setSistema] = useState<DatosDelSistema | null>(null);
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[] | null>(null);
  const [cuadres, setCuadres] = useState<CuadreResumen[]>([]);
  const [manual, setManual] = useState<Manual>(MANUAL_INICIAL);
  // viendo un cuadre guardado: todo de solo lectura, con lo que el sistema traía ese día
  const [viendo, setViendo] = useState<{ id: number; fecha: string; usuario: string; nota: string | null; foto: Foto } | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [s, c, lista] = await Promise.all([capitalApi.sistema(), getCuentasCorrientes({ vista: "cobrar" }), capitalApi.cuadres()]);
      setSistema(s);
      setCuentas(c);
      setCuadres(lista);
      return lista;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el capital.");
      return [];
    }
  }, []);

  // Al entrar, lo que se llenó a mano en el último cuadre viene puesto: se corrige solo lo que cambió
  useEffect(() => {
    void cargar().then(async (lista) => {
      const ultimo = lista[0];
      if (!ultimo) return;
      try {
        const c = await capitalApi.cuadre(ultimo.id);
        const m = (c.datos as { manual?: Manual }).manual;
        if (m) setManual({ ...MANUAL_INICIAL, ...m });
      } catch {
        // sin el último cuadre se empieza vacío
      }
    });
  }, [cargar]);

  // ---------- Lo que trae el sistema ----------
  const fotoActual: Foto | null = useMemo(() => {
    if (!sistema || !cuentas) return null;
    const grupos = gruposDe(cuentas);
    const porCobrar = grupos
      .map((g) => {
        const delGrupo = cuentas.filter((c) => mismoGrupo(grupoDe(c), g) && !c.saldo_actual.startsWith("-") && /[1-9]/.test(c.saldo_actual));
        return { grupo: g, total: delGrupo.reduce((s, c) => s + Number(enPesos(c) ?? 0), 0), clientes: delGrupo.length };
      })
      .filter((g) => g.clientes > 0);
    const porPagarCuentas = cuentas
      .filter((c) => c.saldo_actual.startsWith("-") && /[1-9]/.test(c.saldo_actual))
      .map((c) => ({ nombre: c.tercero_nombre, monto: Math.abs(Number(enPesos(c) ?? 0)) }));
    return { porCobrar, porPagarCuentas, cajas: sistema.cajas, confirmaciones: sistema.confirmacionesPorPagar };
  }, [sistema, cuentas]);
  const foto = viendo?.foto ?? fotoActual;
  const soloLectura = !!viendo;

  // ---------- Las cuentas ----------
  const t = useMemo(() => {
    if (!foto) return null;
    const m = manual;
    const tasaDolar = num(m.tasaDolar);
    const tasaEuro = num(m.tasaEuro);
    const tasaBs = num(m.tasaBolivar);
    const suma = (filas: Fila[]) => filas.reduce((s, f) => s + num(f.monto), 0);
    const porCobrar = foto.porCobrar.reduce((s, g) => s + g.total, 0);
    const cobrarFuera = suma(m.cobrarFuera);
    const porPagarCuentas = foto.porPagarCuentas.reduce((s, c) => s + c.monto, 0);
    const pagarFuera = suma(m.pagarFuera);
    const bolivares = suma(m.bolivares);
    const bolivaresCop = bolivares * tasaBs;
    const pesosCajas = foto.cajas.flatMap((c) => c.saldos.filter((x) => x.codigo === "COP").map((x) => Number(x.monto))).reduce((s, v) => s + v, 0);
    const pesosManual = suma(m.pesos);
    // dólares y euros de las cajas, cada caja con su tasa (o la general)
    const divisasCajas = foto.cajas.flatMap((c) =>
      c.saldos
        .filter((x) => x.codigo === "USD" || x.codigo === "EUR")
        .map((x) => {
          const clave = `${c.id}-${x.codigo}`;
          const tasa = num(m.tasasCaja[clave]) || (x.codigo === "EUR" ? tasaEuro : tasaDolar);
          return { clave, nombre: c.nombre, codigo: x.codigo, cantidad: Number(x.monto), tasa, pesos: Number(x.monto) * tasa };
        })
    );
    const divisasFuera = m.dolaresFuera.map((f) => ({ cantidad: num(f.cantidad), tasa: num(f.tasa) || tasaDolar })).map((f) => ({ ...f, pesos: f.cantidad * f.tasa }));
    const porPagarUsd = m.dolaresPorPagar.map((f) => ({ cantidad: num(f.cantidad), tasa: num(f.tasa) || tasaDolar })).map((f) => ({ ...f, pesos: f.cantidad * f.tasa }));
    const conf = (codigo: string) => Number(foto.confirmaciones.find((c) => c.codigo === codigo)?.total ?? 0);
    const confCop = conf("COP");
    const confVes = conf("VES");
    const confUsd = conf("USD") + conf("USDT");
    const restar = m.restarConfirmaciones;

    const usdEnCaja = divisasCajas.filter((d) => d.codigo === "USD").reduce((s, d) => s + d.cantidad, 0) + divisasFuera.reduce((s, d) => s + d.cantidad, 0);
    const eurEnCaja = divisasCajas.filter((d) => d.codigo === "EUR").reduce((s, d) => s + d.cantidad, 0);
    const divisasCop = divisasCajas.reduce((s, d) => s + d.pesos, 0) + divisasFuera.reduce((s, d) => s + d.pesos, 0);
    const usdPorPagar = porPagarUsd.reduce((s, d) => s + d.cantidad, 0) + (restar ? confUsd : 0);
    const usdPorPagarCop = porPagarUsd.reduce((s, d) => s + d.pesos, 0) + (restar ? confUsd * tasaDolar : 0);

    const capitalCop = porCobrar + cobrarFuera - porPagarCuentas - pagarFuera + bolivaresCop + pesosCajas + pesosManual - (restar ? confCop + confVes * tasaBs : 0);
    const capitalDivisa = usdEnCaja - usdPorPagar;
    const capitalDivisaCop = divisasCop - usdPorPagarCop;
    return {
      tasaDolar,
      tasaBs,
      porCobrar,
      cobrarFuera,
      porPagarCuentas,
      pagarFuera,
      bolivares,
      bolivaresCop,
      pesosCajas,
      pesosManual,
      divisasCajas,
      divisasFuera,
      porPagarUsd,
      confCop,
      confVes,
      confUsd,
      usdEnCaja,
      eurEnCaja,
      divisasCop,
      usdPorPagar,
      usdPorPagarCop,
      capitalCop,
      capitalDivisa,
      capitalDivisaCop,
    };
  }, [foto, manual]);

  // ---------- Editar lo manual ----------
  const cambiar = <K extends keyof Manual>(clave: K, valor: Manual[K]) => setManual((m) => ({ ...m, [clave]: valor }));
  type ListaFilas = "cobrarFuera" | "pagarFuera" | "bolivares" | "pesos";
  type ListaDivisas = "dolaresFuera" | "dolaresPorPagar";
  const cambiarFila = (lista: ListaFilas, i: number, cambio: Partial<Fila>) => cambiar(lista, manual[lista].map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const cambiarDivisa = (lista: ListaDivisas, i: number, cambio: Partial<FilaDivisa>) => cambiar(lista, manual[lista].map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const quitar = (lista: ListaFilas | ListaDivisas, i: number) => {
    const nueva = (manual[lista] as unknown[]).filter((_, j) => j !== i);
    cambiar(lista, (nueva.length ? nueva : [lista === "dolaresFuera" || lista === "dolaresPorPagar" ? divisaVacia() : filaVacia()]) as never);
  };

  async function guardar() {
    if (!t || !fotoActual) return;
    if (!t.tasaDolar) return setError("Escribí la tasa del dólar antes de guardar el cuadre.");
    setGuardando(true);
    setError(null);
    try {
      // las filas vacías no se guardan
      const limpio: Manual = {
        ...manual,
        cobrarFuera: manual.cobrarFuera.filter((f) => f.nombre.trim() || f.monto.trim()),
        pagarFuera: manual.pagarFuera.filter((f) => f.nombre.trim() || f.monto.trim()),
        bolivares: manual.bolivares.filter((f) => f.nombre.trim() || f.monto.trim()),
        pesos: manual.pesos.filter((f) => f.nombre.trim() || f.monto.trim()),
        dolaresFuera: manual.dolaresFuera.filter((f) => f.nombre.trim() || f.cantidad.trim()),
        dolaresPorPagar: manual.dolaresPorPagar.filter((f) => f.nombre.trim() || f.cantidad.trim()),
      };
      await capitalApi.guardar({
        datos: { manual: limpio, sistema: fotoActual },
        capitalCop: Math.round(t.capitalCop * 100) / 100,
        capitalDivisa: Math.round(t.capitalDivisa * 100) / 100,
        capitalDivisaCop: Math.round(t.capitalDivisaCop * 100) / 100,
        nota: nota.trim() || undefined,
      });
      setNota("");
      setAviso(`Cuadre guardado: capital ${pesos(t.capitalCop)} en pesos y ${conDecimales(t.capitalDivisa)} USD en divisas.`);
      setTimeout(() => setAviso(null), 7000);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el cuadre.");
    } finally {
      setGuardando(false);
    }
  }

  async function ver(c: CuadreResumen) {
    try {
      const completo = await capitalApi.cuadre(c.id);
      const d = completo.datos as { manual?: Manual; sistema?: Foto };
      if (!d.manual || !d.sistema) return setError("Ese cuadre no tiene el detalle guardado.");
      setManual({ ...MANUAL_INICIAL, ...d.manual });
      setViendo({ id: c.id, fecha: c.created_at, usuario: c.usuario_nombre, nota: c.nota, foto: d.sistema });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo abrir ese cuadre.");
    }
  }
  async function volverAlActual() {
    setViendo(null);
    // vuelve con lo manual del último cuadre, para seguir desde ahí
    const ultimo = cuadres[0];
    if (!ultimo) return setManual(MANUAL_INICIAL);
    const c = await capitalApi.cuadre(ultimo.id).catch(() => null);
    const m = (c?.datos as { manual?: Manual } | undefined)?.manual;
    setManual(m ? { ...MANUAL_INICIAL, ...m } : MANUAL_INICIAL);
  }

  // ---------- Piezas de la hoja ----------
  const tablaFilas = (lista: ListaFilas, etiquetaNombre: string, etiquetaMonto: string, decimales = false) => (
    <>
      {manual[lista].map((f, i) => (
        <tr key={i}>
          <td>
            <input value={f.nombre} onChange={(e) => cambiarFila(lista, i, { nombre: e.target.value })} placeholder={etiquetaNombre} disabled={soloLectura} aria-label={etiquetaNombre} />
          </td>
          <td className="num">
            <input value={f.monto} onChange={(e) => cambiarFila(lista, i, { monto: conPuntos(e.target.value) })} inputMode="decimal" placeholder="0" disabled={soloLectura} aria-label={etiquetaMonto} />
          </td>
          <td className="cap-quitar">
            {!soloLectura && (
              <button type="button" onClick={() => quitar(lista, i)} aria-label="Quitar esta fila" title="Quitar">
                <X size={13} />
              </button>
            )}
          </td>
        </tr>
      ))}
      {!soloLectura && (
        <tr className="cap-agregar">
          <td colSpan={3}>
            <button type="button" onClick={() => cambiar(lista, [...manual[lista], filaVacia()])}>
              <Plus size={13} /> Agregar {decimales ? "banco o persona" : "fila"}
            </button>
          </td>
        </tr>
      )}
    </>
  );

  const tablaDivisas = (lista: ListaDivisas, etiqueta: string) => (
    <>
      {manual[lista].map((f, i) => {
        const cantidad = num(f.cantidad);
        const tasa = num(f.tasa) || (t?.tasaDolar ?? 0);
        return (
          <tr key={i}>
            <td>
              <input value={f.nombre} onChange={(e) => cambiarDivisa(lista, i, { nombre: e.target.value })} placeholder={etiqueta} disabled={soloLectura} aria-label={etiqueta} />
            </td>
            <td className="num">
              <input value={f.cantidad} onChange={(e) => cambiarDivisa(lista, i, { cantidad: conPuntos(e.target.value) })} inputMode="decimal" placeholder="$ 0" disabled={soloLectura} aria-label="Dólares" />
            </td>
            <td className="num">
              <input value={f.tasa} onChange={(e) => cambiarDivisa(lista, i, { tasa: conPuntos(e.target.value) })} inputMode="decimal" placeholder={t?.tasaDolar ? formatearMonto(String(t.tasaDolar)) : "tasa"} disabled={soloLectura} aria-label="Tasa" />
            </td>
            <td className="num cap-calculado">{cantidad ? pesos(cantidad * tasa) : "—"}</td>
            <td className="cap-quitar">
              {!soloLectura && (
                <button type="button" onClick={() => quitar(lista, i)} aria-label="Quitar esta fila" title="Quitar">
                  <X size={13} />
                </button>
              )}
            </td>
          </tr>
        );
      })}
      {!soloLectura && (
        <tr className="cap-agregar">
          <td colSpan={5}>
            <button type="button" onClick={() => cambiar(lista, [...manual[lista], divisaVacia()])}>
              <Plus size={13} /> Agregar fila
            </button>
          </td>
        </tr>
      )}
    </>
  );

  return (
    <div className="cap-page">
      <Header />
      <div className="cap-barra">
        <Link to="/cuentas-por-cobrar-pagar" className="cap-volver">
          <ArrowLeft size={16} /> Cuentas por Cobrar
        </Link>
      </div>

      <header className="cap-hero">
        <div className="cap-hero-titulo">
          <span className="cap-hero-icono">
            <Landmark size={26} />
          </span>
          <div>
            <h1>Capital de giros</h1>
            <p>{viendo ? `Cuadre guardado el ${fechaHora(viendo.fecha)} por ${viendo.usuario}${viendo.nota ? ` · ${viendo.nota}` : ""}` : "Lo del sistema sale solo; lo de afuera se llena a mano. Cada cuadre queda guardado."}</p>
          </div>
        </div>
        <div className="cap-tasas">
          <label>
            Tasa dólar
            <input value={manual.tasaDolar} onChange={(e) => cambiar("tasaDolar", conPuntos(e.target.value))} inputMode="decimal" placeholder="3.340" disabled={soloLectura} />
          </label>
          <label>
            Tasa euro
            <input value={manual.tasaEuro} onChange={(e) => cambiar("tasaEuro", conPuntos(e.target.value))} inputMode="decimal" placeholder="3.900" disabled={soloLectura} />
          </label>
          <label>
            Pesos por bolívar
            <input value={manual.tasaBolivar} onChange={(e) => cambiar("tasaBolivar", conPuntos(e.target.value))} inputMode="decimal" placeholder="3,30" disabled={soloLectura} />
          </label>
        </div>
      </header>

      {error && (
        <p className="cap-error" role="alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X size={14} />
          </button>
        </p>
      )}
      {aviso && (
        <p className="cap-ok" role="status">
          {aviso}
        </p>
      )}
      {viendo && (
        <p className="cap-viendo">
          Estás viendo un cuadre anterior (solo lectura).
          <button type="button" onClick={() => void volverAlActual()}>
            Volver al cuadre de hoy
          </button>
        </p>
      )}

      {!t || !foto ? (
        <p className="cap-cargando">Cargando el capital…</p>
      ) : (
        <div className="cap-hoja">
          {/* ---------- Por cobrar ---------- */}
          <section className="cap-bloque azul">
            <h2>Por cobrar</h2>
            <table>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {foto.porCobrar.map((g) => (
                  <tr key={g.grupo}>
                    <td>
                      {g.grupo} <small>({g.clientes})</small>
                    </td>
                    <td className="num">{pesos(g.total)}</td>
                  </tr>
                ))}
                {foto.porCobrar.length === 0 && (
                  <tr>
                    <td colSpan={2} className="cap-vacio">
                      Nadie debe en Cuentas por Cobrar.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total (del sistema)</td>
                  <td className="num">{pesos(t.porCobrar)}</td>
                </tr>
              </tfoot>
            </table>
            <h3>Por cobrar fuera del sistema</h3>
            <table>
              <tbody>{tablaFilas("cobrarFuera", "Nombre (ej. Kilbet 130$)", "Monto en pesos")}</tbody>
              <tfoot>
                <tr>
                  <td>Total fuera del sistema</td>
                  <td className="num">{pesos(t.cobrarFuera)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          {/* ---------- Por pagar ---------- */}
          <section className="cap-bloque rojo">
            <h2>Por pagar</h2>
            <table>
              <tbody>
                {foto.porPagarCuentas.map((c, i) => (
                  <tr key={i}>
                    <td>{c.nombre}</td>
                    <td className="num">{pesos(c.monto)}</td>
                  </tr>
                ))}
                {foto.porPagarCuentas.length === 0 && (
                  <tr>
                    <td colSpan={2} className="cap-vacio">
                      No se le debe a nadie en Cuentas por Cobrar.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total (del sistema)</td>
                  <td className="num">{pesos(t.porPagarCuentas)}</td>
                </tr>
              </tfoot>
            </table>
            <h3>Por pagar fuera del sistema</h3>
            <table>
              <tbody>{tablaFilas("pagarFuera", "Nombre", "Monto en pesos")}</tbody>
              <tfoot>
                <tr>
                  <td>Total fuera del sistema</td>
                  <td className="num">{pesos(t.pagarFuera)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <label className="cap-confirmaciones">
              <input type="checkbox" checked={manual.restarConfirmaciones} onChange={(e) => cambiar("restarConfirmaciones", e.target.checked)} disabled={soloLectura} />
              <span>
                Restar las confirmaciones sin pagar
                <small>
                  {foto.confirmaciones.length
                    ? foto.confirmaciones.map((c) => `${c.codigo} ${conDecimales(Number(c.total))} (${c.cantidad})`).join(" · ")
                    : "No hay confirmaciones sin pagar."}{" "}
                  · Incluye las viejas que se pagaron por fuera y no se marcaron.
                </small>
              </span>
            </label>
          </section>

          {/* ---------- Bolívares ---------- */}
          <section className="cap-bloque magenta">
            <h2>Bolívares</h2>
            <table>
              <thead>
                <tr>
                  <th>Banco o persona</th>
                  <th className="num">Bs</th>
                  <th />
                </tr>
              </thead>
              <tbody>{tablaFilas("bolivares", "Banco o persona", "Bolívares", true)}</tbody>
              <tfoot>
                <tr>
                  <td>Total bolívares</td>
                  <td className="num">Bs {conDecimales(t.bolivares)}</td>
                  <td />
                </tr>
                <tr className="cap-fila-oscura">
                  <td>En pesos {t.tasaBs ? `(× ${formatearMonto(String(t.tasaBs))})` : "(falta la tasa)"}</td>
                  <td className="num">{pesos(t.bolivaresCop)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          {/* ---------- Pesos ---------- */}
          <section className="cap-bloque cian">
            <h2>Pesos</h2>
            <table>
              <thead>
                <tr>
                  <th>Banco o persona</th>
                  <th className="num">Pesos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {foto.cajas.flatMap((c) =>
                  c.saldos
                    .filter((x) => x.codigo === "COP")
                    .map((x) => (
                      <tr key={`${c.id}-cop`} className="cap-auto">
                        <td>
                          {c.nombre} <small>del sistema</small>
                        </td>
                        <td className="num">{pesos(Number(x.monto))}</td>
                        <td />
                      </tr>
                    ))
                )}
                {tablaFilas("pesos", "Banco o persona", "Pesos", true)}
              </tbody>
              <tfoot>
                <tr className="cap-fila-oscura">
                  <td>Total pesos</td>
                  <td className="num">{pesos(t.pesosCajas + t.pesosManual)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          {/* ---------- Dólares y pesos ---------- */}
          <section className="cap-bloque verde ancho">
            <h2>Dólares y pesos</h2>
            <table>
              <thead>
                <tr>
                  <th>Caja</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Tasa</th>
                  <th className="num">Pesos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.divisasCajas.map((d) => (
                  <tr key={d.clave} className="cap-auto">
                    <td>
                      {d.nombre} <small>{d.codigo === "EUR" ? "euros · del sistema" : "del sistema"}</small>
                    </td>
                    <td className="num">
                      {d.codigo === "EUR" ? "€" : "$"}
                      {conDecimales(d.cantidad)}
                    </td>
                    <td className="num">
                      <input
                        value={manual.tasasCaja[d.clave] ?? ""}
                        onChange={(e) => cambiar("tasasCaja", { ...manual.tasasCaja, [d.clave]: conPuntos(e.target.value) })}
                        inputMode="decimal"
                        placeholder={d.tasa ? formatearMonto(String(d.tasa)) : "tasa"}
                        disabled={soloLectura}
                        aria-label={`Tasa de ${d.nombre}`}
                      />
                    </td>
                    <td className="num cap-calculado">{pesos(d.pesos)}</td>
                    <td />
                  </tr>
                ))}
                {tablaDivisas("dolaresFuera", "Otra caja o persona (ej. Caja 1 sencillo)")}
              </tbody>
              <tfoot>
                <tr className="cap-fila-oscura">
                  <td>Total</td>
                  <td className="num">
                    ${conDecimales(t.usdEnCaja)}
                    {t.eurEnCaja ? ` · €${conDecimales(t.eurEnCaja)}` : ""}
                  </td>
                  <td />
                  <td className="num">{pesos(t.divisasCop)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <h3>Dólares por pagar</h3>
            <table>
              <tbody>{tablaDivisas("dolaresPorPagar", "Nombre (ej. Jesús Herrera)")}</tbody>
              <tfoot>
                <tr>
                  <td>Total por pagar{manual.restarConfirmaciones && t.confUsd ? " (con confirmaciones en USD/USDT)" : ""}</td>
                  <td className="num">${conDecimales(t.usdPorPagar)}</td>
                  <td />
                  <td className="num">{pesos(-t.usdPorPagarCop)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          {/* ---------- El resumen ---------- */}
          <section className="cap-resumen">
            <div className="cap-resumen-col">
              <dl>
                <div>
                  <dt>Por cobrar</dt>
                  <dd>{pesos(t.porCobrar)}</dd>
                </div>
                <div>
                  <dt>Cobrar fuera del sistema</dt>
                  <dd>{pesos(t.cobrarFuera)}</dd>
                </div>
                <div className="neg">
                  <dt>Por pagar</dt>
                  <dd>{pesos(-(t.porPagarCuentas + t.pagarFuera + (manual.restarConfirmaciones ? t.confCop + t.confVes * t.tasaBs : 0)))}</dd>
                </div>
                <div>
                  <dt>Bolívares (en pesos)</dt>
                  <dd>{pesos(t.bolivaresCop)}</dd>
                </div>
                <div>
                  <dt>Pesos en general</dt>
                  <dd>{pesos(t.pesosCajas + t.pesosManual)}</dd>
                </div>
              </dl>
              <div className="cap-capital">
                <span>Capital</span>
                <strong>{pesos(t.capitalCop)}</strong>
              </div>
            </div>
            <div className="cap-resumen-col">
              <dl>
                <div>
                  <dt>Total de dólares</dt>
                  <dd>${conDecimales(t.usdEnCaja)}</dd>
                </div>
                <div className="neg">
                  <dt>Dólares por pagar</dt>
                  <dd>${conDecimales(-t.usdPorPagar)}</dd>
                </div>
                <div>
                  <dt>Divisas en caja (en pesos)</dt>
                  <dd>{pesos(t.divisasCop)}</dd>
                </div>
                <div className="neg">
                  <dt>Dólares por pagar (en pesos)</dt>
                  <dd>{pesos(-t.usdPorPagarCop)}</dd>
                </div>
              </dl>
              <div className="cap-capital divisa">
                <span>Capital divisa</span>
                <strong>${conDecimales(t.capitalDivisa)}</strong>
                <span>Capital COP</span>
                <strong>{pesos(t.capitalDivisaCop)}</strong>
              </div>
            </div>
            {!soloLectura && (
              <div className="cap-guardar">
                <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota del cuadre (opcional)" maxLength={500} />
                <button type="button" onClick={() => void guardar()} disabled={guardando}>
                  <Save size={16} /> {guardando ? "Guardando…" : "Guardar cuadre"}
                </button>
              </div>
            )}
          </section>

          {/* ---------- Cuadres anteriores ---------- */}
          <section className="cap-historial">
            <h2>
              <History size={17} /> Cuadres anteriores
            </h2>
            {cuadres.length === 0 ? (
              <p className="cap-vacio">Todavía no hay cuadres guardados.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Quién</th>
                    <th className="num">Capital</th>
                    <th className="num">Capital divisa</th>
                    <th className="num">Divisa en pesos</th>
                    <th>Nota</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cuadres.map((c) => (
                    <tr key={c.id} className={viendo?.id === c.id ? "activo" : ""}>
                      <td>{fechaHora(c.created_at)}</td>
                      <td>{c.usuario_nombre}</td>
                      <td className="num">{pesos(Number(c.capital_cop))}</td>
                      <td className="num">${conDecimales(Number(c.capital_divisa))}</td>
                      <td className="num">{pesos(Number(c.capital_divisa_cop))}</td>
                      <td className="cap-nota">{c.nota ?? ""}</td>
                      <td>
                        <button type="button" onClick={() => void ver(c)}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
