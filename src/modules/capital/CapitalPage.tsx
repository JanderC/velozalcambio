import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, History, Landmark, Plus, Save, X } from "lucide-react";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { capitalApi, type CuadreResumen, type DatosDelSistema } from "../../api/capital.api";
import { getCuentasCorrientes, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, leerNumero } from "../../utils/montos";
import { enPesos, grupoDe } from "../cuentasPorCobrarPagar/cobrar";
import { BancoAccionModal, type AccionBanco } from "./BancoAccionModal";
import { CapitalGrafica } from "./CapitalGrafica";
import "../cuentasCorrientes/cuentasCorrientes.css";
import "./capital.css";

/*
 * Capital de giros: el cuadre de todo el negocio, con el mismo formato del Excel.
 *   Lo que el sistema ya sabe sale solo: cada cliente que me debe y cada uno al que le debo (Cuentas Corrientes y
 *   Cuentas por Cobrar, y desde acá se le cancela), las taquillas y la Caja Fuerte con lo que tienen ahora, las cuentas
 *   de banco y las confirmaciones sin pagar.
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
// un cliente con saldo: lo que me debe (o le debo), en la moneda de su cuenta
interface ClienteSaldo {
  id: number; // la cuenta
  nombre: string;
  modulo: string;
  codigo: string;
  saldo: number; // sin signo
  grupo?: string; // dónde va: el grupo de Cuentas por Cobrar o qué es en Cuentas Corrientes (los cuadres viejos no lo traen)
  pesosCuenta: number | null; // en pesos con la tasa de la cuenta (si no hay tasa arriba para esa moneda)
}
// lo que el sistema traía, guardado con el cuadre para verlo después tal cual
interface Foto {
  // los cuadres viejos traen por cobrar por grupo (porCobrar) y no estas listas
  cobrarClientes?: ClienteSaldo[];
  pagarClientes?: ClienteSaldo[];
  porCobrar: { grupo: string; total: number; clientes: number }[];
  porPagarCuentas: { nombre: string; monto: number }[];
  cajas: DatosDelSistema["cajas"];
  bancos?: NonNullable<DatosDelSistema["bancos"]>; // los cuadres viejos no las traen
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
const TIPO_TERCERO: Record<string, string> = { PROVEEDOR: "Proveedores", CLIENTE: "Clientes", AMIGO: "Amigos", EVENTUAL: "Eventuales", MIXTO: "Clientes y proveedores" };
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
      // por cobrar y por pagar salen de Cuentas Corrientes (y de Cuentas por Cobrar)
      const [s, corrientes, cobrar, lista] = await Promise.all([
        capitalApi.sistema(),
        getCuentasCorrientes({ vista: "corrientes" }),
        getCuentasCorrientes({ vista: "cobrar" }),
        capitalApi.cuadres(),
      ]);
      setSistema(s);
      setCuentas([...corrientes, ...cobrar]);
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
    const conSaldo = cuentas.filter((c) => /[1-9]/.test(c.saldo_actual));
    const aCliente = (c: CuentaCorrienteResumen): ClienteSaldo => {
      const p = enPesos(c);
      const grupo = c.modulo === "POR_COBRAR" ? `Cuentas por Cobrar · ${grupoDe(c)}` : `Cuentas Corrientes · ${TIPO_TERCERO[c.tercero_tipo] ?? "Otros"}`;
      return { id: c.id, nombre: c.tercero_nombre, modulo: c.modulo, codigo: c.moneda_codigo, saldo: Math.abs(Number(c.saldo_actual)), grupo, pesosCuenta: p === null ? null : Math.abs(Number(p)) };
    };
    // me debe: saldo positivo · le debo: saldo negativo
    const cobrarClientes = conSaldo.filter((c) => !c.saldo_actual.startsWith("-")).map(aCliente);
    const pagarClientes = conSaldo.filter((c) => c.saldo_actual.startsWith("-")).map(aCliente);
    return { porCobrar: [], porPagarCuentas: [], cobrarClientes, pagarClientes, cajas: sistema.cajas, bancos: sistema.bancos ?? [], confirmaciones: sistema.confirmacionesPorPagar };
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
    // cada cliente en pesos, con las tasas de arriba (si falta la de su moneda, con la de su cuenta)
    const enPesosCliente = (c: ClienteSaldo) =>
      c.codigo === "COP"
        ? c.saldo
        : (c.codigo === "USD" || c.codigo === "USDT") && tasaDolar
          ? c.saldo * tasaDolar
          : c.codigo === "EUR" && tasaEuro
            ? c.saldo * tasaEuro
            : c.codigo === "VES" && tasaBs
              ? c.saldo * tasaBs
              : (c.pesosCuenta ?? 0);
    const porCobrar = foto.cobrarClientes ? foto.cobrarClientes.reduce((s, c) => s + enPesosCliente(c), 0) : foto.porCobrar.reduce((s, g) => s + g.total, 0);
    const cobrarFuera = suma(m.cobrarFuera);
    const porPagarCuentas = foto.pagarClientes ? foto.pagarClientes.reduce((s, c) => s + enPesosCliente(c), 0) : foto.porPagarCuentas.reduce((s, c) => s + c.monto, 0);
    // lo que hay ahora en cada caja (taquillas, Caja Fuerte…), por moneda y en pesos
    const cajasAhora = foto.cajas.map((c) => {
      const de = (codigo: string) => Number(c.saldos.find((x) => x.codigo === codigo)?.monto ?? 0);
      const cop = de("COP");
      const usd = de("USD");
      const eur = de("EUR");
      return { id: c.id, nombre: c.nombre, tipo: c.tipo, cop, usd, eur, enPesos: cop + usd * tasaDolar + eur * tasaEuro };
    });
    const pagarFuera = suma(m.pagarFuera);
    // las cuentas de banco de la empresa, por moneda (el USDT cuenta como dólares)
    const bancosEn = (codigos: string[]) => (foto.bancos ?? []).flatMap((b) => b.saldos.filter((x) => codigos.includes(x.codigo)).map((x) => Number(x.monto))).reduce((s, v) => s + v, 0);
    const bancosCop = bancosEn(["COP"]);
    const bancosVes = bancosEn(["VES"]);
    const bolivares = suma(m.bolivares) + bancosVes;
    const bolivaresCop = bolivares * tasaBs;
    const pesosCajas = foto.cajas.flatMap((c) => c.saldos.filter((x) => x.codigo === "COP").map((x) => Number(x.monto))).reduce((s, v) => s + v, 0) + bancosCop;
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
    ).concat(
      // y los de las cuentas de banco (USDT como dólares)
      (foto.bancos ?? []).flatMap((b) =>
        b.saldos
          .filter((x) => x.codigo === "USD" || x.codigo === "USDT" || x.codigo === "EUR")
          .map((x) => {
            const clave = `b${b.id}-${x.codigo}`;
            const codigo = x.codigo === "EUR" ? "EUR" : "USD";
            const tasa = num(m.tasasCaja[clave]) || (codigo === "EUR" ? tasaEuro : tasaDolar);
            return { clave, nombre: `${b.nombre}${x.codigo === "USDT" ? " (USDT)" : ""}`, codigo, cantidad: Number(x.monto), tasa, pesos: Number(x.monto) * tasa };
          })
      )
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
      tasaEuro,
      tasaBs,
      enPesosCliente,
      cajasAhora,
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

  // el capital total, visto en pesos o en dólares
  const [verEn, setVerEn] = useState<"COP" | "USD">("COP");

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

  // ---------- Cuentas de banco: agregar una y cargarle el saldo real ----------
  const [nuevoBanco, setNuevoBanco] = useState<{ nombre: string; moneda: string } | null>(null);
  const [saldosReales, setSaldosReales] = useState<Record<string, string>>({});
  const [cargandoBanco, setCargandoBanco] = useState<string | null>(null);
  // editar, ingreso o egreso, traslado o ver movimientos de una cuenta
  const [accionBanco, setAccionBanco] = useState<{ accion: AccionBanco; bancoId: number } | null>(null);
  async function recargarSistema() {
    try {
      setSistema(await capitalApi.sistema());
    } catch {
      // si falla, queda lo que había
    }
  }
  async function agregarBanco() {
    if (!nuevoBanco || nuevoBanco.nombre.trim().length < 2) return setError("Escribí el nombre de la cuenta (ej. Banesco, Mercantil, Nequi 2).");
    try {
      await capitalApi.crearBanco(nuevoBanco.nombre.trim(), nuevoBanco.moneda);
      setNuevoBanco(null);
      setError(null);
      await recargarSistema();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la cuenta.");
    }
  }
  async function cargarSaldo(bancoId: number, moneda: string) {
    const clave = `${bancoId}-${moneda}`;
    const escrito = saldosReales[clave] ?? "";
    const valor = escrito.trim() ? leerNumero(escrito) : null;
    if (valor === null) return setError("Escribí el saldo real de la cuenta.");
    setCargandoBanco(clave);
    try {
      const r = await capitalApi.cargarSaldoBanco(bancoId, moneda, valor);
      setSaldosReales((s) => ({ ...s, [clave]: "" }));
      setError(null);
      setAviso(`${r.cuenta}: saldo cargado (${conDecimales(Number(r.antes))} → ${conDecimales(Number(r.ahora))} ${moneda}).`);
      setTimeout(() => setAviso(null), 6000);
      await recargarSistema();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el saldo.");
    } finally {
      setCargandoBanco(null);
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
        <Link to="/" className="cap-volver">
          <ArrowLeft size={16} /> Panel de módulos
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
        {t && <TotalesPorMoneda t={t} />}
        <div className="cap-referencia">
          <span className="cap-referencia-titulo">Tasas de referencia</span>
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
          {t && <TodoJunto t={t} />}
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

          {/* ---------- Las cajas, con lo que tienen ahora ---------- */}
          <section className="cap-bloque oscuro ancho">
            <h2>Cajas · lo que hay ahora</h2>
            <div className="cap-tabla">
            <table>
              <thead>
                <tr>
                  <th>Caja</th>
                  <th className="num">Pesos</th>
                  <th className="num">Dólares</th>
                  <th className="num">Euros</th>
                  <th className="num">Todo en pesos</th>
                </tr>
              </thead>
              <tbody>
                {t.cajasAhora.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.nombre} <small>{c.tipo === "FUERTE" ? "Caja Fuerte" : ""}</small>
                    </td>
                    <td className="num">{pesos(c.cop)}</td>
                    <td className="num">${conDecimales(c.usd)}</td>
                    <td className="num">{c.eur ? `€${conDecimales(c.eur)}` : "—"}</td>
                    <td className="num cap-calculado">{t.tasaDolar || (!c.usd && !c.eur) ? pesos(c.enPesos) : "falta la tasa"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total en cajas</td>
                  <td className="num">{pesos(t.cajasAhora.reduce((s, c) => s + c.cop, 0))}</td>
                  <td className="num">${conDecimales(t.cajasAhora.reduce((s, c) => s + c.usd, 0))}</td>
                  <td className="num">€{conDecimales(t.cajasAhora.reduce((s, c) => s + c.eur, 0))}</td>
                  <td className="num">{pesos(t.cajasAhora.reduce((s, c) => s + c.enPesos, 0))}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </section>

          {/* ---------- Por cobrar: cada cliente que me debe ---------- */}
          <section className="cap-bloque azul">
            <h2>Por cobrar · me deben</h2>
            <ListaSaldos
              clientes={foto.cobrarClientes}
              viejos={foto.porCobrar.map((g) => ({ nombre: `${g.grupo} (${g.clientes})`, pesos: g.total }))}
              enPesosDe={t.enPesosCliente}
              columna="Me debe"
              vacio="Nadie me debe."
              total={t.porCobrar}
            />
            <h3>Por cobrar sin relacionar</h3>
            <p className="cap-sub">Lo que me deben y todavía no está en ninguna cuenta del sistema: se anota a mano.</p>
            <div className="cap-tabla">
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
            </div>
          </section>

          {/* ---------- Por pagar ---------- */}
          <section className="cap-bloque rojo">
            <h2>Por pagar · le debo</h2>
            <ListaSaldos
              clientes={foto.pagarClientes}
              viejos={foto.porPagarCuentas.map((c) => ({ nombre: c.nombre, pesos: c.monto }))}
              enPesosDe={t.enPesosCliente}
              columna="Le debo"
              vacio="No le debo a nadie."
              total={t.porPagarCuentas}
            />
            <h3>Por pagar sin relacionar</h3>
            <p className="cap-sub">Lo que debo y todavía no está en ninguna cuenta del sistema.</p>
            <div className="cap-tabla">
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
            </div>
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

          {accionBanco && sistema?.bancos?.some((b) => b.id === accionBanco.bancoId) && (
            <BancoAccionModal
              accion={accionBanco.accion}
              banco={sistema.bancos.find((b) => b.id === accionBanco.bancoId)!}
              bancos={sistema.bancos}
              onCerrar={() => setAccionBanco(null)}
              onHecho={(mensaje) => {
                setAccionBanco(null);
                setAviso(mensaje);
                setTimeout(() => setAviso(null), 6000);
                void recargarSistema();
              }}
            />
          )}
          {/* ---------- Cuentas de bancos de la empresa ---------- */}
          <section className="cap-bloque morado ancho">
            <h2>Cuentas de bancos</h2>
            <div className="cap-tabla">
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="num">En el sistema</th>
                  <th className="num">{soloLectura ? "" : "Saldo real"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(foto.bancos ?? []).map((b) => {
                  const moneda = b.moneda ?? "COP";
                  const clave = `${b.id}-${moneda}`;
                  const enSistema = Number(b.saldos.find((x) => x.codigo === moneda)?.monto ?? 0);
                  const otras = b.saldos.filter((x) => x.codigo !== moneda);
                  return (
                    <tr key={b.id}>
                      <td>
                        {b.nombre} <small>{moneda}</small>
                        <span className="cap-banco-links">
                          {!soloLectura && (
                            <>
                              <button type="button" onClick={() => setAccionBanco({ accion: "movimiento", bancoId: b.id })}>
                                Ingreso / egreso
                              </button>
                              <button type="button" onClick={() => setAccionBanco({ accion: "traslado", bancoId: b.id })}>
                                Pasar a otra cuenta
                              </button>
                              <button type="button" onClick={() => setAccionBanco({ accion: "renombrar", bancoId: b.id })}>
                                Editar
                              </button>
                            </>
                          )}
                          <button type="button" onClick={() => setAccionBanco({ accion: "historial", bancoId: b.id })}>
                            Movimientos
                          </button>
                        </span>
                        {otras.length > 0 && <small> · también {otras.map((x) => `${conDecimales(Number(x.monto))} ${x.codigo}`).join(", ")}</small>}
                      </td>
                      <td className="num">{moneda === "COP" ? pesos(enSistema) : `${conDecimales(enSistema)} ${moneda}`}</td>
                      <td className="num">
                        {!soloLectura && (
                          <input
                            value={saldosReales[clave] ?? ""}
                            onChange={(e) => setSaldosReales((s) => ({ ...s, [clave]: conPuntos(e.target.value) }))}
                            inputMode="decimal"
                            placeholder="lo que tiene hoy"
                            aria-label={`Saldo real de ${b.nombre}`}
                          />
                        )}
                      </td>
                      <td className="cap-banco-accion">
                        {!soloLectura && (
                          <button type="button" onClick={() => void cargarSaldo(b.id, moneda)} disabled={!saldosReales[clave]?.trim() || cargandoBanco === clave} title="Deja la cuenta con ese saldo: la diferencia queda anotada como un movimiento de esa cuenta">
                            {cargandoBanco === clave ? "…" : "Cargar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(foto.bancos ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="cap-vacio">
                      Todavía no hay cuentas de banco.
                    </td>
                  </tr>
                )}
                {!soloLectura &&
                  (nuevoBanco ? (
                    <tr className="cap-banco-nuevo">
                      <td>
                        <input value={nuevoBanco.nombre} onChange={(e) => setNuevoBanco({ ...nuevoBanco, nombre: e.target.value })} placeholder="Nombre (ej. Banesco)" autoFocus aria-label="Nombre de la cuenta" />
                      </td>
                      <td>
                        <select value={nuevoBanco.moneda} onChange={(e) => setNuevoBanco({ ...nuevoBanco, moneda: e.target.value })} aria-label="Moneda de la cuenta">
                          <option value="COP">Pesos (COP)</option>
                          <option value="VES">Bolívares (VES)</option>
                          <option value="USD">Dólares (USD)</option>
                          <option value="USDT">USDT</option>
                          <option value="EUR">Euros (EUR)</option>
                        </select>
                      </td>
                      <td className="cap-banco-accion" colSpan={2}>
                        <button type="button" onClick={() => void agregarBanco()}>
                          Crear
                        </button>
                        <button type="button" className="secundario" onClick={() => setNuevoBanco(null)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr className="cap-agregar">
                      <td colSpan={4}>
                        <button type="button" onClick={() => setNuevoBanco({ nombre: "", moneda: "COP" })}>
                          <Plus size={13} /> Agregar cuenta de banco
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
            <p className="cap-nota-bancos">
              Se carga lo que cada cuenta tiene hoy y desde ahí el sistema la lleva: las confirmaciones pagadas por otro método salen de ahí. Lo de cada cuenta
              entra solo en Pesos, Bolívares o Dólares según su moneda.
            </p>
          </section>

          {/* ---------- Bolívares ---------- */}
          <section className="cap-bloque magenta">
            <h2>Bolívares</h2>
            <div className="cap-tabla">
            <table>
              <thead>
                <tr>
                  <th>Banco o persona</th>
                  <th className="num">Bs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(foto.bancos ?? []).flatMap((b) =>
                  b.saldos
                    .filter((x) => x.codigo === "VES")
                    .map((x) => (
                      <tr key={`b${b.id}-ves`} className="cap-auto">
                        <td>
                          {b.nombre} <small>cuenta de banco</small>
                        </td>
                        <td className="num">{conDecimales(Number(x.monto))}</td>
                        <td />
                      </tr>
                    ))
                )}
                {tablaFilas("bolivares", "Banco o persona", "Bolívares", true)}
              </tbody>
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
            </div>
          </section>

          {/* ---------- Pesos ---------- */}
          <section className="cap-bloque cian">
            <h2>Pesos</h2>
            <div className="cap-tabla">
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
                {(foto.bancos ?? []).flatMap((b) =>
                  b.saldos
                    .filter((x) => x.codigo === "COP")
                    .map((x) => (
                      <tr key={`b${b.id}-cop`} className="cap-auto">
                        <td>
                          {b.nombre} <small>cuenta de banco</small>
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
            </div>
          </section>

          {/* ---------- Dólares y pesos ---------- */}
          <section className="cap-bloque verde ancho">
            <h2>Dólares y pesos</h2>
            <div className="cap-tabla">
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
            </div>
            <h3>Dólares por pagar</h3>
            <div className="cap-tabla">
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
            </div>
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
            <div className="cap-resumen-col cap-total">
              <div className="cap-ver-en" role="radiogroup" aria-label="Ver el capital en">
                <span>Ver mi capital en</span>
                <button type="button" role="radio" aria-checked={verEn === "COP"} className={verEn === "COP" ? "activo" : ""} onClick={() => setVerEn("COP")}>
                  Pesos
                </button>
                <button type="button" role="radio" aria-checked={verEn === "USD"} className={verEn === "USD" ? "activo" : ""} onClick={() => setVerEn("USD")}>
                  Dólares
                </button>
              </div>
              {t.tasaDolar ? (
                <>
                  <dl>
                    <div className={t.capitalCop < 0 ? "neg" : ""}>
                      <dt>Lo de pesos{t.capitalCop < 0 ? " (es deuda)" : ""}</dt>
                      <dd>{verEn === "COP" ? pesos(t.capitalCop) : `$${conDecimales(t.capitalCop / t.tasaDolar)} USD`}</dd>
                    </div>
                    <div className={t.capitalDivisa < 0 ? "neg" : ""}>
                      <dt>Lo de dólares{t.capitalDivisa < 0 ? " (es deuda)" : ""}</dt>
                      <dd>{verEn === "COP" ? pesos(t.capitalDivisaCop) : `$${conDecimales(t.capitalDivisa)} USD`}</dd>
                    </div>
                  </dl>
                  <div className="cap-capital">
                    <span>Capital total</span>
                    <strong>
                      {verEn === "COP" ? pesos(t.capitalCop + t.capitalDivisaCop) : `$${conDecimales(t.capitalCop / t.tasaDolar + t.capitalDivisa)}`}
                    </strong>
                    <span>{verEn === "COP" ? "En dólares" : "En pesos"}</span>
                    <strong className="cap-otra">
                      {verEn === "COP" ? `$${conDecimales(t.capitalCop / t.tasaDolar + t.capitalDivisa)}` : pesos(t.capitalCop + t.capitalDivisaCop)}
                    </strong>
                  </div>
                  <small className="cap-total-nota">Con la tasa del dólar de arriba ({formatearMonto(String(t.tasaDolar))}): lo de pesos pasa a dólares dividiendo y lo de dólares a pesos multiplicando.</small>
                </>
              ) : (
                <p className="cap-total-nota">Escribí la tasa del dólar arriba para ver el capital total en pesos y en dólares.</p>
              )}
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

          <section className="cap-historial cap-graf-seccion">
            <CapitalGrafica cuadres={cuadres} />
          </section>

          {/* ---------- Cuadres anteriores ---------- */}
          <section className="cap-historial">
            <h2>
              <History size={17} /> Cuadres anteriores
            </h2>
            {cuadres.length === 0 ? (
              <p className="cap-vacio">Todavía no hay cuadres guardados.</p>
            ) : (
              <div className="cap-tabla">
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
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** A dónde se va para ver la cuenta del cliente (su hoja, con sus movimientos). */
const rutaCuenta = (c: ClienteSaldo) => (c.modulo === "POR_COBRAR" ? `/cuentas-por-cobrar-pagar?cuenta=${c.id}` : `/cuentas-corrientes?cuenta=${c.id}`);

/**
 * Los clientes con saldo, por grupos (los de Cuentas por Cobrar por su grupo; los de Cuentas Corrientes por lo que
 * son: proveedores, clientes…), cada grupo con su total. Cada cliente lleva directo a su cuenta para ver cómo está.
 */
function ListaSaldos({
  clientes,
  viejos,
  enPesosDe,
  columna,
  vacio,
  total,
}: {
  clientes: ClienteSaldo[] | undefined;
  viejos: { nombre: string; pesos: number }[]; // los cuadres viejos: por grupo
  enPesosDe: (c: ClienteSaldo) => number;
  columna: string;
  vacio: string;
  total: number;
}) {
  const [buscar, setBuscar] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const texto = buscar.trim().toLowerCase();
  const lista = clientes ? clientes.filter((c) => !texto || c.nombre.toLowerCase().includes(texto)) : null;
  // los grupos, del que más suma al que menos; adentro, del que más debe al que menos
  const grupos = lista
    ? [...new Set(lista.map((c) => c.grupo ?? "Otros"))]
        .map((g) => {
          const de = lista.filter((c) => (c.grupo ?? "Otros") === g).sort((a, b) => enPesosDe(b) - enPesosDe(a));
          return { nombre: g, clientes: de, total: de.reduce((s, c) => s + enPesosDe(c), 0) };
        })
        .sort((a, b) => b.total - a.total)
    : [];
  // buscando se ve todo abierto
  const abierto = (g: string) => !!texto || abiertos.has(g);
  const alternar = (g: string) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  return (
    <>
      {clientes && clientes.length > 6 && (
        <div className="cap-buscar">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={`Buscar entre ${clientes.length} clientes…`} aria-label="Buscar cliente" />
        </div>
      )}
      <div className="cap-lista-saldos">
        <div className="cap-tabla">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">{columna}</th>
                <th className="num">En pesos</th>
              </tr>
            </thead>
            {lista ? (
              grupos.map((g) => (
                <tbody key={g.nombre}>
                  <tr className="cap-grupo-fila" onClick={() => alternar(g.nombre)}>
                    <td>
                      <button type="button" aria-expanded={abierto(g.nombre)}>
                        <span className="cap-grupo-flecha">{abierto(g.nombre) ? "▾" : "▸"}</span> {g.nombre} <small>({g.clientes.length})</small>
                      </button>
                    </td>
                    <td />
                    <td className="num">{pesos(g.total)}</td>
                  </tr>
                  {abierto(g.nombre) &&
                    g.clientes.map((c) => (
                      <tr key={c.id} className="cap-cliente-fila">
                        <td>
                          <Link to={rutaCuenta(c)} title="Ver su cuenta: movimientos y saldo">
                            {c.nombre}
                          </Link>
                        </td>
                        <td className="num">{c.codigo === "COP" ? pesos(c.saldo) : `${conDecimales(c.saldo)} ${c.codigo}`}</td>
                        <td className="num cap-calculado">{pesos(enPesosDe(c))}</td>
                      </tr>
                    ))}
                </tbody>
              ))
            ) : (
              <tbody>
                {viejos.map((v, i) => (
                  <tr key={i}>
                    <td>{v.nombre}</td>
                    <td />
                    <td className="num">{pesos(v.pesos)}</td>
                  </tr>
                ))}
              </tbody>
            )}
            {(lista ? lista.length === 0 : viejos.length === 0) && (
              <tbody>
                <tr>
                  <td colSpan={3} className="cap-vacio">
                    {texto ? "Nadie con ese nombre." : vacio}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>
      <div className="cap-tabla">
        <table>
          <tfoot>
            <tr>
              <td>
                Total (del sistema){clientes ? ` · ${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}` : ""}
              </td>
              <td className="num">{pesos(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** Lo que se necesita de las cuentas para los totales de arriba. */
interface Totales {
  tasaDolar: number;
  tasaEuro: number;
  tasaBs: number;
  pesosCajas: number;
  pesosManual: number;
  usdEnCaja: number;
  eurEnCaja: number;
  bolivares: number;
  capitalCop: number;
  capitalDivisa: number;
  capitalDivisaCop: number;
}
const usd = (n: number) => `US$${conDecimales(n)}`;
const eur = (n: number) => `€${conDecimales(n)}`;

/** Lo que hay en cada moneda (cajas, bancos y lo anotado a mano), y cuánto vale en las otras con las tasas de referencia. */
function TotalesPorMoneda({ t }: { t: Totales }) {
  const pesosTotal = t.pesosCajas + t.pesosManual;
  // todo pasa por pesos: X dólares = X × tasa dólar en pesos = (eso ÷ tasa euro) en euros
  const aUsd = (cop: number) => (t.tasaDolar ? usd(cop / t.tasaDolar) : null);
  const aEur = (cop: number) => (t.tasaEuro ? eur(cop / t.tasaEuro) : null);
  const tarjetas = [
    { clave: "cop", titulo: "Pesos", valor: pesos(pesosTotal), equivale: [aUsd(pesosTotal), aEur(pesosTotal)] },
    { clave: "usd", titulo: "Dólares", valor: usd(t.usdEnCaja), equivale: t.tasaDolar ? [pesos(t.usdEnCaja * t.tasaDolar), aEur(t.usdEnCaja * t.tasaDolar)] : [] },
    { clave: "eur", titulo: "Euros", valor: eur(t.eurEnCaja), equivale: t.tasaEuro ? [pesos(t.eurEnCaja * t.tasaEuro), aUsd(t.eurEnCaja * t.tasaEuro)] : [] },
    ...(t.bolivares
      ? [{ clave: "ves", titulo: "Bolívares", valor: `Bs. ${conDecimales(t.bolivares)}`, equivale: t.tasaBs ? [pesos(t.bolivares * t.tasaBs), aUsd(t.bolivares * t.tasaBs)] : [] }]
      : []),
  ];
  return (
    <div className="cap-monedas" aria-label="Total general por moneda">
      {tarjetas.map((c) => {
        const otras = c.equivale.filter(Boolean);
        return (
          <div key={c.clave} className={`cap-moneda ${c.clave}`}>
            <span>Total en {c.titulo.toLowerCase()}</span>
            <strong>{c.valor}</strong>
            <small>{otras.length ? `≈ ${otras.join(" · ")}` : "escribí la tasa para ver cuánto vale"}</small>
          </div>
        );
      })}
    </div>
  );
}

/** Todo lo que hay junto, en cada moneda, y el capital (lo que hay más lo que me deben, menos lo que debo). */
function TodoJunto({ t }: { t: Totales }) {
  const enPesos = t.pesosCajas + t.pesosManual + t.usdEnCaja * t.tasaDolar + t.eurEnCaja * t.tasaEuro + t.bolivares * t.tasaBs;
  const capital = t.capitalCop + t.capitalDivisaCop;
  const falta = (!t.tasaDolar && t.usdEnCaja) || (!t.tasaEuro && t.eurEnCaja) || (!t.tasaBs && t.bolivares);
  return (
    <div className="cap-todo-junto">
      <div>
        <span>Todo lo que hay, junto</span>
        <strong>{pesos(enPesos)}</strong>
        <small>
          {t.tasaDolar ? usd(enPesos / t.tasaDolar) : "—"} · {t.tasaEuro ? eur(enPesos / t.tasaEuro) : "—"}
        </small>
      </div>
      <div>
        <span>Capital</span>
        <strong>{pesos(capital)}</strong>
        <small>
          {t.tasaDolar ? usd(capital / t.tasaDolar) : "—"} · {t.tasaEuro ? eur(capital / t.tasaEuro) : "—"}
        </small>
      </div>
      {falta ? <p className="cap-todo-falta">Falta alguna tasa: lo de esa moneda no entra en lo de “junto”.</p> : null}
    </div>
  );
}
