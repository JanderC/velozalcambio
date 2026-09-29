import { useCallback, useEffect, useMemo, useState, type ClipboardEvent, type DragEvent } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Banknote,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  FileText,
  Hash,
  Info,
  Landmark,
  Loader2,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
  ZoomIn,
} from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { useAuth } from "../../auth/useAuth";
import { ApiError } from "../../api/client";
import {
  confirmarSolicitud,
  getDetalleSolicitud,
  rechazarSolicitud,
  type DetalleSolicitud,
  type DocumentoSolicitud,
  type PataSolicitud,
} from "../../api/transacciones.api";
import { getArchivoDocumento, subirDocumentoTercero, TAMANO_MAXIMO_DOCUMENTO_MB } from "../../api/documentosTercero.api";
import { SubirDocumentoForm } from "../documentosCliente/SubirDocumentoForm";
import { antiguedadTexto, formatearMonto, infoTipo, minutosDesde, montoQueCoincide, nombreLegible } from "./flujo";

const MOTIVOS_RECHAZO = [
  "El pago no llegó al banco",
  "El monto recibido no coincide",
  "La referencia no coincide",
  "Captura ilegible o sospechosa",
  "Los datos del cliente no coinciden",
  "Solicitud duplicada",
];

const ESTADO_VERIFICACION: Record<string, { texto: string; clase: string }> = {
  VERIFICADO: { texto: "Identidad verificada", clase: "ok" },
  PENDIENTE_REVISION: { texto: "Documentos en revisión", clase: "atencion" },
  NO_VERIFICADO: { texto: "Identidad no verificada", clase: "urgente" },
  SIN_DOCUMENTOS: { texto: "Sin documentos de identidad", clase: "urgente" },
};

function BotonCopiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="rev-copiar"
      title="Copiar"
      onClick={() => {
        navigator.clipboard?.writeText(valor).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        });
      }}
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function Dato({ etiqueta, valor, copiable }: { etiqueta: string; valor: string | null | undefined; copiable?: boolean }) {
  if (!valor) return null;
  return (
    <div className="rev-dato">
      <span>{etiqueta}</span>
      <strong>
        {valor}
        {copiable && <BotonCopiar valor={valor} />}
      </strong>
    </div>
  );
}

