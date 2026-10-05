import { useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { ApiError } from "../../api/client";
import {
  anularOperacionTaquilla,
  confirmarOperacionTaquilla,
  crearOperacionTaquilla,
  type CodigoTaquilla,
  type OperacionTaquilla,
  type Taquilla,
} from "../../api/taquilla.api";
import { formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

const NOMBRE_MONEDA: Record<CodigoTaquilla, string> = { COP: "Pesos", USD: "Dólares", EUR: "Euros" };

function dinero(monto: string, codigo: string) {
  const numero = formatearMonto(monto.replace(/^-/, ""));
  return codigo === "COP" ? `$${numero}` : `${numero} ${codigo}`;
}

const hora = (fecha: string) => new Date(fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" });

/**
 * Ingreso / egreso de ventanilla: una compra o venta hecha en la taquilla.
 * Monto × tasa, menos la comisión = total, que es lo que entra o sale de la caja.
 * El egreso descuenta al registrarlo; el ingreso suma cuando se confirma.
 */
export function OperacionesTaquilla({ taquilla, onCambio }: { taquilla: Taquilla; onCambio: (t: Taquilla) => void }) {
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [moneda, setMoneda] = useState<CodigoTaquilla>("COP");
  const [monto, setMonto] = useState("");
  const [tasa, setTasa] = useState("");
  const [comision, setComision] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [confirmada, setConfirmada] = useState(false);
  const [verMovimientos, setVerMovimientos] = useState(false);
  const [ocupado, setOcupado] = useState<number | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abierta = taquilla.sesion.abierta;
  const nMonto = monto.trim() ? leerNumero(monto)?.replace(/^-/, "") ?? null : null;
  const nTasa = tasa.trim() ? leerNumero(tasa) : null;
  const nComision = comision.trim() ? leerNumero(comision.replace(/%/g, "")) : null;
  const decimales = moneda === "COP" ? 0 : 2;
  // total = monto × tasa (sin tasa, el monto tal cual), menos la comisión
  const bruto = nMonto ? (nTasa ? multiplicarDecimales(nMonto, nTasa, 8) : nMonto) : null;
  const factor = nComision ? sumarDecimales("1", `-${multiplicarDecimales(nComision, "0.01", 8)}`) : "1";
  const total = bruto ? multiplicarDecimales(bruto, factor, decimales) : null;
  const pendientes = taquilla.operaciones.filter((o) => o.estado === "PENDIENTE").length;

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nMonto || !/[1-9]/.test(nMonto)) return setError("Escribí el monto.");
    if (tasa.trim() && (!nTasa || !/[1-9]/.test(nTasa) || nTasa.startsWith("-"))) return setError("La tasa no es un número válido.");
    if (comision.trim() && (!nComision || nComision.startsWith("-") || Number(nComision) >= 100)) return setError("La comisión tiene que ser un porcentaje menor a 100.");
    if (!total || !/[1-9]/.test(total)) return setError("El total da cero: revisá el monto, la tasa y la comisión.");
    setOcupado("nueva");
    try {
      onCambio(
        await crearOperacionTaquilla({
          tipo,
          monedaCodigo: moneda,
          cantidad: nMonto,
          tasa: nTasa ?? undefined,
          comisionPct: nComision ?? undefined,
          descripcion: descripcion.trim() || undefined,
          clienteNombre: cliente.trim() || undefined,
          clienteTelefono: telefono.trim() || undefined,
          clienteCedula: cedula.trim() || undefined,
          confirmada: tipo === "INGRESO" ? confirmada : undefined,
        })
      );
      setMonto("");
      setTasa("");
      setComision("");
      setDescripcion("");
      setCliente("");
      setTelefono("");
      setCedula("");
      setConfirmada(false);
      setVerMovimientos(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    } finally {
      setOcupado(null);
    }
  }

  async function accion(o: OperacionTaquilla, cual: "confirmar" | "anular") {
    const pregunta =
      cual === "confirmar"
        ? `¿Confirmar el ingreso de ${dinero(o.total, o.moneda_codigo)}${o.cliente_nombre ? ` de ${o.cliente_nombre}` : ""}? Suma a la caja.`
        : `¿Anular este ingreso pendiente de ${dinero(o.total, o.moneda_codigo)}? No había tocado la caja.`;
    if (!window.confirm(pregunta)) return;
    setError(null);
    setOcupado(o.id);
    try {
      onCambio(cual === "confirmar" ? await confirmarOperacionTaquilla(o.id) : await anularOperacionTaquilla(o.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="tq-operaciones" aria-label="Ingreso o egreso de caja">
      <form className="tq-operacion" onSubmit={registrar}>
        <div className="tq-operacion-cabeza">
          <h2>Ingreso / egreso de caja</h2>
          <div className="cc-segmento" role="group" aria-label="Ingreso o egreso">
            <button type="button" className={tipo === "INGRESO" ? "activo" : ""} onClick={() => setTipo("INGRESO")} aria-pressed={tipo === "INGRESO"}>
              Ingreso
            </button>
            <button type="button" className={tipo === "EGRESO" ? "activo" : ""} onClick={() => setTipo("EGRESO")} aria-pressed={tipo === "EGRESO"}>
              Egreso
            </button>
          </div>
        </div>

        <div className="tq-operacion-cuenta">
          <label>
            Monto
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="100.000" autoComplete="off" />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            Tasa
            <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" placeholder="3,3" autoComplete="off" />
          </label>
          <span aria-hidden="true">−</span>
          <label>
            Comisión %
            <input value={comision} onChange={(e) => setComision(e.target.value)} inputMode="decimal" placeholder="0" autoComplete="off" />
          </label>
          <span aria-hidden="true">=</span>
          <label>
            Total, en
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as CodigoTaquilla)} aria-label="Moneda de la caja">
              {(Object.keys(NOMBRE_MONEDA) as CodigoTaquilla[]).map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_MONEDA[c]}
                </option>
              ))}
            </select>
          </label>
          <output className={`tq-operacion-total ${tipo === "EGRESO" ? "egreso" : ""}`}>{total ? `${tipo === "EGRESO" ? "− " : "+ "}${dinero(total, moneda)}` : "—"}</output>
        </div>

        <div className="tq-operacion-datos">
          <label className="ancho">
            Descripción
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Compra de bolívares" maxLength={300} autoComplete="off" />
          </label>
          <label>
            Cliente
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre" maxLength={120} autoComplete="off" />
          </label>
          <label>
            Teléfono
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" maxLength={40} autoComplete="off" />
          </label>
          <label>
            Cédula
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" maxLength={40} autoComplete="off" />
          </label>
        </div>

        <div className="tq-operacion-pie">
          {tipo === "INGRESO" ? (
            <label className={`cc-check cc-confirmada ${confirmada ? "si" : ""}`}>
              <input type="checkbox" checked={confirmada} onChange={(e) => setConfirmada(e.target.checked)} />
              Ya está confirmado
              <small>{confirmada ? "Suma a la caja de una vez." : "Queda pendiente: suma a la caja cuando se confirme."}</small>
            </label>
          ) : (
            <p className="tq-operacion-nota">El egreso descuenta de la caja al registrarlo.</p>
          )}
          <button type="submit" className="cc-guardar" disabled={ocupado !== null || (!abierta && (tipo === "EGRESO" || confirmada))} title={abierta ? undefined : "Con la caja cerrada solo se puede dejar un ingreso pendiente"}>
            {ocupado === "nueva" ? "Registrando…" : `Registrar ${tipo === "INGRESO" ? "ingreso" : "egreso"}`}
          </button>
        </div>
        {error && <p className="cc-form-error">{error}</p>}
      </form>

      <button type="button" className="tq-ver-movimientos" onClick={() => setVerMovimientos((v) => !v)} aria-expanded={verMovimientos}>
        {verMovimientos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {verMovimientos ? "Ocultar movimientos" : "Ver movimientos"} ({taquilla.operaciones.length})
        {pendientes > 0 && <span className="tq-pendientes">{pendientes} por confirmar</span>}
      </button>

      {verMovimientos && (
        <ul className="tq-movimientos">
          {taquilla.operaciones.length === 0 && <li className="cc-lista-aviso">Todavía no hay ingresos ni egresos en esta caja.</li>}
          {taquilla.operaciones.map((o) => (
            <li key={o.id} className={`tq-movimiento ${o.tipo === "EGRESO" ? "egreso" : ""} ${o.estado.toLowerCase()}`}>
              <div className="tq-movimiento-datos">
                <strong>
                  {o.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                  {o.descripcion ? ` · ${o.descripcion}` : ""}
                  <span className={`tq-mov-estado ${o.estado.toLowerCase()}`}>{o.estado === "PENDIENTE" ? "por confirmar" : o.estado === "ANULADA" ? "anulado" : "confirmado"}</span>
                </strong>
                <span>
                  {formatearMonto(o.cantidad)}
                  {o.tasa ? ` × ${formatearMonto(o.tasa)}` : ""}
                  {o.comision_pct && /[1-9]/.test(o.comision_pct) ? ` − ${formatearMonto(o.comision_pct)}%` : ""}
                </span>
                <span>
                  {[o.cliente_nombre, o.cliente_cedula ? `CC ${o.cliente_cedula}` : null, o.cliente_telefono].filter(Boolean).join(" · ") || "sin datos del cliente"} · {hora(o.created_at)} · {o.usuario_nombre}
                </span>
              </div>
              <strong className="tq-movimiento-total">
                {o.tipo === "EGRESO" ? "− " : "+ "}
                {dinero(o.total, o.moneda_codigo)}
              </strong>
              {o.estado === "PENDIENTE" && (
                <span className="tq-movimiento-acciones">
                  <button className="tq-pagar" onClick={() => accion(o, "confirmar")} disabled={ocupado !== null || !abierta} title={abierta ? "Confirmar: suma a la caja" : "Primero abrí la caja de taquilla"}>
                    <CheckCircle2 size={16} /> {ocupado === o.id ? "…" : "Confirmar"}
                  </button>
                  <button className="tq-anular" onClick={() => accion(o, "anular")} disabled={ocupado !== null}>
                    Anular
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
