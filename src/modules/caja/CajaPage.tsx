import { useRef, useState } from "react";
import { buscarTerceros, obtenerResumenTercero, type Tercero, type ResumenTercero } from "../../api/terceros.api";
import { ClienteForm } from "../clientes/ClienteForm";
import { ClienteAccionesPanel } from "./ClienteAccionesPanel";
import { Header } from "../../components/common/Header";
import { AccordionSection } from "../../components/common/AccordionSection";
import { TIPOS_DOCUMENTO } from "../../api/terceros.api";

export function CajaPage() {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Tercero[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Tercero | null>(null);
  const [resumen, setResumen] = useState<ResumenTercero | null>(null);
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [tipoDocumento, setTipoDocumento] = useState<string>(TIPOS_DOCUMENTO[0]);


  function handleBuscar(valor: string) {
    setQuery(valor);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await buscarTerceros(valor.trim());
        setResultados(data);
      } catch {
        setError("No se pudo buscar. Intentá de nuevo.");
      } finally {
        setBuscando(false);
      }
    }, 350);
  }

  async function seleccionarCliente(tercero: Tercero) {
    setClienteSeleccionado(tercero);
    setResultados([]);
    setQuery(tercero.nombre);
    try {
      const data = await obtenerResumenTercero(tercero.id);
      setResumen(data);
    } catch {
      setError("No se pudo cargar la información del cliente.");
    }
  }

  function handleClienteCreado(nuevo: Tercero) {
    setMostrarFormNuevo(false);
    seleccionarCliente(nuevo);
  }

  function limpiar() {
    setClienteSeleccionado(null);
    setResumen(null);
    setQuery("");
    setResultados([]);
  }

  return (
    <div className="caja-page">
      <Header />
      <div className="caja-header">
        <h1>Atención de Solicitudes</h1>
        <p>Buscá al cliente para ver sus cuentas o registrarle una operación.</p>
      </div>

      {!clienteSeleccionado && (
  <AccordionSection titulo="Búsqueda de Clientes" icono="🔍">
    <div className="busqueda-documento">
      <label>
        Tipo de Documento
        <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)}>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="busqueda-documento-numero">
        Número de Documento
        <input
          type="text"
          value={query}
          onChange={(e) => handleBuscar(e.target.value)}
          placeholder="Ingresá el número o el nombre"
          autoFocus
        />
      </label>
      <div className="busqueda-documento-botones">
        <button className="btn-buscar" onClick={() => handleBuscar(query)}>Buscar</button>
        <button className="btn-limpiar" onClick={() => handleBuscar("")}>Limpiar</button>
      </div>
    </div>

    {buscando && <p className="cliente-buscador-hint">Buscando…</p>}
    {error && <p className="cliente-buscador-error">{error}</p>}

    {resultados.length > 0 && (
      <ul className="cliente-buscador-lista">
        {resultados.map((t) => (
          <li key={t.id} onClick={() => seleccionarCliente(t)}>
            <span className="cliente-nombre">{t.nombre}</span>
            <span className="cliente-identificacion">{t.identificacion ?? "sin identificación"}</span>
            <span className={`cliente-tipo cliente-tipo-${t.tipo.toLowerCase()}`}>{t.tipo}</span>
          </li>
        ))}
      </ul>
    )}

    {query.trim().length >= 2 && !buscando && resultados.length === 0 && (
      <div className="cliente-buscador-vacio">
        <p>No encontramos a "{query}".</p>
        <button onClick={() => setMostrarFormNuevo(true)}>+ Agregar cliente nuevo</button>
      </div>
    )}
  </AccordionSection>
)}

      {mostrarFormNuevo && (
        <ClienteForm nombreInicial={query} onCreado={handleClienteCreado} onCancelar={() => setMostrarFormNuevo(false)} />
      )}

      {clienteSeleccionado && resumen && (
        <ClienteAccionesPanel
          resumen={resumen}
          onCerrar={limpiar}
          onActualizar={() => seleccionarCliente(clienteSeleccionado)}
        />
      )}
    </div>
  );
}