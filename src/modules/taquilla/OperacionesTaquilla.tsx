import { useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { ApiError } from "../../api/client";
import {
  anularOperacionTaquilla,
  confirmarOperacionTaquilla,
  crearOperacionTaquilla,
  type CodigoTaquilla,
  type OperacionTaquilla,
  type Taquilla,
} from "../../api/taquilla.api";
import { dividirDecimales, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

const NOMBRE_MONEDA: Record<CodigoTaquilla, string> = { COP: "Pesos", USD: "Dólares", EUR: "Euros" };
// Lo que se compra o se vende en la ventanilla
const MONEDAS_OPERACION: { codigo: string; nombre: string }[] = [
  { codigo: "VES", nombre: "Bolívares" },
  { codigo: "USD", nombre: "Dólares" },
  { codigo: "USDT", nombre: "USDT" },
  { codigo: "EUR", nombre: "Euros" },
  { codigo: "COP", nombre: "Pesos" },
];
type Formula = "tasa" | "dividir" | "comision";

function dinero(monto: string, codigo: string) {
  const numero = formatearMonto(monto.replace(/^-/, ""));
  return codigo === "COP" ? `$${numero}` : codigo === "VES" ? `Bs. ${numero}` : `${numero} ${codigo}`;
}

const hora = (fecha: string) => new Date(fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" });

/** Teléfono como lo pide wa.me: solo dígitos y con código de país (celular colombiano o venezolano sin él -> se le agrega). */
function telefonoWhatsApp(telefono: string | null) {
  const d = (telefono ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (d.length < 8) return null;
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  if (d.length === 11 && d.startsWith("04")) return `58${d.slice(1)}`;
  return d;
}

/** La cuenta del movimiento, como se muestra: 100.000 × 3,3, 82.500 ÷ 3.280 o 1.000 − 4%. */
function cuentaDe(o: OperacionTaquilla) {
  const moneda = o.moneda_operacion ?? "";
  const base = moneda ? dinero(o.cantidad, moneda) : formatearMonto(o.cantidad);
  const tasa = o.tasa ? ` ${o.divide ? "÷" : "×"} ${formatearMonto(o.tasa)}` : "";
  const comision = o.comision_pct && /[1-9]/.test(o.comision_pct) ? ` − ${formatearMonto(o.comision_pct)}%` : "";
  return `${base}${tasa}${comision}`;
}

/**
 * Ingreso / egreso de ventanilla: una compra o venta hecha en la taquilla.
 * Igual que en Confirmaciones, la cuenta es por tasa (monto × tasa), dividiendo (monto ÷ tasa) o con comisión (monto − %).
 * En efectivo mueve la caja (el egreso al registrarlo, el ingreso al confirmarlo); por Bancolombia es transferencia y no la toca.
 */
export function OperacionesTaquilla({ taquilla, onCambio }: { taquilla: Taquilla; onCambio: (t: Taquilla) => void }) {
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [monedaOperacion, setMonedaOperacion] = useState("VES");
  const [formula, setFormula] = useState<Formula>("tasa");
  const [moneda, setMoneda] = useState<CodigoTaquilla>("COP");
  const [medio, setMedio] = useState<"EFECTIVO" | "BANCOLOMBIA">("EFECTIVO");
  const [monto, setMonto] = useState("");
  const [valor, setValor] = useState(""); // la tasa o el % de comisión
  const [descripcion, setDescripcion] = useState("");
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [confirmada, setConfirmada] = useState(false);
  const [verMovimientos, setVerMovimientos] = useState(false);
  const [ocupado, setOcupado] = useState<number | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abierta = taquilla.sesion.abierta;
  const porBanco = medio === "BANCOLOMBIA";
  const nMonto = monto.trim() ? leerNumero(monto)?.replace(/^-/, "") ?? null : null;
  const nValor = valor.trim() ? leerNumero(valor.replace(/%/g, "")) : null;
  const valorValido = !!nValor && /[1-9]/.test(nValor) && !nValor.startsWith("-");
  const decimales = moneda === "COP" ? 0 : 2;
  // por tasa: monto × tasa · dividiendo: monto ÷ tasa · con comisión: monto − % (sin valor, el monto tal cual)
  const total = !nMonto
    ? null
    : !valorValido
      ? formula === "dividir"
        ? null
        : multiplicarDecimales(nMonto, "1", decimales)
      : formula === "tasa"
        ? multiplicarDecimales(nMonto, nValor!, decimales)
        : formula === "dividir"
          ? dividirDecimales(nMonto, nValor!, decimales)
          : multiplicarDecimales(nMonto, sumarDecimales("1", `-${multiplicarDecimales(nValor!, "0.01", 8)}`), decimales);
  const pendientes = taquilla.operaciones.filter((o) => o.estado === "PENDIENTE").length;
  // con la caja cerrada solo se puede lo que no la toca: una transferencia, o un ingreso que queda pendiente
  const necesitaCaja = !porBanco && (tipo === "EGRESO" || confirmada);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nMonto || !/[1-9]/.test(nMonto)) return setError("Escribí el monto.");
    if (valor.trim() && !valorValido) return setError(formula === "comision" ? "La comisión no es un número válido." : "La tasa no es un número válido.");
    if (formula === "dividir" && !valorValido) return setError("Para dividir hace falta la tasa.");
    if (formula === "comision" && valorValido && Number(nValor) >= 100) return setError("La comisión tiene que ser menor al 100%.");
    if (!total || !/[1-9]/.test(total)) return setError("El total da cero: revisá el monto y la tasa o la comisión.");
    setOcupado("nueva");
    try {
      onCambio(
        await crearOperacionTaquilla({
          tipo,
          monedaCodigo: moneda,
          monedaOperacion,
          cantidad: nMonto,
          ...(valorValido ? (formula === "comision" ? { comisionPct: nValor! } : { tasa: nValor!, dividir: formula === "dividir" }) : {}),
          medio,
          descripcion: descripcion.trim() || undefined,
          clienteNombre: cliente.trim() || undefined,
          clienteTelefono: telefono.trim() || undefined,
          clienteCedula: cedula.trim() || undefined,
          confirmada: tipo === "INGRESO" ? confirmada : undefined,
        })
      );
      setMonto("");
      setValor("");
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
        ? `¿Confirmar el ingreso de ${dinero(o.total, o.moneda_codigo)}${o.cliente_nombre ? ` de ${o.cliente_nombre}` : ""}? ${o.medio === "BANCOLOMBIA" ? "Fue por Bancolombia: no toca la caja." : "Suma a la caja."}`
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

  const nombreOperacion = MONEDAS_OPERACION.find((m) => m.codigo === monedaOperacion)?.nombre.toLowerCase() ?? "";

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

        <div className="tq-operacion-opciones">
          <label>
            Moneda que se compra o se vende
            <select value={monedaOperacion} onChange={(e) => setMonedaOperacion(e.target.value)}>
              {MONEDAS_OPERACION.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="tq-operacion-grupo">
            <span>Cuenta</span>
            <div className="cc-segmento" role="group" aria-label="Tasa, dividir o comisión">
              {(
                [
                  ["tasa", "Tasa"],
                  ["dividir", "Dividir ÷"],
                  ["comision", "Comisión %"],
                ] as [Formula, string][]
              ).map(([f, etiqueta]) => (
                <button key={f} type="button" className={formula === f ? "activo" : ""} onClick={() => setFormula(f)} aria-pressed={formula === f}>
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>
          <div className="tq-operacion-grupo">
            <span>Se mueve por</span>
            <div className="cc-segmento" role="group" aria-label="Efectivo o Bancolombia">
              <button type="button" className={!porBanco ? "activo" : ""} onClick={() => setMedio("EFECTIVO")} aria-pressed={!porBanco}>
                Efectivo
              </button>
              <button type="button" className={porBanco ? "activo" : ""} onClick={() => setMedio("BANCOLOMBIA")} aria-pressed={porBanco}>
                Bancolombia
              </button>
            </div>
          </div>
        </div>

        <div className="tq-operacion-cuenta">
          <label>
            Monto en {nombreOperacion}
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="100.000" autoComplete="off" />
          </label>
          <span aria-hidden="true">{formula === "comision" ? "−" : formula === "dividir" ? "÷" : "×"}</span>
          <label>
            {formula === "comision" ? "Comisión %" : "Tasa"}
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={formula === "comision" ? "4" : "3,3"} autoComplete="off" />
          </label>
          <span aria-hidden="true">=</span>
          <label>
            Total, en
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as CodigoTaquilla)} aria-label="Moneda del total">
              {(Object.keys(NOMBRE_MONEDA) as CodigoTaquilla[]).map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_MONEDA[c]}
                </option>
              ))}
            </select>
          </label>
          <output className={`tq-operacion-total ${tipo === "EGRESO" ? "egreso" : ""} ${porBanco ? "banco" : ""}`}>{total ? `${tipo === "EGRESO" ? "− " : "+ "}${dinero(total, moneda)}` : "—"}</output>
        </div>
        <p className="tq-operacion-nota">
          {porBanco
            ? "Por Bancolombia es una transferencia: queda registrado, pero no suma ni resta de la caja."
            : tipo === "EGRESO"
              ? "En efectivo: el egreso descuenta de la caja al registrarlo."
              : "En efectivo: el ingreso suma a la caja cuando se confirma."}
        </p>

        <div className="tq-operacion-datos">
          <label className="ancho">
            Descripción (es lo que se le envía al cliente por WhatsApp)
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Compra de 100.000 Bs a 3,3: recibe $330.000" maxLength={300} autoComplete="off" />
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
              <small>{confirmada ? (porBanco ? "Queda confirmado (sin tocar la caja)." : "Suma a la caja de una vez.") : "Queda pendiente hasta que se confirme."}</small>
            </label>
          ) : (
            <span />
          )}
          <button type="submit" className="cc-guardar" disabled={ocupado !== null || (!abierta && necesitaCaja)} title={!abierta && necesitaCaja ? "Primero abrí la caja de taquilla" : undefined}>
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
          {taquilla.operaciones.map((o) => {
            const wa = telefonoWhatsApp(o.cliente_telefono);
            // Al cliente se le envía la descripción que se escribió; si no hay, la cuenta del movimiento
            const mensaje = o.descripcion?.trim() || `${cuentaDe(o)} = ${dinero(o.total, o.moneda_codigo)}`;
            return (
              <li key={o.id} className={`tq-movimiento ${o.tipo === "EGRESO" ? "egreso" : ""} ${o.estado.toLowerCase()}`}>
                <div className="tq-movimiento-datos">
                  <strong>
                    {o.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                    {o.descripcion ? ` · ${o.descripcion}` : ""}
                    <span className={`tq-mov-estado ${o.estado.toLowerCase()}`}>{o.estado === "PENDIENTE" ? "por confirmar" : o.estado === "ANULADA" ? "anulado" : "confirmado"}</span>
                    {o.medio === "BANCOLOMBIA" && <span className="tq-mov-estado banco">Bancolombia · no mueve la caja</span>}
                  </strong>
                  <span>{cuentaDe(o)}</span>
                  <span>
                    {[o.cliente_nombre, o.cliente_cedula ? `CC ${o.cliente_cedula}` : null, o.cliente_telefono].filter(Boolean).join(" · ") || "sin datos del cliente"} · {hora(o.created_at)} · {o.usuario_nombre}
                  </span>
                </div>
                <strong className="tq-movimiento-total">
                  {o.tipo === "EGRESO" ? "− " : "+ "}
                  {dinero(o.total, o.moneda_codigo)}
                </strong>
                <span className="tq-movimiento-acciones">
                  {o.estado !== "ANULADA" && (
                    <a
                      className="cc-whatsapp"
                      href={`https://wa.me/${wa ?? ""}?text=${encodeURIComponent(mensaje)}`}
                      target="_blank"
                      rel="noreferrer"
                      title={wa ? "Enviarle la descripción al cliente por WhatsApp" : "Sin teléfono: al abrir WhatsApp elegís el contacto"}
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  )}
                  {o.estado === "PENDIENTE" && (
                    <>
                      <button
                        className="tq-pagar"
                        onClick={() => accion(o, "confirmar")}
                        disabled={ocupado !== null || (!abierta && o.medio === "EFECTIVO")}
                        title={!abierta && o.medio === "EFECTIVO" ? "Primero abrí la caja de taquilla" : "Confirmar"}
                      >
                        <CheckCircle2 size={16} /> {ocupado === o.id ? "…" : "Confirmar"}
                      </button>
                      <button className="tq-anular" onClick={() => accion(o, "anular")} disabled={ocupado !== null}>
                        Anular
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
