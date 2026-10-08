import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ClipboardList, Copy, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { whatsappApi, type RespuestaRapidaWa } from "../../../api/whatsapp.api";
import { filtrarRapidas, ponerRapidas, recargarRapidas, useRespuestasRapidas } from "./useRespuestasRapidas";
import "./rapidas.css";

const LARGO_TITULO = 60;
const LARGO_TEXTO = 4000;
const VACIA = { titulo: "", texto: "" };

/** Pestaña "Respuestas rápidas": acá se cargan, se editan y se ordenan. Se usan en cualquier chat con un toque. */
export function RespuestasRapidasPanel() {
  const rapidas = useRespuestasRapidas();
  const [busqueda, setBusqueda] = useState("");
  // null: nada abierto · "nueva": el formulario de arriba · número: se edita esa
  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [borrador, setBorrador] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiada, setCopiada] = useState<number | null>(null);

  useEffect(() => {
    void recargarRapidas();
  }, []);

  const visibles = useMemo(() => filtrarRapidas(rapidas, busqueda), [rapidas, busqueda]);
  const buscando = busqueda.trim() !== "";
  const valida = borrador.titulo.trim() !== "" && borrador.texto.trim() !== "";

  function abrir(cual: number | "nueva", r?: RespuestaRapidaWa) {
    setEditando(cual);
    setBorrador(r ? { titulo: r.titulo, texto: r.texto } : VACIA);
    setError(null);
  }

  async function guardar() {
    if (!valida || guardando || editando === null) return;
    setGuardando(true);
    setError(null);
    try {
      const datos = { titulo: borrador.titulo.trim(), texto: borrador.texto.trim() };
      if (editando === "nueva") ponerRapidas([...rapidas, await whatsappApi.crearRapida(datos)]);
      else {
        const guardada = await whatsappApi.actualizarRapida(editando, datos);
        ponerRapidas(rapidas.map((r) => (r.id === guardada.id ? guardada : r)));
      }
      setEditando(null);
      setBorrador(VACIA);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(r: RespuestaRapidaWa) {
    if (!window.confirm(`¿Eliminar la respuesta rápida "${r.titulo}"?`)) return;
    try {
      await whatsappApi.eliminarRapida(r.id);
      ponerRapidas(rapidas.filter((x) => x.id !== r.id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function mover(r: RespuestaRapidaWa, hacia: -1 | 1) {
    const i = rapidas.findIndex((x) => x.id === r.id);
    const j = i + hacia;
    if (i < 0 || j < 0 || j >= rapidas.length) return;
    const nueva = [...rapidas];
    [nueva[i], nueva[j]] = [nueva[j]!, nueva[i]!];
    ponerRapidas(nueva); // se ve al instante; si falla, vuelve lo del servidor
    try {
      ponerRapidas(await whatsappApi.ordenarRapidas(nueva.map((x) => x.id)));
    } catch (e) {
      setError((e as Error).message);
      void recargarRapidas();
    }
  }

  async function copiar(r: RespuestaRapidaWa) {
    try {
      await navigator.clipboard.writeText(r.texto);
      setCopiada(r.id);
      setTimeout(() => setCopiada((actual) => (actual === r.id ? null : actual)), 1600);
    } catch {
      setError("Este navegador no dejó copiar el texto.");
    }
  }

  const formulario = (
    <form
      className="rr-form"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <label>
        <span>
          Título <i>(para encontrarla rápido: "Saludo", "Cuenta Zelle", "Horario"…)</i>
        </span>
        <input value={borrador.titulo} maxLength={LARGO_TITULO} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} placeholder="Ej. Cuenta Bancolombia" autoFocus />
      </label>
      <label>
        <span>
          Mensaje <i>({borrador.texto.length}/{LARGO_TEXTO})</i>
        </span>
        <textarea
          rows={5}
          value={borrador.texto}
          maxLength={LARGO_TEXTO}
          onChange={(e) => setBorrador({ ...borrador, texto: e.target.value })}
          placeholder="El texto tal como le llega al cliente. Puede tener varios renglones, emojis y *negritas* de WhatsApp."
        />
      </label>
      <div className="rr-form-acciones">
        <button type="submit" className="wa-btn" disabled={!valida || guardando}>
          {guardando ? "Guardando…" : editando === "nueva" ? "Agregar respuesta" : "Guardar cambios"}
        </button>
        <button type="button" className="wa-btn secundario" onClick={() => setEditando(null)} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  );

  return (
    <div className="wa-panel-scroll rr-panel">
      <header className="rr-encabezado">
        <div>
          <h1>
            <ClipboardList size={22} /> Respuestas rápidas
          </h1>
          <p>
            Los mensajes que más se repiten, ya escritos. En cualquier chat se abren con el botón del portapapeles (o escribiendo <kbd>/</kbd>), se toca una y queda en el mensaje lista
            para enviar o retocar.
          </p>
        </div>
        <button className="wa-btn" onClick={() => abrir("nueva")} disabled={editando === "nueva"}>
          <Plus size={16} /> Nueva respuesta
        </button>
      </header>

      {error && (
        <p className="rr-error" role="alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X size={14} />
          </button>
        </p>
      )}

      {editando === "nueva" && <section className="rr-tarjeta editando">{formulario}</section>}

      <div className="rr-barra">
        <label className="rr-buscar">
          <Search size={15} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por título o por texto…" aria-label="Buscar respuestas rápidas" />
        </label>
        <span className="rr-cuenta">
          {buscando ? `${visibles.length} de ${rapidas.length}` : `${rapidas.length} ${rapidas.length === 1 ? "respuesta" : "respuestas"}`}
        </span>
      </div>

      {rapidas.length === 0 && editando !== "nueva" && (
        <div className="rr-sin-nada">
          <ClipboardList size={34} />
          <strong>Todavía no hay respuestas rápidas</strong>
          <span>Cargá la primera: el saludo, las cuentas para recibir, el horario, cómo retirar…</span>
          <button className="wa-btn" onClick={() => abrir("nueva")}>
            <Plus size={16} /> Nueva respuesta
          </button>
        </div>
      )}
      {rapidas.length > 0 && visibles.length === 0 && <p className="rr-vacio">Ninguna coincide con "{busqueda}".</p>}

      <div className="rr-grilla">
        {visibles.map((r) => {
          const posicion = rapidas.findIndex((x) => x.id === r.id);
          return editando === r.id ? (
            <section key={r.id} className="rr-tarjeta editando">
              {formulario}
            </section>
          ) : (
            <article key={r.id} className="rr-tarjeta">
              <header>
                <h2>{r.titulo}</h2>
                <div className="rr-tarjeta-acciones">
                  {!buscando && (
                    <>
                      <button onClick={() => void mover(r, -1)} disabled={posicion === 0} title="Subir" aria-label={`Subir "${r.titulo}"`}>
                        <ArrowUp size={15} />
                      </button>
                      <button onClick={() => void mover(r, 1)} disabled={posicion === rapidas.length - 1} title="Bajar" aria-label={`Bajar "${r.titulo}"`}>
                        <ArrowDown size={15} />
                      </button>
                    </>
                  )}
                  <button onClick={() => void copiar(r)} title="Copiar al portapapeles" aria-label={`Copiar "${r.titulo}"`}>
                    {copiada === r.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button onClick={() => abrir(r.id, r)} title="Editar" aria-label={`Editar "${r.titulo}"`}>
                    <Pencil size={15} />
                  </button>
                  <button className="peligro" onClick={() => void eliminar(r)} title="Eliminar" aria-label={`Eliminar "${r.titulo}"`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </header>
              <p className="rr-globo">{r.texto}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
