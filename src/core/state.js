export function createInitialState(overrides = {}) {
  return {
    account: {
      equityUsd: 10_000,
      ...(overrides.account ?? {})
    },
    day: {
      realizedPnlUsd: 0,
      consecutiveLosses: 0,
      ...(overrides.day ?? {})
    },
    positions: overrides.positions ? [...overrides.positions] : [],
    seenIntents: new Map()
  };
}

export function totalExposureUsd(state) {
  return state.positions.reduce((sum, position) => {
    return sum + Math.abs(Number(position.notionalUsd ?? 0));
  }, 0);
}
