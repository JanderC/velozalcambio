import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { Header } from "../../components/common/Header";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getTaquilla, moverCajaTaquilla, pagarSolicitud, type SaldoTaquilla, type SolicitudTaquilla, type Taquilla } from "../../api/taquilla.api";
import { formatearMonto, leerNumero } from "../../utils/montos";
import "../cuentasCorrientes/cuentasCorrientes.css";
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

/**
 * Taquilla: acá llegan las solicitudes ya confirmadas en Confirmaciones para entregarle el efectivo al cliente.
 * Tiene su propia caja (pesos, dólares y euros) y cada solicitud se marca "Se pagó", que descuenta de esa caja.
 */
export function TaquillaPage() {
  const [taquilla, setTaquilla] = useState<Taquilla | null>(null);
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState<number | null>(null);
  const [moviendo, setMoviendo] = useState<SaldoTaquilla | null>(null);

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
      return [s.cliente_nombre, s.cliente_telefono, s.cliente_cedula, s.descripcion].some((v) => (v ?? "").toLowerCase().includes(texto));
    },
    [buscar]
  );
  const pendientes = useMemo(() => (taquilla?.pendientes ?? []).filter(coincide), [taquilla, coincide]);
  const pagadas = useMemo(() => (taquilla?.pagadasHoy ?? []).filter(coincide), [taquilla, coincide]);

  async function pagar(s: SolicitudTaquilla) {
    if (!window.confirm(`¿Se le pagó ${dinero(s.monto, s.moneda_codigo)} a ${s.cliente_nombre}? Se descuenta de la caja de taquilla.`)) return;
    setPagando(s.id);
    try {
      setTaquilla(await pagarSolicitud(s.id));
      setError(null);
    } catch (e) {
      const mensaje = e instanceof ApiError ? e.message : "No se pudo registrar el pago.";
      setError(/saldo insuficiente/i.test(mensaje) ? `La caja de taquilla no tiene ${dinero(s.monto, s.moneda_codigo)} para pagarle a ${s.cliente_nombre}. Sumale efectivo a la caja primero.` : mensaje);
    } finally {
      setPagando(null);
    }
  }

  return (
    <div className="cc-page">
      <Header />
      <div className="cc-header">
        <div>
          <h1>Taquilla</h1>
          <p>Las solicitudes ya confirmadas: acá se le entrega el efectivo al cliente y se descuenta de la caja.</p>
        </div>
      </div>

      <section className="tq-caja" aria-label="Caja de taquilla">
        <h2>Caja de taquilla · efectivo</h2>
        <div className="tq-caja-monedas">
          {(taquilla?.caja.saldos ?? []).map((s) => (
            <article key={s.codigo} className="tq-moneda">
              <span>{NOMBRE_MONEDA[s.codigo] ?? s.codigo}</span>
              <strong>{dinero(s.monto, s.codigo)}</strong>
              <button className="cc-btn-secundario" onClick={() => setMoviendo(s)}>
                Sumar o descontar
              </button>
            </article>
          ))}
        </div>
      </section>

      {error && <p className="cc-form-error tq-error">{error}</p>}

      <div className="cc-buscador-top tq-buscador">
        <Search size={20} />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, teléfono, cédula o referencia" aria-label="Buscar solicitud" />
      </div>

      <section className="tq-lista" aria-label="Solicitudes confirmadas por pagar">
        <h2>
          Por pagar <span>{pendientes.length}</span>
        </h2>
        {!taquilla && !error && <p className="cc-lista-aviso">Cargando…</p>}
        {taquilla && pendientes.length === 0 && <p className="cc-lista-aviso">{buscar ? "Ninguna solicitud coincide." : "No hay solicitudes confirmadas por pagar."}</p>}
        <ul>
          {pendientes.map((s) => (
            <li key={s.id} className="tq-solicitud">
              <div className="tq-solicitud-datos">
                <strong>{s.cliente_nombre}</strong>
                <span>
                  {[s.cliente_cedula ? `CC ${s.cliente_cedula}` : null, s.cliente_telefono].filter(Boolean).join(" · ") || "sin cédula ni teléfono"}
                </span>
                <span>
                  Ref: <b>{referenciaDe(s) || "—"}</b> · confirmada {fechaHora(s.fecha)}
                </span>
              </div>
              <div className="tq-solicitud-monto">
                <span>Recibe</span>
                <strong>{dinero(s.monto, s.moneda_codigo)}</strong>
              </div>
              <button className="tq-pagar" onClick={() => pagar(s)} disabled={pagando !== null}>
                <CheckCircle2 size={18} /> {pagando === s.id ? "Registrando…" : "Se pagó"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {pagadas.length > 0 && (
        <section className="tq-lista tq-pagadas" aria-label="Pagadas hoy">
          <h2>
            Pagadas hoy <span>{pagadas.length}</span>
          </h2>
          <ul>
            {pagadas.map((s) => (
              <li key={s.id} className="tq-solicitud">
                <div className="tq-solicitud-datos">
                  <strong>{s.cliente_nombre}</strong>
                  <span>
                    Ref: <b>{referenciaDe(s) || "—"}</b>
                  </span>
                  <span>
                    Pagada {s.pagado_en ? fechaHora(s.pagado_en) : ""}
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
    </div>
  );
}

/** Sumar o descontar efectivo de la caja de taquilla en una moneda (iniciar el día, reponer, retirar). */
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
          <small>{nMonto ? `${descuenta ? "Se descuentan" : "Se suman"} ${dinero(nMonto, saldo.codigo)}` : "Para iniciar el día, sumá el efectivo con el que arranca la caja."}</small>
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
