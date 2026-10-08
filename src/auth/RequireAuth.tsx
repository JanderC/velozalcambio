import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";
import { BurbujaWhatsapp } from "../components/whatsapp/BurbujaWhatsapp";

export function RequireAuth() {
  const { usuario, cargando } = useAuth();

  if (cargando) return null; // evita un parpadeo a /login mientras se lee localStorage
  if (!usuario) return <Navigate to="/login" replace />;

  return (
    <>
      <Outlet />
      {/* La burbuja de WhatsApp acompaña en todos los módulos: avisa cuando un cliente escribe y deja responder ahí mismo */}
      <BurbujaWhatsapp />
    </>
  );
}
