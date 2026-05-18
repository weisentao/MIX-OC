<script setup>
import { computed, ref, watch } from "vue";
import {
  CircleClose,
  Collection,
  Connection,
  DataLine,
  Download,
  Document,
  Printer,
  ZoomIn,
  ZoomOut
} from "@element-plus/icons-vue";
import {
  buildScheduleHtmlExport,
  buildSchedulePdfPreviewModel,
  buildSchedulePdfPrintDocument
} from "@/utils/schedule/scheduleExport.js";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  plan: {
    type: Object,
    default: () => ({})
  },
  items: {
    type: Array,
    default: () => []
  },
  dependencies: {
    type: Array,
    default: () => []
  },
  exportOptions: {
    type: Object,
    default: () => ({})
  },
  initialTab: {
    type: String,
    default: "html"
  }
});

const emit = defineEmits(["update:modelValue", "close", "tab-change"]);

const localVisible = ref(false);
const activeTab = ref(props.initialTab === "pdf" ? "pdf" : "html");
const localViewMode = ref(props.exportOptions.viewMode || props.exportOptions.mode || "timeline");
const localDayWidth = ref(Number(props.exportOptions.dayWidth || props.plan?.viewConfig?.dayWidth || 28));

const visible = computed({
  get: () => props.modelValue || localVisible.value,
  set: (value) => {
    localVisible.value = value;
    emit("update:modelValue", value);
    if (!value) emit("close");
  }
});

const viewModes = [
  { key: "timeline", label: "时间线模式", icon: DataLine },
  { key: "board", label: "看板模式", icon: Collection },
  { key: "node", label: "节点模式", icon: Connection }
];

watch(
  () => props.modelValue,
  (value) => {
    localVisible.value = value;
  }
);

watch(
  () => props.initialTab,
  (value) => {
    activeTab.value = value === "pdf" ? "pdf" : "html";
  }
);

watch(
  () => props.exportOptions,
  (options) => {
    localViewMode.value = options.viewMode || options.mode || localViewMode.value || "timeline";
    localDayWidth.value = clampDayWidth(options.dayWidth || localDayWidth.value);
  },
  { deep: true }
);

const htmlExport = computed(() => {
  return buildScheduleHtmlExport(props.plan, props.items, props.dependencies, {
    ...props.exportOptions,
    viewMode: localViewMode.value,
    dayWidth: localDayWidth.value
  });
});

const pdfPreview = computed(() => {
  return buildSchedulePdfPreviewModel(props.plan, props.items, props.dependencies, props.exportOptions);
});

const summary = computed(() => htmlExport.value.summary);
const htmlSnapshot = computed(() => htmlExport.value.snapshot);
const pdfPage = computed(() => pdfPreview.value.pages[0] || { items: [], timeline: { days: [], weeks: [] } });
const htmlDays = computed(() => htmlSnapshot.value.timeline.days || []);
const htmlWeeks = computed(() => htmlSnapshot.value.timeline.weeks || []);
const pdfDays = computed(() => pdfPage.value.timeline.days || []);
const pdfWeeks = computed(() => pdfPage.value.timeline.weeks || []);
const htmlPreviewWidth = computed(() => Math.max(760, htmlDays.value.length * htmlExport.value.dayWidth));
const pdfColumnWidth = computed(() => pdfPage.value.timeline.columnWidth || 22);
const pdfPreviewWidth = computed(() => Math.max(1040, pdfDays.value.length * pdfColumnWidth.value));
const htmlDownloadName = computed(() => `${safeFilePart(summary.value.projectName || summary.value.title || "schedule")}-schedule.html`);
const scheduleTaskBarHeight = 8;
const scheduleExportRowHeight = 28;
const scheduleExportBarHeight = 16;

function clampDayWidth(value) {
  const number = Number(value || 28);
  return Math.min(56, Math.max(18, Number.isFinite(number) ? number : 28));
}

function setTab(tab) {
  activeTab.value = tab === "pdf" ? "pdf" : "html";
  emit("tab-change", activeTab.value);
}

