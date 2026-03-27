import { NextApiRequest, NextApiResponse } from "next";

// ─── STANDARD RESPONSE ENVELOPE ──────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    generatedAt: string;
  };
}

export function ok<T>(
  res: NextApiResponse<ApiResponse<T>>,
  data: T,
  meta?: Omit<ApiResponse<T>["meta"], "generatedAt">
) {
  return res.status(200).json({
    success: true,
    data,
    meta: { ...meta, generatedAt: new Date().toISOString() },
  });
}

export function created<T>(res: NextApiResponse<ApiResponse<T>>, data: T) {
  return res.status(201).json({
    success: true,
    data,
    meta: { generatedAt: new Date().toISOString() },
  });
}

export function badRequest(res: NextApiResponse, message: string) {
  return res.status(400).json({ success: false, error: message });
}

export function notFound(res: NextApiResponse, message = "Not found") {
  return res.status(404).json({ success: false, error: message });
}

export function methodNotAllowed(res: NextApiResponse, allowed: string[]) {
  res.setHeader("Allow", allowed);
  return res.status(405).json({
    success: false,
    error: `Method not allowed. Allowed: ${allowed.join(", ")}`,
  });
}

export function serverError(res: NextApiResponse, error: unknown) {
  console.error("[API Error]", error);
  return res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === "development"
        ? String(error)
        : "Internal server error",
  });
}

// ─── PAGINATION HELPER ────────────────────────────────────────────────────────

export function parsePagination(req: NextApiRequest) {
  const page     = Math.max(1, parseInt(String(req.query.page     || "1")));
  const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize || "50"))));
  const skip     = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

// ─── METHOD GUARD ─────────────────────────────────────────────────────────────

export function allowMethods(
  req: NextApiRequest,
  res: NextApiResponse,
  allowed: string[]
): boolean {
  if (!allowed.includes(req.method || "")) {
    methodNotAllowed(res, allowed);
    return false;
  }
  return true;
}
