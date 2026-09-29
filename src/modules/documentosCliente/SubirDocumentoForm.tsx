import { useEffect, useState, type FormEvent } from "react";
import { Camera, FileText, Upload } from "lucide-react";
import {
  MIME_DOCUMENTO,
  subirDocumentoTercero,
  TAMANO_MAXIMO_DOCUMENTO_MB,
  TIPOS_DOCUMENTO,
  type DocumentoTercero,
  type TipoDocumento,
} from "../../api/documentosTercero.api";
import { ApiError } from "../../api/client";

const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_DOCUMENTO_MB * 1024 * 1024;

function esTipoDocumento(valor: string): valor is TipoDocumento {
  return TIPOS_DOCUMENTO.some((t) => t.valor === valor);
}

export function SubirDocumentoForm({
  terceroId,
  tipoInicial,
  transaccionIdInicial,
  onSubido,
  onCancelar,
}: {
  terceroId: number;
  tipoInicial?: TipoDocumento;
  // Si viene, el documento queda como soporte de esa operación
  transaccionIdInicial?: number;
  onSubido: (documento: DocumentoTercero) => void;
  onCancelar?: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDocumento | "">(tipoInicial ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [transaccionId, setTransaccionId] = useState(transaccionIdInicial ? String(transaccionIdInicial) : "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vista previa local de la imagen elegida; se libera al cambiar de archivo o cerrar.
  useEffect(() => {
    if (!archivo || !archivo.type.startsWith("image/")) {
      setVistaPrevia(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  function elegirArchivo(file: File | null) {
    setError(null);
    if (file && file.size > TAMANO_MAXIMO_BYTES) {
      setArchivo(null);
      setError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${TAMANO_MAXIMO_DOCUMENTO_MB} MB.`);
      return;
    }
    setArchivo(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Los eventos de React cruzan portales: sin esto, el submit llegaría al <form> de quien abrió el modal.
    e.stopPropagation();
    setError(null);
    if (!tipo) return setError("Elegí el tipo de documento.");
    if (!archivo) return setError("Adjuntá el archivo o tomá la foto.");
    if (archivo.size > TAMANO_MAXIMO_BYTES) return setError(`El archivo supera los ${TAMANO_MAXIMO_DOCUMENTO_MB} MB.`);
    const txId = transaccionId.trim() ? Number(transaccionId) : undefined;
    if (txId !== undefined && (!Number.isInteger(txId) || txId <= 0)) return setError("El número de transacción no es válido.");

    setSubiendo(true);
    try {
      const doc = await subirDocumentoTercero(terceroId, {
        archivo,
        tipo,
        descripcion: descripcion.trim() || undefined,
        fechaVencimiento: fechaVencimiento || undefined,
        transaccionId: txId,
      });
      onSubido(doc);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError(`${err.message}. Avisale al administrador del sistema.`);
      } else {
        setError(err instanceof ApiError ? err.message : "No se pudo subir el documento.");
      }
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <form className="doc-form" onSubmit={handleSubmit}>
      <label className="doc-campo">
        Tipo de documento
        <select
          value={tipo}
          onChange={(e) => setTipo(esTipoDocumento(e.target.value) ? e.target.value : "")}
          required
        >
          <option value="">Seleccionar…</option>
          {TIPOS_DOCUMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
      </label>

      <label className="doc-archivo">
        <input
          type="file"
          accept={MIME_DOCUMENTO}
          capture="environment"
          onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
        />
        {vistaPrevia ? (
          <img src={vistaPrevia} alt="Vista previa del documento" />
        ) : archivo ? (
          <span className="doc-archivo-nombre"><FileText size={18} /> {archivo.name}</span>
        ) : (
          <span className="doc-archivo-vacio">
            <Camera size={22} />
            <strong>Tomar foto o elegir archivo</strong>
            <small>JPG, PNG, WEBP o PDF · máximo {TAMANO_MAXIMO_DOCUMENTO_MB} MB</small>
          </span>
        )}
      </label>
      {archivo && vistaPrevia && <span className="doc-archivo-detalle">{archivo.name}</span>}

      <label className="doc-campo">
        Descripción (opcional)
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Cédula por ambos lados" />
      </label>

      <div className="doc-fila">
        <label className="doc-campo">
          Vence el (opcional)
          <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        </label>
        <label className="doc-campo">
          N° de transacción (opcional)
          <input
            type="text"
            inputMode="numeric"
            value={transaccionId}
            onChange={(e) => setTransaccionId(e.target.value.replace(/\D/g, ""))}
            placeholder="Solo si es soporte de un cambio"
          />
        </label>
      </div>

      {error && <p className="doc-error">{error}</p>}

      <div className="doc-form-acciones">
        {onCancelar && <button type="button" className="doc-btn-secundario" onClick={onCancelar}>Cancelar</button>}
        <button type="submit" className="doc-btn-primario" disabled={subiendo}>
          <Upload size={16} /> {subiendo ? "Subiendo..." : "Subir documento"}
        </button>
      </div>
    </form>
  );
}
