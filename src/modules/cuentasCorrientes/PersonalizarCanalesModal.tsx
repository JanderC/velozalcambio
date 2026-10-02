import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { actualizarCanal, crearCanal, type Canal } from "../../api/cuentasCorrientes.api";
import { ApiError } from "../../api/client";

const legible = (nombre: string) => nombre.replace(/_/g, " ");

/** Las opciones del select de banco o canal: agregar, cambiar el nombre o quitar. */
export function PersonalizarCanalesModal({ canales, onCambio, onCerrar }: { canales: Canal[]; onCambio: (canales: Canal[]) => void; onCerrar: () => void }) {
  const [nuevo, setNuevo] = useState("");
  const [nombres, setNombres] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editables = canales.filter((c) => c.nombre !== "SIN_BANCO");
  const ordenar = (lista: Canal[]) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));

  async function hacer(accion: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setOcupado(false);
    }
  }

  function agregar(e: FormEvent) {
    e.preventDefault();
    if (nuevo.trim().length < 2) return setError("Escribí el nombre de la opción nueva.");
    void hacer(async () => {
      const creado = await crearCanal(nuevo);
      onCambio(ordenar([...canales.filter((c) => c.id !== creado.id), creado]));
      setNuevo("");
    });
  }

  function renombrar(canal: Canal) {
    const escrito = nombres[canal.id];
    if (escrito === undefined || escrito.trim() === legible(canal.nombre)) return;
    if (escrito.trim().length < 2) return setNombres(({ [canal.id]: _, ...resto }) => resto);
    void hacer(async () => {
      const actualizado = await actualizarCanal(canal.id, { nombre: escrito });
      onCambio(ordenar(canales.map((c) => (c.id === canal.id ? actualizado : c))));
      setNombres(({ [canal.id]: _, ...resto }) => resto);
    });
  }

  function quitar(canal: Canal) {
    if (!window.confirm(`¿Quitar "${legible(canal.nombre)}" de la lista? Las cuentas que ya lo usan no cambian.`)) return;
    void hacer(async () => {
      await actualizarCanal(canal.id, { activo: false });
      onCambio(canales.filter((c) => c.id !== canal.id));
    });
  }

  return (
    <Modal titulo="Personalizar bancos y canales" onCerrar={onCerrar}>
      <div className="cc-modal">
        <ul className="cc-canales">
          {editables.map((c) => (
            <li key={c.id}>
              <input
                value={nombres[c.id] ?? legible(c.nombre)}
                onChange={(e) => setNombres((n) => ({ ...n, [c.id]: e.target.value }))}
                onBlur={() => renombrar(c)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                aria-label={`Nombre de ${legible(c.nombre)}`}
              />
              <button type="button" onClick={() => quitar(c)} disabled={ocupado} aria-label={`Quitar ${legible(c.nombre)}`} title="Quitar de la lista">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {editables.length === 0 && <li className="cc-lista-aviso">No hay opciones todavía.</li>}
        </ul>
        <form className="cc-canal-nuevo" onSubmit={agregar}>
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Agregar otro: ej. Binance, Daviplata…" aria-label="Opción nueva" />
          <button type="submit" className="cc-guardar" disabled={ocupado}>
            Agregar
          </button>
        </form>
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-guardar" onClick={onCerrar}>
            Listo
          </button>
        </div>
      </div>
    </Modal>
  );
}
