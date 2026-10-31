import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCuentasCorrientes, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { formatearMonto } from "../../utils/montos";

const NOMBRE_MODULO: Record<string, string> = { CORRIENTE: "Cuentas Corrientes", POR_COBRAR: "Cuentas por Cobrar y Pagar", POR_PAGAR: "Cuentas por Pagar", CAJA: "Confirmaciones" };
const RUTA_MODULO: Record<string, string> = { CORRIENTE: "/cuentas-corrientes", POR_COBRAR: "/cuentas-por-cobrar-pagar", POR_PAGAR: "/cuentas-por-pagar", CAJA: "/cajas-confirmaciones" };

/** De las cuentas de un cliente, la que se trae a este módulo: la que ya fue de aquí y la de movimiento más reciente. */
export function cuentaParaTraer(cuentas: CuentaCorrienteResumen[], modulo: string) {
  const fecha = (c: CuentaCorrienteResumen) => (c.ultimo_movimiento ? new Date(c.ultimo_movimiento).getTime() : 0);
  return [...cuentas].sort((a, b) => Number(b.modulo === modulo) - Number(a.modulo === modulo) || fecha(b) - fecha(a))[0]!;
}

/**
 * Una sola lista de clientes: lo buscado que tiene cuenta en otro módulo (y no aquí) también sale, con dónde está. Se
 * busca solo en los datos del cliente: que un movimiento diga "Yisel" no hace que ese cliente sea Yisel.
 */
export function useEnOtrosModulos(buscar: string, modulo: string, activo = true) {
  const [lista, setLista] = useState<CuentaCorrienteResumen[]>([]);
  const busca = activo && buscar.trim().length >= 3;
  useEffect(() => {
    if (!busca) return setLista([]);
    let vigente = true;
    const t = setTimeout(() => {
      getCuentasCorrientes({ buscar, soloCliente: true })
        .then((todas) => {
          if (!vigente) return;
          const yaAqui = new Set(todas.filter((c) => c.modulo === modulo && c.activo).map((c) => c.tercero_id));
          const porCliente = new Map<number, CuentaCorrienteResumen[]>();
          for (const c of todas) if (!yaAqui.has(c.tercero_id)) porCliente.set(c.tercero_id, [...(porCliente.get(c.tercero_id) ?? []), c]);
          setLista([...porCliente.values()].map((l) => cuentaParaTraer(l, modulo)));
        })
        .catch(() => vigente && setLista([]));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [busca, buscar, modulo]);
  return { lista, limpiar: () => setLista([]) };
}

/** Un cliente de otro módulo: se elige la moneda de su contabilidad y se lleva aquí. Viene puesta la de su cuenta. */
function FilaEnOtroModulo({ c, monedas, etiqueta, puedeTraer, onTraer }: { c: CuentaCorrienteResumen; monedas: Moneda[]; etiqueta: string; puedeTraer: boolean; onTraer: (c: CuentaCorrienteResumen, monedaId: number) => void }) {
  const [monedaId, setMonedaId] = useState(c.moneda_id);
  return (
    <li>
      <span>
        <b>{c.tercero_nombre}</b>
        <small>
          {NOMBRE_MODULO[c.modulo] ?? c.modulo}
          {c.activo ? "" : " (cuenta eliminada)"}
          {c.grupo_cobro ? ` · ${c.grupo_cobro}` : ""} · {c.moneda_codigo} · saldo {formatearMonto(c.saldo_actual)}
          {c.tercero_telefono ? ` · ${c.tercero_telefono}` : ""}
        </small>
      </span>
      <span className="cc-otros-modulos-acciones">
        {puedeTraer && monedas.length > 0 && (
          <select value={monedaId} onChange={(e) => setMonedaId(Number(e.target.value))} aria-label="Moneda de su contabilidad" title="Moneda en la que se le lleva la contabilidad aquí">
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </select>
        )}
        {puedeTraer && (
          <button type="button" onClick={() => onTraer(c, monedaId)} title="Se usa el mismo cliente, no se crea de nuevo; lo de allá no se toca">
            {etiqueta}
          </button>
        )}
        {c.activo && RUTA_MODULO[c.modulo] && <Link to={RUTA_MODULO[c.modulo]!}>Ver allá</Link>}
      </span>
    </li>
  );
}

/** Los clientes de otro módulo, con el botón para llevarlos aquí sin crearlos de nuevo (lo de allá no se toca). */
export function ListaEnOtrosModulos({ lista, etiqueta, puedeTraer, onTraer }: { lista: CuentaCorrienteResumen[]; etiqueta: string; puedeTraer: boolean; onTraer: (c: CuentaCorrienteResumen, monedaId: number) => void }) {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const hay = lista.length > 0;
  useEffect(() => {
    if (hay && !monedas.length) getMonedas().then(setMonedas).catch(() => {});
  }, [hay, monedas.length]);
  if (!hay) return null;
  return (
    <div className="cc-otros-modulos">
      <p>Está registrado en otro módulo:</p>
      <ul>
        {lista.map((c) => (
          <FilaEnOtroModulo key={c.tercero_id} c={c} monedas={monedas} etiqueta={etiqueta} puedeTraer={puedeTraer} onTraer={onTraer} />
        ))}
      </ul>
    </div>
  );
}
