import http from "./http";

export const getUsers = () => http.get("/users");
export const createUser = data => http.post("/users", data);