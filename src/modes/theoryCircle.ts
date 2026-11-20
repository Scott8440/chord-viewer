// Theory quiz, the circle of fifths: one key is given at a random place on the circle and the rest are filled in
// one prompt at a time, asked as "where does this key go?" (picked on the circle) or "which key goes here?" (picked
// from the board under it, or its tonic played). A right answer moves on after a moment; a full circle a little
// later, to a new round. Skip reveals the place and moves on. Each prompt is recorded once, answered or skipped.
import {
  fifthsFromAnchor,
  initialCircleQuiz,
  keyAt,
  makeCirclePrompt,
  newCircleRound,
  reduceCircleQuiz,
  type CircleQuizAction,
  type CircleQuizState,
} from "../exercises/circleQuiz";
import type { Rng } from "../exercises/random";
import { noRecorder, type Recorder } from "../progress/recorder";
import { circleDrillBody } from "../progress/records";
import type { AnswerBoard } from "../views/answerBoard";
import type { CircleQuizView } from "../views/circleQuiz";
import {
  circleQuizAnswers,
  circleQuizDisplay,
  circleQuizModel,
  ringKeyName,
  type PracticeView,
} from "../views/practice";
import { onPlayerInput, type AppStore, type Mode } from "./performance";
import { createPromptRecords } from "./promptRecords";

/** How long a right answer stays up before the next prompt, and a completed circle before the next round */
export const CIRCLE_NEXT_MS = 1100;
export const CIRCLE_ROUND_MS = 2200;

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
  const first = newCircleRound(rng, options().ring);
  let state: CircleQuizState = initialCircleQuiz(makeCirclePrompt(rng, options(), first, [first.anchorSpot]));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  /** The answer's key name, and wrong answers as key names (a wrong place: the key that belongs there) */
  const records = createPromptRecords<CircleQuizState>(recorder, (s, answered, ms) => {
    const { round, ask, spot } = s.prompt;
    const guesses = s.tried.map(t => ringKeyName(round.ring, ask === "where" ? keyAt(round, t) : t));
    return circleDrillBody(
      ringKeyName(round.ring, keyAt(round, spot)),
      {
        ask,
        ring: round.ring,
        fifths: fifthsFromAnchor(round, spot),
      },
      answered,
      s.missed,
      ms,
      guesses,
    );
  });

  function render() {
    views.practice.render(circleQuizDisplay(state));
    views.circleQuiz.render(circleQuizModel(state));
    views.answers.render(circleQuizAnswers(state));
  }

  /** The prompt after this one: in this round, with this prompt's place filled in (a new round once all are) */
  const nextPrompt = (s: CircleQuizState) =>
    makeCirclePrompt(
      rng,
      options(),
      s.prompt.round,
      s.filled.includes(s.prompt.spot) ? s.filled : [...s.filled, s.prompt.spot],
    );

  function apply(action: CircleQuizAction) {
    const prev = state;
    state = reduceCircleQuiz(state, action);
    if (state === prev) return;
    records.changed(prev, state, action.type === "skip");
    render();
    clearTimeout(nextTimer);
    if (state.status === "correct")
      nextTimer = setTimeout(
        () => apply({ type: "next", prompt: nextPrompt(state) }),
        state.filled.length >= 12 ? CIRCLE_ROUND_MS : CIRCLE_NEXT_MS,
      );
  }

  const offSpot = views.circleQuiz.onSpot(spot => apply({ type: "spot", spot }));
  const offAnswer = views.answers.onAnswer(id => apply({ type: "key", key: Number(id) }));
  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  // New options: a new question to fit them (a new round for the other ring); not a skip
  const offSettings = store.subscribe((s, prev) => {
    if (s.settings.circleQuiz !== prev.settings.circleQuiz)
      apply({ type: "next", prompt: makeCirclePrompt(rng, s.settings.circleQuiz, state.prompt.round, state.filled) });
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
      apply({ type: "skip", prompt: nextPrompt(state) });
    },
  };
}
