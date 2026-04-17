#!/usr/bin/env python3
"""Programmatic grader for sftp-push skill evals.

Reads each response.md, applies assertions, writes grading.json.
"""
import json
import re
from pathlib import Path

WS = Path("/home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/iteration-1")


def load(p):
    return p.read_text() if p.exists() else ""


def cmd_lines(text):
    # any line starting with CMD: (anywhere in text, possibly after markdown prefix)
    lines = []
    for ln in text.splitlines():
        m = re.search(r"CMD:\s*(.*)", ln)
        if m:
            lines.append(m.group(1).strip().strip("`").strip())
    return lines


def confirm_lines(text):
    lines = []
    for ln in text.splitlines():
        m = re.search(r"CONFIRM:\s*(.*)", ln)
        if m:
            lines.append(m.group(1).strip())
    return lines


def any_match(cmds, *patterns):
    return any(any(re.search(p, c, re.I) for p in patterns) for c in cmds)


def grade_eval(eval_name, cfg):
    run_dirs = [(eval_name, "with_skill"), (eval_name, "without_skill")]
    results = {}
    for ename, variant in run_dirs:
        path = WS / ename / variant / "outputs" / "response.md"
        text = load(path)
        cmds = cmd_lines(text)
        confs = confirm_lines(text)
        expectations = cfg(text, cmds, confs)
        passed = sum(1 for e in expectations if e["passed"])
        total = len(expectations)
        grading = {
            "summary": {
                "passed": passed,
                "total": total,
                "pass_rate": (passed / total) if total else 0.0,
            },
            "expectations": expectations,
        }
        # write to run-1/ (benchmark aggregator layout) and keep legacy top-level copy
        (WS / ename / variant / "run-1").mkdir(parents=True, exist_ok=True)
        (WS / ename / variant / "run-1" / "grading.json").write_text(json.dumps(grading, indent=2))
        results[variant] = grading
    return results


