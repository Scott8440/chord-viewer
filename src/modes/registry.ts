// Every view's start function, by id: the practice modes and the Progress page. Each takes the same dependencies
// object and uses the parts it needs, so starting a view is a lookup, and a view left out is a type error.
import type { ExcerptLibrary } from "../app/excerpts";
import type { TonePlayer } from "../audio/tones";
import type { ExcerptFile } from "../exercises/excerpts";
import type { Rng } from "../exercises/random";
import type { Recorder } from "../progress/recorder";
import type { ProgressStore } from "../progress/store";
import type { AnswerBoard } from "../views/answerBoard";
import type { ChordNameView } from "../views/chordName";
import type { CircleView } from "../views/circleOfFifths";
import type { DegreeCircleView } from "../views/degreeCircle";
import type { PracticeView } from "../views/practice";
import type { ProgressView } from "../views/progressView";
import type { RoundVizView } from "../views/roundViz";
import type { LadderPickView } from "../views/ladderPick";
import type { PianoSound } from "../audio/piano";
import type { ReferenceView } from "../views/referenceView";
import { startReference } from "./reference";
import type { DegreePadView } from "../views/degreePad";
import type { StaffView } from "../views/staff";
import { startChordPractice } from "./chordPractice";
import { startEarChords } from "./earChords";
import { startEarProgressions } from "./earProgressions";
import { startEarIntervals } from "./earIntervals";
import { startEarMelody } from "./earMelody";
import { startEarTraining } from "./earTraining";
import { startFreePlay } from "./freePlay";
import type { View } from "./page";
import type { AppStore, Mode } from "./performance";
import { startProgress } from "./progress";
import { startProgressionPractice } from "./progressionPractice";
import { startRoutinePractice } from "./routinePractice";
import { startSequencePractice } from "./sequencePractice";
import { startSightReading } from "./sightReading";

/** Everything any view may need; each takes its own part */
export interface ModeDeps {
  store: AppStore;
  views: {
    staff: StaffView;
    practice: PracticeView;
    circle: CircleView;
    chordName: ChordNameView;
    tones: TonePlayer;
    degrees: DegreeCircleView;
    answers: AnswerBoard;
    roundViz: RoundVizView;
    ladder: LadderPickView;
    /** The progressions drill's level picker */
    progressionLadder: LadderPickView;
    /** The intervals drill's level picker */
    intervalLadder: LadderPickView;
    /** The sampled piano the chord-quality drill can play its chords on */
    piano: PianoSound;
    degreePad: DegreePadView;
    progress: ProgressView;
    reference: ReferenceView;
  };
  recorder: Recorder;
  /** Practice history, for the Progress page and the ear modes' rounds */
  history: Promise<ProgressStore>;
  /** Whether history is kept between sessions */
  saved: () => boolean;
  excerpts: (which: ExcerptLibrary) => Promise<ExcerptFile>;
  /** Left out in the app (Math.random); tests pass a seeded one */
  rng?: Rng;
}

export const MODE_REGISTRY: Record<View, (deps: ModeDeps) => Mode> = {
  free: startFreePlay,
  reading: startSightReading,
  chords: startChordPractice,
  progressions: startProgressionPractice,
  // The prescriptive exercises share one runner
  scales: deps => startSequencePractice({ ...deps, id: "scales" }),
  handsTogether: deps => startSequencePractice({ ...deps, id: "handsTogether" }),
  diatonic: deps => startSequencePractice({ ...deps, id: "diatonic" }),
  fiveFinger: deps => startSequencePractice({ ...deps, id: "fiveFinger" }),
  arpeggios: deps => startSequencePractice({ ...deps, id: "arpeggios" }),
  brokenChords: deps => startSequencePractice({ ...deps, id: "brokenChords" }),
  chromatic: deps => startSequencePractice({ ...deps, id: "chromatic" }),
  routines: startRoutinePractice,
  ear: startEarTraining,
  earMelody: startEarMelody,
  earChords: startEarChords,
  earProgressions: startEarProgressions,
  earIntervals: startEarIntervals,
  progress: startProgress,
  reference: startReference,
};
