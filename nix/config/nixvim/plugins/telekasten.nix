{ ... }:
{
  programs.nixvim = {
    plugins = {
      telekasten = {
        enable = true;
        settings = {
          home = {
            __raw = "vim.fn.expand('/home/jofre/Dropbox/notes')";
          };
        };
      };
    };
  };
}
