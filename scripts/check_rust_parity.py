#!/usr/bin/env python3
"""Check root TypeScript resource methods are mapped to public Rust methods.

This is a source-surface guard, not a behavioral equivalence test. Run from
any directory; paths are resolved relative to this script's repository root.
"""
import json
from collections import Counter
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "rust" / "api-parity.json"
TS_DIR = ROOT / "typescript" / "src" / "resources"

def ts_inventory():
    result = set()
    for path in sorted(TS_DIR.glob("*.ts")):
        relative = path.relative_to(ROOT).as_posix()
        cls = None
        for line in path.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^(?:export\s+)?class\s+(\w+)", line)
            if match:
                cls = match.group(1)
            match = re.match(r"^  async\s+(\w+)\s*\(", line)
            if match:
                if cls is None:
                    raise ValueError(f"{relative}: async method outside a class")
                result.add((relative, cls, match.group(1)))
    return result

def rust_inventory(path):
    result = set()
    current = None
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^impl\s+(\w+)\s*\{", line)
        if match:
            current = match.group(1)
        match = re.match(r"^\s+pub\s+async\s+fn\s+(\w+)\s*\(", line)
        if match and current:
            result.add((current, match.group(1)))
    return result

def main():
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = data["methods"]
    ts_keys = [(r["typescript"]["file"], r["typescript"]["class"], r["typescript"]["method"]) for r in rows]
    rust_keys = [(r["rust"]["file"], r["rust"]["type"], r["rust"]["method"]) for r in rows]
    problems = []
    for label, keys in (("TypeScript", ts_keys), ("Rust", rust_keys)):
        for key, count in Counter(keys).items():
            if count != 1:
                problems.append(f"duplicate {label} mapping: {'::'.join(key)}")
    actual = ts_inventory()
    for item in sorted(actual - set(ts_keys)):
        problems.append(f"unmapped TypeScript method: {'::'.join(item)}")
    for item in sorted(set(ts_keys) - actual):
        problems.append(f"missing TypeScript method: {'::'.join(item)}")
    cache = {}
    for file, typ, method in rust_keys:
        if file not in cache:
            path = ROOT / file
            if not path.is_file():
                problems.append(f"missing Rust file: {file}")
                cache[file] = set()
            else:
                cache[file] = rust_inventory(path)
        if (typ, method) not in cache[file]:
            problems.append(f"missing Rust public async method: {file}::{typ}::{method}")
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print(f"Verified {len(rows)} TypeScript resource methods map to Rust public async methods.")
    print("This validates API presence only, not behavioral parity.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
