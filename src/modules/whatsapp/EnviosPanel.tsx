import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { whatsappApi, type OutboxWa } from "../../api/whatsapp.api";
import { useStreamWhatsapp } from "./useStreamWhatsapp";
import { haceMinutos } from "./utilidades";

const ESTADOS: Record<OutboxWa["estado"], { texto: string; clase: string }> = {
  EN_COLA: { texto: "En cola", clase: "espera" },
  ESPERA_CLIENTE: { texto: "Espera que escriba", clase: "espera" },
  ENVIANDO: { texto: "Enviando", clase: "espera" },
  ENVIADO: { texto: "Enviado", clase: "ok" },
  ERROR: { texto: "Error", clase: "mal" },
};

/** Envíos salientes (recibos, confirmaciones, avisos) con su estado. */
export function EnviosPanel() {
  const [items, setItems] = useState<OutboxWa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    whatsappApi
      .outbox()
      .then(setItems)
      .catch((e) => setError((e as Error).message))
      .finally(() => setCargando(false));
  }, []);

  useStreamWhatsapp((tipo, datos) => {
    if (tipo !== "outbox") return;
    const it = datos as OutboxWa;
    setItems((lista) => (lista.some((x) => x.id === it.id) ? lista.map((x) => (x.id === it.id ? { ...x, ...it } : x)) : [it, ...lista]));
  });

  async function reintentar(id: string) {
    setError(null);
    try {
      await whatsappApi.reintentarOutbox(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="wa-panel-scroll">
      <section className="wa-tarjeta ancha">
        <h2>Envíos salientes</h2>
        <p className="wa-ayuda">
          Avisos de operaciones confirmadas o rechazadas, recibos y vencimientos. Salen de a uno, con pausas. A quien nunca nos escribió se le manda
          poco y solo de día; si se llega al tope, espera a que el cliente escriba.
        </p>
        {error && <p className="wa-error">{error}</p>}
        {cargando && <p className="wa-lista-aviso">Cargando…</p>}
        {!cargando && items.length === 0 && <p className="wa-lista-aviso">Todavía no hay envíos.</p>}
        <ul className="wa-envios">
          {items.map((it) => {
            const e = ESTADOS[it.estado];
            return (
              <li key={it.id}>
                <div className="wa-envio-cabeza">
                  <strong>{it.nombre_guardado ?? it.nombre ?? `+${it.telefono ?? it.jid.split("@")[0]}`}</strong>
                  <span className={`wa-estado ${e.clase}`}>
                    <span className="punto" /> {e.texto}
                  </span>
                </div>
                <p className="wa-envio-texto">{it.texto}</p>
                <p className="wa-sub">
                  {it.estado === "ENVIADO" ? `Enviado ${haceMinutos(it.enviado_en)}` : `Creado ${haceMinutos(it.created_at)}`}
                  {it.frio ? " · contacto nuevo" : ""}
                  {it.intentos > 0 ? ` · ${it.intentos} intento(s)` : ""}
                  {it.estado === "EN_COLA" && new Date(it.proximo_intento) > new Date() ? ` · próximo intento ${new Date(it.proximo_intento).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}` : ""}
                </p>
                {it.error && it.estado === "ERROR" && <p className="wa-envio-error">{it.error}</p>}
                {it.error && (it.estado === "EN_COLA" || it.estado === "ESPERA_CLIENTE") && <p className="wa-sub">{it.error}</p>}
                {it.estado === "ERROR" && (
                  <button className="wa-btn chico secundario" onClick={() => reintentar(it.id)}>
                    <RotateCw size={14} /> Reintentar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
