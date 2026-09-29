import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import {
  actualizarCuentaTercero,
  crearCuentaTercero,
  ETIQUETA_TIPO_CUENTA,
  type CambiosCuentaTercero,
  type CuentaTercero,
  type DatosCuentaTercero,
  type TipoCuentaTercero,
} from "../../api/cuentasTercero.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import "./cuentasCliente.css";

type CampoTexto = "banco" | "numeroCuenta" | "titular" | "identificacionTitular" | "telefono" | "email" | "alias";

// Qué pide cada tipo (espejo de la validación del backend; el backend es quien decide).
// `obligatorio` marca el *; Zelle exige email o teléfono, al menos uno.
const CAMPOS_POR_TIPO: Record<TipoCuentaTercero, { campo: CampoTexto | "tipoCuenta"; obligatorio: boolean }[]> = {
  CUENTA_BANCARIA: [
    { campo: "banco", obligatorio: true },
    { campo: "numeroCuenta", obligatorio: true },
    { campo: "tipoCuenta", obligatorio: false },
    { campo: "titular", obligatorio: true },
    { campo: "identificacionTitular", obligatorio: false },
  ],
  PAGO_MOVIL: [
    { campo: "banco", obligatorio: true },
    { campo: "telefono", obligatorio: true },
    { campo: "identificacionTitular", obligatorio: true },
    { campo: "titular", obligatorio: true },
  ],
  ZELLE: [
    { campo: "email", obligatorio: false },
    { campo: "telefono", obligatorio: false },
    { campo: "titular", obligatorio: true },
  ],
  NEQUI: [
    { campo: "telefono", obligatorio: true },
    { campo: "titular", obligatorio: true },
  ],
  DAVIPLATA: [
    { campo: "telefono", obligatorio: true },
    { campo: "titular", obligatorio: true },
  ],
  OTRO: [
    { campo: "titular", obligatorio: true },
    { campo: "banco", obligatorio: false },
    { campo: "numeroCuenta", obligatorio: false },
    { campo: "identificacionTitular", obligatorio: false },
    { campo: "telefono", obligatorio: false },
    { campo: "email", obligatorio: false },
  ],
};

const ETIQUETA_CAMPO: Record<CampoTexto | "tipoCuenta", string> = {
  banco: "Banco",
  numeroCuenta: "Número de cuenta",
  tipoCuenta: "Tipo de cuenta",
  titular: "Titular",
  identificacionTitular: "Identificación del titular",
  telefono: "Teléfono",
  email: "Email",
  alias: "Alias",
};

const PLACEHOLDER: Partial<Record<CampoTexto, string>> = {
  banco: "ej. Banesco",
  numeroCuenta: "ej. 01340000000000000000",
  titular: "Puede ser distinto al cliente",
  identificacionTitular: "ej. V-12345678",
  telefono: "ej. 04141234567",
  email: "ej. nombre@correo.com",
};

const TIPOS: TipoCuentaTercero[] = ["PAGO_MOVIL", "CUENTA_BANCARIA", "ZELLE", "NEQUI", "DAVIPLATA", "OTRO"];

type Valores = Record<CampoTexto, string> & { tipoCuenta: "" | "AHORRO" | "CORRIENTE"; monedaId: number | "" };

function valoresIniciales(cuenta: CuentaTercero | undefined, titularSugerido: string): Valores {
  return {
    banco: cuenta?.banco ?? "",
    numeroCuenta: cuenta?.numero_cuenta ?? "",
    tipoCuenta: cuenta?.tipo_cuenta ?? "",
    titular: cuenta?.titular ?? titularSugerido,
    identificacionTitular: cuenta?.identificacion_titular ?? "",
    telefono: cuenta?.telefono ?? "",
    email: cuenta?.email ?? "",
    alias: cuenta?.alias ?? "",
    monedaId: cuenta?.moneda_id ?? "",
  };
}

// Texto del formulario -> valor para el backend: vacío = null (en edición borra; en alta no se envía).
function aValor(texto: string): string | null {
  const t = texto.trim();
  return t === "" ? null : t;
}

