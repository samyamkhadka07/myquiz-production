# Ashar / Baisakh / Jestha mock-test import audit

## Source

- Word source: `Ashar_Baisakh_Jestha_NAME_mock_tests_questions_and_solutions (1)-compressed.docx`
- Matching PDF source: `Ashar_Baisakh_Jestha_NAME_mock_tests_questions_and_solutions (1)-compressed.pdf`
- Both source files are retained in Git. The Word file contains 151 image-only pages; it has no usable embedded text layer.
- The pages contain multiple mock-test question sets and printed hints/solutions. The printed solution is the primary answer authority; an OCR guess is not.

## Production evidence (2026-09-13)

| Check | Result |
|---|---:|
| Production canonical questions | 1 |
| Production published questions | 1 |
| Ashar canonical questions | 0 |
| Ashar staged questions | 0 |
| Ashar processing cursor | `INSPECT`, offset 0 |
| Ashar job status | `READY` |
| Recent production AI/OCR usage | none |
| Other pending staged rows | 755 |

The 755 existing staged rows are not linked to the Ashar contribution and include visibly corrupted OCR. They must not be represented as verified Ashar questions or bulk-published.

## Safe ingestion rule

1. Extract every image with page provenance.
2. Correct page orientation and transcribe without inventing missing text.
3. Pair each question with the printed solution from the same model/set and question number.
4. Complete `correct_answer`, `explanation`, and non-empty A–D `option_explanations`.
5. Map the question to authoritative MEC subject/unit/topic taxonomy.
6. Mark unreadable, diagram-dependent, conflicting, or incomplete rows `NEEDS_REVISION`.
7. Run duplicate checks.
8. Verify and publish only academically reviewed rows.

`scripts/extract_ashar_ocr.py` provides repeatable page extraction and orientation selection. It intentionally does not infer answer keys.
