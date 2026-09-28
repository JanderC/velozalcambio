import { api } from "./client";

interface LoginResponse {
  token: string;
}

export function login(email: string, password: string) {
  return api.post<LoginResponse>("/auth/login", { email, password });
}