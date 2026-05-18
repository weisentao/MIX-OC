<script setup>
import { computed } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  draft: { type: Object, default: () => ({}) },
  departments: { type: Array, default: () => [] },
  candidates: { type: Array, default: () => [] },
  selectedCandidateId: { type: String, default: "" },
  completion: { type: Object, default: null },
  permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(["close", "updateDraft", "searchCandidates", "selectCandidate", "submitAssignment", "resetCompletion"]);

const selectedCandidate = computed(() => {
  return props.candidates.find((candidate) => candidate.personId === props.selectedCandidateId) || props.candidates[0] || null;
});

const conclusion = computed(() => {
  if (!selectedCandidate.value) return "请先查找并选择候选人员。";
  if (selectedCandidate.value.loadAfter >= 100 || selectedCandidate.value.conflictCount > 0) {
    return `${selectedCandidate.value.name} 当前有冲突，确认时会进入超负荷二次确认。`;
  }
  return `建议分配给${selectedCandidate.value.name}：技能匹配，负载 ${selectedCandidate.value.loadAfter}% ，冲突 0。`;
});

function updateField(field, value) {
  emit("updateDraft", { ...props.draft, [field]: value });
}
</script>

<template>
  <Teleport to="body">
    <aside v-if="open" class="resource-assignment-drawer" aria-label="新建任务推荐人力">
      <div class="resource-drawer-head">
        <div>
          <span>交互流程 1</span>
          <h3>新建任务 · 选择可用人力</h3>
          <p>项目经理填写任务，系统按空闲、技能、负载排序。</p>
        </div>
        <button type="button" class="resource-drawer-close" aria-label="关闭分配抽屉" @click="emit('close')">×</button>
      </div>

      <div v-if="completion" class="resource-assignment-complete" aria-label="确认分配完成">
        <span>交互流程 2</span>
        <h3>确认分配完成</h3>
        <p>{{ completion.taskTitle }} 已确认分配给 {{ completion.personName }}，任务条已进入对应时间轴。</p>
        <dl>
          <div>
            <dt>负责人</dt>
            <dd>{{ completion.personName }}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{{ completion.startDate }} - {{ completion.endDate }}</dd>
          </div>
          <div>
            <dt>同步结果</dt>
            <dd>{{ completion.forced ? "强制分配已记录" : "任务和排期项已同步" }}</dd>
          </div>
        </dl>
        <button type="button" @click="emit('resetCompletion')">继续安排新任务</button>
      </div>

      <div class="resource-assignment-columns">
        <section class="resource-assignment-form" aria-label="任务信息">
          <h4>任务信息</h4>
          <label>
            <span>任务名称</span>
            <input :value="draft.title" type="text" @input="updateField('title', $event.target.value)" />
          </label>
          <label>
            <span>项目</span>
            <input :value="draft.project" type="text" @input="updateField('project', $event.target.value)" />
          </label>
          <label>
            <span>开始日期</span>
            <input :value="draft.startDate" type="text" @input="updateField('startDate', $event.target.value)" />
          </label>
          <label>
            <span>结束日期</span>
            <input :value="draft.endDate" type="text" @input="updateField('endDate', $event.target.value)" />
          </label>
          <label>
            <span>需要部门</span>
            <select :value="draft.departmentId" @change="updateField('departmentId', $event.target.value)">
              <option v-for="department in departments" :key="department.id" :value="department.id">
                {{ department.name }}
              </option>
            </select>
          </label>
          <label>
            <span>技能标签</span>
            <input :value="draft.skillText" type="text" @input="updateField('skillText', $event.target.value)" />
          </label>
          <label>
            <span>优先级</span>
            <select :value="draft.priority" @change="updateField('priority', $event.target.value)">
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </label>
          <button
            type="button"
            class="resource-primary-action"
            :disabled="!permissions.canCreateAssignmentPreview"
            @click="emit('searchCandidates')"
          >
            查找可分配人员
          </button>
        </section>

        <section class="resource-candidate-pool" aria-label="候选人员">
          <h4>候选人员</h4>
          <button
            v-for="candidate in candidates"
            :key="candidate.personId"
            type="button"
            class="resource-candidate-card"
            :class="[`is-${candidate.tone || 'green'}`, { 'is-selected': selectedCandidateId === candidate.personId }]"
            @click="emit('selectCandidate', candidate.personId)"
          >
            <span class="resource-avatar">{{ candidate.avatar }}</span>
            <strong>{{ candidate.name }}</strong>
            <small>{{ candidate.departmentName }} · {{ candidate.reason }}</small>
            <span class="resource-candidate-load">{{ candidate.loadAfter }}%</span>
          </button>
        </section>

        <section class="resource-assignment-preview" aria-label="分配后预览">
          <h4>分配后预览</h4>
          <div class="resource-preview-timeline">
            <article v-if="selectedCandidate" class="resource-preview-row">
              <strong>{{ selectedCandidate.name }}</strong>
              <div class="resource-preview-bars">
                <span class="resource-preview-bar is-normal">已有</span>
                <span class="resource-preview-bar is-new">新任务</span>
                <span v-if="selectedCandidate.conflictCount" class="resource-preview-bar is-risk">冲突</span>
              </div>
            </article>
          </div>
          <div class="resource-recommendation-box">
            <strong>推荐结论</strong>
            <p>{{ conclusion }}</p>
            <ul v-if="selectedCandidate">
              <li v-for="reason in selectedCandidate.reasons" :key="reason">{{ reason }}</li>
            </ul>
          </div>
          <button
            type="button"
            class="resource-confirm-action"
            :disabled="!permissions.canAssignTask || !selectedCandidate"
            @click="emit('submitAssignment', selectedCandidate)"
          >
            确认分配
          </button>
        </section>
      </div>
    </aside>
  </Teleport>
</template>
