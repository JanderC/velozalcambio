import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import type { ModuloConfig } from "../../types/modulo.types";
import { useFavoritos } from "../../hooks/useFavoritos";

export function ModuleCard({ modulo }: { modulo: ModuloConfig }) {
  const navigate = useNavigate();
  const Icono = modulo.icono;
  const { esFavorito, alternar } = useFavoritos();
  const favorito = esFavorito(modulo.id);

  return (
    <div className="module-card-caja" style={{ "--acento": modulo.acento } as React.CSSProperties}>
      <button className="module-card" onClick={() => navigate(modulo.ruta)}>
        <div className="module-card-icon-badge">
          <Icono size={22} strokeWidth={1.8} />
        </div>
        <span className="module-card-title">{modulo.titulo}</span>
        <span className="module-card-category">{modulo.categoria}</span>
      </button>
      {/* La estrella va fuera del botón de la tarjeta: marcarla no abre el módulo */}
      <button
        type="button"
        className={`module-card-estrella ${favorito ? "activa" : ""}`}
        onClick={() => alternar(modulo.id)}
        aria-pressed={favorito}
        title={favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
        aria-label={favorito ? `Quitar ${modulo.titulo} de favoritos` : `Agregar ${modulo.titulo} a favoritos`}
      >
        <Star size={18} fill={favorito ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
