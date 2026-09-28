import { useState, type FormEvent } from "react";
import { crearUsuario } from "../../api/usuarios.api";
import type { Rol } from "../../types/auth.types";
import { ApiError } from "../../api/client";

export function UsuarioForm({ onCreado, onCancelar }: { onCreado: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>("CAJERO");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await crearUsuario({ nombre, email, password, rol });
      onCreado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="usuarios-form" onSubmit={handleSubmit}>
      <label>
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>
      <label>
        Correo
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Contraseña temporal
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </label>
      <label>
        Rol
        <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
          <option value="ADMIN">Administrador</option>
          <option value="ASESOR">Asesor</option>
          <option value="CAJERO">Cajero</option>
          <option value="OPERADOR">Operador</option>
        </select>
      </label>

      {error && <p className="usuarios-form-error">{error}</p>}

      <div className="usuarios-form-acciones">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? "Creando…" : "Crear usuario"}</button>
      </div>
    </form>
  );
}