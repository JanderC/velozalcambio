import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { crearTercero, type Tercero } from "../../api/terceros.api";
import { ApiError } from "../../api/client";

// Si lo buscado parece un documento (solo dígitos, puntos, guiones), va a identificación; si no, a nombre.
function pareceDocumento(texto: string) {
  return /^[\d.\-\s]+$/.test(texto.trim());
}

export function ClienteRapidoForm({
  textoBuscado,
  onCreado,
  onCancelar,
}: {
  textoBuscado: string;
  onCreado: (tercero: Tercero) => void;
  onCancelar: () => void;
}) {
  const esDocumento = pareceDocumento(textoBuscado);
  const [nombre, setNombre] = useState(esDocumento ? "" : textoBuscado.trim());
  const [identificacion, setIdentificacion] = useState(esDocumento ? textoBuscado.trim() : "");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setError(null);
    setEnviando(true);
    try {
      const nuevo = await crearTercero({
        nombre: nombre.trim(),
        identificacion: identificacion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        tipo: "CLIENTE",
      });
      onCreado(nuevo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el cliente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="nt-cliente-rapido" onSubmit={handleSubmit}>
      <div className="nt-cliente-rapido-titulo">
        <UserPlus size={18} />
        <span>Nuevo cliente</span>
      </div>
      <label className="nt-campo">
        Nombre completo
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus={esDocumento} />
      </label>
      <div className="nt-fila-dos">
        <label className="nt-campo">
          Identificación
          <input value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} autoFocus={!esDocumento} />
        </label>
        <label className="nt-campo">
          Teléfono
          <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
      </div>

      {error && <p className="nt-error">{error}</p>}

      <div className="nt-cliente-rapido-acciones">
        <button type="button" className="nt-btn-volver" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="nt-btn-siguiente" disabled={enviando || !nombre.trim()}>
          {enviando ? "Guardando…" : "Crear y continuar →"}
        </button>
      </div>
    </form>
  );
}
