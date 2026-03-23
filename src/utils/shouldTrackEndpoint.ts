import { Request } from "express";

import { IGNORE_ENDPOINT } from "../constants/const.js";

export function shouldTrackEndpoint(req: Request): boolean {
  const path = req.path;

  if (path.includes(".")) return false;

  if (IGNORE_ENDPOINT.includes(path)) return false;

  if (path === "/favicon.ico") return false;

  return true;
}
