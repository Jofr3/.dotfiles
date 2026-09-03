# Removable media: automounting for nautilus & co.
{
  flake.modules.nixos.desktop = {
    services.gvfs.enable = true;
    services.udisks2.enable = true;
    hardware.usb-modeswitch.enable = true;
  };
}