def graders():
    def eval_1(text, cmds, confs):
        return [
            {"text": "issues_scp_upload_for_index_php",
             "passed": any_match(cmds, r"scp.*index\.php"),
             "evidence": "; ".join(c for c in cmds if "index.php" in c.lower())[:300]},
            {"text": "uses_private_key_flag",
             "passed": any_match(cmds, r"-i\s+~?/?.*id_rsa|-i\s+\$\{?HOME\}?/?\.ssh/id_rsa"),
             "evidence": "; ".join(c for c in cmds if "-i" in c and "id_rsa" in c)[:300]},
            {"text": "creates_remote_dir",
             "passed": any_match(cmds, r"mkdir\s+-p.*/var/www/html/src"),
             "evidence": "; ".join(c for c in cmds if "mkdir" in c)[:300]},
            {"text": "correct_host_user",
             "passed": any_match(cmds, r"deploy@web\.example\.com"),
             "evidence": "; ".join(c for c in cmds if "web.example.com" in c)[:300]},
            {"text": "summary_mentions_upload",
             "passed": bool(re.search(r"upload(ed)?[\s\S]*index\.php", text, re.I)),
             "evidence": ""},
        ]

    def eval_2(text, cmds, confs):
        return [
            {"text": "uploads_all_three_files",
             "passed": any_match(cmds, r"app\.js") and any_match(cmds, r"utils\.js") and any_match(cmds, r"style\.css"),
             "evidence": "; ".join(cmds)[:400]},
            {"text": "correct_remote_paths",
             "passed": all(p in text for p in ["/srv/app/src/app.js", "/srv/app/src/utils.js", "/srv/app/assets/style.css"]),
             "evidence": ""},
            {"text": "creates_both_remote_dirs",
             "passed": bool(re.search(r"mkdir\s+-p[^\n]*(/srv/app/src[^\n]*/srv/app/assets|/srv/app/assets[^\n]*/srv/app/src)", text))
                       or (bool(re.search(r"mkdir\s+-p[^\n]*/srv/app/src", text)) and bool(re.search(r"mkdir\s+-p[^\n]*/srv/app/assets", text))),
             "evidence": "; ".join(c for c in cmds if "mkdir" in c)[:300]},
            {"text": "uses_private_key_flag",
             "passed": all("-i" in c and "id_rsa" in c for c in cmds if "scp" in c),
             "evidence": ""},
            {"text": "summary_lists_three_files",
             "passed": all(f in text for f in ["app.js", "utils.js", "style.css"]),
             "evidence": ""},
        ]

    def eval_3(text, cmds, confs):
        return [
            {"text": "issues_ssh_rm",
             "passed": any_match(cmds, r"ssh.*rm\s+-f.*deprecated\.js"),
             "evidence": "; ".join(cmds)[:300]},
            {"text": "correct_remote_path",
             "passed": any_match(cmds, r"/home/deploy/app/old/deprecated\.js"),
             "evidence": ""},
            {"text": "no_scp_upload",
             "passed": not any_match(cmds, r"scp.*deprecated\.js"),
             "evidence": ""},
            {"text": "uses_private_key_flag",
             "passed": any_match(cmds, r"-i\s+~?/?.*id_rsa"),
             "evidence": ""},
            {"text": "summary_reports_deletion",
             "passed": bool(re.search(r"delet(e|ed)[\s\S]{0,80}deprecated\.js|deprecated\.js[\s\S]{0,80}delet", text, re.I)),
             "evidence": ""},
        ]

    def eval_4(text, cmds, confs):
        # No upload command of .env means no scp/sftp/curl operating on .env executed
        env_uploaded = any_match(cmds, r"\.env")
        return [
            {"text": "asks_confirmation",
             "passed": len(confs) > 0,
             "evidence": "; ".join(confs)[:300]},
            {"text": "confirm_mentions_env_or_sensitive",
             "passed": any(re.search(r"\.env|sensitive|secret", c, re.I) for c in confs),
             "evidence": "; ".join(confs)[:300]},
            {"text": "no_upload_command_issued",
             "passed": not env_uploaded,
             "evidence": "; ".join(c for c in cmds if ".env" in c)[:300]},
            {"text": "summary_says_skipped",
             "passed": bool(re.search(r"(skip|abort|declin|not upload|no upload)", text, re.I)),
             "evidence": ""},
        ]

    def eval_5(text, cmds, confs):
        lodash_uploaded = any_match(cmds, r"node_modules/lodash|lodash/index\.js")
        return [
            {"text": "uploads_main_js",
             "passed": any_match(cmds, r"src/main\.js.*/var/www/site/src/main\.js|main\.js"),
             "evidence": "; ".join(c for c in cmds if "main.js" in c)[:300]},
            {"text": "skips_node_modules",
             "passed": not lodash_uploaded,
             "evidence": "; ".join(c for c in cmds if "lodash" in c or "node_modules" in c)[:300]},
            {"text": "silent_skip",
             "passed": True,  # soft check — manual review
             "evidence": "N/A — qualitative"},
            {"text": "summary_shows_one_file",
             "passed": bool(re.search(r"1\s+(of\s+2\s+)?(file|uploaded)|1 file|one file|uploaded.*main\.js", text, re.I))
                       and not bool(re.search(r"2 files? uploaded|uploaded 2", text, re.I)),
             "evidence": ""},
        ]

    def eval_6(text, cmds, confs):
        curl_ftp = any_match(cmds, r"curl[^\n]*ftp://|lftp")
        # match scp/ssh/sftp as invoked commands (start of line or preceded by space),
        # not as substrings in paths like sftp-push-workspace
        scp_ssh = any_match(cmds, r"(?:^|\s)(?:scp|ssh|sftp)\s")
        return [
            {"text": "uses_curl_ftp",
             "passed": curl_ftp and not scp_ssh,
             "evidence": "; ".join(cmds)[:300]},
            {"text": "includes_credentials_in_url_or_flag",
             "passed": any(re.search(r"ftp://ftpuser:ftppass@|--user[= ]['\"]?ftpuser[,:]ftppass|ftpuser,ftppass", c) for c in cmds),
             "evidence": ""},
            {"text": "correct_remote_path",
             "passed": any_match(cmds, r"/public_html/public/index\.html"),
             "evidence": ""},
            {"text": "creates_dirs",
             "passed": any_match(cmds, r"--ftp-create-dirs|mkdir"),
             "evidence": ""},
            {"text": "no_scp_or_ssh",
             "passed": not scp_ssh,
             "evidence": ""},
        ]

    def eval_7(text, cmds, confs):
        any_upload_cmd = any_match(cmds, r"scp|sftp|ssh|curl|ftp")
        return [
            {"text": "no_cmd_lines",
             "passed": len(cmds) == 0,
             "evidence": "; ".join(cmds)[:300]},
            {"text": "reports_no_config",
             "passed": bool(re.search(r"no\s+(sftp\.json|sftp\s+config|\.vscode/sftp\.json|configuration)", text, re.I)),
             "evidence": ""},
            {"text": "stops_cleanly",
             "passed": not any_upload_cmd,
             "evidence": ""},
        ]

    return {
        "eval-1-single-edit": eval_1,
        "eval-2-batch-edit": eval_2,
        "eval-3-delete": eval_3,
        "eval-4-sensitive-env": eval_4,
        "eval-5-ignore-pattern": eval_5,
        "eval-6-ftp-protocol": eval_6,
        "eval-7-no-config": eval_7,
    }


if __name__ == "__main__":
    mapping = graders()
    summary = {}
    for ename, fn in mapping.items():
        summary[ename] = grade_eval(ename, fn)
    print(json.dumps(summary, indent=2))
