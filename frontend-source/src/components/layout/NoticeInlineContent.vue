<script setup>
import { computed } from "vue";
import { normalizeNoticeLinkTarget, resolveNoticeHref, splitNoticeInlineParts } from "@/utils/noticeCarousel";

const props = defineProps({
  notice: {
    type: Object,
    default: () => null
  },
  fallback: {
    type: String,
    default: ""
  },
  tag: {
    type: String,
    default: "strong"
  }
});

const displayText = computed(() => String(props.notice?.text || props.notice?.content || props.fallback || "").trim());
const linkText = computed(() => String(props.notice?.linkText || "").trim());
const href = computed(() => resolveNoticeHref(props.notice?.linkUrl));
const target = computed(() => normalizeNoticeLinkTarget(props.notice?.linkTarget));
const parts = computed(() => splitNoticeInlineParts(displayText.value, linkText.value));
const hasLink = computed(() => Boolean(href.value && linkText.value));
</script>

<template>
  <component :is="tag" class="notice-inline-content">
    <template v-if="hasLink && parts.matched">
      {{ parts.before }}
      <a
        class="notice-inline-link"
        :href="href"
        :target="target"
        :rel="target === '_blank' ? 'noopener noreferrer' : undefined"
      >{{ parts.link }}</a>
      {{ parts.after }}
    </template>
    <template v-else-if="hasLink">
      {{ displayText }}
      <template v-if="displayText"> </template>
      <a
        class="notice-inline-link"
        :href="href"
        :target="target"
        :rel="target === '_blank' ? 'noopener noreferrer' : undefined"
      >{{ linkText }}</a>
    </template>
    <template v-else>
      {{ displayText }}
    </template>
  </component>
</template>
