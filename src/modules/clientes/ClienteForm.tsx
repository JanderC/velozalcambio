import { useState, type FormEvent } from "react";
import { crearTercero, type Tercero } from "../../api/terceros.api";
import { ApiError } from "../../api/client";

export function ClienteForm({
  nombreInicial = "",
  onCreado,
  onCancelar,
}: {
  nombreInicial?: string;
  onCreado: (tercero: Tercero) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [identificacion, setIdentificacion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<"CLIENTE" | "PROVEEDOR" | "MIXTO">("CLIENTE");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const nuevo = await crearTercero({
        nombre,
        identificacion: identificacion || undefined,
        telefono: telefono || undefined,
        tipo,
      });
      onCreado(nuevo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el cliente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cliente-form" onSubmit={handleSubmit}>
      <h3>Nuevo cliente</h3>
      <label>
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>
      <label>
        Identificación
        <input value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} />
      </label>
      <label>
        Teléfono
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </label>
      <label>
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as "CLIENTE" | "PROVEEDOR" | "MIXTO")}>
          <option value="CLIENTE">Cliente</option>
          <option value="PROVEEDOR">Proveedor</option>
          <option value="MIXTO">Mixto</option>
        </select>
      </label>

      {error && <p className="cliente-form-error">{error}</p>}

      <div className="cliente-form-acciones">
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}