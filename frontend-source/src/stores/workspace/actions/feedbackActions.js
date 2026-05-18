let toastTimer;
let celebrationTimer;

export const feedbackActions = {
showToast(message) {
  clearTimeout(toastTimer);
  this.toastMessage = message;
  this.toastVisible = true;
  toastTimer = window.setTimeout(() => {
    this.toastVisible = false;
  }, 2200);
},
celebrate(title, text, withConfetti = false) {
  clearTimeout(celebrationTimer);
  this.celebration = {
    visible: true,
    title,
    text,
    withConfetti,
    seed: Date.now()
  };
  celebrationTimer = window.setTimeout(() => {
    this.celebration.visible = false;
  }, 1350);
},
};
