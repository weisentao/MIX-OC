import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\b(?:api[_-]?key|deepseek[_-]?api[_-]?key|authorization|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi
];

function redactSecrets(value, maxLength = 4000) {
  let text = String(value ?? "").slice(0, maxLength);
  for (const pattern of SECRET_VALUE_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  return text;
}

const MESSAGE_TRANSLATION_ENTRIES = [
  ["Not Found", "接口不存在"],
  ["Bad Request", "请求参数错误"],
  ["Forbidden", "无权限访问"],
  ["Internal Server Error", "服务器内部错误，请稍后重试"],
  ["Unauthorized", "请先登录"],
  ["Request failed", "请求失败"],
  ["Validation error", "请求参数校验失败"],
  ["Invalid request", "请求无效"],
  ["Invalid request body", "请求数据格式不正确"],
  ["No token provided", "请先登录"],
  ["Token required", "请先登录"],
  ["invalid token", "登录状态无效，请重新登录"],
  ["jwt malformed", "登录状态无效，请重新登录"],
  ["jwt expired", "登录已过期，请重新登录"],
  ["invalid signature", "登录状态无效，请重新登录"],
  ["No permission to access", "无权限访问"],
  ["No permission to access project", "无权限访问项目"],
  ["No permission to access project schedule", "无权限访问项目排期"],
  ["No permission to access storage file", "无权限访问文件"],
  ["No permission to create board", "无权限创建白板"],
  ["No permission to delete storage file", "无权限删除文件"],
  ["No permission to edit board", "无权限编辑白板"],
  ["No permission to force assign", "无权限强制分配"],
  ["No permission to manage board", "无权限管理白板"],
  ["No permission to mutate schedule comment", "无权限修改排期评论"],
  ["No permission to open board", "无权限打开白板"],
  ["No permission to read template", "无权限查看模板"],
  ["No permission to share template", "无权限分享模板"],
  ["No permission to update template", "无权限更新模板"],
  ["No permission to delete template", "无权限删除模板"],
  ["Admin permission required", "需要管理员权限"],
  ["Manager permission required", "需要经理权限"],
  ["Account or password is incorrect", "账号或密码错误"],
  ["Account is disabled", "账号已被禁用"],
  ["username and password are required", "请填写账号和密码"],
  ["username is required", "请填写用户名"],
  ["password is required", "请填写密码"],
  ["password must be at least 6 characters", "密码至少需要 6 个字符"],
  ["Please provide full register fields", "请完整填写注册信息"],
  ["Username must start with MIX-", "用户名必须以 MIX- 开头"],
  ["Invalid phone format", "手机号格式不正确"],
  ["Invalid email format", "邮箱格式不正确"],
  ["Username already exists", "用户名已存在"],
  ["username already exists", "用户名已存在"],
  ["Account not found", "账号不存在"],
  ["User not found", "用户不存在"],
  ["Fixed admin account cannot be deleted", "固定管理员账号不能删除"],
  ["role is invalid", "角色无效"],
  ["role is required", "缺少角色"],
  ["user id is required", "缺少用户ID"],
  ["userId is required", "缺少用户ID"],
  ["userId and role are required", "缺少用户ID和角色"],
  ["no profile fields to update", "没有可更新的个人资料字段"],
  ["Security question is not enabled. Use username + phone for password reset.", "未启用安全问题，请使用用户名和手机号重置密码"],
  ["Password reset successful. Please login again.", "密码重置成功，请重新登录"],
  ["Password changed successfully", "密码修改成功"],
  ["Project not found", "项目不存在"],
  ["Project group not found", "项目分组不存在"],
  ["Schedule plan not found", "排期计划不存在"],
  ["Task not found", "任务不存在"],
  ["Tag not found", "标签不存在"],
  ["Board not found", "白板不存在"],
  ["Schedule item not found", "排期项不存在"],
  ["Schedule comment not found", "排期评论不存在"],
  ["Template not found", "模板不存在"],
  ["Notification not found", "通知不存在"],
  ["Notice not found", "公告不存在"],
  ["Archive not found", "档案不存在"],
  ["title is required", "请填写标题"],
  ["name is required", "请填写名称"],
  ["content is required", "请填写内容"],
  ["text is required", "请输入文本内容"],
  ["projectId is required", "缺少项目ID"],
  ["projectId or projectUid is required", "缺少项目ID"],
  ["projectId or projectUid is required to upsert local schedule item", "缺少项目ID"],
  ["taskId is required", "缺少任务ID"],
  ["boardId is required", "缺少白板ID"],
  ["itemId is required", "缺少排期项ID"],
  ["commentId is required", "缺少评论ID"],
  ["templateId is required", "缺少模板ID"],
  ["document id is required", "缺少文档ID"],
  ["notificationId is required", "缺少通知ID"],
  ["noticeId is required", "缺少公告ID"],
  ["contact id is required", "缺少联系人ID"],
  ["targetUserId or username is required", "缺少目标用户"],
  ["toUserId or username is required", "缺少接收用户"],
  ["cannot add self to contacts", "不能添加自己为联系人"],
  ["endDate cannot be earlier than startDate", "结束日期不能早于开始日期"],
  ["endAt cannot be earlier than startAt", "结束时间不能早于开始时间"],
  ["to cannot be earlier than from", "结束日期不能早于开始日期"],
  ["Employee not found", "员工不存在"],
  ["Employee username already exists", "员工用户名已存在"],
  ["Invalid date", "日期格式不正确"],
  ["date must use YYYY-MM-DD format", "日期格式必须为 YYYY-MM-DD"],
  ["notice datetime must use YYYY-MM-DD HH:mm:ss format", "公告时间格式必须为 YYYY-MM-DD HH:mm:ss"],
  ["employeeId or userId is required", "缺少员工ID"],
  ["employeeId is required", "缺少员工ID"],
  ["workDate is required", "缺少工作日期"],
  ["startDate and endDate are required", "缺少开始日期和结束日期"],
  ["department name is required", "请填写部门名称"],
  ["Department not found", "部门不存在"],
  ["Position not found", "职位不存在"],
  ["position title is required", "请填写职位名称"],
  ["Attendance record not found", "考勤记录不存在"],
  ["Leave request not found", "请假申请不存在"],
  ["Recruitment job not found", "招聘职位不存在"],
  ["job title is required", "请填写职位标题"],
  ["Recruitment candidate not found", "招聘候选人不存在"],
  ["candidate name is required", "请填写候选人姓名"],
  ["Performance review not found", "绩效评审不存在"],
  ["period is required", "缺少周期"],
  ["Payroll record not found", "薪资记录不存在"],
  ["payrollMonth is required", "缺少薪资月份"],
  ["Work item not found", "工作项不存在"],
  ["workItemId is required", "缺少工作项ID"],
  ["assigneeId is required", "缺少被分配人ID"],
  ["Assignee is not available in assignment candidates", "被分配人不在候选列表中"],
  ["forceReason is required", "请填写强制分配原因"],
  ["AI chat is disabled", "AI 聊天已停用"],
  ["AI document not found", "AI 文档不存在"],
  ["DeepSeek home API key is not configured", "AI 服务未配置"],
  ["DeepSeek home API key is not configured.", "AI 服务未配置"],
  ["DeepSeek returned an empty answer", "AI 服务返回空响应"],
  ["DeepSeek returned an empty answer.", "AI 服务返回空响应"],
  ["DeepSeek HR API key is not configured", "HR AI 服务未配置"],
  ["DeepSeek HR API key is not configured.", "HR AI 服务未配置"],
  ["AI service is temporarily unavailable", "AI 服务暂不可用，请稍后重试"],
  ["AI service is temporarily unavailable.", "AI 服务暂不可用，请稍后重试"],
  ["HR assignment advice service is temporarily unavailable", "HR 分配建议服务暂不可用"],
  ["HR assignment advice service is temporarily unavailable.", "HR 分配建议服务暂不可用"],
  ["message is required", "请输入消息内容"],
  ["No editable document fields", "没有可编辑的文档字段"],
  ["Invalid AI storage path", "AI 存储路径无效"],
  ["Unsupported storage kind", "不支持的存储类型"],
  ["Invalid storage path", "文件路径无效"],
  ["Invalid storage id", "文件ID无效"],
  ["file is required", "请上传文件"],
  ["Uploaded file is empty", "上传文件为空"],
  ["Upload body is too large", "上传内容过大"],
  ["multipart/form-data boundary is required", "上传请求格式不正确"],
  ["Malformed multipart part", "上传请求格式不正确"],
  ["Too many uploaded files", "上传文件数量过多"],
  ["Storage file not found", "文件不存在"],
  ["Requested range is not satisfiable", "请求的文件范围无效"],
  ["MySQL unavailable for modular workspace API", "数据库服务暂不可用，请稍后重试"],
  ["MySQL unavailable for template API", "数据库服务暂不可用，请稍后重试"],
  ["MySQL unavailable for schedule API", "数据库服务暂不可用，请稍后重试"],
  ["MySQL unavailable for notifications API", "数据库服务暂不可用，请稍后重试"],
  ["MySQL unavailable for HR API", "数据库服务暂不可用，请稍后重试"],
  ["MySQL unavailable for admin API", "数据库服务暂不可用，请稍后重试"],
  ["Board version conflict", "画板版本冲突，请刷新后重试"],
  ["baseVersion must be a number", "基础版本号必须是数字"],
  ["Only json board export is supported", "仅支持导出 JSON 格式的白板"],
  ["template title is required", "请填写模板标题"],
  ["project name is required when applying template", "应用模板时请填写项目名称"],
  ["No editable config fields", "没有可更新的配置字段"],
  ["siteName cannot be empty", "站点名称不能为空"],
  ["No permission changes supplied", "未提供权限变更"],
  ["No template fields supplied", "未提供模板字段"],
  ["No notice fields supplied", "未提供公告字段"],
  ["No department fields supplied", "未提供部门字段"],
  ["noticeId collision", "公告ID冲突"],
  ["linkUrl must be a site path or http/https URL", "链接地址必须是站内路径或 http/https URL"],
  ["manager cannot grant admin role", "经理不能授予管理员角色"],
  ["project member role is invalid", "项目成员角色无效"]
];

function isMessageTranslationEntry(entry) {
  return Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && typeof entry[1] === "string";
}

const MESSAGE_TRANSLATIONS = new Map(MESSAGE_TRANSLATION_ENTRIES.filter(isMessageTranslationEntry));
const NORMALIZED_MESSAGE_TRANSLATIONS = new Map(
  [...MESSAGE_TRANSLATIONS].map(([message, translation]) => [message.toLowerCase(), translation])
);

function translateMessage(message, status = 500) {
  const text = String(message || "").trim();
  if (!text) return status >= 500 ? "服务器内部错误，请稍后重试" : "请求失败";
  if (MESSAGE_TRANSLATIONS.has(text)) return MESSAGE_TRANSLATIONS.get(text);
  if (NORMALIZED_MESSAGE_TRANSLATIONS.has(text.toLowerCase())) {
    return NORMALIZED_MESSAGE_TRANSLATIONS.get(text.toLowerCase());
  }
  if (/^No permission to\b/i.test(text)) return "无权限执行该操作";
  if (/^Unsupported HTTP method\b/i.test(text)) return "不支持的请求方法";
  if (/^Unexpected token|^Expected property name/i.test(text)) return "请求数据格式不正确";
  if (/^Missing required environment variables:/i.test(text)) return "缺少必需的环境变量";
  if (/^Invalid MYSQL_DATABASE name:/i.test(text)) return "MYSQL_DATABASE 名称无效";
  if (/^Unknown DB schema migration:/i.test(text)) return "未知的数据库迁移";
  if (/^Secret (?:value|field) is not allowed:/i.test(text)) return "请求数据包含不允许的敏感字段";
  if (/^Invalid dependency item:/i.test(text)) return "无效的依赖排期项";
  if (/^Schedule item linked to taskUid\b/i.test(text)) return "排期项关联的任务不存在";
  if (/^.+ is not allowed for .+$/i.test(text)) return "文件类型不允许";
  if (/^.+ is too large$/i.test(text)) return "文件过大";
  if (/^.+ does not match declared MIME type$/i.test(text)) return "文件类型与声明的 MIME 类型不匹配";
  return text;
}

export function notFoundHandler(req, res) {
  const body = {
    code: "NOT_FOUND",
    message: "接口不存在"
  };
  if (req.requestId) body.requestId = req.requestId;
  res.status(404).json(body);
}

const STATUS_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  503: "SERVICE_UNAVAILABLE"
};

function codeForStatus(status) {
  return STATUS_CODES[status] || (status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED");
}

export function buildErrorResponse(err, nodeEnv = env.nodeEnv, requestId = "") {
  const status = err.statusCode || 500;
  const canExposeMessage = status < 500 || status === 503 || nodeEnv !== "production" || err.statusCode;
  const safeMessage = translateMessage(redactSecrets(err.message || "Internal Server Error", 1000), status);
  const body = {
    code: err.code || codeForStatus(status),
    message: canExposeMessage ? safeMessage : "服务器内部错误，请稍后重试"
  };
  if (err?.details && typeof err.details === "object") {
    body.details = err.details;
  }
  if (requestId) body.requestId = requestId;
  return {
    status,
    body
  };
}

export function errorHandler(err, req, res, next) {
  logger.error("Unhandled error", {
    requestId: req.requestId,
    message: redactSecrets(err.message, 1000),
    stack: redactSecrets(err.stack, 4000),
    path: req.originalUrl,
    method: req.method
  });

  if (res.headersSent) return next(err);
  const { status, body } = buildErrorResponse(err, env.nodeEnv, req.requestId);
  res.status(status).json(body);
}
