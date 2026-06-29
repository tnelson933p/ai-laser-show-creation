import { Router, type IRouter } from "express";
import healthRouter from "./health";
import laserRouter from "./laser";

const router: IRouter = Router();

router.use(healthRouter);
router.use(laserRouter);

export default router;
