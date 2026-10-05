import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Image as IconoImagen, Landmark, Lock, LockOpen, Search } from "lucide-react";
import { Header } from "../../components/common/Header";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { confirmarMovimientoCC, getUrlComprobante } from "../../api/cuentasCorrientes.api";
import {
  abrirCajaTaquilla,
  cerrarCajaTaquilla,
  getTaquilla,
  moverCajaTaquilla,
  pagarSolicitud,
  type CodigoTaquilla,
  type MontosPorMoneda,
  type SaldoTaquilla,
  type SolicitudTaquilla,
  type Taquilla,
} from "../../api/taquilla.api";
import { formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import "../cuentasCorrientes/cuentasCorrientes.css";
import { OperacionesTaquilla } from "./OperacionesTaquilla";
import "./taquilla.css";

const NOMBRE_MONEDA: Record<string, string> = { COP: "Pesos", USD: "Dólares", EUR: "Euros" };

function dinero(monto: string, codigo: string) {
  const negativo = monto.startsWith("-");
  const numero = formatearMonto(negativo ? monto.slice(1) : monto);
  const texto = codigo === "COP" ? `$${numero}` : `${numero} ${codigo}`;
  return negativo ? `- ${texto}` : texto;
}

function fechaHora(fecha: string) {
  return new Date(fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" });
}

/** La referencia anotada en la solicitud: lo que va después del " · ". */
const referenciaDe = (s: SolicitudTaquilla) => (s.descripcion ?? "").split(" · ")[1] ?? "";
const porConfirmar = (s: SolicitudTaquilla) => s.estado_confirmacion === "EN_PROCESO";

/**
 * Taquilla: acá llegan todas las solicitudes de Confirmaciones para entregarle el efectivo al cliente.
 * Se trabaja con sesión de caja: se abre con tanto en pesos, dólares y euros, cada "Se pagó" descuenta,
 * y al final del día se cierra contando el efectivo para cuadrar.
 */
export function TaquillaPage() {
  const [taquilla, setTaquilla] = useState<Taquilla | null>(null);
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState<number | null>(null);
  const [moviendo, setMoviendo] = useState<SaldoTaquilla | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [detalle, setDetalle] = useState<SolicitudTaquilla | null>(null);

  const cargar = useCallback(async () => {
    try {
      setTaquilla(await getTaquilla());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Las solicitudes llegan desde Confirmaciones: se refresca solo para verlas aparecer
  useEffect(() => {
    void cargar();
    const t = setInterval(cargar, 20_000);
    return () => clearInterval(t);
  }, [cargar]);

  const coincide = useCallback(
    (s: SolicitudTaquilla) => {
      const texto = buscar.trim().toLowerCase();
      if (!texto) return true;
      return [s.cliente_nombre, s.cliente_telefono, s.cliente_cedula, s.descripcion, s.cliente_referencia].some((v) => (v ?? "").toLowerCase().includes(texto));
    },
    [buscar]
  );
  const pendientes = useMemo(() => (taquilla?.pendientes ?? []).filter(coincide), [taquilla, coincide]);
  const pagadas = useMemo(() => (taquilla?.pagadasHoy ?? []).filter(coincide), [taquilla, coincide]);
  const abierta = taquilla?.sesion.abierta ?? false;

  // En efectivo descuenta de la caja; por Bancolombia no la toca (solo queda contado arriba)
  async function pagar(s: SolicitudTaquilla, medio: "EFECTIVO" | "BANCOLOMBIA" = "EFECTIVO") {
    const pregunta =
      medio === "BANCOLOMBIA"
        ? `¿Se le pagó ${dinero(s.monto, s.moneda_codigo)} a ${s.cliente_nombre} por Bancolombia? No se descuenta de la caja.`
        : `¿Se le pagó ${dinero(s.monto, s.moneda_codigo)} a ${s.cliente_nombre} en efectivo? Se descuenta de la caja de taquilla.`;
    if (!window.confirm(pregunta)) return;
    setPagando(s.id);
    try {
      setTaquilla(await pagarSolicitud(s.id, medio));
      setDetalle(null);
      setError(null);
    } catch (e) {
      const mensaje = e instanceof ApiError ? e.message : "No se pudo registrar el pago.";
      setError(/saldo insuficiente/i.test(mensaje) ? `La caja de taquilla no tiene ${dinero(s.monto, s.moneda_codigo)} para pagarle a ${s.cliente_nombre}. Sumale efectivo a la caja primero.` : mensaje);
    } finally {
      setPagando(null);
    }
  }

  // Western o Zelle ya verificó: se confirma acá mismo y queda lista para pagarse
  async function confirmar(s: SolicitudTaquilla) {
    if (!window.confirm(`¿Confirmar la transferencia de ${s.cliente_nombre} por ${dinero(s.monto, s.moneda_codigo)}? Queda lista para pagarse.`)) return;
    setPagando(s.id);
    try {
      await confirmarMovimientoCC(s.id);
      const nueva = await getTaquilla();
      setTaquilla(nueva);
      // el detalle abierto se actualiza: ahora muestra Se pagó
      setDetalle((d) => (d && d.id === s.id ? (nueva.pendientes.find((x) => x.id === s.id) ?? null) : d));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo confirmar la transferencia.");
    } finally {
      setPagando(null);
    }
  }

  const botonPagar = (s: SolicitudTaquilla) =>
    porConfirmar(s) ? (
      <button
        className="tq-confirmar"
        onClick={(e) => {
          e.stopPropagation();
          void confirmar(s);
        }}
        disabled={pagando !== null}
        title="La transferencia ya fue verificada: confirmarla para poder pagarla"
      >
        <CheckCircle2 size={18} /> {pagando === s.id ? "Confirmando…" : "Confirmar transferencia"}
      </button>
    ) : (
      <span className="tq-pagos">
        <button
          className="tq-pagar"
          onClick={(e) => {
            e.stopPropagation();
            void pagar(s);
          }}
          disabled={pagando !== null || !abierta}
          title={abierta ? "Se le entregó en efectivo: descuenta de la caja" : "Primero abrí la caja de taquilla"}
        >
          <CheckCircle2 size={18} /> {pagando === s.id ? "Registrando…" : "Se pagó"}
        </button>
        <button
          className="tq-pagar-banco"
          onClick={(e) => {
            e.stopPropagation();
            void pagar(s, "BANCOLOMBIA");
          }}
          disabled={pagando !== null}
          title="Se le pagó por transferencia de Bancolombia: no descuenta de la caja"
        >
          <Landmark size={15} /> Por Bancolombia
        </button>
      </span>
    );

  return (
    <div className="cc-page">
      <Header />
      {/* Arriba de todo: el buscador */}
      <div className="cc-buscador-top tq-buscador">
        <Search size={20} />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, teléfono, cédula o referencia" aria-label="Buscar solicitud" autoFocus />
      </div>

      {/* La caja, en chico: cuánto hay en cada moneda y abrir o cerrar */}
      <section className="tq-caja" aria-label="Caja de taquilla">
        <div className="tq-caja-franja">
          <span className="tq-caja-titulo">
            Caja
            {taquilla && <span className={`tq-estado ${abierta ? "abierta" : "cerrada"}`}>{abierta ? "abierta" : "cerrada"}</span>}
          </span>
          {(taquilla?.caja.saldos ?? []).map((m) => (
            <button
              key={m.codigo}
              className="tq-moneda-chica"
              onClick={() => abierta && setMoviendo(m)}
              disabled={!abierta}
              title={abierta ? `Sumar o descontar ${NOMBRE_MONEDA[m.codigo]?.toLowerCase()}` : "Abrí la caja para mover efectivo"}
            >
              <span>{NOMBRE_MONEDA[m.codigo] ?? m.codigo}</span>
              <strong>{dinero(m.monto, m.codigo)}</strong>
            </button>
          ))}
          {taquilla && (
            <span className="tq-banco-chip" title="Pagos hechos por transferencia de Bancolombia: no descuentan de la caja">
              <Landmark size={13} />
              <span>Pagos Bancolombia</span>
              <strong>
                {taquilla.pagosBancolombia.cantidad}
                {taquilla.pagosBancolombia.totales.length > 0 && ` · ${taquilla.pagosBancolombia.totales.map((t) => dinero(t.total, t.codigo)).join(" + ")}`}
              </strong>
            </span>
          )}
          {taquilla &&
            (abierta ? (
              <button className="cc-btn-secundario tq-caja-accion" onClick={() => setCerrando(true)}>
                <Lock size={14} /> Cerrar y cuadrar
              </button>
            ) : (
              <button className="cc-guardar tq-caja-accion" onClick={() => setAbriendo(true)}>
                <LockOpen size={14} /> Abrir caja
              </button>
            ))}
        </div>
        {taquilla && !abierta && <p className="tq-sesion-nota cerrada">La caja está cerrada: para pagar solicitudes hay que abrirla con el efectivo con que arranca el día.</p>}

        {/* El detalle de la sesión y el último cuadre quedan plegados */}
        {taquilla && abierta && taquilla.sesion.abierta_en && (
          <details className="tq-caja-detalle">
            <summary>
              Abierta el {fechaHora(taquilla.sesion.abierta_en)} por {taquilla.sesion.abierta_por} · ver lo que entró y salió
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Moneda</th>
                  <th>Abrió con</th>
                  <th>Entró</th>
                  <th>Salió</th>
                  <th>Debe haber</th>
                </tr>
              </thead>
              <tbody>
                {taquilla.caja.saldos.map((m) => (
                  <tr key={m.codigo}>
                    <td>{NOMBRE_MONEDA[m.codigo] ?? m.codigo}</td>
                    <td>{dinero(m.inicial ?? "0", m.codigo)}</td>
                    <td>{dinero(m.entradas, m.codigo)}</td>
                    <td>{dinero(m.salidas, m.codigo)}</td>
                    <td>
                      <b>{dinero(m.monto, m.codigo)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        {taquilla?.ultimoCierre && !abierta && (
          <details className="tq-caja-detalle">
            <summary>
              Último cuadre · {fechaHora(taquilla.ultimoCierre.cerrada_en)} · {taquilla.ultimoCierre.por}
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Moneda</th>
                  <th>Abrió con</th>
                  <th>Debía haber</th>
                  <th>Se contó</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {taquilla.ultimoCierre.monedas.map((m) => (
                  <tr key={m.codigo}>
                    <td>{NOMBRE_MONEDA[m.codigo] ?? m.codigo}</td>
                    <td>{dinero(m.saldo_inicial, m.codigo)}</td>
                    <td>{dinero(m.saldo_esperado, m.codigo)}</td>
                    <td>{dinero(m.saldo_real, m.codigo)}</td>
                    <td className={/[1-9]/.test(m.diferencia) ? (m.diferencia.startsWith("-") ? "falta" : "sobra") : ""}>
                      {/[1-9]/.test(m.diferencia) ? `${m.diferencia.startsWith("-") ? "Falta" : "Sobra"} ${dinero(m.diferencia.replace(/^-/, ""), m.codigo)}` : "Cuadra"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      {/* Ingreso / egreso de ventanilla, debajo de la caja */}
      {taquilla && <OperacionesTaquilla taquilla={taquilla} onCambio={setTaquilla} />}

      {error && <p className="cc-form-error tq-error">{error}</p>}

      <section className="tq-lista" aria-label="Solicitudes por pagar">
        <h2>
          Por pagar <span>{pendientes.length}</span>
        </h2>
        {!taquilla && !error && <p className="cc-lista-aviso">Cargando…</p>}
        {taquilla && pendientes.length === 0 && <p className="cc-lista-aviso">{buscar ? "Ninguna solicitud coincide." : "No hay solicitudes por pagar."}</p>}
        <ul>
          {pendientes.map((s) => (
            <li key={s.id} className={`tq-solicitud ${porConfirmar(s) ? "sin-confirmar" : ""}`} onClick={() => setDetalle(s)} title="Ver todos los datos y el comprobante">
              <div className="tq-solicitud-datos">
                <strong>
                  {s.cliente_nombre}
                  {s.tiene_comprobante && <IconoImagen size={15} aria-label="Tiene imagen del comprobante" />}
                </strong>
                <span>{[s.cliente_cedula ? `CC ${s.cliente_cedula}` : null, s.cliente_telefono].filter(Boolean).join(" · ") || "sin cédula ni teléfono"}</span>
                <span>
                  Ref: <b>{referenciaDe(s) || "—"}</b> · {fechaHora(s.fecha)}
                </span>
              </div>
              <div className="tq-solicitud-monto">
                <span>Recibe</span>
                <strong>{dinero(s.monto, s.moneda_codigo)}</strong>
              </div>
              {botonPagar(s)}
            </li>
          ))}
        </ul>
      </section>

      {pagadas.length > 0 && (
        <section className="tq-lista tq-pagadas" aria-label="Pagadas">
          <h2>
            {abierta ? "Pagadas en esta caja" : "Pagadas hoy"} <span>{pagadas.length}</span>
          </h2>
          <ul>
            {pagadas.map((s) => (
              <li key={s.id} className="tq-solicitud" onClick={() => setDetalle(s)} title="Ver todos los datos y el comprobante">
                <div className="tq-solicitud-datos">
                  <strong>{s.cliente_nombre}</strong>
                  <span>
                    Ref: <b>{referenciaDe(s) || "—"}</b>
                  </span>
                  <span>
                    Pagada {s.pagado_medio === "BANCOLOMBIA" ? "por Bancolombia " : "en efectivo "}
                    {s.pagado_en ? fechaHora(s.pagado_en) : ""}
                    {s.pagado_por_nombre ? ` por ${s.pagado_por_nombre}` : ""}
                  </span>
                </div>
                <div className="tq-solicitud-monto">
                  <span>Recibió</span>
                  <strong>{dinero(s.monto, s.moneda_codigo)}</strong>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detalle && <DetalleSolicitud solicitud={detalle} accion={detalle.pagado_en ? null : botonPagar(detalle)} onCerrar={() => setDetalle(null)} />}

      {moviendo && (
        <MoverCajaModal
          saldo={moviendo}
          onCerrar={() => setMoviendo(null)}
          onHecho={(nueva) => {
            setTaquilla(nueva);
            setMoviendo(null);
            setError(null);
          }}
        />
      )}
      {abriendo && taquilla && (
        <SesionModal
          modo="abrir"
          saldos={taquilla.caja.saldos}
          onCerrar={() => setAbriendo(false)}
          onHecho={(nueva) => {
            setTaquilla(nueva);
            setAbriendo(false);
            setError(null);
          }}
        />
      )}
      {cerrando && taquilla && (
        <SesionModal
          modo="cerrar"
          saldos={taquilla.caja.saldos}
          onCerrar={() => setCerrando(false)}
          onHecho={(nueva) => {
            setTaquilla(nueva);
            setCerrando(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

/** Todos los datos de la solicitud y la imagen del comprobante. */
function DetalleSolicitud({ solicitud: s, accion, onCerrar }: { solicitud: SolicitudTaquilla; accion: React.ReactNode; onCerrar: () => void }) {
  const [imagen, setImagen] = useState<string | null>(null);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  useEffect(() => {
    if (!s.tiene_comprobante) return;
    getUrlComprobante(s.id)
      .then(setImagen)
      .catch((e) => setErrorImagen((e as Error).message));
  }, [s.id, s.tiene_comprobante]);

  // Con comisión descontada la tasa guardada es lo que queda (0.9435): se muestra el % que se descontó
  const comision = s.comision_descontada && s.tasa ? sumarDecimales("100", `-${multiplicarDecimales(s.tasa, "100", 6)}`) : null;
  const datos: [string, string | null][] = [
    ["Cliente", s.cliente_nombre],
    ["Cédula", s.cliente_cedula],
    ["Teléfono", s.cliente_telefono],
    ["Referencia del cliente", s.cliente_referencia],
    ["Medio", s.canal_nombre === "SIN_BANCO" ? null : s.canal_nombre.replace(/_/g, " ")],
    ["Operación", (s.descripcion ?? "").split(" · ")[0] || null],
    ["Referencia de la transferencia", referenciaDe(s) || null],
    ["Cuenta a la que se pagó", s.cuenta_destino],
    ["Envió", s.cantidad_base ? formatearMonto(s.cantidad_base.replace(/^-/, "")) : null],
    [comision ? "Comisión" : "Tasa", comision ? `${formatearMonto(comision)}%` : s.tasa ? formatearMonto(s.tasa) : null],
    ["Recibe", dinero(s.monto, s.moneda_codigo)],
    ["Registrada", `${fechaHora(s.fecha)} por ${s.registrado_por_nombre}`],
    ["Estado", porConfirmar(s) ? "Falta confirmar la transferencia" : s.pagado_en ? `Pagada ${s.pagado_medio === "BANCOLOMBIA" ? "por Bancolombia" : "en efectivo"} ${fechaHora(s.pagado_en)}${s.pagado_por_nombre ? ` por ${s.pagado_por_nombre}` : ""}` : "Confirmada, por pagar"],
  ];

  return (
    <Modal titulo={`Solicitud de ${s.cliente_nombre}`} ancho="ancho" onCerrar={onCerrar}>
      <div className="tq-detalle">
        <dl>
          {datos
            .filter(([, valor]) => valor)
            .map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt>{etiqueta}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
        </dl>
        <div className="tq-detalle-imagen">
          {!s.tiene_comprobante && <p className="cc-lista-aviso">Esta solicitud no tiene imagen del comprobante guardada.</p>}
          {s.tiene_comprobante && !imagen && !errorImagen && <p className="cc-lista-aviso">Cargando la imagen…</p>}
          {errorImagen && <p className="cc-form-error">No se pudo cargar la imagen: {errorImagen}</p>}
          {imagen && (
            <a href={imagen} target="_blank" rel="noreferrer" title="Abrir la imagen en grande">
              <img src={imagen} alt="Comprobante de la transferencia" />
            </a>
          )}
        </div>
      </div>
      {accion && <div className="tq-detalle-accion">{accion}</div>}
    </Modal>
  );
}

/** Abrir la caja (con cuánto arranca) o cerrarla (cuánto se contó), en pesos, dólares y euros. */
function SesionModal({ modo, saldos, onHecho, onCerrar }: { modo: "abrir" | "cerrar"; saldos: SaldoTaquilla[]; onHecho: (t: Taquilla) => void; onCerrar: () => void }) {
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // vacío cuenta como cero
  const leido = (codigo: string) => (montos[codigo]?.trim() ? leerNumero(montos[codigo]!)?.replace(/^-/, "") ?? null : "0");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const valores: MontosPorMoneda = {};
    for (const s of saldos) {
      const n = leido(s.codigo);
      if (n === null) return setError(`El monto en ${NOMBRE_MONEDA[s.codigo]?.toLowerCase()} no es un número válido.`);
      valores[s.codigo as CodigoTaquilla] = n;
    }
    setEnviando(true);
    try {
      onHecho(modo === "abrir" ? await abrirCajaTaquilla(valores) : await cerrarCajaTaquilla(valores));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={modo === "abrir" ? "Abrir la caja de taquilla" : "Cerrar la caja y cuadrar"} onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={guardar}>
        <p className="cc-modal-nota">
          {modo === "abrir"
            ? "Escribí con cuánto efectivo arranca la caja en cada moneda. Desde ahí se va sumando y descontando todo."
            : "Contá el efectivo de cada moneda y escribilo. Se compara con lo que debía haber y queda guardado el cuadre."}
        </p>
        {saldos.map((s, i) => {
          const n = leido(s.codigo);
          const diferencia = modo === "cerrar" && n !== null ? sumarDecimales(n, s.monto.startsWith("-") ? s.monto.slice(1) : `-${s.monto}`) : null;
          return (
            <label key={s.codigo}>
              {NOMBRE_MONEDA[s.codigo] ?? s.codigo}
              {modo === "cerrar" ? ` · debía haber ${dinero(s.monto, s.codigo)}` : ""}
              <input
                value={montos[s.codigo] ?? ""}
                onChange={(e) => setMontos((m) => ({ ...m, [s.codigo]: e.target.value }))}
                inputMode="decimal"
                placeholder={modo === "abrir" ? "0" : "lo que contaste"}
                autoFocus={i === 0}
              />
              {diferencia !== null && montos[s.codigo]?.trim() && (
                <small className={/[1-9]/.test(diferencia) ? (diferencia.startsWith("-") ? "tq-falta" : "tq-sobra") : "tq-cuadra"}>
                  {/[1-9]/.test(diferencia) ? `${diferencia.startsWith("-") ? "Falta" : "Sobra"} ${dinero(diferencia.replace(/^-/, ""), s.codigo)}` : "Cuadra"}
                </small>
              )}
            </label>
          );
        })}
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : modo === "abrir" ? "Abrir caja" : "Cerrar y cuadrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Sumar o descontar efectivo de la caja de taquilla en una moneda, con la caja abierta (reponer, retirar). */
function MoverCajaModal({ saldo, onHecho, onCerrar }: { saldo: SaldoTaquilla; onHecho: (t: Taquilla) => void; onCerrar: () => void }) {
  const [descuenta, setDescuenta] = useState(false);
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nMonto = monto.trim() ? leerNumero(monto)?.replace(/^-/, "") ?? null : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nMonto || !/[1-9]/.test(nMonto)) return setError("Escribí el monto.");
    setEnviando(true);
    try {
      onHecho(await moverCajaTaquilla(saldo.codigo, `${descuenta ? "-" : ""}${nMonto}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo mover la caja.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Caja de taquilla · ${NOMBRE_MONEDA[saldo.codigo] ?? saldo.codigo}`} onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={guardar}>
        <p className="cc-modal-nota">
          Hay <strong>{dinero(saldo.monto, saldo.codigo)}</strong> en la caja.
        </p>
        <div className="cc-segmento" role="group" aria-label="Sumar o descontar">
          <button type="button" className={!descuenta ? "activo" : ""} onClick={() => setDescuenta(false)} aria-pressed={!descuenta}>
            Sumar a la caja
          </button>
          <button type="button" className={descuenta ? "activo" : ""} onClick={() => setDescuenta(true)} aria-pressed={descuenta}>
            Descontar de la caja
          </button>
        </div>
        <label>
          Monto en {NOMBRE_MONEDA[saldo.codigo]?.toLowerCase() ?? saldo.codigo}
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="ej. 2.000.000" autoFocus />
          <small>{nMonto ? `${descuenta ? "Se descuentan" : "Se suman"} ${dinero(nMonto, saldo.codigo)}` : "Queda anotado en la caja y entra en el cuadre del cierre."}</small>
        </label>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : descuenta ? "Descontar" : "Sumar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