function setViewMode(mode) {
  localViewMode.value = mode;
}

function adjustZoom(delta) {
  localDayWidth.value = clampDayWidth(localDayWidth.value + delta);
}

function safeFilePart(value) {
  return String(value || "schedule")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "schedule";
}

function downloadTextFile(filename, content, mimeType) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadHtmlExport() {
  downloadTextFile(htmlDownloadName.value, htmlExport.value.html, "text/html;charset=utf-8");
}

function printPdfPreview() {
  if (typeof document === "undefined") return;
  const printableHtml = buildSchedulePdfPrintDocument(props.plan, props.items, props.dependencies, props.exportOptions);
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "schedule-pdf-print");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(printableHtml);
  frameDocument.close();

  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => frame.remove(), 800);
  }, 80);
}

function dayLabel(day = {}) {
  return String(day.day || "").padStart(2, "0");
}

function weekLabel(week = {}) {
  return `${week.startDate || ""}-${String(week.endDate || "").slice(5)}`;
}

function barStyle(item = {}, columnWidth = 28) {
  return {
    transform: `translateX(${Math.max(0, item.startOffset || 0) * columnWidth}px)`,
    width: `${Math.max(1, item.duration || 1) * columnWidth}px`,
    backgroundColor: item.color || "#58a9d5"
  };
}

function barTop(item = {}, index = 0) {
  const height = item.type === "task" ? scheduleTaskBarHeight : scheduleExportBarHeight;
  return `${index * scheduleExportRowHeight + Math.round((scheduleExportRowHeight - height) / 2)}px`;
}

function rowStyle(item = {}, index = 0) {
  return {
    "--schedule-export-item-color": item.color || "#58a9d5",
    "--schedule-export-row-index": index
  };
}

function open(tab = activeTab.value) {
  activeTab.value = tab === "pdf" ? "pdf" : "html";
  localVisible.value = true;
  emit("update:modelValue", true);
}

function close() {
  visible.value = false;
}

defineExpose({
  open,
  close,
  downloadHtmlExport,
  printPdfPreview,
  getHtmlExport: () => htmlExport.value,
  getPdfPreviewModel: () => pdfPreview.value
});
</script>

