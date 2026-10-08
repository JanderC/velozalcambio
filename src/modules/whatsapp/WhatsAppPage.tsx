import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Bot, ClipboardList, MessageCircle, Send, Smartphone } from "lucide-react";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../auth/useAuth";
import { ChatsPanel } from "./chats/ChatsPanel";
import { ConexionPanel } from "./ConexionPanel";
import { EnviosPanel } from "./EnviosPanel";
import { ConfigIaPanel } from "./ia/ConfigIaPanel";
import { RespuestasRapidasPanel } from "./rapidas/RespuestasRapidasPanel";
import "./whatsapp.css";

export function WhatsAppPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMIN";

  return (
    <div className="wa-page">
      <Header />
      <nav className="wa-tabs" aria-label="Secciones de WhatsApp">
        <NavLink to="/whatsapp" end className={({ isActive }) => (isActive ? "activo" : "")}>
          <MessageCircle size={16} /> Chats
        </NavLink>
        <NavLink to="/whatsapp/envios" className={({ isActive }) => (isActive ? "activo" : "")}>
          <Send size={16} /> Envíos
        </NavLink>
        {esAdmin && (
          <NavLink to="/whatsapp/conexion" className={({ isActive }) => (isActive ? "activo" : "")}>
            <Smartphone size={16} /> Líneas
          </NavLink>
        )}
        {esAdmin && (
          <NavLink to="/whatsapp/ia" className={({ isActive }) => (isActive ? "activo" : "")}>
            <Bot size={16} /> Bot e IA
          </NavLink>
        )}
        <NavLink to="/whatsapp/rapidas" className={({ isActive }) => (isActive ? "activo" : "")}>
          <ClipboardList size={16} /> Respuestas rápidas
        </NavLink>
      </nav>
      <div className="wa-contenido">
        <Routes>
          <Route index element={<ChatsPanel />} />
          <Route path="envios" element={<EnviosPanel />} />
          {esAdmin && <Route path="conexion" element={<ConexionPanel />} />}
          {esAdmin && <Route path="ia" element={<ConfigIaPanel />} />}
          <Route path="rapidas" element={<RespuestasRapidasPanel />} />
          <Route path="*" element={<Navigate to="/whatsapp" replace />} />
        </Routes>
      </div>
    </div>
  );
}
