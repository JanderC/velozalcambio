import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FileText } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { getMovimientosCuentaCorriente, type CuentaCorrienteResumen, type MovimientoCC } from "../../../api/cuentasCorrientes.api";
import { formatearMonto, leerNumero } from "../../../utils/montos";
import { generarDocumento, type Finiquito, type Parte } from "./documentoContrato";

const PARTE_VACIA: Parte = { nombre: "", cedula: "", rif: "", ciudad: "", municipio: "", estado: "Táchira" };
const CLAVE_EMPRESA = "contrato-comisionista";
const claveCliente = (terceroId: number) => `contrato-cliente-${terceroId}`;
const leerGuardado = <T,>(clave: string): Partial<T> => {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? "{}") as Partial<T>;
  } catch {
    return {};
  }
};
const guardar = (clave: string, v: unknown) => {
  try {
    localStorage.setItem(clave, JSON.stringify(v));
  } catch {
    // no es grave: la próxima vez se escribe de nuevo
  }
};
const num = (t: string) => {
  const n = t.trim() ? leerNumero(t) : null;
  return n !== null && n !== undefined ? Number(n) : null;
};
// con sus decimales fijos (Bs. 50.000,00 · 200,00 USDT · $ 780.000), como en el comprobante
const bonito = (n: number | null, dec = 2) => (n === null || !Number.isFinite(n) ? "" : n.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const fechaHora = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dia} - ${hora}`;
};
const codigoOperacion = (m: MovimientoCC) => {
  const d = new Date(m.fecha).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).replace(/-/g, "");
  return `OP-${d}-${String(m.id).padStart(3, "0")}`;
};

/**
 * Contrato de comisión y finiquito del cliente, en Word. Vienen puestos los datos que ya tiene el cliente (nombre,
 * cédula, teléfono) y los de la empresa (se recuerdan); para el finiquito se elige la operación y se completan las
 * tasas. Lo que se escribe del cliente (RIF, ciudad) queda recordado en esta computadora para la próxima.
 */
export function ContratoClienteModal({ cuenta, onCerrar }: { cuenta: CuentaCorrienteResumen; onCerrar: () => void }) {
  const [cliente, setCliente] = useState<Parte>(() => ({
    ...PARTE_VACIA,
    ...leerGuardado<Parte>(claveCliente(cuenta.tercero_id)),
    nombre: cuenta.tercero_nombre,
    cedula: cuenta.tercero_identificacion ?? leerGuardado<Parte>(claveCliente(cuenta.tercero_id)).cedula ?? "",
  }));
  const [empresa, setEmpresa] = useState<Parte>(() => ({ ...PARTE_VACIA, ...leerGuardado<Parte>(CLAVE_EMPRESA) }));
  const [lugar, setLugar] = useState("San Cristóbal");
  const [conFiniquito, setConFiniquito] = useState(true);
  const [movimientos, setMovimientos] = useState<MovimientoCC[] | null>(null);
  const [movId, setMovId] = useState<number | "">("");
  // los datos de la operación (finiquito)
  const [f, setF] = useState({ referencia: "", bolivares: "", tasaVesUsdt: "", tasaUsdtCop: "", hash: "", subtotal: "", comisionPct: "", bancarias: "", titular: "", numeroCuenta: "", referenciaPago: "", estadoPago: "Exitosa / Completada", contacto: cuenta.tercero_telefono ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  // las operaciones del cliente (lo que entró, sin anulaciones): la más nueva primero
  useEffect(() => {
    getMovimientosCuentaCorriente(cuenta.id)
      .then((l) => {
        const ops = l.filter((m) => Number(m.monto) > 0 && !/^reverso de/i.test(m.descripcion ?? "")).reverse();
        setMovimientos(ops);
        if (ops[0]) elegir(ops[0]);
      })
      .catch(() => setMovimientos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta.id]);

  function elegir(m: MovimientoCC) {
    setMovId(m.id);
    const partes = (m.descripcion ?? "").split(" · ");
    // en bolívares: la cantidad que llegó; lo que se le entrega (pesos) es el monto
    const enBs = /bol[ií]var|bs\b|pago m[oó]vil/i.test(m.descripcion ?? "") || cuenta.canal_nombre === "BOLIVARES";
    setF((x) => ({
      ...x,
      referencia: partes[1] ?? "",
      bolivares: enBs && m.cantidad_base ? bonito(Number(m.cantidad_base)) : "",
      subtotal: cuenta.moneda_codigo === "COP" ? bonito(Number(m.monto), 0) : "",
    }));
  }
  const mov = movimientos?.find((m) => m.id === movId) ?? null;

  // las cuentas: VES → USDT → COP, la comisión y lo que queda neto
  const calc = useMemo(() => {
    const bs = num(f.bolivares);
    const t1 = num(f.tasaVesUsdt);
    const t2 = num(f.tasaUsdtCop);
    const usdt = bs && t1 ? bs / t1 : null;
    const subtotal = usdt && t2 ? Math.round(usdt * t2) : num(f.subtotal);
    const pct = num(f.comisionPct) ?? 0;
    const comision = subtotal !== null ? Math.round((subtotal * pct) / 100) : null;
    const bancarias = num(f.bancarias) ?? 0;
    const neto = subtotal !== null ? subtotal - (comision ?? 0) - bancarias : null;
    return { usdt, subtotal, comision, bancarias, neto, automatico: !!(usdt && t2) };
  }, [f]);

  async function generar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (cliente.nombre.trim().split(/\s+/).length < 2) return setError("Escribí el nombre completo del cliente.");
    if (!cliente.cedula.trim()) return setError("Falta la cédula del cliente.");
    if (empresa.nombre.trim().length < 3 || !empresa.cedula.trim()) return setError("Faltan los datos del comisionista (nombre y cédula de quien firma por la empresa).");
    if (conFiniquito && !mov) return setError("Elegí la operación para el finiquito (o quitá el finiquito).");
    guardar(CLAVE_EMPRESA, empresa);
    guardar(claveCliente(cuenta.tercero_id), { rif: cliente.rif, ciudad: cliente.ciudad, municipio: cliente.municipio, estado: cliente.estado, cedula: cliente.cedula });
    const finiquito: Finiquito | null =
      conFiniquito && mov
        ? {
            numero: codigoOperacion(mov),
            fechaHora: fechaHora(mov.fecha),
            contacto: f.contacto,
            bolivares: f.bolivares,
            referencia: f.referencia,
            tasaVesUsdt: f.tasaVesUsdt,
            usdt: bonito(calc.usdt),
            hash: f.hash,
            tasaUsdtCop: f.tasaUsdtCop,
            subtotalCop: bonito(calc.subtotal, 0),
            comisionPct: f.comisionPct,
            comisionCop: bonito(calc.comision, 0),
            bancariasCop: bonito(calc.bancarias, 0),
            netoCop: bonito(calc.neto, 0),
            titular: f.titular,
            numeroCuenta: f.numeroCuenta,
            referenciaPago: f.referenciaPago,
            estadoPago: f.estadoPago,
          }
        : null;
    setGenerando(true);
    try {
      const blob = await generarDocumento({ comitente: cliente, comisionista: empresa, lugarFirma: lugar, fechaFirma: new Date(), finiquito });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contrato ${cliente.nombre.trim()}${finiquito ? ` - ${finiquito.numero}` : ""}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onCerrar();
    } catch {
      setError("No se pudo armar el documento.");
    } finally {
      setGenerando(false);
    }
  }

  const campoParte = (p: Parte, cambiar: (v: Parte) => void, campo: keyof Parte, etiqueta: string, placeholder = "") => (
    <label>
      {etiqueta}
      <input value={p[campo]} onChange={(e) => cambiar({ ...p, [campo]: e.target.value })} placeholder={placeholder} />
    </label>
  );
  const campo = (k: keyof typeof f, etiqueta: string, placeholder = "", numerico = false) => (
    <label>
      {etiqueta}
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={placeholder} inputMode={numerico ? "decimal" : undefined} />
    </label>
  );

  return (
    <Modal titulo={`Contrato y finiquito · ${cuenta.tercero_nombre}`} ancho="ancho" onCerrar={onCerrar}>
      <form className="cc-modal cc-contrato" onSubmit={generar}>
        <fieldset>
          <legend>El cliente (EL COMITENTE)</legend>
          <div className="cc-contrato-grilla">
            {campoParte(cliente, setCliente, "nombre", "Nombre completo")}
            {campoParte(cliente, setCliente, "cedula", "Cédula", "V-12.345.678")}
            {campoParte(cliente, setCliente, "rif", "RIF (opcional)", "J-12345678-9")}
            {campoParte(cliente, setCliente, "ciudad", "Ciudad", "San Cristóbal")}
            {campoParte(cliente, setCliente, "municipio", "Municipio", "San Cristóbal")}
            {campoParte(cliente, setCliente, "estado", "Estado", "Táchira")}
          </div>
        </fieldset>
        <fieldset>
          <legend>La empresa (EL COMISIONISTA) · queda recordado</legend>
          <div className="cc-contrato-grilla">
            {campoParte(empresa, setEmpresa, "nombre", "Nombre de quien firma")}
            {campoParte(empresa, setEmpresa, "cedula", "Cédula")}
            {campoParte(empresa, setEmpresa, "rif", "RIF", "J-12345678-9")}
            {campoParte(empresa, setEmpresa, "ciudad", "Ciudad", "San Cristóbal")}
            {campoParte(empresa, setEmpresa, "municipio", "Municipio")}
            <label>
              Lugar de la firma
              <input value={lugar} onChange={(e) => setLugar(e.target.value)} />
            </label>
          </div>
        </fieldset>

        <label className="cc-check-doble">
          <input type="checkbox" checked={conFiniquito} onChange={(e) => setConFiniquito(e.target.checked)} />
          Incluir el finiquito de una operación (Anexo 3)
        </label>
        {conFiniquito && (
          <fieldset>
            <legend>La operación</legend>
            <label>
              Operación
              <select
                value={movId}
                onChange={(e) => {
                  const m = movimientos?.find((x) => x.id === Number(e.target.value));
                  if (m) elegir(m);
                }}
                disabled={!movimientos?.length}
              >
                {!movimientos?.length && <option value="">{movimientos ? "Este cliente no tiene operaciones" : "Cargando…"}</option>}
                {(movimientos ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {fechaHora(m.fecha)} · {m.descripcion ?? "Operación"} · {formatearMonto(m.monto)} {cuenta.moneda_codigo}
                  </option>
                ))}
              </select>
            </label>
            <div className="cc-contrato-grilla">
              {campo("bolivares", "Bolívares recibidos (Bs)", "0,00", true)}
              {campo("referencia", "Referencia / banco de lo recibido")}
              {campo("tasaVesUsdt", "Tasa VES → USDT", "ej. 245,50", true)}
              <label>
                USDT adquiridos
                <input value={bonito(calc.usdt)} readOnly placeholder="se calcula" />
              </label>
              {campo("hash", "Hash / TXID (opcional)")}
              {campo("tasaUsdtCop", "Tasa USDT → COP", "ej. 3.890", true)}
              <label>
                Subtotal en pesos
                {calc.automatico ? <input value={bonito(calc.subtotal, 0)} readOnly /> : <input value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} inputMode="decimal" />}
              </label>
              {campo("comisionPct", "Comisión por gestión (%)", "ej. 3", true)}
              {campo("bancarias", "Comisiones bancarias / de red (COP)", "0", true)}
            </div>
            <p className="cc-contrato-neto">
              Comisión: <b>$ {bonito(calc.comision, 0) || "0"}</b> · Neto a pagar al cliente: <b>$ {bonito(calc.neto, 0) || "0"} COP</b>
            </p>
            <div className="cc-contrato-grilla">
              {campo("titular", "Titular de la cuenta Bancolombia")}
              {campo("numeroCuenta", "Número de cuenta (ahorros / corriente)")}
              {campo("referenciaPago", "Comprobante / referencia Bancolombia")}
              {campo("contacto", "Contacto del cliente (teléfono / correo)")}
            </div>
          </fieldset>
        )}

        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={generando}>
            <FileText size={15} /> {generando ? "Armando…" : "Descargar Word"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
