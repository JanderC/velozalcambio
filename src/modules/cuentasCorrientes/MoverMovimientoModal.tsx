import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getCuentasCorrientes, moverMovimientoCC, type CuentaCorrienteResumen, type FilaEstadoCuenta } from "../../api/cuentasCorrientes.api";
import { formatearMonto } from "../../utils/montos";

/**
 * Pasar un movimiento cargado en el cliente equivocado a la cuenta que era: se elige el otro cliente (del mismo
 * módulo y la misma moneda) y el movimiento sale de este saldo y entra en el del otro, tal cual.
 */
export function MoverMovimientoModal({
  movimiento,
  cuenta,
  onCerrar,
  onMovido,
}: {
  movimiento: FilaEstadoCuenta;
  cuenta: CuentaCorrienteResumen;
  onCerrar: () => void;
  onMovido: () => void;
}) {
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [elegida, setElegida] = useState<CuentaCorrienteResumen | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const vista = cuenta.modulo === "POR_COBRAR" ? "cobrar" : cuenta.modulo === "POR_PAGAR" ? "pagar" : cuenta.modulo === "CAJA" ? "cajas" : "corrientes";
    getCuentasCorrientes({ vista })
      .then((lista) => setCuentas(lista.filter((c) => c.id !== cuenta.id && c.modulo === cuenta.modulo && c.moneda_id === cuenta.moneda_id)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar las cuentas."));
  }, [cuenta.id, cuenta.modulo, cuenta.moneda_id]);

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const lista = cuentas ?? [];
    if (!texto) return lista.slice(0, 60);
    const digitos = texto.replace(/\D/g, "");
    return lista
      .filter((c) => c.tercero_nombre.toLowerCase().includes(texto) || (digitos.length >= 3 && (c.tercero_telefono ?? "").replace(/\D/g, "").includes(digitos)))
      .slice(0, 60);
  }, [cuentas, buscar]);

  async function mover() {
    if (!elegida) return;
    setEnviando(true);
    setError(null);
    try {
      await moverMovimientoCC(movimiento.id, elegida.id);
      onMovido();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo mover el movimiento.");
      setEnviando(false);
    }
  }

  const monto = `${movimiento.monto.startsWith("-") ? "- " : ""}${formatearMonto(movimiento.monto.replace("-", ""))} ${cuenta.moneda_codigo}`;
  return (
    <Modal titulo="Mover a otro cliente" onCerrar={onCerrar}>
      <div className="cc-modal cc-mover-mov">
        <p className="cc-modal-nota">
          <strong>{movimiento.descripcion ?? movimiento.tipo}</strong> · {monto}
          <br />
          Sale de <strong>{cuenta.tercero_nombre}</strong> y pasa al cliente que elijas, con la misma fecha y referencia. Los dos saldos se corrigen.
        </p>
        <label>
          Buscar el cliente
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o teléfono" autoFocus autoComplete="off" />
        </label>
        <ul className="cc-mover-lista">
          {cuentas === null && !error && <li className="cc-mover-vacio">Cargando…</li>}
          {cuentas !== null && visibles.length === 0 && <li className="cc-mover-vacio">No hay otro cliente con ese nombre en {cuenta.moneda_codigo}.</li>}
          {visibles.map((c) => (
            <li key={c.id}>
              <button type="button" className={elegida?.id === c.id ? "activo" : ""} onClick={() => setElegida(c)} aria-pressed={elegida?.id === c.id}>
                <span>{c.tercero_nombre}</span>
                <small>
                  {c.tercero_telefono ? `${c.tercero_telefono} · ` : ""}saldo {formatearMonto(c.saldo_actual)}
                </small>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="cc-guardar" disabled={!elegida || enviando} onClick={() => void mover()}>
            {enviando ? "Moviendo…" : elegida ? `Mover a ${elegida.tercero_nombre}` : "Elegí el cliente"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