<template>
  <el-dialog
    v-model="visible"
    class="schedule-export-dialog-shell"
    width="min(1180px, calc(100vw - 32px))"
    :show-close="false"
  >
    <section class="schedule-export-dialog" aria-label="排期导出预览">
      <header class="schedule-export-dialog__head">
        <div>
          <span class="schedule-export-dialog__kicker">导出预览</span>
          <h3>排期导出预览</h3>
        </div>
        <button class="schedule-export-icon-button" type="button" title="关闭" @click="close">
          <CircleClose aria-hidden="true" />
        </button>
      </header>

      <div class="schedule-export-summary" aria-label="当前排期摘要">
        <div class="schedule-export-summary__main">
          <span>项目排期</span>
          <strong>{{ summary.projectName }}</strong>
          <em>{{ summary.dateRange }}</em>
        </div>
        <dl>
          <div>
            <dt>排期</dt>
            <dd>{{ summary.scheduleCount }}</dd>
          </div>
          <div>
            <dt>任务</dt>
            <dd>{{ summary.taskCount }}</dd>
          </div>
          <div>
            <dt>总项</dt>
            <dd>{{ summary.itemCount }}</dd>
          </div>
        </dl>
      </div>

      <div class="schedule-export-tabs" role="tablist" aria-label="导出类型">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'html'"
          :class="{ 'is-active': activeTab === 'html' }"
          @click="setTab('html')"
        >
          <DataLine aria-hidden="true" />
          <span>网页预览</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'pdf'"
          :class="{ 'is-active': activeTab === 'pdf' }"
          @click="setTab('pdf')"
        >
          <Document aria-hidden="true" />
          <span>文档预览（PDF）</span>
        </button>
      </div>

      <section v-if="activeTab === 'html'" class="schedule-export-panel" role="tabpanel">
        <div class="schedule-export-modebar">
          <div class="schedule-export-modebar__title">
            <strong>网页交互式静态导出</strong>
            <span>保留横向滚动、缩放和视图切换</span>
          </div>
          <div class="schedule-export-modebar__actions" aria-label="网页预览交互控件">
            <button
              class="schedule-export-action-button schedule-export-action-button--primary"
              type="button"
              data-testid="schedule-export-download-html"
              @click="downloadHtmlExport"
            >
              <Download aria-hidden="true" />
              <span>下载网页文件（HTML）</span>
            </button>
            <div class="schedule-export-view-switch">
              <button
                v-for="mode in viewModes"
                :key="mode.key"
                type="button"
                :class="{ 'is-active': localViewMode === mode.key }"
                @click="setViewMode(mode.key)"
              >
                <component :is="mode.icon" aria-hidden="true" />
                <span>{{ mode.label }}</span>
              </button>
            </div>
            <div class="schedule-export-zoom" :title="`每天 ${localDayWidth}px`">
              <button type="button" title="放大视图" @click="adjustZoom(4)">
                <ZoomIn aria-hidden="true" />
              </button>
              <button type="button" title="缩小视图" @click="adjustZoom(-4)">
                <ZoomOut aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div class="schedule-export-html-shell">
          <div class="schedule-export-preview-title">
            <strong>{{ htmlSnapshot.plan.title }}</strong>
            <span>{{ htmlSnapshot.plan.startDate }}-{{ htmlSnapshot.plan.endDate }}</span>
            <em>{{ htmlSnapshot.plan.projectName }}</em>
          </div>
          <div class="schedule-export-workspace">
            <aside class="schedule-export-left">
              <div class="schedule-export-left__head">部门/排期名称/流程</div>
              <div
                v-for="(item, index) in htmlSnapshot.items"
                :key="item.id"
                class="schedule-export-left__row"
                :class="{ 'is-selected': index === 2 }"
                :style="rowStyle(item, index)"
              >
                <i></i>
                <span>{{ item.title }}</span>
              </div>
            </aside>
            <div class="schedule-export-scroll">
              <div class="schedule-export-canvas" :style="{ width: `${htmlPreviewWidth}px` }">
                <div class="schedule-export-weeks">
                  <span
                    v-for="week in htmlWeeks"
                    :key="week.key"
                    :style="{ width: `${week.days.length * htmlExport.dayWidth}px` }"
                  >
                    {{ weekLabel(week) }}
                  </span>
                </div>
                <div class="schedule-export-days">
                  <span
                    v-for="day in htmlDays"
                    :key="day.date"
                    :class="{ 'is-rest-day': day.isRestDay }"
                    :style="{ width: `${htmlExport.dayWidth}px` }"
                  >
                    {{ dayLabel(day) }}
                  </span>
                </div>
                <div class="schedule-export-grid" :style="{ minHeight: `${Math.max(htmlSnapshot.items.length, 1) * 28}px` }">
                  <span
                    v-for="day in htmlDays"
                    :key="day.date"
                    :class="{ 'is-rest-day': day.isRestDay }"
                    :style="{ width: `${htmlExport.dayWidth}px` }"
                  ></span>
                  <div
                    v-for="(item, index) in htmlSnapshot.items"
                    :key="item.id"
                    class="schedule-export-bar"
                    :class="{ 'is-thin': item.type === 'task' }"
                    :style="{ ...barStyle(item, htmlExport.dayWidth), top: barTop(item, index) }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="schedule-export-panel schedule-export-panel--pdf" role="tabpanel">
        <div class="schedule-export-static-title">
          <div>
            <strong>静态完整排期（PDF）</strong>
            <span>全量日期与排期铺开，不包含视图切换或缩放控件</span>
          </div>
          <button
            class="schedule-export-action-button schedule-export-action-button--print"
            type="button"
            data-testid="schedule-export-print-pdf"
            @click="printPdfPreview"
          >
            <Printer aria-hidden="true" />
            <span>导出文档（PDF）</span>
          </button>
        </div>

        <div class="schedule-export-pdf-sheet">
          <div class="schedule-export-preview-title schedule-export-preview-title--pdf">
            <strong>{{ pdfPreview.plan.title }}</strong>
            <span>{{ pdfPreview.plan.startDate }}-{{ pdfPreview.plan.endDate }}</span>
            <em>{{ pdfPreview.plan.projectName }}</em>
          </div>
          <div class="schedule-export-workspace schedule-export-workspace--pdf" :style="{ width: `${pdfPreviewWidth + 250}px` }">
            <aside class="schedule-export-left schedule-export-left--pdf">
              <div class="schedule-export-left__head">部门/排期名称/流程</div>
              <div
                v-for="(item, index) in pdfPage.items"
                :key="item.id"
                class="schedule-export-left__row"
                :class="{ 'is-selected': index === 2 }"
                :style="rowStyle(item, index)"
              >
                <i></i>
                <span>{{ item.title }}</span>
              </div>
            </aside>
            <div class="schedule-export-canvas schedule-export-canvas--pdf" :style="{ width: `${pdfPreviewWidth}px` }">
              <div class="schedule-export-weeks">
                <span
                  v-for="week in pdfWeeks"
                  :key="week.key"
                  :style="{ width: `${week.days.length * pdfColumnWidth}px` }"
                >
                  {{ weekLabel(week) }}
                </span>
              </div>
              <div class="schedule-export-days">
                <span
                  v-for="day in pdfDays"
                  :key="day.date"
                  :class="{ 'is-rest-day': day.isRestDay }"
                  :style="{ width: `${pdfColumnWidth}px` }"
                >
                  {{ dayLabel(day) }}
                </span>
              </div>
              <div class="schedule-export-grid" :style="{ minHeight: `${Math.max(pdfPage.items.length, 1) * 28}px` }">
                <span
                  v-for="day in pdfDays"
                  :key="day.date"
                  :class="{ 'is-rest-day': day.isRestDay }"
                  :style="{ width: `${pdfColumnWidth}px` }"
                ></span>
                <div
                  v-for="(item, index) in pdfPage.items"
                  :key="item.id"
                  class="schedule-export-bar"
                  :class="{ 'is-thin': item.type === 'task' }"
                  :style="{ ...barStyle(item, pdfColumnWidth), top: barTop(item, index) }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  </el-dialog>
