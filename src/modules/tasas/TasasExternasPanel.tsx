import { useEffect, useState } from "react";
import { getTasasExternas, type TasaExterna } from "../../api/tasas.api";

const REFRESCO_MS = 60_000;

export function TasasExternasPanel() {
  const [tasas, setTasas] = useState<TasaExterna[] | null>(null);
  const [error, setError] = useState(false);

  async function cargar() {
    try {
      const data = await getTasasExternas();
      setTasas(data);
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    cargar();
    const interval = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="tasas-externas-panel">
      <div className="tasas-externas-header">
        <h3>Referencia de mercado (Venezuela)</h3>
        <span className="tasas-externas-nota">
          Solo informativo — no se aplica automáticamente. Recordá que algunos clientes tienen tasa especial acordada.
        </span>
      </div>

      {error && <p className="tasas-externas-error">No se pudo consultar el mercado en este momento.</p>}

      {tasas === null && !error && <p className="tasas-externas-hint">Consultando fuentes…</p>}

      {tasas && tasas.length === 0 && !error && (
        <p className="tasas-externas-hint">Ninguna fuente externa respondió.</p>
      )}

      {tasas && tasas.length > 0 && (
        <table className="tasas-externas-tabla">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Moneda</th>
              <th>Compra</th>
              <th>Venta</th>
              <th>Promedio</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {tasas.map((t, i) => (
              <tr key={`${t.origen}-${t.fuente}-${t.moneda}-${i}`}>
                <td>
                  <span className={`tasas-externas-origen origen-${t.origen.toLowerCase()}`}>{t.origen}</span> {t.fuente}
                </td>
                <td>{t.moneda}</td>
                <td>{t.compra != null ? t.compra.toLocaleString("es-VE") : "—"}</td>
                <td>{t.venta != null ? t.venta.toLocaleString("es-VE") : "—"}</td>
                <td>{t.promedio != null ? t.promedio.toLocaleString("es-VE") : "—"}</td>
                <td>{t.fechaActualizacion ? new Date(t.fechaActualizacion).toLocaleString("es-VE") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}