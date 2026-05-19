const DEPARTMENT_TAXONOMY = [
  {
    key: "project-management",
    label: "项目管理",
    displayDepartment: "项目管理部",
    aliases: ["project-management", "projectmanagement", "project", "pm", "项目管理", "项目管理部"],
    prefixes: ["项目管理"],
    children: []
  },
  {
    key: "aigc",
    label: "AIGC",
    displayDepartment: "AIGC",
    aliases: ["aigc", "ai-generated", "ai", "AIGC设计", "AI生成", "智能生成", "AIGC"],
    prefixes: ["AIGC", "AI生成", "智能生成"],
    children: []
  },
  {
    key: "art-design",
    label: "美术设计",
    displayDepartment: "美术设计",
    aliases: ["art-design", "artdesign", "design", "美术设计", "美术设计部"],
    prefixes: ["美术设计"],
    children: [
      {
        key: "art-design-1",
        label: "美术设计一部",
        aliases: ["art-design-1", "artdesign-1", "artdesign1", "美术设计一部"],
        prefixes: ["美术设计一部"]
      },
      {
        key: "art-design-2",
        label: "美术设计二部",
        aliases: ["art-design-2", "artdesign-2", "artdesign2", "美术设计二部"],
        prefixes: ["美术设计二部"]
      }
    ]
  },
  {
    key: "three-dynamic",
    label: "三维动态",
    displayDepartment: "三维动态",
    aliases: [
      "three-dynamic",
      "threedynamic",
      "3d-dynamic",
      "3ddynamic",
      "3d-dynamic",
      "三维动态",
      "三维动态设计部",
      "三维动画",
      "三维动画设计部",
      "三维设计",
      "三维视觉部"
    ],
    prefixes: ["三维动态", "三维动画", "三维设计", "三维视觉"],
    children: []
  },
  {
    key: "motion-design",
    label: "动效设计",
    displayDepartment: "动效设计",
    aliases: ["motion-design", "motiondesign", "motion", "动效设计", "动效设计部", "动画动效", "动画设计", "动效组"],
    prefixes: ["动效设计", "动效", "动画动效", "动画设计"],
    children: []
  },
  {
    key: "visual-packaging",
    label: "视效包装",
    displayDepartment: "视效包装",
    aliases: [
      "visual-packaging",
      "visualpackaging",
      "post-composition",
      "postcomposition",
      "post",
      "后期合成",
      "后期合成部",
      "后期设计",
      "后期设计部",
      "视效包装",
      "视效包装部"
    ],
    prefixes: ["视效包装", "后期合成", "后期设计"],
    children: [
      {
        key: "visual-packaging-1",
        label: "视效包装一部",
        aliases: [
          "visual-packaging-1",
          "visualpackaging-1",
          "visualpackaging1",
          "post-composition-1",
          "postcomposition-1",
          "postcomposition1",
          "视效包装一部",
          "视效1部",
          "视效1",
          "视效一部",
          "后期合成一部",
          "后期设计一部"
        ],
        prefixes: ["视效包装一部", "视效1", "视效一部", "后期合成一部", "后期设计一部"]
      },
      {
        key: "visual-packaging-2",
        label: "视效包装二部",
        aliases: [
          "visual-packaging-2",
          "visualpackaging-2",
          "visualpackaging2",
          "post-composition-2",
          "postcomposition-2",
          "postcomposition2",
          "视效包装二部",
          "视效2部",
          "视效2",
          "视效二部",
          "后期合成二部",
          "后期设计二部"
        ],
        prefixes: ["视效包装二部", "视效2", "视效二部", "后期合成二部", "后期设计二部"]
      },
      {
        key: "visual-packaging-3",
        label: "视效包装三部",
        aliases: [
          "visual-packaging-3",
          "visualpackaging-3",
          "visualpackaging3",
          "post-composition-3",
          "postcomposition-3",
          "postcomposition3",
          "视效包装三部",
          "视效3部",
          "视效3",
          "视效三部",
          "后期合成三部",
          "后期设计三部"
        ],
        prefixes: ["视效包装三部", "视效3", "视效三部", "后期合成三部", "后期设计三部"]
      }
    ]
  }
];

function cleanDepartmentText(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return cleanDepartmentText(value)
    .toLowerCase()
    .replace(/[（）()]/g, "")
    .replace(/[\s_]+/g, "")
    .replace(/[–—]/g, "-");
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.map((item) => cleanDepartmentText(item)).filter(Boolean)));
}

