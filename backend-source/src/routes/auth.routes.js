import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import {
  changePassword,
  forgotPassword,
  getSecurityQuestion,
  issueDevToken,
  login,
  me,
  patchMe,
  register
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.get("/security-question", getSecurityQuestion);
router.post("/forgot-password", forgotPassword);
router.post("/change-password", authRequired, changePassword);
router.get("/me", authRequired, me);
router.patch("/me", authRequired, patchMe);
router.get("/dev/token", issueDevToken);

export default router;
