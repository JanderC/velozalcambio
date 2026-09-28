import { useMemo, useState } from "react";
import { Header } from "../../components/common/Header";
import { SearchBar } from "../../components/common/SearchBar";
import { ModuleCard } from "../../components/common/ModuleCard";
import { MODULOS } from "./modulos.config";
import { useAuth } from "../../auth/useAuth";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  ASESOR: "Asesor",
  CAJERO: "Cajero",
  OPERADOR: "Operador",
};

const ORDEN_CATEGORIAS = ["Operación diaria", "Gestión financiera", "Configuración", "Administración general"];

export function LauncherPage() {
  const { usuario } = useAuth();
  const [busqueda, setBusqueda] = useState("");

  const grupos = useMemo(() => {
    if (!usuario) return [];
    const visibles = MODULOS.filter(
      (m) => m.rolesPermitidos.includes(usuario.rol) && m.titulo.toLowerCase().includes(busqueda.toLowerCase())
    );
    return ORDEN_CATEGORIAS.map((categoria) => ({
      categoria,
      modulos: visibles.filter((m) => m.categoria === categoria),
    })).filter((g) => g.modulos.length > 0);
  }, [usuario, busqueda]);

  return (
    <div className="launcher-page">
      <Header mostrarVolver={false} />

      <div className="launcher-welcome">
        <div>
          <h1>Panel de módulos</h1>
          <p>
            Hola, <strong>{usuario ? ROL_LABEL[usuario.rol] : ""}</strong> — elegí un módulo para continuar.
          </p>
        </div>
        <SearchBar value={busqueda} onChange={setBusqueda} />
      </div>

      {grupos.length === 0 ? (
        <p className="launcher-vacio">No hay módulos que coincidan con la búsqueda.</p>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.categoria} className="launcher-seccion">
            <div className="launcher-seccion-titulo">
              <span>{grupo.categoria}</span>
            </div>
            <div className="launcher-grid">
              {grupo.modulos.map((modulo) => (
                <ModuleCard key={modulo.id} modulo={modulo} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}