import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /api/healthz — used by Replit deployment health checks
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// GET /api/health — human-friendly alias
router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-server" });
});

export default router;
