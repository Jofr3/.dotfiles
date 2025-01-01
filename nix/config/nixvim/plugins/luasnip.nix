{ ... }:
{
  programs.nixvim = {
    plugins.luasnip.enable = true;
    keymaps = [
      {
        mode = [ "i" ];
        key = "<C-Tab>";
        action = "<cmd>lua require('luasnip').expand()<cr>";
        options = {
          silent = true;
        };
      }
    ];
    extraConfigLua = ''
            local ls = require('luasnip')

            local s = ls.snippet
            local t = ls.text_node
            local i = ls.insert_node

            local fmt = require("luasnip.extras.fmt").fmt

            ls.add_snippets('all', {
              s("ftp",
                  fmt(
                      [[
                  remote_host     host
                  remote_user     user
                  remote_port     22
                  remote_path     path
                  local_path      ./
                  ignore_path     [".vscode", "vendor", ".git", ".DS_Store"]
                  ignore_dotfiles 1
                  auto_sync_up    1
                  remote_or_local remote
                  sleep_before_sync 0
                      ]],
      			    { }
                  )
              ),
            })

            ls.add_snippets('nix', {
                s('test', {
                    t('lol')
                }),
            })

    '';
  };
}
