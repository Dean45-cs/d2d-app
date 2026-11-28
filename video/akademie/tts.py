"""
Sprachausgabe fuer die Akademie-Videos (Piper, offline).

Liest von stdin JSON: {"model": "<Pfad zur .onnx>", "length_scale": 1.08,
"items": [{"key": "...", "text": "..."}]} und schreibt jede fehlende Aufnahme
nach .cache/tts/<key>.wav. Vorhandene Dateien bleiben - der Schluessel ist
ein Fingerabdruck aus Stimme und Text. Gibt {"<key>": Sekunden} auf stdout aus.
"""

import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache" / "tts"


def duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def main() -> None:
    job = json.load(sys.stdin)
    CACHE.mkdir(parents=True, exist_ok=True)
    voice = None
    config = SynthesisConfig(length_scale=float(job.get("length_scale", 1.0)))
    result = {}
    todo = [item for item in job["items"] if not (CACHE / f"{item['key']}.wav").exists()]
    for done, item in enumerate(todo, start=1):
        if voice is None:
            voice = PiperVoice.load(job["model"])
        target = CACHE / f"{item['key']}.wav"
        partial = target.with_suffix(".part")
        with wave.open(str(partial), "wb") as wav:
            voice.synthesize_wav(item["text"], wav, syn_config=config)
        partial.replace(target)
        print(f"\rSprache: {done}/{len(todo)}", end="", file=sys.stderr, flush=True)
    if todo:
        print(file=sys.stderr)
    for item in job["items"]:
        result[item["key"]] = duration(CACHE / f"{item['key']}.wav")
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
