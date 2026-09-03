{
  flake.modules.nixos.server =
    { lib, ... }:
    {
      services.openssh = {
        enable = true;
        openFirewall = true;
        settings = {
          PermitRootLogin = "no";
          PasswordAuthentication = lib.mkDefault false;
          KbdInteractiveAuthentication = false;
        };
      };

      services.fail2ban.enable = true;

      # Password auth over SSH is off (above), so this list is the only way in
      # over the network -- emptying it leaves just the local console and the
      # `initialPassword` from ../base/user.nix.
      users.users.jofre.openssh.authorizedKeys.keys = [
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHQRsAl4ousWrEi9QGAvl1kCyPi1NRdOpO8Wgg56qLm4 jofrescari@gmail.com"
      ];
    };
}
