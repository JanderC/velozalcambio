import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Lock, MessageCircle, Plus, Share2, Undo2, X } from "lucide-react";
import {
  anularMovimientoCC,
  avisarClienteCuenta,
  buscarMovimientoPorNumero,
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
import { actualizarTercero } from "../../api/terceros.api";
import { compartirImagen, copiarImagen, descargarBlob, generarImagenReporte, monedaDeLaTasa } from "./imagenReporte";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { dividirDecimales, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { CobroModal } from "./CobroModal";

const REFERENCIAS_COMUNES = ["Venta de Zelle", "Venta de bss", "Venta de USDT", "Deteriorado", "Comisión", "Abono Zelle", "Abono dólares", "Abono efectivo", "Abono transferencia"];

// Referencias que no se sugieren, aunque exista el banco o se hayan usado antes
const REFERENCIAS_OCULTAS = /^(venta de (bancolombia|proveedor(es)?|western union)|abono nequi)$/i;

// Un abono resta solo. El abono por transferencia no: a veces suma y a veces resta, se elige a mano
const restaPorReferencia = (referencia: string) => /^\s*(abono|pago)/i.test(referencia) && !/transferencia/i.test(referencia);

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
function tasaTexto(tasa: string, esPorcentaje: boolean) {
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
  const [abonoParaAvisar, setAbonoParaAvisar] = useState<{ monto: string; descripcion: string } | null>(null);
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

  async function cambiarNombre() {
    const nombre = window.prompt("Nombre", cuenta.tercero_nombre)?.trim();
    if (!nombre || nombre === cuenta.tercero_nombre) return;
    try {
      await actualizarTercero(cuenta.tercero_id, { nombre });
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
  const cobro =
    actual.moneda_cobro_codigo && actual.tasa_cobro
      ? {
          codigo: actual.moneda_cobro_codigo,
          tasa: actual.tasa_cobro,
          equivalente: multiplicarDecimales(saldoActual.replace(/^-/, ""), actual.tasa_cobro, Number(actual.moneda_cobro_decimales ?? 0)),
        }
      : actual.valor_moneda
        ? // sin moneda de cobro configurada: el valor de su moneda en pesos, a la última tasa usada
          { codigo: "COP", tasa: actual.valor_moneda, equivalente: multiplicarDecimales(saldoActual.replace(/^-/, ""), actual.valor_moneda, 0) }
        : null;
  const equivalenteTexto = cobro ? (cobro.codigo === "COP" ? `$${formatearMonto(cobro.equivalente)} COP` : `${formatearMonto(cobro.equivalente)} ${cobro.codigo}`) : "";
  // Igual que el Excel: en negativo es lo que yo le debo
  const lecturaSaldo = !/[1-9]/.test(saldoActual) ? "Saldo" : saldoActual.startsWith("-") ? "Yo le debo" : "Me debe";
  // Enlace a WhatsApp (sin API): abre el chat del cliente con el saldo ya escrito, listo para enviar
  const telefono = telefonoWhatsApp(estado?.cuenta.tercero_telefono ?? cuenta.tercero_telefono);
  const saldoSinSigno = `${simbolo}${formatearMonto(saldoActual.replace(/^-/, ""))}${sufijo}`;
  const mensajeSaldo =
    `Hola ${cuenta.tercero_nombre}, te comparto tu saldo al ${fechaCorta(new Date().toISOString())}: ` +
    (lecturaSaldo === "Yo le debo"
      ? `tienes un saldo a favor de ${saldoSinSigno} (es lo que te debemos).`
      : lecturaSaldo === "Me debe"
        ? `tienes un saldo pendiente por pagar de ${saldoSinSigno}.`
        : "tu cuenta está al día, sin saldo pendiente.") +
    (cobro && lecturaSaldo !== "Saldo" ? ` Equivale a ${equivalenteTexto} (tasa ${formatearMonto(cobro.tasa)}).` : "");
  // Confirmación de un abono: "he recibido tanto" y cómo queda el saldo
  const mensajeAbono = abonoParaAvisar
    ? `Hola ${cuenta.tercero_nombre}, he recibido ${simbolo}${formatearMonto(abonoParaAvisar.monto)}${sufijo} (${abonoParaAvisar.descripcion}). ` +
      (lecturaSaldo === "Yo le debo"
        ? `Tu saldo a favor queda en ${saldoSinSigno}.`
        : lecturaSaldo === "Me debe"
          ? `Tu saldo pendiente queda en ${saldoSinSigno}.`
          : "Quedas al día, sin saldo pendiente.")
    : "";

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
              {dia === hoyBogota() ? "Hoy" : fechaCorta(`${dia}T12:00:00-05:00`)}: le vendí{" "}
              <b>
                <Monto valor={estado.sumas} simbolo={simbolo} />
                {sufijo}
              </b>{" "}
              · me vendió o abonó{" "}
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
              <button type="button" className="cc-mover" onClick={cambiarNombre}>
                Cambiar nombre
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
            <Monto valor={saldoActual} simbolo={simbolo} />
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
          <a className="cc-whatsapp" href={`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeSaldo)}`} target="_blank" rel="noreferrer" title="Abrir WhatsApp con el saldo listo para enviar">
            <MessageCircle size={14} /> Enviar saldo
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
                  {m.movimiento_caja_id && <span className="cc-chip-caja">caja</span>}
                </td>
                <td className="num">{m.cantidad_base ? <Monto valor={m.cantidad_base} simbolo="" /> : ""}</td>
                <td className="num">{m.tasa ? tasaTexto(m.tasa, m.tasa_es_porcentaje) : ""}</td>
                <td className="num">
                  <Monto valor={m.monto} simbolo={simbolo} />
                </td>
                <td className="num cc-total">
                  <Monto valor={m.total} simbolo={simbolo} />
                </td>
                <td className="cc-acciones">
                  {!m.anulado && (m.monto.startsWith("-") || /^\s*(abono|pago)/i.test(m.descripcion ?? "")) && (
                    <button
                      className="cc-avisar"
                      onClick={() => {
                        setEstadoAviso("");
                        setAbonoParaAvisar({ monto: m.monto.replace(/^-/, ""), descripcion: m.descripcion ?? m.tipo });
                      }}
                      aria-label="Avisar al cliente que se recibió"
                      title="Avisar al cliente que se recibió"
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
  onGuardado: (abono?: { monto: string; descripcion: string }) => void;
}) {
  const [fecha, setFecha] = useState(hoyBogota());
  const [referencia, setReferencia] = useState("");
  const [persona, setPersona] = useState("");
  const [cuentaDestino, setCuentaDestino] = useState(""); // a qué cuenta del cliente se le pagó (opcional)
  const [resta, setResta] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [tasa, setTasa] = useState("");
  const [esPorcentaje, setEsPorcentaje] = useState(false); // comisión: cantidad x % en vez de cantidad x tasa
  // Movimiento hecho en la moneda de cobro (ej. pagó en pesos una cuenta en dólares): cantidad ÷ tasa
  const [enCobro, setEnCobro] = useState(false);
  const [montoDirecto, setMontoDirecto] = useState("");
  const [masOpciones, setMasOpciones] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<number | "">("");
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  // Qué le pasa a la caja con este movimiento: se propone solo (un abono entra, una venta sale) y se puede cambiar
  const [sentidoCaja, setSentidoCaja] = useState<"auto" | "entra" | "sale">("auto");
  // En Cajas y Confirmaciones todo movimiento alimenta una caja; en las demás es opcional
  const cajaObligatoria = cuenta.modulo === "CAJA";
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
      setResta(restaPorReferencia(referenciaPuesta));
      return referenciaPuesta;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaPuesta, referenciaPuesta]);

  // Al pasar a "Comisión %" se propone el último porcentaje usado (queda guardado en este equipo)
  function activarPorcentaje() {
    setEsPorcentaje(true);
    if (tasa.trim()) return;
    try {
      setTasa(recientes.porcentajes[0] ? formatearMonto(recientes.porcentajes[0]) : (localStorage.getItem(CLAVE_ULTIMA_COMISION) ?? ""));
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
  const nTasa = nEscrita && esPorcentaje ? multiplicarDecimales(nEscrita, "0.01", 8) : nEscrita;
  const nDirecto = montoDirecto.trim() ? leerNumero(montoDirecto) : null;
  const conTasa = tasa.trim() !== "";
  // Ventas y abonos: se puede anotar quién hizo la transferencia; si entró por Zelle es obligatorio
  // Quién envió o el número de la transferencia: siempre se puede anotar; si entró por Zelle es obligatorio
  const pidePersona = !referencia.includes(SEPARADOR_PERSONA);
  // Si se anota un número de transferencia, no puede haber ya un movimiento con ese número
  const numeroMovimiento = pidePersona ? (persona.match(/\d{4,30}/)?.[0] ?? null) : null;
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
    `Ya hay un movimiento con el número ${numeroMovimiento}: "${m.descripcion}" de ${m.tercero_nombre}, del ${fechaCorta(m.fecha)}.`;
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
  const entraACaja = sentidoCaja === "auto" ? resta : sentidoCaja === "entra";
  const monedaCaja = movimientoCaja ? monedas.find((m) => m.codigo === movimientoCaja.codigo) : undefined;
  const simbolo = cuenta.moneda_codigo === "COP" ? "$" : "";

  function alCambiarReferencia(valor: string) {
    setReferencia(valor);
    // "Abono ..." resta, igual que en el Excel donde va en negativo
    if (restaPorReferencia(valor)) setResta(true);
    if (/comisi[oó]n/i.test(valor) && !esPorcentaje) activarPorcentaje();
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!referencia.trim()) return setError("Escribí la referencia (a quién o qué es).");
    if (personaObligatoria && persona.trim().length < 2) return setError("Si es por Zelle hace falta el nombre de quien envió la transferencia.");
    if (cantidad.trim() && !nCantidad) return setError("La cantidad no es un número válido.");
    if (conTasa && (!nTasa || !/[1-9]/.test(nTasa) || nTasa.startsWith("-"))) return setError(esPorcentaje ? "El porcentaje no es un número válido." : "La tasa no es un número válido.");
    if (conTasa && !nCantidad) return setError(esPorcentaje ? "Para la comisión hace falta la cantidad sobre la que se cobra." : "Con tasa hace falta la cantidad.");
    if (!montoConSigno) return setError(conTasa ? "El monto da cero: revisá cantidad y tasa." : "Escribí cantidad y tasa, o el monto directo.");
    if (conCaja && cajaId === "") return setError(cajaObligatoria ? "Elegí qué caja alimenta este movimiento." : "Elegí la caja o banco que también se mueve.");
    if (conCaja && !monedaCaja) return setError(`No encuentro la moneda ${movimientoCaja?.codigo ?? ""} para mover la caja.`);
    if (numeroMovimiento) {
      // se vuelve a consultar al guardar: el aviso de arriba puede no haber llegado todavía
      const ya = repetido ?? (await buscarMovimientoPorNumero(numeroMovimiento).catch(() => null));
      if (ya) {
        setRepetido(ya);
        return setError(`${avisoRepetido(ya)} No se puede registrar dos veces.`);
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
    const escrito = { referencia, persona, cuentaDestino, cantidad, tasa, montoDirecto, resta, esPorcentaje, enCobro };
    setEnCobro(false);
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
    setCantidad("");
    setTasa(tasaSiguiente);
    setMontoDirecto("");
    setResta(restaPorReferencia(referenciaPuesta));
    setEsPorcentaje(false);
    if (window.matchMedia("(max-width: 860px)").matches) setAbierta(false);
    else refInput.current?.focus();
    const signo = resta ? "-" : "";
    const datos = {
      terceroId: cuenta.tercero_id,
      canalId: cuenta.canal_id,
      monedaId: cuenta.moneda_id,
      tipo: resta ? ("ABONO" as const) : ("CARGO" as const),
      descripcion:
        (pidePersona && persona.trim() ? `${referencia.trim()}${SEPARADOR_PERSONA}${persona.trim()}` : referencia.trim()) +
        // lo que se movió de verdad en la moneda de cobro queda anotado en la referencia
        (enCobro && conTasa ? ` (${formatearMonto(sinSigno(nCantidad!))} ${cobroCodigo} a ${formatearMonto(nTasa!)})` : ""),
      // Hoy va con la hora real; otra fecha, al mediodía de ese día
      fecha: fecha === hoyBogota() ? undefined : `${fecha}T12:00:00-05:00`,
      ...(conTasa && !enCobro ? { cantidadBase: `${signo}${sinSigno(nCantidad!)}`, tasa: nTasa!, tasaEsPorcentaje: esPorcentaje } : { monto: montoConSigno }),
      cuentaDestino: cuentaDestino.trim() || undefined,
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
      onGuardado(datos.tipo === "ABONO" || /^\s*(abono|pago)/i.test(datos.descripcion) ? { monto: montoConSigno.replace(/^-/, ""), descripcion: datos.descripcion } : undefined);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar el movimiento.";
      setError(`"${escrito.referencia.trim()}" no se guardó: ${mensaje}`);
      setAbierta(true);
      if ((refInput.current?.value ?? "") === referenciaPuesta) {
        setReferencia(escrito.referencia);
        setPersona(escrito.persona);
        setCuentaDestino(escrito.cuentaDestino);
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
    <form className={`cc-nueva ${abierta ? "abierta" : ""}`} onSubmit={guardar}>
      <div className="cc-nueva-titulo">
        Nuevo movimiento
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
            Quién envió o número de la transferencia{personaObligatoria ? "" : " (opcional)"}
            <input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Nombre de quien envió, y el número si lo hay" autoComplete="off" />
            {repetido && <small className="cc-repetido">{avisoRepetido(repetido)}</small>}
          </label>
        )}
        <label className="cc-c-destino">
          Cuenta a la que se pagó (opcional)
          <input value={cuentaDestino} onChange={(e) => setCuentaDestino(e.target.value)} placeholder="ej. Bancolombia ahorros 1234, Nequi 300…" autoComplete="off" maxLength={120} />
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
            Comisión: el {formatearMonto(nEscrita)}% de {simbolo}
            {formatearMonto(sinSigno(nCantidad))} = <strong>{simbolo}{formatearMonto(monto)}</strong>
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
