# `nix run .#rebuild [-- <host> [nixos-rebuild args...]]` from this directory.
# On a fresh clone it restores the sops age key from secrets/age-key.age,
# trying the sudo password first and asking for a separate one if that fails,
# so a new machine needs nothing but the repo and a password.
{
  perSystem =
    { pkgs, ... }:
    {
      apps.rebuild.program = pkgs.writeShellApplication {
        name = "rebuild";
        runtimeInputs = [ pkgs.age ];
        text = ''
          host=''${1:-$(uname -n)}
          shift || true
          key="$HOME/.config/sops/age/keys.txt"

          decrypt() {
            AGE_PASSPHRASE="$1" age -d -j batchpass ${../secrets/age-key.age} 2>/dev/null
          }

          if [ ! -s "$key" ]; then
            read -rsp "Password: " pw </dev/tty
            echo
            printf '%s\n' "$pw" | sudo -S -p "" -v 2>/dev/null || true
            if ! identity=$(decrypt "$pw"); then
              read -rsp "Secrets password: " pw </dev/tty
              echo
              identity=$(decrypt "$pw") || { echo "wrong secrets password" >&2; exit 1; }
            fi
            unset pw
            mkdir -p "$(dirname "$key")"
            (umask 077 && printf '%s\n' "$identity" >"$key")
            unset identity
            echo "restored $key"
          fi

          exec sudo nixos-rebuild switch --flake ".#$host" "$@"
        '';
      };
    };
}
