import { useEffect, useState } from "react";
import { Header } from "../../components/common/Header";
import { getUsuarios, actualizarUsuario, resetearPassword, type Usuario } from "../../api/usuarios.api";
import { useAuth } from "../../auth/useAuth";
import { UsuarioForm } from "./UsuarioForm";
import type { Rol } from "../../types/auth.types";
import "./usuarios.css";

const ROLES: Rol[] = ["ADMIN", "ASESOR", "CAJERO", "OPERADOR"];

export function UsuariosPage() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const data = await getUsuarios();
      setUsuarios(data);
    } catch {
      setError("No se pudieron cargar los usuarios.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleCambiarRol(id: number, rol: Rol) {
    await actualizarUsuario(id, { rol });
    cargar();
  }

  async function handleToggleActivo(u: Usuario) {
    if (u.id === usuarioActual?.id && u.activo) {
      window.alert("No podés desactivar tu propio usuario.");
      return;
    }
    await actualizarUsuario(u.id, { activo: !u.activo });
    cargar();
  }

  async function handleResetPassword(id: number) {
    const nueva = window.prompt("Nueva contraseña temporal (mínimo 6 caracteres):");
    if (!nueva) return;
    if (nueva.length < 6) {
      window.alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    await resetearPassword(id, nueva);
    window.alert("Contraseña actualizada.");
  }

  return (
    <div className="usuarios-page">
      <Header />
      <div className="usuarios-header">
        <div>
          <h1>Usuarios y Roles</h1>
          <p>Alta de empleados y control de acceso por rol.</p>
        </div>
        <button className="usuarios-nuevo-btn" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {mostrarForm && (
        <UsuarioForm
          onCreado={() => {
            setMostrarForm(false);
            cargar();
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {error && <p className="usuarios-form-error" style={{ padding: "0 40px" }}>{error}</p>}

      <div className="usuarios-tabla-wrap">
        {cargando ? (
          <p style={{ fontFamily: "Inter, sans-serif", color: "#6b7280" }}>Cargando…</p>
        ) : (
          <table className="usuarios-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}{u.id === usuarioActual?.id && " (vos)"}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.rol} onChange={(e) => handleCambiarRol(u.id, e.target.value as Rol)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={u.activo ? "usuario-activo" : "usuario-inactivo"}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="usuarios-tabla-acciones">
                    <button onClick={() => handleToggleActivo(u)}>
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => handleResetPassword(u.id)}>Resetear clave</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}