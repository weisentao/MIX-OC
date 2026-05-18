import { ElMessageBox } from "element-plus";

const baseOptions = {
  customClass: "app-message-window",
  confirmButtonText: "确定",
  cancelButtonText: "取消",
  distinguishCancelAndClose: true,
  closeOnClickModal: true,
  closeOnPressEscape: true
};

export async function askText({
  title = "请输入",
  message = "请输入内容",
  inputValue = "",
  placeholder = "",
  inputType = "text",
  confirmButtonText = "确定"
} = {}) {
  try {
    const result = await ElMessageBox.prompt(message, title, {
      ...baseOptions,
      confirmButtonText,
      inputValue,
      inputPlaceholder: placeholder,
      inputType
    });
    return result.value;
  } catch {
    return null;
  }
}

export async function askConfirm({
  title = "请确认",
  message = "确认执行此操作吗？",
  confirmButtonText = "确定",
  cancelButtonText = "取消",
  type = "warning"
} = {}) {
  try {
    await ElMessageBox.confirm(message, title, {
      ...baseOptions,
      confirmButtonText,
      cancelButtonText,
      type
    });
    return true;
  } catch {
    return false;
  }
}
