import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createInitialState, realUsersSeed } from "../src/data/seed.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const state = createInitialState();
const users = realUsersSeed.length ? realUsersSeed : [
  {
    id: "u-admin",
    username: "admin",
    name: "admin",
    role: "admin",
    avatar: "管",
    department: "项目管理部",
    departmentEn: "PROJECT MANAGEMENT",
    job: "超级管理员",
    status: "active"
  }
];

const demoProjects = [
  {
    id: 9001,
    name: "后台管理改造演示项目",
    group: "项目管理",
    department: "项目管理部",
    owner: "项目管理: admin",
    startDate: "2026/05/10",
    endDate: "2026/06/21",
    status: "active",
    tags: ["后台管理", "权限复刻"],
    members: ["admin", "严云雪"],
    memberRoles: {
      admin: "manager",
      "严云雪": "editor"
    },
    tasks: [
      {
        id: 900101,
        title: "复刻 admin 总览与侧边导航",
        type: "流程",
        module: "project",
        owner: "项目管理: admin",
        note: "按截图搭建全屏后台控制台。",
        time: "2026/05/13 10:20",
        startDate: "2026/05/10",
        endDate: "2026/05/16",
        scheduleStatus: "doing",
        progress: 60,
        comments: [
          {
            id: "c-900101-1",
            user: "admin",
            dept: "项目管理部",
            time: "2026/05/13 10:20",
            text: "后台管理入口已改为路由页面，等待验收。"
          }
        ],
        unreadComments: 0,
        expanded: false,
        archived: false
      },
      {
        id: 900102,
        title: "普通管理端权限范围",
        type: "流程",
        module: "project",
        owner: "项目管理: admin",
        note: "项目经理、项目管理和组长只看授权范围。",
        time: "2026/05/14 14:10",
        startDate: "2026/05/17",
        endDate: "2026/05/24",
        scheduleStatus: "review",
        progress: 45,
        comments: [
          {
            id: "c-900102-1",
            user: "严云雪",
            dept: "项目管理部",
            time: "2026/05/14 14:10",
            text: "项目 manager 权限按管理端范围开放。"
          }
        ],
        unreadComments: 0,
        expanded: false,
        archived: false
      }
    ]
  }
];

const demoState = {
  ...state,
  activeProjectId: demoProjects[0].id,
  currentUserId: "u-admin",
  users,
  rootProjects: demoProjects,
  projectGroups: [
    {
      id: "g-admin-review",
      title: "审核演示",
      suffix: "1",
      projects: [
        {
          id: 9002,
          name: "普通管理端演示项目",
          group: "审核演示",
          department: "项目管理部",
          owner: "项目管理: admin",
          startDate: "2026/05/15",
          endDate: "2026/06/10",
          status: "active",
          tags: ["普通管理", "项目经理"],
          members: ["admin", "严云雪"],
          memberRoles: {
            admin: "manager",
            "严云雪": "manager"
          },
          tasks: [
            {
              id: 900201,
              title: "对接普通管理接口占位",
              type: "流程",
              module: "project",
              owner: "项目管理: admin",
              note: "保留 /manager 前缀接口，后端可直接实现。",
              time: "2026/05/15 09:30",
              startDate: "2026/05/15",
              endDate: "2026/05/20",
              scheduleStatus: "todo",
              progress: 20,
              comments: [],
              unreadComments: 0,
              expanded: false,
              archived: false
            }
          ]
        }
      ]
    }
  ]
};

const db = {
  authUsers: [
    {
      id: "admin",
      username: "admin",
      password: "admin",
      userId: "u-admin",
      token: "mock-admin-token",
      phone: "18556654263",
      securityQuestion: "你的第一份项目名称是什么？",
      securityAnswer: "项目管理"
    },
    {
      id: "yan",
      username: "MIX-yanyunxue",
      password: "123456",
      userId: "u-yan",
      token: "mock-yan-token",
      phone: "18556654263",
      securityQuestion: "你最喜欢的工作环节是什么？",
      securityAnswer: "建模"
    }
  ],
  appState: [
    {
      id: "main",
      ...demoState
    }
  ],
  users,
  carouselNotices: demoState.carouselNotices,
  tags: demoState.tags,
  templates: demoState.templates,
  rootProjects: demoState.rootProjects,
  projectGroups: demoState.projectGroups
};

writeFileSync(resolve(root, "mock", "db.json"), `${JSON.stringify(db, null, 2)}\n`, "utf8");
