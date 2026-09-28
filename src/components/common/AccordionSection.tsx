import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function AccordionSection({
  titulo,
  icono,
  abiertoInicial = true,
  children,
}: {
  titulo: string;
  icono?: ReactNode;
  abiertoInicial?: boolean;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);

  return (
    <div className="accordion-section">
      <button className="accordion-header" onClick={() => setAbierto((a) => !a)}>
        <span className="accordion-header-left">
          {icono && <span className="accordion-icon">{icono}</span>}
          {titulo}
        </span>
        <ChevronDown size={18} className={`accordion-chevron ${abierto ? "abierto" : ""}`} />
      </button>
      {abierto && <div className="accordion-body">{children}</div>}
    </div>
  );
}