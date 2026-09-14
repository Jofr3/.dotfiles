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
    };
}
