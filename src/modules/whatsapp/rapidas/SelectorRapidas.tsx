import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ClipboardList, Copy, Search, Settings2 } from "lucide-react";
import { useAuth } from "../../../auth/useAuth";
import { filtrarRapidas, useRespuestasRapidas } from "./useRespuestasRapidas";
import "./rapidas.css";

/**
 * El portapapeles de respuestas rápidas de un chat: se busca, se toca una y queda escrita en el mensaje (no se envía
 * sola: se puede retocar antes). El ícono de copiar la deja en el portapapeles de la PC.
 * filtro: cuando lo abre el "/" del mensaje, lo que se escribió después de la barra hace de buscador.
 */
export function SelectorRapidas({ filtro, onElegir, onCerrar, compacto = false }: { filtro?: string; onElegir: (texto: string) => void; onCerrar: () => void; compacto?: boolean }) {
  const rapidas = useRespuestasRapidas();
  // el cajero atiende desde la burbuja pero no entra al módulo de WhatsApp: no se le ofrece administrarlas
  const { usuario } = useAuth();
  const puedeAdministrar = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  const [busqueda, setBusqueda] = useState("");
  const [copiada, setCopiada] = useState<number | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const porBarra = filtro !== undefined;
  const visibles = filtrarRapidas(rapidas, porBarra ? filtro : busqueda);

  useEffect(() => {
    if (!porBarra) buscador.current?.focus();
  }, [porBarra]);

  async function copiar(id: number, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiada(id);
      setTimeout(() => setCopiada((actual) => (actual === id ? null : actual)), 1600);
    } catch {
      // el navegador no dejó copiar: se usa tocando la respuesta
    }
  }

  return (
    <div className={`rr-selector ${compacto ? "compacto" : ""}`} role="dialog" aria-label="Respuestas rápidas">
      <div className="rr-selector-cabeza">
        <span className="rr-selector-titulo">
          <ClipboardList size={16} /> Respuestas rápidas
        </span>
        {puedeAdministrar && (
          <Link to="/whatsapp/rapidas" className="rr-selector-admin" title="Cargar o editar las respuestas rápidas" onClick={onCerrar}>
            <Settings2 size={14} /> Administrar
          </Link>
        )}
      </div>
      {!porBarra && (
        <label className="rr-buscar">
          <Search size={15} />
          <input
            ref={buscador}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visibles[0]) {
                e.preventDefault();
                onElegir(visibles[0].texto);
              } else if (e.key === "Escape") onCerrar();
            }}
            placeholder="Buscar por título o por texto…"
            aria-label="Buscar una respuesta rápida"
          />
        </label>
      )}
      <div className="rr-lista" role="listbox">
        {rapidas.length === 0 && <p className="rr-vacio">Todavía no hay respuestas rápidas. Se cargan en WhatsApp → Respuestas rápidas.</p>}
        {rapidas.length > 0 && visibles.length === 0 && <p className="rr-vacio">Ninguna coincide con "{porBarra ? filtro : busqueda}".</p>}
        {visibles.map((r, i) => (
          <div key={r.id} className={`rr-item ${i === 0 && (porBarra || busqueda.trim()) ? "primera" : ""}`}>
            <button type="button" className="rr-item-usar" onClick={() => onElegir(r.texto)} title="Poner este texto en el mensaje (no se envía solo)">
              <b>{r.titulo}</b>
              <span>{r.texto}</span>
            </button>
            <button type="button" className="rr-item-copiar" onClick={() => void copiar(r.id, r.texto)} title="Copiar al portapapeles" aria-label={`Copiar "${r.titulo}" al portapapeles`}>
              {copiada === r.id ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        ))}
      </div>
      <p className="rr-pie">
        {porBarra ? "Enter pone la primera · seguí escribiendo para buscar" : compacto ? "Tocá una y queda escrita en el mensaje: no se envía sola" : 'También se abren escribiendo "/" en el mensaje'}
      </p>
    </div>
  );
}
