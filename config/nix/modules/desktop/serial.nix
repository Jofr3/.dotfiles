# Allow the primary user to access USB serial devices such as ESP32 boards.
{
  flake.modules.nixos.desktop.users.users.jofre.extraGroups = [ "dialout" ];
}
