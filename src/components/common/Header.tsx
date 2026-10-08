import { Link, useLocation } from "react-router-dom";
import { CircleDollarSign, LogOut, ChevronLeft, Star } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import { useFavoritos } from "../../hooks/useFavoritos";
import { MODULOS } from "../../modules/launcher/modulos.config";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  ASESOR: "Asesor",
  CAJERO: "Cajero",
  OPERADOR: "Operador",
};

export function Header({ mostrarVolver = true }: { mostrarVolver?: boolean }) {
  const { usuario, cerrarSesion } = useAuth();
  const { pathname } = useLocation();
  const { favoritos, alternar, esFavorito } = useFavoritos();

  // El módulo en el que se está parado (la ruta más larga que coincide: /tasas/registro antes que /tasas)
  const actual = MODULOS.filter((m) => pathname === m.ruta || pathname.startsWith(`${m.ruta}/`)).sort((a, b) => b.ruta.length - a.ruta.length)[0];
  // Accesos rápidos: los favoritos que este usuario puede abrir, en el orden en que los marcó
  const accesos = favoritos
    .map((id) => MODULOS.find((m) => m.id === id))
    .filter((m): m is (typeof MODULOS)[number] => !!m && !!usuario && m.rolesPermitidos.includes(usuario.rol));

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
        {mostrarVolver && actual && (
          <button
            type="button"
            className={`app-header-estrella ${esFavorito(actual.id) ? "activa" : ""}`}
            onClick={() => alternar(actual.id)}
            aria-pressed={esFavorito(actual.id)}
            title={esFavorito(actual.id) ? `Quitar ${actual.titulo} de favoritos` : `Agregar ${actual.titulo} a favoritos`}
            aria-label={esFavorito(actual.id) ? `Quitar ${actual.titulo} de favoritos` : `Agregar ${actual.titulo} a favoritos`}
          >
            <Star size={16} fill={esFavorito(actual.id) ? "currentColor" : "none"} />
          </button>
        )}
      </div>
      {mostrarVolver && accesos.length > 0 && (
        <nav className="app-header-favoritos" aria-label="Módulos favoritos">
          {accesos.map((m) => {
            const Icono = m.icono;
            return (
              <Link key={m.id} to={m.ruta} className={`app-header-favorito ${m.id === actual?.id ? "actual" : ""}`} title={m.titulo}>
                <Icono size={14} />
                <span>{m.titulo}</span>
              </Link>
            );
          })}
        </nav>
      )}
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
