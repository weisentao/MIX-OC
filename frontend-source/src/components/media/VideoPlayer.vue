<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import videojs from "video.js";
import zhCnVideoJs from "video.js/dist/lang/zh-CN.json";

videojs.addLanguage("zh-CN", zhCnVideoJs);

const props = defineProps({
  src: {
    type: String,
    default: ""
  },
  poster: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    default: "video/mp4"
  },
  options: {
    type: Object,
    default: () => ({})
  }
});

const videoEl = ref(null);
let player;

onMounted(() => {
  player = videojs(videoEl.value, {
    controls: true,
    fluid: true,
    language: "zh-CN",
    preload: "metadata",
    poster: props.poster,
    sources: props.src ? [{ src: props.src, type: props.type }] : [],
    ...props.options
  });
});

watch(
  () => props.src,
  (src) => {
    if (!player) return;
    player.src(src ? [{ src, type: props.type }] : []);
  }
);

onBeforeUnmount(() => {
  if (player) {
    player.dispose();
    player = null;
  }
});
</script>

<template>
  <video ref="videoEl" class="video-js vjs-default-skin" playsinline></video>
</template>
