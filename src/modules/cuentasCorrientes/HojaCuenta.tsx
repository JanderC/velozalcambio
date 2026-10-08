import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, Image as IconoImagen, ChevronLeft, ChevronRight, Download, Lock, MessageCircle, Plus, Send, Share2, Undo2, X } from "lucide-react";
import {
  anularMovimientoCC,
  confirmarMovimientoCC,
  avisarClienteCuenta,
  buscarMovimientoPorNumero,
  codigosDeReferencia,
  eliminarCuentaCorriente,
  type MovimientoConNumero,
  cerrarDiaCuenta,
  configurarCobroCuenta,
  crearCuentaCorriente,
  descargarExcelEstadoCuenta,
  getCanales,
  getEstadoCuenta,
  getTasasRecientes,
  getUrlComprobante,
  subirComprobanteMovimiento,
  guardarTasaHabitual,
  type TasasRecientes,
  registrarMovimientoCC,
  type CuentaCorrienteResumen,
  type EstadoCuenta,
  type FilaEstadoCuenta,
} from "../../api/cuentasCorrientes.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { EditarClienteModal } from "./EditarClienteModal";
import { compartirImagen, copiarImagen, descargarBlob, generarImagenReporte, monedaDeLaTasa } from "./imagenReporte";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { dividirDecimales, factorDeComision, formatearMonto, leerNumero, multiplicarDecimales, pctDeComision, sumarDecimales } from "../../utils/montos";
import { alAbrirWhatsApp, enlaceWhatsApp } from "../../utils/whatsapp";
import { leerCapturas, unirImagenes } from "./comprobantesVarios";
import { LINEAS_WA, whatsappApi, type ConexionWa, type LineaWa } from "../../api/whatsapp.api";
import { abrirChatEnBurbuja } from "../../components/whatsapp/BurbujaWhatsapp";
import { EnviarReportePorVinculado } from "../../components/whatsapp/EnviarReportePorVinculado";
import { CobroModal } from "./CobroModal";

const REFERENCIAS_COMUNES = ["Venta de Zelle", "Venta de bss", "Venta de USDT", "Deteriorado", "Comisión", "Abono Zelle", "Abono dólares", "Abono efectivo", "Abono transferencia"];

// Referencias que no se sugieren, aunque exista el banco o se hayan usado antes
const REFERENCIAS_OCULTAS = /^(venta de (bancolombia|proveedor(es)?|western union)|abono nequi)$/i;

// Un abono resta solo. El abono por transferencia no: a veces suma y a veces resta, se elige a mano
const restaPorReferencia = (referencia: string) => /^\s*(abono|pago|recibe)/i.test(referencia) && !/transferencia/i.test(referencia);

const CLAVE_ULTIMA_COMISION = "cc-ultima-comision-pct";
const CLAVE_ULTIMA_CAJA = "cc-ultima-caja";

// La referencia lleva quién envió la transferencia: "Venta de Zelle · Juan Pérez"
const SEPARADOR_PERSONA = " · ";

