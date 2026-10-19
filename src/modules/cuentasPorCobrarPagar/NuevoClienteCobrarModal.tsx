import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { crearCuentaCorriente, registrarMovimientoCC, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import type { Moneda } from "../../api/monedas.api";
import { formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";
import { SIN_GRUPO, dinero } from "./cobrar";
import { AvisoClienteExistente, useClienteExistente } from "../cuentasCorrientes/ClienteExistente";
import type { ClienteExistente } from "../../api/cuentasCorrientes.api";

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
  modulo = "POR_COBRAR",
  onCreado,
  onCerrar,
}: {
  grupos: string[];
  grupoInicial: string;
  // por cobrar (me debe) o por pagar (le debo)
  modulo?: "POR_COBRAR" | "POR_PAGAR";
  monedas: Moneda[];
  onCreado: (cuenta: CuentaCorrienteResumen) => void;
  onCerrar: () => void;
}) {
  const pagar = modulo === "POR_PAGAR";
  const elegibles = grupos.filter((g) => g !== SIN_GRUPO);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // el cliente ya estaba en el sistema (en otro módulo): se usa ese, no se crea otro
  const [existente, setExistente] = useState<ClienteExistente | null>(null);
  const existentes = useClienteExistente(nombre, telefono, !existente);
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
    if (!existente && nombre.trim().length < 2) return setError("Escribí el nombre del cliente.");
    if (!grupoFinal) return setError("Escribí el nombre del grupo nuevo.");
    if (!cop) return setError("No se pudo cargar la moneda. Cerrá y volvé a abrir.");
    if (conMovimiento) {
      if (!total) return setError("Escribí el monto del movimiento (o quitá el movimiento para registrar solo el cliente).");
      if (tasa.trim() && !conTasa) return setError("La tasa no es un número válido.");
    }
    setEnviando(true);
    try {
      const datos = {
        ...(existente
          ? { terceroId: existente.id, usarExistente: true }
          : { nuevoTercero: { nombre: nombre.trim(), tipo: "CLIENTE" as const, telefono: telefono.trim() || undefined } }),
        modulo,
        grupoCobro: grupoFinal,
        monedaId: cop.id,
      };
      const cuenta = await crearCuentaCorriente(datos).catch((err) => {
        // ya hay un cliente con ese nombre (en otro módulo): ¿es el mismo?
        if (!(err instanceof ApiError && err.status === 409 && /^Ya existe/.test(err.message))) throw err;
        if (!window.confirm(`Ya hay un cliente llamado "${nombre.trim()}" en el sistema.\n\n¿Es la misma persona? Aceptar: se usa ese cliente y se le abre su cuenta aquí.\nCancelar: no se registra nada (si es otra persona, escribí el nombre distinto).`)) throw err;
        return crearCuentaCorriente({ ...datos, usarExistente: true });
      });
      if (conMovimiento && total) {
        try {
          // por pagar: lo que le debo va en negativo (como en una cuenta corriente)
          const signo = pagar ? "-" : "";
          await registrarMovimientoCC({
            cuentaId: cuenta.id,
            terceroId: cuenta.tercero_id,
            canalId: cuenta.canal_id,
            monedaId: cuenta.moneda_id,
            tipo: pagar ? "ABONO" : "CARGO",
            descripcion: referencia.trim() || (pagar ? "Saldo por pagar" : "Saldo por cobrar"),
            ...(conTasa ? { cantidadBase: `${signo}${nCantidad!}`, tasa: nTasa! } : { monto: `${signo}${nCantidad!}` }),
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
    <Modal titulo={pagar ? "Nuevo cliente por pagar" : "Nuevo cliente por cobrar"} onCerrar={onCerrar}>
      <form className="cc-modal cxc-form" onSubmit={guardar}>
        {existente ? (
          <p className="cc-elegido">
            <strong>{existente.nombre}</strong> · {existente.telefono ? `${existente.telefono} · ` : ""}ya está en el sistema: se le abre su cuenta aquí
            <button type="button" onClick={() => setExistente(null)}>
              Cambiar
            </button>
          </p>
        ) : (
          <>
            <label>
              Nombre del cliente
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Pedro Pablo" autoComplete="off" autoFocus />
            </label>
            <label>
              Teléfono (para enviarle el saldo por WhatsApp)
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="ej. 314 349 8481" inputMode="tel" autoComplete="off" />
            </label>
            <AvisoClienteExistente lista={existentes.lista} modulo={modulo} onDescartar={existentes.descartar} onUsar={setExistente} />
          </>
        )}
        <label>
          Grupo
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {elegibles.map((g) => (
              <option key={g} value={g}>
                {pagar ? "Cuentas por Pagar" : "Cuentas por Cobrar"} {g}
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
                  ? `${formatearMonto(nCantidad!)} × ${formatearMonto(nTasa!)} = ${dinero(total, "COP")} ${pagar ? "por pagar" : "por cobrar"}`
                  : `${dinero(total, "COP")} ${pagar ? "por pagar" : "por cobrar"}`
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
