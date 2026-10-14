import type { LucideIcon } from "lucide-react";
import type { Rol } from "./auth.types";

export interface ModuloConfig {
  id: string;
  titulo: string;
  categoria: string;
  acento: string; // color de acento (borde + ícono), no el fondo completo de la tarjeta
  icono: LucideIcon;
  ruta: string;
  rolesPermitidos: Rol[];
  // oculto: no aparece en el panel de módulos ni en los favoritos (se vuelve a mostrar quitando esta marca)
  oculto?: boolean;
}