import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";
import { RequireRole } from "../auth/RequireRole";
import { LoginPage } from "../auth/LoginPage";
import { LauncherPage } from "../modules/launcher/LauncherPage";
import { CajaPage } from "../modules/caja/CajaPage";
import { ClientesPage } from "../modules/clientes/ClientesPage";
import { SolicitudesPage } from "../modules/solicitudes/SolicitudesPage";
import { TransaccionesPage } from "../modules/transacciones/TransaccionesPage";
import { CuentasPorCobrarPagarPage } from "../modules/cuentasPorCobrarPagar/CuentasPorCobrarPagarPage";
import { CuentasCorrientesPage } from "../modules/cuentasCorrientes/CuentasCorrientesPage";
import { TasasPage } from "../modules/tasas/TasasPage";
import { CierreCajaPage } from "../modules/cierreCaja/CierreCajaPage";
import { ReportesPage } from "../modules/reportes/ReportesPage";
import { UsuariosPage } from "../modules/usuarios/UsuariosPage";
import { NuevaTransaccionPage } from "../modules/nuevaTransaccion/NuevaTransaccionPage";
import { WhatsAppPage } from "../modules/whatsapp/WhatsAppPage";



export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<LauncherPage />} />
        <Route path="/caja" element={<CajaPage />} />
        <Route path="/tasas" element={<TasasPage />} />
        <Route path="/cuentas-por-cobrar-pagar" element={<CuentasPorCobrarPagarPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/cuentas-corrientes" element={<CuentasCorrientesPage />} />
        <Route path="/reportes" element={<ReportesPage />} />        <Route path="/solicitudes" element={<SolicitudesPage />} />
        <Route path="/transacciones" element={<TransaccionesPage />} />
        <Route path="/cierre-caja" element={<CierreCajaPage />} />
        <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/nueva-transaccion" element={<NuevaTransaccionPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="/whatsapp" element={<WhatsAppPage />} />
        </Route>
      </Route>
    </Routes>
  );
}