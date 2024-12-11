{ ... }:
{
  programs.nixvim = {
    colorschemes.gruvbox.enable = true;
    highlightOverride = {
      Normal.bg = "#0B0B0B";
      Visual.bg = "#2b2b2b";
      SignColumn.bg = "#0B0B0B";
      EndOfBuffer.fg = "#0B0B0B";
      EndOfBuffer.bg = "none";
      VertSplit.fg = "#101010";
      VertSplit.bg = "#101010";
      WinSeparator.fg = "#101010";
      WinSeparator.bg = "#101010";
      StatusLine.fg = "#4F4F4F";
      StatusLine.bg = "#101010";
      StatusLineNC.fg = "#4F4F4F";
      StatusLineNC.bg = "#101010";
      StatusLineNC.italic = true;
      Pmenu.bg = "#101010";
      PmenuSbar.bg = "#101010";
      PmenuSel.bg = "#202020";
      PmenuThumb.bg = "#202020";
      CurSearch.fg = "black";
      CurSearch.bg = "white";
      Search.fg = "black";
      Search.bg = "#7E7E7E";
      IncSearch.fg = "black";
      IncSearch.bg = "#7E7E7E";
      Comment.fg = "#3F3F3F";
      LineNr.fg = "#4F4F4F";
      LineNrAbove.fg = "#3F3F3F";
      LineNrBelow.fg = "#3F3F3F";
      DiagnosticUnderlineError.undercurl = true;
      DiagnosticUnderlineWarn.undercurl = true;
      DiagnosticUnderlineInfo.undercurl = true;
      DiagnosticUnderlineHint.undercurl = true;
      Error.fg = "#fb4934";
      ErrorMsg.fg = "#fb4934";
      NvimInternalError.fg = "#fb4934";
      TelescopeNormal.fg = "#787878";

      # background 0B0B0B
      # dark element 101010
      # dark element 1 202020

      # dark text 3F3F3F
      # dark text 2 4F4F4F
    };
  };
}
