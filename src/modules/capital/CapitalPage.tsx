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
import { CapitalTendencia } from "./CapitalTendencia";
import { CuadroBancos, MenuBanco } from "./CuadroBancos";
import { CIERRE_INICIAL, CierreCajaFuerte, UsdtManual, cuentasDelCierre, filaCierre, type CierreManual, type FilaCierre } from "./CierreCajaFuerte";
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
  usdt: FilaCierre[]; // las cuentas de USDT, a mano (cuentan como dólares)
  cierre: CierreManual; // el cierre de la Caja Fuerte, a mano
}
// un cliente con saldo: lo que me debe (o le debo), en la moneda de su cuenta
interface ClienteSaldo {
  id: number; // la cuenta
  nombre: string;
  modulo: string;
  codigo: string;
  saldo: number; // sin signo
  // Confirmaciones: de cuándo son las confirmaciones que no ha venido a retirar
  desde?: string;
  hasta?: string;
  pendientes?: number;
  grupo?: string; // dónde va: el grupo de Cuentas por Cobrar o qué es en Cuentas Corrientes (los cuadres viejos no lo traen)
  pesosCuenta: number | null; // en pesos con la tasa de la cuenta (si no hay tasa arriba para esa moneda)
}
// lo que el sistema traía, guardado con el cuadre para verlo después tal cual
interface Foto {
  // los cuadres viejos traen por cobrar por grupo (porCobrar) y no estas listas
  cobrarClientes?: ClienteSaldo[];
  pagarClientes?: ClienteSaldo[];
  // las confirmaciones sin pagar van en por pagar, cliente por cliente (en los cuadres viejos iban solo por moneda)
  confirmacionesEnLista?: boolean;
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
  usdt: [filaCierre()],
  cierre: CIERRE_INICIAL,
};
// lo guardado antes de que existiera alguna parte (USDT, cierre) se completa con lo vacío
const completar = (m: Partial<Manual>): Manual => ({ ...MANUAL_INICIAL, ...m, cierre: { ...CIERRE_INICIAL, ...(m.cierre ?? {}) } });

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
      // por cobrar y por pagar salen de Cuentas Corrientes, de Cuentas por Cobrar y de Confirmaciones (lo confirmado que
      // todavía no han venido a retirar)
      const [s, corrientes, cobrar, porPagar, confirmaciones, lista] = await Promise.all([
        capitalApi.sistema(),
        getCuentasCorrientes({ vista: "corrientes" }),
        getCuentasCorrientes({ vista: "cobrar" }),
        getCuentasCorrientes({ vista: "pagar" }),
        getCuentasCorrientes({ vista: "cajas" }),
        capitalApi.cuadres(),
      ]);
      setSistema(s);
      setCuentas([...corrientes, ...cobrar, ...porPagar, ...confirmaciones]);
      setCuadres(lista);
      return lista;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el capital.");
      return [];
    }
  }, []);

  // Lo escrito a mano (tasas incluidas): lo último que se escribió, guardado al instante en el servidor; si no hay,
  // lo del último cuadre. Así las tasas quedan puestas aunque no se guarde el cuadre, en cualquier computador.
  const manualGuardado = useCallback(async (lista: CuadreResumen[]): Promise<Manual> => {
    try {
      const b = await capitalApi.borrador();
      const m = (b?.datos as { manual?: Manual } | undefined)?.manual;
      if (m) return completar(m);
    } catch {
      // sin borrador: el último cuadre
    }
    const ultimo = lista[0];
    if (!ultimo) return MANUAL_INICIAL;
    const c = await capitalApi.cuadre(ultimo.id).catch(() => null);
    const m = (c?.datos as { manual?: Manual } | undefined)?.manual;
    return m ? completar(m) : MANUAL_INICIAL;
  }, []);
  // hasta que no llega lo guardado no se guarda nada (si no, se pisaría con la hoja vacía)
  const [manualListo, setManualListo] = useState(false);
  useEffect(() => {
    void cargar().then(async (lista) => {
      setManual(await manualGuardado(lista));
      setManualListo(true);
    });
  }, [cargar, manualGuardado]);

  // ---------- En tiempo real ----------
  // Lo del sistema se vuelve a traer solo: cada 15 segundos y al volver a esta pestaña (ej. después de pagar en
  // taquilla), para que lo pagado salga de la lista de una vez. Viendo un cuadre viejo no hace falta.
  const [actualizado, setActualizado] = useState<Date | null>(null);
  useEffect(() => {
    if (viendo) return;
    const refrescar = () => {
      if (document.visibilityState !== "visible") return;
      void cargar().then(() => setActualizado(new Date()));
    };
    const t = setInterval(refrescar, 15_000);
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("focus", refrescar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [cargar, viendo]);

  // Las tasas y lo escrito a mano se guardan solos al escribir (un momento después de la última tecla)
  const [estadoBorrador, setEstadoBorrador] = useState<"" | "guardando" | "guardado" | "error">("");
  useEffect(() => {
    if (!manualListo || viendo) return;
    const t = setTimeout(() => {
      setEstadoBorrador("guardando");
      capitalApi
        .guardarBorrador({ manual })
        .then(() => setEstadoBorrador("guardado"))
        .catch(() => setEstadoBorrador("error"));
    }, 800);
    return () => clearTimeout(t);
  }, [manual, manualListo, viendo]);

  // ---------- Lo que trae el sistema ----------
  const fotoActual: Foto | null = useMemo(() => {
    if (!sistema || !cuentas) return null;
    const conSaldo = cuentas.filter((c) => /[1-9]/.test(c.saldo_actual));
    const fechas = new Map((sistema.sinRetirar ?? []).map((f) => [f.cuenta_id, f]));
    const aCliente = (c: CuentaCorrienteResumen): ClienteSaldo => {
      const p = enPesos(c);
      const f = c.modulo === "CAJA" ? fechas.get(c.id) : undefined;
      const grupo =
        c.modulo === "CAJA"
          ? c.saldo_actual.startsWith("-") ? "Confirmaciones · pagado de más" : "Confirmaciones · no han venido a retirar"
          : c.modulo === "POR_COBRAR"
            ? `Cuentas por Cobrar · ${grupoDe(c)}`
            : c.modulo === "POR_PAGAR"
            ? `Cuentas por Pagar · ${grupoDe(c)}`
            : `Cuentas Corrientes · ${TIPO_TERCERO[c.tercero_tipo] ?? "Otros"}`;
      return { id: c.id, nombre: c.tercero_nombre, modulo: c.modulo, codigo: c.moneda_codigo, saldo: Math.abs(Number(c.saldo_actual)), grupo, ...(f ? { desde: f.desde, hasta: f.hasta, pendientes: f.cantidad } : {}), pesosCuenta: p === null ? null : Math.abs(Number(p)) };
    };
    // me debe: saldo positivo · le debo: saldo negativo. En Confirmaciones es al revés: positivo es lo que le debo
    const leDebo = (c: CuentaCorrienteResumen) => c.saldo_actual.startsWith("-") !== (c.modulo === "CAJA");
    // de Confirmaciones solo lo que se le debe al cliente (lo que no ha venido a retirar); un saldo al revés allá es un error de carga, no plata por cobrar
    const cobrarClientes = conSaldo.filter((c) => !leDebo(c) && c.modulo !== "CAJA").map(aCliente);
    const pagarClientes = conSaldo.filter(leDebo).map(aCliente);
    return {
      porCobrar: [],
      porPagarCuentas: [],
      cobrarClientes,
      pagarClientes,
      confirmacionesEnLista: true,
      cajas: sistema.cajas,
      bancos: sistema.bancos ?? [],
      confirmaciones: sistema.confirmacionesPorPagar,
    };
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
    // lo que no han venido a retirar (Confirmaciones) se cuenta solo con la casilla marcada
    const sinRetirar = (foto.pagarClientes ?? []).filter((c) => c.modulo === "CAJA");
    const sinRetirarCop = sinRetirar.reduce((s, c) => s + enPesosCliente(c), 0);
    const porPagarCuentas = foto.pagarClientes
      ? foto.pagarClientes.filter((c) => c.modulo !== "CAJA" || m.restarConfirmaciones).reduce((s, c) => s + enPesosCliente(c), 0)
      : foto.porPagarCuentas.reduce((s, c) => s + c.monto, 0);
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
    const divisasFuera = [...m.dolaresFuera, ...m.usdt].map((f) => ({ cantidad: num(f.cantidad), tasa: num(f.tasa) || tasaDolar })).map((f) => ({ ...f, pesos: f.cantidad * f.tasa }));
    const porPagarUsd = m.dolaresPorPagar.map((f) => ({ cantidad: num(f.cantidad), tasa: num(f.tasa) || tasaDolar })).map((f) => ({ ...f, pesos: f.cantidad * f.tasa }));
    const conf = (codigo: string) => Number(foto.confirmaciones.find((c) => c.codigo === codigo)?.total ?? 0);
    // los cuadres viejos restaban las confirmaciones aparte, por moneda; los nuevos las traen en la lista de por pagar
    const aparte = !foto.confirmacionesEnLista;
    const confCop = aparte ? conf("COP") : 0;
    const confVes = aparte ? conf("VES") : 0;
    const confUsd = aparte ? conf("USD") + conf("USDT") : 0;
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
      sinRetirar,
      sinRetirarCop,
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

  // Lo que dice el sistema para cada casilla del cierre (solo se sugiere: se copia tocándolo)
  const sugerencias = useMemo(() => {
    if (!t || !foto) return null;
    const fuerte = foto.cajas.filter((c) => c.tipo === "FUERTE");
    const deFuerte = (codigo: string) => fuerte.reduce((s, c) => s + Number(c.saldos.find((x) => x.codigo === codigo)?.monto ?? 0), 0);
    return {
      cop: deFuerte("COP"),
      usd: deFuerte("USD"),
      eur: deFuerte("EUR"),
      porCobrar: t.porCobrar,
      bancolombia: (foto.bancos ?? []).filter((b) => (b.moneda ?? "COP") === "COP").reduce((s, b) => s + Number(b.saldos.find((x) => x.codigo === "COP")?.monto ?? 0), 0),
      bolivares: t.bolivaresCop,
      pagarFuera: t.pagarFuera,
      cobrarFuera: t.cobrarFuera,
    };
  }, [t, foto]);

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
        usdt: manual.usdt.filter((f) => f.nombre.trim() || f.cantidad.trim()),
      };
      await capitalApi.guardar({
        datos: { manual: limpio, sistema: fotoActual },
        capitalCop: Math.round(t.capitalCop * 100) / 100,
        capitalDivisa: Math.round(t.capitalDivisa * 100) / 100,
        capitalDivisaCop: Math.round(t.capitalDivisaCop * 100) / 100,
        nota: nota.trim() || undefined,
      });
      setNota("");
      setAviso(`Cuadre guardado: cierre de Caja Fuerte ${pesos(cuentasDelCierre(manual.cierre, t.tasaDolar, t.tasaEuro).total)} · capital ${pesos(t.capitalCop)} en pesos y ${conDecimales(t.capitalDivisa)} USD en divisas.`);
      setTimeout(() => setAviso(null), 7000);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el cuadre.");
    } finally {
      setGuardando(false);
    }
  }

  // ---------- Cuentas de banco ----------
  // editar, ingreso o egreso, traslado o ver movimientos de una cuenta
  const [accionBanco, setAccionBanco] = useState<{ accion: AccionBanco; bancoId: number } | null>(null);
  async function recargarSistema() {
    try {
      setSistema(await capitalApi.sistema());
    } catch {
      // si falla, queda lo que había
    }
  }
  // una cuenta nueva en esa moneda (Bancolombia y Nequi en pesos, o de bolívares)
  async function crearBanco(nombre: string, moneda: string) {
    if (nombre.trim().length < 2) return setError("Escribí el nombre de la cuenta."), false;
    try {
      await capitalApi.crearBanco(nombre.trim(), moneda);
      setError(null);
      await recargarSistema();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la cuenta.");
      return false;
    }
  }
  // el cierre de la noche: lo que hay de verdad en cada cuenta (la diferencia queda anotada en cada una)
  async function registrarCierre(moneda: string, valores: { bancoId: number; saldo: string }[]) {
    const hechos: string[] = [];
    try {
      for (const v of valores) {
        const r = await capitalApi.cargarSaldoBanco(v.bancoId, moneda, v.saldo);
        hechos.push(r.cuenta);
      }
      setError(null);
      setAviso(`Cierre registrado: ${hechos.join(", ")}.`);
      setTimeout(() => setAviso(null), 7000);
      return true;
    } catch (e) {
      setError(`${hechos.length ? `Quedaron registradas ${hechos.join(", ")}. ` : ""}${e instanceof ApiError ? e.message : "No se pudo registrar el cierre."}`);
      return false;
    } finally {
      await recargarSistema();
    }
  }

  async function ver(c: CuadreResumen) {
    try {
      const completo = await capitalApi.cuadre(c.id);
      const d = completo.datos as { manual?: Manual; sistema?: Foto };
      if (!d.manual || !d.sistema) return setError("Ese cuadre no tiene el detalle guardado.");
      setManual(completar(d.manual));
      setViendo({ id: c.id, fecha: c.created_at, usuario: c.usuario_nombre, nota: c.nota, foto: d.sistema });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo abrir ese cuadre.");
    }
  }
  async function volverAlActual() {
    // vuelve con lo que estaba escribiendo (las tasas guardadas), para seguir desde ahí
    setManual(await manualGuardado(cuadres));
    setViendo(null);
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
        {/* ¿sube o baja? el capital de ahora contra los cuadres guardados, en una franja chica */}
        {t && !viendo && (t.tasaDolar || !t.capitalDivisa) && <CapitalTendencia actual={t.capitalCop + t.capitalDivisaCop} cuadres={cuadres} />}
        <div className="cap-referencia">
          <span className="cap-referencia-titulo">
            Tasas de referencia
            {!viendo && (
              <em className="cap-en-vivo">
                {estadoBorrador === "guardando" ? "guardando…" : estadoBorrador === "error" ? "no se pudieron guardar las tasas" : estadoBorrador === "guardado" ? "guardadas ✓" : ""}
                {actualizado ? ` · en vivo, actualizado ${actualizado.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : " · en vivo"}
              </em>
            )}
          </span>
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
          {/* ---------- Cierre de la Caja Fuerte: todo a mano, con lo del sistema como sugerencia ---------- */}
          <CierreCajaFuerte
            valor={manual.cierre}
            onCambio={(c) => cambiar("cierre", c)}
            soloLectura={soloLectura}
            tasaDolar={t.tasaDolar}
            tasaEuro={t.tasaEuro}
            sugerencias={sugerencias}
          />

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
              noSuma={manual.restarConfirmaciones ? undefined : "Confirmaciones · no han venido a retirar"}
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
              {foto.confirmacionesEnLista ? (
                <span>
                  Contar en el capital lo que no han venido a retirar
                  <small>
                    {t.sinRetirar.length
                      ? `${t.sinRetirar.length} ${t.sinRetirar.length === 1 ? "cliente" : "clientes"} con confirmaciones sin pagar: ${pesos(t.sinRetirarCop)} en pesos. Van en la lista de arriba, en su grupo.`
                      : "No hay confirmaciones sin pagar."}{" "}
                    Incluye las viejas que se pagaron por fuera y no se marcaron.
                  </small>
                </span>
              ) : (
              <span>
                Restar las confirmaciones sin pagar
                <small>
                  {foto.confirmaciones.length
                    ? foto.confirmaciones.map((c) => `${c.codigo} ${conDecimales(Number(c.total))} (${c.cantidad})`).join(" · ")
                    : "No hay confirmaciones sin pagar."}{" "}
                  · Incluye las viejas que se pagaron por fuera y no se marcaron.
                </small>
              </span>
              )}
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
          {/* ---------- Las cuentas de banco: Bancolombia y Nequi, y bolívares, lado a lado ---------- */}
          <CuadroBancos
            titulo="Bancolombia y Nequi"
            color="cian"
            moneda="COP"
            bancos={(foto.bancos ?? []).filter((b) => (b.moneda ?? "COP") === "COP")}
            soloLectura={soloLectura}
            onAccion={(accion, bancoId) => setAccionBanco({ accion, bancoId })}
            onCrear={(nombre) => crearBanco(nombre, "COP")}
            onCierre={(valores) => registrarCierre("COP", valores)}
          >
            <ManoDe titulo="Otros pesos (fuera del sistema)" abierto={manual.pesos.some((f) => f.nombre.trim() || f.monto.trim())} total={pesos(t.pesosManual)}>
              {tablaFilas("pesos", "Persona o cuenta", "Pesos", true)}
            </ManoDe>
          </CuadroBancos>
          <CuadroBancos
            titulo="Bolívares"
            color="magenta"
            moneda="VES"
            bancos={(foto.bancos ?? []).filter((b) => b.moneda === "VES")}
            soloLectura={soloLectura}
            tasaAPesos={t.tasaBs}
            onAccion={(accion, bancoId) => setAccionBanco({ accion, bancoId })}
            onCrear={(nombre) => crearBanco(nombre, "VES")}
            onCierre={(valores) => registrarCierre("VES", valores)}
          >
            <ManoDe
              titulo="Otros bolívares (fuera del sistema)"
              abierto={manual.bolivares.some((f) => f.nombre.trim() || f.monto.trim())}
              total={`Bs ${conDecimales(t.bolivares - (foto.bancos ?? []).reduce((s, b) => s + Number(b.saldos.find((x) => x.codigo === "VES")?.monto ?? 0), 0))}`}
            >
              {tablaFilas("bolivares", "Persona o cuenta", "Bolívares", true)}
            </ManoDe>
            <p className="cap-sub cap-bancos-total">
              Total bolívares <b>Bs {conDecimales(t.bolivares)}</b> · en pesos <b>{pesos(t.bolivaresCop)}</b>
            </p>
          </CuadroBancos>
          <UsdtManual filas={manual.usdt} onCambio={(f) => cambiar("usdt", f)} soloLectura={soloLectura} tasaDolar={t.tasaDolar} />

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
                      {d.nombre} <small>{d.codigo === "EUR" ? "euros · del sistema" : d.clave.startsWith("b") ? "cuenta de banco" : "del sistema"}</small>
                      {d.clave.startsWith("b") && !soloLectura && (
                        <MenuBanco onAccion={(accion) => setAccionBanco({ accion, bancoId: Number(d.clave.slice(1).split("-")[0]) })} />
                      )}
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
const rutaCuenta = (c: ClienteSaldo) =>
  c.modulo === "POR_COBRAR" ? `/cuentas-por-cobrar-pagar?cuenta=${c.id}` : c.modulo === "POR_PAGAR" ? `/cuentas-por-pagar?cuenta=${c.id}` : c.modulo === "CAJA" ? `/cajas-confirmaciones?cuenta=${c.id}` : `/cuentas-corrientes?cuenta=${c.id}`;

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
  noSuma,
}: {
  clientes: ClienteSaldo[] | undefined;
  viejos: { nombre: string; pesos: number }[]; // los cuadres viejos: por grupo
  enPesosDe: (c: ClienteSaldo) => number;
  columna: string;
  vacio: string;
  total: number;
  noSuma?: string; // un grupo que se ve pero no entra en el total
}) {
  const [buscar, setBuscar] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const texto = buscar.trim().toLowerCase();
  const lista = clientes ? clientes.filter((c) => !texto || c.nombre.toLowerCase().includes(texto)) : null;
  // los grupos, del que más suma al que menos; adentro, del que más debe al que menos
  const grupos = lista
    ? [...new Set(lista.map((c) => c.grupo ?? "Otros"))]
        .map((g) => {
          const de = lista
            .filter((c) => (c.grupo ?? "Otros") === g)
            // lo que no han venido a retirar: de lo más viejo a lo más nuevo; lo demás, del que más debe al que menos
            .sort((a, b) => (a.desde && b.desde ? a.desde.localeCompare(b.desde) : enPesosDe(b) - enPesosDe(a)));
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
                        {g.nombre === noSuma && <small className="cap-no-suma">no se suma al capital</small>}
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
                          {c.desde && <FechaPendiente desde={c.desde} hasta={c.hasta ?? c.desde} cantidad={c.pendientes ?? 1} />}
                        </td>
                        <td className="num">{c.codigo === "COP" ? pesos(c.saldo) : `${conDecimales(c.saldo)} ${c.codigo}`}</td>
                        <td className="num cap-calculado">
                          {pesos(enPesosDe(c))}
                          {/* lo que no ha venido a retirar: se le paga en taquilla (se llega ya buscándolo) */}
                          {c.modulo === "CAJA" && (
                            <span className="cap-ir-taquilla">
                              Pagar en taquilla:{" "}
                              {[
                                ["/taquilla", "1"],
                                ["/taquilla-2", "2"],
                                ["/taquilla-3", "3"],
                              ].map(([ruta, n]) => (
                                <Link key={n} to={`${ruta}?buscar=${encodeURIComponent(c.nombre)}`} title={`Ir a Taquilla ${n} con ${c.nombre} ya buscado, para pagarle`}>
                                  {n}
                                </Link>
                              ))}
                            </span>
                          )}
                        </td>
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

/** De cuándo es lo que no ha venido a retirar: "confirmada el 12 oct · hace 5 días" (lo viejo se resalta). */
function FechaPendiente({ desde, hasta, cantidad }: { desde: string; hasta: string; cantidad: number }) {
  const dia = (f: string) => new Date(f).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const delDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(desde));
  const dias = Math.round((Date.parse(hoy) - Date.parse(delDia)) / 86_400_000);
  const hace = dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
  const cuando = cantidad > 1 && dia(desde) !== dia(hasta) ? `${cantidad} confirmaciones · del ${dia(desde)} al ${dia(hasta)}` : `${cantidad > 1 ? `${cantidad} confirmaciones · ` : "confirmada el "}${dia(desde)}`;
  return (
    <small className={`cap-fecha-pend ${dias >= 3 ? "vieja" : ""}`} title={`La más vieja: ${new Date(desde).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`}>
      {cuando} · {hace}
    </small>
  );
}

/** Lo que se anota a mano dentro de un cuadro de cuentas: plegado si está vacío, para que el cuadro no se alargue. */
function ManoDe({ titulo, abierto, total, children }: { titulo: string; abierto: boolean; total: string; children: React.ReactNode }) {
  return (
    <details className="cap-a-mano" open={abierto || undefined}>
      <summary>
        {titulo} <b>{total}</b>
      </summary>
      <div className="cap-tabla">
        <table>
          <tbody>{children}</tbody>
        </table>
      </div>
    </details>
  );
}
