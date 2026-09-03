# Auto shutdown at 21:30 on Mon-Thu.
{
  flake.modules.nixos.desktop =
    { pkgs, ... }:
    {
      systemd.services.auto-shutdown = {
        description = "Automatic shutdown at 9:30 PM (weekdays except Friday)";
        serviceConfig = {
          Type = "oneshot";
          ExecStart = "${pkgs.systemd}/bin/shutdown now";
        };
      };

      systemd.timers.auto-shutdown = {
        wantedBy = [ "timers.target" ];
        timerConfig = {
          OnCalendar = "Mon,Tue,Wed,Thu *-*-* 21:30:00";
          Persistent = false;
        };
      };
    };
}
