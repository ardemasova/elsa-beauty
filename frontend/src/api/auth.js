import http from "./http";

export function login(email, password, schema_name) {
  return http.post("/auth/login", { email, password, schema_name });
}