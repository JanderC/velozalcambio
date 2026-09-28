import { useRef, useState } from "react";
import { importarSaldosIniciales } from "../../api/cuentasCorrientes.api";
import { ApiError } from "../../api/client";

export function ImportarSaldosForm({ onImportado }: { onImportado: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumen, setResumen] = useState<{ exitosas: number; fallidas: number; total: number } | null>(null);
  const [detalle, setDetalle] = useState<{ fila: number; tercero: string; ok: boolean; error?: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    const archivo = inputRef.current?.files?.[0];
    if (!archivo) return;

    setEnviando(true);
    setError(null);
    try {
      const resultado = await importarSaldosIniciales(archivo);
      setResumen(resultado.resumen);
      setDetalle(resultado.detalle);
      onImportado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo importar el archivo.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleChange} />
      <button className="cc-import-btn" onClick={() => inputRef.current?.click()} disabled={enviando}>
        {enviando ? "Importando…" : "📤 Importar saldos iniciales (Excel)"}
      </button>

      {error && <p className="cc-form-error">{error}</p>}

      {resumen && (
        <div className="cc-import-resumen">
          <p>
            {resumen.exitosas} de {resumen.total} filas importadas correctamente
            {resumen.fallidas > 0 && ` — ${resumen.fallidas} con error`}.
          </p>
          {resumen.fallidas > 0 && (
            <table className="cc-import-tabla">
              <thead>
                <tr><th>Fila</th><th>Tercero</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {detalle.filter((d) => !d.ok).map((d) => (
                  <tr key={d.fila}>
                    <td>{d.fila}</td>
                    <td>{d.tercero}</td>
                    <td className="cc-import-fail">{d.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}