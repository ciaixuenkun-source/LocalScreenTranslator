const BALL_STATES = Object.freeze({
  FLOATING: "floating",
  DOCKED_VISIBLE: "docked-visible",
  HIDING: "hiding",
  DOCKED_HIDDEN: "docked-hidden",
  REVEALING: "revealing"
});

class DockedBallStateMachine {
  constructor({
    hideDelayMs = 2000,
    hideAnimationMs = 560,
    revealAnimationMs = 580,
    animationGraceMs = 180,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onStateChange = () => {}
  } = {}) {
    this.hideDelayMs = hideDelayMs;
    this.hideAnimationMs = hideAnimationMs;
    this.revealAnimationMs = revealAnimationMs;
    this.animationGraceMs = animationGraceMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onStateChange = onStateChange;
    this.state = BALL_STATES.FLOATING;
    this.docked = false;
    this.pointerInside = false;
    this.menuOpen = false;
    this.dragging = false;
    this.suspended = false;
    this.hideTimer = null;
    this.animationTimer = null;
  }

  transition(nextState) {
    if (this.state === nextState) return;
    const previousState = this.state;
    this.clearAnimationTimer();
    this.state = nextState;
    this.onStateChange(nextState, previousState);

    if (nextState === BALL_STATES.HIDING) {
      this.animationTimer = this.setTimer(
        () => this.completeAnimation(BALL_STATES.HIDING),
        this.hideAnimationMs + this.animationGraceMs
      );
    } else if (nextState === BALL_STATES.REVEALING) {
      this.animationTimer = this.setTimer(
        () => this.completeAnimation(BALL_STATES.REVEALING),
        this.revealAnimationMs + this.animationGraceMs
      );
    }
  }

  clearHideTimer() {
    if (this.hideTimer !== null) this.clearTimer(this.hideTimer);
    this.hideTimer = null;
  }

  clearAnimationTimer() {
    if (this.animationTimer !== null) this.clearTimer(this.animationTimer);
    this.animationTimer = null;
  }

  canHide() {
    return Boolean(
      this.docked &&
      !this.pointerInside &&
      !this.menuOpen &&
      !this.dragging &&
      !this.suspended &&
      this.state === BALL_STATES.DOCKED_VISIBLE
    );
  }

  scheduleHide() {
    this.clearHideTimer();
    if (!this.canHide()) return;
    this.hideTimer = this.setTimer(() => {
      this.hideTimer = null;
      if (this.canHide()) this.transition(BALL_STATES.HIDING);
    }, this.hideDelayMs);
  }

  setDocked(docked) {
    this.docked = Boolean(docked);
    this.clearHideTimer();
    if (!this.docked) {
      this.transition(BALL_STATES.FLOATING);
      return;
    }
    if (this.state === BALL_STATES.FLOATING) {
      this.transition(BALL_STATES.DOCKED_VISIBLE);
    }
    this.scheduleHide();
  }

  pointerEntered() {
    this.pointerInside = true;
    this.clearHideTimer();
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      this.transition(BALL_STATES.REVEALING);
    }
  }

  pointerLeft() {
    this.pointerInside = false;
    this.scheduleHide();
  }

  menuOpened() {
    this.menuOpen = true;
    this.clearHideTimer();
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      this.transition(BALL_STATES.REVEALING);
    }
  }

  menuClosed() {
    this.menuOpen = false;
    this.scheduleHide();
  }

  reveal() {
    this.clearHideTimer();
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      this.transition(BALL_STATES.REVEALING);
    }
  }

  dragStarted() {
    this.dragging = true;
    this.clearHideTimer();
    this.transition(this.docked ? BALL_STATES.DOCKED_VISIBLE : BALL_STATES.FLOATING);
  }

  dragEnded(docked) {
    this.dragging = false;
    this.setDocked(docked);
  }

  completeAnimation(animationState) {
    if (this.state !== animationState) return false;
    this.clearAnimationTimer();
    if (animationState === BALL_STATES.HIDING) {
      if (!this.canCompleteHide()) {
        this.transition(BALL_STATES.REVEALING);
      } else {
        this.transition(BALL_STATES.DOCKED_HIDDEN);
      }
      return true;
    }
    this.transition(this.docked ? BALL_STATES.DOCKED_VISIBLE : BALL_STATES.FLOATING);
    this.scheduleHide();
    return true;
  }

  canCompleteHide() {
    return Boolean(
      this.docked &&
      !this.pointerInside &&
      !this.menuOpen &&
      !this.dragging &&
      !this.suspended
    );
  }

  suspend() {
    this.suspended = true;
    this.clearHideTimer();
    if ([BALL_STATES.HIDING, BALL_STATES.REVEALING].includes(this.state)) {
      this.transition(this.docked ? BALL_STATES.DOCKED_VISIBLE : BALL_STATES.FLOATING);
    }
  }

  resume() {
    this.suspended = false;
    this.scheduleHide();
  }

  dispose() {
    this.suspended = true;
    this.clearHideTimer();
    this.clearAnimationTimer();
  }
}

module.exports = { BALL_STATES, DockedBallStateMachine };
