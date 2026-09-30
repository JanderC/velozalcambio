import { useEffect, useState } from "react";
import { CircleCheck, KeyRound, LogOut, QrCode, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { whatsappApi, type ConexionWa } from "../../api/whatsapp.api";
import { useStreamWhatsapp } from "./useStreamWhatsapp";

const ETIQUETAS: Record<ConexionWa["estado"], { texto: string; clase: string }> = {
  CONECTADO: { texto: "Conectado", clase: "ok" },
  CONECTANDO: { texto: "Conectando…", clase: "espera" },
  ESPERANDO_QR: { texto: "Esperando vinculación", clase: "espera" },
  DESCONECTADO: { texto: "Desconectado", clase: "mal" },
  REEMPLAZADA: { texto: "Abierto en otro lugar", clase: "mal" },
};

export function ConexionPanel() {
  const [conexion, setConexion] = useState<ConexionWa | null>(null);
  const [modo, setModo] = useState<"qr" | "codigo">("qr");
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    whatsappApi.estado().then(setConexion).catch((e) => setError((e as Error).message));
  }, []);

  useStreamWhatsapp((tipo, datos) => {
    if (tipo !== "conexion") return;
    setConexion((c) => ({ ...(c ?? ({} as ConexionWa)), ...(datos as ConexionWa) }));
    if ((datos as ConexionWa).estado === "CONECTADO") setCodigo(null);
  });

  async function accion(fn: () => Promise<ConexionWa | void>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fn();
      if (r) setConexion(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    setCodigo(null);
    try {
      const r = await whatsappApi.pedirCodigo(numero);
      setCodigo(r.codigo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const e = conexion?.estado ?? "DESCONECTADO";
  const etiqueta = ETIQUETAS[e];

  return (
    <div className="wa-panel-scroll">
      <div className="wa-tarjetas">
        <section className="wa-tarjeta">
          <h2>Conexión de WhatsApp</h2>
          <span className={`wa-estado ${etiqueta.clase}`}>
            <span className="punto" /> {etiqueta.texto}
          </span>
          {conexion?.numero && (
            <p className="wa-sub">
              Número vinculado: <strong>+{conexion.numero}</strong>
              {conexion.nombre ? ` (${conexion.nombre})` : ""}
            </p>
          )}
          {conexion?.cola && (
            <p className="wa-sub">
              Hoy salieron {conexion.cola.enviadosHoy} mensajes · en cola: {conexion.cola.enCola}
            </p>
          )}

          {e === "CONECTADO" && (
            <p className="wa-ok">
              <CircleCheck size={16} /> Todo en orden. La sesión se guarda en la base de datos: los despliegues no la borran.
            </p>
          )}

          {e === "REEMPLAZADA" && (
            <div className="wa-alerta">
              <TriangleAlert size={16} />
              <span>
                Otra instancia abrió esta misma sesión (otro servidor o una prueba local). No se reconecta solo para que no se peleen. Cerrá la otra y
                reconectá acá.
              </span>
            </div>
          )}

          {(e === "DESCONECTADO" || e === "REEMPLAZADA") && (
            <div className="wa-botones">
              <button className="wa-btn" disabled={ocupado} onClick={() => accion(e === "REEMPLAZADA" ? whatsappApi.reconectar : whatsappApi.iniciar)}>
                <RefreshCw size={16} /> {e === "REEMPLAZADA" ? "Reconectar" : "Conectar"}
              </button>
            </div>
          )}

          {(e === "ESPERANDO_QR" || e === "CONECTANDO") && (
            <>
              <div className="wa-modos" role="tablist">
                <button role="tab" aria-selected={modo === "qr"} className={modo === "qr" ? "activo" : ""} onClick={() => setModo("qr")}>
                  <QrCode size={15} /> Código QR
                </button>
                <button role="tab" aria-selected={modo === "codigo"} className={modo === "codigo" ? "activo" : ""} onClick={() => setModo("codigo")}>
                  <KeyRound size={15} /> Código de 8 dígitos
                </button>
              </div>
              {modo === "qr" ? (
                <div className="wa-qr">
                  {conexion?.qr ? <img src={conexion.qr} alt="Código QR para vincular WhatsApp" /> : <span>Generando el código…</span>}
                  <ol>
                    <li>Abrí WhatsApp en el teléfono del negocio.</li>
                    <li>Menú ⋮ o Configuración → Dispositivos vinculados → Vincular un dispositivo.</li>
                    <li>Escaneá este código.</li>
                  </ol>
                </div>
              ) : (
                <form className="wa-form" onSubmit={pedirCodigo}>
                  <label>
                    Número del WhatsApp del negocio (con código de país)
                    <input value={numero} onChange={(ev) => setNumero(ev.target.value)} placeholder="57 300 123 4567" inputMode="tel" />
                  </label>
                  <button className="wa-btn" disabled={ocupado || numero.replace(/\D/g, "").length < 10}>
                    {ocupado ? "Pidiendo código…" : "Pedir código"}
                  </button>
                  {codigo && (
                    <div className="wa-codigo">
                      <span>{codigo.slice(0, 4)}</span>
                      <span>{codigo.slice(4)}</span>
                    </div>
                  )}
                  {codigo && <p className="wa-ayuda">En el teléfono: Dispositivos vinculados → Vincular con el número de teléfono, y escribí este código.</p>}
                </form>
              )}
            </>
          )}

          {error && <p className="wa-error">{error}</p>}
          {conexion?.ultimoError && e !== "CONECTADO" && <p className="wa-sub">Último error: {conexion.ultimoError}</p>}
        </section>

        <section className="wa-tarjeta">
          <h2>Mantenimiento</h2>
          <p className="wa-ayuda">
            Si hay fallas de red el sistema reintenta solo, sin límite, y nunca borra la sesión por eso. Estas acciones son para cambiar de número o
            arreglar una sesión dañada.
          </p>
          <div className="wa-botones vertical">
            <button className="wa-btn secundario" disabled={ocupado} onClick={() => accion(whatsappApi.reconectar)}>
              <RefreshCw size={16} /> Reconectar ahora
            </button>
            <button
              className="wa-btn peligro"
              disabled={ocupado}
              onClick={() => accion(whatsappApi.cerrarSesion, "¿Cerrar la sesión? Hay que volver a vincular el teléfono para que el bot funcione.")}
            >
              <LogOut size={16} /> Cerrar sesión (desvincular)
            </button>
            <button
              className="wa-btn peligro"
              disabled={ocupado}
              onClick={() => accion(whatsappApi.reset, "¿Borrar la sesión guardada y empezar de cero? Se pedirá un QR nuevo.")}
            >
              <RotateCcw size={16} /> Reiniciar sesión desde cero
            </button>
          </div>
        </section>

        <section className="wa-tarjeta">
          <h2>Para que Meta no bloquee el número</h2>
          <ul className="wa-consejos">
            <li>Lo más efectivo: que el cliente escriba primero. Usá "Recibir por WhatsApp" al terminar una operación en el mostrador.</li>
            <li>Nada de mensajes largos, iguales y con enlaces a gente que nunca escribió: eso fue lo que bloqueó el número antes.</li>
            <li>Los envíos a contactos nuevos tienen tope diario y pausas largas (ver Bot e IA → Anti-bloqueo).</li>
            <li>Usá un WhatsApp Business con foto, nombre y descripción del negocio.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
