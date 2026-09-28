import { useNavigate } from "react-router-dom";
import type { ModuloConfig } from "../../types/modulo.types";

export function ModuleCard({ modulo }: { modulo: ModuloConfig }) {
  const navigate = useNavigate();
  const Icono = modulo.icono;

  return (
    <button
      className="module-card"
      style={{ "--acento": modulo.acento } as React.CSSProperties}
      onClick={() => navigate(modulo.ruta)}
    >
      <div className="module-card-icon-badge">
        <Icono size={22} strokeWidth={1.8} />
      </div>
      <span className="module-card-title">{modulo.titulo}</span>
      <span className="module-card-category">{modulo.categoria}</span>
    </button>
  );
}