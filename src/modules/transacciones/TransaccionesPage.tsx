import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Header } from "../../components/common/Header";
import { AccordionSection } from "../../components/common/AccordionSection";
import { getTransacciones, type Transaccion } from "../../api/transacciones.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { getCajas, type Caja } from "../../api/cajas.api";

const TIPOS = ["COMPRA_DIVISA", "VENTA_DIVISA", "DEPOSITO", "RETIRO", "TRANSFERENCIA_INTERNA", "FONDEO", "ABONO_CXC", "ABONO_CXP"];
const ESTADOS = ["PENDIENTE", "BLOQUEADA", "CONFIRMADA", "RECHAZADA", "ANULADA"];

export function TransaccionesPage() {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [monedaId, setMonedaId] = useState<number | "">("");
  const [cajaId, setCajaId] = useState<number | "">("");
  const [estado, setEstado] = useState("");
  const [tipo, setTipo] = useState("");
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
    getCajas().then(setCajas).catch(() => setCajas([]));
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar() {
    setCargando(true);
    setError(null);
    try {
      const data = await getTransacciones({
        desde: desde || undefined,
        hasta: hasta || undefined,
        monedaId: monedaId || undefined,
        cajaId: cajaId || undefined,
        estado: estado || undefined,
        tipo: tipo || undefined,
      });
      setTransacciones(data);
    } catch {
      setError("No se pudieron cargar las transacciones.");
    } finally {
      setCargando(false);
    }
  }

  function limpiar() {
    setDesde("");
    setHasta("");
    setMonedaId("");
    setCajaId("");
    setEstado("");
    setTipo("");
    setTimeout(buscar, 0);
  }

  return (
    <div className="transacciones-page">
      <Header />
      <div className="transacciones-header">
        <h1>Transacciones</h1>
        <p>Historial completo de operaciones cambiarias.</p>
      </div>

      <AccordionSection titulo="Filtros" icono={<Search size={18} />}>
        <div className="filtros-grid">
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label>
            Moneda
            <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Todas</option>
              {monedas.map((m) => (
                <option key={m.id} value={m.id}>{m.codigo}</option>
              ))}
            </select>
          </label>
          <label>
            Caja / Banco
            <select value={cajaId} onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Todas</option>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="filtros-botones">
          <button className="btn-buscar" onClick={buscar}>Buscar</button>
          <button className="btn-limpiar" onClick={limpiar}>Limpiar</button>
        </div>
      </AccordionSection>

      {error && <p className="transacciones-error">{error}</p>}

      <div className="transacciones-tabla-wrap">
        {cargando ? (
          <p className="transacciones-hint">Cargando…</p>
        ) : transacciones.length === 0 ? (
          <p className="transacciones-hint">No hay transacciones que coincidan con los filtros.</p>
        ) : (
          <table className="transacciones-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Caja</th>
                <th>Monto</th>
                <th>Referencia</th>
                <th>Estado</th>
                <th>Registrada por</th>
              </tr>
            </thead>
            <tbody>
              {transacciones.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString("es-CO")}</td>
                  <td>{t.tipo.replace("_", " ")}</td>
                  <td>{t.tercero_nombre ?? "—"}</td>
                  <td>{t.caja_nombre}</td>
                  <td>{Number(t.monto_origen).toLocaleString("es-CO")} {t.moneda_codigo}</td>
                  <td>{t.referencia_codigo ?? "—"}</td>
                  <td>
                    <span className={`estado-badge estado-${t.estado.toLowerCase()}`}>{t.estado}</span>
                  </td>
                  <td>{t.creado_por_nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}