import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, X } from "lucide-react";
import { whatsappApi, type ChatWa, type ClienteLateral } from "../../../api/whatsapp.api";
import { formatearMonto } from "../../../utils/montos";

const ESTADOS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADA: "Confirmada",
  RECHAZADA: "Rechazada",
  ANULADA: "Anulada",
  BLOQUEADA: "Bloqueada",
};

const TIPOS: Record<string, string> = {
  COMPRA_DIVISA: "Nos vendió",
  VENTA_DIVISA: "Nos compró",
  DEPOSITO: "Depósito",
  RETIRO: "Retiro",
};

/** Panel lateral: datos del cliente y su historial en el negocio. */
export function PanelCliente({ jid, onCerrar, onChatActualizado }: { jid: string; onCerrar: () => void; onChatActualizado: (c: ChatWa) => void }) {
  const [datos, setDatos] = useState<ClienteLateral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    setDatos(null);
    whatsappApi
      .cliente(jid)
      .then((d) => {
        setDatos(d);
        setNombre(d.chat.nombreGuardado ?? "");
      })
      .catch((e) => setError((e as Error).message));
  }, [jid]);

  async function guardarNombre() {
    const chat = await whatsappApi.actualizarChat(jid, { nombreGuardado: nombre.trim() || null });
    onChatActualizado(chat);
    setDatos((d) => (d ? { ...d, chat } : d));
    setEditando(false);
  }

  return (
    <aside className="wa-cliente" aria-label="Datos del cliente">
      <header>
        <h3>Datos del cliente</h3>
        <button className="wa-icono" onClick={onCerrar} aria-label="Cerrar">
          <X size={18} />
        </button>
      </header>
      {error && <p className="wa-error">{error}</p>}
      {!datos && !error && <p className="wa-lista-aviso">Cargando…</p>}
      {datos && (
        <div className="wa-cliente-cuerpo">
          <section>
            <span className="wa-etiqueta">Nombre en el chat</span>
            {editando ? (
              <form
                className="wa-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  void guardarNombre();
                }}
              >
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder={datos.chat.nombreWhatsapp ?? ""} />
                <button className="wa-btn chico">Guardar</button>
              </form>
            ) : (
              <p className="wa-valor">
                {datos.chat.nombre}
                <button className="wa-icono chico" onClick={() => setEditando(true)} aria-label="Editar nombre">
                  <Pencil size={13} />
                </button>
              </p>
            )}
            <span className="wa-etiqueta">WhatsApp</span>
            <p className="wa-valor">
              +{datos.chat.telefono}
              {datos.chat.nombreWhatsapp ? ` · "${datos.chat.nombreWhatsapp}"` : ""}
            </p>
          </section>

          {datos.cliente ? (
            <>
              <section>
                <span className="wa-etiqueta">Cliente</span>
                <p className="wa-valor">
                  <Link to={`/clientes/${datos.cliente.id}`}>{datos.cliente.nombre}</Link>
                </p>
                <p className="wa-sub">
                  Doc. {datos.cliente.identificacion ?? "—"} ·{" "}
                  <span className={`wa-verif ${datos.cliente.verificacion.estado === "VERIFICADO" ? "ok" : ""}`}>
                    {datos.cliente.verificacion.estado === "VERIFICADO" ? "Identidad verificada" : "Identidad sin verificar"}
                  </span>
                </p>
                <p className="wa-sub">Cliente desde {new Date(datos.cliente.created_at).toLocaleDateString("es-CO")}</p>
              </section>
              {datos.cuentas.length > 0 && (
                <section>
                  <span className="wa-etiqueta">Cuentas donde recibe</span>
                  <ul className="wa-mini-lista">
                    {datos.cuentas.map((c) => (
                      <li key={c.id}>
                        {c.tipo.replace("_", " ").toLowerCase()} {c.banco ?? ""} {c.numero_cuenta ? `···${c.numero_cuenta.slice(-4)}` : ""} · {c.titular}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <span className="wa-etiqueta">Operaciones recientes</span>
                {datos.operaciones.length === 0 ? (
                  <p className="wa-sub">Sin operaciones todavía.</p>
                ) : (
                  <ul className="wa-mini-lista">
                    {datos.operaciones.map((o) => (
                      <li key={o.id}>
                        <strong>#{o.id}</strong> {TIPOS[o.tipo] ?? o.tipo} {formatearMonto(o.monto_origen)} {o.moneda_origen}
                        <span className={`wa-estado-op ${o.estado.toLowerCase()}`}>{ESTADOS[o.estado] ?? o.estado}</span>
                        <span className="wa-sub">
                          {new Date(o.created_at).toLocaleDateString("es-CO")}
                          {o.origen === "WHATSAPP" ? " · por WhatsApp" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/solicitudes" className="wa-link">
                  Ir a la Bandeja de solicitudes
                </Link>
              </section>
            </>
          ) : (
            <section>
              <p className="wa-sub">Este número no está vinculado a un cliente. El bot lo registra cuando la persona quiere operar.</p>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
