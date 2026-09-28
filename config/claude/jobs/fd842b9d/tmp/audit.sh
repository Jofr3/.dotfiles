set -e
# For each slice commit, list census files where a FROZEN endpoint moved.
prev=""
for c in 1cf71b9 26ce5f5 1311d72 8a74e66 8c5cd71 3ac9506 ca75234; do
  [ -z "$prev" ] && { prev=$c; continue; }
  moved=""
  for f in $(git diff --name-only $prev $c -- 'packages/engine/src/*.test.ts'); do
    a=$(git show $prev:$f 2>/dev/null | grep -oE "toEqual\(\[[0-9]{3}, [0-9]{4}\]\)" | sort | tr '\n' ' ')
    b=$(git show $c:$f 2>/dev/null | grep -oE "toEqual\(\[[0-9]{3}, [0-9]{4}\]\)" | sort | tr '\n' ' ')
    [ -n "$a" ] && [ "$a" != "$b" ] && moved="$moved $(basename $f)"
  done
  echo "$(git log --format=%s -1 $c | cut -c1-38) :: ${moved:-  (no frozen endpoint moved)}"
  prev=$c
done
