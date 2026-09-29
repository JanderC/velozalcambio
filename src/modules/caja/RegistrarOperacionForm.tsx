import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { getCajas, type Caja } from "../../api/cajas.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { getMetodosPago, type MetodoPago } from "../../api/metodosPago.api";
import { getCotizacionesDetalle, type CotizacionDetalle } from "../../api/tasas.api";
import { registrarCambioDivisa, type ResultadoCambio } from "../../api/transacciones.api";
import { ApiError } from "../../api/client";
import { esDecimalValido, formatearMonto, normalizarDecimal } from "../../utils/montos";
import { nombreDivisa, ORDEN_OPERACIONES, textosOperacion, useCalculoCambio, type OperacionCambio } from "../../hooks/useCalculoCambio";
import { ErrorCambio } from "../../components/common/ErrorCambio";
import { Modal } from "../../components/common/Modal";
import { AvisoVerificacion } from "../documentosCliente/AvisoVerificacion";
import { SubirDocumentoForm } from "../documentosCliente/SubirDocumentoForm";
import { SoporteOperacion } from "../documentosCliente/SoporteOperacion";
import "./caja.css";

interface Registrado {
  resultado: ResultadoCambio;
  divisa: string;
  clienteTraePesos: boolean;
}

export function RegistrarOperacionForm({
  terceroId,
  onCompletado,
  versionDocumentos = 0,
  onDocumentoSubido,
}: {
  terceroId: number;
  onCompletado: () => void;
  // Sube cuando cambian los documentos del cliente en la misma ficha, para refrescar el aviso
  versionDocumentos?: number;
  onDocumentoSubido?: () => void;
}) {
  const [subiendoDocumento, setSubiendoDocumento] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionDetalle[]>([]);

  const [operacion, setOperacion] = useState<OperacionCambio>("COMPRA_DIVISA");
  const [monedaExtranjeraId, setMonedaExtranjeraId] = useState<number | "">("");
  const [monto, setMonto] = useState("");
  const [cotizacionId, setCotizacionId] = useState<number | "">("");
  const [tasaManual, setTasaManual] = useState("");
  const [cajaExtranjeraId, setCajaExtranjeraId] = useState<number | "">("");
  const [monedaLocalId, setMonedaLocalId] = useState<number | "">("");
  const [cajaLocalId, setCajaLocalId] = useState<number | "">("");
  const [metodoPagoId, setMetodoPagoId] = useState<number | "">("");
  const [referenciaCodigo, setReferenciaCodigo] = useState("");
  const [bancoOrigen, setBancoOrigen] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [registrado, setRegistrado] = useState<Registrado | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  useEffect(() => {
    getCajas().then(setCajas).catch(() => setCajas([]));
    getMonedas().then((m) => {
      setMonedas(m);
      const cop = m.find((x) => x.codigo === "COP");
      if (cop) setMonedaLocalId(cop.id);
      const ves = m.find((x) => x.codigo === "VES");
      if (ves) setMonedaExtranjeraId(ves.id);
    }).catch(() => setMonedas([]));
    getMetodosPago().then(setMetodos).catch(() => setMetodos([]));
    getCotizacionesDetalle().then(setCotizaciones).catch(() => setCotizaciones([]));
  }, []);

  const {
    divisa,
    tipo,
    montoEnPesos,
    clienteTraePesos,
    tipoCotizacion,
    tasasDisponibles,
    usaTasaManual,
    calculoInput,
    calculoVigente,
    calculando,
    errorCalculo,
  } = useCalculoCambio({ operacion, monedas, monedaExtranjeraId, monedaLocalId, monto, cotizaciones, cotizacionId, tasaManual });

  useEffect(() => {
    // Si la caja de pesos no se eligió todavía, sugerí la misma caja que la de la divisa
    if (cajaExtranjeraId && !cajaLocalId) setCajaLocalId(cajaExtranjeraId);
  }, [cajaExtranjeraId, cajaLocalId]);

  function elegirOperacion(op: OperacionCambio) {
    if (op === operacion) return;
    // Cambia qué monto se escribe y el tipo de tasa: lo anterior ya no aplica.
    setOperacion(op);
    setMonto("");
    setCotizacionId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorValidacion(null);
    setRegistrado(null);

    if (!cajaExtranjeraId || !cajaLocalId) {
      setErrorValidacion("Elegí la caja de la divisa y la de los pesos.");
      return;
    }
    if (!calculoInput || !calculoVigente) {
      setErrorValidacion("Completá el monto y la tasa, y esperá el cálculo antes de registrar.");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await registrarCambioDivisa({
        ...calculoInput,
        terceroId,
        cajaExtranjeraId,
        cajaLocalId,
        metodoPagoId: metodoPagoId || undefined,
        referenciaCodigo: referenciaCodigo.trim() || undefined,
        bancoOrigen: bancoOrigen.trim() || undefined,
      });
      setRegistrado({ resultado, divisa, clienteTraePesos });
      setMonto("");
      setReferenciaCodigo("");
      setBancoOrigen("");
      setCotizacionId("");
      setTasaManual("");
      onCompletado();
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setErrorValidacion("No se pudo registrar la operación.");
    } finally {
      setEnviando(false);
    }
  }

  const pesos = (v: string) => `$${formatearMonto(v)} COP`;
  const extranjera = (v: string, d: string) => `${formatearMonto(v)} ${d}`;

  return (
    <form className="operacion-form" onSubmit={handleSubmit}>
      <AvisoVerificacion
        terceroId={terceroId}
        recargar={versionDocumentos}
        onSubirDocumento={() => setSubiendoDocumento(true)}
      />
      {subiendoDocumento && (
        <Modal titulo="Subir documento del cliente" onCerrar={() => setSubiendoDocumento(false)}>
          <SubirDocumentoForm
            terceroId={terceroId}
            tipoInicial="CEDULA"
            onSubido={() => { setSubiendoDocumento(false); onDocumentoSubido?.(); }}
            onCancelar={() => setSubiendoDocumento(false)}
          />
        </Modal>
      )}

      <div className="operacion-billetes-chips">
        {monedas.filter((m) => m.codigo !== "COP").map((m) => (
          <button
            type="button"
            key={m.id}
            className={monedaExtranjeraId === m.id ? "activo" : ""}
            onClick={() => { setMonedaExtranjeraId(m.id); setCotizacionId(""); }}
          >
            {nombreDivisa(m.codigo)}
          </button>
        ))}
      </div>

      <div className="operacion-tipo-toggle caja-operaciones">
        {ORDEN_OPERACIONES.map((op) => {
          const t = textosOperacion(op, divisa);
          return (
            <button type="button" key={op} className={operacion === op ? "activo" : ""} onClick={() => elegirOperacion(op)}>
              <span>
                {t.esCompra ? <ArrowDownToLine size={16} className="icono-inline" /> : <ArrowUpFromLine size={16} className="icono-inline" />} {t.titulo}
              </span>
              <span className="caja-operacion-flujo">{t.flujo}</span>
            </button>
          );
        })}
      </div>

      <label>
        {textosOperacion(operacion, divisa).etiquetaMonto}
        <input
          type="text"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(normalizarDecimal(e.target.value))}
          placeholder={montoEnPesos ? "ej. 300000" : "ej. 1500.50"}
        />
        {esDecimalValido(monto) && (
          <span className="caja-monto-lectura">
            Se registra como: <strong>{montoEnPesos ? pesos(monto) : extranjera(monto, divisa)}</strong>
          </span>
        )}
        <span className="caja-monto-ayuda">
          Sin puntos de miles; la coma o el punto solo para decimales. {textosOperacion(operacion, divisa).ayudaMonto}
        </span>
      </label>

      {monedaExtranjeraId && (
        <div className="operacion-billetes">
          <span className="operacion-billetes-label">Nuestra tasa de {tipoCotizacion.toLowerCase()} hoy para {divisa}:</span>
          {usaTasaManual ? (
            <>
              <p className="operacion-billetes-vacio">No hay tasa de {tipoCotizacion.toLowerCase()} cargada hoy — ingresá una tasa manual.</p>
              <label className="operacion-tasa-manual">
                Tasa manual
                <input
                  type="text"
                  inputMode="decimal"
                  value={tasaManual}
                  onChange={(e) => setTasaManual(normalizarDecimal(e.target.value))}
                  placeholder="ej. 3.2"
                />
              </label>
            </>
          ) : (
            <div className="operacion-billetes-chips">
              {tasasDisponibles.map((b) => (
                <button type="button" key={b.id} className={cotizacionId === b.id ? "activo" : ""} onClick={() => setCotizacionId(b.id)}>
                  {b.etiqueta}
                  {b.categoria === "GIRO" ? " (giro)" : ""}: {b.valor != null ? formatearMonto(b.valor) : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {calculando && <p className="caja-calculo-estado">Calculando…</p>}
      {errorCalculo && !calculando && <p className="operacion-form-error">{errorCalculo}</p>}
      {calculoVigente && !calculando && (
        <div className="caja-calculo">
          <div className="caja-calculo-fila">
            <span>El cliente entrega</span>
            <strong>{clienteTraePesos ? pesos(calculoVigente.montoLocal) : extranjera(calculoVigente.cantidadExtranjera, divisa)}</strong>
          </div>
          <div className="caja-calculo-fila">
            <span>Tasa aplicada</span>
            <strong>{formatearMonto(calculoVigente.tasa)}</strong>
          </div>
          <div className="caja-calculo-fila caja-calculo-destacado">
            <span>Le entregamos</span>
            <strong>{clienteTraePesos ? extranjera(calculoVigente.cantidadExtranjera, divisa) : pesos(calculoVigente.montoLocal)}</strong>
          </div>
        </div>
      )}

      <div className="operacion-form-row">
        <label>
          Caja de {divisa}
          <select value={cajaExtranjeraId} onChange={(e) => setCajaExtranjeraId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Seleccionar…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          {tipo === "COMPRA_DIVISA" ? "Pagamos los pesos por" : "Cobramos los pesos por"}
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

      <label>
        Banco de origen (si aplica)
        <input type="text" value={bancoOrigen} onChange={(e) => setBancoOrigen(e.target.value)} placeholder="ej. Bancolombia" />
      </label>

      {error && <ErrorCambio error={error} />}
      {errorValidacion && <p className="operacion-form-error">{errorValidacion}</p>}

      {registrado && (
        <div className={`caja-registrado ${registrado.resultado.requiereConfirmacion ? "pendiente" : "completada"}`}>
          {registrado.resultado.requiereConfirmacion ? (
            <p>
              <strong>Pendiente de confirmación.</strong> Una de las cajas es un banco: la tiene que confirmar otro usuario en{" "}
              <Link to="/solicitudes">Solicitudes por Confirmar</Link>.
            </p>
          ) : (
            <p><strong>Operación completada.</strong></p>
          )}
          <p>
            Entregó {registrado.clienteTraePesos
              ? pesos(registrado.resultado.calculo.montoLocal)
              : extranjera(registrado.resultado.calculo.cantidadExtranjera, registrado.divisa)}
            {" · "}tasa {formatearMonto(registrado.resultado.calculo.tasa)}
            {" · "}recibió {registrado.clienteTraePesos
              ? extranjera(registrado.resultado.calculo.cantidadExtranjera, registrado.divisa)
              : pesos(registrado.resultado.calculo.montoLocal)}
          </p>
          <SoporteOperacion
            terceroId={terceroId}
            transaccionId={registrado.resultado.transaccion.id}
            onSubido={onDocumentoSubido}
          />
        </div>
      )}

      <button type="submit" disabled={enviando || !calculoVigente}>
        {enviando ? "Registrando…" : "Registrar"}
      </button>
    </form>
  );
}
