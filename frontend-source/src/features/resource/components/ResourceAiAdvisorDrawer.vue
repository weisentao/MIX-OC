<script setup>
import { computed } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: [String, Object, Error], default: "" },
  advice: { type: Object, default: null },
  draft: { type: Object, default: () => ({}) },
  candidates: { type: Array, default: () => [] },
  selectedPerson: { type: Object, default: null },
  workItems: { type: Array, default: () => [] },
  permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(["close", "refresh", "apply-candidate", "open-assignment"]);

function readByKeys(source, keys) {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return undefined;
}

function pickText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(pickText).filter(Boolean).join("；");
  if (typeof value !== "object") return "";

  const direct = readByKeys(value, ["text", "message", "summary", "description", "reason", "title", "label", "advice", "content"]);
  if (direct !== undefined) return pickText(direct);

  return Object.values(value)
    .filter((entry) => ["string", "number", "boolean"].includes(typeof entry))
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
}

function toTextItems(value) {
  if (Array.isArray(value)) return value.map(pickText).filter(Boolean);
  const text = pickText(value);
  return text ? [text] : [];
}

function personId(person) {
  return pickText(readByKeys(person, ["personId", "id", "userId", "memberId", "assigneeId"]));
}

function personName(person) {
  return pickText(readByKeys(person, ["name", "personName", "username", "displayName", "label"])) || "未指定";
}

function personMeta(person) {
  const department = pickText(readByKeys(person, ["departmentName", "department", "teamName", "team"]));
  const role = pickText(readByKeys(person, ["roleTitle", "role", "position", "jobTitle"]));
  return [department, role].filter(Boolean).join(" · ") || "暂无岗位信息";
}

function loadValue(person) {
  const load = readByKeys(person, ["loadAfter", "load", "workload", "utilization"]);
  if (load === undefined || load === null || load === "") return "";
  return `${load}%`;
}

function isAllowed(key, fallback = true) {
  const value = props.permissions?.[key];
  return value === undefined ? fallback : Boolean(value);
}

const hasAdvice = computed(() => Boolean(props.advice && Object.keys(props.advice).length));

const errorMessage = computed(() => {
  if (!props.error) return "";
  if (typeof props.error === "string") return props.error;
  return props.error.message || props.error.response?.data?.message || props.error.error || "智能建议服务暂不可用";
});

const recommendedPerson = computed(() => {
  const advicePerson = readByKeys(props.advice, [
    "recommendedPerson",
    "recommendedCandidate",
    "candidate",
    "person",
    "assignee",
    "bestCandidate"
  ]);
  if (advicePerson && typeof advicePerson === "object") return advicePerson;

  const recommendedId = pickText(readByKeys(props.advice, [
    "recommendedPersonId",
    "recommendedCandidateId",
    "personId",
    "assigneeId"
  ]));
  if (recommendedId) {
    const matchedCandidate = props.candidates.find((candidate) => personId(candidate) === recommendedId);
    if (matchedCandidate) return matchedCandidate;
  }

  return props.selectedPerson || null;
});

const recommendedReason = computed(() => {
  return (
    pickText(readByKeys(props.advice, ["recommendationReason", "reason", "summary", "recommendation"])) ||
    pickText(readByKeys(recommendedPerson.value, ["reason", "recommendation", "summary"])) ||
    "等待智能建议返回推荐依据"
  );
});

const candidateRows = computed(() => {
  return props.candidates.map((candidate, index) => {
    const id = personId(candidate) || `candidate-${index}`;
    return {
      id,
      key: id,
      raw: candidate,
      name: personName(candidate),
      meta: personMeta(candidate),
      load: loadValue(candidate),
      reason: pickText(readByKeys(candidate, ["reason", "recommendation", "summary"])) || "候选人可用于本次分配评估",
      risk: pickText(readByKeys(candidate, ["risk", "riskLevel", "conflictCount"])),
      selected: id && id === personId(recommendedPerson.value)
    };
  });
});

