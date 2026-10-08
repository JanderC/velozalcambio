import { useEffect, useState } from "react";
import { CircleCheck, KeyRound, LogOut, QrCode, RefreshCw, RotateCcw, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { LINEAS_WA, whatsappApi, type ConexionWa, type LineaWa } from "../../api/whatsapp.api";
import { useStreamWhatsapp } from "./useStreamWhatsapp";

const ETIQUETAS: Record<ConexionWa["estado"], { texto: string; clase: string }> = {
  CONECTADO: { texto: "Conectado", clase: "ok" },
  CONECTANDO: { texto: "Conectando…", clase: "espera" },
  ESPERANDO_QR: { texto: "Esperando vinculación", clase: "espera" },
  DESCONECTADO: { texto: "Sin vincular", clase: "mal" },
  REEMPLAZADA: { texto: "Abierto en otro lugar", clase: "mal" },
};

/**
 * Las tres líneas de WhatsApp del negocio (Bolívares, Pesos y Dólares): cada una se vincula con su propio teléfono
 * y tiene su propia sesión. Vincular, reconectar o cerrar una no toca a las otras.
 */
export function ConexionPanel() {
  const [lineas, setLineas] = useState<ConexionWa[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    whatsappApi
      .lineas()
      .then(setLineas)
      .catch((e) => setError((e as Error).message));
  }, []);

  useStreamWhatsapp((tipo, datos) => {
    if (tipo !== "conexion") return;
    const c = datos as ConexionWa;
    setLineas((lista) => (lista.some((l) => l.linea === c.linea) ? lista.map((l) => (l.linea === c.linea ? { ...l, ...c } : l)) : [...lista, c]));
  });

  const actualizar = (c: ConexionWa) => setLineas((lista) => lista.map((l) => (l.linea === c.linea ? { ...l, ...c } : l)));
  const conectadas = lineas.filter((l) => l.estado === "CONECTADO").length;

  return (
    <div className="wa-panel-scroll">
      <div className="wa-lineas-cabeza">
        <h2>Líneas de WhatsApp</h2>
        <p>
          Cada línea es un teléfono del negocio. Vinculá los tres para ver y responder todos los chats desde acá. {lineas.length > 0 && `${conectadas} de ${LINEAS_WA.length} conectadas.`}
        </p>
        {error && <p className="wa-error">{error}</p>}
      </div>

      <div className="wa-tarjetas wa-tarjetas-lineas">
        {LINEAS_WA.map((l) => (
          <TarjetaLinea key={l.id} linea={l.id} nombre={l.nombre} conexion={lineas.find((x) => x.linea === l.id) ?? null} onCambio={actualizar} />
        ))}
      </div>

      <div className="wa-tarjetas">
        <section className="wa-tarjeta wa-tarjeta-proteccion">
          <h2>
            <ShieldCheck size={18} /> Cómo se protegen los números
          </h2>
          <ul className="wa-consejos">
            <li>
              <strong>Si el cliente escribió, se le responde con normalidad.</strong> Esa es la conversación más segura para WhatsApp.
            </li>
            <li>
              <strong>Si nunca escribió a esa línea, sale un solo mensaje.</strong> Hasta que conteste, el sistema no deja mandarle otro, ni desde acá ni desde la burbuja ni
              desde Confirmaciones.
            </li>
            <li>Antes de ese primer mensaje se comprueba que el número tenga WhatsApp.</li>
            <li>El mismo texto a varios clientes que nunca escribieron se corta: es lo que WhatsApp toma por difusión.</li>
            <li>Cada línea tiene su propio tope por minuto y por día, con pausas entre mensajes (se ajustan en Bot e IA → Anti-bloqueo).</li>
            <li>Lo más efectivo sigue siendo que el cliente escriba primero, y usar un WhatsApp Business con foto, nombre y descripción.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function TarjetaLinea({ linea, nombre, conexion, onCambio }: { linea: LineaWa; nombre: string; conexion: ConexionWa | null; onCambio: (c: ConexionWa) => void }) {
  const [modo, setModo] = useState<"qr" | "codigo">("qr");
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e = conexion?.estado ?? "DESCONECTADO";
  const etiqueta = ETIQUETAS[e];
  useEffect(() => {
    if (e === "CONECTADO") setCodigo(null);
  }, [e]);

  async function accion(fn: (l: LineaWa) => Promise<ConexionWa>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    setError(null);
    try {
      onCambio(await fn(linea));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function pedirCodigo(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    setError(null);
    setCodigo(null);
    try {
      setCodigo((await whatsappApi.pedirCodigo(numero, linea)).codigo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className={`wa-tarjeta wa-linea l${linea} ${e === "CONECTADO" ? "conectada" : ""}`}>
      <header className="wa-linea-titulo">
        <span className="wa-linea-icono">
          <Smartphone size={18} />
        </span>
        <div>
          <h2>{nombre}</h2>
          <span className={`wa-estado ${etiqueta.clase}`}>
            <span className="punto" /> {etiqueta.texto}
          </span>
        </div>
      </header>

      {conexion?.numero && (
        <p className="wa-sub">
          Número vinculado: <strong>+{conexion.numero}</strong>
          {conexion.nombre ? ` (${conexion.nombre})` : ""}
        </p>
      )}
      {e === "CONECTADO" && conexion?.cola && (
        <p className="wa-sub">
          Hoy salieron {conexion.cola.enviadosHoy} mensajes · en cola: {conexion.cola.enCola}
          {conexion.sinLeer && conexion.sinLeer.mensajes > 0 ? ` · ${conexion.sinLeer.mensajes} sin leer` : ""}
        </p>
      )}

      {e === "CONECTADO" && (
        <p className="wa-ok">
          <CircleCheck size={16} /> Lista. La sesión queda guardada: los despliegues no la borran.
        </p>
      )}

      {e === "REEMPLAZADA" && (
        <div className="wa-alerta">
          <TriangleAlert size={16} />
          <span>Otra instancia abrió esta misma sesión (otro servidor o una prueba local). No se reconecta sola para que no se peleen: cerrá la otra y reconectá acá.</span>
        </div>
      )}

      {(e === "DESCONECTADO" || e === "REEMPLAZADA") && (
        <div className="wa-botones">
          <button className="wa-btn" disabled={ocupado} onClick={() => accion(e === "REEMPLAZADA" ? whatsappApi.reconectar : whatsappApi.iniciar)}>
            <RefreshCw size={16} /> {e === "REEMPLAZADA" ? "Reconectar" : `Vincular el teléfono de ${nombre}`}
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
              {conexion?.qr ? <img src={conexion.qr} alt={`Código QR para vincular la línea ${nombre}`} /> : <span>Generando el código…</span>}
              <ol>
                <li>Abrí WhatsApp en el teléfono de {nombre}.</li>
                <li>Menú ⋮ o Configuración → Dispositivos vinculados → Vincular un dispositivo.</li>
                <li>Escaneá este código.</li>
              </ol>
            </div>
          ) : (
            <form className="wa-form" onSubmit={pedirCodigo}>
              <label>
                Número del WhatsApp de {nombre} (con código de país)
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

      {/* Mantenimiento de esta línea: solo si tiene o tuvo sesión */}
      {(e === "CONECTADO" || e === "CONECTANDO" || e === "ESPERANDO_QR") && (
        <details className="wa-linea-mantenimiento">
          <summary>Mantenimiento</summary>
          <div className="wa-botones vertical">
            <button className="wa-btn secundario" disabled={ocupado} onClick={() => accion(whatsappApi.reconectar)}>
              <RefreshCw size={16} /> Reconectar ahora
            </button>
            <button
              className="wa-btn peligro"
              disabled={ocupado}
              onClick={() => accion(whatsappApi.cerrarSesion, `¿Cerrar la sesión de la línea ${nombre}? Hay que volver a vincular ese teléfono. Las otras líneas no se tocan.`)}
            >
              <LogOut size={16} /> Cerrar sesión (desvincular)
            </button>
            <button
              className="wa-btn peligro"
              disabled={ocupado}
              onClick={() => accion(whatsappApi.reset, `¿Borrar la sesión guardada de la línea ${nombre} y empezar de cero? Se pedirá un QR nuevo.`)}
            >
              <RotateCcw size={16} /> Reiniciar sesión desde cero
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
