# Fixed colour temperature all day (the sunrise/sunset window is one minute).
{
  flake.modules.homeManager.desktop.services.wlsunset = {
    enable = true;
    sunrise = "00:00";
    sunset = "00:01";
    temperature = {
      day = 4501;
      night = 4500;
    };
  };
}