</template>

<style scoped>
:deep(.schedule-export-dialog-shell .el-dialog) {
  border-radius: 22px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(27, 42, 52, 0.18);
}

:deep(.schedule-export-dialog-shell .el-dialog__header) {
  display: none;
}

:deep(.schedule-export-dialog-shell .el-dialog__body) {
  padding: 0;
}

.schedule-export-dialog {
  color: #22302a;
  font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  background: #ffffff;
}

.schedule-export-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 12px;
  border-bottom: 1px solid #dfe6df;
  background: linear-gradient(90deg, #fbf7dd 0%, #eef7fb 100%);
}

.schedule-export-dialog__kicker {
  display: block;
  margin-bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  color: #7d8b85;
}

.schedule-export-dialog h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  color: #153f27;
}

.schedule-export-icon-button,
.schedule-export-action-button,
.schedule-export-zoom button,
.schedule-export-view-switch button,
.schedule-export-tabs button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.schedule-export-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(118, 132, 143, 0.35);
  border-radius: 999px;
  color: #65717a;
  background: rgba(255, 255, 255, 0.78);
  transition: transform 0.16s ease, border-color 0.16s ease, color 0.16s ease, background-color 0.16s ease;
}

.schedule-export-icon-button svg {
  width: 18px;
  height: 18px;
}

.schedule-export-icon-button:hover {
  color: #1f6f9f;
  border-color: #9bd1f3;
  background: #ffffff;
  transform: translateY(-1px) rotate(8deg);
}

.schedule-export-icon-button:active {
  transform: translateY(0) scale(0.96);
}

.schedule-export-summary {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e9ee;
}

.schedule-export-summary__main {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: baseline;
  min-width: 0;
}

.schedule-export-summary__main span,
.schedule-export-summary__main em,
.schedule-export-static-title span,
.schedule-export-modebar__title span {
  color: #8d98a5;
  font-style: normal;
}

