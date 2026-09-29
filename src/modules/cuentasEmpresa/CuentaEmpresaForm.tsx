import { useState, type FormEvent } from "react";
import { actualizarCaja, crearCaja, type Caja, type TipoCuentaBancaria } from "../../api/cajas.api";
import type { Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";

export const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "VE", nombre: "Venezuela" },
  { codigo: "US", nombre: "Estados Unidos" },
  { codigo: "OTRO", nombre: "Otro" },
];

export const TIPO_CUENTA_LABEL: Record<TipoCuentaBancaria, string> = {
  AHORRO: "Ahorro",
  CORRIENTE: "Corriente",
  BILLETERA: "Billetera digital",
};

// Sugerencias por país; se puede escribir cualquier otro banco
const BANCOS_SUGERIDOS: Record<string, string[]> = {
  CO: ["Bancolombia", "Nequi", "Daviplata", "Davivienda", "Banco de Bogotá", "BBVA Colombia"],
  VE: ["Mercantil", "Banesco", "Banco de Venezuela", "Provincial", "BNC", "Bancamiga"],
  US: ["Zelle", "Bank of America", "Chase", "Wells Fargo"],
};

function nombrePais(codigo: string | null) {
  return PAISES.find((p) => p.codigo === codigo)?.nombre ?? codigo ?? "";
}
export { nombrePais };

function aValor(texto: string): string | null {
  const t = texto.trim();
  return t === "" ? null : t;
}

// Cuenta de la empresa = caja tipo BANCO con sus datos bancarios. Sin `cuenta` crea una nueva.
export function CuentaEmpresaForm({
  cuenta,
  monedas,
  onGuardada,
  onCancelar,
}: {
  cuenta?: Caja;
  monedas: Moneda[];
  onGuardada: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [pais, setPais] = useState(cuenta?.pais ?? "CO");
  const [banco, setBanco] = useState(cuenta?.banco ?? "");
  const [monedaId, setMonedaId] = useState<number | "">(cuenta?.moneda_id ?? "");
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuentaBancaria | "">(cuenta?.tipo_cuenta ?? "");
  const [numeroCuenta, setNumeroCuenta] = useState(cuenta?.numero_cuenta ?? "");
  const [titular, setTitular] = useState(cuenta?.titular ?? "");
  const [identificacion, setIdentificacion] = useState(cuenta?.identificacion_titular ?? "");
  const [telefono, setTelefono] = useState(cuenta?.telefono ?? "");
  const [email, setEmail] = useState(cuenta?.email ?? "");
  const [descripcion, setDescripcion] = useState(cuenta?.descripcion ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const datos = {
      nombre,
      banco: aValor(banco),
      pais: aValor(pais),
      monedaId: monedaId === "" ? null : monedaId,
      tipoCuenta: tipoCuenta === "" ? null : tipoCuenta,
      numeroCuenta: aValor(numeroCuenta),
      titular: aValor(titular),
      identificacionTitular: aValor(identificacion),
      telefono: aValor(telefono),
      email: aValor(email),
    };
    try {
      if (cuenta) {
        await actualizarCaja(cuenta.id, { ...datos, descripcion: aValor(descripcion) });
      } else {
        await crearCaja({ ...datos, tipo: "BANCO", descripcion: aValor(descripcion) ?? undefined });
      }
      onGuardada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la cuenta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cajas-form" onSubmit={handleSubmit}>
      <label>
        Nombre de la cuenta
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Mercantil Bs, Nequi principal" required autoFocus />
      </label>
      <div className="cajas-form-fila">
        <label>
          País
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            {PAISES.map((p) => (
              <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Banco / billetera
          <input value={banco} onChange={(e) => setBanco(e.target.value)} list="bancos-sugeridos" placeholder="Ej. Mercantil" />
          <datalist id="bancos-sugeridos">
            {(BANCOS_SUGERIDOS[pais] ?? []).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="cajas-form-fila">
        <label>
          Moneda
          <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Sin definir</option>
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>{m.codigo}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo de cuenta
          <select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value as TipoCuentaBancaria | "")}>
            <option value="">Sin definir</option>
            {(Object.keys(TIPO_CUENTA_LABEL) as TipoCuentaBancaria[]).map((t) => (
              <option key={t} value={t}>{TIPO_CUENTA_LABEL[t]}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Número de cuenta
        <input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} placeholder="Ej. 01050000000000000000" />
      </label>
      <div className="cajas-form-fila">
        <label>
          Titular
          <input value={titular} onChange={(e) => setTitular(e.target.value)} />
        </label>
        <label>
          Cédula / RIF / NIT
          <input value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} placeholder="Ej. V-12345678, J-123456789" />
        </label>
      </div>
      <div className="cajas-form-fila">
        <label>
          Teléfono (Nequi, Pago Móvil)
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej. 3001234567" />
        </label>
        <label>
          Email (Zelle)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <label>
        Nota (opcional)
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué se usa esta cuenta" />
      </label>

      {error && <p className="cajas-error">{error}</p>}

      <div className="cajas-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Guardando…" : cuenta ? "Guardar cambios" : "Crear cuenta"}</button>
      </div>
    </form>
  );
}
