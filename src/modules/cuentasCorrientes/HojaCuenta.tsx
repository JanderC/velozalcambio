import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, ChevronLeft, ChevronRight, Download, Lock, MessageCircle, Plus, Share2, Undo2, X } from "lucide-react";
import {
  anularMovimientoCC,
  confirmarMovimientoCC,
  avisarClienteCuenta,
  buscarMovimientoPorNumero,
  codigoDeReferencia,
  eliminarCuentaCorriente,
  type MovimientoConNumero,
  cerrarDiaCuenta,
  cambiarModuloCuentaCorriente,
  configurarCobroCuenta,
  descargarExcelEstadoCuenta,
  getCanales,
  getEstadoCuenta,
  getTasasRecientes,
  guardarTasaHabitual,
  type TasasRecientes,
  registrarMovimientoCC,
  type CuentaCorrienteResumen,
  type EstadoCuenta,
} from "../../api/cuentasCorrientes.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { EditarClienteModal } from "./EditarClienteModal";
import { compartirImagen, copiarImagen, descargarBlob, generarImagenReporte, monedaDeLaTasa } from "./imagenReporte";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { dividirDecimales, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { CobroModal } from "./CobroModal";
import { leerComprobante } from "./ocrComprobante";

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
function tasaTexto(tasa: string, esPorcentaje: boolean, descontada = false) {
  // comisión descontada: se guarda el factor (0.96) y se muestra -4%
  if (descontada) return `-${formatearMonto(sumarDecimales("100", `-${multiplicarDecimales(tasa, "100", 6)}`))}%`;
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
  // La hoja es diaria: se ve y se cierra un día a la vez
  const [dia, setDia] = useState(hoyBogota());
  const [cerrando, setCerrando] = useState(false);
  // En el computador el reporte se muestra en pantalla, para copiarlo o descargarlo
  const [reporte, setReporte] = useState<{ blob: Blob; url: string; nombre: string } | null>(null);
  // Abono recién cargado (o elegido en la tabla): se le puede confirmar al cliente por WhatsApp
  const [abonoParaAvisar, setAbonoParaAvisar] = useState<{ monto: string; descripcion: string; sentido?: "recibe" | "retiro" | "proceso" | "confirmada" } | null>(null);
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
  async function confirmar(m: { id: number; monto: string; descripcion: string | null; tipo: string }) {
    try {
      await confirmarMovimientoCC(m.id);
      await cargar();
      setEstadoAviso("");
      setAbonoParaAvisar({ monto: m.monto.replace(/^-/, ""), descripcion: m.descripcion ?? m.tipo, sentido: "confirmada" });
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

  // Pasarla a Cuentas por Cobrar (sale de Cuentas Corrientes y se sigue llevando igual allá), o devolverla
  async function mover() {
    const destino = cuenta.modulo === "POR_COBRAR" ? "CORRIENTE" : "POR_COBRAR";
    const pregunta =
      destino === "POR_COBRAR"
        ? `¿Pasar a ${cuenta.tercero_nombre} a Cuentas por Cobrar? Sale de Cuentas Corrientes y se sigue llevando igual desde allá.`
        : `¿Devolver a ${cuenta.tercero_nombre} a Cuentas Corrientes?`;
    if (!window.confirm(pregunta)) return;
    try {
      await cambiarModuloCuentaCorriente(cuenta.id, destino);
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
      await entregarReporte(await generarImagenReporte(estado, simbolo), `cierre-${dia}.png`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Cierre diario: deja anotado el saldo con el que cerró el día y manda el reporte del día como imagen
  async function cerrarDia() {
    setCerrando(true);
    try {
      const cerrado = await cerrarDiaCuenta(cuenta.id, dia);
      setEstado(cerrado);
      setError(null);
      await entregarReporte(await generarImagenReporte(cerrado, simbolo), `cierre-${dia}.png`);
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
  function construirAviso(a: Aviso) {
    const monto = `${simbolo}${formatearMonto(a.monto)}${sufijo}`;
    // La referencia va anotada en el movimiento después del " · ": el MTCN, o el código que se cargó. Solo eso, sin "Compra Zelle".
    const mtcn = /MTCN\s*(\d+)/i.exec(a.descripcion)?.[1];
    const anotado = (a.descripcion.split(SEPARADOR_PERSONA)[1] ?? "").replace(/ \([\d.,]+ [A-Z]{3,5} a [\d.,]+\)$/, "");
    const lineaRef = `Ref: ${mtcn ? `MTCN ${mtcn}` : (codigoDeReferencia(anotado) ?? "—")}`;
    const aviso = (frase: string, ...lineas: string[]) => `Estimado(a), le informamos que ${frase}\n\n${lineas.join("\n")}`;
    if (a.sentido === "proceso") return aviso("la operación está en proceso de confirmación.", lineaRef, `Monto: ${monto}`, "En breves minutos estará disponible");
    // en Confirmaciones una Compra que no quedó pendiente entra ya confirmada
    if (a.sentido === "confirmada" || a.sentido === "retiro") return aviso("la operación ha sido confirmada.", lineaRef, `Recibe: ${monto}`, "Disponible para recoger");
    // Venta: le vendimos al cliente
    if (a.sentido === "recibe") return aviso("su compra ha sido registrada.", lineaRef, `Monto: ${monto}`, saldoParaCliente);
    // abono en Cuentas Corrientes o Cuentas por Cobrar
    return aviso("hemos recibido su abono.", lineaRef, `Monto: ${monto}`, saldoParaCliente);
  }
  // Qué se le dice al cliente de un movimiento: según su estado de confirmación y, en Confirmaciones, si fue compra o venta
  const avisoDeMovimiento = (m: { monto: string; descripcion: string | null; tipo: string; estado_confirmacion: string | null }): Aviso => ({
    monto: m.monto.replace(/^-/, ""),
    descripcion: m.descripcion ?? m.tipo,
    ...(m.estado_confirmacion === "EN_PROCESO"
      ? { sentido: "proceso" as const }
      : m.estado_confirmacion === "CONFIRMADA"
        ? { sentido: "confirmada" as const }
        : esConfirmaciones
          ? { sentido: m.monto.startsWith("-") ? ("recibe" as const) : ("retiro" as const) }
          : {}),
  });
  const mensajeAbono = abonoParaAvisar ? construirAviso(abonoParaAvisar) : "";

  // Botón de arriba. En Confirmaciones se envía la última operación hecha (con su referencia), no el saldo global.
  const ultimaOperacion = esConfirmaciones ? [...(estado?.movimientos ?? [])].reverse().find((m) => !m.anulado) : undefined;
  const mensajeSaldo = ultimaOperacion
    ? construirAviso(avisoDeMovimiento(ultimaOperacion))
    : `Estimado(a), le informamos su saldo al ${fechaCorta(new Date().toISOString())}.\n\n${saldoParaCliente}`;

  async function avisarConElSistema() {
    setEstadoAviso("enviando");
    try {
      await avisarClienteCuenta(cuenta.id, mensajeAbono);
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
            </span>
          )}
          {cuenta.referencia && <span className="cc-hoy">Referencia: {cuenta.referencia}</span>}
          {puedeAnular && cuenta.modulo !== "CAJA" && (
            <button type="button" className="cc-mover" onClick={mover}>
              {cuenta.modulo === "POR_COBRAR" ? "Devolver a Cuentas Corrientes" : "Pasar a Cuentas por Cobrar"}
            </button>
          )}
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
        {telefono && (
          <a className="cc-whatsapp" href={`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeSaldo)}`} target="_blank" rel="noreferrer" title={ultimaOperacion ? "Abrir WhatsApp con el mensaje de la última operación de este día, listo para enviar" : "Abrir WhatsApp con el saldo listo para enviar"}>
            <MessageCircle size={14} /> {esConfirmaciones ? (ultimaOperacion ? "Enviar última operación" : "Enviar saldo") : "Enviar saldo"}
          </a>
        )}
        <button className="cc-descargar cc-compartir" onClick={compartir} disabled={!estado} title="Compartir una imagen con los movimientos">
          <Share2 size={14} /> Compartir reporte
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
            <a className="cc-whatsapp" href={`https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(mensajeAbono)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={14} /> Enviar desde mi WhatsApp
            </a>
            {telefono ? (
              <button type="button" className="cc-guardar" onClick={avisarConElSistema} disabled={estadoAviso !== ""}>
                {estadoAviso === "enviando" ? "Enviando…" : estadoAviso === "enviado" ? "Enviado por el sistema" : "Enviar por el sistema"}
              </button>
            ) : (
              <span>Sin teléfono registrado: al abrir WhatsApp eliges el contacto.</span>
            )}
            <button type="button" className="cc-btn-secundario" onClick={() => setAbonoParaAvisar(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
      {reporte && (
        <Modal titulo="Reporte del día" ancho="ancho" onCerrar={cerrarReporte}>
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
            </div>
            <img src={reporte.url} alt="Reporte de movimientos del día" />
          </div>
        </Modal>
      )}
      {error && <p className="cc-form-error">{error}</p>}
      {estado?.cierre &&
        (estado.cierre.saldo_final === estado.saldoFinal ? (
          <p className="cc-cierre-aviso">
            Día cerrado a las {new Date(estado.cierre.created_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" })} por{" "}
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
                  {!m.anulado && m.estado_confirmacion && (
                    <span className={`cc-estado-conf ${m.estado_confirmacion === "EN_PROCESO" ? "proceso" : "ok"}`}>
                      {m.estado_confirmacion === "EN_PROCESO" ? "pendiente de confirmar" : "confirmada"}
                    </span>
                  )}
                  {m.movimiento_caja_id && <span className="cc-chip-caja">caja</span>}
                </td>
                <td className="num">{m.cantidad_base ? <Monto valor={m.cantidad_base} simbolo="" /> : ""}</td>
                <td className="num">{m.tasa ? tasaTexto(m.tasa, m.tasa_es_porcentaje, m.comision_descontada) : ""}</td>
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
          saldo={estado?.cuenta.saldo_actual ?? cuenta.saldo_actual}
          referencias={referencias}
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
  saldo,
  referencias,
  onGuardado,
}: {
  cuenta: CuentaCorrienteResumen;
  saldo: string;
  referencias: string[];
  // si lo guardado fue un abono, lo devuelve para poder confirmárselo al cliente
  onGuardado: (abono?: { monto: string; descripcion: string; sentido?: "recibe" | "retiro" | "proceso" | "confirmada" }) => void;
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
  // qué referencias restan: en Confirmaciones, las ventas; en los demás módulos, los abonos
  const restaSegunReferencia = (r: string) => (enConfirmaciones ? /^\s*(venta|recibe)/i.test(r) : restaPorReferencia(r));
  const comisionDescuenta = cuenta.formula === "COMISION";
  const pctCuenta = comisionDescuenta && cuenta.comision_pct ? formatearMonto(cuenta.comision_pct) : "";
  // Cliente que se trabaja dividiendo (cuenta en USD o USDT, llega en pesos): el formulario abre en ese modo con su tasa
  const iniciaEnCobro = !comisionDescuenta && !!cuenta.moneda_cobro_codigo && !!cuenta.tasa_cobro && cuenta.formula == null;
  const [tasa, setTasa] = useState(iniciaEnCobro ? formatearMonto(cuenta.tasa_cobro!) : pctCuenta);
  const [esPorcentaje, setEsPorcentaje] = useState(comisionDescuenta); // comisión: cantidad x % (o cantidad - %) en vez de cantidad x tasa
  // Movimiento hecho en la moneda de cobro (ej. pagó en pesos una cuenta en dólares): cantidad ÷ tasa
  const [enCobro, setEnCobro] = useState(iniciaEnCobro);
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
  // Si se cambia la tasa que venía puesta: ¿queda esta para los próximos movimientos?
  const [mantenerTasa, setMantenerTasa] = useState(false);
  // Leer la imagen del comprobante: llena el número de referencia, el monto y la fecha
  const [leyendo, setLeyendo] = useState(false);
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  async function cargarComprobante(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setAvisoLectura(null);
    setLeyendo(true);
    try {
      const d = await leerComprobante(archivo);
      const partes: string[] = [];
      const quien = [d.remitente, d.referencia].filter(Boolean).join(" ");
      if (quien) {
        setPersona(quien);
        if (d.referencia) partes.push(`referencia ${d.referencia}`);
      }
      if (d.monto) {
        // En la moneda de la cuenta es el monto directo; en otra, es la cantidad y se aplica la tasa
        if (!d.moneda || d.moneda === cuenta.moneda_codigo) {
          setTasa("");
          setEsPorcentaje(false);
          setEnCobro(false);
          setMontoDirecto(formatearMonto(d.monto));
        } else {
          setCantidad(formatearMonto(d.monto));
        }
        partes.push(`monto ${formatearMonto(d.monto)}${d.moneda ? ` ${d.moneda}` : ""}`);
      }
      if (d.fecha && d.fecha <= hoyBogota()) {
        setFecha(d.fecha);
        partes.push(`fecha ${fechaCorta(`${d.fecha}T12:00:00-05:00`)}`);
      }
      setAvisoLectura(partes.length ? `Leído de la imagen: ${partes.join(", ")}. Revisalo antes de agregar.` : "No encontré referencia, monto ni fecha en esa imagen.");
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
    if (tasa.trim()) return;
    try {
      setTasa(pctCuenta || (recientes.porcentajes[0] ? formatearMonto(recientes.porcentajes[0]) : (localStorage.getItem(CLAVE_ULTIMA_COMISION) ?? "")));
    } catch {
      // sin almacenamiento disponible: se escribe a mano
    }
  }
  const cobroCodigo = cuenta.moneda_cobro_codigo && cuenta.tasa_cobro ? cuenta.moneda_cobro_codigo : null;
  function activarCobro() {
    setEnCobro(true);
    setEsPorcentaje(false);
    if (cuenta.tasa_cobro) setTasa(formatearMonto(cuenta.tasa_cobro));
  }
  // Los guardados van en fila, uno detrás de otro: así quedan en el orden en que se cargaron
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const pendientes = useRef(0);
  const decimales = Number(cuenta.moneda_decimales ?? 0);

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
  const nEscrita = tasa.trim() ? leerNumero(tasa.replace(/%/g, "")) : null;
  const fraccion = nEscrita && esPorcentaje ? multiplicarDecimales(nEscrita, "0.01", 8) : null;
  // con comisión descontada el multiplicador es lo que queda: 4% -> 0.96
  const nTasa = fraccion ? (comisionDescuenta ? sumarDecimales("1", `-${fraccion}`) : fraccion) : nEscrita;
  const nDirecto = montoDirecto.trim() ? leerNumero(montoDirecto) : null;
  const conTasa = tasa.trim() !== "";
  // Ventas y abonos: se puede anotar quién hizo la transferencia; si entró por Zelle es obligatorio
  // Quién envió o el número de la transferencia: siempre se puede anotar; si entró por Zelle es obligatorio
  const pidePersona = !referencia.includes(SEPARADOR_PERSONA);
  // Si se anota un número de transferencia, no puede haber ya un movimiento con ese número
  const esWestern = /western/i.test(referencia) || cuenta.canal_nombre === "WESTERN_UNION";
  const nMtcn = esWestern ? mtcn.replace(/\D/g, "") : "";
  // quién envió + el MTCN: así queda en la referencia del movimiento y entra en la revisión de números repetidos
  // Lleva confirmación lo que llega por transferencia: en Confirmaciones, lo que le compramos al cliente (Compra); y todo Western Union
  const llevaConfirmacion = esWestern || (enConfirmaciones && !resta);
  const personaCompleta = [persona.trim(), nMtcn ? `MTCN ${nMtcn}` : ""].filter(Boolean).join(" ");
  const numeroMovimiento = nMtcn.length >= 4 ? nMtcn : pidePersona ? codigoDeReferencia(persona) : null;
  const [repetido, setRepetido] = useState<MovimientoConNumero | null>(null);
  useEffect(() => {
    setRepetido(null);
    if (!numeroMovimiento) return;
    const t = setTimeout(() => {
      buscarMovimientoPorNumero(numeroMovimiento)
        .then(setRepetido)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [numeroMovimiento]);
  const avisoRepetido = (m: MovimientoConNumero) =>
    `Ya hay un movimiento con la referencia ${numeroMovimiento}: "${m.descripcion}" de ${m.tercero_nombre}, del ${fechaCorta(m.fecha)}.`;
  const personaObligatoria = pidePersona && /zelle/i.test(referencia);
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
  const totalNuevo = montoConSigno ? sumarDecimales(saldo, montoConSigno) : null;

  // Lo que se mueve en la caja: la plata de verdad. Una venta de 403 USD saca 403 USD; un abono en pesos mete esos pesos.
  const monedaExtranjera =
    conTasa && !esPorcentaje && !enCobro && nCantidad && nTasa && cuenta.moneda_codigo === "COP" ? monedaDeLaTasa(nTasa, referencia) : null;
  const movimientoCaja = !monto
    ? null
    : enCobro && cobroCodigo && nCantidad
      ? { codigo: cobroCodigo, cantidad: sinSigno(nCantidad) }
      : monedaExtranjera && nCantidad
        ? { codigo: monedaExtranjera as string, cantidad: sinSigno(nCantidad) }
        : { codigo: cuenta.moneda_codigo, cantidad: monto };
  // lo que resta entra a la caja: un abono, o en Confirmaciones una Venta (nos pagan); una Compra o una suma sale
  const entraACaja = sentidoCaja === "auto" ? resta : sentidoCaja === "entra";
  const monedaCaja = movimientoCaja ? monedas.find((m) => m.codigo === movimientoCaja.codigo) : undefined;
  const simbolo = cuenta.moneda_codigo === "COP" ? "$" : "";

  function alCambiarReferencia(valor: string) {
    setReferencia(valor);
    // "Abono ..." resta, igual que en el Excel donde va en negativo
    if (restaSegunReferencia(valor)) setResta(true);
    else if (enConfirmaciones && /^\s*compra/i.test(valor)) setResta(false);
    if (/comisi[oó]n/i.test(valor) && !esPorcentaje) activarPorcentaje();
  }

  // Pegar una captura (Ctrl+V) en cualquier parte del formulario la lee como comprobante
  function alPegar(e: ClipboardEvent<HTMLFormElement>) {
    const imagen = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!imagen || leyendo) return;
    e.preventDefault();
    void cargarComprobante(imagen);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!referencia.trim()) return setError("Escribí la referencia (a quién o qué es).");
    if (personaObligatoria && persona.trim().length < 2) return setError("Si es por Zelle hace falta el nombre de quien envió la transferencia.");
    if (esWestern && nMtcn.length < 6) return setError("Por Western Union hace falta el MTCN (el número de referencia del envío).");
    if (cantidad.trim() && !nCantidad) return setError("La cantidad no es un número válido.");
    if (conTasa && (!nTasa || !/[1-9]/.test(nTasa) || nTasa.startsWith("-"))) return setError(esPorcentaje ? "El porcentaje no es un número válido." : "La tasa no es un número válido.");
    if (conTasa && esPorcentaje && comisionDescuenta && Number(nEscrita) >= 100) return setError("La comisión tiene que ser menor al 100%.");
    if (conTasa && !nCantidad) return setError(esPorcentaje ? "Para la comisión hace falta la cantidad sobre la que se cobra." : "Con tasa hace falta la cantidad.");
    if (!montoConSigno) return setError(conTasa ? "El monto da cero: revisá cantidad y tasa." : "Escribí cantidad y tasa, o el monto directo.");
    if (conCaja && cajaId === "") return setError(cajaObligatoria ? "Elegí qué caja alimenta este movimiento." : "Elegí la caja o banco que también se mueve.");
    if (conCaja && !monedaCaja) return setError(`No encuentro la moneda ${movimientoCaja?.codigo ?? ""} para mover la caja.`);
    if (numeroMovimiento) {
      // se vuelve a consultar al guardar: el aviso de arriba puede no haber llegado todavía
      const ya = repetido ?? (await buscarMovimientoPorNumero(numeroMovimiento).catch(() => null));
      if (ya) {
        setRepetido(ya);
        // referencia repetida: no se genera el movimiento y se avisa con una alerta
        const aviso = `${avisoRepetido(ya)} No se puede registrar dos veces: el movimiento NO se generó.`;
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
    const tasaCobroNueva = enCobro && conTasa && cuenta.moneda_cobro_id && nTasa !== cuenta.tasa_cobro ? { monedaCobroId: cuenta.moneda_cobro_id, tasaCobro: nTasa! } : null;
    const escrito = { referencia, persona, mtcn, confirmada, cuentaDestino, cantidad, tasa, montoDirecto, resta, esPorcentaje, enCobro };
    setEnCobro(iniciaEnCobro);
    setSentidoCaja("auto");
    if (conCaja && cajaId !== "") {
      try {
        localStorage.setItem(CLAVE_ULTIMA_CAJA, String(cajaId));
      } catch {
        // no es grave: solo no se recuerda
      }
    }
    // La tasa que queda para el próximo: la nueva si se marcó mantenerla; si no, la que venía puesta
    const tasaQueQueda = tasaModificada ? (mantenerTasa ? nEscrita! : recientes.tasaHabitual) : null;
    const tasaSiguiente = tasaModificada && mantenerTasa ? formatearMonto(nEscrita!) : tasaPuesta;
    setRecientes((r) => (tasaModificada && mantenerTasa ? { ...r, tasaHabitual: nEscrita! } : r));
    setMantenerTasa(false);
    setReferencia(referenciaPuesta);
    setPersona("");
    setCuentaDestino("");
    setMtcn("");
    setConfirmada(false);
    setCantidad("");
    // el cliente de comisión sigue en comisión, con su %
    // el que se trabaja dividiendo sigue con la tasa que se acaba de usar
    setTasa(comisionDescuenta ? pctCuenta || tasa : iniciaEnCobro && enCobro ? tasa : tasaSiguiente);
    setMontoDirecto("");
    setResta(restaSegunReferencia(referenciaPuesta));
    setEsPorcentaje(comisionDescuenta);
    if (window.matchMedia("(max-width: 860px)").matches) setAbierta(false);
    else refInput.current?.focus();
    const signo = resta ? "-" : "";
    const datos = {
      terceroId: cuenta.tercero_id,
      canalId: cuenta.canal_id,
      monedaId: cuenta.moneda_id,
      tipo: resta ? ("ABONO" as const) : ("CARGO" as const),
      descripcion:
        (pidePersona && personaCompleta ? `${referencia.trim()}${SEPARADOR_PERSONA}${personaCompleta}` : referencia.trim()) +
        // lo que se movió de verdad en la moneda de cobro queda anotado en la referencia
        (enCobro && conTasa ? ` (${formatearMonto(sinSigno(nCantidad!))} ${cobroCodigo} a ${formatearMonto(nTasa!)})` : ""),
      // Hoy va con la hora real; otra fecha, al mediodía de ese día
      fecha: fecha === hoyBogota() ? undefined : `${fecha}T12:00:00-05:00`,
      ...(conTasa && !enCobro ? { cantidadBase: `${signo}${sinSigno(nCantidad!)}`, tasa: nTasa!, tasaEsPorcentaje: esPorcentaje, comisionDescontada: esPorcentaje && comisionDescuenta } : { monto: montoConSigno }),
      cuentaDestino: cuentaDestino.trim() || undefined,
      ...(llevaConfirmacion ? { estadoConfirmacion: confirmada ? ("CONFIRMADA" as const) : ("EN_PROCESO" as const) } : {}),
      ...(conCaja && cajaId !== "" && movimientoCaja && monedaCaja
        ? { cajaId, monedaCajaId: monedaCaja.id, montoCaja: `${entraACaja ? "" : "-"}${movimientoCaja.cantidad}` }
        : {}),
    };
    pendientes.current++;
    setEnviando(true);
    const turno = cola.current.then(() => registrarMovimientoCC(datos));
    cola.current = turno.catch(() => {});
    try {
      await turno;
      // si no tiene permiso para cambiarla, la tasa de la cuenta queda como estaba
      if (tasaCobroNueva) await configurarCobroCuenta(cuenta.id, tasaCobroNueva).catch(() => {});
      if (tasaQueQueda) await guardarTasaHabitual(cuenta.id, tasaQueQueda).catch(() => {});
      cargarRecientes();
      onGuardado(
        datos.estadoConfirmacion === "EN_PROCESO"
          ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion, sentido: "proceso" }
          : enConfirmaciones
          ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion, sentido: datos.tipo === "ABONO" ? "recibe" : "retiro" }
          : datos.tipo === "ABONO" || /^\s*(abono|pago)/i.test(datos.descripcion)
            ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion }
            : undefined
      );
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar el movimiento.";
      setError(`"${escrito.referencia.trim()}" no se guardó: ${mensaje}`);
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
    <form className={`cc-nueva ${abierta ? "abierta" : ""}`} onSubmit={guardar} onPaste={alPegar}>
      <div className="cc-nueva-titulo">
        Nuevo movimiento
        <label className={`cc-leer-comprobante ${leyendo ? "leyendo" : ""}`}>
          <Camera size={15} /> {leyendo ? "Leyendo la imagen…" : "Cargar o pegar comprobante"}
          <input
            type="file"
            title="Elegí la imagen, o pegala con Ctrl+V en el formulario"
            accept="image/jpeg,image/png,image/webp"
            disabled={leyendo}
            onChange={(e) => {
              void cargarComprobante(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="cc-cerrar-panel" onClick={() => setAbierta(false)} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
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
            placeholder="Venta de Zelle, Venta de bss, Abono dólares…"
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
          {enCobro ? `Cantidad en ${cobroCodigo}` : "Cantidad"}
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
            {cobroCodigo && (
              <button type="button" className={enCobro ? "activo" : ""} onClick={activarCobro} aria-pressed={enCobro}>
                En {cobroCodigo}
              </button>
            )}
          </div>
          <input
            value={tasa}
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

      {avisoLectura && <p className="cc-aviso-lectura">{avisoLectura}</p>}
      {tasaModificada && (
        <label className="cc-check cc-mantener-tasa">
          <input type="checkbox" checked={mantenerTasa} onChange={(e) => setMantenerTasa(e.target.checked)} />
          Mantener {formatearMonto(nEscrita!)} como la tasa de esta cuenta
          {tasaPuesta && !mantenerTasa && <small>Si no, después de este movimiento vuelve a {tasaPuesta}.</small>}
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
          Transferencia confirmada
          <small>{confirmada ? "Entra al sistema ya confirmada." : "Sin marcar, entra como pendiente de confirmar."}</small>
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
            {formatearMonto(sinSigno(nCantidad))} {cobroCodigo} ÷ {formatearMonto(nEscrita)} ={" "}
            <strong>
              {simbolo}
              {formatearMonto(monto)} {cuenta.moneda_codigo}
            </strong>{" "}
            en la contabilidad
          </span>
        )}
        {esPorcentaje && monto && nCantidad && nEscrita && (
          <span className="cc-explica-comision">
            {comisionDescuenta ? (
              <>
                {simbolo}
                {formatearMonto(sinSigno(nCantidad))} − {formatearMonto(nEscrita)}% de comisión ={" "}
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