/** Teléfono como lo pide wa.me: solo dígitos y con código de país (celular colombiano o venezolano sin él -> se le agrega). */
function telefonoWhatsApp(telefono: string | null) {
  const d = (telefono ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (d.length < 8) return null;
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  if (d.length === 11 && d.startsWith("04")) return `58${d.slice(1)}`;
  return d;
}

/** La tasa de una comisión viene como fracción ("0.03"): se muestra "3%". */
function tasaTexto(tasa: string, esPorcentaje: boolean, descontada = false, incluida = false) {
  // comisión descontada: se guarda el factor (0.96) y se muestra -4%; si el % ya venía sumado en lo enviado, +6%
  // (0%: familiar o amigo al que no se le cobra comisión)
  if (descontada) {
    const pct = pctDeComision(tasa, incluida);
    return /[1-9]/.test(pct) ? `${incluida ? "+" : "-"}${formatearMonto(pct)}%` : "sin comisión";
  }
  return esPorcentaje ? `${formatearMonto(multiplicarDecimales(tasa, "100", 6))}%` : formatearMonto(tasa);
}

/** AAAA-MM-DD de hoy en la zona del negocio. */
function hoyBogota(desplazarDias = 0) {
  const d = new Date(Date.now() + desplazarDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
}

/** El día anterior o siguiente a un AAAA-MM-DD. */
function moverDia(dia: string, cuanto: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + cuanto);
  return d.toISOString().slice(0, 10);
}

/** AAAA-MM-DD -> DD/MM/AAAA, sin pasar por husos horarios. */
function fechaDelDia(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
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
export function HojaCuenta({
  cuenta,
  onActualizar,
  onVolver,
  medio = null,
  onAbrirCuenta,
}: {
  cuenta: CuentaCorrienteResumen;
  onActualizar: () => void;
  onVolver: () => void;
  // Confirmaciones: el medio elegido arriba para el próximo movimiento. El cliente se registra una sola vez y cada
  // movimiento lleva su medio (hoy por Nequi, mañana por Bancolombia). Sin elegir, va el medio con que se registró.
  medio?: { id: number; nombre: string } | null;
  // Confirmaciones: el movimiento se entregó en otra moneda y quedó en la cuenta del cliente en esa moneda: se abre esa
  onAbrirCuenta?: (cuentaId: number) => void;
}) {
  const { usuario } = useAuth();
  const puedeAnular = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  // La hoja es diaria: se ve y se cierra un día a la vez
  const [dia, setDia] = useState(hoyBogota());
  const [cerrando, setCerrando] = useState(false);
  // En el computador el reporte se muestra en pantalla, para copiarlo o descargarlo
  const [reporte, setReporte] = useState<{ blob: Blob; url: string; nombre: string } | null>(null);
  // Abono recién cargado (o elegido en la tabla): se le puede confirmar al cliente por WhatsApp
  const [abonoParaAvisar, setAbonoParaAvisar] = useState<{ monto: string; descripcion: string; sentido?: "recibe" | "retiro" | "proceso" | "confirmada"; enviado?: string; comision?: string; texto?: string } | null>(null);
  const [estadoAviso, setEstadoAviso] = useState<"" | "enviando" | "enviado">("");
  const [copiado, setCopiado] = useState(false);

  // Teléfono: menú de compartir. Computador: la imagen a la vista con copiar y descargar.
  async function entregarReporte(blob: Blob, nombre: string) {
    if (await compartirImagen(blob, nombre)) return;
    setCopiado(false);
    setReporte({ blob, url: URL.createObjectURL(blob), nombre });
  }

  function cerrarReporte() {
    if (reporte) URL.revokeObjectURL(reporte.url);
    setReporte(null);
  }
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [configurandoCobro, setConfigurandoCobro] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(false);
  // "Venta de <banco>" para cada banco o canal: ZELLE -> "Venta de Zelle"
  const [ventasPorBanco, setVentasPorBanco] = useState<string[]>([]);

  useEffect(() => {
    getCanales()
      .then((canales) =>
        setVentasPorBanco(
          canales
            .filter((c) => c.nombre !== "SIN_BANCO")
            .map((c) => `Venta de ${c.nombre.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase())}`)
        )
      )
      .catch(() => setVentasPorBanco([]));
  }, []);

  const cargar = useCallback(async () => {
    try {
      setEstado(await getEstadoCuenta(cuenta.id, { desde: dia, hasta: dia }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [cuenta.id, dia]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);

  // Western ya verificó: el movimiento pasa a confirmado y queda listo el mensaje para el cliente
  async function confirmar(m: FilaEstadoCuenta) {
    try {
      await confirmarMovimientoCC(m.id);
      await cargar();
      setEstadoAviso("");
      setAbonoParaAvisar({ ...avisoDeMovimiento(m), sentido: "confirmada" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // La imagen del comprobante guardada con el movimiento
  const [imagenComprobante, setImagenComprobante] = useState<string | null>(null);
  async function verComprobante(movimientoId: number) {
    try {
      setImagenComprobante(await getUrlComprobante(movimientoId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

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

  // Eliminar: la cuenta deja de aparecer en las listas. Los movimientos no se borran.
  async function eliminar() {
    const conSaldo = /[1-9]/.test(saldoActual);
    const pregunta = `¿Eliminar la cuenta de ${cuenta.tercero_nombre}?${conSaldo ? " Ojo: todavía tiene saldo pendiente." : ""} Deja de aparecer en las listas.`;
    if (!window.confirm(pregunta)) return;
    try {
      await eliminarCuentaCorriente(cuenta.id);
      onActualizar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Imagen con solo los movimientos del período (sin nombre ni nada del sistema), para compartirla
  async function compartir() {
    if (!estado) return;
    try {
      await entregarReporte(await generarImagenReporte(estado, simbolo, `Movimientos del día ${fechaDelDia(dia)}`), `movimientos-${dia}.png`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Reporte por rango de fechas: los mismos movimientos, de un día a otro (imagen o Excel)
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [generandoRango, setGenerandoRango] = useState(false);
  const rangoValido = !!rango && !!rango.desde && !!rango.hasta && rango.desde <= rango.hasta;
  async function reporteDelRango(formato: "imagen" | "excel") {
    if (!rango || !rangoValido) return;
    setGenerandoRango(true);
    try {
      const nombre = `${rango.desde}-a-${rango.hasta}`;
      if (formato === "excel") {
        await descargarExcelEstadoCuenta(cuenta.id, rango, `Cuenta ${cuenta.tercero_nombre} ${nombre}.xlsx`);
      } else {
        const delRango = await getEstadoCuenta(cuenta.id, rango);
        const titulo = rango.desde === rango.hasta ? `Movimientos del día ${fechaDelDia(rango.desde)}` : `Movimientos del ${fechaDelDia(rango.desde)} al ${fechaDelDia(rango.hasta)}`;
        await entregarReporte(await generarImagenReporte(delRango, simbolo, titulo, rango.desde === rango.hasta ? undefined : "Abonado en el período"), `movimientos-${nombre}.png`);
      }
      setRango(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerandoRango(false);
    }
  }

  // Cierre diario: deja anotado el saldo con el que cerró el día y manda el reporte del día como imagen
  async function cerrarDia() {
    setCerrando(true);
    try {
      const cerrado = await cerrarDiaCuenta(cuenta.id, dia);
      setEstado(cerrado);
      setError(null);
      // el cierre sale con la fecha de su día, aunque se haga después (ej. el de ayer cerrado hoy)
      await entregarReporte(await generarImagenReporte(cerrado, simbolo, `Cierre del día ${fechaDelDia(dia)}`), `cierre-${dia}.png`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCerrando(false);
    }
  }

  async function descargar() {
    setDescargando(true);
    try {
      await descargarExcelEstadoCuenta(cuenta.id, { desde: dia, hasta: dia }, `Cuenta ${cuenta.tercero_nombre} ${dia}.xlsx`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDescargando(false);
    }
  }

  const simbolo = cuenta.moneda_codigo === "COP" ? "$" : "";
  const sufijo = cuenta.moneda_codigo === "COP" ? "" : ` ${cuenta.moneda_codigo}`;
  const saldoActual = estado?.cuenta.saldo_actual ?? cuenta.saldo_actual;
  // Si se le cobra en otra moneda: el saldo convertido con la tasa manual de la cuenta
  const actual = estado?.cuenta ?? cuenta;
  const esConfirmaciones = cuenta.modulo === "CAJA";
  const cobro =
    actual.moneda_cobro_codigo && actual.tasa_cobro
      ? {
          codigo: actual.moneda_cobro_codigo,
          tasa: actual.tasa_cobro,
          equivalente: multiplicarDecimales(saldoActual.replace(/^-/, ""), actual.tasa_cobro, Number(actual.moneda_cobro_decimales ?? 0)),
        }
      : actual.valor_moneda && !esConfirmaciones
        ? // sin moneda de cobro configurada: el valor de su moneda en pesos, a la última tasa usada.
          // En Confirmaciones no se muestra: esa tasa sale de movimientos de otros clientes y confunde.
          { codigo: "COP", tasa: actual.valor_moneda, equivalente: multiplicarDecimales(saldoActual.replace(/^-/, ""), actual.valor_moneda, 0) }
        : null;
  const equivalenteTexto = cobro ? (cobro.codigo === "COP" ? `$${formatearMonto(cobro.equivalente)} COP` : `${formatearMonto(cobro.equivalente)} ${cobro.codigo}`) : "";
  // Igual que el Excel: en negativo es lo que yo le debo.
  // En Confirmaciones el saldo se lee al revés: lo que le compramos al cliente (en positivo) es plata que nosotros le debemos
  const lecturaSaldo = !/[1-9]/.test(saldoActual) ? "Saldo" : saldoActual.startsWith("-") !== esConfirmaciones ? "Yo le debo" : "Me debe";
  // Enlace a WhatsApp (sin API): abre el chat del cliente con el mensaje ya escrito, listo para enviar
  const telefono = telefonoWhatsApp(estado?.cuenta.tercero_telefono ?? cuenta.tercero_telefono);
  const saldoSinSigno = `${simbolo}${formatearMonto(saldoActual.replace(/^-/, ""))}${sufijo}`;
  const saldoParaCliente =
    lecturaSaldo === "Yo le debo" ? `Saldo a su favor: ${saldoSinSigno}` : lecturaSaldo === "Me debe" ? `Saldo por pagar: ${saldoSinSigno}` : "Sin saldo pendiente";

  // Todos los avisos al cliente llevan el mismo formato: la frase, y debajo la referencia, el monto y el estado.
  type Aviso = NonNullable<typeof abonoParaAvisar>;
  // La referencia va anotada en el movimiento después del " · ": el MTCN, o el código que se cargó. Solo eso, sin "Compra Zelle".
  function refDeDescripcion(descripcion: string) {
    const mtcn = /MTCN\s*(\d+)/i.exec(descripcion)?.[1];
    const anotado = (descripcion.split(SEPARADOR_PERSONA)[1] ?? "").replace(/ \([\d.,]+ [A-Z]{3,5} a [\d.,]+\)$/, "");
    return `Ref: ${mtcn ? `MTCN ${mtcn}` : (codigosDeReferencia(anotado).join(" / ") || "—")}`;
  }
  function construirAviso(a: Aviso) {
    if (a.texto) return a.texto; // el mensaje ya armado (varias operaciones juntas)
    const monto = `${simbolo}${formatearMonto(a.monto)}${sufijo}`;
    const lineaRef = refDeDescripcion(a.descripcion);
    // Debajo de todo, como referencia: el total que mandó el cliente y la comisión con la que queda lo que recibe
    const pie = a.enviado
      ? `\n\nReferencia: envió ${simbolo}${formatearMonto(a.enviado)}${sufijo}${a.comision && /[1-9]/.test(a.comision) ? ` · comisión ${formatearMonto(a.comision)}%` : ""}`
      : "";
    const aviso = (frase: string, ...lineas: string[]) => `Estimado(a), le informamos que ${frase}\n\n${lineas.join("\n")}${pie}`;
    if (a.sentido === "proceso") return aviso("la operación está en proceso de confirmación.", lineaRef, `Monto: ${monto}`, "En breves minutos estará disponible");
    // en Confirmaciones una Compra que no quedó pendiente entra ya confirmada
    if (a.sentido === "confirmada" || a.sentido === "retiro") return aviso("la operación ha sido confirmada.", lineaRef, `Recibe: ${monto}`, "Disponible para recoger");
    // Venta: le vendimos al cliente
    if (a.sentido === "recibe") return aviso("su compra ha sido registrada.", lineaRef, `Monto: ${monto}`, saldoParaCliente);
    // abono en Cuentas Corrientes o Cuentas por Cobrar
    return aviso("hemos recibido su abono.", lineaRef, `Monto: ${monto}`, saldoParaCliente);
  }
  // Qué se le dice al cliente de un movimiento: según su estado de confirmación y, en Confirmaciones, si fue compra o venta
  const avisoDeMovimiento = (m: FilaEstadoCuenta): Aviso => ({
    monto: m.monto.replace(/^-/, ""),
    descripcion: m.descripcion ?? m.tipo,
    // operación con comisión descontada: el total enviado y el % (la tasa guardada es lo que queda: 0.9435 -> 5,65%)
    ...(m.comision_descontada && m.cantidad_base && m.tasa
      ? { enviado: m.cantidad_base.replace(/^-/, ""), comision: pctDeComision(m.tasa, m.comision_incluida) }
      : {}),
    ...(m.estado_confirmacion === "EN_PROCESO"
      ? { sentido: "proceso" as const }
      : m.estado_confirmacion === "CONFIRMADA"
        ? { sentido: "confirmada" as const }
        : esConfirmaciones
          ? { sentido: m.monto.startsWith("-") ? ("recibe" as const) : ("retiro" as const) }
          : {}),
  });
  const mensajeAbono = abonoParaAvisar ? construirAviso(abonoParaAvisar) : "";

  // La última operación con comisión del día: cuánto mandó el cliente en total, como referencia de lo que recibe
  const ultimaConComision = [...(estado?.movimientos ?? [])].reverse().find((m) => !m.anulado && m.comision_descontada && m.cantidad_base && m.tasa);
  const referenciaEnvio = ultimaConComision ? (avisoDeMovimiento(ultimaConComision) as Aviso & { enviado: string; comision: string }) : null;

  // Botón de arriba. En Confirmaciones se envía la última operación hecha (con su referencia), no el saldo global.
  const ultimaOperacion = esConfirmaciones ? [...(estado?.movimientos ?? [])].reverse().find((m) => !m.anulado) : undefined;
  // El cliente puede mandar el dinero en varias transferencias registradas por separado: si hoy hay varias operaciones
  // como la última (mismo estado) que todavía no se le pagaron, van todas en un solo mensaje, con el total.
  const sentidoUltima = ultimaOperacion ? avisoDeMovimiento(ultimaOperacion).sentido : undefined;
  const operacionesJuntas =
    ultimaOperacion && (sentidoUltima === "confirmada" || sentidoUltima === "retiro" || sentidoUltima === "proceso")
      ? (estado?.movimientos ?? []).filter((m) => {
          if (m.anulado || m.pagado_en || m.monto.startsWith("-")) return false;
          const s = avisoDeMovimiento(m).sentido;
          return sentidoUltima === "proceso" ? s === "proceso" : s === "confirmada" || s === "retiro";
        })
      : [];
  function construirAvisoDeVarias(movs: FilaEstadoCuenta[]) {
    const plata = (v: string) => `${simbolo}${formatearMonto(v)}${sufijo}`;
    const cuerpo = movs.map((m) => `${refDeDescripcion(m.descripcion ?? m.tipo)} · ${plata(m.monto)}`).join("\n");
    const total = plata(movs.reduce((suma, m) => sumarDecimales(suma, m.monto), "0"));
    return sentidoUltima === "proceso"
      ? `Estimado(a), le informamos que las operaciones están en proceso de confirmación.\n\n${cuerpo}\nMonto total: ${total}\nEn breves minutos estará disponible`
      : `Estimado(a), le informamos que las operaciones han sido confirmadas.\n\n${cuerpo}\nRecibe en total: ${total}\nDisponible para recoger`;
  }
  const variasOperaciones = operacionesJuntas.length > 1;
  const mensajeSaldo = variasOperaciones
    ? construirAvisoDeVarias(operacionesJuntas)
    : ultimaOperacion
    ? construirAviso(avisoDeMovimiento(ultimaOperacion))
    : `Estimado(a), le informamos su saldo al ${fechaCorta(new Date().toISOString())}.\n\n${saldoParaCliente}`;

  // Por cuál de los WhatsApp vinculados sale el aviso (Bolívares, Pesos o Dólares). Se recuerda la última usada;
  // la primera vez se propone según la moneda de la cuenta.
  const [lineasWa, setLineasWa] = useState<ConexionWa[]>([]);
  const [lineaAviso, setLineaAviso] = useState<LineaWa>(() => {
    try {
      const guardada = Number(localStorage.getItem("wa-linea-aviso"));
      if (guardada === 1 || guardada === 2 || guardada === 3) return guardada;
    } catch {
      // sin almacenamiento: se propone por la moneda
    }
    return cuenta.moneda_codigo === "VES" ? 1 : cuenta.moneda_codigo === "COP" ? 2 : 3;
  });
  const hayAviso = !!abonoParaAvisar;
  useEffect(() => {
    if (!hayAviso) return;
    whatsappApi
      .lineas()
      .then((l) => {
        setLineasWa(l);
        // si la línea propuesta no está conectada y otra sí, se pasa a esa
        setLineaAviso((actual) => (l.find((x) => x.linea === actual)?.estado === "CONECTADO" ? actual : (l.find((x) => x.estado === "CONECTADO")?.linea ?? actual)));
      })
      .catch(() => setLineasWa([]));
  }, [hayAviso]);
  const lineaElegida = lineasWa.find((l) => l.linea === lineaAviso);
  const lineaConectada = lineaElegida?.estado === "CONECTADO";
  function elegirLineaAviso(l: LineaWa) {
    setLineaAviso(l);
    setEstadoAviso("");
    try {
      localStorage.setItem("wa-linea-aviso", String(l));
    } catch {
      // no es grave: solo no se recuerda
    }
  }

  async function avisarConElSistema() {
    setEstadoAviso("enviando");
    try {
      await avisarClienteCuenta(cuenta.id, mensajeAbono, lineaAviso);
      setEstadoAviso("enviado");
      setError(null);
    } catch (e) {
      setEstadoAviso("");
      setError((e as Error).message);
    }
  }

  const referencias = useMemo(() => {
    const usadas = (estado?.movimientos ?? []).map((m) => m.descripcion).filter((d): d is string => !!d && !d.startsWith("Reverso de")).map((d) => d.split(SEPARADOR_PERSONA)[0]!.replace(/ \([\d.,]+ [A-Z]{3,5} a [\d.,]+\)$/, ""));
    return [...new Set([...usadas.reverse().slice(0, 15), ...ventasPorBanco, ...REFERENCIAS_COMUNES])].filter((r) => !REFERENCIAS_OCULTAS.test(r.trim()));
  }, [estado, ventasPorBanco]);

  return (
    <div className="cc-hoja">
      <div className="cc-hoja-cabeza">
        <button className="cc-volver" onClick={onVolver} aria-label="Volver a la lista">
          <ArrowLeft size={18} />
        </button>
        <div className="cc-hoja-titulo">
          <h2>{cuenta.tercero_nombre}</h2>
          <span>
            {cuenta.tercero_tipo === "PROVEEDOR" ? "Proveedor" : cuenta.tercero_tipo === "CLIENTE" ? "Cliente" : cuenta.tercero_tipo === "AMIGO" ? "Amigo" : "Cliente y proveedor"} ·{" "}
            {cuenta.canal_nombre === "SIN_BANCO" ? "" : `${cuenta.canal_nombre.replace(/_/g, " ")} · `}
            {cuenta.moneda_codigo}
          </span>
          {estado && (
            <span className="cc-hoy">
              {dia === hoyBogota() ? "Hoy" : fechaCorta(`${dia}T12:00:00-05:00`)}: {esConfirmaciones ? "le compramos" : "le vendí"}{" "}
              <b>
                <Monto valor={estado.sumas} simbolo={simbolo} />
                {sufijo}
              </b>{" "}
              · {esConfirmaciones ? "le vendimos" : "me vendió o abonó"}{" "}
              <b>
                <Monto valor={estado.abonos.replace(/^-/, "")} simbolo={simbolo} />
                {sufijo}
              </b>
              {esConfirmaciones && /[1-9]/.test(estado.enviado) && (
                <>
                  {" "}
                  · me envió <b>{formatearMonto(estado.enviado)}</b>
                </>
              )}
            </span>
          )}
          {cuenta.referencia && <span className="cc-hoy">Referencia: {cuenta.referencia}</span>}
          {puedeAnular && (
            <span className="cc-acciones-cuenta">
              <button type="button" className="cc-mover" onClick={() => setEditandoCliente(true)}>
                Editar datos (nombre, teléfono, cédula)
              </button>
              <button type="button" className="cc-mover cc-eliminar" onClick={eliminar}>
                Eliminar
              </button>
            </span>
          )}
        </div>
        <div className={`cc-hoja-saldo ${lecturaSaldo === "Yo le debo" ? "debo" : ""}`}>
          <span>{lecturaSaldo}</span>
          <strong>
            <Monto valor={esConfirmaciones ? saldoActual.replace(/^-/, "") : saldoActual} simbolo={simbolo} />
            {sufijo}
          </strong>
          {cobro && lecturaSaldo !== "Saldo" && (
            <small className="cc-equivalente">
              = {equivalenteTexto} · 1 {cuenta.moneda_codigo} = {formatearMonto(cobro.tasa)} {cobro.codigo}
            </small>
          )}
          {esConfirmaciones && estado && /[1-9]/.test(estado.enviadoTotal) && (
            <div className="cc-enviado" title="Lo que el cliente envió, antes de tasa o comisión">
              <span>Me ha enviado</span>
              <strong>{formatearMonto(estado.enviadoPorPagar)}</strong>
              <small>
                por pagar · {formatearMonto(estado.enviado)} {dia === hoyBogota() ? "hoy" : "ese día"} · {formatearMonto(estado.enviadoTotal)} en total
              </small>
            </div>
          )}
          {referenciaEnvio && (
            <small className="cc-equivalente">
              Referencia: envió {simbolo}
              {formatearMonto(referenciaEnvio.enviado)}
              {sufijo} · comisión {formatearMonto(referenciaEnvio.comision)}% · recibe {simbolo}
              {formatearMonto(referenciaEnvio.monto)}
              {sufijo}
            </small>
          )}
          {puedeAnular && (
            <button type="button" className="cc-mover" onClick={() => setConfigurandoCobro(true)}>
              {actual.moneda_cobro_codigo ? "Cambiar tasa o moneda de cobro" : "Cobrar en otra moneda"}
            </button>
          )}
        </div>
      </div>
      {editandoCliente && (
        <EditarClienteModal
          cuenta={actual}
          onCerrar={() => setEditandoCliente(false)}
          onGuardado={() => {
            setEditandoCliente(false);
            void cargar();
            onActualizar();
          }}
        />
      )}
      {configurandoCobro && (
        <CobroModal
          cuenta={actual}
          onCerrar={() => setConfigurandoCobro(false)}
          onGuardado={() => {
            setConfigurandoCobro(false);
            void cargar();
            onActualizar();
          }}
        />
      )}

      <div className="cc-periodos" aria-label="Día">
        <span className="cc-dia">
          <button onClick={() => setDia(moverDia(dia, -1))} aria-label="Día anterior" title="Día anterior">
            <ChevronLeft size={16} />
          </button>
          <input type="date" value={dia} max={hoyBogota()} onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Día" />
          <button onClick={() => setDia(moverDia(dia, 1))} disabled={dia >= hoyBogota()} aria-label="Día siguiente" title="Día siguiente">
            <ChevronRight size={16} />
          </button>
          {dia !== hoyBogota() && (
            <button className="cc-dia-hoy" onClick={() => setDia(hoyBogota())}>
              Hoy
            </button>
          )}
        </span>
        <button className="cc-cerrar-dia" onClick={cerrarDia} disabled={!estado || cerrando} title="Cierra el día y comparte el reporte como imagen">
          <Lock size={14} /> {cerrando ? "Cerrando…" : estado?.cierre ? "Volver a cerrar y enviar" : "Cerrar día y enviar"}
        </button>
        {(telefono || esConfirmaciones) && (
          <a className="cc-whatsapp" href={enlaceWhatsApp(telefono, mensajeSaldo)} onClick={(e) => alAbrirWhatsApp(e, telefono, mensajeSaldo)} target="_blank" rel="noreferrer" title={!telefono ? "Sin teléfono registrado: al abrir WhatsApp elegís el contacto" : ultimaOperacion ? "Abrir WhatsApp con el mensaje de la última operación de este día, listo para enviar" : "Abrir WhatsApp con el saldo listo para enviar"}>
            <MessageCircle size={14} /> {esConfirmaciones ? (variasOperaciones ? `Enviar las ${operacionesJuntas.length} operaciones` : ultimaOperacion ? "Enviar última operación" : "Enviar saldo") : "Enviar saldo"}
          </a>
        )}
        {/* La misma última operación, pero por uno de los WhatsApp vinculados al sistema: abre el aviso para elegir la línea y enviarlo */}
        {telefono && ultimaOperacion && (
          <button
            className="cc-whatsapp cc-whatsapp-vinculado"
            onClick={() => {
              setEstadoAviso("");
              setAbonoParaAvisar({ ...avisoDeMovimiento(ultimaOperacion), ...(variasOperaciones ? { texto: mensajeSaldo } : {}) });
            }}
            title="Enviar la última operación desde un WhatsApp vinculado al sistema (Bolívares, Pesos o Dólares): se elige la línea y sale sola"
          >
            <Send size={14} /> Enviar desde el vinculado
          </button>
        )}
        <button className="cc-descargar cc-compartir" onClick={compartir} disabled={!estado} title="Compartir una imagen con los movimientos">
          <Share2 size={14} /> Compartir reporte
        </button>
        <button className="cc-rango-enlace" onClick={() => setRango({ desde: dia, hasta: dia })} title="Generar el reporte de varios días: desde qué día hasta qué día">
          Por rango de fechas
        </button>
        <button className="cc-descargar" onClick={descargar} disabled={descargando} title="Descargar esta hoja en Excel">
          <Download size={14} /> {descargando ? "Descargando…" : "Descargar Excel"}
        </button>
      </div>

      {abonoParaAvisar && (
        <div className="cc-aviso-abono">
          <p>{mensajeAbono}</p>
          <div className="cc-aviso-abono-acciones">
            {/* Desde el WhatsApp personal, con el enlace de WhatsApp: siempre está. Sin teléfono registrado, se elige el contacto allá. */}
            <a className="cc-whatsapp" href={enlaceWhatsApp(telefono, mensajeAbono)} onClick={(e) => alAbrirWhatsApp(e, telefono, mensajeAbono)} target="_blank" rel="noreferrer" title="Abre WhatsApp con el mensaje escrito: lo envía usted desde su propio WhatsApp">
              <MessageCircle size={14} /> Por mi WhatsApp
            </a>
            {telefono ? (
              // Por el WhatsApp vinculado al sistema: se elige la línea y sale solo
              <span className="cc-aviso-vinculado">
                <select value={lineaAviso} onChange={(e) => elegirLineaAviso(Number(e.target.value) as LineaWa)} aria-label="Línea de WhatsApp por la que sale el aviso">
                  {LINEAS_WA.map((l) => {
                    const estado = lineasWa.find((x) => x.linea === l.id);
                    return (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                        {estado?.estado === "CONECTADO" ? (estado.numero ? ` · +${estado.numero}` : "") : " · sin vincular"}
                      </option>
                    );
                  })}
                </select>
                <button type="button" className="cc-guardar" onClick={avisarConElSistema} disabled={estadoAviso !== "" || !lineaConectada} title={lineaConectada ? "Sale solo por el WhatsApp vinculado de esa línea" : "Esa línea no está vinculada: se vincula en WhatsApp → Líneas"}>
                  {estadoAviso === "enviando" ? "Enviando…" : estadoAviso === "enviado" ? "Enviado ✓" : "Enviar por el vinculado"}
                </button>
                <button
                  type="button"
                  className="cc-btn-secundario"
                  onClick={() => abrirChatEnBurbuja({ telefono: telefono!, linea: lineaAviso, nombre: cuenta.tercero_nombre, texto: estadoAviso === "enviado" ? "" : mensajeAbono })}
                  title="Abre el chat con este cliente acá mismo, sin salir de la pantalla"
                >
                  Ver chat
                </button>
              </span>
            ) : (
              <span>Sin teléfono registrado: al abrir WhatsApp eliges el contacto.</span>
            )}
            <button type="button" className="cc-btn-secundario" onClick={() => setAbonoParaAvisar(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
      {imagenComprobante && (
        <Modal titulo="Comprobante" ancho="ancho" onCerrar={() => setImagenComprobante(null)}>
          <div className="cc-reporte">
            <img src={imagenComprobante} alt="Imagen del comprobante" />
          </div>
        </Modal>
      )}
      {rango && (
        <Modal titulo="Reporte por rango de fechas" onCerrar={() => setRango(null)}>
          <div className="cc-rango">
            <div className="cc-rango-fechas">
              <label>
                Desde
                <input type="date" value={rango.desde} max={hoyBogota()} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
              </label>
              <label>
                Hasta
                <input type="date" value={rango.hasta} min={rango.desde} max={hoyBogota()} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
              </label>
            </div>
            {!rangoValido && <p className="cc-form-error">El día "desde" tiene que ser anterior o igual al "hasta".</p>}
            <div className="cc-reporte-acciones">
              <button type="button" className="cc-guardar" disabled={!rangoValido || generandoRango} onClick={() => void reporteDelRango("imagen")}>
                {generandoRango ? "Generando…" : "Generar reporte"}
              </button>
              <button type="button" className="cc-btn-secundario" disabled={!rangoValido || generandoRango} onClick={() => void reporteDelRango("excel")}>
                Descargar Excel
              </button>
            </div>
          </div>
        </Modal>
      )}
      {reporte && (
        <Modal titulo="Reporte" ancho="ancho" onCerrar={cerrarReporte}>
          <div className="cc-reporte">
            <div className="cc-reporte-acciones">
              <button
                type="button"
                className="cc-guardar"
                onClick={() =>
                  copiarImagen(reporte.blob)
                    .then(() => setCopiado(true))
                    .catch(() => setError("Este navegador no deja copiar la imagen: usá Descargar."))
                }
              >
                {copiado ? "Copiada: pegala en WhatsApp (Ctrl+V)" : "Copiar imagen"}
              </button>
              <button type="button" className="cc-btn-secundario" onClick={() => descargarBlob(reporte.blob, reporte.nombre)}>
                Descargar
              </button>
              {/* Al cliente, desde uno de los WhatsApp vinculados al sistema */}
              {telefono && <EnviarReportePorVinculado telefono={telefono} nombre={cuenta.tercero_nombre} imagen={reporte.blob} nombreArchivo={reporte.nombre} monedaCodigo={cuenta.moneda_codigo} />}
            </div>
            <img src={reporte.url} alt="Reporte de movimientos" />
          </div>
        </Modal>
      )}
      {error && <p className="cc-form-error">{error}</p>}
      {estado?.cierre &&
        (estado.cierre.saldo_final === estado.saldoFinal ? (
          <p className="cc-cierre-aviso">
            Día {fechaDelDia(dia)} cerrado
            {/* si se cerró otro día (ej. el de ayer, hoy), se dice cuándo */}
            {new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(estado.cierre.created_at)) === dia
              ? " "
              : ` el ${fechaCorta(estado.cierre.created_at)} `}
            a las {new Date(estado.cierre.created_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" })} por{" "}
            {estado.cierre.usuario_nombre}.
          </p>
        ) : (
          <p className="cc-cierre-aviso pendiente">Hubo movimientos después del cierre de este día: volvé a cerrarlo para enviar el reporte actualizado.</p>
        ))}

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
            {estado && (
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
                  Sin movimientos este día.
                </td>
              </tr>
            )}
            {estado?.movimientos.map((m) => (
              <tr key={m.id} className={m.anulado ? "cc-anulado" : ""} title={`Cargado por ${m.usuario_nombre}`}>
                <td>{fechaCorta(m.fecha)}</td>
                <td className={Number(m.monto) < 0 && !m.anulado ? "cc-ref-abono" : ""}>
                  {m.descripcion ?? m.tipo}
                  {m.anulado && !m.reverso_de_id && <em> (anulado)</em>}
                  {m.cuenta_destino && <span className="cc-cuenta-destino-chip">→ {m.cuenta_destino}</span>}
                  {m.tiene_comprobante && (
                    <button type="button" className="cc-ver-comprobante" onClick={() => verComprobante(m.id)} title="Ver la imagen del comprobante">
                      <IconoImagen size={13} /> comprobante
                    </button>
                  )}
                  {m.pagado_en && <span className="cc-estado-conf ok">pagada en taquilla</span>}
                  {!m.anulado && m.estado_confirmacion && (
                    <span className={`cc-estado-conf ${m.estado_confirmacion === "EN_PROCESO" ? "proceso" : "ok"}`}>
                      {m.estado_confirmacion === "EN_PROCESO" ? "pendiente de confirmar" : "confirmada"}
                    </span>
                  )}
                  {m.movimiento_caja_id && <span className="cc-chip-caja">caja</span>}
                </td>
                <td className="num">{m.cantidad_base ? <Monto valor={m.cantidad_base} simbolo="" /> : ""}</td>
                <td className="num">{m.tasa ? tasaTexto(m.tasa, m.tasa_es_porcentaje, m.comision_descontada, m.comision_incluida) : ""}</td>
                <td className="num">
                  <Monto valor={m.monto} simbolo={simbolo} />
                </td>
                <td className="num cc-total">
                  <Monto valor={m.total} simbolo={simbolo} />
                </td>
                <td className="cc-acciones">
                  {!m.anulado && m.estado_confirmacion === "EN_PROCESO" && (
                    <button className="cc-confirmar" onClick={() => confirmar(m)} aria-label="Marcar como confirmada" title="Ya fue verificada: marcar como confirmada">
                      <CheckCircle2 size={15} />
                    </button>
                  )}
                  {!m.anulado && (cuenta.modulo === "CAJA" || !!m.estado_confirmacion || m.monto.startsWith("-") || /^\s*(abono|pago)/i.test(m.descripcion ?? "")) && (
                    <button
                      className="cc-avisar"
                      onClick={() => {
                        setEstadoAviso("");
                        setAbonoParaAvisar(avisoDeMovimiento(m));
                      }}
                      aria-label="Enviarle la confirmación al cliente"
                      title="Enviarle la confirmación al cliente"
                    >
                      <MessageCircle size={14} />
                    </button>
                  )}
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
              {esConfirmaciones && /[1-9]/.test(estado.enviado) && (
                <tr>
                  <td colSpan={2}>Enviado por el cliente en el día</td>
                  <td className="num">
                    <b>{formatearMonto(estado.enviado)}</b>
                  </td>
                  <td colSpan={4} />
                </tr>
              )}
              <tr>
                <td colSpan={4}>Sumas del día</td>
                <td className="num">
                  <Monto valor={estado.sumas} simbolo={simbolo} />
                </td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={4}>Abonos del día</td>
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
          cuenta={actual}
          medioElegido={medio}
          saldo={estado?.cuenta.saldo_actual ?? cuenta.saldo_actual}
          referencias={referencias}
          onOtraCuenta={onAbrirCuenta}
          onGuardado={(abono) => {
            void cargar();
            onActualizar();
            if (abono) {
              setEstadoAviso("");
              setAbonoParaAvisar(abono);
            }
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
  medioElegido = null,
  saldo,
  referencias,
  onGuardado,
  onOtraCuenta,
}: {
  cuenta: CuentaCorrienteResumen;
  medioElegido?: { id: number; nombre: string } | null;
  saldo: string;
  referencias: string[];
  // si lo guardado fue un abono, lo devuelve para poder confirmárselo al cliente
  onGuardado: (abono?: { monto: string; descripcion: string; sentido?: "recibe" | "retiro" | "proceso" | "confirmada"; enviado?: string; comision?: string }) => void;
  onOtraCuenta?: (cuentaId: number) => void;
}) {
  const [fecha, setFecha] = useState(hoyBogota());
  const [referencia, setReferencia] = useState("");
  const [persona, setPersona] = useState("");
  const [cuentaDestino, setCuentaDestino] = useState(""); // a qué cuenta del cliente se le pagó (opcional)
  // Western Union: se anota el MTCN y el movimiento nace en proceso de confirmación (Western tarda en verificar)
  const [mtcn, setMtcn] = useState("");
  // La confirmación de la transferencia es parte del movimiento: marcada entra confirmada; sin marcar, queda pendiente
  const [confirmada, setConfirmada] = useState(false);
  const [resta, setResta] = useState(false);
  const [cantidad, setCantidad] = useState("");
  // Cliente que se trabaja con comisión descontada: 1.000 - 4% = 960. El % de su primer movimiento ya viene puesto.
  // Confirmaciones: en vez de suma/abono se habla de "Compra" (le compramos al cliente lo que nos pasa: nos resta pesos o dólares
  // y queda a su favor hasta que se le paga) y "Venta" (le vendemos bolívares o dólares: nos aumenta el saldo en pesos)
  const enConfirmaciones = cuenta.modulo === "CAJA";
  // El medio de ESTE movimiento: en Confirmaciones, el elegido arriba; si no se eligió, el medio con que se registró el cliente
  const medioMov = enConfirmaciones && medioElegido ? medioElegido : { id: cuenta.canal_id, nombre: cuenta.canal_nombre };
  const medioCambiado = medioMov.id !== cuenta.canal_id;
  // qué referencias restan: en Confirmaciones, las ventas; en los demás módulos, los abonos
  const restaSegunReferencia = (r: string) => (enConfirmaciones ? /^\s*(venta|recibe)/i.test(r) : restaPorReferencia(r));
  // El cliente se trabaja con comisión (así se guardó con su primer movimiento): el formulario arranca en %, con el suyo
  const clienteConComision = cuenta.formula === "COMISION";
  // Qué hace "Comisión %": en Confirmaciones SIEMPRE descuenta de lo enviado (20.600 − 5% = 19.570), aunque el cliente
  // se haya registrado por tasa. En los demás módulos, salvo los clientes de comisión, es el monto de la comisión (el 5% de 20.600).
  const comisionDescuenta = clienteConComision || cuenta.modulo === "CAJA";
  const pctCuenta = comisionDescuenta && cuenta.comision_pct ? formatearMonto(cuenta.comision_pct) : "";
  // Cliente que se trabaja dividiendo (cuenta en USD o USDT, llega en pesos): el formulario abre en ese modo con su tasa
  const iniciaEnCobro = !clienteConComision && !!cuenta.moneda_cobro_codigo && !!cuenta.tasa_cobro && cuenta.formula == null;
  const [tasa, setTasa] = useState(iniciaEnCobro ? formatearMonto(cuenta.tasa_cobro!) : pctCuenta);
  const [esPorcentaje, setEsPorcentaje] = useState(clienteConComision); // comisión: cantidad x % (o cantidad - %) en vez de cantidad x tasa
  // Movimiento hecho en la moneda de cobro (ej. pagó en pesos una cuenta en dólares): cantidad ÷ tasa
  const [enCobro, setEnCobro] = useState(iniciaEnCobro);
  // Confirmaciones, "Se entrega en": llega en una moneda y se le entrega en otra (USDT × tasa = bolívares), igual que
  // al crear el cliente. Si no es la moneda de esta cuenta, el movimiento queda en la cuenta del mismo cliente en esa
  // moneda (se le abre sola si no la tiene). Abrir cuentas lo hacen el admin y el asesor.
  const { usuario } = useAuth();
  const puedeElegirEntrega = enConfirmaciones && (usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR");
  const [entregaEn, setEntregaEn] = useState(cuenta.moneda_codigo);
  const otraMoneda = puedeElegirEntrega && entregaEn !== cuenta.moneda_codigo;
  const codigoMonto = otraMoneda ? entregaEn : cuenta.moneda_codigo;
  const [montoDirecto, setMontoDirecto] = useState("");
  const [masOpciones, setMasOpciones] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<number | "">("");
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  // Qué le pasa a la caja con este movimiento: se propone solo (un abono entra, una venta sale) y se puede cambiar
  const [sentidoCaja, setSentidoCaja] = useState<"auto" | "entra" | "sale">("auto");
  // Mover una caja con el movimiento es opcional (casilla "También entra o sale de una caja o banco")
  const cajaObligatoria = false;
  const conCaja = cajaObligatoria || masOpciones;
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // En el teléfono el formulario es un panel que sube desde abajo; en escritorio está siempre a la vista
  const [abierta, setAbierta] = useState(false);
  const refInput = useRef<HTMLInputElement>(null);
  // Últimas tasas y comisiones usadas: se aplican con un toque, sin escribirlas
  const [recientes, setRecientes] = useState<TasasRecientes>({ tasas: [], porcentajes: [], tasaHabitual: null, referenciaFrecuente: null });
  // Si se cambia la tasa que venía puesta, queda esa para los próximos movimientos (la última usada).
  // Se puede desmarcar cuando es una tasa de una sola vez.
  const [mantenerTasa, setMantenerTasa] = useState(true);
  // Comisión: el % ya viene sumado en lo que envió el cliente (mandó 10.600 = 10.000 + 6%): recibe 10.600 ÷ 1,06
  const [comisionIncluida, setComisionIncluida] = useState(false);
  // Familiar o amigo: en este movimiento no se cobra comisión (lo que entra es lo que sale)
  const [sinComision, setSinComision] = useState(false);
  // Leer la imagen del comprobante: llena el número de referencia, el monto y la fecha
  const [leyendo, setLeyendo] = useState(false);
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  // La imagen se guarda con el movimiento al agregarlo, para verla después (en la hoja y en Taquilla)
  // El cliente puede mandar el monto en varias transferencias: se cargan varias capturas, se suman y se guardan juntas
  const [imagenesAdjuntas, setImagenesAdjuntas] = useState<File[]>([]);
  async function cargarComprobantes(archivos: File[]) {
    if (!archivos.length) return;
    setError(null);
    setAvisoLectura(null);
    setLeyendo(true);
    try {
      // ya había capturas cargadas: las nuevas se suman a lo que está escrito
      const sumando = imagenesAdjuntas.length > 0;
      const l = await leerCapturas(archivos, sumando ? persona : "");
      const yaEstaba = l.repetidas ? ` ${l.repetidas === 1 ? "Una captura ya estaba cargada" : `${l.repetidas} capturas ya estaban cargadas`} (misma referencia): no se sumó otra vez.` : "";
      if (!l.aceptadas.length) {
        setAvisoLectura(yaEstaba.trim());
        return;
      }
      setImagenesAdjuntas((lista) => [...lista, ...l.aceptadas]);
      const partes: string[] = [];
      if (l.referencias.length) partes.push(`referencia ${l.referencias.join(" / ")}`);
      if (l.total) partes.push(`monto ${formatearMonto(l.total)}${l.moneda ? ` ${l.moneda}` : ""}${l.aceptadas.length > 1 ? ` (suma de ${l.aceptadas.length} capturas)` : ""}`);
      if (sumando) {
        if (l.referencias.length) setPersona([persona.trim(), ...l.referencias].filter(Boolean).join(" / "));
        if (l.total) {
          const sumar = (previo: string) => formatearMonto(sumarDecimales(leerNumero(previo) ?? "0", l.total!));
          // se suma donde ya estaba el monto: en la cantidad (con tasa o comisión) o en el monto directo
          if (cantidad.trim()) setCantidad(sumar);
          else setMontoDirecto(sumar);
        }
      } else {
        const quien = [l.primera?.remitente, l.referencias.join(" / ")].filter(Boolean).join(" ");
        if (quien) setPersona(quien);
        if (l.total) {
          // En la moneda de la cuenta es el monto directo; en otra, es la cantidad y se aplica la tasa.
          // El cliente que trabaja con comisión siempre va por la cantidad: a lo enviado se le aplica su %.
          if ((!l.moneda || l.moneda === cuenta.moneda_codigo) && !clienteConComision) {
            setTasa("");
            setEsPorcentaje(false);
            setEnCobro(false);
            setMontoDirecto(formatearMonto(l.total));
          } else {
            setCantidad(formatearMonto(l.total));
          }
        }
        // La fecha de la captura no cambia la del movimiento: lo que se registra hoy queda en el día de hoy (con la fecha
        // de la captura quedaba escondido en otro día). Si es de otro día, se avisa y se cambia a mano en "Fecha".
        const fechaLeida = l.primera?.fecha;
        if (fechaLeida && fechaLeida < hoyBogota()) partes.push(`la captura es del ${fechaCorta(`${fechaLeida}T12:00:00-05:00`)} (el movimiento queda con la fecha de hoy)`);
      }
      setAvisoLectura(
        (partes.length
          ? `${sumando ? "Se sumó otra captura" : "Leído de la imagen"}${l.conIA ? " con IA" : ""}: ${partes.join(", ")}. Revisalo antes de agregar.`
          : "No encontré referencia, monto ni fecha en esa imagen: quedó adjunta, escribí los datos a mano.") + yaEstaba
      );
      setAbierta(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la imagen.");
    } finally {
      setLeyendo(false);
    }
  }
  const cargarRecientes = useCallback(() => {
    getTasasRecientes(cuenta.id)
      .then(setRecientes)
      .catch(() => {});
  }, [cuenta.id]);
  useEffect(cargarRecientes, [cargarRecientes]);

  // La referencia más usada con esta persona y la tasa de la cuenta vienen puestas: solo se llenan casilleros vacíos
  const tasaPuesta = recientes.tasaHabitual ? formatearMonto(recientes.tasaHabitual) : "";
  const referenciaPuesta = recientes.referenciaFrecuente ?? "";
  useEffect(() => {
    setTasa((t) => (t.trim() || esPorcentaje || enCobro ? t : tasaPuesta));
    setReferencia((r) => {
      if (r.trim() || !referenciaPuesta) return r;
      setResta(restaSegunReferencia(referenciaPuesta));
      return referenciaPuesta;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaPuesta, referenciaPuesta]);

  // Al pasar a "Comisión %" se propone el último porcentaje usado (queda guardado en este equipo)
  function activarPorcentaje() {
    setEsPorcentaje(true);
    if (tasa.trim() && !enCobro) return; // viniendo de dividir, lo escrito era una tasa: no sirve como %
    try {
      setTasa(pctCuenta || (recientes.porcentajes[0] ? formatearMonto(recientes.porcentajes[0]) : (localStorage.getItem(CLAVE_ULTIMA_COMISION) ?? "")));
    } catch {
      // sin almacenamiento disponible: se escribe a mano
    }
  }
  const cobroCodigo = cuenta.moneda_cobro_codigo && cuenta.tasa_cobro ? cuenta.moneda_cobro_codigo : null;
  // Dividir: lo que llega en otra moneda se divide por la tasa y queda en la moneda de la cuenta (82.500 COP ÷ 3.280 = 25,15 USD).
  // Con moneda de cobro configurada es esa. En Confirmaciones se puede dividir siempre, como al crear el cliente:
  // lo que llega es la moneda del medio; si es la misma de la cuenta, bolívares (o pesos si la cuenta no es en pesos).
  const MONEDA_DEL_MEDIO: Record<string, string> = { BOLIVARES: "VES", BANCOLOMBIA: "COP", NEQUI: "COP", USDT: "USDT", WESTERN_UNION: "USD", ZELLE: "USD" };
  const delMedio = MONEDA_DEL_MEDIO[medioMov.nombre];
  const codigoDivision =
    (otraMoneda ? null : cobroCodigo) ?? (enConfirmaciones ? (delMedio && delMedio !== codigoMonto ? delMedio : codigoMonto === "COP" ? "VES" : "COP") : null);
  function activarCobro() {
    if (enCobro) return;
    setEnCobro(true);
    setEsPorcentaje(false);
    // viene la tasa de cobro de la cuenta; sin ella se escribe (lo que había era una tasa de multiplicar o un %)
    setTasa(cuenta.tasa_cobro ? formatearMonto(cuenta.tasa_cobro) : "");
  }
  // Los guardados van en fila, uno detrás de otro: así quedan en el orden en que se cargaron
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const pendientes = useRef(0);
  const decimales = otraMoneda ? (entregaEn === "COP" ? 0 : 2) : Number(cuenta.moneda_decimales ?? 0);

  useEffect(() => {
    if (!conCaja || cajas.length > 0) return;
    getCajas()
      .then((lista) => {
        setCajas(lista);
        // La última caja usada viene elegida, igual que la tasa
        try {
          const ultima = Number(localStorage.getItem(CLAVE_ULTIMA_CAJA));
          if (lista.some((c) => c.id === ultima)) setCajaId((actual) => (actual === "" ? ultima : actual));
        } catch {
          // sin almacenamiento: se elige a mano
        }
      })
      .catch(() => setCajas([]));
    getMonedas()
      .then(setMonedas)
      .catch(() => setMonedas([]));
  }, [conCaja, cajas.length]);

  const nCantidad = cantidad.trim() ? leerNumero(cantidad) : null;
  // Lo escrito en la casilla (ej. "3" si es comisión) y el multiplicador que se guarda (3% -> "0.03")
  // (sin comisión: es como si en la casilla dijera 0, sin tocar el % habitual del cliente)
  const exonerado = sinComision && esPorcentaje && comisionDescuenta;
  const nEscrita = exonerado ? "0" : tasa.trim() ? leerNumero(tasa.replace(/%/g, "")) : null;
  const fraccion = nEscrita && esPorcentaje ? multiplicarDecimales(nEscrita, "0.01", 8) : null;
  // con comisión descontada el multiplicador es lo que queda: 4% -> 0.96
  // (o, si el % ya venía sumado en lo enviado, lo que hay que sacarle: 6% -> 1 ÷ 1,06)
  const incluida = comisionDescuenta && esPorcentaje && comisionIncluida;
  const nTasa = fraccion ? (comisionDescuenta ? factorDeComision(nEscrita!, incluida) : fraccion) : nEscrita;
  // lo que daría de la otra forma, para elegir de un vistazo
  const montoSiIncluida =
    comisionDescuenta && esPorcentaje && nCantidad && nEscrita && /[1-9]/.test(nEscrita) ? multiplicarDecimales(nCantidad.replace(/^-/, ""), factorDeComision(nEscrita, true), Number(cuenta.moneda_decimales ?? 0)) : null;
  const nDirecto = montoDirecto.trim() ? leerNumero(montoDirecto) : null;
  const conTasa = tasa.trim() !== "" || exonerado;
  // Ventas y abonos: se puede anotar quién hizo la transferencia; si entró por Zelle es obligatorio
  // Quién envió o el número de la transferencia: siempre se puede anotar; si entró por Zelle es obligatorio
  const pidePersona = !referencia.includes(SEPARADOR_PERSONA);
  // Si se anota un número de transferencia, no puede haber ya un movimiento con ese número
  const esWestern = /western/i.test(referencia) || medioMov.nombre === "WESTERN_UNION";
  const nMtcn = esWestern ? mtcn.replace(/\D/g, "") : "";
  // quién envió + el MTCN: así queda en la referencia del movimiento y entra en la revisión de números repetidos
  // Western Union y Zelle tardan en verificarse: pueden quedar pendientes, y ahí se elige si ya están confirmadas
  const esZelle = /zelle/i.test(referencia) || medioMov.nombre === "ZELLE";
  const llevaConfirmacion = esWestern || (enConfirmaciones && !resta && esZelle);
  // en Confirmaciones, una Compra que no es por Western entra confirmada de una vez: pasa directo a Taquilla
  const confirmadaDirecto = enConfirmaciones && !resta && !llevaConfirmacion;
  const personaCompleta = [persona.trim(), nMtcn ? `MTCN ${nMtcn}` : ""].filter(Boolean).join(" ");
  // con varias capturas hay varias referencias: ninguna puede estar ya registrada
  const numerosMovimiento = nMtcn.length >= 4 ? [nMtcn] : pidePersona ? codigosDeReferencia(persona) : [];
  const numeroMovimiento = numerosMovimiento[0] ?? null;
  const [repetido, setRepetido] = useState<MovimientoConNumero | null>(null);
  // En Confirmaciones el bloqueo es por medio de pago (el del cliente): la misma referencia puede estar en Bancolombia
  // y en Nequi, pero no dos veces en el mismo medio. En los demás módulos el medio no es el canal: se busca en todos.
  const canalDelBloqueo = enConfirmaciones ? medioMov.id : undefined;
  useEffect(() => {
    setRepetido(null);
    if (!numeroMovimiento) return;
    const t = setTimeout(() => {
      buscarMovimientoPorNumero(numeroMovimiento, canalDelBloqueo)
        .then(setRepetido)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [numeroMovimiento, canalDelBloqueo]);
  const avisoRepetido = (m: MovimientoConNumero, numero: string | null = numeroMovimiento) =>
    `Ya hay un movimiento con la referencia ${numero}${canalDelBloqueo && m.canal_nombre ? ` por ${m.canal_nombre.replace(/_/g, " ")}` : ""}: "${m.descripcion}" de ${m.tercero_nombre}, del ${fechaCorta(m.fecha)}.`;
  const personaObligatoria = pidePersona && /zelle/i.test(referencia);
  // Confirmaciones: si no se escribe la operación, es "Compra Nequi" / "Venta Zelle"… según el botón y el medio del cliente.
  // (La referencia de la transferencia es el otro casillero: llenar ese no tiene que pedir este.)
  const medioDelCliente = medioMov.nombre === "SIN_BANCO" ? "" : medioMov.nombre.toLowerCase().replace(/_/g, " ").replace(/(^|\s)\S/g, (l) => l.toUpperCase());
  const operacionPorDefecto = `${resta ? "Venta" : "Compra"}${medioDelCliente ? ` ${medioDelCliente}` : ""}`;
  const referenciaFinal = referencia.trim() || (enConfirmaciones ? operacionPorDefecto : "");
  const sinSigno = (v: string) => v.replace(/^-/, "");
  // Se escribió una tasa distinta a la que venía puesta
  const tasaModificada = !esPorcentaje && !enCobro && !!nEscrita && /[1-9]/.test(nEscrita) && nEscrita !== (recientes.tasaHabitual ?? "");

  // MONTO: cantidad x tasa, o el monto escrito a mano si no hay tasa (ej. "Abono efectivo")
  let monto: string | null = null;
  if (conTasa) {
    if (nCantidad && nTasa) monto = enCobro ? dividirDecimales(sinSigno(nCantidad), nTasa, decimales) : multiplicarDecimales(sinSigno(nCantidad), nTasa, decimales);
  } else if (nDirecto) {
    monto = sinSigno(nDirecto);
  }
  const montoConSigno = monto && /[1-9]/.test(monto) ? (resta ? `-${monto}` : monto) : null;
  // el total corrido es el de esta cuenta: si el movimiento va a la cuenta en otra moneda, acá no cambia
  const totalNuevo = montoConSigno && !otraMoneda ? sumarDecimales(saldo, montoConSigno) : null;

  // Lo que se mueve en la caja: la plata de verdad. Una venta de 403 USD saca 403 USD; un abono en pesos mete esos pesos.
  const monedaExtranjera =
    conTasa && !esPorcentaje && !enCobro && nCantidad && nTasa && codigoMonto === "COP" ? monedaDeLaTasa(nTasa, referencia) : null;
  const movimientoCaja = !monto
    ? null
    : enCobro && cobroCodigo && nCantidad
      ? { codigo: cobroCodigo, cantidad: sinSigno(nCantidad) }
      : monedaExtranjera && nCantidad
        ? { codigo: monedaExtranjera as string, cantidad: sinSigno(nCantidad) }
        : { codigo: codigoMonto, cantidad: monto };
  // lo que resta entra a la caja: un abono, o en Confirmaciones una Venta (nos pagan); una Compra o una suma sale
  const entraACaja = sentidoCaja === "auto" ? resta : sentidoCaja === "entra";
  const monedaCaja = movimientoCaja ? monedas.find((m) => m.codigo === movimientoCaja.codigo) : undefined;
  const monedaEntrega = monedas.find((m) => m.codigo === entregaEn);
  const simbolo = codigoMonto === "COP" ? "$" : "";

  function alCambiarReferencia(valor: string) {
    setReferencia(valor);
    // "Abono ..." resta, igual que en el Excel donde va en negativo
    if (restaSegunReferencia(valor)) setResta(true);
    else if (enConfirmaciones && /^\s*compra/i.test(valor)) setResta(false);
    if (/comisi[oó]n/i.test(valor) && !esPorcentaje) activarPorcentaje();
  }

  // Pegar una captura (Ctrl+V) en cualquier parte de la pantalla la lee como comprobante,
  // aunque el cursor no esté dentro del formulario
  const pegarImagen = useRef<(imagenes: File[]) => void>(() => {});
  pegarImagen.current = (imagenes) => {
    if (!leyendo) void cargarComprobantes(imagenes);
  };
  useEffect(() => {

    const alPegar = (e: globalThis.ClipboardEvent) => {
      const imagenes = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!imagenes.length) return; // texto u otra cosa: se pega normal
      e.preventDefault();
      pegarImagen.current(imagenes);
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!referenciaFinal) {
      return setError(
        persona.trim()
          ? 'Falta el primer casillero, "Referencia": ahí va qué es el movimiento (ej. Venta de Zelle, Abono efectivo). El número de la transferencia ya está en el de al lado.'
          : 'Escribí en "Referencia" qué es el movimiento (ej. Venta de Zelle, Abono efectivo).'
      );
    }
    if (personaObligatoria && persona.trim().length < 2) return setError("Si es por Zelle hace falta el nombre de quien envió la transferencia.");
    if (esWestern && nMtcn.length < 6) return setError("Por Western Union hace falta el MTCN (el número de referencia del envío).");
    if (cantidad.trim() && !nCantidad) return setError("La cantidad no es un número válido.");
    if (conTasa && (!nTasa || !/[1-9]/.test(nTasa) || nTasa.startsWith("-"))) return setError(esPorcentaje ? "El porcentaje no es un número válido." : "La tasa no es un número válido.");
    if (conTasa && esPorcentaje && comisionDescuenta && Number(nEscrita) >= 100) return setError("La comisión tiene que ser menor al 100%.");
    if (conTasa && !nCantidad) return setError(esPorcentaje ? "Para la comisión hace falta la cantidad sobre la que se cobra." : "Con tasa hace falta la cantidad.");
    if (!montoConSigno) return setError(conTasa ? "El monto da cero: revisá cantidad y tasa." : "Escribí cantidad y tasa, o el monto directo.");
    if (otraMoneda && !monedaEntrega) return setError(`No encuentro la moneda ${entregaEn} para entregar.`);
    if (conCaja && cajaId === "") return setError(cajaObligatoria ? "Elegí qué caja alimenta este movimiento." : "Elegí la caja o banco que también se mueve.");
    if (conCaja && !monedaCaja) return setError(`No encuentro la moneda ${movimientoCaja?.codigo ?? ""} para mover la caja.`);
    for (const numero of numerosMovimiento) {
      // se vuelve a consultar al guardar: el aviso de arriba puede no haber llegado todavía
      const ya = (numero === numeroMovimiento ? repetido : null) ?? (await buscarMovimientoPorNumero(numero, canalDelBloqueo).catch(() => null));
      if (ya) {
        if (numero === numeroMovimiento) setRepetido(ya);
        // referencia repetida: no se genera el movimiento y se avisa con una alerta
        const aviso = `${avisoRepetido(ya, numero)} No se puede registrar dos veces: el movimiento NO se generó.`;
        window.alert(`Referencia repetida\n\n${aviso}`);
        return setError(aviso);
      }
    }

    // La fila se limpia ya, para poder seguir cargando la siguiente sin esperar al servidor.
    // Si el guardado falla, se devuelve lo escrito (salvo que ya se esté escribiendo otra).
    if (conTasa && esPorcentaje) {
      try {
        localStorage.setItem(CLAVE_ULTIMA_COMISION, tasa.replace(/%/g, "").trim());
      } catch {
        // no es grave: solo no se recuerda
      }
    }
    // La tasa con la que se cobró en la otra moneda queda como la tasa de la cuenta (la última usada)
    const tasaCobroNueva = !otraMoneda && enCobro && conTasa && cuenta.moneda_cobro_id && nTasa !== cuenta.tasa_cobro ? { monedaCobroId: cuenta.moneda_cobro_id, tasaCobro: nTasa! } : null;
    const adjuntas = imagenesAdjuntas;
    setImagenesAdjuntas([]);
    setAvisoLectura(null);
    const escrito = { referencia, persona, mtcn, confirmada, cuentaDestino, cantidad, tasa, montoDirecto, resta, esPorcentaje, enCobro, entregaEn };
    setEnCobro(iniciaEnCobro);
    setEntregaEn(cuenta.moneda_codigo);
    setSentidoCaja("auto");
    if (conCaja && cajaId !== "") {
      try {
        localStorage.setItem(CLAVE_ULTIMA_CAJA, String(cajaId));
      } catch {
        // no es grave: solo no se recuerda
      }
    }
    // La tasa que queda para el próximo: la nueva si se marcó mantenerla; si no, la que venía puesta
    // (la tasa de un movimiento que se entrega en otra moneda no es la habitual de esta cuenta)
    const tasaQueQueda = tasaModificada && !otraMoneda ? (mantenerTasa ? nEscrita! : recientes.tasaHabitual) : null;
    const tasaSiguiente = tasaModificada && mantenerTasa && !otraMoneda ? formatearMonto(nEscrita!) : tasaPuesta;
    setRecientes((r) => (tasaModificada && mantenerTasa && !otraMoneda ? { ...r, tasaHabitual: nEscrita! } : r));
    setMantenerTasa(true);
    setComisionIncluida(false);
    setSinComision(false);
    setReferencia(referenciaPuesta);
    setPersona("");
    setCuentaDestino("");
    setMtcn("");
    setConfirmada(false);
    setCantidad("");
    // el cliente de comisión sigue en comisión, con su %
    // el que se trabaja dividiendo sigue con la tasa que se acaba de usar
    setTasa(clienteConComision ? pctCuenta || tasa : iniciaEnCobro && enCobro ? tasa : tasaSiguiente);
    setMontoDirecto("");
    setResta(restaSegunReferencia(referenciaPuesta));
    setEsPorcentaje(clienteConComision);
    if (window.matchMedia("(max-width: 860px)").matches) setAbierta(false);
    else refInput.current?.focus();
    const signo = resta ? "-" : "";
    const datos = {
      terceroId: cuenta.tercero_id,
      canalId: cuenta.canal_id,
      monedaId: cuenta.moneda_id,
      // Confirmaciones: el movimiento queda con su medio (puede no ser el medio con que se registró el cliente)
      ...(enConfirmaciones ? { canalMovimientoId: medioMov.id } : {}),
      tipo: resta ? ("ABONO" as const) : ("CARGO" as const),
      descripcion:
        (pidePersona && personaCompleta ? `${referenciaFinal}${SEPARADOR_PERSONA}${personaCompleta}` : referenciaFinal) +
        // lo que se movió de verdad en la moneda de cobro queda anotado en la referencia
        (enCobro && conTasa ? ` (${formatearMonto(sinSigno(nCantidad!))} ${codigoDivision} a ${formatearMonto(nTasa!)})` : ""),
      // Hoy va con la hora real; otra fecha, al mediodía de ese día
      fecha: fecha === hoyBogota() ? undefined : `${fecha}T12:00:00-05:00`,
      ...(conTasa && !enCobro ? { cantidadBase: `${signo}${sinSigno(nCantidad!)}`, tasa: nTasa!, tasaEsPorcentaje: esPorcentaje, comisionDescontada: esPorcentaje && comisionDescuenta, comisionIncluida: incluida } : { monto: montoConSigno }),
      cuentaDestino: cuentaDestino.trim() || undefined,
      ...(llevaConfirmacion
        ? { estadoConfirmacion: confirmada ? ("CONFIRMADA" as const) : ("EN_PROCESO" as const) }
        : confirmadaDirecto
          ? { estadoConfirmacion: "CONFIRMADA" as const }
          : {}),
      ...(conCaja && cajaId !== "" && movimientoCaja && monedaCaja
        ? { cajaId, monedaCajaId: monedaCaja.id, montoCaja: `${entraACaja ? "" : "-"}${movimientoCaja.cantidad}` }
        : {}),
    };
    pendientes.current++;
    setEnviando(true);
    let otraCuentaId: number | null = null;
    const turno = cola.current.then(async () => {
      if (!otraMoneda) return registrarMovimientoCC(datos);
      // se entrega en otra moneda: va a la cuenta de Confirmaciones del mismo cliente en esa moneda (se abre si no la tiene)
      const destino = await crearCuentaCorriente({ terceroId: cuenta.tercero_id, canalId: cuenta.canal_id, modulo: "CAJA", monedaId: monedaEntrega!.id, usarExistente: true });
      otraCuentaId = destino.id;
      return registrarMovimientoCC({ ...datos, canalId: destino.canal_id, monedaId: destino.moneda_id });
    });
    cola.current = turno.catch(() => {});
    try {
      const creado = await turno;
      // la tasa queda guardada apenas se registra el movimiento, sin esperar a que suba la imagen
      if (tasaQueQueda) await guardarTasaHabitual(cuenta.id, tasaQueQueda).catch(() => {});
      // la imagen del comprobante queda guardada con el movimiento; si no sube, el movimiento igual quedó
      // (varias capturas quedan en una sola imagen, una debajo de la otra)
      if (adjuntas.length) {
        await unirImagenes(adjuntas)
          .then((imagen) => subirComprobanteMovimiento(creado.movimiento.id, imagen))
          .catch((e) =>
            setError(`El movimiento se guardó, pero la imagen del comprobante no: ${(e as Error).message}`)
          );
      }
      // si no tiene permiso para cambiarla, la tasa de la cuenta queda como estaba
      if (tasaCobroNueva) await configurarCobroCuenta(cuenta.id, tasaCobroNueva).catch(() => {});
      cargarRecientes();
      // operación con comisión descontada: el aviso lleva lo que el cliente envió en total y el %
      const envio = esPorcentaje && comisionDescuenta && nCantidad && nEscrita ? { enviado: sinSigno(nCantidad), comision: nEscrita } : {};
      if (otraCuentaId !== null) {
        // quedó en la otra cuenta del cliente: se abre esa, que es donde está el movimiento (y desde ahí se le avisa)
        onGuardado();
        onOtraCuenta?.(otraCuentaId);
        return;
      }
      onGuardado(
        datos.estadoConfirmacion === "EN_PROCESO"
          ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion, sentido: "proceso", ...envio }
          : enConfirmaciones
          ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion, sentido: datos.tipo === "ABONO" ? "recibe" : "retiro", ...envio }
          : datos.tipo === "ABONO" || /^\s*(abono|pago)/i.test(datos.descripcion)
            ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion, ...envio }
            : undefined
      );
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar el movimiento.";
      setError(`"${escrito.referencia.trim() || referenciaFinal}" no se guardó: ${mensaje}`);
      setAbierta(true);
      if ((refInput.current?.value ?? "") === referenciaPuesta) {
        setReferencia(escrito.referencia);
        setPersona(escrito.persona);
        setCuentaDestino(escrito.cuentaDestino);
        setMtcn(escrito.mtcn);
        setConfirmada(escrito.confirmada);
        setCantidad(escrito.cantidad);
        setTasa(escrito.tasa);
        setMontoDirecto(escrito.montoDirecto);
        setResta(escrito.resta);
        setEsPorcentaje(escrito.esPorcentaje);
        setEnCobro(escrito.enCobro);
        setEntregaEn(escrito.entregaEn);
      }
    } finally {
      pendientes.current--;
      if (pendientes.current === 0) setEnviando(false);
    }
  }

  return (
    <>
    <button type="button" className="cc-fab" onClick={() => setAbierta(true)}>
      <Plus size={18} /> Nuevo movimiento
    </button>
    {abierta && <div className="cc-velo" onClick={() => setAbierta(false)} />}
    <form className={`cc-nueva ${abierta ? "abierta" : ""}`} onSubmit={guardar}>
      <div className="cc-nueva-titulo">
        Nuevo movimiento
        <label className={`cc-leer-comprobante ${leyendo ? "leyendo" : ""}`}>
          <Camera size={15} /> {leyendo ? "Leyendo la imagen…" : "Cargar o pegar comprobante"}
          <input
            type="file"
            title="Elegí la imagen, o pegala con Ctrl+V en cualquier parte de la pantalla"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={leyendo}
            onChange={(e) => {
              void cargarComprobantes([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="cc-cerrar-panel" onClick={() => setAbierta(false)} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
      {/* Confirmaciones: con qué medio entra este movimiento. El cliente es el mismo aunque cambie de medio. */}
      {enConfirmaciones && medioMov.nombre !== "SIN_BANCO" && (
        <p className={`cc-medio-mov ${medioCambiado ? "cambiado" : ""}`}>
          Medio de este movimiento: <strong>{medioDelCliente}</strong>
          {medioCambiado ? " (elegido arriba)" : " · para registrarlo por otro medio, elegilo en los botones de arriba"}
        </p>
      )}
      {puedeElegirEntrega && !esPorcentaje && monedas.length > 0 && (
        <label className={`cc-entrega-en ${otraMoneda ? "otra" : ""}`}>
          Se entrega en
          <select value={entregaEn} onChange={(e) => setEntregaEn(e.target.value)} aria-label="Moneda en la que se le entrega al cliente">
            {monedas.map((m) => (
              <option key={m.id} value={m.codigo}>
                {m.nombre} ({m.codigo})
              </option>
            ))}
          </select>
          <small>
            {otraMoneda
              ? `Cantidad ${enCobro ? "÷" : "×"} tasa = total en ${entregaEn}. Queda en la cuenta en ${entregaEn} de ${cuenta.tercero_nombre} (se le abre sola si no la tiene) y se abre esa hoja.`
              : "Llega en una moneda y se entrega en otra (ej. USDT × tasa = bolívares): elegí acá en cuál se le entrega."}
          </small>
        </label>
      )}
      <div className="cc-nueva-campos">
        <label className="cc-c-fecha">
          Fecha
          <input type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="cc-c-ref">
          {/* En Confirmaciones este casillero es la operación (se arma sola si queda vacío); la referencia de la transferencia va en el de al lado */}
          {enConfirmaciones ? "Operación" : "Referencia"}
          <input
            ref={refInput}
            list="cc-referencias"
            value={referencia}
            onChange={(e) => alCambiarReferencia(e.target.value)}
            placeholder={enConfirmaciones ? `${operacionPorDefecto} (se pone sola)` : "Venta de Zelle, Venta de bss, Abono dólares…"}
            autoComplete="off"
          />
          <datalist id="cc-referencias">
            {referencias.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        {pidePersona && (
          <label className="cc-c-persona">
            Referencia de la transferencia y quién envió{personaObligatoria ? "" : " (opcional)"}
            <input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Número de referencia, y el nombre de quien envió" autoComplete="off" />
            {repetido && <small className="cc-repetido">{avisoRepetido(repetido)}</small>}
          </label>
        )}
        {esWestern && (
          <label className="cc-c-mtcn">
            MTCN (referencia de Western Union)
            <input value={mtcn} onChange={(e) => setMtcn(e.target.value)} inputMode="numeric" placeholder="10 dígitos" autoComplete="off" />
          </label>
        )}
        <label className="cc-c-destino">
          Cuenta a la que se pagó (opcional)
          <input value={cuentaDestino} onChange={(e) => setCuentaDestino(e.target.value)} placeholder="ej. Bancolombia ahorros 1234, Nequi 300…" autoComplete="off" maxLength={120} />
        </label>
        <div className="cc-c-signo" role="group" aria-label={enConfirmaciones ? "Compra o venta" : "Suma o abono"}>
          <button
            type="button"
            className={!resta ? "activo suma" : ""}
            onClick={() => setResta(false)}
            aria-pressed={!resta}
            title={enConfirmaciones ? "Le compramos al cliente: nos resta pesos o dólares" : undefined}
          >
            {enConfirmaciones ? "Compra" : "+ Suma"}
          </button>
          <button
            type="button"
            className={resta ? "activo resta" : ""}
            onClick={() => setResta(true)}
            aria-pressed={resta}
            title={enConfirmaciones ? "Le vendemos al cliente: nos aumenta el saldo en pesos" : undefined}
          >
            {enConfirmaciones ? "Venta" : "− Abono"}
          </button>
        </div>
        <label className="cc-c-num">
          {enCobro ? `Cantidad en ${codigoDivision}` : "Cantidad"}
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="700.000" autoComplete="off" />
          <small>{nCantidad ? formatearMonto(sinSigno(nCantidad)) : " "}</small>
        </label>
        <span className="cc-operador" aria-hidden="true">
          {enCobro ? "÷" : "×"}
        </span>
        <div className="cc-c-num corto">
          <div className="cc-modo-tasa" role="group" aria-label="Tasa o comisión en porcentaje">
            <button
              type="button"
              className={!esPorcentaje && !enCobro ? "activo" : ""}
              onClick={() => {
                setEsPorcentaje(false);
                setEnCobro(false);
                if (esPorcentaje || enCobro) setTasa(tasaPuesta);
              }}
              aria-pressed={!esPorcentaje && !enCobro}
            >
              Tasa
            </button>
            <button
              type="button"
              className={esPorcentaje ? "activo" : ""}
              onClick={() => {
                setEnCobro(false);
                activarPorcentaje();
              }}
              aria-pressed={esPorcentaje}
            >
              Comisión %
            </button>
            {codigoDivision && (
              <button
                type="button"
                className={enCobro ? "activo" : ""}
                onClick={activarCobro}
                aria-pressed={enCobro}
                title={`Lo que llega en ${codigoDivision} se divide por la tasa y queda en ${codigoMonto}`}
              >
                Dividir ÷
              </button>
            )}
          </div>
          <input
            value={exonerado ? "0" : tasa}
            disabled={exonerado}
            onChange={(e) => setTasa(e.target.value)}
            inputMode="decimal"
            placeholder={esPorcentaje ? "3 (%)" : "3,2"}
            autoComplete="off"
            aria-label={esPorcentaje ? "Porcentaje de comisión" : "Tasa"}
          />
          <small>{nEscrita ? `${formatearMonto(nEscrita)}${esPorcentaje ? "%" : ""}` : " "}</small>
        </div>
        <span className="cc-operador" aria-hidden="true">
          =
        </span>
        <label className="cc-c-num monto">
          Monto
          {conTasa ? (
            <output className={`cc-resultado ${resta ? "cc-neg" : ""}`}>{monto ? `${resta ? "- " : ""}${simbolo}${formatearMonto(monto)}${otraMoneda ? ` ${entregaEn}` : ""}` : "—"}</output>
          ) : (
            <input value={montoDirecto} onChange={(e) => setMontoDirecto(e.target.value)} inputMode="decimal" placeholder="sin tasa: monto directo" autoComplete="off" />
          )}
          <small>{!conTasa && nDirecto ? `${resta ? "- " : ""}${simbolo}${formatearMonto(sinSigno(nDirecto))}` : " "}</small>
        </label>
        <button type="submit" className="cc-guardar">
          Agregar
        </button>
      </div>

      {avisoLectura && <p className="cc-aviso-lectura">{avisoLectura}</p>}
      {imagenesAdjuntas.length > 0 && (
        <p className="cc-imagen-adjunta">
          <IconoImagen size={14} />{" "}
          {imagenesAdjuntas.length === 1
            ? "Imagen del comprobante lista: se guarda con el movimiento. Si mandó el monto en varias transferencias, cargá o pegá las otras capturas y se suman."
            : `${imagenesAdjuntas.length} capturas cargadas: los montos están sumados y se guardan juntas con el movimiento.`}
          <button type="button" onClick={() => setImagenesAdjuntas([])}>
            Quitar
          </button>
        </p>
      )}
      {/* Discreto: familiar o amigo al que no se le cobra comisión en este movimiento */}
      {comisionDescuenta && esPorcentaje && (
        <label className="cc-sin-comision">
          <input type="checkbox" checked={sinComision} onChange={(e) => setSinComision(e.target.checked)} />
          Familiar o amigo: sin comisión{sinComision ? " (recibe lo mismo que envió)" : ""}
        </label>
      )}
      {comisionDescuenta && esPorcentaje && nEscrita && /[1-9]/.test(nEscrita) && !exonerado && (
        <label className="cc-check cc-mantener-tasa">
          <input type="checkbox" checked={comisionIncluida} onChange={(e) => setComisionIncluida(e.target.checked)} />
          Lo enviado ya trae el {formatearMonto(nEscrita)}% sumado
          <small>
            {montoSiIncluida
              ? `Marcalo si mandó el monto con la comisión encima: recibe ${simbolo}${formatearMonto(montoSiIncluida)} y queda registrado lo que envió.`
              : "Ej.: mandó 10.600 = 10.000 + 6%. Recibe 10.000 y queda registrado que envió 10.600."}
          </small>
        </label>
      )}
      {tasaModificada && (
        <label className="cc-check cc-mantener-tasa">
          <input type="checkbox" checked={mantenerTasa} onChange={(e) => setMantenerTasa(e.target.checked)} />
          Mantener {formatearMonto(nEscrita!)} como la tasa de esta cuenta
          {tasaPuesta && <small>{mantenerTasa ? `Desmarcalo si es solo por esta vez (volvería a ${tasaPuesta}).` : `Después de este movimiento vuelve a ${tasaPuesta}.`}</small>}
        </label>
      )}
      {(() => {
        // En modo cobro la última es la tasa de la cuenta; en comisión, los porcentajes; si no, las tasas
        const lista = esPorcentaje ? recientes.porcentajes : enCobro && cuenta.tasa_cobro ? [...new Set([cuenta.tasa_cobro, ...recientes.tasas])].slice(0, 5) : recientes.tasas;
        if (lista.length === 0) return null;
        return (
          <div className="cc-recientes">
            <span>{esPorcentaje ? "Últimas comisiones" : "Últimas tasas"}</span>
            {lista.map((v, i) => {
              const escrita = formatearMonto(v);
              return (
                <button key={v} type="button" className={tasa.trim() === escrita ? "activo" : ""} onClick={() => setTasa(escrita)} title={i === 0 ? "La última usada" : undefined}>
                  {escrita}{esPorcentaje ? "%" : ""}
                </button>
              );
            })}
          </div>
        );
      })()}

      {llevaConfirmacion && (
        <label className={`cc-check cc-confirmada ${confirmada ? "si" : ""}`}>
          <input type="checkbox" checked={confirmada} onChange={(e) => setConfirmada(e.target.checked)} />
          La transferencia ya está confirmada
          <small>{confirmada ? "Entra ya confirmada y pasa a Taquilla para pagarse." : "Sin marcar, queda pendiente: se confirma después, acá o en Taquilla."}</small>
        </label>
      )}
      <div className="cc-nueva-pie">
        {!cajaObligatoria && (
          <label className="cc-check">
            <input type="checkbox" checked={masOpciones} onChange={(e) => setMasOpciones(e.target.checked)} />
            También entra o sale de una caja o banco
          </label>
        )}
        {conCaja && (
          <span className="cc-caja-mov">
            <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")} aria-label="Caja que alimenta">
              <option value="">{cajaObligatoria ? "¿Qué caja alimenta?" : "Elegir caja o banco…"}</option>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <span className="cc-c-signo cc-sentido-caja" role="group" aria-label="Entra o sale de la caja">
              <button type="button" className={entraACaja ? "activo suma" : ""} onClick={() => setSentidoCaja("entra")} aria-pressed={entraACaja}>
                Entra
              </button>
              <button type="button" className={!entraACaja ? "activo resta" : ""} onClick={() => setSentidoCaja("sale")} aria-pressed={!entraACaja}>
                Sale
              </button>
            </span>
            {movimientoCaja && (
              <span className="cc-caja-mov-texto">
                {entraACaja ? "Entran" : "Salen"}{" "}
                <strong>
                  {formatearMonto(movimientoCaja.cantidad)} {movimientoCaja.codigo}
                </strong>
              </span>
            )}
          </span>
        )}
        {enviando && <span className="cc-guardando">Guardando…</span>}
        {enCobro && monto && nCantidad && nEscrita && (
          <span className="cc-explica-comision">
            {formatearMonto(sinSigno(nCantidad))} {codigoDivision} ÷ {formatearMonto(nEscrita)} ={" "}
            <strong>
              {simbolo}
              {formatearMonto(monto)} {codigoMonto}
            </strong>{" "}
            en la contabilidad
          </span>
        )}
        {esPorcentaje && monto && nCantidad && nEscrita && (
          <span className="cc-explica-comision">
            {incluida ? (
              <>
                {simbolo}
                {formatearMonto(sinSigno(nCantidad))} ya trae el {formatearMonto(nEscrita)}% sumado ={" "}
              </>
            ) : comisionDescuenta ? (
              <>
                {simbolo}
                {formatearMonto(sinSigno(nCantidad))} {exonerado ? "sin comisión (familiar o amigo)" : `− ${formatearMonto(nEscrita)}% de comisión`} ={" "}
              </>
            ) : (
              <>
                Comisión: el {formatearMonto(nEscrita)}% de {simbolo}
                {formatearMonto(sinSigno(nCantidad))} ={" "}
              </>
            )}
            <strong>{simbolo}{formatearMonto(monto)}</strong>
          </span>
        )}
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
    </>
  );
}
