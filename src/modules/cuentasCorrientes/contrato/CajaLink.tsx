import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { urlDeFirma, type LinkFirma } from "../../../api/contratos.api";

const soloDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** El link para firmar, con copiar y mandarlo por WhatsApp (al teléfono, si se sabe; si no, se elige el contacto). */
export function CajaLink({ link, telefono, para, mensaje }: { link: LinkFirma; telefono?: string | null; para: string; mensaje?: string }) {
  const url = urlDeFirma(link.token);
  const [copiado, setCopiado] = useState(false);
  const texto = `Hola ${para.split(/\s+/)[0] || ""}, ${mensaje ?? "para el contrato de Pago Veloz al Cambio necesitamos tu firma"}. Ábrelo y firma con el dedo: ${url}`;
  const tel = soloDigitos(telefono);
  return (
    <div className={`cc-link-firma ${link.estado === "FIRMADO" ? "firmado" : ""}`}>
      <span>{link.estado === "FIRMADO" ? "✓ Firmado desde el link" : link.estado === "VENCIDO" ? "El link venció" : "Link para firmar (pendiente)"}</span>
      {link.estado === "PENDIENTE" && (
        <>
          <input value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Link para firmar" />
          <div className="cc-firma-botones">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                });
              }}
            >
              <Copy size={13} /> {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <a className="cc-link-wa" href={`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={13} /> Mandar por WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}
