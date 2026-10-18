type Effect = { dependencies?: readonly unknown[]; cleanup?: () => void };

const sameDependencies = (left?: readonly unknown[], right?: readonly unknown[]) =>
  !!left && !!right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));

export const hookHarness = {
  slots: [] as unknown[],
  index: 0,
  pendingEffects: [] as Array<() => void>,
  effects: [] as Effect[],
  reset() {
    this.slots = [];
    this.index = 0;
    this.pendingEffects = [];
    this.effects = [];
  },
  render<T>(component: () => T): T {
    this.index = 0;
    const output = component();
    const pending = this.pendingEffects.splice(0);
    pending.forEach((effect) => effect());
    return output;
  },
  unmount() {
    this.effects.forEach((effect) => effect.cleanup?.());
    this.reset();
  },
  useState(initial: unknown) {
    const index = hookHarness.index++;
    if (!(index in hookHarness.slots)) {
      const state = {
        value: typeof initial === 'function' ? initial() : initial,
        set(value: unknown) {
          state.value = typeof value === 'function' ? value(state.value) : value;
        },
      };
      hookHarness.slots[index] = state;
    }
    const state = hookHarness.slots[index] as { value: unknown; set: (value: unknown) => void };
    return [state.value, state.set];
  },
  useRef(initial: unknown) {
    const index = hookHarness.index++;
    if (!(index in hookHarness.slots)) hookHarness.slots[index] = { current: initial };
    return hookHarness.slots[index];
  },
  useCallback(callback: unknown, dependencies?: readonly unknown[]) {
    const index = hookHarness.index++;
    const previous = hookHarness.slots[index] as { callback: unknown; dependencies?: readonly unknown[] } | undefined;
    if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
      hookHarness.slots[index] = { callback, dependencies };
    }
    return (hookHarness.slots[index] as { callback: unknown }).callback;
  },
  useMemo(callback: () => unknown, dependencies?: readonly unknown[]) {
    const index = hookHarness.index++;
    const previous = hookHarness.slots[index] as { value: unknown; dependencies?: readonly unknown[] } | undefined;
    if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
      hookHarness.slots[index] = { value: callback(), dependencies };
    }
    return (hookHarness.slots[index] as { value: unknown }).value;
  },
  useReducer(reducer: (state: unknown, action: unknown) => unknown, initial: unknown) {
    const [state, setState] = hookHarness.useState(initial);
    return [state, (action: unknown) => (setState as (value: unknown) => void)((previous: unknown) => reducer(previous, action))];
  },
  useEffect(callback: () => (() => void) | void, dependencies?: readonly unknown[]) {
    const index = hookHarness.index++;
    const previous = hookHarness.slots[index] as Effect | undefined;
    if (previous && sameDependencies(previous.dependencies, dependencies)) return;
    const effect: Effect = { dependencies };
    hookHarness.slots[index] = effect;
    hookHarness.pendingEffects.push(() => {
      previous?.cleanup?.();
      effect.cleanup = callback() || undefined;
      if (previous) hookHarness.effects = hookHarness.effects.filter((item) => item !== previous);
      hookHarness.effects.push(effect);
    });
  },
};

export async function settleHook() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
