import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { crearCuentaCorriente, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import type { Moneda } from "../../api/monedas.api";
import { formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";
import { SIN_GRUPO, dinero } from "./cobrar";

const NUEVO = "__nuevo__";

/** Lo que se va escribiendo en un monto, con los puntos de miles puestos solos: "1500" -> "1.500". Decimales con coma. */
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,]/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return "";
  return formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}

/** Registrar un cliente de Cuentas por Cobrar: nombre, teléfono, grupo, moneda y cuánto debe. */
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
  const [monedaId, setMonedaId] = useState<number | "">(cop?.id ?? monedas[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [tasa, setTasa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moneda = monedas.find((m) => m.id === monedaId);
  const esOtraMoneda = !!moneda && moneda.codigo !== "COP";
  const nMonto = monto.trim() ? (leerNumero(monto)?.replace(/^-/, "") ?? null) : null;
  const nTasa = tasa.trim() ? (leerNumero(tasa)?.replace(/^-/, "") ?? null) : null;
  const tasaValida = !!nTasa && /[1-9]/.test(nTasa);
  const equivalente = esOtraMoneda && nMonto && tasaValida ? multiplicarDecimales(nMonto, nTasa!, 0) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const grupoFinal = grupo === NUEVO ? grupoNuevo.trim() : grupo;
    if (nombre.trim().length < 2) return setError("Escribí el nombre del cliente.");
    if (!grupoFinal) return setError("Escribí el nombre del grupo nuevo.");
    if (monedaId === "") return setError("Elegí la moneda.");
    if (monto.trim() && !nMonto) return setError("El monto no es un número válido.");
    if (esOtraMoneda && tasa.trim() && !tasaValida) return setError("La tasa a pesos no es un número válido.");
    setEnviando(true);
    try {
      onCreado(
        await crearCuentaCorriente({
          nuevoTercero: { nombre: nombre.trim(), tipo: "CLIENTE", telefono: telefono.trim() || undefined },
          modulo: "POR_COBRAR",
          grupoCobro: grupoFinal,
          monedaId,
          saldoInicial: nMonto && /[1-9]/.test(nMonto) ? nMonto : undefined,
          // en otra moneda, la tasa a pesos con la que se muestra el "Monto COP"
          ...(esOtraMoneda && tasaValida && cop ? { monedaCobroId: cop.id, tasaCobro: nTasa! } : {}),
        })
      );
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
        <div className="cxc-form-fila">
          <label>
            Moneda
            <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
              {monedas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.codigo})
                </option>
              ))}
            </select>
          </label>
          <label>
            Monto por cobrar
            <input value={monto} onChange={(e) => setMonto(conPuntos(e.target.value))} inputMode="decimal" placeholder="0" autoComplete="off" />
          </label>
        </div>
        {esOtraMoneda && (
          <label>
            Tasa a pesos (1 {moneda!.codigo} = cuántos pesos)
            <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" placeholder="ej. 2.950" autoComplete="off" />
            <small>
              {equivalente
                ? `${dinero(nMonto!, moneda!.codigo)} × ${formatearMonto(nTasa!)} = ${dinero(equivalente, "COP")} COP`
                : "Con la tasa, el cliente entra en el total en pesos. Se puede dejar vacía y ponerla después."}
            </small>
          </label>
        )}
        <p className="cc-modal-nota">Queda con ese saldo por cobrar. Los abonos y los cargos nuevos se anotan después en su hoja.</p>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : "Registrar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
