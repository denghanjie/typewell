# Lesson sources

The expanded library has 176 exercises: Foundations 7, TOEFL 45, IELTS 57, AP CSA 67. It preserves 26 original starters and adds 150 attributed lessons.

## TOEFL: 39 additions

Thirteen reading topics, each with vocabulary, a sentence, and a short passage: mirror self-recognition, sports and society, music and emotion, urbanization, cave art, bioluminescence, ocean acidification, fungi, the jet stream, Egyptian medicine, Viking navigation, urban birds, and aqueducts.

Source: the workspace's TOEFL collection, reading modules labeled `官方样题01`, `官方样题02`, and `官方模考题01` through `官方模考题11`. These are existing third-party bank transcriptions. The bank's “official” label is not independently verified against ETS. Incomplete cloze text was excluded. The exact relative source file is recorded with each exercise.

## IELTS: 51 additions

Seventeen reading topics drawn from the local Cambridge IELTS 4–20 collection. Each has vocabulary, a sentence, and a short passage. The first available test in each volume is used (Test 5 in volume 12, Test 1 otherwise); Reading 2 is selected for volumes 5 and 11, Reading 1 otherwise.

Topics include rainforests, behavioural psychology, sport, bats, timekeeping, chemistry, stepwells, the Falkirk Wheel, cork, tourism, play, nutmeg, polar bears, the Underground, urban farming, tennis rackets, and the kakapo.

These are local bank copies, not newly verified publisher transcriptions. Typography, accents and symbols are normalized for a physical US QWERTY keyboard. Currency notation in the Falkirk Wheel passage is expanded. Passage excerpts retain historical claims as written in the source; they are not assertions of current population figures or rankings. Reading exercises are copying practice, not model IELTS writing answers.

## AP CSA: 60 additions

Publisher PDFs retrieved directly from College Board on 2026-09-26:

- [2023 released FRQs](https://apcentral.collegeboard.org/media/pdf/ap23-frq-comp-sci-a.pdf): AppointmentBook, Sign, WeatherData, BoxOfCandy.
- [2024 released FRQs](https://apcentral.collegeboard.org/media/pdf/ap24-frq-comp-sci-a.pdf): Feeder, Scoreboard, WordChecker, GridPath.
- [2025 released FRQs](https://apcentral.collegeboard.org/media/pdf/ap25-frq-computer-science-a.pdf): DogWalker, SignedText, Round, SumOrSameGame.

Each question contributes five drills: selected words/identifiers, a brief question sentence, a code declaration or call, an original explanatory passage, and an original code practice fragment. Direct excerpts are short; full exam PDFs are linked rather than redistributed. Explanations and code practice are independently authored, clearly marked, and are not official scoring-guide answers. Code fragments may require the cited class's fields and helper methods. Signature drills are deliberately partial declarations, not executable programs.

Older local AP entries with inconsistent year labels were not used to establish released-question provenance.

## Content model

`source-exercises.json` retains title, track, kind, text, source, provenance, normalization/adaptation note, and either a source URL or a relative local source path. `starter-lessons.json` retains the initial original exercises. `scripts/build-lessons.py` produces the browser's `lessons.js`; no source bank access is required to rebuild the curated library.

The app uses textContent to display lesson text and metadata. Imported text is not executed as HTML. No answer keys, credentials, student data, or full source PDFs are part of this library.

## Extended practice (September 2026)

`long-exercises.json` adds nine **original** extended exercises: three TOEFL-style academic readings (321–329 words), three IELTS-style academic readings (568–599 words), and three AP CSA-style free-response specifications (348–369 words). These are not verbatim released questions, model answers, or official exam-length requirements. They supplement the attributed excerpts in `source-exercises.json`; the distinction is shown in each lesson's source notes. Academic passage themes include urban ecology, lake sediment, learning, public libraries, and product repair. AP specifications cover class state, ArrayList operations, and two-dimensional arrays, with explicit examples and boundary conditions.
