import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { crearOperacionTaquilla, type Taquilla } from "../../api/taquilla.api";
import { formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

// Los billetes no valen igual según su denominación o su estado: cada clase tiene su precio, que pone el negocio
type Divisa = "USD" | "EUR";
type Entrega = "COP" | "USD" | "EUR";
const CLASES: Record<Divisa, { clave: string; nombre: string; corto: string }[]> = {
  USD: [
    { clave: "grandes", nombre: "Billetes de 50 y 100", corto: "de 50 y 100" },
    { clave: "chicos", nombre: "Billetes de 20 para abajo", corto: "de 20 para abajo" },
    { clave: "deteriorados", nombre: "Billetes deteriorados", corto: "deteriorados" },
  ],
  EUR: [
    { clave: "grandes", nombre: "Billetes de 500 y 200", corto: "de 500 y 200" },
    { clave: "chicos", nombre: "Sencillo", corto: "sencillo" },
    { clave: "deteriorados", nombre: "Billetes deteriorados", corto: "deteriorados" },
  ],
};
const NOMBRE: Record<Entrega, string> = { COP: "Pesos", USD: "Dólares", EUR: "Euros" };
const CLAVE_PRECIOS = "tq-precios-por-billete";

function dinero(monto: string, codigo: Entrega) {
  const numero = formatearMonto(monto);
  return codigo === "COP" ? `$${numero}` : `${numero} ${codigo}`;
}

type Precios = Record<string, string>; // "USD>COP:grandes" -> "3.900"
function preciosGuardados(): Precios {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PRECIOS) ?? "{}") as Precios;
  } catch {
    return {};
  }
}

/**
 * Dólares o euros en efectivo, desglosados por tipo de billete, cada uno al precio que pone el negocio.
 * Arriba se elige qué se desglosa (dólares o euros) y en qué se entrega (pesos, o la otra divisa), sin cambiar de pantalla.
 * Suma la divisa a la caja y, si se le entrega efectivo, lo resta.
 */
