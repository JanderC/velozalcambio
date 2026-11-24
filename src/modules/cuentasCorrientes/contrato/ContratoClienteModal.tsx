import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, FileText, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { ApiError } from "../../../api/client";
import { getMovimientosCuentaCorriente, type CuentaCorrienteResumen, type MovimientoCC } from "../../../api/cuentasCorrientes.api";
import { contratosApi, urlDeFirma, type Firma, type LinkFirma } from "../../../api/contratos.api";
import { leerNumero } from "../../../utils/montos";
import { descargarContrato, type Finiquito, type Parte } from "./documentoContrato";
import { FirmaControl, firmaParaWord } from "./FirmaControl";

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
const soloDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** El link para firmar, con copiar y mandarlo por WhatsApp. */
function CajaLink({ link, telefono, para }: { link: LinkFirma; telefono?: string | null; para: string }) {
  const url = urlDeFirma(link.token);
  const [copiado, setCopiado] = useState(false);
  const texto = `Hola ${para.split(/\s+/)[0]}, para el contrato de Pago Veloz al Cambio necesitamos tu firma. Ábrelo y firma con el dedo: ${url}`;
  const tel = soloDigitos(telefono);
  return (
    <div className={`cc-link-firma ${link.estado === "FIRMADO" ? "firmado" : ""}`}>
      <span>
        {link.estado === "FIRMADO" ? "✓ Firmado desde el link" : link.estado === "VENCIDO" ? "El link venció" : "Link para firmar (pendiente)"}
      </span>
      {link.estado === "PENDIENTE" && (
        <>
          <input value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Link para firmar" />
          <div className="cc-firma-botones">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                });
              }}
            >
              <Copy size={13} /> {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <a className="cc-link-wa" href={`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={13} /> Mandar por WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Contrato de comisión y finiquito del cliente, en Word, con las firmas guardadas en el sistema:
 *  - la del cliente y la del titular de la cuenta que recibe: se cargan aquí (subir o dibujar) o se les manda un link
 *    para que firmen desde el teléfono; quedan guardadas a su nombre para los próximos contratos;
 *  - la de la empresa: una sola, se repite en todos.
 * Cada contrato generado queda guardado en el módulo Contratos (se puede volver a descargar).
 */
export function ContratoClienteModal({ cuenta, onCerrar }: { cuenta: CuentaCorrienteResumen; onCerrar: () => void }) {
  const terceroId = cuenta.tercero_id;
  const [cliente, setCliente] = useState<Parte>(() => ({
    ...PARTE_VACIA,
    ...leerGuardado<Parte>(claveCliente(terceroId)),
    nombre: cuenta.tercero_nombre,
    cedula: cuenta.tercero_identificacion ?? leerGuardado<Parte>(claveCliente(terceroId)).cedula ?? "",
  }));
  const [empresa, setEmpresa] = useState<Parte>(() => ({ ...PARTE_VACIA, ...leerGuardado<Parte>(CLAVE_EMPRESA) }));
  const [conFiniquito, setConFiniquito] = useState(true);
  const [movimientos, setMovimientos] = useState<MovimientoCC[] | null>(null);
  const [movId, setMovId] = useState<number | "">("");
  const [f, setF] = useState({ referencia: "", bolivares: "", tasaVesUsdt: "", tasaUsdtCop: "", hash: "", subtotal: "", comisionPct: "", bancarias: "", titular: "", numeroCuenta: "", referenciaPago: "", estadoPago: "Exitosa / Completada", contacto: cuenta.tercero_telefono ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  // ---------- las firmas (en el sistema) ----------
  const [firmaCliente, setFirmaCliente] = useState<Firma | null>(null);
  const [firmaEmpresa, setFirmaEmpresa] = useState<Firma | null>(null);
  const [titulares, setTitulares] = useState<Firma[]>([]);
  const [links, setLinks] = useState<LinkFirma[]>([]);
  // el titular de la cuenta que recibe: uno ya guardado (su id), uno nuevo, o nadie (recibe el mismo cliente)
  const [titularElegido, setTitularElegido] = useState<number | "nuevo" | "">("");
  const [nuevo, setNuevo] = useState({ nombre: "", cedula: "", numeroCuenta: "", banco: "Bancolombia" });
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargarFirmas = useCallback(async () => {
    const [deCliente, deEmpresa, susLinks] = await Promise.all([contratosApi.firmas({ terceroId }), contratosApi.firmas({ tipo: "EMPRESA" }), contratosApi.links({ terceroId })]);
    setFirmaCliente(deCliente.find((x) => x.tipo === "CLIENTE") ?? null);
    setTitulares(deCliente.filter((x) => x.tipo === "TITULAR"));
    setFirmaEmpresa(deEmpresa[0] ?? null);
    setLinks(susLinks);
    return susLinks;
  }, [terceroId]);
  useEffect(() => {
    cargarFirmas().catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar las firmas."));
  }, [cargarFirmas]);
  // mientras haya un link sin firmar, se mira cada 10 s si ya firmaron
  const hayPendiente = links.some((l) => l.estado === "PENDIENTE");
  useEffect(() => {
    if (!hayPendiente) return;
    const t = setInterval(() => void cargarFirmas().catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, [hayPendiente, cargarFirmas]);
  const linkCliente = links.find((l) => l.tipo === "CLIENTE" && l.estado !== "VENCIDO") ?? null;
  const titular = typeof titularElegido === "number" ? (titulares.find((t) => t.id === titularElegido) ?? null) : null;
  const linkNuevoTitular =
    titularElegido === "nuevo" && soloDigitos(nuevo.cedula)
      ? (links.find((l) => l.tipo === "TITULAR" && soloDigitos(l.cedula) === soloDigitos(nuevo.cedula) && l.estado !== "VENCIDO") ?? null)
      : null;
  // el nuevo titular firmó por el link: queda elegido
  useEffect(() => {
    if (titularElegido !== "nuevo" || !linkNuevoTitular?.firma_id) return;
    if (titulares.some((t) => t.id === linkNuevoTitular.firma_id)) setTitularElegido(linkNuevoTitular.firma_id);
  }, [titularElegido, linkNuevoTitular, titulares]);
  // el titular elegido completa los datos del pago en el finiquito
  useEffect(() => {
    if (titular) setF((x) => ({ ...x, titular: titular.nombre, numeroCuenta: titular.numero_cuenta ?? x.numeroCuenta }));
  }, [titular]);

  async function pedirLink(tipo: "CLIENTE" | "TITULAR") {
    setError(null);
    if (tipo === "TITULAR" && (nuevo.nombre.trim().split(/\s+/).length < 2 || !soloDigitos(nuevo.cedula)))
      return setError("Para el link del titular escribí primero su nombre y apellido y su cédula.");
    setOcupado(`link-${tipo}`);
    try {
      await contratosApi.crearLink(tipo === "CLIENTE" ? { tipo, terceroId } : { tipo, terceroId, nombre: nuevo.nombre.trim(), cedula: nuevo.cedula.trim(), numeroCuenta: nuevo.numeroCuenta.trim() || null, banco: nuevo.banco.trim() || null });
      await cargarFirmas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el link.");
    } finally {
      setOcupado(null);
    }
  }

  /** Una firma cargada aquí (subida o dibujada): queda guardada en el sistema. */
  async function guardarFirmaDe(tipo: "CLIENTE" | "TITULAR" | "EMPRESA", imagen: string | null, actual: Firma | null) {
    setError(null);
    try {
      if (!imagen) {
        if (actual) await contratosApi.quitarFirma(actual.id);
      } else if (tipo === "CLIENTE") {
        if (!cliente.nombre.trim()) return setError("Falta el nombre del cliente.");
        await contratosApi.guardarFirma({ tipo, terceroId, nombre: cliente.nombre.trim(), cedula: cliente.cedula.trim() || null, imagen });
      } else if (tipo === "EMPRESA") {
        if (empresa.nombre.trim().length < 3) return setError("Escribí primero el nombre de quien firma por la empresa.");
        await contratosApi.guardarFirma({ tipo, nombre: empresa.nombre.trim(), cedula: empresa.cedula.trim() || null, imagen });
      } else {
        const t = titular ?? { nombre: nuevo.nombre, cedula: nuevo.cedula, numero_cuenta: nuevo.numeroCuenta, banco: nuevo.banco };
        if (t.nombre.trim().split(/\s+/).length < 2 || !soloDigitos(t.cedula)) return setError("Escribí el nombre y la cédula del titular antes de cargar su firma.");
        const guardada = await contratosApi.guardarFirma({ tipo, terceroId, nombre: t.nombre.trim(), cedula: t.cedula?.trim() || null, numeroCuenta: t.numero_cuenta?.trim() || null, banco: t.banco?.trim() || null, imagen });
        await cargarFirmas();
        setTitularElegido(guardada.id);
        return;
      }
      await cargarFirmas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la firma.");
    }
  }

  // ---------- la operación del finiquito ----------
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
    const enBs = /bol[ií]var|bs\b|pago m[oó]vil/i.test(m.descripcion ?? "") || cuenta.canal_nombre === "BOLIVARES";
    setF((x) => ({ ...x, referencia: partes[1] ?? "", bolivares: enBs && m.cantidad_base ? bonito(Number(m.cantidad_base)) : "", subtotal: cuenta.moneda_codigo === "COP" ? bonito(Number(m.monto), 0) : "" }));
  }
  const mov = movimientos?.find((m) => m.id === movId) ?? null;

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
    if (titularElegido === "nuevo") return setError("El titular nuevo todavía no firmó: mandale el link, cargá su firma, o elegí 'Recibe el mismo cliente'.");
    guardar(CLAVE_EMPRESA, empresa);
    guardar(claveCliente(terceroId), { rif: cliente.rif, ciudad: cliente.ciudad, municipio: cliente.municipio, estado: cliente.estado, cedula: cliente.cedula });
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
    const datosTitular = titular ? { nombre: titular.nombre, cedula: titular.cedula ?? "" } : null;
    setGenerando(true);
    try {
      // queda guardado en el módulo Contratos, con las firmas que llevó
      await contratosApi.guardarContrato({
        terceroId,
        numero: finiquito?.numero ?? null,
        clienteNombre: cliente.nombre.trim(),
        titularNombre: titular?.nombre ?? null,
        datos: { comitente: cliente, comisionista: empresa, titular: datosTitular, finiquito },
        firmaClienteId: firmaCliente?.id ?? null,
        firmaTitularId: titular?.id ?? null,
        firmaEmpresaId: firmaEmpresa?.id ?? null,
      });
      await descargarContrato(
        {
          comitente: cliente,
          comisionista: empresa,
          titular: datosTitular,
          firmaComitente: await firmaParaWord(firmaCliente?.imagen ?? null),
          firmaComisionista: await firmaParaWord(firmaEmpresa?.imagen ?? null),
          firmaTitular: await firmaParaWord(titular?.imagen ?? null),
          finiquito,
        },
        `Contrato ${cliente.nombre.trim()}${finiquito ? ` - ${finiquito.numero}` : ""}.docx`
      );
      onCerrar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo armar el documento.");
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
            {campoParte(empresa, setEmpresa, "estado", "Estado", "Táchira")}
          </div>
        </fieldset>

        <fieldset>
          <legend>
            Las firmas (quedan guardadas en el sistema)
            <button type="button" className="cc-firmas-actualizar" onClick={() => void cargarFirmas()} title="Ver si ya firmaron por el link">
              <RefreshCw size={12} /> Actualizar
            </button>
          </legend>
          <div className="cc-firmas cc-firmas-3">
            {/* el cliente */}
            <div className="cc-firma-col">
              <FirmaControl
                titulo="Firma del cliente"
                valor={firmaCliente?.imagen ?? null}
                onCambio={(v) => void guardarFirmaDe("CLIENTE", v, firmaCliente)}
                ayuda={firmaCliente ? `Guardada el ${new Date(firmaCliente.created_at).toLocaleDateString("es-CO")}${firmaCliente.origen === "LINK" ? " (firmó por el link)" : ""}` : "O mandale el link para que firme desde su teléfono."}
              />
              {!firmaCliente &&
                (linkCliente ? (
                  <CajaLink link={linkCliente} telefono={cuenta.tercero_telefono} para={cuenta.tercero_nombre} />
                ) : (
                  <button type="button" className="cc-pedir-link" onClick={() => void pedirLink("CLIENTE")} disabled={ocupado === "link-CLIENTE"}>
                    <Link2 size={13} /> Link para que firme el cliente
                  </button>
                ))}
            </div>
            {/* el titular de la cuenta que recibe */}
            <div className="cc-firma-col">
              <label className="cc-titular-elegir">
                Titular de la cuenta que recibe
                <select value={titularElegido} onChange={(e) => setTitularElegido(e.target.value === "nuevo" ? "nuevo" : e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Recibe el mismo cliente (sin titular aparte)</option>
                  {titulares.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} · C.I. {t.cedula}
                      {t.numero_cuenta ? ` · cta. ${t.numero_cuenta}` : ""}
                    </option>
                  ))}
                  <option value="nuevo">+ Otro titular (nuevo)</option>
                </select>
              </label>
              {titular && <FirmaControl titulo={`Firma de ${titular.nombre}`} valor={titular.imagen} onCambio={(v) => void guardarFirmaDe("TITULAR", v, titular)} ayuda="Guardada: se usa en sus contratos." />}
              {titularElegido === "nuevo" && (
                <div className="cc-titular-nuevo">
                  <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre y apellido del titular" aria-label="Nombre del titular" />
                  <input value={nuevo.cedula} onChange={(e) => setNuevo({ ...nuevo, cedula: e.target.value })} placeholder="Cédula" inputMode="numeric" aria-label="Cédula del titular" />
                  <input value={nuevo.numeroCuenta} onChange={(e) => setNuevo({ ...nuevo, numeroCuenta: e.target.value })} placeholder="Número de cuenta (opcional)" inputMode="numeric" aria-label="Cuenta del titular" />
                  <FirmaControl titulo="Firma del titular" valor={null} onCambio={(v) => void guardarFirmaDe("TITULAR", v, null)} />
                  {linkNuevoTitular ? (
                    <CajaLink link={linkNuevoTitular} para={nuevo.nombre} />
                  ) : (
                    <button type="button" className="cc-pedir-link" onClick={() => void pedirLink("TITULAR")} disabled={ocupado === "link-TITULAR"}>
                      <Link2 size={13} /> Link para que firme el titular
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* la empresa */}
            <div className="cc-firma-col">
              <FirmaControl titulo="Firma de la empresa" valor={firmaEmpresa?.imagen ?? null} onCambio={(v) => void guardarFirmaDe("EMPRESA", v, firmaEmpresa)} ayuda="Una sola: se repite en todos los contratos." />
            </div>
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
                    {fechaHora(m.fecha)} · {m.descripcion ?? "Operación"} · {bonito(Number(m.monto), 0)} {cuenta.moneda_codigo}
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
            <FileText size={15} /> {generando ? "Armando…" : "Guardar y descargar Word"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
