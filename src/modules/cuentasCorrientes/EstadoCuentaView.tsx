import { useEffect, useState, type FormEvent } from "react";
import type { CuentaCorrienteResumen, MovimientoCC } from "../../api/cuentasCorrientes.api";
import { getMovimientosCuentaCorriente, registrarMovimientoCC } from "../../api/cuentasCorrientes.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { ApiError } from "../../api/client";

const TIPOS = ["COMPRA", "VENTA", "ABONO", "CARGO", "AJUSTE"] as const;

export function EstadoCuentaView({ cuenta, onActualizar }: { cuenta: CuentaCorrienteResumen; onActualizar: () => void }) {
  const [movimientos, setMovimientos] = useState<MovimientoCC[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const data = await getMovimientosCuentaCorriente(cuenta.id);
      setMovimientos(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    setMostrarForm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta.id]);

  const saldo = Number(cuenta.saldo_actual);

  return (
    <div className="cc-detalle">
      <div className="cc-detalle-header">
        <div>
          <h2>{cuenta.tercero_nombre}</h2>
          <span>{cuenta.canal_nombre} · {cuenta.moneda_codigo}</span>
        </div>
        <span className={saldo >= 0 ? "cc-saldo-pos" : "cc-saldo-neg"}>
          {saldo.toLocaleString("es-CO")} {cuenta.moneda_codigo}
        </span>
      </div>

      {cargando ? (
        <p className="cc-detalle-vacio">Cargando movimientos…</p>
      ) : movimientos.length === 0 ? (
        <p className="cc-detalle-vacio">Todavía no hay movimientos en esta cuenta.</p>
      ) : (
        <table className="cc-movimientos-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.fecha).toLocaleDateString("es-CO")}</td>
                <td>{m.descripcion ?? "—"}</td>
                <td>{m.tipo}</td>
                <td>{Number(m.monto).toLocaleString("es-CO")}</td>
                <td>{Number(m.saldo_nuevo).toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button className="cc-nuevo-mov-btn" onClick={() => setMostrarForm((v) => !v)}>
        {mostrarForm ? "Cancelar" : "+ Registrar movimiento"}
      </button>

      {mostrarForm && (
        <NuevoMovimientoForm
          cuenta={cuenta}
          onGuardado={() => {
            setMostrarForm(false);
            cargar();
            onActualizar();
          }}
        />
      )}
    </div>
  );
}

function NuevoMovimientoForm({ cuenta, onGuardado }: { cuenta: CuentaCorrienteResumen; onGuardado: () => void }) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("ABONO");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [afectaCaja, setAfectaCaja] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<number | "">("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (afectaCaja) getCajas().then(setCajas).catch(() => setCajas([]));
  }, [afectaCaja]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!monto) {
      setError("Ingresá un monto (positivo suma al saldo, negativo lo reduce).");
      return;
    }
    if (afectaCaja && !cajaId) {
      setError("Seleccioná la caja/banco que también se mueve.");
      return;
    }
    setEnviando(true);
    try {
      await registrarMovimientoCC({
        terceroId: cuenta.tercero_id,
        canalId: cuenta.canal_id,
        monedaId: cuenta.moneda_id,
        tipo,
        monto,
        descripcion: descripcion || undefined,
        cajaId: afectaCaja ? Number(cajaId) : undefined,
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el movimiento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cc-form" onSubmit={handleSubmit}>
      <div className="cc-form-row">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Monto (+ suma, - resta)
          <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="ej. 50 o -160" />
        </label>
      </div>
      <label>
        Descripción
        <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Abono banco" />
      </label>

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={afectaCaja} onChange={(e) => setAfectaCaja(e.target.checked)} style={{ width: "auto" }} />
        Este movimiento también entra/sale de una caja o banco
      </label>

      {afectaCaja && (
        <label>
          Caja / Banco
          <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="cc-form-error">{error}</p>}

      <div className="cc-form-acciones">
        <button type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</button>
      </div>
    </form>
  );
}