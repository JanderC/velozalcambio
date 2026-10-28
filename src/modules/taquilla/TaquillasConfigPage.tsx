import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Header } from "../../components/common/Header";
import { ApiError } from "../../api/client";
import { crearTaquilla, editarTaquilla, getTaquillas, rutaDeTaquilla, type TaquillaConfig } from "../../api/taquillas.api";
import { guardarTaquillas, useTaquillas } from "../../hooks/useTaquillas";
import { formatearMonto } from "../../utils/montos";
import "../usuarios/usuarios.css";

const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo guardar.");

/**
 * Configuración › Taquillas: crear las que hagan falta, cambiarles el nombre y habilitarlas o deshabilitarlas.
 * Cada una sale en el panel de módulos con su propia caja; deshabilitada desaparece del panel.
 */
export function TaquillasConfigPage() {
  const taquillas = useTaquillas();
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState<{ numero: number; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // al entrar, la lista al día (si una se abrió o recibió efectivo en otra pantalla)
  useEffect(() => {
    getTaquillas()
      .then(guardarTaquillas)
      .catch((e) => setError(mensaje(e)));
  }, []);

  async function hacer(accion: () => Promise<TaquillaConfig[]>) {
    setOcupado(true);
    try {
      guardarTaquillas(await accion());
      setError(null);
      return true;
    } catch (e) {
      setError(mensaje(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (await hacer(() => crearTaquilla(nombre))) setNombre("");
  }

  async function renombrar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    if (await hacer(() => editarTaquilla(editando.numero, { nombre: editando.nombre }))) setEditando(null);
  }

  const siguiente = Math.max(0, ...taquillas.map((t) => t.numero)) + 1;

  return (
    <div className="usuarios-page">
      <Header />
      <div className="usuarios-header">
        <div>
          <h1>Taquillas</h1>
          <p>Crea las taquillas que necesites y habilítalas o deshabilítalas. Cada una tiene su propia caja en pesos, dólares y euros.</p>
        </div>
        <form className="tqc-nueva" onSubmit={crear}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={`Taquilla ${siguiente}`} maxLength={80} aria-label="Nombre de la taquilla nueva" />
          <button className="usuarios-nuevo-btn" type="submit" disabled={ocupado}>
            + Nueva taquilla
          </button>
        </form>
      </div>

      {error && (
        <p className="usuarios-form-error" style={{ padding: "0 40px 12px" }}>
          {error}
        </p>
      )}

      <div className="usuarios-tabla-wrap">
        <table className="usuarios-tabla">
          <thead>
            <tr>
              <th>N.º</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Caja</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {taquillas.map((t) => (
              <tr key={t.numero}>
                <td>{t.numero}</td>
                <td>
                  {editando?.numero === t.numero ? (
                    <form className="tqc-renombrar" onSubmit={renombrar}>
                      <input autoFocus value={editando.nombre} maxLength={80} onChange={(e) => setEditando({ numero: t.numero, nombre: e.target.value })} />
                      <button type="submit" disabled={ocupado || !editando.nombre.trim()}>
                        Guardar
                      </button>
                      <button type="button" onClick={() => setEditando(null)}>
                        Cancelar
                      </button>
                    </form>
                  ) : t.activo ? (
                    <Link to={rutaDeTaquilla(t.numero)}>{t.nombre}</Link>
                  ) : (
                    t.nombre
                  )}
                </td>
                <td>
                  <span className={t.activo ? "usuario-activo" : "usuario-inactivo"}>{t.activo ? "Habilitada" : "Deshabilitada"}</span>
                </td>
                <td className="tqc-caja">
                  {t.abierta ? "Abierta" : "Cerrada"}
                  {t.saldos.length > 0 && <small> · {t.saldos.map((s) => `${formatearMonto(s.monto)} ${s.codigo}`).join(" · ")}</small>}
                </td>
                <td className="usuarios-tabla-acciones">
                  <button type="button" disabled={ocupado} onClick={() => setEditando({ numero: t.numero, nombre: t.nombre })}>
                    Cambiar nombre
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    title={t.activo ? "Para deshabilitarla tiene que estar cerrada y sin efectivo" : undefined}
                    onClick={() => void hacer(() => editarTaquilla(t.numero, { activo: !t.activo }))}
                  >
                    {t.activo ? "Deshabilitar" : "Habilitar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
