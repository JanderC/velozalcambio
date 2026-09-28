import { useState, type ReactNode } from "react";

export function AccordionSection({
  titulo,
  icono,
  abiertoInicial = true,
  children,
}: {
  titulo: string;
  icono?: string;
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
        <span className={`accordion-chevron ${abierto ? "abierto" : ""}`}>▾</span>
      </button>
      {abierto && <div className="accordion-body">{children}</div>}
    </div>
  );
}