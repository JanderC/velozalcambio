import { useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { ApiError } from "../../api/client";
import { anularOperacionTaquilla, confirmarOperacionTaquilla, crearOperacionTaquilla, type OperacionTaquilla, type Taquilla } from "../../api/taquilla.api";
import { dividirDecimales, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

// Las monedas que se compran, se venden o se convierten en la ventanilla
const MONEDAS: { codigo: string; nombre: string }[] = [
  { codigo: "COP", nombre: "Pesos" },
  { codigo: "VES", nombre: "Bolívares" },
  { codigo: "USD", nombre: "Dólares" },
  { codigo: "USDT", nombre: "USDT" },
  { codigo: "EUR", nombre: "Euros" },
];
// La caja de taquilla solo tiene efectivo en estas
const DE_LA_CAJA = ["COP", "USD", "EUR"];
const nombreDe = (codigo: string | null) => MONEDAS.find((m) => m.codigo === codigo)?.nombre ?? codigo ?? "";
const decimalesDe = (codigo: string) => (codigo === "COP" ? 0 : 2);
type Formula = "tasa" | "dividir" | "comision";

function dinero(monto: string, codigo: string | null) {
  const numero = formatearMonto(monto.replace(/^-/, ""));
  return codigo === "COP" ? `$${numero}` : codigo === "VES" ? `Bs. ${numero}` : codigo ? `${numero} ${codigo}` : numero;
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

/** La cuenta del movimiento, como se muestra: Bs. 100.000 × 3,3 = $330.000, o $100.000 ÷ 3,3 = Bs. 30.303. */
function cuentaDe(o: OperacionTaquilla) {
  const base = dinero(o.cantidad, o.moneda_operacion);
  const tasa = o.tasa ? ` ${o.divide ? "÷" : "×"} ${formatearMonto(o.tasa)}` : "";
  const comision = o.comision_pct && /[1-9]/.test(o.comision_pct) ? ` − ${formatearMonto(o.comision_pct)}%` : "";
  // las operaciones viejas no guardaban el resultado aparte: era el total
  const resultado = o.resultado ? dinero(o.resultado, o.moneda_resultado) : dinero(o.total, o.moneda_codigo);
  return `${base}${tasa}${comision} = ${resultado}`;
}

/**
 * Ingreso / egreso de ventanilla, que casi siempre es una conversión: el cliente trae una moneda y se lleva otra.
 *   me venden 100.000 Bs a 3,3   -> Bs 100.000 × 3,3 = $330.000    (la caja se mueve por el resultado, en pesos)
 *   trae $100.000 y quiere Bs    -> $100.000 ÷ 3,3 = Bs 30.303     (la caja se mueve por lo que trae, en pesos)
 * La cuenta es como en Confirmaciones: por tasa (×), dividiendo (÷) o con comisión (− %).
 * En efectivo mueve la caja (el egreso al registrarlo, el ingreso al confirmarlo); por Bancolombia es transferencia y no la toca.
 */
export function OperacionesTaquilla({ taquilla, onCambio }: { taquilla: Taquilla; onCambio: (t: Taquilla) => void }) {
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [monedaMonto, setMonedaMonto] = useState("VES"); // en qué está lo que trae el cliente o se negocia
  const [monedaResultado, setMonedaResultado] = useState("COP"); // en qué queda la cuenta
  const [formula, setFormula] = useState<Formula>("tasa");
  const [medio, setMedio] = useState<"EFECTIVO" | "BANCOLOMBIA">("EFECTIVO");
  // qué lado mueve la caja: se elige solo (el que sea efectivo de la caja) y se puede cambiar
  const [ladoElegido, setLadoElegido] = useState<"MONTO" | "RESULTADO" | null>(null);
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
  const decimales = decimalesDe(monedaResultado);
  // por tasa: monto × tasa · dividiendo: monto ÷ tasa · con comisión: monto − % (sin valor, el monto tal cual)
  const resultado = !nMonto
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

  // La caja se mueve por el lado que es efectivo suyo: el resultado si está en pesos/dólares/euros; si no, lo que trae el cliente
  const ladoAuto: "MONTO" | "RESULTADO" = DE_LA_CAJA.includes(monedaResultado) ? "RESULTADO" : "MONTO";
  const lado = ladoElegido ?? ladoAuto;
  const monedaCaja = lado === "MONTO" ? monedaMonto : monedaResultado;
  const montoCaja = lado === "MONTO" ? (nMonto ? multiplicarDecimales(nMonto, "1", decimalesDe(monedaMonto)) : null) : resultado;
  const cajaPuede = DE_LA_CAJA.includes(monedaCaja);
  const ambosDeLaCaja = DE_LA_CAJA.includes(monedaMonto) && DE_LA_CAJA.includes(monedaResultado) && monedaMonto !== monedaResultado;

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
    if (!resultado || !/[1-9]/.test(resultado)) return setError("El resultado da cero: revisá el monto y la tasa o la comisión.");
    if (!porBanco && !cajaPuede) return setError(`La caja solo tiene pesos, dólares y euros: no puede moverse en ${nombreDe(monedaCaja).toLowerCase()}. Elegí Bancolombia o cambiá las monedas.`);
    setOcupado("nueva");
    try {
      onCambio(
        await crearOperacionTaquilla({
          tipo,
          cantidad: nMonto,
          monedaOperacion: monedaMonto,
          ...(valorValido ? (formula === "comision" ? { comisionPct: nValor! } : { tasa: nValor!, dividir: formula === "dividir" }) : {}),
          monedaResultado,
          cajaLado: lado,
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
      setLadoElegido(null);
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

  const selectorMoneda = (valorActual: string, cambiar: (c: string) => void, etiqueta: string) => (
    <select
      value={valorActual}
      onChange={(e) => {
        cambiar(e.target.value);
        setLadoElegido(null);
      }}
      aria-label={etiqueta}
    >
      {MONEDAS.map((m) => (
        <option key={m.codigo} value={m.codigo}>
          {m.nombre}
        </option>
      ))}
    </select>
  );

  return (
    <section className="tq-operaciones" aria-label="Ingreso o egreso de caja">
      <form className="tq-operacion" onSubmit={registrar}>
        <div className="tq-operacion-cabeza">
          <h2>Ingreso / egreso de caja</h2>
          <div className="cc-segmento" role="group" aria-label="Ingreso o egreso">
            <button type="button" className={tipo === "INGRESO" ? "activo" : ""} onClick={() => setTipo("INGRESO")} aria-pressed={tipo === "INGRESO"}>
              Ingreso (suma)
            </button>
            <button type="button" className={tipo === "EGRESO" ? "activo" : ""} onClick={() => setTipo("EGRESO")} aria-pressed={tipo === "EGRESO"}>
              Egreso (resta)
            </button>
          </div>
        </div>

        <div className="tq-operacion-opciones">
          <div className="tq-operacion-grupo">
            <span>Cuenta</span>
            <div className="cc-segmento" role="group" aria-label="Multiplicar por la tasa, dividir o comisión">
              {(
                [
                  ["tasa", "Multiplicar ×"],
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
            Monto, en
            {selectorMoneda(monedaMonto, setMonedaMonto, "Moneda del monto")}
            <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="100.000" autoComplete="off" aria-label="Monto" />
          </label>
          <span aria-hidden="true">{formula === "comision" ? "−" : formula === "dividir" ? "÷" : "×"}</span>
          <label>
            {formula === "comision" ? "Comisión %" : "Tasa"}
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={formula === "comision" ? "4" : "3,3"} autoComplete="off" />
          </label>
          <span aria-hidden="true">=</span>
          <label>
            Resultado, en
            {selectorMoneda(monedaResultado, setMonedaResultado, "Moneda del resultado")}
            <output className="tq-operacion-total neutro">{resultado ? dinero(resultado, monedaResultado) : "—"}</output>
          </label>
        </div>

        {/* Lo que pasa con la caja, dicho claro */}
        <div className={`tq-operacion-caja ${porBanco ? "banco" : tipo === "EGRESO" ? "egreso" : ""}`}>
          {porBanco ? (
            <span>Por Bancolombia es una transferencia: queda registrado, pero no suma ni resta de la caja.</span>
          ) : !cajaPuede ? (
            <span>La caja no tiene efectivo en {nombreDe(monedaCaja).toLowerCase()}: elegí qué lado la mueve, o Bancolombia.</span>
          ) : (
            <span>
              {tipo === "INGRESO" ? "Suma a la caja" : "Resta de la caja"}:{" "}
              <strong>
                {tipo === "INGRESO" ? "+ " : "− "}
                {montoCaja ? dinero(montoCaja, monedaCaja) : "—"}
              </strong>
              {tipo === "INGRESO" && !confirmada ? " (cuando se confirme)" : ""}
            </span>
          )}
          {!porBanco && (ambosDeLaCaja || !cajaPuede) && (
            <span className="cc-segmento tq-lado" role="group" aria-label="Qué mueve la caja">
              <button type="button" className={lado === "MONTO" ? "activo" : ""} onClick={() => setLadoElegido("MONTO")} aria-pressed={lado === "MONTO"}>
                El monto ({nombreDe(monedaMonto)})
              </button>
              <button type="button" className={lado === "RESULTADO" ? "activo" : ""} onClick={() => setLadoElegido("RESULTADO")} aria-pressed={lado === "RESULTADO"}>
                El resultado ({nombreDe(monedaResultado)})
              </button>
            </span>
          )}
        </div>

        <div className="tq-operacion-datos">
          <label className="ancho">
            Descripción (es lo que se le envía al cliente por WhatsApp)
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Recibimos $100.000, le enviamos Bs. 30.303 a tasa 3,3" maxLength={300} autoComplete="off" />
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
            const mensaje = o.descripcion?.trim() || cuentaDe(o);
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
                <strong className="tq-movimiento-total" title="Lo que mueve la caja">
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
