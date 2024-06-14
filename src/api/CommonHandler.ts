import { Request } from "express";
import type { SCLABResponseData } from "../types";

export class CommonHandler {
  static async handle(req: Request): Promise<SCLABResponseData> {
    return { status: "error", result: `Undefined api ${req.path}` };
  }
}
