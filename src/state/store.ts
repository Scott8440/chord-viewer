// Minimal store: holds state, applies a reducer, and tells subscribers what changed.

export type Listener<S> = (state: S, prev: S) => void;

export interface Store<S, A> {
  getState(): S;
  dispatch(action: A): void;
  /** Called after every dispatch that produced a new state. Returns an unsubscribe function. */
  subscribe(listener: Listener<S>): () => void;
}

export function createStore<S, A>(reducer: (state: S, action: A) => S, initial: S): Store<S, A> {
  let state = initial;
  const listeners = new Set<Listener<S>>();
  return {
    getState: () => state,
    dispatch(action) {
      const prev = state;
      state = reducer(state, action);
      // Iterate a copy so listeners can (un)subscribe while being notified, but skip any that unsubscribed
      // during this dispatch (e.g. the old mode when the mode switches), so they never see a state after leaving
      if (state !== prev) for (const l of [...listeners]) if (listeners.has(l)) l(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
