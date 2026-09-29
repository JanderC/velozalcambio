import { Link } from "react-router-dom";
import { LockOpen } from "lucide-react";
import type { ApiError } from "../../api/client";

// Error al registrar un cambio de divisa. 400: datos inválidos o tasa que no corresponde.
// 409: saldo insuficiente, referencia repetida o caja sin turno abierto (este último con acción).
export function ErrorCambio({ error }: { error: ApiError }) {
  const sinTurno = error.status === 409 && /turno/i.test(error.message);
  const detallesExtra = error.detalles.filter((d) => d.mensaje !== error.message);

  return (
    <div className="error-cambio">
      <p className="error-cambio-mensaje">{error.message}</p>
      {detallesExtra.length > 0 && (
        <ul className="error-cambio-detalles">
          {detallesExtra.map((d) => (
            <li key={`${d.campo}-${d.mensaje}`}>{d.mensaje}</li>
          ))}
        </ul>
      )}
      {sinTurno && (
        <p className="error-cambio-accion">
          <LockOpen size={15} className="icono-inline" /> Primero abrí el turno de esa caja y moneda en{" "}
          <Link to="/cierre-caja">Cierre de Caja</Link>, y después volvé a registrar.
        </p>
      )}
    </div>
  );
}
