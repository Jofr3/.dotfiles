# One system-wide set of Playwright browsers instead of a download per project.
{
  flake.modules.nixos.desktop =
    { pkgs, ... }:
    {
      environment.systemPackages = with pkgs; [ playwright-driver.browsers ];

      environment.sessionVariables = {
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
      };
    };
}
