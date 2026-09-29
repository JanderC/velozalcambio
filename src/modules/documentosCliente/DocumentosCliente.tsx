import { useEffect, useState } from "react";
import { Check, Eye, Plus, X } from "lucide-react";
import {
  etiquetaTipoDocumento,
  getArchivoDocumento,
  getDocumentosTercero,
  getVerificacionTercero,
  revisarDocumento,
  type DocumentoTercero,
  type VerificacionTercero,
} from "../../api/documentosTercero.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import type { Rol } from "../../types/auth.types";
import { Modal } from "../../components/common/Modal";
import { EstadoVerificacionBadge } from "./EstadoVerificacionBadge";
import { SubirDocumentoForm } from "./SubirDocumentoForm";
import "./documentosCliente.css";

const ROLES_SUBIR: Rol[] = ["ADMIN", "ASESOR", "CAJERO"];
const ROLES_REVISAR: Rol[] = ["ADMIN", "ASESOR"];

const ESTADO_DOC_TEXTO: Record<DocumentoTercero["estado"], string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};

interface Visor {
  titulo: string;
  url: string;
  mimeType: string;
}

// Ficha "Documentos" del cliente: estado de verificación, tabla, subir, ver y revisar.
// `recargar` cambia cuando se sube un documento desde otra parte de la pantalla (p. ej. al registrar un cambio).
export function DocumentosCliente({
  terceroId,
  recargar = 0,
  onCambio,
}: {
  terceroId: number;
  recargar?: number;
  onCambio?: () => void;
}) {
  const { usuario } = useAuth();
  const puedeSubir = usuario != null && ROLES_SUBIR.includes(usuario.rol);
  const puedeRevisar = usuario != null && ROLES_REVISAR.includes(usuario.rol);

  const [verificacion, setVerificacion] = useState<VerificacionTercero | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoTercero[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarSubir, setMostrarSubir] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // El enlace firmado solo vive mientras el visor está abierto; se pide de nuevo en cada "Ver".
  const [visor, setVisor] = useState<Visor | null>(null);
  const [abriendoId, setAbriendoId] = useState<number | null>(null);

  const [revisandoId, setRevisandoId] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState<DocumentoTercero | null>(null);
  const [motivo, setMotivo] = useState("");
  const [errorRevision, setErrorRevision] = useState<{ id: number; mensaje: string } | null>(null);

  // Sin `onCambio`, el propio componente se refresca subiendo esta versión.
  const [versionInterna, setVersionInterna] = useState(0);

  useEffect(() => {
    let vigente = true;
    setErrorCarga(null);
    Promise.all([getVerificacionTercero(terceroId), getDocumentosTercero(terceroId)])
      .then(([v, d]) => {
        if (!vigente) return;
        setVerificacion(v);
        setDocumentos(d);
      })
      .catch((err) => {
        if (!vigente) return;
        setErrorCarga(err instanceof ApiError ? err.message : "No se pudieron cargar los documentos.");
        setDocumentos([]);
      });
    return () => { vigente = false; };
  }, [terceroId, recargar, versionInterna]);

  useEffect(() => {
    setDocumentos(null);
    setVerificacion(null);
  }, [terceroId]);

  function despuesDeCambio(mensaje: string) {
    setAviso(mensaje);
    // El padre sube `recargar`; si no hay padre escuchando, se recarga solo.
    if (onCambio) onCambio();
    else setVersionInterna((v) => v + 1);
  }

  async function ver(doc: DocumentoTercero) {
    setAviso(null);
    const esPdf = doc.mime_type === "application/pdf";
    // La pestaña se abre ya, dentro del clic, para que el navegador no la bloquee;
    // la URL se le asigna cuando llega.
    const pestana = esPdf ? window.open("", "_blank") : null;
    setAbriendoId(doc.id);
    try {
      const archivo = await getArchivoDocumento(doc.id);
      if (archivo.mimeType.startsWith("image/")) {
        pestana?.close();
        setVisor({ titulo: `${etiquetaTipoDocumento(doc.tipo)} · ${doc.nombre_original}`, url: archivo.url, mimeType: archivo.mimeType });
      } else if (pestana) {
        pestana.opener = null;
        pestana.location.href = archivo.url;
      } else {
        // La pestaña fue bloqueada: se muestra el PDF dentro de la pantalla.
        setVisor({ titulo: `${etiquetaTipoDocumento(doc.tipo)} · ${doc.nombre_original}`, url: archivo.url, mimeType: archivo.mimeType });
      }
    } catch (err) {
      pestana?.close();
      setAviso(err instanceof ApiError ? err.message : "No se pudo abrir el documento.");
    } finally {
      setAbriendoId(null);
    }
  }

  async function aprobar(doc: DocumentoTercero) {
    setErrorRevision(null);
    setRevisandoId(doc.id);
    try {
      await revisarDocumento(doc.id, { estado: "APROBADO" });
      despuesDeCambio(`${etiquetaTipoDocumento(doc.tipo)} aprobado.`);
    } catch (err) {
      setErrorRevision({ id: doc.id, mensaje: err instanceof ApiError ? err.message : "No se pudo aprobar." });
    } finally {
      setRevisandoId(null);
    }
  }

  async function confirmarRechazo() {
    if (!rechazando || !motivo.trim()) return;
    const doc = rechazando;
    setErrorRevision(null);
    setRevisandoId(doc.id);
    try {
      await revisarDocumento(doc.id, { estado: "RECHAZADO", motivo: motivo.trim() });
      setRechazando(null);
      setMotivo("");
      despuesDeCambio(`${etiquetaTipoDocumento(doc.tipo)} rechazado.`);
    } catch (err) {
      setErrorRevision({ id: doc.id, mensaje: err instanceof ApiError ? err.message : "No se pudo rechazar." });
    } finally {
      setRevisandoId(null);
    }
  }

  return (
    <div className="doc-seccion">
      <div className="doc-encabezado">
        <div className="doc-estado">
          <span className="doc-estado-label">Estado del cliente</span>
          {verificacion ? <EstadoVerificacionBadge estado={verificacion.estado} /> : <span className="doc-cargando">Cargando…</span>}
          {verificacion && verificacion.vencidos > 0 && (
            <span className="doc-estado-nota">{verificacion.vencidos} aprobado(s) vencido(s)</span>
          )}
        </div>
        {puedeSubir && !mostrarSubir && (
          <button className="doc-btn-primario" onClick={() => { setMostrarSubir(true); setAviso(null); }}>
            <Plus size={16} /> Subir documento
          </button>
        )}
      </div>

      {mostrarSubir && (
        <div className="doc-subir-panel">
          <SubirDocumentoForm
            terceroId={terceroId}
            onSubido={(d) => { setMostrarSubir(false); despuesDeCambio(`${etiquetaTipoDocumento(d.tipo)} subido; queda pendiente de revisión.`); }}
            onCancelar={() => setMostrarSubir(false)}
          />
        </div>
      )}

      {aviso && <p className="doc-aviso">{aviso}</p>}
      {errorCarga && <p className="doc-error">{errorCarga}</p>}

      {documentos === null && <p className="doc-cargando">Cargando documentos…</p>}
      {documentos?.length === 0 && !errorCarga && <p className="doc-vacio">Este cliente todavía no tiene documentos cargados.</p>}

      {documentos && documentos.length > 0 && (
        <div className="doc-tabla-scroll">
          <table className="doc-tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Vence</th>
                <th>Estado</th>
                <th>Subido por</th>
                <th>Revisado por</th>
                <th>Cargado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className={d.vencido ? "doc-fila-vencida" : ""}>
                  <td>
                    <strong>{etiquetaTipoDocumento(d.tipo)}</strong>
                    {d.transaccion_id != null && <span className="doc-tx">Soporte de transacción #{d.transaccion_id}</span>}
                  </td>
                  <td>{d.descripcion ?? "—"}</td>
                  <td>
                    {d.fecha_vencimiento ?? "—"}
                    {d.vencido && <span className="doc-vencido-tag">Vencido</span>}
                  </td>
                  <td>
                    <span className={`doc-estado-doc doc-estado-doc-${d.estado.toLowerCase()}`}>{ESTADO_DOC_TEXTO[d.estado]}</span>
                    {d.estado === "RECHAZADO" && d.motivo_rechazo && <span className="doc-motivo">Motivo: {d.motivo_rechazo}</span>}
                  </td>
                  <td>{d.subido_por_nombre}</td>
                  <td>{d.revisado_por_nombre ?? "—"}</td>
                  <td>{new Date(d.created_at).toLocaleString("es-CO")}</td>
                  <td>
                    <div className="doc-acciones">
                      <button className="doc-btn-mini" onClick={() => ver(d)} disabled={abriendoId === d.id}>
                        <Eye size={14} /> {abriendoId === d.id ? "Abriendo…" : "Ver"}
                      </button>
                      {puedeRevisar && d.estado === "PENDIENTE" && (
                        <>
                          <button className="doc-btn-mini doc-btn-aprobar" onClick={() => aprobar(d)} disabled={revisandoId === d.id}>
                            <Check size={14} /> Aprobar
                          </button>
                          <button
                            className="doc-btn-mini doc-btn-rechazar"
                            onClick={() => { setRechazando(d); setMotivo(""); setErrorRevision(null); }}
                            disabled={revisandoId === d.id}
                          >
                            <X size={14} /> Rechazar
                          </button>
                        </>
                      )}
                    </div>
                    {errorRevision?.id === d.id && !rechazando && <span className="doc-error doc-error-fila">{errorRevision.mensaje}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visor && (
        <Modal titulo={visor.titulo} ancho="ancho" onCerrar={() => setVisor(null)}>
          {visor.mimeType.startsWith("image/") ? (
            <img className="doc-visor-img" src={visor.url} alt={visor.titulo} />
          ) : (
            <iframe className="doc-visor-pdf" src={visor.url} title={visor.titulo} />
          )}
          <p className="doc-visor-nota">El enlace vence en 5 minutos. Para volver a verlo, presioná "Ver" otra vez.</p>
        </Modal>
      )}

      {rechazando && (
        <Modal titulo={`Rechazar ${etiquetaTipoDocumento(rechazando.tipo)}`} onCerrar={() => setRechazando(null)}>
          <form className="doc-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); confirmarRechazo(); }}>
            <label className="doc-campo">
              Motivo del rechazo
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ej. Foto ilegible"
                rows={3}
                required
                autoFocus
              />
            </label>
            {errorRevision?.id === rechazando.id && <p className="doc-error">{errorRevision.mensaje}</p>}
            <div className="doc-form-acciones">
              <button type="button" className="doc-btn-secundario" onClick={() => setRechazando(null)}>Cancelar</button>
              <button type="submit" className="doc-btn-peligro" disabled={!motivo.trim() || revisandoId === rechazando.id}>
                {revisandoId === rechazando.id ? "Rechazando…" : "Rechazar documento"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