const draftFacts = computed(() => {
  const draft = props.draft || {};
  const dateRange = [draft.startDate, draft.endDate].filter(Boolean).join(" 至 ");
  return [
    { key: "title", label: "任务", value: pickText(readByKeys(draft, ["title", "taskTitle", "name"])) || "未填写" },
    { key: "project", label: "项目", value: pickText(readByKeys(draft, ["project", "projectName"])) || "未填写" },
    { key: "date", label: "时间", value: dateRange || pickText(readByKeys(draft, ["dateRange", "schedule"])) || "未填写" },
    { key: "skill", label: "技能", value: pickText(readByKeys(draft, ["skillText", "skills", "requiredSkills"])) || "未填写" }
  ];
});

const scheduleAdvice = computed(() => {
  return [
    ...toTextItems(readByKeys(props.advice, ["scheduleAdvice", "schedulingAdvice", "scheduleSuggestions"])),
    ...toTextItems(readByKeys(props.advice?.schedule, ["advice", "items", "suggestions", "summary"]))
  ];
});

const communicationAdvice = computed(() => {
  return [
    ...toTextItems(readByKeys(props.advice, ["communicationAdvice", "communicationSuggestions", "messageAdvice"])),
    ...toTextItems(readByKeys(props.advice?.communication, ["advice", "items", "suggestions", "summary"]))
  ];
});

const riskItems = computed(() => {
  const explicitRisks = [
    ...toTextItems(readByKeys(props.advice, ["risks", "riskAdvice", "riskItems"])),
    ...toTextItems(readByKeys(props.advice?.risk, ["items", "suggestions", "summary"]))
  ];
  if (explicitRisks.length) return explicitRisks;

  const candidate = recommendedPerson.value;
  const conflictCount = Number(readByKeys(candidate, ["conflictCount", "conflicts"]) || 0);
  const loadAfter = Number(readByKeys(candidate, ["loadAfter", "load"]) || 0);
  const fallbackRisks = [];
  if (conflictCount > 0) fallbackRisks.push(`存在 ${conflictCount} 个排期冲突，需要二次确认`);
  if (loadAfter >= 100) fallbackRisks.push(`预计负载达到 ${loadAfter}%，建议确认可用窗口`);
  return fallbackRisks;
});

const syncNotes = computed(() => {
  const notes = [
    ...toTextItems(readByKeys(props.advice, ["syncExplanation", "syncNotes", "syncAdvice", "sync"])),
    ...toTextItems(readByKeys(props.advice?.sync, ["message", "items", "summary"]))
  ];
  if (notes.length) return notes;
  if (hasAdvice.value) return ["智能建议仅作为分配参考，确认后由主线程触发任务与排期同步。"];
  return [];
});

const relevantWorkItems = computed(() => {
  const id = personId(recommendedPerson.value) || personId(props.selectedPerson);
  const items = id ? props.workItems.filter((item) => personId(item) === id || pickText(item.personId) === id) : props.workItems;
  return items.slice(0, 5).map((item, index) => ({
    key: pickText(readByKeys(item, ["id", "workItemId", "taskId"])) || `work-${index}`,
    title: pickText(readByKeys(item, ["title", "name", "taskTitle"])) || "未命名任务",
    range: [item.startDate, item.endDate].filter(Boolean).join(" 至 ") || pickText(readByKeys(item, ["dateRange", "schedule"])) || "未排期",
    status: pickText(readByKeys(item, ["status", "state", "priority"])) || "进行中"
  }));
});

const canRefresh = computed(() => isAllowed("canAnalyzeAssignment") && isAllowed("canUseAiAdvisor"));
const canApplyCandidate = computed(() => isAllowed("canApplyCandidate") && (isAllowed("canAssignTask") || isAllowed("canCreateAssignmentPreview")));
const canOpenAssignment = computed(() => isAllowed("canAssignTask") || isAllowed("canCreateAssignmentPreview"));

function applyCandidate(candidate) {
  if (!canApplyCandidate.value) return;
  emit("apply-candidate", candidate.raw);
}

function openAssignment() {
  if (!canOpenAssignment.value) return;
  emit("open-assignment", {
    person: recommendedPerson.value,
    draft: props.draft,
    advice: props.advice
  });
}
</script>

