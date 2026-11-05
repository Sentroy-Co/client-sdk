#!/usr/bin/env python3
"""Check Dart API presence against the root TypeScript resource inventory."""
import importlib.util
import json
from collections import Counter
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('rust_parity', ROOT / 'scripts/check_rust_parity.py')
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)

def dart_inventory(path):
    result = set()
    current = None
    # Class declarations and method signatures can be formatted across lines.
    for match in re.finditer(r'^class\s+(\w+)\b|\bFuture\s*<[^;=\n]*?>\s+(\w+)\s*\(', path.read_text(), re.MULTILINE):
        if match.group(1):
            current = match.group(1)
        elif current:
            result.add((current, match.group(2)))
    return result

def main():
    rows = json.loads((ROOT / 'flutter/api-parity.json').read_text())['methods']
    ts = [(r['typescript']['file'], r['typescript']['class'], r['typescript']['method']) for r in rows]
    dart = [(r['dart']['file'], r['dart']['class'], r['dart']['method']) for r in rows]
    problems = []
    for label, keys in [('TypeScript', ts), ('Dart', dart)]:
        problems.extend(f'duplicate {label} mapping: {key}' for key, count in Counter(keys).items() if count != 1)
    actual = reference.ts_inventory()
    problems.extend(f'unmapped TypeScript method: {key}' for key in sorted(actual - set(ts)))
    problems.extend(f'missing TypeScript method: {key}' for key in sorted(set(ts) - actual))
    cache = {}
    for file, cls, method in dart:
        if file not in cache:
            path = ROOT / file
            cache[file] = dart_inventory(path) if path.is_file() else set()
        if (cls, method) not in cache[file]:
            problems.append(f'missing Dart method: {file}::{cls}::{method}')
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        return 1
    print(f'Verified {len(rows)} TypeScript resource methods map to Dart methods (API presence only).')
    return 0

if __name__ == '__main__':
    sys.exit(main())
