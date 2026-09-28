import { useEffect, useState } from "react";
import { buscarTerceros, obtenerResumenTercero, type Tercero, type ResumenTercero } from "../../api/terceros.api";
import { Header } from "../../components/common/Header";
import { ClienteForm } from "./ClienteForm";
import { ClienteAccionesPanel } from "../caja/ClienteAccionesPanel";

export function ClientesPage() {
  const [query, setQuery] = useState("");
  const [clientes, setClientes] = useState<Tercero[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Tercero | null>(null);
  const [resumen, setResumen] = useState<ResumenTercero | null>(null);

  async function cargarClientes(busqueda: string) {
    setCargando(true);
    setError(null);
    try {
      const data = await buscarTerceros(busqueda);
      setClientes(data);
    } catch {
      setError("No se pudo cargar la lista de clientes.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarClientes("");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargarClientes(query), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function verDetalle(tercero: Tercero) {
    setSeleccionado(tercero);
    try {
      const data = await obtenerResumenTercero(tercero.id);
      setResumen(data);
    } catch {
      setError("No se pudo cargar la información del cliente.");
    }
  }

  function handleClienteCreado(nuevo: Tercero) {
    setMostrarFormNuevo(false);
    cargarClientes(query);
    verDetalle(nuevo);
  }

  function cerrarDetalle() {
    setSeleccionado(null);
    setResumen(null);
  }

  return (
    <div className="clientes-page">
      <Header />

      <div className="clientes-toolbar">
        <div>
          <h1>Clientes</h1>
          <p>Catálogo de clientes y proveedores registrados.</p>
        </div>
        <button className="clientes-nuevo-btn" onClick={() => setMostrarFormNuevo(true)}>
          + Nuevo cliente
        </button>
      </div>

      <div className="clientes-buscador">
        <input
          type="text"
          placeholder="Buscar por nombre o identificación..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {mostrarFormNuevo && (
        <ClienteForm onCreado={handleClienteCreado} onCancelar={() => setMostrarFormNuevo(false)} />
      )}

      {error && <p className="clientes-error">{error}</p>}

      {!seleccionado && (
        <div className="clientes-tabla-wrap">
          {cargando ? (
            <p className="clientes-hint">Cargando…</p>
          ) : clientes.length === 0 ? (
            <p className="clientes-hint">No hay clientes que coincidan con la búsqueda.</p>
          ) : (
            <table className="clientes-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Identificación</th>
                  <th>Teléfono</th>
                  <th>Tipo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.identificacion ?? "—"}</td>
                    <td>{c.telefono ?? "—"}</td>
                    <td>
                      <span className={`cliente-tipo cliente-tipo-${c.tipo.toLowerCase()}`}>{c.tipo}</span>
                    </td>
                    <td>
                      <button className="clientes-ver-btn" onClick={() => verDetalle(c)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {seleccionado && resumen && (
        <ClienteAccionesPanel resumen={resumen} onCerrar={cerrarDetalle} onActualizar={() => verDetalle(seleccionado)} />
      )}
    </div>
  );
}