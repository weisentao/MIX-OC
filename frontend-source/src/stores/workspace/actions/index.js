import { appActions } from "./appActions";
import { boardActions } from "./boardActions";
import { coreActions } from "./coreActions";
import { feedbackActions } from "./feedbackActions";
import { projectActions } from "./projectActions";
import { scheduleActions } from "./scheduleActions";
import { taskActions } from "./taskActions";
import { templateActions } from "./templateActions";
import { userActions } from "./userActions";

export const workspaceActions = {
  ...appActions,
  ...boardActions,
  ...userActions,
  ...coreActions,
  ...feedbackActions,
  ...projectActions,
  ...templateActions,
  ...taskActions,
  ...scheduleActions
};
