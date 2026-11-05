import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { capitalApi, type BancoDelSistema, type DatoBanco } from "../../api/capital.api";

// Los bancos de Venezuela por su código (el que sale en la cuenta y en el pago móvil)
export const BANCOS_VE: [string, string][] = [
  ["0102", "Banco de Venezuela"],
  ["0134", "Banesco"],
  ["0105", "Mercantil"],
  ["0108", "Provincial"],
  ["0191", "BNC"],
  ["0172", "Bancamiga"],
  ["0114", "Bancaribe"],
  ["0175", "Banco Digital de los Trabajadores"],
  ["0163", "Banco del Tesoro"],
  ["0151", "BFC"],
  ["0174", "Banplus"],
  ["0115", "Exterior"],
  ["0104", "Venezolano de Crédito"],
  ["0138", "Plaza"],
  ["0128", "Caroní"],
  ["0137", "Sofitasa"],
  ["0169", "R4 Mi Banco"],
  ["0171", "Activo"],
  ["0177", "Banfanb"],
  ["0156", "100% Banco"],
  ["0168", "Bancrecer"],
];
const nombreBanco = (codigo: string | null) => (codigo ? `${codigo}${BANCOS_VE.find(([c]) => c === codigo) ? ` ${BANCOS_VE.find(([c]) => c === codigo)![1]}` : ""}` : "");
const telefonoBonito = (t: string | null) => (t && t.length === 10 ? `0${t.slice(0, 3)}-${t.slice(3)}` : (t ?? ""));

/** Cómo se ve un dato guardado: "Cuenta 0102 ···· 8515" o "Pago móvil 0102 · V-10192931 · 0414-7320762". */
export function textoDato(d: Pick<DatoBanco, "tipo" | "banco" | "numero" | "cedula" | "telefono">) {
  if (d.tipo === "CUENTA") {
    const n = d.numero ?? "";
    return `Cuenta ${d.banco ? `${d.banco} ` : ""}${n.length > 4 ? "···· " : ""}${n.slice(-4)}`;
  }
  return ["Pago móvil", d.banco, d.cedula ? `C.I. ${d.cedula}` : null, telefonoBonito(d.telefono)].filter(Boolean).join(" · ");
}

/**
 * Con qué se reconoce una cuenta de la empresa en un capture: su número (completo o los últimos dígitos) o su pago
 * móvil (cédula, banco y teléfono). En Confirmaciones, si el capture dice que llegó a una de estas (o salió de una),
 * esa cuenta se alimenta sola con el movimiento.
 */
export function DatosBancoModal({ banco, onCambio, onCerrar }: { banco: BancoDelSistema; onCambio: () => void; onCerrar: () => void }) {
  const esBolivares = banco.moneda === "VES";
  const [datos, setDatos] = useState<DatoBanco[] | null>(null);
  const [tipo, setTipo] = useState<"CUENTA" | "PAGO_MOVIL">("CUENTA");
  const [codigo, setCodigo] = useState(esBolivares ? "0102" : "");
  const [numero, setNumero] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    capitalApi
      .datosBanco(banco.id)
      .then(setDatos)
      .catch(() => setDatos([]));
  }, [banco.id]);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const nuevo = await capitalApi.agregarDatoBanco(banco.id, {
        tipo,
        banco: codigo || undefined,
        ...(tipo === "CUENTA" ? { numero } : { cedula: cedula || undefined, telefono }),
      });
      setDatos((l) => [...(l ?? []), nuevo]);
      setNumero("");
      setCedula("");
      setTelefono("");
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "No se pudo agregar.");
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(id: number) {
    setError(null);
    try {
      await capitalApi.quitarDatoBanco(id);
      setDatos((l) => (l ?? []).filter((d) => d.id !== id));
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar.");
    }
  }

  return (
    <Modal titulo={`Cuenta y pago móvil · ${banco.nombre}`} onCerrar={onCerrar}>
      <div className="cap-datos-banco">
        <p className="cap-sub">
          En Confirmaciones, si el capture dice que la plata llegó a esta cuenta (o salió de ella), la cuenta se alimenta sola al agregar el movimiento.
        </p>
        {datos === null ? (
          <p className="cap-vacio">Cargando…</p>
        ) : datos.length === 0 ? (
          <p className="cap-vacio">Todavía no tiene cuenta ni pago móvil.</p>
        ) : (
          <ul className="cap-datos-lista">
            {datos.map((d) => (
              <li key={d.id}>
                <span>{textoDato(d)}</span>
                <button type="button" onClick={() => void quitar(d.id)} aria-label={`Quitar ${textoDato(d)}`} title="Quitar">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="cc-modal" onSubmit={agregar}>
          <div className="cc-chips" role="radiogroup" aria-label="Qué se agrega">
            <button type="button" role="radio" aria-checked={tipo === "CUENTA"} className={tipo === "CUENTA" ? "activo" : ""} onClick={() => setTipo("CUENTA")}>
              Número de cuenta
            </button>
            <button type="button" role="radio" aria-checked={tipo === "PAGO_MOVIL"} className={tipo === "PAGO_MOVIL" ? "activo" : ""} onClick={() => setTipo("PAGO_MOVIL")}>
              Pago móvil
            </button>
          </div>
          <label>
            Banco
            <select value={codigo} onChange={(e) => setCodigo(e.target.value)}>
              <option value="">{esBolivares ? "Elegir el banco…" : "No aplica"}</option>
              {BANCOS_VE.map(([c, n]) => (
                <option key={c} value={c}>
                  {c} · {n}
                </option>
              ))}
            </select>
          </label>
          {tipo === "CUENTA" ? (
            <label>
              Número de cuenta
              <input value={numero} onChange={(e) => setNumero(e.target.value.replace(/[^\d\s-]/g, ""))} inputMode="numeric" placeholder="La cuenta completa o los últimos 4 dígitos (ej. 8515)" autoFocus />
            </label>
          ) : (
            <>
              <label>
                Cédula
                <input value={cedula} onChange={(e) => setCedula(e.target.value.replace(/[^\dVvEeJj.\s-]/g, ""))} placeholder="ej. 10192931" />
              </label>
              <label>
                Teléfono
                <input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/[^\d\s+-]/g, ""))} inputMode="tel" placeholder="ej. 0414-7320762" autoFocus />
              </label>
            </>
          )}
          {error && <p className="cc-form-error">{error}</p>}
          <div className="cc-form-acciones">
            <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
              Listo
            </button>
            <button type="submit" className="cc-guardar" disabled={enviando}>
              {enviando ? "Agregando…" : "Agregar"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export { nombreBanco };
