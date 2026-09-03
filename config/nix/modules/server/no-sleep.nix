# Never let a headless machine sleep or react to a lid.
{
  flake.modules.nixos.server = {
    services.logind.settings.Login = {
      HandleLidSwitch = "ignore";
      HandleLidSwitchExternalPower = "ignore";
    };
    systemd.sleep.settings.Sleep = {
      AllowSuspend = false;
      AllowHibernation = false;
      AllowHybridSleep = false;
      AllowSuspendThenHibernate = false;
    };
  };
}
