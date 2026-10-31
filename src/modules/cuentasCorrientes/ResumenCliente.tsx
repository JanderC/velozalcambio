import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
 * Confirmaciones: el cliente es uno solo aunque haya pagado por varios medios o en varias monedas. Arriba de su hoja va
 * una barra con sus hojas y una flecha: los últimos movimientos se despliegan encima de la hoja, sin correrla.
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
  const [abierto, setAbierto] = useState(false);
  const [todos, setTodos] = useState(false);
  const barra = useRef<HTMLElement>(null);
  useEffect(() => {
    let vigente = true;
    getUltimosDelCliente(terceroId)
      .then((l) => vigente && setMovimientos(l))
      .catch(() => vigente && setMovimientos([]));
    return () => {
      vigente = false;
    };
  }, [terceroId, version]);

  // se cierra al tocar por fuera o con Escape; al volver a abrir empieza compacto
  useEffect(() => {
    if (!abierto) return setTodos(false);
    const alTocar = (e: MouseEvent) => {
      if (!barra.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alTocar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alTocar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  const lista = todos ? movimientos : movimientos.slice(0, VISIBLES);
  if (cuentas.length < 2 && movimientos.length === 0) return null;
  return (
    <section ref={barra} className="cc-cliente" aria-label="Movimientos del cliente">
      <div className="cc-cliente-barra">
        {cuentas.length > 1 ? (
          <div className="cc-cliente-cuentas" role="tablist" aria-label="Hojas del cliente">
            {cuentas.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={c.id === cuentaId} className={c.id === cuentaId ? "activa" : ""} onClick={() => onElegirCuenta(c.id)}>
                {MEDIO[c.canal_nombre] ?? c.canal_nombre.replace(/_/g, " ")} <b>{dinero(c.saldo_actual, c.moneda_codigo)}</b>
              </button>
            ))}
          </div>
        ) : (
          <span className="cc-cliente-rotulo">Últimos movimientos</span>
        )}
        {movimientos.length > 0 && (
          <button
            type="button"
            className={`cc-cliente-flecha ${abierto ? "abierta" : ""}`}
            onClick={() => setAbierto((a) => !a)}
            aria-expanded={abierto}
            aria-label={abierto ? "Ocultar los movimientos" : "Ver los movimientos"}
            title={abierto ? "Ocultar los movimientos" : "Ver los movimientos"}
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>
      {abierto && (
        <div className="cc-cliente-panel">
          <ul className="cc-cliente-movs">
            {lista.map((m, i) => {
              const [titulo, ...resto] = (m.descripcion ?? m.tipo).split(" · ");
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAbierto(false);
                      onVerMovimiento(m);
                    }}
                    title="Ver este movimiento en su hoja"
                  >
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
          {movimientos.length > VISIBLES && (
            <button type="button" className="cc-cliente-mas" onClick={() => setTodos((t) => !t)}>
              {todos ? "Ver menos" : `Ver más (${movimientos.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
