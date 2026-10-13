import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, CheckCheck, MoreVertical } from "lucide-react";
import "./menuChat.css";

/**
 * Los tres puntitos de cada chat de la lista, como en WhatsApp: abren un menú con lo que se puede hacer con ese chat
 * sin abrirlo (archivar o desarchivar, marcar como leído). Va al lado del chat, no adentro: tocarlo no lo abre.
 */
export function MenuChat({ nombre, archivado, sinLeer, onArchivar, onLeer }: { nombre: string; archivado: boolean; sinLeer: number; onArchivar: () => void; onLeer?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  // en los últimos chats de la lista el menú se abre hacia arriba, para que no quede cortado
  const [haciaArriba, setHaciaArriba] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alTocarAfuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alTocarAfuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  const elegir = (accion: () => void) => () => {
    setAbierto(false);
    accion();
  };

  return (
    <span className={`mc ${abierto ? "abierto" : ""}`} ref={caja}>
      <button type="button" className="mc-boton" onClick={() => {
          const lista = caja.current?.closest("ul")?.parentElement ?? null;
          const fondo = lista ? lista.getBoundingClientRect().bottom : window.innerHeight;
          setHaciaArriba((caja.current?.getBoundingClientRect().bottom ?? 0) + 120 > Math.min(fondo, window.innerHeight));
          setAbierto((a) => !a);
        }} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Opciones del chat con ${nombre}`} title="Opciones del chat">
        <MoreVertical size={18} />
      </button>
      {abierto && (
        <span className={`mc-menu ${haciaArriba ? "arriba" : ""}`} role="menu">
          <button type="button" role="menuitem" onClick={elegir(onArchivar)}>
            {archivado ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {archivado ? "Desarchivar chat" : "Archivar chat"}
          </button>
          {onLeer && sinLeer > 0 && (
            <button type="button" role="menuitem" onClick={elegir(onLeer)}>
              <CheckCheck size={16} />
              Marcar como leído
            </button>
          )}
        </span>
      )}
    </span>
  );
}
