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
      if (state !== prev) for (const l of [...listeners]) l(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
