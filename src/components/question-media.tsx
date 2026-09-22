"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/client-api";

type Media = {
  id: string;
  position: number;
  alt_text: string;
  caption: string | null;
  mime_type: string;
  filename: string;
  url: string;
};

export function QuestionMedia({ questionId }: { questionId: string }) {
  return <QuestionMediaContent key={questionId} questionId={questionId} />;
}

function QuestionMediaContent({ questionId }: { questionId: string }) {
  const [items, setItems] = useState<Media[]>([]);
  const [state, setState] = useState<"loading" | "loaded" | "empty" | "failed">("loading");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    api<Media[]>(`question-media/${questionId}`)
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setState(rows.length ? "loaded" : "empty");
      })
      .catch(() => {
        if (active) setState("failed");
      });
    return () => {
      active = false;
    };
  }, [questionId, reload]);
  if (state === "loading")
    return <div className="question-media-skeleton" aria-label="Loading question figure" />;
  if (state === "empty") return null;
  if (state === "failed")
    return (
      <div className="question-media-error" role="alert">
        <p>Question figure could not be loaded.</p>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setState("loading");
            setReload((n) => n + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  return (
    <div className="question-media" aria-label="Question figures">
      {items.map((item) => (
        <figure key={item.id}>
          <Image
            src={item.url}
            alt={item.alt_text}
            width={1200}
            height={800}
            unoptimized
            onError={() => setState("failed")}
          />
          {item.caption && <figcaption>{item.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
