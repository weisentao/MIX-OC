import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { getMainAppState, saveMainAppState } from "../controllers/appState.controller.js";

const router = Router();

router.get("/appState/main", authRequired, getMainAppState);
router.put("/appState/main", authRequired, saveMainAppState);

export default router;

