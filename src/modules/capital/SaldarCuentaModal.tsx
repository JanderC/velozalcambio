import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getCajas, type Caja } from "../../api/cajas.api";
import { registrarMovimientoCC, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, leerNumero, sumarDecimales } from "../../utils/montos";

const METODOS = ["Efectivo", "Bancolombia", "Nequi", "Zelle", "Bolívares", "USDT", "Otro"];
const SIN_CAJA = "ninguna";
// las taquillas y la Caja Fuerte manejan efectivo en estas monedas; las cuentas de banco, la suya
const MONEDAS_EFECTIVO = ["COP", "USD", "EUR"];
const GRUPOS: { tipo: Caja["tipo"]; titulo: string }[] = [
  { tipo: "FISICA", titulo: "Taquillas y cajas" },
  { tipo: "FUERTE", titulo: "Caja Fuerte" },
  { tipo: "BANCO", titulo: "Cuentas de la empresa" },
];
const dinero = (monto: string, codigo: string) => {
  const n = formatearMonto(monto.replace(/^-/, ""));
  return codigo === "COP" ? `$${n}` : codigo === "VES" ? `Bs. ${n}` : `${n} ${codigo}`;
};
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,]/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return "";
  return formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}

/**
 * Cancelar (todo o una parte) lo de un cliente desde el capital. Si me debe, me paga: se anota el abono en su cuenta y
 * la plata entra a la taquilla, Caja Fuerte o cuenta que se elija. Si yo le debo, le pago: se anota en su cuenta y la
 * plata sale de donde se elija. También puede no tocar ninguna caja.
 */
