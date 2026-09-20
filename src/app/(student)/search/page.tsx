import Link from "next/link";
import { requirePage } from "@/lib/server/auth";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db, profile } = await requirePage();
  const term = (await searchParams).q?.trim().slice(0, 120) ?? "";
  const escaped = term.replaceAll(/[%_]/g, "");
  const empty = { data: [], error: null };
  const [questions, topics, subjects, reading, cards] =
    term.length >= 2
      ? await Promise.all([
          db
            .from("questions")
            .select("id,question_text,source_type,source_year,difficulty")
            .ilike("question_text", `%${escaped}%`)
            .eq("publication_status", "PUBLISHED")
            .limit(20),
          db.from("topics").select("id,name,unit_id").ilike("name", `%${escaped}%`).limit(20),
          db.from("subjects").select("id,name,code").ilike("name", `%${escaped}%`).limit(20),
          db
            .from("reading_chunks")
            .select("id,title,page_number,content")
            .eq("publication_status", "PUBLISHED")
            .textSearch("search_vector", term, { type: "websearch" })
            .limit(20),
          db
            .from("flashcards")
            .select("id,question_id,questions(question_text)")
            .eq("user_id", profile.id)
            .limit(100),
        ])
      : [empty, empty, empty, empty, empty];
  const failures = [
    ["questions", questions.error],
    ["topics", topics.error],
    ["subjects", subjects.error],
    ["reading materials", reading.error],
    ["flashcards", cards.error],
  ].filter((entry) => entry[1]);
  const questionRows = questions.error ? [] : (questions.data ?? []),
    topicRows = topics.error ? [] : (topics.data ?? []),
    subjectRows = subjects.error ? [] : (subjects.data ?? []),
    readingRows = reading.error ? [] : (reading.data ?? []),
    cardRows = ((cards.error ? [] : cards.data) ?? ([] as unknown)) as unknown as Array<{
      id: string;
      question_id: string;
      questions: { question_text: string } | Array<{ question_text: string }> | null;
    }>;
  const matchingCards = cardRows
    .filter((card) => {
      const question = Array.isArray(card.questions) ? card.questions[0] : card.questions;
      return question?.question_text.toLowerCase().includes(term.toLowerCase());
    })
    .slice(0, 20);
  const total =
    questionRows.length +
    topicRows.length +
    subjectRows.length +
    readingRows.length +
    matchingCards.length;
  return (
    <>
      <p className="eyebrow">Published and personal learning content</p>
      <h1>Search MyQuiz</h1>
      <form className="card search-hero">
        <label htmlFor="global-search">Question, topic, subject or reading material</label>
        <div className="toolbar">
          <input
            id="global-search"
            name="q"
            type="search"
            defaultValue={term}
            minLength={2}
            maxLength={120}
            required
            autoFocus
          />
          <button className="button">Search</button>
        </div>
      </form>
      {term.length > 0 && term.length < 2 ? (
        <p className="card section">Enter at least two characters.</p>
      ) : null}
      {term.length >= 2 ? (
        <p className="muted">
          {total} authorized result{total === 1 ? "" : "s"} for “{term}”
        </p>
      ) : null}
      {failures.length > 0 ? (
        <section className="card error" role="alert">
          <strong>Some search categories could not be loaded.</strong>
          <p>Your account and saved progress are safe. Retry the search in a moment.</p>
        </section>
      ) : null}
      {questionRows.length ? (
        <section className="card section">
          <div className="top">
            <h2>Published questions</h2>
            <Link href="/tests" className="text-link">
              Start practice
            </Link>
          </div>
          {questionRows.map((question) => (
            <article className="search-result" key={question.id}>
              <strong>{question.question_text}</strong>
              <span>
                {question.difficulty ?? "Difficulty unassigned"} · {question.source_type}
                {question.source_year ? ` · ${question.source_year}` : ""}
              </span>
            </article>
          ))}
        </section>
      ) : null}
      {subjectRows.length || topicRows.length ? (
        <section className="card section">
          <h2>Syllabus</h2>
          {[...subjectRows, ...topicRows].map((item) => (
            <article className="search-result" key={item.id}>
              <strong>{item.name}</strong>
              <span>{"code" in item ? `Subject · ${item.code}` : "Topic"}</span>
            </article>
          ))}
        </section>
      ) : null}
      {readingRows.length ? (
        <section className="card section">
          <div className="top">
            <h2>Reading Room</h2>
            <Link href={`/reading?q=${encodeURIComponent(term)}`} className="text-link">
              Open filtered reading
            </Link>
          </div>
          {readingRows.map((item) => (
            <article className="search-result" key={item.id}>
              <strong>{item.title}</strong>
              <span>
                Page {item.page_number} · {item.content.slice(0, 180)}…
              </span>
            </article>
          ))}
        </section>
      ) : null}
      {matchingCards.length ? (
        <section className="card section">
          <div className="top">
            <h2>Your flashcards</h2>
            <Link href="/flashcards" className="text-link">
              Review cards
            </Link>
          </div>
          {matchingCards.map((card) => {
            const question = Array.isArray(card.questions) ? card.questions[0] : card.questions;
            return (
              <article className="search-result" key={card.id}>
                <strong>{question?.question_text}</strong>
                <span>Personal saved review card</span>
              </article>
            );
          })}
        </section>
      ) : null}
      {term.length >= 2 && !total ? (
        <section className="card empty-state">
          <h2>No authorized content matched</h2>
          <p>Try a broader topic name, subject, or phrase from the question.</p>
          <Link href="/tests" className="button">
            Explore practice
          </Link>
        </section>
      ) : null}
    </>
  );
}
