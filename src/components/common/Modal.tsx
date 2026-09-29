import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Modal({
  titulo,
  onCerrar,
  ancho = "angosto",
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  ancho?: "angosto" | "ancho";
  children: ReactNode;
}) {
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  // Portal a <body>: el modal no queda anidado en el DOM de quien lo abre (p. ej. dentro de otro <form>).
  return createPortal(
    <div className="modal-fondo" onClick={onCerrar}>
      <div className={`modal-caja modal-${ancho}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="modal-encabezado">
          <h3>{titulo}</h3>
          <button className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>,
    document.body
  );
}