.schedule-export-summary__main strong {
  min-width: 0;
  overflow: hidden;
  color: #202020;
  font-size: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-export-summary dl {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
  margin: 0;
}

.schedule-export-summary dl div {
  display: grid;
  grid-template-columns: auto auto;
  gap: 6px;
  align-items: baseline;
  min-width: 66px;
  padding: 8px 10px;
  border: 1px solid #d9dee5;
  border-radius: 8px;
  background: #f7f9fb;
}

.schedule-export-summary dt {
  color: #8d98a5;
  font-size: 12px;
}

.schedule-export-summary dd {
  margin: 0;
  color: #153f27;
  font-size: 18px;
  font-weight: 700;
}

.schedule-export-tabs {
  display: flex;
  gap: 8px;
  padding: 14px 24px 0;
}

.schedule-export-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid #d9dee5;
  border-radius: 8px 8px 0 0;
  color: #77828e;
  background: #f5f7fa;
}

.schedule-export-tabs button.is-active {
  color: #2d9be8;
  border-color: #badcf4;
  border-bottom-color: #ffffff;
  background: #ffffff;
}

.schedule-export-tabs button,
.schedule-export-view-switch button,
.schedule-export-zoom button {
  transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.schedule-export-tabs button:hover,
.schedule-export-view-switch button:hover,
.schedule-export-zoom button:hover {
  transform: translateY(-1px);
}

.schedule-export-tabs svg,
.schedule-export-view-switch svg,
.schedule-export-zoom svg,
.schedule-export-action-button svg {
  width: 16px;
  height: 16px;
}

.schedule-export-panel {
  padding: 16px 24px 24px;
}

.schedule-export-modebar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.schedule-export-modebar__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.schedule-export-modebar__title strong,
.schedule-export-static-title strong {
  font-size: 16px;
  color: #22302a;
}

.schedule-export-modebar__actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.schedule-export-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #bfd5e4;
  border-radius: 8px;
  color: #24526c;
  background: #f7fbfd;
  font-size: 13px;
  white-space: nowrap;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.schedule-export-action-button svg {
  width: 16px;
  height: 16px;
}

.schedule-export-action-button:hover {
  border-color: #87c5eb;
  background: #eef8ff;
  box-shadow: 0 6px 14px rgba(50, 122, 171, 0.14);
  transform: translateY(-1px);
}

.schedule-export-action-button:active {
  box-shadow: none;
  transform: translateY(0) scale(0.98);
}

.schedule-export-action-button--primary {
  color: #ffffff;
  border-color: #2387c5;
  background: #2387c5;
}

.schedule-export-action-button--primary:hover {
  border-color: #1976ad;
  background: #1976ad;
}

.schedule-export-action-button--print {
  color: #214f2f;
  border-color: #b9d9c2;
  background: #f3fbf5;
}

.schedule-export-action-button--print:hover {
  border-color: #81c691;
  background: #eaf7ed;
}

.schedule-export-view-switch {
  display: flex;
  overflow: hidden;
  border: 1px solid #d9dee5;
  border-radius: 8px;
}

.schedule-export-view-switch button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  color: #8d98a5;
  background: #ffffff;
}

.schedule-export-view-switch button + button {
  border-left: 1px solid #e3e7ec;
}

.schedule-export-view-switch button.is-active {
  color: #2d9be8;
  background: #eef8ff;
}

.schedule-export-zoom {
  display: inline-flex;
  gap: 0;
  overflow: hidden;
  border: 1px solid #cbd2da;
  border-radius: 8px;
  background: #ffffff;
}

.schedule-export-zoom button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 32px;
  color: #5f666d;
  background: #ffffff;
}

.schedule-export-zoom button + button {
  border-left: 1px solid #d9dee5;
}

.schedule-export-html-shell,
.schedule-export-pdf-sheet {
  border: 1px solid #cfd5dc;
  border-radius: 10px;
  background: #ffffff;
}

.schedule-export-html-shell {
  padding: 16px;
}