<template>
  <Teleport to="body">
    <aside
      v-if="open"
      class="resource-ai-advisor-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="智能分配建议"
      :aria-busy="loading"
    >
      <header class="resource-ai-advisor-head">
        <div class="resource-ai-title-block">
          <span class="resource-ai-kicker">智能建议服务</span>
          <h3>分配建议</h3>
          <p>基于当前草稿、候选人和工作项生成辅助判断。</p>
        </div>
        <div class="resource-ai-actions">
          <button type="button" class="resource-ai-ghost-button" :disabled="loading || !canRefresh" @click="emit('refresh')">
            刷新
          </button>
          <button type="button" class="resource-ai-close-button" aria-label="关闭智能建议" @click="emit('close')">
            ×
          </button>
        </div>
      </header>

      <section class="resource-ai-context" aria-label="任务草稿">
        <div v-for="fact in draftFacts" :key="fact.key" class="resource-ai-context-item">
          <span>{{ fact.label }}</span>
          <strong>{{ fact.value }}</strong>
        </div>
      </section>

      <section v-if="loading" class="resource-ai-state" aria-live="polite">
        <span class="resource-ai-spinner" aria-hidden="true"></span>
        <strong>正在生成建议</strong>
        <p>系统正在分析候选人负载、时间窗口和同步风险。</p>
      </section>

      <section v-else-if="errorMessage" class="resource-ai-state is-error" aria-live="polite">
        <strong>建议生成失败</strong>
        <p>{{ errorMessage }}</p>
        <button type="button" :disabled="!canRefresh" @click="emit('refresh')">重试</button>
      </section>

      <section v-else-if="!hasAdvice" class="resource-ai-state" aria-live="polite">
        <strong>暂无智能建议</strong>
        <p>点击刷新后会调用建议服务，不会在前端写入任何密钥。</p>
        <button type="button" :disabled="!canRefresh" @click="emit('refresh')">生成建议</button>
      </section>

      <div v-else class="resource-ai-body">
        <section class="resource-ai-recommendation" aria-label="推荐人">
          <div class="resource-ai-section-head">
            <span>推荐人</span>
            <strong>{{ personName(recommendedPerson) }}</strong>
          </div>
          <p>{{ personMeta(recommendedPerson) }}</p>
          <div class="resource-ai-person-line">
            <span>预计负载</span>
            <strong>{{ loadValue(recommendedPerson) || "未返回" }}</strong>
          </div>
          <div class="resource-ai-note">
            <span>推荐依据</span>
            <p>{{ recommendedReason }}</p>
          </div>
        </section>

        <section class="resource-ai-section" aria-label="排期建议">
          <div class="resource-ai-section-head">
            <span>排期建议</span>
            <strong>{{ scheduleAdvice.length || 0 }}</strong>
          </div>
          <ul v-if="scheduleAdvice.length" class="resource-ai-list">
            <li v-for="item in scheduleAdvice" :key="item">{{ item }}</li>
          </ul>
          <p v-else class="resource-ai-muted">智能建议暂未返回排期建议。</p>
        </section>

        <section class="resource-ai-section" aria-label="沟通建议">
          <div class="resource-ai-section-head">
            <span>沟通建议</span>
            <strong>{{ communicationAdvice.length || 0 }}</strong>
          </div>
          <ul v-if="communicationAdvice.length" class="resource-ai-list">
            <li v-for="item in communicationAdvice" :key="item">{{ item }}</li>
          </ul>
          <p v-else class="resource-ai-muted">智能建议暂未返回沟通建议。</p>
        </section>

        <section class="resource-ai-section" aria-label="风险">
          <div class="resource-ai-section-head">
            <span>风险</span>
            <strong>{{ riskItems.length || 0 }}</strong>
          </div>
          <ul v-if="riskItems.length" class="resource-ai-list is-risk">
            <li v-for="item in riskItems" :key="item">{{ item }}</li>
          </ul>
          <p v-else class="resource-ai-muted">暂无明确风险。</p>
        </section>

        <section class="resource-ai-section" aria-label="同步说明">
          <div class="resource-ai-section-head">
            <span>同步说明</span>
            <strong>{{ syncNotes.length || 0 }}</strong>
          </div>
          <ul v-if="syncNotes.length" class="resource-ai-list">
            <li v-for="item in syncNotes" :key="item">{{ item }}</li>
          </ul>
          <p v-else class="resource-ai-muted">等待建议服务返回同步说明。</p>
        </section>

        <section class="resource-ai-section" aria-label="相关工作项">
          <div class="resource-ai-section-head">
            <span>相关工作项</span>
            <strong>{{ relevantWorkItems.length || 0 }}</strong>
          </div>
          <div v-if="relevantWorkItems.length" class="resource-ai-work-list">
            <article v-for="item in relevantWorkItems" :key="item.key" class="resource-ai-work-item">
              <strong>{{ item.title }}</strong>
              <span>{{ item.range }}</span>
              <small>{{ item.status }}</small>
            </article>
          </div>
          <p v-else class="resource-ai-muted">暂无可展示的相关工作项。</p>
        </section>

        <section class="resource-ai-section" aria-label="候选人">
          <div class="resource-ai-section-head">
            <span>候选人</span>
            <strong>{{ candidateRows.length || 0 }}</strong>
          </div>
          <div v-if="candidateRows.length" class="resource-ai-candidate-list">
            <article
              v-for="candidate in candidateRows"
              :key="candidate.key"
              class="resource-ai-candidate-row"
              :class="{ 'is-selected': candidate.selected }"
            >
              <div>
                <strong>{{ candidate.name }}</strong>
                <span>{{ candidate.meta }}</span>
                <p>{{ candidate.reason }}</p>
              </div>
              <div class="resource-ai-candidate-side">
                <small>{{ candidate.load || "负载未知" }}</small>
                <button type="button" :disabled="!canApplyCandidate" @click="applyCandidate(candidate)">应用</button>
              </div>
            </article>
          </div>
          <p v-else class="resource-ai-muted">暂无候选人数据。</p>
        </section>
      </div>

      <footer class="resource-ai-footer">
        <button type="button" class="resource-ai-secondary-button" @click="emit('close')">关闭</button>
        <button type="button" class="resource-ai-primary-button" :disabled="!canOpenAssignment || !recommendedPerson" @click="openAssignment">
          打开分配流程
        </button>
      </footer>
    </aside>
  </Teleport>
