<script setup>
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { forgotPassword, getSecurityQuestion, login, register } from "@/services/auth";
import { resolvePostLoginTarget } from "@/services/authRedirect";

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const mode = ref("login");
const showRegisterPassword = ref(false);
const showRegisterConfirmPassword = ref(false);
const forgotOpen = ref(false);
const forgotStep = ref("account");
const form = reactive({
  username: "admin",
  password: "admin"
});

const securityQuestions = [
  "你的第一份项目名称是什么？",
  "你最喜欢的工作环节是什么？",
  "你入职时第一个合作同事是谁？",
  "你最常用的项目标签是什么？",
  "你最喜欢的一句工作提醒是什么？"
];

const registerForm = reactive({
  username: "",
  password: "",
  confirmPassword: "",
  phone: "",
  email: "",
  department: "项目管理",
  job: "项目专员",
  name: "",
  mbti: "ENTP",
  securityQuestion: securityQuestions[0],
  securityAnswer: ""
});

const forgotForm = reactive({
  username: "",
  phone: "",
  question: "",
  answer: "",
  newPassword: "",
  confirmPassword: ""
});

async function submitLogin() {
  loading.value = true;
  try {
    const result = await login(form.username, form.password);
    localStorage.setItem("xjg_token", result.token);
    localStorage.setItem("xjg_user", JSON.stringify(result.user || null));
    router.replace(resolvePostLoginTarget(route.query || {}));
  } catch (error) {
    ElMessage.error(error.message || "登录失败");
  } finally {
    loading.value = false;
  }
}

async function submitRegister() {
  if (registerForm.password !== registerForm.confirmPassword) {
    ElMessage.error("两次密码不一致");
    return;
  }
  if (!registerForm.securityAnswer.trim()) {
    ElMessage.error("请填写验证问题答案");
    return;
  }
  loading.value = true;
  try {
    const result = await register(registerForm);
    localStorage.setItem("xjg_token", result.token);
    localStorage.setItem("xjg_user", JSON.stringify(result.user || null));
    router.replace(resolvePostLoginTarget(route.query || {}));
  } catch (error) {
    ElMessage.error(error.message || "注册失败");
  } finally {
    loading.value = false;
  }
}

function openForgotPassword() {
  forgotForm.username = form.username || "";
  forgotForm.phone = "";
  forgotForm.question = "";
  forgotForm.answer = "";
  forgotForm.newPassword = "";
  forgotForm.confirmPassword = "";
  forgotStep.value = "account";
  forgotOpen.value = true;
}

async function loadSecurityQuestion() {
  if (!forgotForm.username.trim()) {
    ElMessage.error("请输入账号");
    return;
  }

  loading.value = true;
  try {
    const result = await getSecurityQuestion(forgotForm.username.trim());
    forgotForm.question = result?.question || "";
    forgotStep.value = "verify";
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("未启用密保问题") || message.toLowerCase().includes("not enabled")) {
      forgotStep.value = "phone";
      ElMessage.warning(message);
    } else {
      ElMessage.error(message || "没有找到该账号的验证问题");
    }
  } finally {
    loading.value = false;
  }
}

async function resetPasswordByQuestion() {
  ElMessage.warning("当前服务未启用密保问题，请使用账号 + 手机号找回");
  forgotStep.value = "phone";
}

