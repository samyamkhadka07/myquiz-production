# Student Engagement Audit

## Factual baseline

The prior Dashboard showed totals, one trend chart, subject performance and target text. Study Plan ranked weak topics but did not provide a short persisted daily checklist. Learning Games was an AI text-generation form rather than an interactive game. Review exposed correct answers and explanations but lacked a distinct mistake loop and alternative-explanation action. Flashcards used FSRS correctly but had no queue-state summary or session completion feedback.

## Rebuild

| Feature | Learning purpose | Interaction / personalization | Database | Result persisted | Tested | Live verified | Status |
|---|---|---|---|---|---|---|---|
| Student Overview | Decide what to do next | Dynamic active-attempt, due-card, weak-topic or diagnostic CTA | dashboard RPC, attempts, flashcards | Existing metrics | Build | Pending deployment | Implemented |
| Today’s Plan | Achievable daily sequence | Four generated tasks, completion toggle | study_plan_items | Yes | DB + UI contract | Pending | Implemented |
| Next Best Action | Reduce choice overload | Uses unfinished attempt, due cards and real weak-topic accuracy | attempts/dashboard | Derived live | Automated build | Pending | Implemented |
| Mastery Map | See strengths/weaknesses | Clickable subject progress | attempt snapshots/taxonomy | Derived live | Build | Pending | Implemented |
| Progress Trends | Answer “am I improving?” | Improving/stable/attention explanation | attempts/dashboard | Derived live | Existing analytics tests | Pending | Implemented |
| Mistake Center | Correct misconceptions | Grouped missed items, review and rescue entry points | attempt_questions | Existing mistakes | Build | Pending | Implemented |
| Answer Review | Teach after submission | Option explanations, concept/timing, alternate explanation, practice CTA | attempt snapshots/keys + AI fallback | Bookmark/flashcard actions persist | Existing security tests | Pending | Implemented |
| Rapid Fire | Timed retrieval | 20-second visual timer, immediate feedback | learning_game_sessions/items | Yes | DB + contract tests | Pending | Implemented |
| Rapid Recall | Metacognition | Recall before reveal, Knew/Almost/Didn’t Know rating | learning_game_items | Yes | DB + contract tests | Pending | Implemented |
| Mistake Rescue | Repair errors | Selects only previously incorrect verified questions | attempt_questions + games | Yes | DB + contract tests | Pending | Implemented |
| Accuracy Mode | Low-pressure correctness | Untimed verified practice | games + questions | Yes | DB + contract tests | Pending | Implemented |
| Daily Challenge | Balanced return activity | Short persisted verified-question session | games + questions | Yes | DB + contract tests | Pending | Implemented |
| Flashcards | Spaced repetition | Due/New/Learning/Review summary, reveal/rate transition, completion summary | flashcards/reviews | Yes, FSRS | Existing + build | Pending | Improved |

Game sessions are intentionally separate from `attempts`; their XP/activity contribution cannot alter authoritative MEC scores. Empty states guide new learners to a diagnostic rather than presenting meaningless zeros. Controls are keyboard/touch accessible and layouts collapse responsively.

