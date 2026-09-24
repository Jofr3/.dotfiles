# Secrets live in secrets/<NAME>.age, each encrypted to the age key below.
# The key itself is committed passphrase-encrypted as secrets/age-key.age and
# restored by `nix run .#rebuild`. Activation decrypts every secret into
# ~/.local/state/secrets/<NAME> (mode 600); edit one with `secret-edit NAME`.
{
  flake.modules.homeManager.base =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      age = "${pkgs.age}/bin/age";
      recipient = "age12wc82encjxm5sc5l3nez93ewtr5kujz7p79gc2wj5yquk4460ems7ds7up";
      keyFile = "${config.xdg.configHome}/age/key.txt";
      secretsDir = "${config.xdg.stateHome}/secrets";
      repoSecrets = "${config.home.homeDirectory}/.dotfiles/config/nix/secrets";

      names = map (lib.removeSuffix ".age") (
        builtins.filter (f: lib.hasSuffix ".age" f && f != "age-key.age") (
          builtins.attrNames (builtins.readDir ../../secrets)
        )
      );

      environmentSecrets = [
        "DATABASES"
        "OP_SERVICE_ACCOUNT_TOKEN"
        "FIRECRAWL_API_KEY"
        "CLOUDFLARE_API_TOKEN"
      ];
    in
    {
      home.activation.secrets = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
        if [ -r "${keyFile}" ]; then
          run rm -rf "${secretsDir}"
          run install -d -m 700 "${secretsDir}"
          ${lib.concatMapStrings (name: ''
            (umask 077 && run ${age} -d -i "${keyFile}" -o "${secretsDir}/${name}" ${../../secrets + "/${name}.age"})
          '') names}
        else
          warnEcho "secrets: ${keyFile} missing, run 'nix run .#rebuild' to restore it"
        fi
      '';

      # Load only environment secrets; passwords for other tools stay in files.
      programs.fish.shellInit = lib.concatMapStringsSep "\n" (name: ''
        if test -r "${secretsDir}/${name}"
          set -gx ${name} (cat "${secretsDir}/${name}")
        end
      '') environmentSecrets;

      programs.fish.functions.secret-edit = ''
        if test (count $argv) -ne 1
          echo "usage: secret-edit NAME" >&2
          return 1
        end
        set -l file "${repoSecrets}/$argv[1].age"
        set -l tmp (mktemp -p "$XDG_RUNTIME_DIR")
        if test -e "$file"
          ${age} -d -i "${keyFile}" -o "$tmp" "$file"; or begin; rm -f "$tmp"; return 1; end
        end
        $EDITOR "$tmp"
        and ${age} -r ${recipient} -o "$file" "$tmp"
        rm -f "$tmp"
      '';
    };
}
