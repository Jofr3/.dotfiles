{ inputs, ... }:
let
  image = builtins.path {
    path = inputs.self + "/other/dot.png";
    name = "dot.png";
  };
in
{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    let
      dot = pkgs.writeShellApplication {
        name = "dot";
        runtimeInputs = with pkgs; [
          bash
          coreutils
          fzf
          swayimg
          util-linux
        ];
        text = ''
          readonly IMAGE="${image}"

          [ -f "$IMAGE" ] || { echo "Error: $IMAGE not found" >&2; exit 1; }

          minutes=$(seq 1 60 | fzf --reverse --padding=1,1,0,2) || exit 0
          [ -n "$minutes" ] || exit 0

          # The single-quoted expressions are evaluated by the nested Bash process.
          # shellcheck disable=SC2016
          setsid -f bash -c '
              swayimg --fullscreen --appid="dot-timer" "$1" &
              viewer=$!
              sleep $(( $2 * 60 ))
              kill "$viewer" 2>/dev/null || true
          ' _ "$IMAGE" "$minutes" >/dev/null 2>&1
        '';
      };
    in
    {
      home.packages = [ dot ];
    };
}
