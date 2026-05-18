const jsonServer = require("json-server");
const path = require("path");

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, "db.json"));
const middlewares = jsonServer.defaults();

server.use(jsonServer.bodyParser);
server.use(middlewares);

server.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = router.db.get("authUsers").find({ username, password }).value();

  if (!user) {
    return res.status(401).jsonp({ message: "账号或密码错误" });
  }

  const profile = router.db.get("users").find({ id: user.userId }).value();
  return res.jsonp({
    token: user.token,
    user: profile
  });
});

server.post("/register", (req, res) => {
  const payload = req.body || {};
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  const name = String(payload.name || "").trim();

  if (!/^MIX-[A-Za-z0-9_-]+$/.test(username)) {
    return res.status(400).jsonp({ message: "账号必须以 MIX- 开头，例如 MIX-zhumin" });
  }
  if (!password || !name || !payload.phone || !payload.email || !payload.securityQuestion || !payload.securityAnswer) {
    return res.status(400).jsonp({ message: "请完整填写注册信息" });
  }
  if (router.db.get("authUsers").find({ username }).value()) {
    return res.status(409).jsonp({ message: "账号已存在" });
  }

  const id = `u-${Date.now()}`;
  const user = {
    id,
    name,
    role: "user",
    avatar: name.slice(0, 1).toUpperCase(),
    department: payload.department || "项目管理",
    departmentEn: payload.department === "三维视觉部" ? "3D VISION DEPARTMENT" : "PROJECT MANAGEMENT",
    email: payload.email,
    mbti: payload.mbti || "ENTP",
    job: payload.job || "项目专员",
    phone: payload.phone,
    registeredAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    mood: "今天也要把任务说清楚",
    signature: "所有协作都从清单和评论开始。",
    profileNote: payload.job || "项目专员",
    status: "active",
    characterLabel: payload.job || "项目专员",
    avatarImage: "",
    characterImage: "",
    signatureImage: ""
  };
  const token = `mock-${id}-token`;
  router.db.get("users").push(user).write();
  router.db
    .get("authUsers")
    .push({
      id: username,
      username,
      password,
      userId: id,
      token,
      phone: payload.phone,
      securityQuestion: payload.securityQuestion,
      securityAnswer: String(payload.securityAnswer || "").trim()
    })
    .write();
  const appState = router.db.get("appState").find({ id: "main" }).value();
  if (appState?.users) {
    appState.users.push(user);
    router.db.get("appState").find({ id: "main" }).assign(appState).write();
  }
  return res.jsonp({ token, user });
});

server.get("/security-question", (req, res) => {
  const username = String(req.query.username || "").trim();
  const user = router.db.get("authUsers").find({ username }).value();
  if (!user?.securityQuestion) {
    return res.status(404).jsonp({ message: "没有找到该账号的验证问题" });
  }
  return res.jsonp({ question: user.securityQuestion });
});

server.post("/forgot-password", (req, res) => {
  const { username, securityQuestion, securityAnswer, newPassword } = req.body || {};
  const user = router.db.get("authUsers").find({ username }).value();
  if (!user) return res.status(404).jsonp({ message: "没有找到该账号" });
  if (!newPassword || String(newPassword).length < 6) return res.status(400).jsonp({ message: "新密码至少 6 位" });
  if (user.securityQuestion && securityQuestion && user.securityQuestion !== securityQuestion) {
    return res.status(400).jsonp({ message: "验证问题不匹配" });
  }
  if (String(user.securityAnswer || "").trim().toLowerCase() !== String(securityAnswer || "").trim().toLowerCase()) {
    return res.status(401).jsonp({ message: "验证答案不正确" });
  }
  router.db.get("authUsers").find({ username }).assign({ password: String(newPassword), token: `mock-${user.userId}-${Date.now()}` }).write();
  return res.jsonp({ message: "密码已重置，请使用新密码登录" });
});

server.post("/change-password", (req, res) => {
  const { username, userId, oldPassword, newPassword } = req.body || {};
  const chain = userId ? router.db.get("authUsers").find({ userId }) : router.db.get("authUsers").find({ username });
  const user = chain.value();
  if (!user) return res.status(404).jsonp({ message: "没有找到当前账号" });
  if (String(user.password) !== String(oldPassword || "")) return res.status(401).jsonp({ message: "旧密码不正确" });
  if (!newPassword || String(newPassword).length < 6) return res.status(400).jsonp({ message: "新密码至少 6 位" });
  chain.assign({ password: String(newPassword), token: `mock-${user.userId}-${Date.now()}` }).write();
  return res.jsonp({ message: "密码已修改，请重新登录" });
});

server.get("/me", (req, res) => {
  const authorization = req.headers.authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const user = router.db.get("authUsers").find({ token }).value();

  if (!user) {
    return res.status(401).jsonp({ message: "登录已失效" });
  }

  const profile = router.db.get("users").find({ id: user.userId }).value();
  return res.jsonp(profile);
});

server.use(router);

const port = Number(process.env.MOCK_PORT || 3000);
server.listen(port, () => {
  console.log(`JSON Server mock API running at http://localhost:${port}`);
});
