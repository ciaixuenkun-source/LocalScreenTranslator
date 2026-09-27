function shouldCloseTextWindowOnBlur({ state, windowFocused, windowMinimized }) {
  return Boolean(
    state &&
    !state.pinned &&
    (!state.pinTransitionUntil || Date.now() >= state.pinTransitionUntil) &&
    !state.contextMenuOpen &&
    !windowFocused &&
    !windowMinimized
  );
}

module.exports = { shouldCloseTextWindowOnBlur };
