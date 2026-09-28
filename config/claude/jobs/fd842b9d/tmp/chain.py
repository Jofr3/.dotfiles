# -*- coding: utf-8 -*-
import io

TERM = ("- 1 /* \U0001F195\U0001F195\U0001F195 D486 — a `- 1` term at the FRONT: THE GATED INCREMENT ON THE "
        "OPPONENT'S HAND DISCARD, corpus FILE LINE 668, ONE printing on ONE sentence, claimed WHOLE by "
        "`deriveAttackEffect` through one new compound anchor over a program of ops that ALL SHIPPED. "
        "⚠️ EDITED AT THE FRONT, NEVER AT THE END — D426/D437's rule, and D485's re-statement of it: "
        "a chain's frozen ENDPOINT is the claim, so a term appended at the tail would move the endpoint and "
        "assert nothing. */ ")

def front_insert(path, lineno, head):
    lines = io.open(path, encoding="utf-8").read().split("\n")
    i = lineno - 1
    line = lines[i]
    idx = line.find(head)
    if idx == -1:
        raise SystemExit("MISS %s:%d %r" % (path, lineno, head))
    if line.count(head) != 1:
        raise SystemExit("AMBIG %s:%d" % (path, lineno))
    at = idx + len(head)
    lines[i] = line[:at] + TERM + line[at:]
    io.open(path, "w", encoding="utf-8").write("\n".join(lines))
    print("front-inserted %s:%d after %r" % (path, lineno, head))
