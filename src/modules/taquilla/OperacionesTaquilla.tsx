import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, Image as IconoImagen, MessageCircle } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { leerComprobante } from "../cuentasCorrientes/ocrComprobante";
import { ApiError } from "../../api/client";
import {
  anularOperacionTaquilla,
  confirmarOperacionTaquilla,
  crearOperacionTaquilla,
  getUrlComprobanteOperacion,
  subirComprobanteOperacion,
  type OperacionTaquilla,
  type Taquilla,
} from "../../api/taquilla.api";
import { DolaresPorBillete } from "./DolaresPorBillete";
import { dividirDecimales, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { alAbrirWhatsApp, enlaceWhatsApp } from "../../utils/whatsapp";

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

// Los datos que suele llevar el mensaje al cliente, uno por línea
const PLANTILLA_DESCRIPCION = ["Banco: ", "Tipo de cuenta: ", "Número de cuenta: ", "Nombre: ", "Cédula: ", "Monto: "].join("\n");

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
  const [ladoElegido, setLadoElegido] = useState<"MONTO" | "RESULTADO" | "AMBOS" | null>(null);
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
  // La imagen del comprobante: se carga o se pega (Ctrl+V), se lee para llenar el monto y se guarda con el movimiento
  const [imagenAdjunta, setImagenAdjunta] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  const [imagenVista, setImagenVista] = useState<string | null>(null);

  async function cargarComprobante(archivo: File | undefined) {
    if (!archivo) return;
    setImagenAdjunta(archivo);
    setError(null);
    setAvisoLectura(null);
    setLeyendo(true);
    try {
      const d = await leerComprobante(archivo);
      const partes: string[] = [];
      if (d.monto) {
        setMonto(formatearMonto(d.monto));
        // el monto del comprobante está en su moneda: si se reconoce, queda elegida
        if (d.moneda && MONEDAS.some((m) => m.codigo === d.moneda)) {
          setMonedaMonto(d.moneda);
          setLadoElegido(null);
        }
        partes.push(`monto ${formatearMonto(d.monto)}${d.moneda ? ` ${d.moneda}` : ""}`);
      }
      if (d.referencia) {
        // la referencia va a la descripción, en su propio renglón
        setDescripcion((actual) => (actual.includes(d.referencia!) ? actual : `${actual.trim() ? `${actual.replace(/\s+$/, "")}\n` : ""}Referencia: ${d.referencia}`));
        partes.push(`referencia ${d.referencia}`);
      }
      setAvisoLectura(partes.length ? `Leído de la imagen: ${partes.join(", ")}. Revisalo antes de registrar.` : "La imagen queda adjunta, pero no encontré monto ni referencia en ella.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la imagen.");
    } finally {
      setLeyendo(false);
    }
  }

  // Pegar una captura (Ctrl+V) en cualquier parte de la pantalla la toma como comprobante
  const pegarImagen = useRef<(imagen: File) => void>(() => {});
  pegarImagen.current = (imagen) => {
    if (!leyendo) void cargarComprobante(imagen);
  };
  useEffect(() => {
    const alPegar = (e: globalThis.ClipboardEvent) => {
      const imagen = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!imagen) return; // texto u otra cosa: se pega normal
      e.preventDefault();
      pegarImagen.current(imagen);
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, []);

  async function verComprobante(id: number) {
    try {
      setImagenVista(await getUrlComprobanteOperacion(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la imagen.");
    }
  }

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
  // Si los dos lados son efectivo de la caja (dólares por pesos), se mueven los dos: entra uno y sale el otro
  const ambosDeLaCaja = DE_LA_CAJA.includes(monedaMonto) && DE_LA_CAJA.includes(monedaResultado) && monedaMonto !== monedaResultado;
  const ladoAuto: "MONTO" | "RESULTADO" | "AMBOS" = ambosDeLaCaja ? "AMBOS" : DE_LA_CAJA.includes(monedaResultado) ? "RESULTADO" : "MONTO";
  const lado = ladoElegido ?? ladoAuto;
  const montoRedondeado = nMonto ? multiplicarDecimales(nMonto, "1", decimalesDe(monedaMonto)) : null;
  const monedaCaja = lado === "RESULTADO" ? monedaResultado : monedaMonto;
  const montoCaja = lado === "RESULTADO" ? resultado : montoRedondeado;
  const cajaPuede = lado === "AMBOS" ? ambosDeLaCaja : DE_LA_CAJA.includes(monedaCaja);

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
      const creada = await crearOperacionTaquilla({
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
        });
      onCambio(creada);
      // la imagen del comprobante queda guardada con el movimiento; si no sube, el movimiento igual quedó
      if (imagenAdjunta) {
        await subirComprobanteOperacion(creada.operacionId, imagenAdjunta)
          .then(onCambio)
          .catch((e) => setError(`El movimiento se registró, pero la imagen no se guardó: ${(e as Error).message}`));
      }
      setImagenAdjunta(null);
      setAvisoLectura(null);
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
      <div className="tq-dos-cards">
      <form className="tq-operacion" onSubmit={registrar}>
        <div className="tq-operacion-cabeza">
          <h2>Conversión · ingreso / egreso</h2>
          <label className={`cc-leer-comprobante tq-leer ${leyendo ? "leyendo" : ""}`} title="Elegí la imagen, o pegala con Ctrl+V en cualquier parte de la pantalla">
            <Camera size={15} /> {leyendo ? "Leyendo la imagen…" : "Cargar o pegar imagen"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={leyendo}
              onChange={(e) => {
                void cargarComprobante(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <div className="cc-segmento" role="group" aria-label="Ingreso o egreso">
            <button type="button" className={tipo === "INGRESO" ? "activo" : ""} onClick={() => setTipo("INGRESO")} aria-pressed={tipo === "INGRESO"}>
              Ingreso (suma)
            </button>
            <button type="button" className={tipo === "EGRESO" ? "activo" : ""} onClick={() => setTipo("EGRESO")} aria-pressed={tipo === "EGRESO"}>
              Egreso (resta)
            </button>
          </div>
        </div>

        {avisoLectura && <p className="cc-aviso-lectura">{avisoLectura}</p>}
        {imagenAdjunta && (
          <p className="cc-imagen-adjunta">
            <IconoImagen size={14} /> Imagen del comprobante lista: se guarda con el movimiento.
            <button type="button" onClick={() => setImagenAdjunta(null)}>
              Quitar
            </button>
          </p>
        )}
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
          ) : lado === "AMBOS" ? (
            <span>
              {tipo === "INGRESO" ? "Se suman" : "Se restan"} <strong>{montoRedondeado ? dinero(montoRedondeado, monedaMonto) : "—"}</strong> {tipo === "INGRESO" ? "a la caja y se restan" : "de la caja y se suman"}{" "}
              <strong>{resultado ? dinero(resultado, monedaResultado) : "—"}</strong>
              {tipo === "INGRESO" && !confirmada ? " (cuando se confirme)" : ""}
            </span>
          ) : (
            <span>
              {tipo === "INGRESO" ? "Se suman" : "Se restan"} <strong>{montoCaja ? dinero(montoCaja, monedaCaja) : "—"}</strong> {tipo === "INGRESO" ? "a la caja" : "de la caja"}
              {tipo === "INGRESO" && !confirmada ? " (cuando se confirme)" : ""}
            </span>
          )}
          {!porBanco && (ambosDeLaCaja || !cajaPuede) && (
            <span className="cc-segmento tq-lado" role="group" aria-label="Qué mueve la caja">
              {ambosDeLaCaja && (
                <button type="button" className={lado === "AMBOS" ? "activo" : ""} onClick={() => setLadoElegido("AMBOS")} aria-pressed={lado === "AMBOS"}>
                  Los dos
                </button>
              )}
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
          <label className="ancho tq-descripcion">
            <span className="tq-descripcion-cabeza">
              Descripción (es lo que se le envía al cliente por WhatsApp)
              {!descripcion.trim() && (
                <button type="button" onClick={() => setDescripcion(PLANTILLA_DESCRIPCION)}>
                  Usar plantilla
                </button>
              )}
            </span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={6}
              maxLength={1000}
              placeholder={"Banco: Bancolombia\nTipo de cuenta: Ahorros\nNúmero de cuenta: 123-456789-00\nNombre: Juan Pérez\nCédula: 12.345.678\nMonto: $330.000"}
            />
            <small>Cada dato en su renglón: Enter (o Shift + Enter) baja de línea, y así mismo le llega al cliente.</small>
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
      <DolaresPorBillete
        abierta={abierta}
        onCambio={(t) => {
          onCambio(t);
          setVerMovimientos(true);
        }}
      />
      </div>

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
                    <span className={`tq-mov-estado ${o.estado.toLowerCase()}`}>{o.estado === "PENDIENTE" ? "por confirmar" : o.estado === "ANULADA" ? "anulado" : "confirmado"}</span>
                    {o.medio === "BANCOLOMBIA" && <span className="tq-mov-estado banco">Bancolombia · no mueve la caja</span>}
                  </strong>
                  <span>{cuentaDe(o)}</span>
                  {o.descripcion && <span className="tq-mov-descripcion">{o.descripcion}</span>}
                  {o.tiene_comprobante && (
                    <span>
                      <button type="button" className="cc-ver-comprobante" onClick={() => verComprobante(o.id)} title="Ver la imagen del comprobante">
                        <IconoImagen size={13} /> comprobante
                      </button>
                    </span>
                  )}
                  <span>
                    {[o.cliente_nombre, o.cliente_cedula ? `CC ${o.cliente_cedula}` : null, o.cliente_telefono].filter(Boolean).join(" · ") || "sin datos del cliente"} · {hora(o.created_at)} · {o.usuario_nombre}
                  </span>
                </div>
                <strong className="tq-movimiento-total" title="Lo que mueve la caja">
                  {o.tipo === "EGRESO" ? "− " : "+ "}
                  {dinero(o.total, o.moneda_codigo)}
                  {o.caja_lado === "AMBOS" && o.resultado && (
                    <span className="tq-otro-lado">
                      {o.tipo === "EGRESO" ? "+ " : "− "}
                      {dinero(o.resultado, o.moneda_resultado)}
                    </span>
                  )}
                </strong>
                <span className="tq-movimiento-acciones">
                  {o.estado !== "ANULADA" && (
                    <a
                      className="cc-whatsapp"
                      href={enlaceWhatsApp(wa, mensaje)}
                      onClick={(e) => alAbrirWhatsApp(e, wa, mensaje)}
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
      {imagenVista && (
        <Modal titulo="Comprobante" ancho="ancho" onCerrar={() => setImagenVista(null)}>
          <div className="cc-reporte">
            <img src={imagenVista} alt="Imagen del comprobante" />
          </div>
        </Modal>
      )}
    </section>
  );
}
