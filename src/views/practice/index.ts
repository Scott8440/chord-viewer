// The practice panel and the presenters that fill it, one file per kind of exercise.
export { createPracticeView, type PracticeDisplay, type PracticeView } from "./view";
export {
  chordEarAnswers,
  chordEarDisplay,
  chordPracticeDisplay,
  earDisplay,
  earMelodyDisplay,
  intervalEarAnswers,
  intervalEarDisplay,
  progressionDisplay,
  progressionEarAnswers,
  progressionEarDisplay,
  progressionEarSlots,
  readingLoadingDisplay,
  sightReadingDisplay,
} from "./drills";
export { progressingDisplay, sequenceDisplay, tempoText, timingText } from "./sequence";
export { routineDisplay } from "./routine";
export {
  circleQuizAnswers,
  circleQuizDisplay,
  circleQuizModel,
  keyName,
  placeName,
  keySigAnswers,
  keySigDisplay,
} from "./theory";
export { roundScore, roundSummaryDisplay } from "./round";
export { justUnlocked, ladderPlayingText, ladderSummaryText, type LadderStatus } from "./ladder";
export { inversionFigures, inversionName } from "./chords";
