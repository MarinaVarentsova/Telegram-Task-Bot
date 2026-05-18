import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kanbanRouter from "./kanban";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/kanban", kanbanRouter);

export default router;
