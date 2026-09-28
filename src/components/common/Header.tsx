import { Link } from "react-router-dom";
import { CircleDollarSign, LogOut, ChevronLeft } from "lucide-react";
import { useAuth } from "../../auth/useAuth";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  ASESOR: "Asesor",
  CAJERO: "Cajero",
  OPERADOR: "Operador",
};

export function Header({ mostrarVolver = true }: { mostrarVolver?: boolean }) {
  const { usuario, cerrarSesion } = useAuth();

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <div className="app-header-mark">
          <CircleDollarSign size={20} strokeWidth={2} />
        </div>
        <span className="app-header-title">
          Pago Veloz <span>al Cambio</span>
        </span>
        {mostrarVolver && (
          <Link to="/" className="app-header-volver">
            <ChevronLeft size={14} />
            Módulos
          </Link>
        )}
      </div>
      <div className="app-header-user">
        <span className="app-header-role">{usuario ? ROL_LABEL[usuario.rol] : ""}</span>
        <button onClick={cerrarSesion}>
          <LogOut size={14} />
          Salir
        </button>
      </div>
    </header>
  );
}