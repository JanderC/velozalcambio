import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { getMetodosPago, type MetodoPago } from "../../api/metodosPago.api";
import { getCotizacionesDetalle, type CotizacionDetalle } from "../../api/tasas.api";
import { registrarCambioDivisa } from "../../api/transacciones.api";
import { ApiError } from "../../api/client";

export function RegistrarOperacionForm({ terceroId, onCompletado }: { terceroId: number; onCompletado: () => void }) {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionDetalle[]>([]);

  const [tipo, setTipo] = useState<"COMPRA_DIVISA" | "VENTA_DIVISA">("COMPRA_DIVISA");
  const [monedaExtranjeraId, setMonedaExtranjeraId] = useState<number | "">("");
  const [cotizacionSeleccionadaId, setCotizacionSeleccionadaId] = useState<number | "">("");
  const [tasaManual, setTasaManual] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [cajaExtranjeraId, setCajaExtranjeraId] = useState<number | "">("");
  const [monedaLocalId, setMonedaLocalId] = useState<number | "">("");
  const [cajaLocalId, setCajaLocalId] = useState<number | "">("");
  const [metodoPagoId, setMetodoPagoId] = useState<number | "">("");
  const [referenciaCodigo, setReferenciaCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCajas().then(setCajas).catch(() => setCajas([]));
    getMonedas().then((m) => {
      setMonedas(m);
      const cop = m.find((x) => x.codigo === "COP");
      if (cop) setMonedaLocalId(cop.id);
    }).catch(() => setMonedas([]));
    getMetodosPago().then(setMetodos).catch(() => setMetodos([]));
    getCotizacionesDetalle().then(setCotizaciones).catch(() => setCotizaciones([]));
  }, []);

  // El tipo de cotización que corresponde según la dirección de la operación:
  // le compramos al cliente -> usamos NUESTRA tasa de COMPRA; le vendemos -> tasa de VENTA.
  const tipoCotizacion = tipo === "COMPRA_DIVISA" ? "COMPRA" : "VENTA";

  const billetesDisponibles = useMemo(() => {
    const monedaCodigo = monedas.find((m) => m.id === monedaExtranjeraId)?.codigo;
    if (!monedaCodigo) return [];
    return cotizaciones.filter(
      (c) => c.moneda_codigo === monedaCodigo && c.tipo === tipoCotizacion && c.categoria === "EFECTIVO" && c.valor != null
    );
  }, [cotizaciones, monedas, monedaExtranjeraId, tipoCotizacion]);

  const tasaAplicada = useMemo(() => {
    if (cotizacionSeleccionadaId) {
      const c = billetesDisponibles.find((b) => b.id === cotizacionSeleccionadaId);
      return c?.valor ? Number(c.valor) : null;
    }
    return tasaManual ? Number(tasaManual) : null;
  }, [cotizacionSeleccionadaId, tasaManual, billetesDisponibles]);

  const montoLocalEstimado = tasaAplicada && cantidad ? Number(cantidad) * tasaAplicada : null;

  useEffect(() => {
    // Si la caja de pesos no se eligió todavía, sugerí la misma caja que la de la divisa
    if (cajaExtranjeraId && !cajaLocalId) setCajaLocalId(cajaExtranjeraId);
  }, [cajaExtranjeraId, cajaLocalId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);

    if (!monedaExtranjeraId || !cantidad || !cajaExtranjeraId || !monedaLocalId || !cajaLocalId) {
      setError("Completá moneda, cantidad, y las cajas de origen y destino.");
      return;
    }
    if (!cotizacionSeleccionadaId && !tasaManual) {
      setError("Elegí un billete de la Tasa del Día, o ingresá una tasa manual.");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await registrarCambioDivisa({
        tipo,
        terceroId,
        monedaExtranjeraId: Number(monedaExtranjeraId),
        cantidadExtranjera: cantidad,
        cotizacionDetalleId: cotizacionSeleccionadaId || undefined,
        tasaManual: !cotizacionSeleccionadaId ? tasaManual : undefined,
        cajaExtranjeraId: Number(cajaExtranjeraId),
        monedaLocalId: Number(monedaLocalId),
        cajaLocalId: Number(cajaLocalId),
        metodoPagoId: metodoPagoId || undefined,
        referenciaCodigo: referenciaCodigo || undefined,
      });

      setMensaje(
        resultado.requiereConfirmacion
          ? `Solicitud registrada por $${Number(resultado.montoLocal).toLocaleString("es-CO")} COP — queda pendiente de confirmación (pago por banco).`
          : `Operación confirmada: $${Number(resultado.montoLocal).toLocaleString("es-CO")} COP.`
      );
      setCantidad("");
      setReferenciaCodigo("");
      setCotizacionSeleccionadaId("");
      setTasaManual("");
      onCompletado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la operación.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="operacion-form" onSubmit={handleSubmit}>
      <div className="operacion-tipo-toggle">
        <button type="button" className={tipo === "COMPRA_DIVISA" ? "activo" : ""} onClick={() => { setTipo("COMPRA_DIVISA"); setCotizacionSeleccionadaId(""); }}>
          <ArrowDownToLine size={16} className="icono-inline" /> Le compramos al cliente
        </button>
        <button type="button" className={tipo === "VENTA_DIVISA" ? "activo" : ""} onClick={() => { setTipo("VENTA_DIVISA"); setCotizacionSeleccionadaId(""); }}>
          <ArrowUpFromLine size={16} className="icono-inline" /> Le vendemos al cliente
        </button>
      </div>

      <div className="operacion-form-row">
        <label>
          Divisa
          <select value={monedaExtranjeraId} onChange={(e) => { setMonedaExtranjeraId(e.target.value ? Number(e.target.value) : ""); setCotizacionSeleccionadaId(""); }}>
            <option value="">Seleccionar…</option>
            {monedas.filter((m) => m.codigo !== "COP").map((m) => (
              <option key={m.id} value={m.id}>{m.codigo}</option>
            ))}
          </select>
        </label>
        <label>
          Cantidad
          <input type="text" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0.00" />
        </label>
      </div>

      {monedaExtranjeraId && (
        <div className="operacion-billetes">
          <span className="operacion-billetes-label">Nuestra tasa de {tipoCotizacion.toLowerCase()} hoy:</span>
          {billetesDisponibles.length === 0 ? (
            <p className="operacion-billetes-vacio">No hay cotización cargada para esta divisa — ingresá una tasa manual abajo.</p>
          ) : (
            <div className="operacion-billetes-chips">
              {billetesDisponibles.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  className={cotizacionSeleccionadaId === b.id ? "activo" : ""}
                  onClick={() => { setCotizacionSeleccionadaId(b.id); setTasaManual(""); }}
                >
                  {b.etiqueta}: ${Number(b.valor).toLocaleString("es-CO")}
                </button>
              ))}
            </div>
          )}
          <label className="operacion-tasa-manual">
            O tasa manual
            <input type="text" inputMode="decimal" value={tasaManual} onChange={(e) => { setTasaManual(e.target.value); setCotizacionSeleccionadaId(""); }} placeholder="ej. 3270" />
          </label>
        </div>
      )}

      {montoLocalEstimado != null && (
        <div className="operacion-total-estimado">
          Total en pesos: <strong>${montoLocalEstimado.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP</strong>
        </div>
      )}

      <div className="operacion-form-row">
        <label>
          Caja de la divisa
          <select value={cajaExtranjeraId} onChange={(e) => setCajaExtranjeraId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          {tipo === "COMPRA_DIVISA" ? "Pagamos por" : "Cobramos por"}
          <select value={cajaLocalId} onChange={(e) => setCajaLocalId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="operacion-form-row">
        <label>
          Método de pago
          <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Referencia (si aplica)
          <input type="text" value={referenciaCodigo} onChange={(e) => setReferenciaCodigo(e.target.value)} />
        </label>
      </div>

      {error && <p className="operacion-form-error">{error}</p>}
      {mensaje && <p className="operacion-form-exito">{mensaje}</p>}

      <button type="submit" disabled={enviando}>
        {enviando ? "Registrando…" : "Registrar operación"}
      </button>
    </form>
  );
}