.schedule-export-preview-title {
  display: grid;
  grid-template-columns: 120px 150px 1fr;
  gap: 10px;
  align-items: center;
  padding: 0 0 12px;
}

.schedule-export-preview-title strong {
  color: #222222;
  font-size: 20px;
}

.schedule-export-preview-title span {
  color: #8d98a5;
  font-size: 14px;
}

.schedule-export-preview-title em {
  color: #202020;
  font-size: 18px;
  font-style: normal;
  font-weight: 700;
  text-align: center;
}

.schedule-export-workspace {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  align-items: start;
}

.schedule-export-left {
  position: relative;
  z-index: 2;
  border: 1px solid #cfd5dc;
  border-right: 0;
  background: #ffffff;
}

.schedule-export-left__head {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid #cfd5dc;
  color: #22302a;
  font-size: 13px;
  font-weight: 600;
}

.schedule-export-left__row {
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 8px;
  align-items: center;
  height: 28px;
  min-width: 0;
  padding: 0 10px;
  border-bottom: 1px solid #ffffff;
  background: #f2f3f5;
  color: #4c5963;
  font-size: 12px;
}

.schedule-export-left__row:nth-child(odd) {
  background: #e9eef2;
}

.schedule-export-left__row.is-selected {
  background: #aef0bd;
}

.schedule-export-left__row::before {
  position: absolute;
  left: 0;
  width: 5px;
  height: 28px;
  background: var(--schedule-export-item-color);
  content: "";
}

.schedule-export-left__row i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--schedule-export-item-color);
}

.schedule-export-left__row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-export-scroll {
  overflow: auto;
  border: 1px solid #cfd5dc;
  background: #ffffff;
}

.schedule-export-canvas {
  min-width: 100%;
}

.schedule-export-weeks,
.schedule-export-days {
  display: flex;
}

.schedule-export-weeks span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border-right: 2px solid #cbd2da;
  color: #8d98a5;
  font-size: 12px;
}

.schedule-export-days span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border-top: 1px solid #e1e4e8;
  border-right: 1px solid #e1e4e8;
  color: #89929c;
  font-size: 12px;
  background: #f1f2f3;
}

.schedule-export-days span.is-rest-day,
.schedule-export-grid > span.is-rest-day {
  color: #ffffff;
  background: #77dc86;
}

.schedule-export-grid {
  position: relative;
  display: flex;
  overflow: hidden;
}

.schedule-export-grid > span {
  display: block;
  min-height: inherit;
  border-right: 1px solid #e1e4e8;
  background: linear-gradient(#ffffff 27px, #f3f5f7 28px);
}

.schedule-export-grid > span.is-rest-day {
  opacity: 0.45;
}

.schedule-export-grid::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 84px;
  width: 1px;
  border-left: 1px dashed #e35d65;
  content: "";
}

.schedule-export-bar {
  position: absolute;
  left: 0;
  height: 16px;
  border-radius: 5px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}

.schedule-export-bar.is-thin {
  height: 8px;
  border-radius: 3px;
  opacity: 0.86;
}

.schedule-export-static-title {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.schedule-export-static-title > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.schedule-export-panel--pdf {
  overflow: hidden;
}

.schedule-export-pdf-sheet {
  overflow: auto;
  max-height: 520px;
  padding: 18px;
  background: #ffffff;
}

.schedule-export-preview-title--pdf {
  width: max-content;
  min-width: 1040px;
}

.schedule-export-workspace--pdf {
  grid-template-columns: 250px max-content;
  width: max-content;
}

.schedule-export-left--pdf {
  border-right: 0;
}

.schedule-export-canvas--pdf {
  border: 1px solid #cfd5dc;
}

@media (max-width: 900px) {
  .schedule-export-summary,
  .schedule-export-modebar,
  .schedule-export-static-title {
    align-items: stretch;
    flex-direction: column;
  }

  .schedule-export-summary__main {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .schedule-export-modebar__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .schedule-export-view-switch {
    overflow-x: auto;
  }

  .schedule-export-workspace {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}
</style>
