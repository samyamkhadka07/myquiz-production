#!/usr/bin/env python3
"""Extract image-only mock-test pages for human academic review.

This script never infers an answer. It preserves page provenance, tries the
three plausible rotations, and emits JSONL that can be paired with the printed
solution pages before canonical CSV import.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

from PIL import Image


def natural_number(path: Path) -> int:
    match = re.search(r"(\d+)", path.stem)
    if not match:
        raise ValueError(f"No page number in {path.name}")
    return int(match.group(1))


def transcribe(image: Image.Image, destination: Path) -> str:
    image.save(destination, quality=95)
    result = subprocess.run(
        ["tesseract", str(destination), "stdout", "-l", "eng", "--psm", "6"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=60,
        env={**os.environ, "OMP_THREAD_LIMIT": "1"},
    )
    return result.stdout


def classify(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).upper()
    if "HINTS AND SOLUTIONS" in normalized or "SOLUTIONS FOR MECEE" in normalized:
        return "SOLUTION"
    if "MODEL ENTRANCE EXAM" in normalized and "INSTRUCTION" in normalized:
        return "COVER"
    return "CONTENT"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="myquiz-ashar-") as temporary:
        root = Path(temporary)
        with zipfile.ZipFile(args.docx) as archive:
            members = [name for name in archive.namelist() if name.startswith("word/media/") and name.lower().endswith((".jpg", ".jpeg", ".png"))]
            for name in members:
                (root / Path(name).name).write_bytes(archive.read(name))
        records = []
        for page in sorted(root.iterdir(), key=natural_number):
            candidates = []
            with Image.open(page) as original, tempfile.TemporaryDirectory(prefix="myquiz-page-") as rotated:
                for angle in (0, 90, 270):
                    image = original.copy() if angle == 0 else original.rotate(-angle, expand=True)
                    text = transcribe(image, Path(rotated) / f"{angle}.jpg")
                    candidates.append((angle, text))
            angle, text = max(candidates, key=lambda item: len(item[1].strip()))
            records.append({"page": natural_number(page), "source_image": page.name, "rotation": angle, "kind": classify(text), "text": text})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(json.dumps({"pages": len(records), "output": str(args.output)}))


if __name__ == "__main__":
    main()
