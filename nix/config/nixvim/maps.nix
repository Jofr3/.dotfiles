{ ... }:
{
  programs.nixvim = {
    globals.mapleader = " ";
    keymaps = [
      {
        mode = [ "v" ];
        key = "<C-c>";
        action = "\"+y";
        options = { };
      }
      {
        mode = [
          "n"
          "v"
        ];
        key = "<C-v>";
        action = "\"+p";
        options = { };
      }
      {
        mode = [ "i" ];
        key = "<C-v>";
        action = "<Esc>\"+p";
        options = { };
      }

      {
        mode = [ "v" ];
        key = "<A-h>";
        action = "<gv";
        options = { };
      }
      {
        mode = [ "v" ];
        key = "<A-l>";
        action = ">gv";
        options = { };
      }

      {
        mode = [ "v" ];
        key = "<A-j>";
        action = ":m '>+1<CR>gv=gv";
        options = { };
      }
      {
        mode = [ "v" ];
        key = "<A-k>";
        action = ":m '<-2<CR>gv=gv";
        options = { };
      }
    ];
  };
}
