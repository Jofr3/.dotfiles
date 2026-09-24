{
  flake.modules.nixos.base =
    { pkgs, ... }:
    {
      environment.systemPackages = [ pkgs.git ];
    };

  flake.modules.homeManager.base =
    { config, lib, ... }:
    {
      programs.git = {
        enable = true;

        settings.user = {
          email = "jofrescari@gmail.com";
          name = "Jofr3";
        };

        includes = [
          {
            condition = "gitdir:~/lsw/**/.git";
            contents.user = {
              email = "jofrelsw@gmail.com";
              name = "JofreLSW";
            };
          }
        ];

        ignores = [ "**/.claude/settings.local.json" ];
      };

      programs.ssh.settings = {
        "github.com" = {
          HostName = "github.com";
          User = "git";
          IdentityFile = "${config.home.homeDirectory}/.ssh/keys/Jofr3";
          IdentitiesOnly = true;
        };

        "gitlab.com" = {
          HostName = "gitlab.com";
          User = "git";
          IdentityFile = "${config.home.homeDirectory}/.ssh/keys/jofre_gitlab.pub";
          IdentitiesOnly = true;
        };
      };
    };
}