export function SaldarCuentaModal({ cuenta, onHecho, onCerrar }: { cuenta: CuentaCorrienteResumen; onHecho: (mensaje: string) => void; onCerrar: () => void }) {
  const yoDebo = cuenta.saldo_actual.startsWith("-");
  const debe = cuenta.saldo_actual.replace(/^-/, "");
  const codigo = cuenta.moneda_codigo;
  // "1774000.0000" -> "1.774.000" · "531.2000" -> "531,2"
  const [monto, setMonto] = useState(conPuntos((debe.includes(".") ? debe.replace(/0+$/, "").replace(/\.$/, "") : debe).replace(".", ",")));
  const [metodo, setMetodo] = useState(METODOS[0]!);
  const [otro, setOtro] = useState("");
  const [referencia, setReferencia] = useState("");
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  const [destino, setDestino] = useState(""); // "" sin elegir · SIN_CAJA · id
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCajas()
      // las de efectivo solo si la cuenta es en pesos, dólares o euros; las de banco siempre (las nuevas tienen su moneda)
      .then((l) => setCajas(l.filter((c) => c.activo && (c.tipo === "BANCO" || MONEDAS_EFECTIVO.includes(codigo)))))
      .catch(() => setCajas([]));
  }, [codigo]);

  const nMonto = monto.trim() ? (leerNumero(monto)?.replace(/^-/, "") ?? null) : null;
  const queda = nMonto ? sumarDecimales(debe, `-${nMonto}`) : debe;
  const caja = cajas?.find((c) => String(c.id) === destino) ?? null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const metodoFinal = metodo === "Otro" ? otro.trim() : metodo;
    if (!nMonto || !/[1-9]/.test(nMonto)) return setError("Escribí el monto.");
    if (queda.startsWith("-")) return setError(`Es más de lo que ${yoDebo ? "le debo" : "debe"} (${dinero(debe, codigo)}).`);
    if (!metodoFinal) return setError("Escribí el método.");
    if (destino === "") return setError(`Elegí ${yoDebo ? "de dónde sale" : "a dónde entra"} el dinero (o "Ninguna caja").`);
    setEnviando(true);
    try {
      const total = !/[1-9]/.test(queda);
      const como = metodoFinal === "Efectivo" ? "en efectivo" : `por ${metodoFinal}`;
      await registrarMovimientoCC({
        cuentaId: cuenta.id,
        terceroId: cuenta.tercero_id,
        canalId: cuenta.canal_id,
        monedaId: cuenta.moneda_id,
        // si me debe, su pago le baja la deuda; si yo le debo, mi pago le baja lo que le debo
        tipo: yoDebo ? "CARGO" : "ABONO",
        monto: yoDebo ? nMonto : `-${nMonto}`,
        descripcion:
          `${yoDebo ? (total ? "Le pagué todo" : "Le pagué") : total ? "Pago total" : "Abono"} ${como}` +
          `${referencia.trim() ? ` · ${referencia.trim()}` : ""}` +
          `${caja ? ` (${yoDebo ? "sale de" : "entra a"} ${caja.nombre})` : ""} · desde Capital de giros`,
        ...(caja ? { cajaId: caja.id, montoCaja: yoDebo ? `-${nMonto}` : nMonto, monedaCajaId: cuenta.moneda_id } : {}),
      });
      onHecho(`${cuenta.tercero_nombre}: ${yoDebo ? "se le pagaron" : "pagó"} ${dinero(nMonto, codigo)}${caja ? ` (${yoDebo ? "salió de" : "entró a"} ${caja.nombre})` : ""}.${total ? " Quedó en cero." : ` Queda ${dinero(queda, codigo)}.`}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={yoDebo ? "Pagarle al cliente" : "El cliente paga"} onCerrar={onCerrar}>
      <form className="cc-modal cxc-form" onSubmit={guardar}>
        <p className={`cap-saldar-total ${yoDebo ? "debo" : ""}`}>
          <span>
            {cuenta.tercero_nombre} · {yoDebo ? "le debo" : "me debe"}
          </span>
          <strong>{dinero(debe, codigo)}</strong>
        </p>
        <label>
          Cuánto {yoDebo ? "le pago" : "paga"} ({codigo})
          <input value={monto} onChange={(e) => setMonto(conPuntos(e.target.value))} inputMode="decimal" autoComplete="off" autoFocus />
          <small>{nMonto && /[1-9]/.test(queda) && !queda.startsWith("-") ? `Queda ${dinero(queda, codigo)} pendiente.` : nMonto && !queda.startsWith("-") ? "Queda en cero." : " "}</small>
        </label>
        <div className="cxc-transf-metodo">
          <span>Método</span>
          <div className="cc-chips" role="radiogroup" aria-label="Método">
            {METODOS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={metodo === m} className={metodo === m ? "activo" : ""} onClick={() => setMetodo(m)}>
                {m}
              </button>
            ))}
          </div>
          {metodo === "Otro" && <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="¿Cuál?" maxLength={40} autoComplete="off" aria-label="Otro método" />}
        </div>
        <label>
          {yoDebo ? "¿De dónde sale el dinero?" : "¿A dónde entra el dinero?"}
          <select value={destino} onChange={(e) => setDestino(e.target.value)} disabled={cajas === null}>
            <option value="">{cajas === null ? "Cargando…" : "Elegir taquilla, Caja Fuerte o cuenta…"}</option>
            {GRUPOS.map((g) => {
              const delGrupo = (cajas ?? []).filter((c) => c.tipo === g.tipo);
              return delGrupo.length ? (
                <optgroup key={g.tipo} label={g.titulo}>
                  {delGrupo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
            <option value={SIN_CAJA}>Ninguna caja (solo anotarlo en su cuenta)</option>
          </select>
          <small>
            {caja
              ? `${caja.nombre} ${yoDebo ? "baja" : "sube"} por ese monto, en ${codigo}.`
              : destino === SIN_CAJA
                ? "Solo se anota en la cuenta del cliente: no se mueve ninguna caja."
                : " "}
          </small>
        </label>
        <label>
          Referencia (opcional)
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Comprobante, quién pagó…" maxLength={80} autoComplete="off" />
        </label>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Registrando…" : yoDebo ? "Registrar el pago al cliente" : "Registrar lo que pagó"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
