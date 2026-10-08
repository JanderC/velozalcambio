import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { crearCuentaCorriente, registrarMovimientoCC, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import type { Moneda } from "../../api/monedas.api";
import { formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";
import { SIN_GRUPO, dinero } from "./cobrar";

const NUEVO = "__nuevo__";

/** Lo que se va escribiendo en un monto, con los puntos de miles puestos solos: "1500" -> "1.500". Decimales con coma. */
export function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,]/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return "";
  return formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}

/**
 * Registrar un cliente de Cuentas por Cobrar: nombre, teléfono y grupo, igual que en Cuentas Corrientes. La cuenta se
 * lleva en pesos y cada movimiento puede ir con cantidad × tasa (dólares, bolívares…), así que no se elige moneda.
 * Si se quiere, el primer movimiento se anota acá mismo.
 */
export function NuevoClienteCobrarModal({
  grupos,
  grupoInicial,
  monedas,
  onCreado,
  onCerrar,
}: {
  grupos: string[];
  grupoInicial: string;
  monedas: Moneda[];
  onCreado: (cuenta: CuentaCorrienteResumen) => void;
  onCerrar: () => void;
}) {
  const elegibles = grupos.filter((g) => g !== SIN_GRUPO);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [grupo, setGrupo] = useState(elegibles.includes(grupoInicial) ? grupoInicial : (elegibles[0] ?? NUEVO));
  const [grupoNuevo, setGrupoNuevo] = useState("");
  const cop = monedas.find((m) => m.codigo === "COP");
  // El primer movimiento (opcional): referencia, y el monto directo o cantidad × tasa
  const [conMovimiento, setConMovimiento] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [tasa, setTasa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nCantidad = cantidad.trim() ? (leerNumero(cantidad)?.replace(/^-/, "") ?? null) : null;
  const nTasa = tasa.trim() ? (leerNumero(tasa)?.replace(/^-/, "") ?? null) : null;
  const conTasa = !!nTasa && /[1-9]/.test(nTasa);
  const total = nCantidad && /[1-9]/.test(nCantidad) ? (conTasa ? multiplicarDecimales(nCantidad, nTasa!, 0) : nCantidad) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const grupoFinal = grupo === NUEVO ? grupoNuevo.trim() : grupo;
    if (nombre.trim().length < 2) return setError("Escribí el nombre del cliente.");
    if (!grupoFinal) return setError("Escribí el nombre del grupo nuevo.");
    if (!cop) return setError("No se pudo cargar la moneda. Cerrá y volvé a abrir.");
    if (conMovimiento) {
      if (!total) return setError("Escribí el monto del movimiento (o quitá el movimiento para registrar solo el cliente).");
      if (tasa.trim() && !conTasa) return setError("La tasa no es un número válido.");
    }
    setEnviando(true);
    try {
      const cuenta = await crearCuentaCorriente({
        nuevoTercero: { nombre: nombre.trim(), tipo: "CLIENTE", telefono: telefono.trim() || undefined },
        modulo: "POR_COBRAR",
        grupoCobro: grupoFinal,
        monedaId: cop.id,
      });
      if (conMovimiento && total) {
        try {
          await registrarMovimientoCC({
            terceroId: cuenta.tercero_id,
            canalId: cuenta.canal_id,
            monedaId: cuenta.moneda_id,
            tipo: "CARGO",
            descripcion: referencia.trim() || "Saldo por cobrar",
            ...(conTasa ? { cantidadBase: nCantidad!, tasa: nTasa! } : { monto: nCantidad! }),
          });
        } catch (err) {
          // el cliente ya quedó creado: se avisa y el movimiento se anota desde su hoja
          window.alert(`El cliente quedó registrado, pero el movimiento no se pudo anotar (${err instanceof ApiError ? err.message : "error de conexión"}). Anotalo desde su hoja.`);
        }
      }
      onCreado(cuenta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cliente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nuevo cliente por cobrar" onCerrar={onCerrar}>
      <form className="cc-modal cxc-form" onSubmit={guardar}>
        <label>
          Nombre del cliente
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Pedro Pablo" autoComplete="off" autoFocus />
        </label>
        <label>
          Teléfono (para enviarle el saldo por WhatsApp)
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="ej. 314 349 8481" inputMode="tel" autoComplete="off" />
        </label>
        <label>
          Grupo
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {elegibles.map((g) => (
              <option key={g} value={g}>
                Cuentas por Cobrar {g}
              </option>
            ))}
            <option value={NUEVO}>+ Crear un grupo nuevo…</option>
          </select>
        </label>
        {grupo === NUEVO && (
          <label>
            Nombre del grupo nuevo
            <input value={grupoNuevo} onChange={(e) => setGrupoNuevo(e.target.value)} placeholder="ej. Proveedores" maxLength={60} autoComplete="off" />
          </label>
        )}

        <label className="cxc-con-movimiento">
          <input type="checkbox" checked={conMovimiento} onChange={(e) => setConMovimiento(e.target.checked)} />
          Anotarle un movimiento de una vez
        </label>
        {conMovimiento && (
          <div className="cxc-primer-mov">
            <label>
              Referencia (qué se le está cobrando)
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="ej. Préstamo, Venta de Zelle, Cerveza…" maxLength={120} autoComplete="off" />
            </label>
            <div className="cxc-form-fila">
              <label>
                {conTasa ? "Cantidad" : "Monto (o cantidad)"}
                <input value={cantidad} onChange={(e) => setCantidad(conPuntos(e.target.value))} inputMode="decimal" placeholder="0" autoComplete="off" />
              </label>
              <label>
                Tasa (opcional)
                <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" placeholder="ej. 3.050" autoComplete="off" />
              </label>
            </div>
            <small>
              {total
                ? conTasa
                  ? `${formatearMonto(nCantidad!)} × ${formatearMonto(nTasa!)} = ${dinero(total, "COP")} por cobrar`
                  : `${dinero(total, "COP")} por cobrar`
                : "Como en Cuentas Corrientes: el monto en pesos, o la cantidad (dólares, bolívares…) con su tasa."}
            </small>
          </div>
        )}

        <p className="cc-modal-nota">
          {conMovimiento ? "El cliente queda registrado con ese movimiento en su hoja." : "Queda registrado sin saldo. Los cargos y abonos se anotan en su hoja, con cantidad × tasa igual que en Cuentas Corrientes."}
        </p>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : conMovimiento ? "Registrar cliente y movimiento" : "Registrar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
