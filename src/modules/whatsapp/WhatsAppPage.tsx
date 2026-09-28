import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, Construction, Lightbulb, Smartphone, TriangleAlert } from "lucide-react";
import { Header } from "../../components/common/Header";
import {
  getEstadoWhatsapp,
  iniciarWhatsapp,
  getMensajesWhatsapp,
  marcarMensajeWhatsapp,
  getConfiguracionWhatsapp,
  actualizarConfiguracionWhatsapp,
  type EstadoWhatsapp,
  type MensajeWhatsapp,
} from "../../api/whatsapp.api";
import "./whatsapp.css";

const EXPLICACION = [
  { titulo: "Escaneás el QR", texto: "Con el WhatsApp del negocio, igual que abrirías WhatsApp Web en una computadora nueva." },
  { titulo: "Los mensajes llegan solos", texto: "Cada mensaje entrante se guarda automáticamente en la bandeja de abajo, con el número y el texto." },
  { titulo: "El sistema sugiere el monto", texto: "Si el cliente escribe algo como '100 dólares', el sistema lo detecta y lo muestra como sugerencia -- nunca registra nada solo." },
  { titulo: "Vos decidís qué hacer", texto: "Convertís el mensaje en una solicitud real (vinculando o creando el cliente), o lo descartás si era spam o consulta general." },
];

export function WhatsAppPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoWhatsapp | null>(null);
  const [mensajes, setMensajes] = useState<MensajeWhatsapp[]>([]);
  const [respuestaActiva, setRespuestaActiva] = useState(false);
  const [mensajeAuto, setMensajeAuto] = useState("");
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  async function cargarEstado() {
    const e = await getEstadoWhatsapp();
    setEstado(e);
  }
  async function cargarMensajes() {
    const m = await getMensajesWhatsapp("SIN_REVISAR");
    setMensajes(m);
  }

  useEffect(() => {
    cargarEstado();
    cargarMensajes();
    getConfiguracionWhatsapp().then((c) => {
      setRespuestaActiva(c.respuesta_automatica_activa);
      setMensajeAuto(c.mensaje_automatico);
    });

    const interval = setInterval(() => {
      cargarEstado();
      cargarMensajes();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  async function handleIniciar() {
    await iniciarWhatsapp();
    cargarEstado();
  }

  async function handleGuardarConfig() {
    setGuardandoConfig(true);
    try {
      await actualizarConfiguracionWhatsapp(respuestaActiva, mensajeAuto);
    } finally {
      setGuardandoConfig(false);
    }
  }

  async function handleConvertir(m: MensajeWhatsapp) {
    await marcarMensajeWhatsapp(m.id, "CONVERTIDO", m.tercero_id ?? undefined);
    cargarMensajes();
    navigate("/nueva-transaccion"); // el asesor completa ahí el resto con los datos del cliente ya identificados
  }

  async function handleDescartar(id: number) {
    await marcarMensajeWhatsapp(id, "DESCARTADO");
    cargarMensajes();
  }

  const badgeClase =
    estado?.estado === "CONECTADO" ? "wa-estado-conectado" : estado?.estado === "ESPERANDO_QR" ? "wa-estado-esperando" : "wa-estado-desconectado";
  const badgeTexto =
    estado?.estado === "CONECTADO" ? "Conectado" : estado?.estado === "ESPERANDO_QR" ? "Esperando escaneo" : "Desconectado";

  return (
    <div className="wa-page">
      <Header />
      <div className="wa-header">
        <h1>WhatsApp — Captación de Solicitudes</h1>
        <p>Recibí solicitudes de cambio y capta clientes nuevos directo desde WhatsApp.</p>
      </div>

      <div className="wa-desarrollo">
        <Construction size={20} />
        <div>
          <strong>Módulo en desarrollo.</strong> Falta integrar WhatsApp Business API (Cloud API oficial de Meta).
          Mientras tanto, esta pantalla funciona con la conexión provisional descrita abajo.
        </div>
      </div>

      <div className="wa-aviso">
        <TriangleAlert size={18} />
        <span>Esta conexión usa un método no oficial (no es la API empresarial de Meta). Es rápida de activar, pero el número
        puede ser desconectado por WhatsApp sin aviso previo. Para producción a mayor escala, se recomienda migrar a
        WhatsApp Business Cloud API.</span>
      </div>

      <div className="wa-explicacion">
        {EXPLICACION.map((e, i) => (
          <div className="wa-explicacion-card" key={i}>
            <div className="wa-explicacion-numero">{i + 1}</div>
            <div className="wa-explicacion-titulo">{e.titulo}</div>
            <div className="wa-explicacion-texto">{e.texto}</div>
          </div>
        ))}
      </div>

      <div className="wa-layout">
        <div className="wa-conexion">
          <h3>Conexión</h3>
          <span className={`wa-estado-badge ${badgeClase}`}>
            <span className="wa-estado-dot" /> {badgeTexto}
          </span>

          <div className="wa-qr-box">
            {estado?.estado === "ESPERANDO_QR" && estado.qr ? (
              <img src={estado.qr} alt="Código QR de WhatsApp" />
            ) : estado?.estado === "CONECTADO" ? (
              <span className="wa-qr-vacio wa-qr-conectado"><CircleCheck size={18} /> Ya está conectado, no hace falta escanear nada.</span>
            ) : (
              <span className="wa-qr-vacio">Presioná "Iniciar" para generar el código QR.</span>
            )}
          </div>

          {estado?.estado !== "CONECTADO" && (
            <button className="wa-btn-iniciar" onClick={handleIniciar}>
              <Smartphone size={18} /> Iniciar sesión de WhatsApp
            </button>
          )}
        </div>

        <div className="wa-config">
          <h3>Respuesta automática</h3>
          <label className="wa-config-toggle">
            <input type="checkbox" checked={respuestaActiva} onChange={(e) => setRespuestaActiva(e.target.checked)} />
            Responder automáticamente cada mensaje nuevo
          </label>
          <textarea value={mensajeAuto} onChange={(e) => setMensajeAuto(e.target.value)} placeholder="Escribí el mensaje automático..." />
          <button className="wa-config-guardar" onClick={handleGuardarConfig} disabled={guardandoConfig}>
            {guardandoConfig ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </div>

      <div className="wa-bandeja">
        <h3>Mensajes sin revisar ({mensajes.length})</h3>
        {mensajes.length === 0 ? (
          <p className="wa-bandeja-vacio">No hay mensajes nuevos por revisar.</p>
        ) : (
          mensajes.map((m) => (
            <div className="wa-mensaje-card" key={m.id}>
              <div className="wa-mensaje-top">
                <span className="wa-mensaje-contacto">
                  {m.nombre_contacto ?? m.telefono}
                  {m.tercero_nombre && <span>· cliente: {m.tercero_nombre}</span>}
                </span>
                <span className="wa-mensaje-fecha">{new Date(m.created_at).toLocaleString("es-CO")}</span>
              </div>
              <div className="wa-mensaje-texto">"{m.mensaje}"</div>
              {m.monto_detectado && (
                <div className="wa-mensaje-detectado">
                  <Lightbulb size={15} /> Detectado: {Number(m.monto_detectado).toLocaleString("es-CO")} {m.moneda_codigo}
                </div>
              )}
              <div className="wa-mensaje-acciones">
                <button className="wa-btn-convertir" onClick={() => handleConvertir(m)}>
                  Convertir en solicitud
                </button>
                <button className="wa-btn-descartar" onClick={() => handleDescartar(m.id)}>
                  Descartar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}