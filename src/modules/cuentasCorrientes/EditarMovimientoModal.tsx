import { useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { editarMovimientoCC, type FilaEstadoCuenta } from "../../api/cuentasCorrientes.api";
import { formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";

const diaBogota = (fecha: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(fecha));
const sinSigno = (v: string) => v.replace(/^-/, "");

/**
 * Corregir un movimiento mal cargado (solo administradores): la fecha, la referencia, la cuenta a la que se pagó, si
 * suma o abona, la cantidad, la tasa y el monto. Al guardar se corrige el saldo de la cuenta; no queda un movimiento
 * contrario como al anular, pero sí queda marcado como editado y por quién.
 */
export function EditarMovimientoModal({
  movimiento: m,
  monedaCodigo,
  decimales,
  onGuardado,
  onCerrar,
}: {
  movimiento: FilaEstadoCuenta;
  monedaCodigo: string;
  decimales: number;
  onGuardado: () => void;
  onCerrar: () => void;
}) {
  const diaOriginal = diaBogota(m.fecha);
  const [fecha, setFecha] = useState(diaOriginal);
  const [descripcion, setDescripcion] = useState(m.descripcion ?? "");
  const [cuentaDestino, setCuentaDestino] = useState(m.cuenta_destino ?? "");
  const [resta, setResta] = useState(m.monto.startsWith("-"));
  const [cantidad, setCantidad] = useState(m.cantidad_base ? formatearMonto(sinSigno(m.cantidad_base)) : "");
  // la tasa solo se edita cuando es una tasa de multiplicar; una comisión se guarda de otra forma y no se toca acá
  const conTasaSimple = !m.tasa_es_porcentaje;
  const [tasa, setTasa] = useState(conTasaSimple && m.tasa ? formatearMonto(m.tasa) : "");
  const [montoDirecto, setMontoDirecto] = useState(formatearMonto(sinSigno(m.monto)));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La plata ya se movió (una caja, o se pagó en taquilla): el monto no se corrige acá
  const montoFijo = !!m.movimiento_caja_id || !!m.pagado_en;
  const nCantidad = cantidad.trim() ? (leerNumero(cantidad)?.replace(/^-/, "") ?? null) : null;
  const nTasa = tasa.trim() ? (leerNumero(tasa)?.replace(/^-/, "") ?? null) : null;
  const calcula = conTasaSimple && !!nCantidad && !!nTasa && /[1-9]/.test(nTasa);
  const monto = calcula ? multiplicarDecimales(nCantidad!, nTasa!, decimales) : (leerNumero(montoDirecto)?.replace(/^-/, "") ?? null);
  const simbolo = monedaCodigo === "COP" ? "$" : "";

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!descripcion.trim()) return setError("Escribí la referencia del movimiento.");
    if (cantidad.trim() && !nCantidad) return setError("La cantidad no es un número válido.");
    if (conTasaSimple && tasa.trim() && (!nTasa || !/[1-9]/.test(nTasa))) return setError("La tasa no es un número válido.");
    if (!monto || !/[1-9]/.test(monto)) return setError("El monto no puede quedar en cero. Si el movimiento no va, anulalo.");
    setEnviando(true);
    try {
      await editarMovimientoCC(m.id, {
        descripcion: descripcion.trim(),
        cuentaDestino: cuentaDestino.trim() || null,
        // el día solo se manda si se cambió (al mediodía de ese día); si no, queda con su hora
        ...(fecha !== diaOriginal ? { fecha: `${fecha}T12:00:00-05:00` } : {}),
        ...(montoFijo
          ? {}
          : {
              cantidadBase: nCantidad,
              ...(conTasaSimple ? { tasa: nTasa && /[1-9]/.test(nTasa) ? nTasa : null } : {}),
              monto: `${resta ? "-" : ""}${monto}`,
            }),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Editar movimiento" onCerrar={onCerrar}>
      <form className="cc-modal cc-editar-mov" onSubmit={guardar}>
        <div className="cc-editar-mov-fila">
          <label>
            Fecha
            <input type="date" value={fecha} max={diaBogota(new Date().toISOString())} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          </label>
          <div className="cc-c-signo" role="group" aria-label="Suma o abono">
            <button type="button" className={!resta ? "activo suma" : ""} onClick={() => setResta(false)} aria-pressed={!resta} disabled={montoFijo}>
              + Suma
            </button>
            <button type="button" className={resta ? "activo resta" : ""} onClick={() => setResta(true)} aria-pressed={resta} disabled={montoFijo}>
              − Abono
            </button>
          </div>
        </div>
        <label>
          Referencia
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} autoComplete="off" autoFocus />
        </label>
        <label>
          Cuenta a la que se pagó (opcional)
          <input value={cuentaDestino} onChange={(e) => setCuentaDestino(e.target.value)} maxLength={120} autoComplete="off" />
        </label>
        {montoFijo ? (
          <p className="cc-modal-nota">
            {m.pagado_en ? "Este movimiento ya se pagó en taquilla" : "Este movimiento también movió una caja"}: el monto ({simbolo}
            {formatearMonto(sinSigno(m.monto))}) no se corrige acá. Si está mal, anulalo y cargalo de nuevo. La fecha y la referencia sí se pueden cambiar.
          </p>
        ) : (
          <>
            <div className="cc-editar-mov-fila tres">
              <label>
                Cantidad
                <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="sin cantidad" autoComplete="off" />
              </label>
              {conTasaSimple && (
                <label>
                  Tasa
                  <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" placeholder="sin tasa" autoComplete="off" />
                </label>
              )}
              <label>
                Monto ({monedaCodigo})
                {calcula ? (
                  <output className={`cc-resultado ${resta ? "cc-neg" : ""}`}>
                    {resta ? "- " : ""}
                    {simbolo}
                    {monto ? formatearMonto(monto) : "—"}
                  </output>
                ) : (
                  <input value={montoDirecto} onChange={(e) => setMontoDirecto(e.target.value)} inputMode="decimal" autoComplete="off" />
                )}
              </label>
            </div>
            <small>
              {!conTasaSimple
                ? "Este movimiento se cargó con comisión: se corrigen la cantidad y el monto a mano (el % no se recalcula)."
                : calcula
                  ? `${formatearMonto(nCantidad!)} × ${formatearMonto(nTasa!)} = ${simbolo}${monto ? formatearMonto(monto) : ""}. Para escribir el monto a mano, dejá la tasa vacía.`
                  : "Con cantidad y tasa, el monto se calcula solo; sin tasa, se escribe el monto."}
            </small>
          </>
        )}
        <p className="cc-modal-nota">El saldo de la cuenta se corrige con el cambio. El movimiento queda marcado como editado.</p>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
