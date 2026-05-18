import { lower } from "../../stores/workspace/helpers.js";

const SOURCE_PROJECT = "\u6765\u81ea\u9879\u76ee";
const SOURCE_SCHEDULE = "\u6765\u81ea\u6392\u671f";
const SOURCE_OPTIMIZE = "\u6765\u81ea\u4f18\u5316";
const SOURCE_FLOW = "\u6765\u81ea\u6d41\u7a0b";
const SOURCE_COMMENT = "\u6765\u81ea\u8bc4\u8bba";
const TYPE_SCHEDULE = "\u6392\u671f";
const TYPE_OPTIMIZE = "\u4f18\u5316";
const SEPARATOR = " \u00b7 ";

function getProjectModule(workspace, task) {
  if (typeof workspace.getTaskModule === "function") return workspace.getTaskModule(task);
  return { label: task?.module || "", key: task?.module || "" };
}

function taskSource(task) {
  if (task.type === TYPE_SCHEDULE) return SOURCE_SCHEDULE;
  if (task.type === TYPE_OPTIMIZE) return SOURCE_OPTIMIZE;
  return SOURCE_FLOW;
}

export function buildWorkspaceSearchResults(workspace, queryValue) {
  const query = lower(queryValue);
  if (!query) return [];

  const results = [];
  const projects = Array.isArray(workspace.activeProjects) ? workspace.activeProjects : [];

  projects.forEach((project) => {
    const projectTags = project.tags || [];
    if ([project.name, project.group, ...projectTags].join(" ").toLowerCase().includes(query)) {
      results.push({
        source: SOURCE_PROJECT,
        title: project.name,
        text: `${project.group}${SEPARATOR}${projectTags.join(" / ")}`,
        projectId: project.id
      });
    }

    (project.tasks || []).forEach((task) => {
      const module = getProjectModule(workspace, task);
      if ([task.title, task.type, task.note, module.label, task.owner].join(" ").toLowerCase().includes(query)) {
        results.push({
          source: taskSource(task),
          title: task.title,
          text: `${module.label}${SEPARATOR}${task.note}`,
          projectId: project.id,
          taskId: task.id
        });
      }

      (task.comments || []).forEach((comment) => {
        if ([comment.text, comment.user, comment.dept, comment.time].join(" ").toLowerCase().includes(query)) {
          results.push({
            source: SOURCE_COMMENT,
            title: task.title,
            text: `${comment.dept}: ${comment.user} / ${comment.text}`,
            projectId: project.id,
            taskId: task.id
          });
        }
      });
    });
  });

  return results.slice(0, 8);
}
