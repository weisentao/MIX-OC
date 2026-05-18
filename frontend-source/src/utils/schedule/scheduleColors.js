const MODULE_COLORS = [
  { key: "project", label: "项目管理", aliases: ["项目管理", "项目管理部", "red"], color: "#f16f78" },
  { key: "aigc", label: "AIGC", aliases: ["AIGC", "ai", "yellow"], color: "#f3bd22" },
  { key: "design", label: "美术设计", aliases: ["美术设计", "设计", "green"], color: "#5dbb73" },
  { key: "threeD", label: "三维动态", aliases: ["三维动态", "三维", "3d", "threed", "purple"], color: "#b76bd6" },
  { key: "motion", label: "动效设计", aliases: ["动效设计", "动效", "pink"], color: "#ea6aa0" },
  { key: "post", label: "后期合成", aliases: ["后期合成", "后期", "blue"], color: "#58a9d5" }
];

const FALLBACK_MODULE = MODULE_COLORS[0];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function getScheduleColorInfo(moduleValue) {
  const normalized = normalizeText(moduleValue);
  return (
    MODULE_COLORS.find((entry) => {
      if (normalizeText(entry.key) === normalized || normalizeText(entry.label) === normalized) return true;
      return entry.aliases.some((alias) => normalizeText(alias) === normalized);
    }) || FALLBACK_MODULE
  );
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
