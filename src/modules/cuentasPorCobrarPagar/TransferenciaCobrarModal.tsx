import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, ClipboardPaste, MessageCircle, UserCheck, UserPlus, X } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { EnviarReportePorVinculado } from "../../components/whatsapp/EnviarReportePorVinculado";
import { ApiError } from "../../api/client";
import { crearCuentaCorriente, getEstadoCuenta, registrarMovimientoCC, subirComprobanteMovimiento, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import type { Moneda } from "../../api/monedas.api";
import { leerNumero } from "../../utils/montos";
import { alAbrirWhatsApp, enlaceWhatsApp, telefonoWhatsApp } from "../../utils/whatsapp";
import { compartirImagen, copiarImagen, descargarBlob, generarImagenReporte } from "../cuentasCorrientes/imagenReporte";
import { leerComprobante } from "../cuentasCorrientes/ocrComprobante";
import { imagenDelPortapapeles, traeImagen } from "../whatsapp/utilidades";
import { SIN_GRUPO, dinero, fechaDeHoy, grupoDe } from "./cobrar";
import { conPuntos } from "./NuevoClienteCobrarModal";

const NUEVO = "__nuevo__";
const METODOS = ["Bancolombia", "Nequi", "Zelle", "Daviplata", "Efectivo", "Otro"];
// En qué moneda fue la transferencia: en esa misma se lleva la cuenta del cliente
const MONEDAS_TRANSFERENCIA = [
  { codigo: "COP", nombre: "Pesos" },
  { codigo: "USD", nombre: "Dólares" },
  { codigo: "VES", nombre: "Bolívares" },
];
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const sinAcentos = (t: string) => t.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Le hicimos una transferencia a alguien y nos la queda debiendo: se pega la captura (Ctrl+V), se lee el monto, la
 * referencia y a quién se le hizo, se elige el cliente (o se crea con su teléfono), el método de pago, y queda
 * anotado en su cuenta por cobrar con la captura guardada. Al terminar sale el reporte del cliente para compartirlo.
 */
export function TransferenciaCobrarModal({
  cuentas,
  grupos,
  monedas,
  onRegistrada,
  onAbrirHoja,
  onCerrar,
}: {
  cuentas: CuentaCorrienteResumen[];
  grupos: string[];
  monedas: Moneda[];
  onRegistrada: () => void;
  onAbrirHoja: (cuentaId: number) => void;
  onCerrar: () => void;
}) {
  const elegibles = grupos.filter((g) => g !== SIN_GRUPO);

  // ---- la captura ----
  const [captura, setCaptura] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  // ---- los datos ----
  const [nombre, setNombre] = useState("");
  const [elegida, setElegida] = useState<CuentaCorrienteResumen | null>(null); // el cliente que ya existe
  const [telefono, setTelefono] = useState("");
  const [grupo, setGrupo] = useState(elegibles.find((g) => g === "Préstamos") ?? elegibles[0] ?? NUEVO);
  const [grupoNuevo, setGrupoNuevo] = useState("");
  const [monto, setMonto] = useState("");
  const [monedaElegida, setMonedaElegida] = useState("COP"); // pesos, dólares o bolívares
  const [metodo, setMetodo] = useState(METODOS[0]!);
  const [otroMetodo, setOtroMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- al terminar: el reporte del cliente para compartir ----
  const [hecho, setHecho] = useState<{ cuenta: CuentaCorrienteResumen; blob: Blob; url: string; mensaje: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!captura) return setVista(null);
    const url = URL.createObjectURL(captura);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [captura]);

  // Los clientes que ya están en Cuentas por Cobrar y coinciden con lo escrito
  const sugeridos = useMemo(() => {
    const q = sinAcentos(nombre);
    if (q.length < 2 || elegida) return [];
    return cuentas.filter((c) => sinAcentos(c.tercero_nombre).includes(q)).slice(0, 5);
  }, [cuentas, nombre, elegida]);
  // El cliente que ya existe lleva su cuenta en una moneda: la transferencia va en esa. El nuevo, en la que se elija.
  const monedaCodigo = elegida ? elegida.moneda_codigo : monedaElegida;
  const monedaNueva = monedas.find((m) => m.codigo === monedaElegida);

  async function cargarCaptura(imagen: File) {
    setCaptura(imagen);
    setError(null);
    setAvisoLectura(null);
    setLeyendo(true);
    try {
      const d = await leerComprobante(imagen);
      const leido: string[] = [];
      if (d.monto) {
        setMonto(conPuntos(d.monto.replace(".", ",")));
        leido.push("el monto");
      }
      if (d.referencia) {
        setReferencia(d.referencia);
        leido.push("la referencia");
      }
      // a quién se le transfirió: se propone como cliente si todavía no se escribió ninguno
      if (d.destinatario && !nombre.trim() && !elegida) {
        setNombre(d.destinatario);
        leido.push("a quién se le hizo");
      }
      if (!elegida && d.moneda && MONEDAS_TRANSFERENCIA.some((m) => m.codigo === d.moneda)) setMonedaElegida(d.moneda);
      const banco = d.banco && METODOS.find((m) => sinAcentos(m) === sinAcentos(d.banco!));
      if (banco) setMetodo(banco);
      setAvisoLectura(leido.length ? `Leí ${leido.join(", ")}. Revisalo antes de registrar.` : "No pude leer los datos de la captura: quedó adjunta, escribilos a mano.");
    } catch {
      setAvisoLectura("No pude leer la captura: quedó adjunta, escribí los datos a mano.");
    } finally {
      setLeyendo(false);
    }
  }

  // Pegar la captura con Ctrl+V en cualquier parte de la ventana
  const cargarRef = useRef(cargarCaptura);
  cargarRef.current = cargarCaptura;
  const terminado = !!hecho;
  useEffect(() => {
    if (terminado) return;
    const alPegar = (e: ClipboardEvent) => {
      if (!traeImagen(e.clipboardData)) return;
      e.preventDefault();
      void imagenDelPortapapeles(e.clipboardData).then((imagen) => {
        if (imagen) void cargarRef.current(imagen);
      });
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [terminado]);

  function elegir(c: CuentaCorrienteResumen) {
    setElegida(c);
    setNombre(c.tercero_nombre);
    setTelefono(c.tercero_telefono ?? "");
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const nMonto = leerNumero(monto)?.replace(/^-/, "") ?? null;
    const metodoFinal = metodo === "Otro" ? otroMetodo.trim() : metodo;
    const grupoFinal = grupo === NUEVO ? grupoNuevo.trim() : grupo;
    if (nombre.trim().length < 2) return setError("Escribí el nombre del cliente al que se le hizo la transferencia.");
    if (!nMonto || !/[1-9]/.test(nMonto)) return setError("Escribí el monto de la transferencia.");
    if (!metodoFinal) return setError("Escribí el método de pago.");
    if (!elegida && !grupoFinal) return setError("Escribí el nombre del grupo nuevo.");
    if (!elegida && !monedaNueva) return setError("Esa moneda no está disponible. Elegí otra.");
    // mismo nombre que un cliente que ya está: es ese (no se crea dos veces)
    const existente = elegida ?? cuentas.find((c) => sinAcentos(c.tercero_nombre) === sinAcentos(nombre)) ?? null;
    // ...pero si su cuenta se lleva en otra moneda que la elegida, se muestra antes de anotar nada
    if (!elegida && existente && existente.moneda_codigo !== monedaElegida) {
      elegir(existente);
      return setError(`${existente.tercero_nombre} ya está en Cuentas por Cobrar y su cuenta se lleva en ${existente.moneda_codigo}. Revisá el monto en esa moneda y volvé a registrar.`);
    }
    setEnviando(true);
    try {
      const cuenta =
        existente ??
        (await crearCuentaCorriente({
          nuevoTercero: { nombre: nombre.trim(), tipo: "CLIENTE", telefono: telefono.trim() || undefined },
          modulo: "POR_COBRAR",
          grupoCobro: grupoFinal,
          monedaId: monedaNueva!.id,
        }));
      const creado = await registrarMovimientoCC({
        terceroId: cuenta.tercero_id,
        canalId: cuenta.canal_id,
        monedaId: cuenta.moneda_id,
        tipo: "CARGO",
        monto: nMonto,
        descripcion: `${metodoFinal === "Efectivo" ? "Entrega en efectivo" : `Transferencia ${metodoFinal}`}${referencia.trim() ? ` · ${referencia.trim()}` : ""}`,
      });
      // la captura queda guardada con el movimiento; si falla la subida, el movimiento igual quedó
      if (captura) await subirComprobanteMovimiento(creado.movimiento.id, captura).catch(() => setError("El movimiento quedó registrado, pero no se pudo guardar la captura."));
      onRegistrada();
      const hoy = hoyBogota();
      const estado = await getEstadoCuenta(cuenta.id, { desde: hoy, hasta: hoy });
      const blob = await generarImagenReporte(estado, cuenta.moneda_codigo === "COP" ? "$" : "", `Movimientos del día ${fechaDeHoy()}`);
      const saldo = dinero(estado.saldoFinal.replace(/^-/, ""), cuenta.moneda_codigo);
      const mensaje =
        `Estimado(a) ${cuenta.tercero_nombre}, le informamos que le realizamos ${metodoFinal === "Efectivo" ? "una entrega en efectivo" : `una transferencia por ${metodoFinal}`} de ${dinero(nMonto, cuenta.moneda_codigo)}` +
        `${referencia.trim() ? ` (Ref: ${referencia.trim()})` : ""}.\n\nSu saldo pendiente por pagar al ${fechaDeHoy()} es de ${saldo}.`;
      setCopiado(false);
      setHecho({ cuenta: { ...cuenta, tercero_telefono: cuenta.tercero_telefono ?? (telefono.trim() || null) }, blob, url: URL.createObjectURL(blob), mensaje });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message || "No se pudo registrar la transferencia.");
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    if (hecho) URL.revokeObjectURL(hecho.url);
    onCerrar();
  }

  // ---------- Paso 2: quedó registrada, se comparte el reporte ----------
  if (hecho) {
    const tel = telefonoWhatsApp(hecho.cuenta.tercero_telefono);
    const nombreArchivo = `reporte-${hecho.cuenta.tercero_nombre.replace(/\s+/g, "-").toLowerCase()}-${hoyBogota()}.png`;
    return (
      <Modal titulo="Transferencia registrada" ancho="ancho" onCerrar={cerrar}>
        <div className="cc-reporte cxc-transf-hecho">
          <p className="cxc-transf-ok">
            <CheckCircle2 size={18} /> Quedó en la cuenta por cobrar de <b>{hecho.cuenta.tercero_nombre}</b>. Este es su reporte para compartirlo:
          </p>
          {error && <p className="cc-form-error">{error}</p>}
          <div className="cc-reporte-acciones">
            <button
              type="button"
              className="cc-guardar"
              onClick={() =>
                copiarImagen(hecho.blob)
                  .then(() => setCopiado(true))
                  .catch(() => setError("Este navegador no deja copiar la imagen: usá Descargar."))
              }
            >
              {copiado ? "Copiada: pegala en WhatsApp (Ctrl+V)" : "Copiar reporte"}
            </button>
            <button
              type="button"
              className="cc-btn-secundario"
              onClick={async () => {
                // en el teléfono abre el menú de compartir; en el computador se descarga
                if (!(await compartirImagen(hecho.blob, nombreArchivo))) descargarBlob(hecho.blob, nombreArchivo);
              }}
            >
              Compartir / Descargar
            </button>
            <a className="cc-whatsapp cxc-transf-wa" href={enlaceWhatsApp(tel, hecho.mensaje)} onClick={(e) => alAbrirWhatsApp(e, tel, hecho.mensaje)} target="_blank" rel="noreferrer" title={tel ? "Abre WhatsApp con el mensaje escrito; el reporte se pega con Ctrl+V" : "Sin teléfono: al abrir WhatsApp elegís el contacto"}>
              <MessageCircle size={14} /> Abrir su WhatsApp
            </a>
            {/* Desde uno de los WhatsApp vinculados al sistema: sale el reporte con el mensaje, sin abrir nada */}
            {tel && <EnviarReportePorVinculado telefono={tel} nombre={hecho.cuenta.tercero_nombre} imagen={hecho.blob} nombreArchivo={nombreArchivo} texto={hecho.mensaje} monedaCodigo={hecho.cuenta.moneda_codigo} />}
            <button
              type="button"
              className="cc-btn-secundario"
              onClick={() => {
                const id = hecho.cuenta.id;
                cerrar();
                onAbrirHoja(id);
              }}
            >
              Ver su hoja
            </button>
          </div>
          <img src={hecho.url} alt={`Reporte de ${hecho.cuenta.tercero_nombre}`} />
        </div>
      </Modal>
    );
  }

  // ---------- Paso 1: la captura y los datos ----------
  return (
    <Modal titulo="Registrar transferencia por cobrar" onCerrar={cerrar}>
      <form className="cc-modal cxc-form cxc-transf" onSubmit={guardar}>
        <input
          ref={archivo}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void cargarCaptura(f);
            e.target.value = "";
          }}
        />
        {vista ? (
          <div className="cxc-transf-captura">
            <img src={vista} alt="Captura de la transferencia" />
            <div>
              <strong>{leyendo ? "Leyendo la captura…" : "Captura adjunta"}</strong>
              {avisoLectura && <span>{avisoLectura}</span>}
              <button type="button" className="cc-btn-secundario" onClick={() => archivo.current?.click()} disabled={leyendo}>
                Cambiar
              </button>
            </div>
            <button
              type="button"
              className="cxc-transf-quitar"
              onClick={() => {
                setCaptura(null);
                setAvisoLectura(null);
              }}
              aria-label="Quitar la captura"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button type="button" className="cxc-transf-soltar" onClick={() => archivo.current?.click()}>
            <ClipboardPaste size={22} />
            <strong>Pegá la captura de la transferencia (Ctrl+V)</strong>
            <span>
              <Camera size={13} /> o tocá acá para elegir la imagen. Se lee el monto, la referencia y a quién se le hizo.
            </span>
          </button>
        )}

        <label>
          Cliente (a quién se le hizo)
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setElegida(null);
            }}
            placeholder="Nombre del cliente"
            autoComplete="off"
            autoFocus
          />
          {elegida ? (
            <small className="cxc-transf-cliente si">
              <UserCheck size={13} /> Ya está en Cuentas por Cobrar ({grupoDe(elegida)}) · debe {dinero(elegida.saldo_actual, elegida.moneda_codigo)}. Se le suma esta transferencia.
            </small>
          ) : (
            nombre.trim().length >= 2 &&
            sugeridos.length === 0 && (
              <small className="cxc-transf-cliente">
                <UserPlus size={13} /> Cliente nuevo: se agrega a Cuentas por Cobrar.
              </small>
            )
          )}
        </label>
        {sugeridos.length > 0 && (
          <div className="cxc-transf-sugeridos" role="listbox" aria-label="Clientes que ya están en Cuentas por Cobrar">
            <span>¿Es uno de estos? Tocalo para sumarle la transferencia:</span>
            {sugeridos.map((c) => (
              <button type="button" key={c.id} onClick={() => elegir(c)}>
                <b>{c.tercero_nombre}</b>
                <i>
                  {grupoDe(c)} · {dinero(c.saldo_actual, c.moneda_codigo)}
                </i>
              </button>
            ))}
          </div>
        )}

        {!elegida && (
          <>
            <label>
              Teléfono (para compartirle el reporte por WhatsApp)
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="ej. 314 349 8481" inputMode="tel" autoComplete="off" />
            </label>
            <label>
              Grupo
              <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                {elegibles.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                <option value={NUEVO}>+ Crear un grupo nuevo…</option>
              </select>
            </label>
            {grupo === NUEVO && (
              <label>
                Nombre del grupo nuevo
                <input value={grupoNuevo} onChange={(e) => setGrupoNuevo(e.target.value)} placeholder="ej. Proveedores" maxLength={60} autoComplete="off" />
              </label>
            )}
          </>
        )}

        <div className="cxc-transf-metodo">
          <span>Moneda de la transferencia</span>
          {elegida ? (
            <small>La cuenta de {elegida.tercero_nombre} se lleva en {MONEDAS_TRANSFERENCIA.find((m) => m.codigo === elegida.moneda_codigo)?.nombre.toLowerCase() ?? elegida.moneda_codigo}: la transferencia se anota en esa moneda.</small>
          ) : (
            <>
              <div className="cc-chips" role="radiogroup" aria-label="Moneda de la transferencia">
                {MONEDAS_TRANSFERENCIA.filter((m) => monedas.some((x) => x.codigo === m.codigo)).map((m) => (
                  <button type="button" key={m.codigo} role="radio" aria-checked={monedaElegida === m.codigo} className={monedaElegida === m.codigo ? "activo" : ""} onClick={() => setMonedaElegida(m.codigo)}>
                    {m.nombre}
                  </button>
                ))}
              </div>
              <small>En esta moneda se lleva la contabilidad del cliente.</small>
            </>
          )}
        </div>
        <div className="cxc-form-fila">
          <label>
            Monto transferido ({monedaCodigo})
            <input value={monto} onChange={(e) => setMonto(conPuntos(e.target.value))} inputMode="decimal" placeholder="ej. 100.000" autoComplete="off" />
          </label>
          <label>
            Referencia de la transferencia
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Número de comprobante" autoComplete="off" />
          </label>
        </div>

        <div className="cxc-transf-metodo">
          <span>Método de pago</span>
          <div className="cc-chips" role="radiogroup" aria-label="Método de pago">
            {METODOS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={metodo === m} className={metodo === m ? "activo" : ""} onClick={() => setMetodo(m)}>
                {m}
              </button>
            ))}
          </div>
          {metodo === "Otro" && <input value={otroMetodo} onChange={(e) => setOtroMetodo(e.target.value)} placeholder="¿Cuál? ej. Banco de Bogotá" maxLength={40} autoComplete="off" aria-label="Otro método de pago" />}
        </div>

        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={cerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando || leyendo}>
            {enviando ? "Registrando…" : "Registrar y ver el reporte"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
