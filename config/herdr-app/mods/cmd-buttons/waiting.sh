#!/bin/sh
# Prints each given pid whose process tree has a process blocked reading (or
# polling) its terminal: a prompt waiting for the user. Linux only: /proc wchan.
for root in "$@"; do
  todo=$root; all=$root
  while [ -n "$todo" ]; do
    next=""
    for p in $todo; do next="$next $(cat /proc/$p/task/*/children 2>/dev/null)"; done
    todo=$(echo $next); all="$all $todo"
  done
  for p in $all; do
    case "$(cat /proc/$p/wchan 2>/dev/null)" in
      wait_woken|n_tty_read|poll_schedule_timeout*|do_select|do_sys_poll)
        case "$(readlink /proc/$p/fd/0 2>/dev/null)" in /dev/pts/*) echo "$root"; break ;; esac ;;
    esac
  done
done
