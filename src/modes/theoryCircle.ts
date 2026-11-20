// Theory quiz, key relationships on the circle of fifths: one question at a time, each on its own (nothing fills in
// from one to the next): a key's dominant, subdominant, relative or other diatonic neighbour, its closely related keys,
// the key of a signature, or the chords of a chain of dominants. Answered on the circle, from the board of chords
// (chains), or by playing the tonic or root. A right answer moves on after a moment; Skip at once. Each question is
// recorded once, answered or skipped.
import {
  answersOf,
  initialCircleQuiz,
  makeCirclePrompt,
  reduceCircleQuiz,
  ringKeys,
  type CircleQuizAction,
  type CircleQuizState,
  type Place,
} from "../exercises/circleQuiz";
import type { Rng } from "../exercises/random";
import { noRecorder, type Recorder } from "../progress/recorder";
import { circleDrillBody } from "../progress/records";
import type { AnswerBoard } from "../views/answerBoard";
import type { CircleQuizView } from "../views/circleQuiz";
import { circleQuizAnswers, circleQuizDisplay, circleQuizModel, placeName, type PracticeView } from "../views/practice";
import { onPlayerInput, type AppStore, type Mode } from "./performance";
import { createPromptRecords } from "./promptRecords";

/** How long a right answer stays up before the next question (a chain or a set of five a little longer) */
export const CIRCLE_NEXT_MS = 1300;
export const CIRCLE_LONG_MS = 2200;

const fromId = (id: string): Place => {
  const [ring, key] = id.split(":");
  return { ring: ring as Place["ring"], key: Number(key) };
};
const seventh = (key: number) => `${ringKeys("major")[key]}7`;

export function startTheoryCircle({
  store,
  views,
  recorder = noRecorder,
  rng = Math.random,
}: {
  store: AppStore;
  views: { practice: PracticeView; answers: AnswerBoard; circleQuiz: CircleQuizView };
  recorder?: Recorder;
  rng?: Rng;
}): Mode {
  const options = () => store.getState().settings.circleQuiz;
  let state: CircleQuizState = initialCircleQuiz(makeCirclePrompt(rng, options()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  const records = createPromptRecords<CircleQuizState>(recorder, (s, answered, ms) => {
    const p = s.prompt;
    const name = (id: string) => (p.kind === "chain" ? seventh(fromId(id).key) : placeName(fromId(id)));
    const guesses = s.tried.map(name);
    const [label, detail]: [string, Record<string, string | number>] =
      p.kind === "degree"
        ? [`${p.degree} of ${placeName(p.ref)}`, { kind: p.kind, degree: p.degree, ref: placeName(p.ref) }]
        : p.kind === "related"
          ? [`Related to ${placeName(p.ref)}`, { kind: p.kind, ref: placeName(p.ref) }]
          : p.kind === "signature"
            ? [placeName(p.answer), { kind: p.kind }]
            : [
                `${seventh(p.chords[0])} → ${ringKeys("major")[p.chords[p.chords.length - 1]]}`,
                { kind: p.kind, length: p.chords.length },
              ];
    return circleDrillBody(label, detail, answered, s.missed, ms, guesses);
  });

  function render() {
    const asks = options().asks;
    views.practice.render(circleQuizDisplay(state));
    views.circleQuiz.render(
      circleQuizModel(state, {
        sigRow: asks === "mixed" || asks === "signature",
        board: asks === "mixed" || asks === "chain",
      }),
    );
    views.answers.render(circleQuizAnswers(state));
  }

  function apply(action: CircleQuizAction) {
    const prev = state;
    state = reduceCircleQuiz(state, action);
    if (state === prev) return;
    records.changed(prev, state, action.type === "skip");
    render();
    clearTimeout(nextTimer);
    if (state.status === "correct")
      nextTimer = setTimeout(
        () => apply({ type: "next", prompt: makeCirclePrompt(rng, options(), state.prompt) }),
        answersOf(state.prompt).length > 1 ? CIRCLE_LONG_MS : CIRCLE_NEXT_MS,
      );
  }

  const offSpot = views.circleQuiz.onSpot(id => apply({ type: "place", place: fromId(id) }));
  const offAnswer = views.answers.onAnswer(id => apply({ type: "chord", key: Number(id) }));
  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  // New options: a question to fit them (not a skip)
  const offSettings = store.subscribe((s, prev) => {
    if (s.settings.circleQuiz !== prev.settings.circleQuiz)
      apply({ type: "next", prompt: makeCirclePrompt(rng, s.settings.circleQuiz, state.prompt) });
  });
  render();

  return {
    stop() {
      offSpot();
      offAnswer();
      offInput();
      offSettings();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: makeCirclePrompt(rng, options(), state.prompt) });
    },
  };
}
