# T3 Code settings, keybindings and client preferences, kept to the values that
# differ from upstream defaults. Activation merges these into ~/.t3/userdata, so
# changes made in the app survive until the next rebuild overrides the same key.
{
  flake.modules.homeManager.base =
    { pkgs, ... }:
    {
      programs.t3code = {
        enable = true;

        # T3 Code's terminal pane never answers fish's Primary Device Attribute
        # query, so every new fish there hangs 10s and warns. fish only reads
        # feature flags from the environment at startup, so turn the query off in
        # the app's own environment; the integrated terminal and agent shells
        # inherit it, while other terminals keep the query-based features.
        package = pkgs.symlinkJoin {
          inherit (pkgs.t3code) name meta;
          paths = [ pkgs.t3code ];
          nativeBuildInputs = [ pkgs.makeWrapper ];
          postBuild = ''
            for bin in t3code-desktop t3; do
              wrapProgram $out/bin/$bin --set fish_features no-query-term
            done
          '';
        };

        userSettings = {
          enableDeviceSupport = true;
          textGenerationModelSelection = {
            instanceId = "claudeAgent";
            model = "claude-sonnet-5";
            options = [
              {
                id = "effort";
                value = "high";
              }
              {
                id = "contextWindow";
                value = "200k";
              }
            ];
          };
          providers = {
            cursor.enabled = false;
            grok.enabled = false;
            opencode.enabled = false;
          };
        };

        # chat.new moves off mod+n; T3 Code only re-adds defaults for commands
        # that have no binding here.
        keybindings = [
          {
            key = "alt+o";
            command = "chat.new";
            when = "!terminalFocus";
          }
        ];

        clientSettings = {
          fontFamilyCode = "FiraCode Nerd Font Mono";
          showSkillsInSlashMenu = false;
          favorites = [
            {
              provider = "claudeAgent";
              model = "claude-opus-5-5";
            }
          ];
          providerModelPreferences = {
            codex.hiddenModels = [ "gpt-5.5" ];
            claudeAgent = {
              hiddenModels = [
                "claude-opus-4-8"
                "claude-opus-4-7"
                "claude-opus-4-6"
                "claude-opus-4-5"
                "claude-sonnet-4-6"
                "claude-haiku-4-5"
                "claude-fable-5"
                "claude-opus-5"
              ];
              modelOrder = [
                "claude-opus-5-5"
                "claude-fable-5-1"
                "claude-opus-5"
                "claude-fable-5"
                "claude-opus-4-8"
                "claude-opus-4-7"
                "claude-opus-4-6"
                "claude-opus-4-5"
                "claude-sonnet-5"
                "claude-sonnet-4-6"
                "claude-haiku-4-5"
              ];
            };
          };
        };
      };
    };
}
