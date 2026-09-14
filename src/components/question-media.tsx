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
  const [items, setItems] = useState<Media[]>([]);
  useEffect(() => {
    let active = true;
    api<Media[]>(`question-media/${questionId}`)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [questionId]);
  if (!items.length) return null;
  return (
    <div className="question-media" aria-label="Question figures">
      {items.map((item) => (
        <figure key={item.id}>
          <Image src={item.url} alt={item.alt_text} width={1200} height={800} unoptimized />
          {item.caption && <figcaption>{item.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