export function CuentaClienteForm({
  terceroId,
  cuenta,
  titularSugerido = "",
  monedaSugeridaId,
  onGuardado,
  onCancelar,
}: {
  terceroId: number;
  // Si viene, el formulario edita esa cuenta; si no, crea una nueva
  cuenta?: CuentaTercero;
  titularSugerido?: string;
  monedaSugeridaId?: number;
  onGuardado: (cuenta: CuentaTercero) => void;
  onCancelar: () => void;
}) {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tipo, setTipo] = useState<TipoCuentaTercero>(cuenta?.tipo ?? "PAGO_MOVIL");
  const [valores, setValores] = useState<Valores>(() => {
    const v = valoresIniciales(cuenta, titularSugerido);
    return cuenta || !monedaSugeridaId ? v : { ...v, monedaId: monedaSugeridaId };
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
  }, []);

  const campos = CAMPOS_POR_TIPO[tipo];

  function cambiar<K extends keyof Valores>(campo: K, valor: Valores[K]) {
    setValores((v) => ({ ...v, [campo]: valor }));
  }

  function faltantes(): string[] {
    const faltan = campos
      .filter((c) => c.obligatorio && c.campo !== "tipoCuenta" && !valores[c.campo].trim())
      .map((c) => ETIQUETA_CAMPO[c.campo].toLowerCase());
    if (tipo === "ZELLE" && !valores.email.trim() && !valores.telefono.trim()) faltan.push("email o teléfono");
    return faltan;
  }

  // Todos los campos del formulario en el formato del backend (null = vacío).
  // Los campos que el tipo elegido no usa van en null: al cambiar de tipo no quedan datos del tipo anterior.
  function datosCompletos(): DatosCuentaTercero {
    const visibles = new Set(campos.map((c) => c.campo));
    const texto = (campo: CampoTexto) => (visibles.has(campo) || campo === "alias" ? aValor(valores[campo]) : null);
    return {
      tipo,
      monedaId: valores.monedaId === "" ? null : valores.monedaId,
      banco: texto("banco"),
      numeroCuenta: texto("numeroCuenta"),
      tipoCuenta: visibles.has("tipoCuenta") && valores.tipoCuenta !== "" ? valores.tipoCuenta : null,
      titular: valores.titular.trim(),
      identificacionTitular: texto("identificacionTitular"),
      telefono: texto("telefono"),
      email: texto("email"),
      alias: texto("alias"),
    };
  }

  // Alta: sin nulos (el backend no acepta "" y los vacíos simplemente no se mandan).
  function paraCrear(d: DatosCuentaTercero): DatosCuentaTercero {
    const limpio: DatosCuentaTercero = { tipo: d.tipo, titular: d.titular };
    if (d.monedaId != null) limpio.monedaId = d.monedaId;
    if (d.banco != null) limpio.banco = d.banco;
    if (d.numeroCuenta != null) limpio.numeroCuenta = d.numeroCuenta;
    if (d.tipoCuenta != null) limpio.tipoCuenta = d.tipoCuenta;
    if (d.identificacionTitular != null) limpio.identificacionTitular = d.identificacionTitular;
    if (d.telefono != null) limpio.telefono = d.telefono;
    if (d.email != null) limpio.email = d.email;
    if (d.alias != null) limpio.alias = d.alias;
    return limpio;
  }

  // Edición: solo lo que cambió respecto de la cuenta guardada.
  function paraEditar(d: DatosCuentaTercero, original: CuentaTercero): CambiosCuentaTercero {
    const cambios: CambiosCuentaTercero = {};
    if (d.tipo !== original.tipo) cambios.tipo = d.tipo;
    if ((d.monedaId ?? null) !== original.moneda_id) cambios.monedaId = d.monedaId ?? null;
    if ((d.banco ?? null) !== original.banco) cambios.banco = d.banco ?? null;
    if ((d.numeroCuenta ?? null) !== original.numero_cuenta) cambios.numeroCuenta = d.numeroCuenta ?? null;
    if ((d.tipoCuenta ?? null) !== original.tipo_cuenta) cambios.tipoCuenta = d.tipoCuenta ?? null;
    if (d.titular !== original.titular) cambios.titular = d.titular;
    if ((d.identificacionTitular ?? null) !== original.identificacion_titular) cambios.identificacionTitular = d.identificacionTitular ?? null;
    if ((d.telefono ?? null) !== original.telefono) cambios.telefono = d.telefono ?? null;
    if ((d.email ?? null) !== original.email) cambios.email = d.email ?? null;
    if ((d.alias ?? null) !== original.alias) cambios.alias = d.alias ?? null;
    return cambios;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Puede abrirse en un modal dentro de otro <form>: los eventos de React cruzan portales.
    e.stopPropagation();
    setError(null);
    const faltan = faltantes();
    if (faltan.length > 0) return setError(`Falta: ${faltan.join(", ")}.`);

    const datos = datosCompletos();
    setGuardando(true);
    try {
      if (cuenta) {
        const cambios = paraEditar(datos, cuenta);
        if (Object.keys(cambios).length === 0) {
          onGuardado(cuenta);
          return;
        }
        onGuardado(await actualizarCuentaTercero(cuenta.id, cambios));
      } else {
        onGuardado(await crearCuentaTercero(terceroId, paraCrear(datos)));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la cuenta.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="cta-form" onSubmit={handleSubmit}>
      <div className="cta-campo">
        Tipo de cuenta
        <div className="cta-chips">
          {TIPOS.map((t) => (
            <button type="button" key={t} className={tipo === t ? "activo" : ""} onClick={() => setTipo(t)}>
              {ETIQUETA_TIPO_CUENTA[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="cta-grilla">
        {campos.map(({ campo, obligatorio }) =>
          campo === "tipoCuenta" ? (
            <div className="cta-campo" key={campo}>
              {ETIQUETA_CAMPO.tipoCuenta}
              <div className="cta-chips">
                {(["AHORRO", "CORRIENTE"] as const).map((tc) => (
                  <button
                    type="button"
                    key={tc}
                    className={valores.tipoCuenta === tc ? "activo" : ""}
                    onClick={() => cambiar("tipoCuenta", valores.tipoCuenta === tc ? "" : tc)}
                  >
                    {tc === "AHORRO" ? "Ahorro" : "Corriente"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <label className="cta-campo" key={campo}>
              <span>
                {ETIQUETA_CAMPO[campo]}
                {obligatorio && <span className="cta-obligatorio"> *</span>}
              </span>
              <input
                type={campo === "email" ? "email" : campo === "telefono" ? "tel" : "text"}
                inputMode={campo === "telefono" || campo === "numeroCuenta" ? "numeric" : undefined}
                value={valores[campo]}
                onChange={(e) => cambiar(campo, e.target.value)}
                placeholder={PLACEHOLDER[campo]}
              />
            </label>
          )
        )}
      </div>
      {tipo === "ZELLE" && <p className="cta-nota">Zelle: indicá el email o el teléfono (al menos uno).</p>}

      <div className="cta-grilla">
        <label className="cta-campo">
          Moneda (opcional)
          <select value={valores.monedaId} onChange={(e) => cambiar("monedaId", e.target.value ? Number(e.target.value) : "")}>
            <option value="">Sin especificar</option>
            {monedas.map((m) => <option key={m.id} value={m.id}>{m.codigo}</option>)}
          </select>
        </label>
        <label className="cta-campo">
          Alias (opcional)
          <input value={valores.alias} onChange={(e) => cambiar("alias", e.target.value)} placeholder='ej. "Banesco de la mamá"' />
        </label>
      </div>

      {error && <p className="cta-error">{error}</p>}

      <div className="cta-acciones">
        <button type="button" className="cta-btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="cta-btn-primario" disabled={guardando}>
          <Save size={16} /> {guardando ? "Guardando…" : cuenta ? "Guardar cambios" : "Agregar cuenta"}
        </button>
      </div>
    </form>
  );
}
