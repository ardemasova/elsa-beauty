import http from "./http";

export const getMasters = () => http.get("/masters");
export const createMaster = data => http.post("/masters", data);