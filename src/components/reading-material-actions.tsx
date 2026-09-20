"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export function ReadingMaterialActions({
  contributionId,
  status,
}: {
  contributionId: string;
  status: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(publish: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await api(`reading-materials/${contributionId}`, "POST", { publish });
      setCurrent(publish ? "PUBLISHED" : "ARCHIVED");
      setMessage(
        publish
          ? "Published to the Student Reading Room."
          : "Archived from the Student Reading Room.",
      );
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className="button"
          disabled={busy || current === "PUBLISHED"}
          onClick={() => void act(true)}
        >
          {current === "PUBLISHED" ? "Published ✓" : "Publish"}
        </button>
        <button
          className="button secondary"
          disabled={busy || current === "ARCHIVED"}
          onClick={() => void act(false)}
        >
          {current === "ARCHIVED" ? "Archived ✓" : "Archive"}
        </button>
      </div>
      <small role="status">{message}</small>
    </div>
  );
}
