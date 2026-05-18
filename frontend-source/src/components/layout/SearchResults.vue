<script setup>
const props = defineProps({
  query: { type: String, default: "" },
  results: { type: Array, default: () => [] }
});

const emit = defineEmits(["select"]);
</script>

<template>
  <section v-if="query" class="search-results animate__animated animate__fadeIn">
    <div class="search-results-head">
      <strong>搜索结果</strong>
      <span>{{ props.results.length }} 条，已标注来源</span>
    </div>
    <div class="search-result-list">
      <button v-for="result in props.results" :key="`${result.projectId}-${result.taskId || result.title}`" class="search-result" type="button" @click="emit('select', result)">
        <span>{{ result.source }}</span>
        <strong>{{ result.title }}</strong>
        <small>{{ result.text }}</small>
      </button>
      <div v-if="!props.results.length" class="empty-state compact">没有找到匹配内容</div>
    </div>
  </section>
</template>
