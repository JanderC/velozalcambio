import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { enviarAConfirmaciones, getCanales, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { dividirDecimales, factorDeComision, formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";
import { conPuntos } from "../cuentasPorCobrarPagar/NuevoClienteCobrarModal";
import { dineroEn } from "./RepartoMonedas";

// Los medios de Confirmaciones, en el orden de allá
const MEDIOS = ["BOLIVARES", "BANCOLOMBIA", "NEQUI", "USDT", "WESTERN_UNION", "ZELLE"];
const ETIQUETA: Record<string, string> = { BOLIVARES: "Bolívares", BANCOLOMBIA: "Bancolombia", NEQUI: "Nequi", USDT: "USDT", WESTERN_UNION: "Western Union", ZELLE: "Zelle" };
const ENTREGAS = ["COP", "USD", "VES", "USDT", "EUR"];
type Formula = "COMISION" | "TASA" | "DIVIDIR" | "DIRECTO";

/**
 * Pasar a Confirmaciones lo que se le debe a un cliente de Cuentas Corrientes (ej. 5.000 USD en transferencias): se
 * le cobra una comisión o se convierte con una tasa, y queda como confirmación por pagarle en taquilla (o por otro
 * método). En Cuentas Corrientes se anota lo enviado: ahí deja de debérsele eso.
 */
export function EnviarAConfirmacionesModal({
  cuenta,
  montoInicial,
  onEnviado,
  onCerrar,
}: {
  cuenta: CuentaCorrienteResumen;
  montoInicial: string;
  onEnviado: () => void;
  onCerrar: () => void;
}) {
  // desde Cuentas por Pagar se dice "Enviar a taquilla": va a Confirmaciones y de ahí sale en todas las taquillas
  const desdePagar = cuenta.modulo === "POR_PAGAR" || cuenta.modulo === "POR_COBRAR";
  const [monto, setMonto] = useState(montoInicial ? conPuntos(montoInicial.replace(/^-/, "").replace(".", ",")) : "");
  const [formula, setFormula] = useState<Formula>("COMISION");
  const [valor, setValor] = useState("");
  const [incluida, setIncluida] = useState(false); // lo enviado ya trae el % sumado (2.650 al 6% = 2.500)
  const [entrega, setEntrega] = useState(cuenta.moneda_codigo);
  const [canalId, setCanalId] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [canales, setCanales] = useState<Canal[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ resultado: string; moneda: string } | null>(null);

  useEffect(() => {
    getCanales()
      .then((l) => setCanales(MEDIOS.map((n) => l.find((c) => c.nombre === n)).filter((c): c is Canal => !!c)))
      .catch(() => setCanales([]));
    getMonedas()
      .then(setMonedas)
      .catch(() => setMonedas([]));
  }, []);

  // con comisión o sin descuento se entrega en la misma moneda
  const mismaMoneda = formula === "COMISION" || formula === "DIRECTO";
  const codigoEntrega = mismaMoneda ? cuenta.moneda_codigo : entrega;
  const nMonto = monto.trim() ? (leerNumero(monto)?.replace(/^-/, "") ?? null) : null;
  const nValor = valor.trim() ? (leerNumero(valor.replace(/%/g, ""))?.replace(/^-/, "") ?? null) : null;
  const decimales = codigoEntrega === "COP" ? 0 : 2;
  const resultado =
    !nMonto || !/[1-9]/.test(nMonto)
      ? null
      : formula === "DIRECTO"
        ? nMonto
        : !nValor || !/[1-9]/.test(nValor)
          ? null
          : formula === "COMISION"
            ? multiplicarDecimales(nMonto, factorDeComision(nValor, incluida), decimales)
            : formula === "TASA"
              ? multiplicarDecimales(nMonto, nValor, decimales)
              : dividirDecimales(nMonto, nValor, decimales);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nMonto || !/[1-9]/.test(nMonto)) return setError("Escribí cuánto se pasa a Confirmaciones.");
    if (formula !== "DIRECTO" && !nValor) return setError(formula === "COMISION" ? "Escribí el % de comisión." : "Escribí la tasa.");
    if (formula === "COMISION" && Number(nValor) >= 100) return setError("La comisión tiene que ser menor al 100%.");
    if (!canalId) return setError("Elegí el medio de la confirmación (por dónde llegó).");
    const moneda = monedas.find((m) => m.codigo === codigoEntrega);
    if (!moneda) return setError(`No encuentro la moneda ${codigoEntrega}.`);
    if (!resultado || !/[1-9]/.test(resultado)) return setError("Lo que se le entrega da cero: revisá el monto y la tasa.");
    setEnviando(true);
    try {
      const r = await enviarAConfirmaciones(cuenta.id, {
        monto: nMonto,
        formula,
        ...(formula !== "DIRECTO" ? { valor: nValor! } : {}),
        ...(formula === "COMISION" && incluida ? { incluida: true } : {}),
        monedaEntregaId: moneda.id,
        canalId,
        descripcion: descripcion.trim() || undefined,
      });
      setHecho({ resultado: r.resultado, moneda: r.moneda });
      onEnviado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar a Confirmaciones.");
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <Modal titulo={desdePagar ? "Enviado a taquilla" : "Enviado a Confirmaciones"} onCerrar={onCerrar}>
        <div className="cc-modal">
          <p className="cc-enviar-hecho">
            <CheckCircle2 size={18} /> {cuenta.tercero_nombre} quedó en Confirmaciones con <b>{dineroEn(hecho.resultado, hecho.moneda)}</b> por pagarle. Ya sale en taquilla para pagárselo (o se le paga por otro método desde Confirmaciones).
          </p>
          <div className="cc-form-acciones">
            <button type="button" className="cc-guardar" onClick={onCerrar}>
              Listo
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={desdePagar ? "Enviar a taquilla" : "Enviar a Confirmaciones"} onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={enviar}>
        <label>
          Cuánto se pasa ({cuenta.moneda_codigo})
          <input value={monto} onChange={(e) => setMonto(conPuntos(e.target.value))} inputMode="decimal" placeholder="ej. 5.000" autoComplete="off" autoFocus />
        </label>
        <div className="cxc-transf-metodo">
          <span>Se le cobra</span>
          <div className="cc-chips" role="radiogroup" aria-label="Comisión o tasa">
            {(
              [
                ["COMISION", "% Comisión"],
                ["TASA", "× Tasa"],
                ["DIVIDIR", "÷ Dividir"],
                ["DIRECTO", "Sin descuento"],
              ] as [Formula, string][]
            ).map(([f, t]) => (
              <button type="button" key={f} role="radio" aria-checked={formula === f} className={formula === f ? "activo" : ""} onClick={() => setFormula(f)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="cc-modal-fila">
          {formula !== "DIRECTO" && (
            <label>
              {formula === "COMISION" ? "Comisión (%)" : "Tasa"}
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={formula === "COMISION" ? "ej. 3" : "ej. 3.900"} autoComplete="off" />
            </label>
          )}
          <label>
            Se le entrega en
            <select value={codigoEntrega} onChange={(e) => setEntrega(e.target.value)} disabled={mismaMoneda} title={mismaMoneda ? "Con comisión o sin descuento se entrega en la misma moneda" : undefined}>
              {ENTREGAS.filter((c) => monedas.some((m) => m.codigo === c) || c === cuenta.moneda_codigo).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {formula === "COMISION" && nValor && /[1-9]/.test(nValor) && (
          <label className="cc-check">
            <input type="checkbox" checked={incluida} onChange={(e) => setIncluida(e.target.checked)} />
            Lo enviado ya trae el {formatearMonto(nValor)}% sumado
          </label>
        )}
        <div className="cxc-transf-metodo">
          <span>Medio de la confirmación</span>
          <div className="cc-chips" role="radiogroup" aria-label="Medio">
            {canales.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={canalId === c.id} className={canalId === c.id ? "activo" : ""} onClick={() => setCanalId(c.id)}>
                {ETIQUETA[c.nombre] ?? c.nombre}
              </button>
            ))}
          </div>
        </div>
        <label>
          Referencia (opcional)
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Desde Cuentas Corrientes" maxLength={200} autoComplete="off" />
        </label>
        <p className="cxc-pago-total">
          <span>Le queda por pagar en Confirmaciones</span>
          <strong>{resultado && /[1-9]/.test(resultado) ? dineroEn(resultado, codigoEntrega) : "—"}</strong>
        </p>
        <p className="cc-modal-nota">
          {nMonto ? `En ${cuenta.modulo === "POR_PAGAR" ? "Cuentas por Pagar" : cuenta.modulo === "POR_COBRAR" ? "Cuentas por Cobrar y Pagar" : "Cuentas Corrientes"} se anotan los ${formatearMonto(nMonto)} ${cuenta.moneda_codigo} enviados: ahí deja de debérsele eso. ` : ""}En Confirmaciones queda como una confirmación ya verificada, lista para pagarle en taquilla o por otro método.
        </p>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Enviando…" : desdePagar ? "Enviar a taquilla" : "Enviar a Confirmaciones"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
