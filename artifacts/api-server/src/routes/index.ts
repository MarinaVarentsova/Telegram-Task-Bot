import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kanbanRouter from "./kanban";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/kanban", kanbanRouter);
router.use(telegramRouter); // POST /api/telegram-webhook

export default router;
