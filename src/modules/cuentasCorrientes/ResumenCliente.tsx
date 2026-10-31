import { useEffect, useState } from "react";
import { getUltimosDelCliente, type CuentaCorrienteResumen, type MovimientoCliente } from "../../api/cuentasCorrientes.api";
import { formatearMonto } from "../../utils/montos";

const MEDIO: Record<string, string> = { BOLIVARES: "Bolívares", BANCOLOMBIA: "Bancolombia", NEQUI: "Nequi", USDT: "USDT", WESTERN_UNION: "Western Union", ZELLE: "Zelle" };
const VISIBLES = 4;

const dinero = (valor: string, moneda: string) => {
  const numero = formatearMonto(valor.replace(/^-/, ""));
  return moneda === "COP" ? `$${numero}` : `${numero} ${moneda}`;
};
const cuando = (fecha: string) => new Date(fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Confirmaciones: el cliente es uno solo aunque haya pagado por varios medios o en varias monedas. Arriba de su hoja se
 * ven juntos sus últimos movimientos y, si tiene más de una hoja, se pasa de una a otra sin volver a la lista.
 */
export function ResumenCliente({
  cuentas,
  cuentaId,
  terceroId,
  version,
  onElegirCuenta,
  onVerMovimiento,
}: {
  cuentas: CuentaCorrienteResumen[];
  cuentaId: number;
  terceroId: number;
  version: number; // cambia cuando se registra algo: se vuelven a traer los movimientos
  onElegirCuenta: (id: number) => void;
  onVerMovimiento: (m: MovimientoCliente) => void;
}) {
  const [movimientos, setMovimientos] = useState<MovimientoCliente[]>([]);
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    let vigente = true;
    getUltimosDelCliente(terceroId)
      .then((l) => vigente && setMovimientos(l))
      .catch(() => vigente && setMovimientos([]));
    return () => {
      vigente = false;
    };
  }, [terceroId, version]);

  const lista = todos ? movimientos : movimientos.slice(0, VISIBLES);
  if (cuentas.length < 2 && movimientos.length === 0) return null;
  return (
    <section className="cc-cliente" aria-label="Movimientos del cliente">
      {cuentas.length > 1 && (
        <div className="cc-cliente-cuentas" role="tablist" aria-label="Hojas del cliente">
          {cuentas.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === cuentaId} className={c.id === cuentaId ? "activa" : ""} onClick={() => onElegirCuenta(c.id)}>
              {MEDIO[c.canal_nombre] ?? c.canal_nombre.replace(/_/g, " ")} <b>{dinero(c.saldo_actual, c.moneda_codigo)}</b>
            </button>
          ))}
        </div>
      )}
      {lista.length > 0 && (
        <ul className="cc-cliente-movs">
          {lista.map((m, i) => {
            const [titulo, ...resto] = (m.descripcion ?? m.tipo).split(" · ");
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onVerMovimiento(m)} title="Ver este movimiento en su hoja">
                  <span className={`cc-cliente-punto ${Number(m.monto) < 0 ? "pago" : ""}`} />
                  <span className="cc-cliente-texto">
                    <b>{titulo}</b>
                    {i === 0 && <i>Último</i>}
                    <small>
                      {cuando(m.fecha)}
                      {resto.length ? ` · ${resto.join(" · ")}` : ""}
                    </small>
                  </span>
                  <span className="cc-cliente-monto">{dinero(m.monto, m.moneda_codigo)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {movimientos.length > VISIBLES && (
        <button type="button" className="cc-cliente-mas" onClick={() => setTodos((t) => !t)}>
          {todos ? "Ver menos" : `Ver más (${movimientos.length})`}
        </button>
      )}
    </section>
  );
}