</template>

<style scoped>
.resource-ai-advisor-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  width: min(860px, 100vw);
  height: 100vh;
  background: #f7f8fb;
  border-left: 1px solid #d8dee8;
  box-shadow: -18px 0 42px rgba(16, 24, 40, 0.16);
  color: #1f2937;
}

.resource-ai-advisor-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 18px;
  background: #ffffff;
  border-bottom: 1px solid #dfe4ec;
}

.resource-ai-title-block {
  min-width: 0;
}

.resource-ai-kicker {
  display: block;
  margin-bottom: 6px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.resource-ai-title-block h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.25;
}

.resource-ai-title-block p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 13px;
}

.resource-ai-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.resource-ai-ghost-button,
.resource-ai-close-button,
.resource-ai-state button,
.resource-ai-candidate-side button,
.resource-ai-secondary-button,
.resource-ai-primary-button {
  min-height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2937;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.resource-ai-ghost-button,
.resource-ai-state button,
.resource-ai-secondary-button {
  padding: 0 14px;
}

.resource-ai-close-button {
  width: 34px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.resource-ai-primary-button,
.resource-ai-candidate-side button {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #ffffff;
}

.resource-ai-primary-button,
.resource-ai-secondary-button {
  padding: 0 18px;
}

.resource-ai-ghost-button:hover,
.resource-ai-close-button:hover,
.resource-ai-state button:hover,
.resource-ai-secondary-button:hover {
  background: #f1f5f9;
}

.resource-ai-primary-button:hover,
.resource-ai-candidate-side button:hover {
  background: #1e40af;
}

.resource-ai-ghost-button:disabled,
.resource-ai-state button:disabled,
.resource-ai-candidate-side button:disabled,
.resource-ai-primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.resource-ai-context {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: #dfe4ec;
  border-bottom: 1px solid #dfe4ec;
}

.resource-ai-context-item {
  min-width: 0;
  padding: 12px 16px;
  background: #ffffff;
}

.resource-ai-context-item span,
.resource-ai-section-head span,
.resource-ai-note span,
.resource-ai-person-line span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.resource-ai-context-item strong {
  display: block;
  min-width: 0;
  margin-top: 5px;
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-ai-state {
  margin: 24px;
  padding: 28px;
  background: #ffffff;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  text-align: center;
}

.resource-ai-state strong {
  display: block;
  color: #111827;
  font-size: 18px;
}

.resource-ai-state p {
  max-width: 520px;
  margin: 10px auto 18px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.65;
}

.resource-ai-state.is-error {
  border-color: #fecaca;
  background: #fff7f7;
}

.resource-ai-spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  margin-bottom: 16px;
  border: 3px solid #dbeafe;
  border-top-color: #2563eb;
  border-radius: 999px;
  animation: resource-ai-spin 0.8s linear infinite;
}

.resource-ai-body {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(320px, 1.1fr);
  gap: 16px;
  min-height: 0;
  padding: 18px 24px 96px;
  overflow: auto;
}

.resource-ai-recommendation,
.resource-ai-section {
  min-width: 0;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
}

.resource-ai-recommendation {
  align-self: start;
  border-top: 3px solid #2563eb;
}

.resource-ai-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.resource-ai-section-head strong {
  color: #111827;
  font-size: 18px;
}

.resource-ai-recommendation > p {
  margin: 0 0 14px;
  color: #475569;
  font-size: 13px;
}

.resource-ai-person-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.resource-ai-person-line strong {
  color: #047857;
  font-size: 18px;
}

.resource-ai-note {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.resource-ai-note p {
  margin: 7px 0 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
}

.resource-ai-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.resource-ai-list li {
  position: relative;
  padding: 10px 12px 10px 30px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
}

.resource-ai-list li::before {
  position: absolute;
  top: 16px;
  left: 13px;
  width: 7px;
  height: 7px;
  background: #2563eb;
  border-radius: 999px;
  content: "";
}

.resource-ai-list.is-risk li {
  background: #fff7ed;
  border-color: #fed7aa;
}

.resource-ai-list.is-risk li::before {
  background: #ea580c;
}

.resource-ai-muted {
  margin: 0;
  padding: 12px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  color: #64748b;
  font-size: 13px;
}

.resource-ai-work-list,
.resource-ai-candidate-list {
  display: grid;
  gap: 10px;
}

.resource-ai-work-item,
.resource-ai-candidate-row {
  min-width: 0;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.resource-ai-work-item strong,
.resource-ai-work-item span,
.resource-ai-work-item small,
.resource-ai-candidate-row strong,
.resource-ai-candidate-row span,
.resource-ai-candidate-row p {
  display: block;
}

.resource-ai-work-item strong,
.resource-ai-candidate-row strong {
  color: #111827;
  font-size: 14px;
}

.resource-ai-work-item span,
.resource-ai-candidate-row span {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.resource-ai-work-item small {
  margin-top: 7px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.resource-ai-candidate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.resource-ai-candidate-row.is-selected {
  border-color: #93c5fd;
  background: #eff6ff;
}

.resource-ai-candidate-row p {
  margin: 7px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

.resource-ai-candidate-side {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.resource-ai-candidate-side small {
  color: #047857;
  font-size: 13px;
  font-weight: 800;
}

.resource-ai-candidate-side button {
  padding: 0 12px;
}

.resource-ai-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px;
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #dfe4ec;
}

@keyframes resource-ai-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .resource-ai-advisor-head {
    padding: 18px 16px;
  }

  .resource-ai-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resource-ai-body {
    grid-template-columns: 1fr;
    padding: 16px 16px 96px;
  }

  .resource-ai-footer {
    padding: 12px 16px;
  }
}
</style>
