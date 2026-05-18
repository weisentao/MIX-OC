<script setup>
import { computed, shallowRef, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  candidate: { type: Object, default: null },
  assignment: { type: Object, default: () => ({}) },
  alternative: { type: Object, default: null },
  canForce: { type: Boolean, default: false }
});

const emit = defineEmits(["cancel", "useAlternative", "force"]);

const reason = shallowRef("");

const conflictTasks = computed(() => props.candidate?.conflictTasks || []);
const hasAlternative = computed(() => Boolean(props.alternative?.personId || props.alternative?.id || props.alternative?.name));
const alternativeName = computed(() => props.alternative?.name || "推荐候选人");

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = "";
  }
);
</script>

<template>
  <Teleport to="body">
    <section v-if="open" class="resource-overload-backdrop" aria-label="超负荷二次确认">
      <div class="resource-overload-dialog" role="dialog" aria-modal="true">
        <div class="resource-overload-icon">!</div>
        <div class="resource-overload-copy">
          <h3>{{ candidate?.name || "候选人" }}当前超负荷，确认继续分配？</h3>
          <p>
            这会让她在 {{ assignment.startDate }} - {{ assignment.endDate }} 同时承担
            {{ conflictTasks.length || candidate?.conflictCount || 0 }} 条高优先级任务。
          </p>
        </div>

        <div class="resource-overload-metrics">
          <article>
            <span>当前负载</span>
            <strong>{{ candidate?.loadBefore || 0 }}%</strong>
          </article>
          <article>
            <span>分配后</span>
            <strong>{{ candidate?.loadAfter || 0 }}%</strong>
          </article>
          <article>
            <span>冲突任务</span>
            <strong>{{ conflictTasks.length || candidate?.conflictCount || 0 }}</strong>
          </article>
        </div>

        <div class="resource-overload-suggestion">
          <strong>建议改分配给{{ alternativeName }}：</strong>
          <span v-if="hasAlternative">负载 {{ alternative?.loadAfter || 76 }}%，同时间段无冲突。</span>
          <span v-else>当前没有可直接替换的人选，请回到智能推荐重新筛选。</span>
        </div>

        <label v-if="canForce" class="resource-force-reason">
          <span>仍然分配原因</span>
          <textarea v-model="reason" placeholder="例如：朱敏只负责半天复核，主执行改由其他成员承接"></textarea>
        </label>

        <div class="resource-overload-actions">
          <button type="button" @click="emit('cancel')">取消</button>
          <button type="button" class="is-ok" :disabled="!hasAlternative" @click="emit('useAlternative')">改给{{ alternativeName }}</button>
          <button
            v-if="canForce"
            type="button"
            class="is-risk"
            :disabled="!reason.trim()"
            @click="emit('force', { reason })"
          >
            仍然分配
          </button>
        </div>
      </div>
    </section>
  </Teleport>
</template>