export function DolaresPorBillete({ abierta, onCambio }: { abierta: boolean; onCambio: (t: Taquilla) => void }) {
  const [divisa, setDivisa] = useState<Divisa>("USD");
  const [entregaElegida, setEntregaElegida] = useState<Entrega>("COP");
  // no se entrega en la misma moneda que se recibe
  const entrega: Entrega = entregaElegida === divisa ? "COP" : entregaElegida;
  const [precios, setPrecios] = useState<Precios>(preciosGuardados);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  // si se le entrega efectivo sale de la caja; si la divisa es un pago, solo entra
  const [seEntrega, setSeEntrega] = useState(true);
  // false: se compra la divisa (suma a la caja). true: se vende (resta de la caja)
  const [venta, setVenta] = useState(false);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decimales = entrega === "COP" ? 0 : 2;
  // los precios de venta se guardan aparte de los de compra
  const clavePrecio = (clase: string) => `${venta ? "venta:" : ""}${divisa}>${entrega}:${clase}`;
  const filas = CLASES[divisa].map((c) => {
    const escrito = cantidades[`${divisa}:${c.clave}`] ?? "";
    const cantidad = escrito.trim() ? leerNumero(escrito)?.replace(/^-/, "") ?? null : null;
    const precioEscrito = precios[clavePrecio(c.clave)] ?? "";
    const precio = precioEscrito.trim() ? leerNumero(precioEscrito)?.replace(/^-/, "") ?? null : null;
    const valida = !!cantidad && /[1-9]/.test(cantidad);
    const subtotal = valida && precio && /[1-9]/.test(precio) ? multiplicarDecimales(cantidad!, precio, decimales) : null;
    return { ...c, escrito, precioEscrito, cantidad: valida ? cantidad! : null, precio, subtotal };
  });
  const conCantidad = filas.filter((f) => f.cantidad);
  const totalDivisa = conCantidad.reduce((suma, f) => sumarDecimales(suma, f.cantidad!), "0");
  const totalEntrega = conCantidad.reduce((suma, f) => (f.subtotal ? sumarDecimales(suma, f.subtotal) : suma), "0");
  const hayAlgo = conCantidad.length > 0;

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (filas.some((f) => f.escrito.trim() && !f.cantidad)) return setError("Alguna cantidad no es un número válido.");
    if (!hayAlgo) return setError(`Escribí cuántos ${NOMBRE[divisa].toLowerCase()} hay de cada tipo de billete.`);
    const sinPrecio = conCantidad.find((f) => !f.subtotal);
    if (sinPrecio) return setError(`Falta el valor para los billetes ${sinPrecio.corto}.`);
    setEnviando(true);
    try {
      // El detalle queda en la descripción: es lo que se ve en los movimientos y lo que se le envía al cliente
      const detalle = conCantidad.map((f) => `${formatearMonto(f.cantidad!)} ${divisa} ${f.corto} × ${formatearMonto(f.precio!)} = ${dinero(f.subtotal!, entrega)}`).join(" + ");
      const descripcion = `${venta ? "Venta de" : "Compra de"} ${NOMBRE[divisa].toLowerCase()}: ${detalle}. Total ${formatearMonto(totalDivisa)} ${divisa} = ${dinero(totalEntrega, entrega)}`;
      onCambio(
        await crearOperacionTaquilla({
          // ingreso: compramos la divisa (entra). egreso: la vendemos (sale, y entra lo que paga)
          tipo: venta ? "EGRESO" : "INGRESO",
          cantidad: totalDivisa,
          monedaOperacion: divisa,
          monedaResultado: entrega,
          resultado: totalEntrega, // la suma de cada clase a su precio, no una sola tasa
          cajaLado: seEntrega ? "AMBOS" : "MONTO",
          medio: "EFECTIVO",
          descripcion: descripcion.slice(0, 1000),
          clienteNombre: cliente.trim() || undefined,
          clienteTelefono: telefono.trim() || undefined,
          confirmada: true, // el efectivo se recibe en la mano: entra de una vez
        })
      );
      try {
        localStorage.setItem(CLAVE_PRECIOS, JSON.stringify(precios));
      } catch {
        // no es grave: solo no se recuerdan los precios
      }
      setCantidades({});
      setCliente("");
      setTelefono("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tq-operacion tq-billetes" onSubmit={registrar}>
      <div className="tq-operacion-cabeza">
        <h2>Billetes por tipo</h2>
        {/* Compra: la divisa entra a la caja (suma). Venta: sale de la caja (resta). */}
        <div className="cc-segmento" role="group" aria-label="Compra o venta de la divisa">
          <button type="button" className={!venta ? "activo" : ""} onClick={() => setVenta(false)} aria-pressed={!venta}>
            Ingreso (suma)
          </button>
          <button type="button" className={venta ? "activo" : ""} onClick={() => setVenta(true)} aria-pressed={venta}>
            Egreso (resta)
          </button>
        </div>
      </div>
      {/* Cambio rápido: qué se desglosa y en qué se entrega */}
      <div className="tq-billetes-selectores">
        <div className="tq-operacion-grupo">
          <span>{venta ? "Se le venden" : "Trae"}</span>
          <div className="cc-segmento" role="group" aria-label="Qué billetes trae">
            {(["USD", "EUR"] as Divisa[]).map((d) => (
              <button key={d} type="button" className={divisa === d ? "activo" : ""} onClick={() => setDivisa(d)} aria-pressed={divisa === d}>
                {NOMBRE[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="tq-operacion-grupo">
          <span>{venta ? "Paga en" : "Se le entrega en"}</span>
          <div className="cc-segmento" role="group" aria-label="En qué se le entrega">
            {(["COP", "USD", "EUR"] as Entrega[])
              .filter((m) => m !== divisa)
              .map((m) => (
                <button key={m} type="button" className={entrega === m ? "activo" : ""} onClick={() => setEntregaElegida(m)} aria-pressed={entrega === m}>
                  {NOMBRE[m]}
                </button>
              ))}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Billete</th>
            <th>{NOMBRE[divisa]}</th>
            <th>Valor en {NOMBRE[entrega].toLowerCase()}</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className={f.clave === "deteriorados" ? "deteriorado" : ""}>
              <td>{f.nombre}</td>
              <td>
                <input
                  value={f.escrito}
                  onChange={(e) => setCantidades((c) => ({ ...c, [`${divisa}:${f.clave}`]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="0"
                  autoComplete="off"
                  aria-label={`${NOMBRE[divisa]} en ${f.nombre.toLowerCase()}`}
                />
              </td>
              <td>
                <input
                  value={f.precioEscrito}
                  onChange={(e) => setPrecios((p) => ({ ...p, [clavePrecio(f.clave)]: e.target.value }))}
                  inputMode="decimal"
                  placeholder={entrega === "COP" ? "ej. 3.900" : "ej. 1,08"}
                  autoComplete="off"
                  aria-label={`Valor para ${f.nombre.toLowerCase()}`}
                />
              </td>
              <td className="num">{f.subtotal ? dinero(f.subtotal, entrega) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{hayAlgo ? dinero(totalDivisa, divisa) : "—"}</td>
            <td />
            <td className="num">{hayAlgo ? dinero(totalEntrega, entrega) : "—"}</td>
          </tr>
        </tfoot>
      </table>

      <label className="cc-check tq-entrega">
        <input type="checkbox" checked={seEntrega} onChange={(e) => setSeEntrega(e.target.checked)} />
        {venta ? `Paga los ${NOMBRE[entrega].toLowerCase()} en efectivo` : `Se le entregan los ${NOMBRE[entrega].toLowerCase()} en efectivo`}
      </label>
      <div className={`tq-operacion-caja ${venta ? "egreso" : ""}`}>
        <span>
          {venta ? "Se restan" : "Se suman"} <strong>{hayAlgo ? dinero(totalDivisa, divisa) : "—"}</strong> {venta ? "de la caja" : "a la caja"}
          {seEntrega ? (
            <>
              {" "}
              y se {venta ? "suman" : "restan"} <strong>{hayAlgo ? dinero(totalEntrega, entrega) : "—"}</strong>
            </>
          ) : venta ? (
            ` (no entra efectivo: paga por otro medio)`
          ) : (
            ` (no sale nada: los ${NOMBRE[divisa].toLowerCase()} son un pago)`
          )}
        </span>
      </div>

      <div className="tq-operacion-datos dos">
        <label>
          Cliente
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre" maxLength={120} autoComplete="off" />
        </label>
        <label>
          Teléfono
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" maxLength={40} autoComplete="off" />
        </label>
      </div>
      <div className="tq-operacion-pie">
        <span className="tq-operacion-nota">Los valores quedan guardados en este equipo.</span>
        <button type="submit" className="cc-guardar" disabled={enviando || !abierta} title={abierta ? undefined : "Primero abrí la caja de taquilla"}>
          {enviando ? "Registrando…" : `Registrar ${NOMBRE[divisa].toLowerCase()}`}
        </button>
      </div>
      {error && <p className="cc-form-error">{error}</p>}
    </form>
  );
}
