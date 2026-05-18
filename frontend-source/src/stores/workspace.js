import { defineStore } from "pinia";
import { createInitialState } from "@/data/seed";
import { workspaceActions } from "./workspace/actions";
import { workspaceGetters } from "./workspace/getters";

export const useWorkspaceStore = defineStore("workspace", {
  state: () => createInitialState(),
  getters: workspaceGetters,
  actions: workspaceActions
});
