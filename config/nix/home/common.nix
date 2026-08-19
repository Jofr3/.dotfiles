# Home-manager base shared by every machine, headless or graphical.
{ ... }: {
  imports = [
    ./configs.nix
    ./packages.nix
    ./sops.nix
    ./ssh.nix
  ];

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
    stateVersion = "25.11";

    sessionVariables = {
      FZF_DEFAULT_OPTS = builtins.concatStringsSep " " [
        "--color=bg+:#2a273f,bg:#232136,spinner:#eb6f92,hl:#c4a7e7"
        "--color=fg:#e0def4,header:#908caa,info:#9ccfd8,pointer:#eb6f92"
        "--color=marker:#ea9a97,fg+:#e0def4,prompt:#f6c177,hl+:#c4a7e7"
        "--border=none"
        "--layout=reverse"
      ];
    };
  };

  programs.bash.enable = true;
}