function buildPreparedTaxonomy() {
  return DEPARTMENT_TAXONOMY.map((root, index) => {
    const rootExactValues = uniqueValues([root.label, root.displayDepartment, ...(root.aliases || [])]);
    const rootPrefixValues = uniqueValues(root.prefixes || []);
    const children = (root.children || []).map((child, childIndex) => {
      const childExactValues = uniqueValues([child.label, ...(child.aliases || [])]);
      const childPrefixValues = uniqueValues(child.prefixes || []);
      return {
        ...child,
        sortOrder: index * 100 + childIndex + 1,
        exactValues: childExactValues,
        exactTokens: new Set(childExactValues.map(normalizeToken).filter(Boolean)),
        prefixValues: childPrefixValues,
        prefixTokens: childPrefixValues.map(normalizeToken).filter(Boolean)
      };
    });

    return {
      ...root,
      sortOrder: index * 100,
      exactValues: rootExactValues,
      exactTokens: new Set(rootExactValues.map(normalizeToken).filter(Boolean)),
      prefixValues: rootPrefixValues,
      prefixTokens: rootPrefixValues.map(normalizeToken).filter(Boolean),
      children
    };
  });
}

const PREPARED_TAXONOMY = buildPreparedTaxonomy();
const TAXONOMY_BY_KEY = new Map(PREPARED_TAXONOMY.map((item) => [item.key, item]));

function matchesPreparedNode(preparedNode, token = "", clean = "") {
  if (!preparedNode || !token) return false;
  if (preparedNode.exactTokens.has(token)) return true;
  const normalizedClean = clean.toLowerCase();
  if (preparedNode.prefixValues.some((prefix) => normalizedClean.startsWith(prefix.toLowerCase()))) return true;
  if (preparedNode.prefixTokens.some((prefixToken) => token.startsWith(prefixToken))) return true;
  return false;
}

function cloneChildren(children = []) {
  return children.map((child) => ({
    key: child.key,
    label: child.label
  }));
}

export const DEPARTMENT_CANONICAL_KEYS = PREPARED_TAXONOMY.map((item) => item.key);

export function getDepartmentTaxonomy() {
  return PREPARED_TAXONOMY.map((item) => ({
    key: item.key,
    label: item.label,
    displayDepartment: item.displayDepartment,
    aliases: [...item.exactValues],
    children: cloneChildren(item.children)
  }));
}

export function findDepartmentTaxonomyByKey(departmentKey = "") {
  return TAXONOMY_BY_KEY.get(cleanDepartmentText(departmentKey)) || null;
}

export function resolveDepartmentMeta(value = "") {
  const rawDepartment = cleanDepartmentText(value);
  if (!rawDepartment) {
    return {
      rawDepartment: "",
      departmentKey: "",
      childDepartmentKey: "",
      displayDepartment: "",
      departmentPath: "",
      departmentLabel: "",
      departmentOrder: Number.MAX_SAFE_INTEGER
    };
  }

  const token = normalizeToken(rawDepartment);
  for (const root of PREPARED_TAXONOMY) {
    for (const child of root.children) {
      if (!matchesPreparedNode(child, token, rawDepartment)) continue;
      return {
        rawDepartment,
        departmentKey: root.key,
        childDepartmentKey: child.key,
        displayDepartment: child.label,
        departmentPath: `${root.label}/${child.label}`,
        departmentLabel: root.label,
        departmentOrder: root.sortOrder
      };
    }
  }

  for (const root of PREPARED_TAXONOMY) {
    if (!matchesPreparedNode(root, token, rawDepartment)) continue;
    const displayDepartment = root.displayDepartment || root.label;
    return {
      rawDepartment,
      departmentKey: root.key,
      childDepartmentKey: "",
      displayDepartment,
      departmentPath: root.label === displayDepartment ? root.label : `${root.label}/${displayDepartment}`,
      departmentLabel: root.label,
      departmentOrder: root.sortOrder
    };
  }

  return {
    rawDepartment,
    departmentKey: "",
    childDepartmentKey: "",
    displayDepartment: rawDepartment,
    departmentPath: rawDepartment,
    departmentLabel: rawDepartment,
    departmentOrder: Number.MAX_SAFE_INTEGER
  };
}

export function resolveDepartmentFilterValues(value = "") {
  const clean = cleanDepartmentText(value);
  if (!clean) return [];
  const meta = resolveDepartmentMeta(clean);
  if (!meta.departmentKey) return [clean];
  const root = findDepartmentTaxonomyByKey(meta.departmentKey);
  if (!root) return [clean];

  if (meta.childDepartmentKey) {
    const child = root.children.find((item) => item.key === meta.childDepartmentKey);
    return uniqueValues([
      clean,
      meta.displayDepartment,
      child?.label || "",
      ...(child?.exactValues || []),
      ...(child?.prefixValues || [])
    ]);
  }

  const values = [clean, meta.displayDepartment, root.label, root.displayDepartment, ...(root.exactValues || []), ...(root.prefixValues || [])];
  for (const child of root.children) {
    values.push(child.label, ...(child.exactValues || []), ...(child.prefixValues || []));
  }
  return uniqueValues(values);
}

export function departmentSortValue(value = "") {
  return resolveDepartmentMeta(value).departmentOrder;
}
