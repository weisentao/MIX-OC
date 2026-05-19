const MODULE_COLORS = [
  { key: "project", label: "项目管理", aliases: ["项目管理", "项目管理部", "red"], color: "#f16f78" },
  { key: "aigc", label: "AIGC", aliases: ["AIGC", "AIGC设计", "AI", "ai", "yellow"], color: "#f3bd22" },
  { key: "design", label: "美术设计", aliases: ["美术设计", "美术设计部", "设计", "green"], color: "#5dbb73" },
  { key: "threeD", label: "三维动态", aliases: ["三维动态", "三维动态设计部", "三维设计", "三维", "三维动画", "三维动画设计部", "3D", "3d", "threed", "purple"], color: "#b76bd6" },
  { key: "motion", label: "动效设计", aliases: ["动效设计", "动效设计部", "动效", "动画动效", "动画设计", "pink"], color: "#ea6aa0" },
  { key: "post", label: "视效包装", aliases: ["视效包装", "视效包装部", "后期合成", "后期合成部", "后期", "后期设计", "blue"], color: "#58a9d5" }
];

const FALLBACK_MODULE = MODULE_COLORS[0];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function findScheduleColorInfo(moduleValue) {
  const normalized = normalizeText(moduleValue);
  if (!normalized) return null;
  return (
    MODULE_COLORS.find((entry) => {
      if (normalizeText(entry.key) === normalized || normalizeText(entry.label) === normalized) return true;
      return entry.aliases.some((alias) => normalizeText(alias) === normalized);
    }) || null
  );
}

export function getScheduleColorInfo(moduleValue) {
  return findScheduleColorInfo(moduleValue) || FALLBACK_MODULE;
}

export function normalizeScheduleModuleKey(moduleValue) {
  return findScheduleColorInfo(moduleValue)?.key || "";
}

export function getScheduleModuleLabel(moduleValue) {
  return getScheduleColorInfo(moduleValue).label;
}

export function getScheduleModuleColor(moduleValue) {
  return getScheduleColorInfo(moduleValue).color;
}

export function getScheduleModuleOptions() {
  return MODULE_COLORS.map(({ key, label, color }) => ({ key, label, color }));
}
