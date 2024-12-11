{ ... }:
{
  programs.nixvim = {
    plugins = {
      telescope = {
        enable = true;
        settings.defaults = {
          file_ignore_patterns = [
            "public_html"
            "node_modules"
            "assets"
            "android"
            "ios"
          ];
        };
        extensions.undo.enable = true;
      };
    };
  };
}
