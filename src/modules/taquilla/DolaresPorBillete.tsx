import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { crearOperacionTaquilla, type Taquilla } from "../../api/taquilla.api";
import { formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";

// Los dólares no valen igual según el billete: cada clase tiene su precio en pesos, que pone el negocio
const CLASES = [
  { clave: "grandes", nombre: "Billetes de 50 y 100", corto: "de 50 y 100" },
  { clave: "chicos", nombre: "Billetes de 20 para abajo", corto: "de 20 para abajo" },
  { clave: "deteriorados", nombre: "Billetes deteriorados", corto: "deteriorados" },
] as const;
type Clave = (typeof CLASES)[number]["clave"];
const CLAVE_PRECIOS = "tq-precios-dolar-por-billete";

function preciosGuardados(): Record<Clave, string> {
  try {
    return { grandes: "", chicos: "", deteriorados: "", ...(JSON.parse(localStorage.getItem(CLAVE_PRECIOS) ?? "{}") as Partial<Record<Clave, string>>) };
  } catch {
    return { grandes: "", chicos: "", deteriorados: "" };
  }
}

const pesos = (v: string) => `$${formatearMonto(v)}`;

/**
 * Dólares en efectivo por tipo de billete: los de 50 y 100, los de 20 para abajo y los deteriorados,
 * cada uno al precio que pone el negocio. Suma los dólares a la caja y, si se le entregan pesos, los resta.
 */
export function DolaresPorBillete({ abierta, onCambio }: { abierta: boolean; onCambio: (t: Taquilla) => void }) {
  const [precios, setPrecios] = useState<Record<Clave, string>>(preciosGuardados);
  const [cantidades, setCantidades] = useState<Record<Clave, string>>({ grandes: "", chicos: "", deteriorados: "" });
  // si se le entregan pesos en efectivo salen de la caja; si los dólares son un pago, solo entran
  const [entregaPesos, setEntregaPesos] = useState(true);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filas = CLASES.map((c) => {
    const cantidad = cantidades[c.clave].trim() ? leerNumero(cantidades[c.clave])?.replace(/^-/, "") ?? null : null;
    const precio = precios[c.clave].trim() ? leerNumero(precios[c.clave])?.replace(/^-/, "") ?? null : null;
    const valida = !!cantidad && /[1-9]/.test(cantidad);
    const subtotal = valida && precio && /[1-9]/.test(precio) ? multiplicarDecimales(cantidad!, precio, 0) : null;
    return { ...c, cantidad: valida ? cantidad! : null, precio, subtotal, escrita: cantidades[c.clave].trim() !== "" };
  });
  const conCantidad = filas.filter((f) => f.cantidad);
  const totalDolares = conCantidad.reduce((suma, f) => sumarDecimales(suma, f.cantidad!), "0");
  const totalPesos = conCantidad.reduce((suma, f) => (f.subtotal ? sumarDecimales(suma, f.subtotal) : suma), "0");
  const hayAlgo = conCantidad.length > 0;

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (filas.some((f) => f.escrita && !f.cantidad)) return setError("Alguna cantidad de dólares no es un número válido.");
    if (!hayAlgo) return setError("Escribí cuántos dólares hay de cada tipo de billete.");
    const sinPrecio = conCantidad.find((f) => !f.subtotal);
    if (sinPrecio) return setError(`Falta el valor del dólar para los billetes ${sinPrecio.corto}.`);
    setEnviando(true);
    try {
      // El detalle queda en la descripción: es lo que se ve en los movimientos y lo que se le envía al cliente
      const detalle = conCantidad.map((f) => `${formatearMonto(f.cantidad!)} USD ${f.corto} × ${formatearMonto(f.precio!)} = ${pesos(f.subtotal!)}`).join(" + ");
      const descripcion = `Dólares: ${detalle}. Total ${formatearMonto(totalDolares)} USD = ${pesos(totalPesos)}`;
      onCambio(
        await crearOperacionTaquilla({
          tipo: "INGRESO",
          cantidad: totalDolares,
          monedaOperacion: "USD",
          monedaResultado: "COP",
          resultado: totalPesos, // la suma de cada clase a su precio, no una sola tasa
          cajaLado: entregaPesos ? "AMBOS" : "MONTO",
          medio: "EFECTIVO",
          descripcion: descripcion.slice(0, 300),
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
      setCantidades({ grandes: "", chicos: "", deteriorados: "" });
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
        <h2>Dólares por tipo de billete</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Billete</th>
            <th>Dólares</th>
            <th>Valor del dólar</th>
            <th>En pesos</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className={f.clave === "deteriorados" ? "deteriorado" : ""}>
              <td>{f.nombre}</td>
              <td>
                <input
                  value={cantidades[f.clave]}
                  onChange={(e) => setCantidades((c) => ({ ...c, [f.clave]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="0"
                  autoComplete="off"
                  aria-label={`Dólares en ${f.nombre.toLowerCase()}`}
                />
              </td>
              <td>
                <input
                  value={precios[f.clave]}
                  onChange={(e) => setPrecios((p) => ({ ...p, [f.clave]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="ej. 3.900"
                  autoComplete="off"
                  aria-label={`Valor del dólar para ${f.nombre.toLowerCase()}`}
                />
              </td>
              <td className="num">{f.subtotal ? pesos(f.subtotal) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{hayAlgo ? `${formatearMonto(totalDolares)} USD` : "—"}</td>
            <td />
            <td className="num">{hayAlgo ? pesos(totalPesos) : "—"}</td>
          </tr>
        </tfoot>
      </table>

      <label className="cc-check tq-entrega">
        <input type="checkbox" checked={entregaPesos} onChange={(e) => setEntregaPesos(e.target.checked)} />
        Se le entregan los pesos en efectivo
      </label>
      <div className="tq-operacion-caja">
        <span>
          Se suman <strong>{hayAlgo ? `${formatearMonto(totalDolares)} USD` : "—"}</strong> a la caja
          {entregaPesos ? (
            <>
              {" "}
              y se restan <strong>{hayAlgo ? pesos(totalPesos) : "—"}</strong>
            </>
          ) : (
            " (los pesos no salen: los dólares son un pago)"
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
        <span className="tq-operacion-nota">Los valores del dólar quedan guardados en este equipo.</span>
        <button type="submit" className="cc-guardar" disabled={enviando || !abierta} title={abierta ? undefined : "Primero abrí la caja de taquilla"}>
          {enviando ? "Registrando…" : "Registrar dólares"}
        </button>
      </div>
      {error && <p className="cc-form-error">{error}</p>}
    </form>
  );
}
