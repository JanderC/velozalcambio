import { useState, type FormEvent } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { capitalApi, type BancoDelSistema, type DatoBanco } from "../../api/capital.api";
import { leerNumero } from "../../utils/montos";
import { BANCOS_VE } from "./DatosBancoModal";
import { conPuntos } from "./CuadroBancos";

const soloDigitos = (v: string) => v.replace(/\D/g, "");
const nombreDelBanco = (codigo: string) => BANCOS_VE.find(([c]) => c === codigo)?.[1] ?? "";
/** 4147320762 -> 0414-7320762 */
const telefonoBonito = (t: string | null | undefined) => (t && t.length === 10 ? `0${t.slice(0, 3)}-${t.slice(3)}` : (t ?? ""));
const telefonoNormal = (v: string) => {
  const d = soloDigitos(v);
  return d.length >= 10 ? d.slice(-10) : d;
};

/**
 * Crear o editar una cuenta de banco de la empresa en un solo paso: el nombre, el banco, los últimos 4 dígitos de la
 * cuenta y (en bolívares) el pago móvil. Abajo se ve en vivo cómo la va a reconocer el sistema en los captures de
 * Confirmaciones, así se confirma antes de guardar.
 */
export function CuentaBancoModal({
  modo,
  moneda,
  banco,
  bancos,
  onCerrar,
  onHecho,
}: {
  modo: "crear" | "editar";
  moneda: "COP" | "VES";
  banco?: BancoDelSistema;
  bancos: BancoDelSistema[];
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const enBolivares = moneda === "VES";
  const cuentaAntes = banco?.datos?.find((d) => d.tipo === "CUENTA") as DatoBanco | undefined;
  const pagoAntes = banco?.datos?.find((d) => d.tipo === "PAGO_MOVIL") as DatoBanco | undefined;
  const [nombre, setNombre] = useState(banco?.nombre ?? "");
  const [codigo, setCodigo] = useState(cuentaAntes?.banco ?? pagoAntes?.banco ?? (enBolivares ? "0102" : ""));
  const [digitos, setDigitos] = useState(cuentaAntes?.numero ?? "");
  const [telefono, setTelefono] = useState(telefonoBonito(pagoAntes?.telefono));
  const [cedula, setCedula] = useState(pagoAntes?.cedula ?? "");
  const [saldo, setSaldo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numero = soloDigitos(digitos);
  const tel = telefonoNormal(telefono);
  const sugerido = enBolivares && codigo && numero.length >= 4 ? `${nombreDelBanco(codigo) || codigo} ${numero.slice(-4)}` : numero.length >= 4 ? `Cuenta ${numero.slice(-4)}` : "";
  const nombreFinal = nombre.trim() || sugerido;
  // los mismos 4 dígitos (o el mismo teléfono) ya en otra cuenta: el capture no sabría a cuál ir
  const otraConDigitos =
    numero.length >= 4 ? bancos.find((b) => b.id !== banco?.id && b.datos?.some((d) => d.tipo === "CUENTA" && (d.numero ?? "").slice(-4) === numero.slice(-4) && (!d.banco || !codigo || d.banco === codigo))) : undefined;
  const otraConTelefono = tel.length === 10 ? bancos.find((b) => b.id !== banco?.id && b.datos?.some((d) => d.tipo === "PAGO_MOVIL" && d.telefono === tel)) : undefined;
  const saldoEscrito = saldo.trim() ? leerNumero(saldo) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombreFinal.length < 2) return setError("Escribí el nombre de la cuenta (o los últimos 4 dígitos para ponerle uno).");
    if (numero && numero.length < 4) return setError("Escribí los últimos 4 dígitos de la cuenta (o el número completo).");
    if (telefono.trim() && tel.length !== 10) return setError("El teléfono del pago móvil no es válido (ej. 0414-7320762).");
    if (otraConDigitos) return setError(`La cuenta terminada en ${numero.slice(-4)} ya es "${otraConDigitos.nombre}".`);
    if (otraConTelefono) return setError(`Ese pago móvil ya es de "${otraConTelefono.nombre}".`);
    if (saldo.trim() && saldoEscrito === null) return setError("El saldo con que arranca no es un número válido.");
    setEnviando(true);
    const hecho: string[] = [];
    try {
      let id = banco?.id;
      if (modo === "crear") {
        id = (await capitalApi.crearBanco(nombreFinal, moneda)).id;
      } else if (banco && nombreFinal !== banco.nombre) {
        await capitalApi.renombrarBanco(banco.id, nombreFinal);
      }
      // la cuenta: si cambió, se cambia el dato (el resto de los datos que tenga quedan)
      const cambioCuenta = numero !== (cuentaAntes?.numero ?? "") || (numero && (codigo || null) !== (cuentaAntes?.banco ?? null));
      if (cambioCuenta) {
        if (cuentaAntes) await capitalApi.quitarDatoBanco(cuentaAntes.id);
        if (numero) await capitalApi.agregarDatoBanco(id!, { tipo: "CUENTA", banco: codigo || undefined, numero });
      }
      if (numero) hecho.push(`cuenta …${numero.slice(-4)}`);
      const cambioPago = tel !== (pagoAntes?.telefono ?? "") || soloDigitos(cedula) !== (pagoAntes?.cedula ?? "") || (tel && (codigo || null) !== (pagoAntes?.banco ?? null));
      if (enBolivares && cambioPago) {
        if (pagoAntes) await capitalApi.quitarDatoBanco(pagoAntes.id);
        if (tel) await capitalApi.agregarDatoBanco(id!, { tipo: "PAGO_MOVIL", banco: codigo || undefined, telefono: tel, cedula: soloDigitos(cedula) || undefined });
      }
      if (enBolivares && tel) hecho.push(`pago móvil ${telefonoBonito(tel)}`);
      if (modo === "crear" && saldoEscrito && /[1-9]/.test(saldoEscrito)) await capitalApi.cargarSaldoBanco(id!, moneda, saldoEscrito);
      onHecho(
        `${modo === "crear" ? "Cuenta creada" : "Cuenta guardada"}: ${nombreFinal}.` +
          (hecho.length ? ` Los captures que lleguen a la ${hecho.join(" o al ")} se cargan solos a esta cuenta.` : " Sin los últimos 4 dígitos, los captures no se cargan solos a esta cuenta.")
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la cuenta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={modo === "crear" ? `Nueva cuenta en ${enBolivares ? "bolívares" : "pesos"}` : `Editar cuenta · ${banco?.nombre}`} onCerrar={onCerrar}>
      <form className="cc-modal cap-ficha" onSubmit={guardar}>
        {enBolivares && (
          <label>
            Banco
            <select value={codigo} onChange={(e) => setCodigo(e.target.value)}>
              {BANCOS_VE.map(([c, n]) => (
                <option key={c} value={c}>
                  {c} · {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Últimos 4 dígitos de la cuenta
          <input
            value={digitos}
            onChange={(e) => setDigitos(soloDigitos(e.target.value).slice(0, 20))}
            inputMode="numeric"
            placeholder="ej. 8515 (o el número completo)"
            autoFocus
            aria-label="Últimos 4 dígitos de la cuenta"
          />
        </label>
        <label>
          Nombre de la cuenta
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={sugerido || (enBolivares ? "ej. Banco de Venezuela 8515" : "ej. Bancolombia 4521")} />
        </label>
        {enBolivares && (
          <div className="cc-modal-fila">
            <label>
              Pago móvil: teléfono (opcional)
              <input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/[^\d\s+-]/g, ""))} inputMode="tel" placeholder="0414-7320762" />
            </label>
            <label>
              Cédula (opcional)
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" placeholder="V-12345678" />
            </label>
          </div>
        )}
        {modo === "crear" && (
          <label>
            Saldo con que arranca (opcional)
            <input value={saldo} onChange={(e) => setSaldo(conPuntos(e.target.value))} inputMode="decimal" placeholder="0" />
          </label>
        )}

        {/* lo que se va a guardar y cómo se reconoce: se confirma antes de guardar */}
        <div className={`cap-ficha-vista ${otraConDigitos || otraConTelefono ? "mal" : numero.length >= 4 ? "bien" : ""}`}>
          <b>{nombreFinal || "Cuenta sin nombre"}</b>
          <span>
            {enBolivares ? "Bolívares" : "Pesos"}
            {enBolivares && codigo ? ` · ${codigo} ${nombreDelBanco(codigo)}` : ""}
            {numero.length >= 4 ? ` · cuenta ···· ${numero.slice(-4)}` : ""}
            {enBolivares && tel.length === 10 ? ` · pago móvil ${telefonoBonito(tel)}` : ""}
          </span>
          {otraConDigitos ? (
            <small>
              <AlertTriangle size={13} /> La cuenta terminada en {numero.slice(-4)} ya es “{otraConDigitos.nombre}”.
            </small>
          ) : otraConTelefono ? (
            <small>
              <AlertTriangle size={13} /> Ese pago móvil ya es de “{otraConTelefono.nombre}”.
            </small>
          ) : numero.length >= 4 || tel.length === 10 ? (
            <small>
              <CheckCircle2 size={13} /> En Confirmaciones, el capture que llegue a {numero.length >= 4 ? `…${numero.slice(-4)}` : ""}
              {numero.length >= 4 && tel.length === 10 ? " o a " : ""}
              {tel.length === 10 ? telefonoBonito(tel) : ""} se carga solo a esta cuenta.
            </small>
          ) : (
            <small>Escribí los últimos 4 dígitos para que los captures se carguen solos a esta cuenta.</small>
          )}
        </div>

        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando || !!otraConDigitos || !!otraConTelefono}>
            {enviando ? "Guardando…" : modo === "crear" ? "Crear cuenta" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
