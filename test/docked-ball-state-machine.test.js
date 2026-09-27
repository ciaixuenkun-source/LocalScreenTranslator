const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BALL_STATES,
  DockedBallStateMachine
} = require("../src/services/floating-ball/docked-ball-state-machine");
const {
  DOCKED_BALL_VISUAL_CONFIG
} = require("../src/services/floating-ball/docked-ball-visual-config");

function createTimers() {
  let nextId = 1;
  const pending = new Map();

  return {
    setTimer(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) {
      pending.delete(id);
    },
    runDelay(delay) {
      const matches = [...pending.entries()].filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matches) {
        if (!pending.delete(id)) continue;
        timer.callback();
      }
    },
    count(delay) {
      return [...pending.values()].filter((timer) => timer.delay === delay).length;
    },
    get size() {
      return pending.size;
    }
  };
}

function createMachine() {
  const timers = createTimers();
  const transitions = [];
  const machine = new DockedBallStateMachine({
    hideDelayMs: 2000,
    hideAnimationMs: 560,
    revealAnimationMs: 580,
    animationGraceMs: 180,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onStateChange(next, previous) {
      transitions.push([previous, next]);
    }
  });
  return { machine, timers, transitions };
}

test("a freely positioned ball never schedules automatic hiding", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(false);
  machine.pointerLeft();

  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.size, 0);
});

test("a docked ball hides after two idle seconds", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);

  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
  assert.equal(timers.count(740), 1);

  assert.equal(machine.completeAnimation(BALL_STATES.HIDING), true);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);
});

test("pointer return cancels hiding and a later leave restarts the full delay", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.pointerEntered();
  assert.equal(timers.count(2000), 0);

  machine.pointerLeft();
  assert.equal(timers.count(2000), 1);
  machine.pointerEntered();
  assert.equal(timers.count(2000), 0);

  machine.pointerLeft();
  assert.equal(timers.count(2000), 1);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
});

test("menu interaction blocks hiding until the menu is closed and left", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.menuOpened();
  machine.pointerLeft();
  assert.equal(timers.count(2000), 0);

  machine.menuClosed();
  assert.equal(timers.count(2000), 1);
});

test("entering during hide reverses to one reveal animation", () => {
  const { machine, timers, transitions } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  machine.pointerEntered();
  machine.pointerEntered();

  assert.equal(machine.state, BALL_STATES.REVEALING);
  assert.equal(timers.count(760), 1);
  assert.equal(
    transitions.filter(([, next]) => next === BALL_STATES.REVEALING).length,
    1
  );

  machine.completeAnimation(BALL_STATES.REVEALING);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 0);
});

test("a hidden ball reveals before dragging and only re-arms when re-docked", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  machine.completeAnimation(BALL_STATES.HIDING);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);

  machine.dragStarted();
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(machine.dragging, true);

  machine.dragEnded(false);
  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.count(2000), 0);

  machine.dragStarted();
  machine.dragEnded(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);
});

test("suspend and dispose cancel pending work", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.suspend();
  assert.equal(timers.size, 0);

  machine.resume();
  assert.equal(timers.count(2000), 1);

  machine.dispose();
  assert.equal(timers.size, 0);
});

test("the refined hidden pose uses the larger centralized visual configuration", () => {
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hiddenScale, 0.9);
  assert.notEqual(DOCKED_BALL_VISUAL_CONFIG.hiddenScale, 0.6);
  assert.deepEqual(
    [
      DOCKED_BALL_VISUAL_CONFIG.hiddenWindowWidth,
      DOCKED_BALL_VISUAL_CONFIG.hiddenWindowHeight
    ],
    [64, 68]
  );
  assert.equal(
    DOCKED_BALL_VISUAL_CONFIG.revealEntryMs +
      DOCKED_BALL_VISUAL_CONFIG.revealSettleMs,
    DOCKED_BALL_VISUAL_CONFIG.revealAnimationMs
  );
});

test("repeated leave events keep only one hide request", () => {
  const { machine, timers, transitions } = createMachine();

  machine.setDocked(true);
  machine.pointerLeft();
  machine.pointerLeft();

  assert.equal(timers.count(2000), 1);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
  assert.equal(
    transitions.filter(([, next]) => next === BALL_STATES.HIDING).length,
    1
  );
});

test("dragging during an animation invalidates its late completion", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);

  machine.dragStarted();
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(machine.completeAnimation(BALL_STATES.HIDING), false);

  machine.dragEnded(false);
  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.size, 0);
});

test("disposing during an animation clears its completion guard", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  assert.equal(timers.count(740), 1);

  machine.dispose();
  assert.equal(timers.size, 0);
});