async function resetPasswordByPhone() {
  if (!forgotForm.phone.trim()) {
    ElMessage.error("请输入注册手机号");
    return;
  }
  if (forgotForm.newPassword !== forgotForm.confirmPassword) {
    ElMessage.error("两次新密码不一致");
    return;
  }
  if (forgotForm.newPassword.length < 6) {
    ElMessage.error("新密码至少 6 位");
    return;
  }

  loading.value = true;
  try {
    const result = await forgotPassword({
      username: forgotForm.username.trim(),
      phone: forgotForm.phone.trim(),
      newPassword: forgotForm.newPassword
    });
    ElMessage.success(result?.message || "密码已重置，请重新登录");
    form.username = forgotForm.username.trim();
    form.password = "";
    mode.value = "login";
    forgotOpen.value = false;
  } catch (error) {
    ElMessage.error(error.message || "忘记密码处理失败");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-frame" aria-label="登录">
      <div class="login-pane login-copy-pane">
        <div class="login-copy">
          <h1>项目管理是大事<br />人人准守干大事</h1>
          <p>项目管理很重要，所有人按规则协作，才能把事情做好。</p>
        </div>
      </div>

      <div class="login-pane login-form-pane">
        <form v-if="mode === 'login'" class="login-form" @submit.prevent="submitLogin">
          <label class="login-row">
            <span>账号</span>
            <el-input v-model="form.username" class="login-input" />
          </label>
          <label class="login-row">
            <span>密码</span>
            <el-input v-model="form.password" class="login-input" type="password" show-password />
          </label>
          <div class="login-actions">
            <button type="button" class="login-link" :disabled="loading" @click="openForgotPassword">忘记密码</button>
            <button type="button" class="login-link" @click="mode = 'register'">创建账号</button>
            <button type="submit" class="login-submit" :disabled="loading">{{ loading ? "登录中" : "登录" }}</button>
          </div>
        </form>
        <form v-else class="register-form" @submit.prevent="submitRegister">
          <label><span>账号</span><input v-model="registerForm.username" required pattern="MIX-[A-Za-z0-9_-]+" title="账号必须以 MIX- 开头" /></label>
          <label class="password-field">
            <span>密码</span>
            <input v-model="registerForm.password" required :type="showRegisterPassword ? 'text' : 'password'" />
            <button
              class="password-visibility-toggle"
              type="button"
              :aria-label="showRegisterPassword ? '隐藏密码' : '显示密码'"
              :title="showRegisterPassword ? '隐藏密码' : '显示密码'"
              @click="showRegisterPassword = !showRegisterPassword"
            >
              <span class="password-eye-icon" :class="{ 'is-visible': showRegisterPassword }" aria-hidden="true"></span>
            </button>
          </label>
          <label class="password-field">
            <span>确认密码</span>
            <input v-model="registerForm.confirmPassword" required :type="showRegisterConfirmPassword ? 'text' : 'password'" />
            <button
              class="password-visibility-toggle"
              type="button"
              :aria-label="showRegisterConfirmPassword ? '隐藏密码' : '显示密码'"
              :title="showRegisterConfirmPassword ? '隐藏密码' : '显示密码'"
              @click="showRegisterConfirmPassword = !showRegisterConfirmPassword"
            >
              <span class="password-eye-icon" :class="{ 'is-visible': showRegisterConfirmPassword }" aria-hidden="true"></span>
            </button>
          </label>
          <label><span>手机</span><input v-model="registerForm.phone" required pattern="1[0-9]{10}" /></label>
          <label><span>邮箱</span><input v-model="registerForm.email" required type="email" /></label>
          <label><span>部门</span>
            <select v-model="registerForm.department">
              <option>项目管理</option>
              <option>美术设计</option>
              <option>AIGC</option>
              <option>三维视觉部</option>
              <option>动效设计</option>
              <option>视效包装</option>
            </select>
          </label>
          <label><span>职位</span>
            <select v-model="registerForm.job">
              <option>项目专员</option>
              <option>角色建模</option>
              <option>AIGC设计</option>
              <option>动效设计</option>
              <option>视效包装</option>
            </select>
          </label>
          <label><span>姓名</span><input v-model="registerForm.name" required /></label>
          <label><span>性格类型（MBTI）</span><input v-model="registerForm.mbti" maxlength="4" required /></label>
          <label class="security-question-field"><span>验证问题</span>
            <select v-model="registerForm.securityQuestion">
              <option v-for="question in securityQuestions" :key="question">{{ question }}</option>
            </select>
          </label>
          <label class="security-answer-field"><span>答案</span><input v-model="registerForm.securityAnswer" required placeholder="只有你自己知道" /></label>
          <div class="register-actions">
            <button type="button" @click="mode = 'login'">取消</button>
            <button type="submit" :disabled="loading">{{ loading ? "创建中" : "创建账号" }}</button>
          </div>
        </form>
      </div>
    </section>

    <div v-if="forgotOpen" class="login-modal-mask" @click.self="forgotOpen = false">
      <section class="forgot-card" aria-label="找回密码">
        <button class="forgot-close" type="button" aria-label="关闭" @click="forgotOpen = false">×</button>
        <div class="forgot-head">
          <span>账号安全</span>
          <h2>找回密码</h2>
          <p>当前服务使用账号 + 手机号验证重置密码。</p>
        </div>
        <div v-if="forgotStep === 'account'" class="forgot-body">
          <label>
            <span>账号</span>
            <input v-model="forgotForm.username" placeholder="请输入账号" />
          </label>
          <button type="button" :disabled="loading" @click="loadSecurityQuestion">{{ loading ? "查询中" : "下一步" }}</button>
        </div>
        <div v-else-if="forgotStep === 'verify'" class="forgot-body">
          <div class="forgot-question">
            <small>验证问题</small>
            <strong>{{ forgotForm.question || "当前后端未启用" }}</strong>
          </div>
          <label>
            <span>答案</span>
            <input v-model="forgotForm.answer" placeholder="当前流程不再使用该字段" />
          </label>
          <div class="forgot-actions">
            <button type="button" @click="forgotStep = 'account'">上一步</button>
            <button type="button" @click="resetPasswordByQuestion">改用手机号找回</button>
          </div>
        </div>
        <div v-else class="forgot-body">
          <label>
            <span>注册手机号</span>
            <input v-model="forgotForm.phone" placeholder="请输入注册手机号" />
          </label>
          <label>
            <span>新密码</span>
            <input v-model="forgotForm.newPassword" type="password" />
          </label>
          <label>
            <span>确认密码</span>
            <input v-model="forgotForm.confirmPassword" type="password" />
          </label>
          <div class="forgot-actions">
            <button type="button" @click="forgotStep = 'account'">上一步</button>
            <button type="button" :disabled="loading" @click="resetPasswordByPhone">{{ loading ? "重置中" : "重置密码" }}</button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
