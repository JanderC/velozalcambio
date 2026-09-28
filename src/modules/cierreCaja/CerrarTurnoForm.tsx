import { useState, type FormEvent } from "react";
import type { CierreCaja } from "../../api/cierreCaja.api";

export function CerrarTurnoForm({ cierre, onCerrar }: { cierre: CierreCaja; onCerrar: (saldoReal: string) => void }) {
  const [saldoReal, setSaldoReal] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!saldoReal) return;
    onCerrar(saldoReal);
  }

  return (
    <div>
      <span className="cierre-estado-abierta">● Turno abierto</span>
      <div className="cierre-dato">
        <span>Abierto desde</span>
        <span>{new Date(cierre.fecha_apertura).toLocaleString("es-CO")}</span>
      </div>
      <div className="cierre-dato">
        <span>Saldo inicial</span>
        <span>{Number(cierre.saldo_inicial).toLocaleString("es-CO")} {cierre.moneda_codigo}</span>
      </div>

      <form className="cierre-form-cerrar" onSubmit={handleSubmit}>
        <label>
          Saldo real contado
          <input type="text" inputMode="decimal" value={saldoReal} onChange={(e) => setSaldoReal(e.target.value)} placeholder="0.00" />
        </label>
        <button type="submit" className="cierre-btn-cerrar">Cerrar turno</button>
      </form>
    </div>
  );
}