import sys, io, os

def patch(path, find, replace, expect=1):
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    parts = text.split(find)
    assert len(parts) == expect + 1, f"{path}: find occurs {len(parts)-1}x, expected {expect}\n---\n{find[:300]}"
    assert find != replace, "find === replace"
    new = replace.join(parts)
    payload = new.encode("utf-8")          # ENCODE FIRST (D463)
    before = len(text)
    with open(path, "wb") as fh:           # write second
        fh.write(payload)
    after = len(new)
    print(f"OK {path}: {before} -> {after} chars ({after-before:+d})")