// ---------- Una pata: lo que entra o sale, dónde y cómo queda la caja ----------
function TarjetaPata({ pata }: { pata: PataSolicitud }) {
  const entra = pata.tipo === "INGRESO";
  const esBanco = pata.caja.tipo === "BANCO";
  const problema = !pata.turnoAbierto || !pata.saldoSuficiente;
  return (
    <div className={`rev-pata ${entra ? "rev-pata-entra" : "rev-pata-sale"}${problema ? " rev-pata-problema" : ""}`}>
      <div className="rev-pata-cabecera">
        <span className="rev-pata-etiqueta">
          {entra ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
          {entra ? "Entra" : "Sale"}
        </span>
        <span className="rev-pata-medio">
          {esBanco ? <Landmark size={14} /> : <Banknote size={14} />} {esBanco ? "Transferencia" : "Efectivo"}
        </span>
      </div>
      <div className="rev-pata-monto">
        {formatearMonto(pata.monto, pata.decimales)} <small>{pata.monedaCodigo}</small>
      </div>
      <div className="rev-pata-caja">{entra ? "a" : "desde"} <strong>{pata.caja.nombre}</strong></div>
      {esBanco && (pata.caja.banco || pata.caja.numeroCuenta || pata.caja.titular) && (
        <div className="rev-pata-banco">
          <Dato etiqueta="Banco" valor={pata.caja.banco} />
          <Dato etiqueta="Cuenta" valor={pata.caja.numeroCuenta} copiable />
          <Dato etiqueta="Titular" valor={pata.caja.titular} />
          <Dato etiqueta="Teléfono" valor={pata.caja.telefono} copiable />
        </div>
      )}
      <div className="rev-pata-saldo">
        <span>Saldo {pata.monedaCodigo}</span>
        <span>
          {formatearMonto(pata.saldoActual, pata.decimales)} → <strong className={pata.saldoSuficiente ? "" : "rev-negativo"}>{formatearMonto(pata.saldoDespues, pata.decimales)}</strong>
        </span>
      </div>
      <div className={`rev-pata-turno ${pata.turnoAbierto ? "ok" : "mal"}`}>
        {pata.turnoAbierto ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
        {pata.turnoAbierto ? "Turno abierto" : "Sin turno abierto: no se podrá confirmar"}
      </div>
    </div>
  );
}

// ---------- Comprobantes: vista previa, ampliar, adjuntar, pegar o arrastrar ----------
function Comprobantes({
  detalle,
  onCambio,
}: {
  detalle: DetalleSolicitud;
  onCambio: () => void;
}) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [ampliada, setAmpliada] = useState<DocumentoSolicitud | null>(null);
  const [zoom, setZoom] = useState(false);
  const [subiendoForm, setSubiendoForm] = useState(false);
  const [subiendoRapido, setSubiendoRapido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const terceroId = detalle.cliente?.id;
  const transaccionId = detalle.transaccion.id;

  // Enlaces temporales (5 min) para ver las imágenes
  useEffect(() => {
    let cancelado = false;
    for (const d of detalle.documentos) {
      if (!d.mime_type.startsWith("image/") || urls[d.id]) continue;
      getArchivoDocumento(d.id)
        .then((a) => !cancelado && setUrls((u) => ({ ...u, [d.id]: a.url })))
        .catch(() => undefined);
    }
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalle.documentos]);

  async function subirRapido(archivo: File, origen: string) {
    if (!terceroId) return setError("La operación no tiene cliente: no se puede adjuntar el comprobante.");
    if (!archivo.type.startsWith("image/") && archivo.type !== "application/pdf") return setError("Solo imágenes o PDF.");
    if (archivo.size > TAMANO_MAXIMO_DOCUMENTO_MB * 1024 * 1024) return setError(`El archivo supera ${TAMANO_MAXIMO_DOCUMENTO_MB} MB.`);
    setError(null);
    setSubiendoRapido(true);
    try {
      await subirDocumentoTercero(terceroId, { archivo, tipo: "COMPROBANTE_PAGO", transaccionId, descripcion: origen });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir el comprobante.");
    } finally {
      setSubiendoRapido(false);
    }
  }

  function alPegar(e: ClipboardEvent<HTMLDivElement>) {
    const archivo = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (archivo) {
      e.preventDefault();
      subirRapido(archivo, "Captura pegada en la bandeja");
    }
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const archivo = e.dataTransfer.files[0];
    if (archivo) subirRapido(archivo, "Captura arrastrada a la bandeja");
  }

  async function abrirPdf(d: DocumentoSolicitud) {
    try {
      const a = await getArchivoDocumento(d.id);
      window.open(a.url, "_blank", "noopener");
    } catch {
      setError("No se pudo abrir el archivo.");
    }
  }

  return (
    <section className="rev-seccion">
      <h4><Paperclip size={15} /> Captura y comprobantes</h4>

      {detalle.documentos.length > 0 && (
        <div className="rev-galeria">
          {detalle.documentos.map((d) =>
            d.mime_type.startsWith("image/") ? (
              <button key={d.id} type="button" className="rev-miniatura" onClick={() => setAmpliada(d)} title="Ver en grande">
                {urls[d.id] ? <img src={urls[d.id]} alt={d.nombre_original} /> : <Loader2 size={20} className="rev-girando" />}
                <span className="rev-miniatura-zoom"><ZoomIn size={14} /></span>
              </button>
            ) : (
              <button key={d.id} type="button" className="rev-miniatura rev-miniatura-pdf" onClick={() => abrirPdf(d)} title="Abrir PDF">
                <FileText size={26} />
                <span>{d.nombre_original}</span>
              </button>
            )
          )}
        </div>
      )}

      {terceroId ? (
        <div
          className={`rev-soltar${arrastrando ? " rev-soltar-activo" : ""}`}
          tabIndex={0}
          onPaste={alPegar}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={alSoltar}
        >
          {subiendoRapido ? (
            <span><Loader2 size={16} className="rev-girando" /> Subiendo comprobante…</span>
          ) : (
            <>
              <span><ClipboardPaste size={16} /> Hacé clic acá y pegá la captura (Ctrl+V), o arrastrala</span>
              <button type="button" className="rev-btn-link" onClick={() => setSubiendoForm((v) => !v)}>
                {subiendoForm ? "Cerrar" : "o elegí un archivo"}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="rev-nota">Operación sin cliente: no se pueden adjuntar comprobantes.</p>
      )}

      {subiendoForm && terceroId && (
        <div className="rev-subir-form">
          <SubirDocumentoForm
            terceroId={terceroId}
            tipoInicial="COMPROBANTE_PAGO"
            transaccionIdInicial={transaccionId}
            onSubido={() => {
              setSubiendoForm(false);
              onCambio();
            }}
            onCancelar={() => setSubiendoForm(false)}
          />
        </div>
      )}
      {error && <p className="rev-error">{error}</p>}

      {ampliada && urls[ampliada.id] && (
        <div className="rev-visor" onClick={() => { setAmpliada(null); setZoom(false); }}>
          <div className="rev-visor-barra" onClick={(e) => e.stopPropagation()}>
            <span>{ampliada.nombre_original} · subida por {ampliada.subido_por_nombre}</span>
            <button type="button" onClick={() => setZoom((z) => !z)}>{zoom ? "Ajustar" : "Tamaño real"}</button>
            <button type="button" onClick={() => { setAmpliada(null); setZoom(false); }} aria-label="Cerrar"><X size={18} /></button>
          </div>
          <div className={`rev-visor-imagen${zoom ? " rev-visor-zoom" : ""}`} onClick={(e) => e.stopPropagation()}>
            <img src={urls[ampliada.id]} alt={ampliada.nombre_original} />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Lista de verificación según lo que entra y sale ----------
function armarChecklist(detalle: DetalleSolicitud): string[] {
  const items: string[] = [];
  const hayEgresoBancario = detalle.patas.some((p) => p.tipo === "EGRESO" && p.caja.tipo === "BANCO");
  for (const p of detalle.patas) {
    const monto = `${formatearMonto(p.monto, p.decimales)} ${p.monedaCodigo}`;
    const banco = p.caja.tipo === "BANCO";
    if (p.tipo === "INGRESO" && banco) items.push(`Verifiqué en ${p.caja.nombre} que ingresaron ${monto}`);
    if (p.tipo === "INGRESO" && !banco) items.push(`Recibí y conté ${monto} en efectivo (${p.caja.nombre})`);
    if (p.tipo === "EGRESO" && banco) items.push(`Transferí ${monto} desde ${p.caja.nombre} al cliente`);
    if (p.tipo === "EGRESO" && !banco) items.push(`Entregué ${monto} en efectivo al cliente`);
  }
  if (detalle.transaccion.referencia_codigo) items.push(`La referencia ${detalle.transaccion.referencia_codigo} coincide con la del banco`);
  if (hayEgresoBancario) {
    items.push(
      detalle.cuentaCliente
        ? `La cuenta destino es de ${detalle.cuentaCliente.titular} y los datos son correctos`
        : "Confirmé con el cliente los datos de la cuenta donde recibe"
    );
  }
  if (detalle.documentos.length > 0) items.push("Revisé la captura / comprobante");
  return items;
}

export function RevisionSolicitudModal({
  solicitudId,
  onCerrar,
  onResuelta,
}: {
  solicitudId: number;
  onCerrar: () => void;
  onResuelta: (mensaje: string, tipo: "ok" | "rechazo") => void;
}) {
  const { usuario } = useAuth();
  const [detalle, setDetalle] = useState<DetalleSolicitud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [montoVerificado, setMontoVerificado] = useState("");
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<"revisar" | "rechazar">("revisar");
  const [motivos, setMotivos] = useState<Set<string>>(new Set());
  const [detalleRechazo, setDetalleRechazo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    getDetalleSolicitud(solicitudId)
      // Siempre primero lo que llega y después lo que se entrega
      .then((d) => setDetalle({ ...d, patas: [...d.patas].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "INGRESO" ? -1 : 1)) }))
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la solicitud."));
  }, [solicitudId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const checklist = useMemo(() => (detalle ? armarChecklist(detalle) : []), [detalle]);

  if (!detalle) {
    return (
      <Modal titulo={`Solicitud #${solicitudId}`} onCerrar={onCerrar} ancho="ancho">
        {error ? <p className="rev-error">{error}</p> : <p className="rev-cargando"><Loader2 size={18} className="rev-girando" /> Cargando la solicitud…</p>}
      </Modal>
    );
  }

  const t = detalle.transaccion;
  const tipo = infoTipo(t.tipo);
  const bloqueantes = detalle.alertas.filter((a) => a.nivel === "bloqueante");
  const esCreador = usuario?.id === t.usuario_id;
  const yaResuelta = t.estado !== "PENDIENTE";
  // El monto a escribir es el de la pata que pasa por un banco: lo que se ve en el extracto
  const pataAVerificar = detalle.patas.find((p) => p.caja.tipo === "BANCO") ?? detalle.patas[0];
  const montoCoincide = pataAVerificar ? montoQueCoincide(montoVerificado, pataAVerificar.monto) : null;
  const checklistCompleto = checklist.every((c) => marcados.has(c));
  const puedeConfirmar = !yaResuelta && !esCreador && bloqueantes.length === 0 && checklistCompleto && montoCoincide !== null && !enviando;

  const esCambio = t.tipo === "COMPRA_DIVISA" || t.tipo === "VENTA_DIVISA";
  const cuentaDelCliente = detalle.cuentaCliente;

  async function confirmar() {
    if (!puedeConfirmar || montoCoincide === null) return;
    setEnviando(true);
    setError(null);
    try {
      await confirmarSolicitud(t.id, { montoVerificado: montoCoincide, checklist: [...marcados], nota: nota.trim() || undefined });
      onResuelta(`Solicitud #${t.id} confirmada. Los saldos ya se actualizaron.`, "ok");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
      cargar();
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar() {
    const motivo = [...motivos, detalleRechazo.trim()].filter(Boolean).join(". ");
    if (!motivo) return setError("Indicá al menos un motivo del rechazo.");
    setEnviando(true);
    setError(null);
    try {
      await rechazarSolicitud(t.id, motivo);
      onResuelta(`Solicitud #${t.id} rechazada. No se movió plata.`, "rechazo");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    } finally {
      setEnviando(false);
    }
  }

  function alternar(conjunto: Set<string>, valor: string, set: (s: Set<string>) => void) {
    const nuevo = new Set(conjunto);
    if (nuevo.has(valor)) nuevo.delete(valor);
    else nuevo.add(valor);
    set(nuevo);
  }

  return (
    <Modal titulo={`Solicitud #${t.id} · ${tipo.etiqueta}`} onCerrar={onCerrar} ancho="ancho">
      <div className="rev">
        {/* ---------- Encabezado ---------- */}
        <div className={`rev-cabecera rev-tipo-${tipo.clase}`}>
          <div>
            <span className={`bdj-tipo bdj-tipo-${tipo.clase}`}>{tipo.corta}</span>
            <p className="rev-explicacion">{tipo.explicacion}</p>
          </div>
          <div className="rev-cabecera-meta">
            <span>Registrada por <strong>{t.creado_por_nombre}</strong></span>
            <span>{new Date(t.created_at).toLocaleString("es-CO")} · {antiguedadTexto(minutosDesde(t.created_at, Date.now()))}</span>
          </div>
        </div>

        {/* ---------- Alertas ---------- */}
        {detalle.alertas.length > 0 && (
          <ul className="rev-alertas">
            {detalle.alertas.map((a) => (
              <li key={a.mensaje} className={`rev-alerta rev-alerta-${a.nivel}`}>
                {a.nivel === "bloqueante" ? <ShieldAlert size={15} /> : a.nivel === "advertencia" ? <AlertTriangle size={15} /> : <Info size={15} />}
                {a.mensaje}
              </li>
            ))}
          </ul>
        )}

        <div className="rev-cuerpo">
          <div className="rev-columna">
            {/* ---------- Flujo del dinero ---------- */}
            <section className="rev-seccion">
              <h4>Flujo del dinero</h4>
              <div className={`rev-patas${detalle.patas.length === 1 ? " rev-patas-una" : ""}`}>
                {detalle.patas.map((p) => <TarjetaPata key={`${p.tipo}-${p.caja.id}`} pata={p} />)}
              </div>
              {esCambio && t.tasa_aplicada && t.monto_destino && (
                <p className="rev-calculo">
                  {t.operacion_calculo === "DIVISION"
                    ? `${formatearMonto(t.monto_destino)} ${t.moneda_destino_codigo} ÷ ${formatearMonto(t.tasa_aplicada)} = ${formatearMonto(t.monto_origen)} ${t.moneda_codigo}`
                    : `${formatearMonto(t.monto_origen)} ${t.moneda_codigo} × ${formatearMonto(t.tasa_aplicada)} = ${formatearMonto(t.monto_destino)} ${t.moneda_destino_codigo}`}
                  <span>tasa aplicada</span>
                </p>
              )}
              <div className="rev-datos-linea">
                <Dato etiqueta="Método de pago" valor={t.metodo_pago_nombre ? `${nombreLegible(t.metodo_pago_nombre)}${t.metodo_pago_cuenta_nombre ? ` · ${t.metodo_pago_cuenta_nombre}` : ""}` : null} />
                <Dato etiqueta="Referencia" valor={t.referencia_codigo} copiable />
                <Dato etiqueta="Banco de origen" valor={t.referencia_banco_origen} />
              </div>
            </section>

            {/* ---------- A dónde se le paga al cliente ---------- */}
            {detalle.patas.some((p) => p.tipo === "EGRESO" && p.caja.tipo === "BANCO") && (
              <section className="rev-seccion rev-destino">
                <h4><Landmark size={15} /> Cuenta del cliente (destino del pago)</h4>
                {cuentaDelCliente ? (
                  <div className="rev-datos-grilla">
                    <Dato etiqueta="Tipo" valor={cuentaDelCliente.tipo.replace("_", " ")} />
                    <Dato etiqueta="Banco" valor={cuentaDelCliente.banco} />
                    <Dato etiqueta="Número" valor={cuentaDelCliente.numero_cuenta} copiable />
                    <Dato etiqueta="Tipo de cuenta" valor={cuentaDelCliente.tipo_cuenta} />
                    <Dato etiqueta="Titular" valor={cuentaDelCliente.titular} copiable />
                    <Dato etiqueta="Identificación" valor={cuentaDelCliente.identificacion_titular} copiable />
                    <Dato etiqueta="Teléfono" valor={cuentaDelCliente.telefono} copiable />
                    <Dato etiqueta="Email" valor={cuentaDelCliente.email} copiable />
                  </div>
                ) : (
                  <p className="rev-nota rev-nota-atencion">
                    <AlertTriangle size={14} /> La solicitud no indica a qué cuenta pagarle. Confirmá los datos con el cliente antes de transferir.
                  </p>
                )}
              </section>
            )}
          </div>

          <div className="rev-columna">
            {/* ---------- Cliente ---------- */}
            {detalle.cliente && (
              <section className="rev-seccion">
                <h4><User size={15} /> Cliente</h4>
                <div className="rev-cliente">
                  <div className="rev-cliente-avatar">{detalle.cliente.nombre.charAt(0).toUpperCase()}</div>
                  <div>
                    <strong>{detalle.cliente.nombre}</strong>
                    <span>{[detalle.cliente.identificacion, detalle.cliente.telefono].filter(Boolean).join(" · ")}</span>
                  </div>
                </div>
                <div className="rev-cliente-chips">
                  <span className={`rev-chip rev-chip-${ESTADO_VERIFICACION[detalle.cliente.verificacion.estado]?.clase ?? "atencion"}`}>
                    {detalle.cliente.verificacion.estado === "VERIFICADO" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                    {ESTADO_VERIFICACION[detalle.cliente.verificacion.estado]?.texto}
                  </span>
                  <span className="rev-chip">{detalle.cliente.operacionesConfirmadas} confirmadas</span>
                  {detalle.cliente.operacionesRechazadas > 0 && <span className="rev-chip rev-chip-urgente">{detalle.cliente.operacionesRechazadas} rechazadas</span>}
                  {detalle.cliente.otrasPendientes > 0 && <span className="rev-chip rev-chip-atencion">{detalle.cliente.otrasPendientes} otras pendientes</span>}
                </div>
              </section>
            )}

            <Comprobantes detalle={detalle} onCambio={cargar} />
          </div>
        </div>

        {/* ---------- Verificación y decisión ---------- */}
        {yaResuelta ? (
          <p className="rev-nota">Esta solicitud ya fue resuelta ({t.estado}).</p>
        ) : modo === "revisar" ? (
          <section className="rev-verificacion">
            <h4><Hash size={15} /> Verificación antes de confirmar</h4>
            <div className="rev-verificacion-cuerpo">
              <div className="rev-checklist">
                {checklist.map((item) => (
                  <label key={item} className={marcados.has(item) ? "marcado" : ""}>
                    <input type="checkbox" checked={marcados.has(item)} onChange={() => alternar(marcados, item, setMarcados)} />
                    <span className="rev-check-caja">{marcados.has(item) && <Check size={13} />}</span>
                    {item}
                  </label>
                ))}
              </div>
              <div className="rev-monto-verificar">
                {pataAVerificar && (
                  <label>
                    {pataAVerificar.caja.tipo === "BANCO"
                      ? `Escribí el monto que ${pataAVerificar.tipo === "INGRESO" ? "llegó a" : "salió de"} ${pataAVerificar.caja.nombre}`
                      : `Escribí el monto en efectivo que ${pataAVerificar.tipo === "INGRESO" ? "recibiste" : "entregaste"}`}
                    <div className={`rev-input-monto ${montoVerificado === "" ? "" : montoCoincide !== null ? "ok" : "mal"}`}>
                      <input
                        value={montoVerificado}
                        onChange={(e) => setMontoVerificado(e.target.value)}
                        inputMode="decimal"
                        placeholder="Tal cual lo ves en el banco"
                        autoComplete="off"
                      />
                      <span>{pataAVerificar.monedaCodigo}</span>
                    </div>
                    {montoVerificado !== "" && (
                      <small className={montoCoincide !== null ? "rev-ok" : "rev-mal"}>
                        {montoCoincide !== null ? "Coincide con la operación" : "No coincide con el monto de la operación"}
                      </small>
                    )}
                  </label>
                )}
                <label>
                  Nota (opcional)
                  <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} placeholder="Ej. Llegó con 5 min de demora" />
                </label>
              </div>
            </div>

            {error && <p className="rev-error">{error}</p>}
            {esCreador && <p className="rev-nota rev-nota-atencion"><Ban size={14} /> Vos registraste esta solicitud: la tiene que confirmar otra persona.</p>}

            <div className="rev-acciones">
              <button type="button" className="rev-btn-rechazar" onClick={() => { setModo("rechazar"); setError(null); }} disabled={enviando}>
                <X size={16} /> Rechazar
              </button>
              <div className="rev-acciones-derecha">
                {!puedeConfirmar && !esCreador && bloqueantes.length === 0 && (
                  <span className="rev-falta">
                    {!checklistCompleto ? `Faltan ${checklist.length - checklist.filter((c) => marcados.has(c)).length} verificaciones` : "Falta el monto verificado"}
                  </span>
                )}
                <button type="button" className="rev-btn-confirmar" onClick={confirmar} disabled={!puedeConfirmar}>
                  {enviando ? <Loader2 size={16} className="rev-girando" /> : <CheckCircle2 size={16} />} Confirmar y mover saldos
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rev-verificacion rev-rechazo">
            <h4><X size={15} /> Rechazar la solicitud</h4>
            <p className="rev-nota">No se mueve plata. El motivo queda registrado y la referencia se marca como rechazada.</p>
            <div className="rev-motivos">
              {MOTIVOS_RECHAZO.map((m) => (
                <button type="button" key={m} className={motivos.has(m) ? "activo" : ""} onClick={() => alternar(motivos, m, setMotivos)}>
                  {m}
                </button>
              ))}
            </div>
            <textarea value={detalleRechazo} onChange={(e) => setDetalleRechazo(e.target.value)} rows={2} maxLength={400} placeholder="Detalle (opcional si elegiste un motivo)" />
            {error && <p className="rev-error">{error}</p>}
            <div className="rev-acciones">
              <button type="button" className="rev-btn-secundario" onClick={() => { setModo("revisar"); setError(null); }} disabled={enviando}>
                Volver
              </button>
              <button type="button" className="rev-btn-rechazar-final" onClick={rechazar} disabled={enviando || (motivos.size === 0 && !detalleRechazo.trim())}>
                {enviando ? <Loader2 size={16} className="rev-girando" /> : <X size={16} />} Confirmar rechazo
              </button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
