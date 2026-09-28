import sys, re
NEW = "\U0001F195\U0001F195"  # 🆕🆕
def front(path, line_no, head, term, note):
    with open(path, "rb") as fh: text = fh.read().decode("utf-8")
    lines = text.split("\n")
    i = line_no - 1
    line = lines[i]
    # find the head occurrence; take the FIRST unless an index is given after '#'
    occ = 0
    if "#" in head:
        head, occ = head.split("#")[0], int(head.split("#")[1])
    at = -1
    for _ in range(occ + 1):
        at = line.find(head, at + 1)
        if at < 0: raise SystemExit(f"FAIL {path}:{line_no} head {head!r} occurrence {occ} not found")
    ins = at + len(head)
    if not re.match(r"\d", line[ins:ins+1]):
        raise SystemExit(f"FAIL {path}:{line_no} no digit after head at {ins}: {line[ins:ins+40]!r}")
    frag = f"{term} /* {NEW} D478 - {note} */ - "
    new_line = line[:ins] + frag + line[ins:]
    lines[i] = new_line
    payload = "\n".join(lines).encode("utf-8")
    with open(path, "wb") as fh: fh.write(payload)
    print(f"OK {path}:{line_no} col={at} inserted '{term}' after {head!r}")
    print(f"   junction: ...{new_line[max(0,at-20):ins+len(frag)+14]!r}")
if __name__ == "__main__":
    front(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5])
