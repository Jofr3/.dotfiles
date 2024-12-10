{ inputs, lib, config, pkgs, ... }: 
{
  nixpkgs = {
    overlays = [
      # neovim-nightly-overlay.overlays.default
    ];
    config = {
      allowUnfree = true;
      allowInsecure = true;
    };
  };

  home = {
    username = "jofre";
    homeDirectory = "/home/jofre";
  };

  home.packages = with pkgs; [ 
    # cli
    fastfetch
    # neovim
    zoxide
    eza
    yazi

    # apps
    kitty
    chromium
    qutebrowser
    obsidian
    google-chrome
    nautilus
    gnome-randr
    eog
    wl-color-picker
    gnome-calculator
    papers
    gnome-bluetooth
    gnome-screenshot
    dialect
    apostrophe
    errands

    # other
    dmenu-wayland
    wofi
    bitwarden-cli
    rbw
    rofi-rbw

    # dependencies
    git
    gccgo
    zig
    python39
    lua
    luajitPackages.luarocks
    unzip
    wget
    ripgrep
    fd
    rustc
    cargo
    sqlite
    wl-clipboard-rs
    wtype
    pinentry-tty
    openssl
    nodejs_23

    # lsp's
  ];

  programs = {
    home-manager.enable = true;

    git = {
      enable = true;
      userName = "Jofr3";
      userEmail = "jofrescari@gmail.com";
    };

    ssh = {
     enable = true;
     # keyFiles = [
        # "~/.ssh/id_rsa"
     # ];
    };

    nixvim = {
       enable = true;
        globals.mapleader = " ";
  	globalOpts = {
		number = true;
		relativenumber = true;
		undofile = true;
		ignorecase = true;
		smartcase = true;
		signcolumn = "yes";
		splitright = true;
		splitbelow = true;
		list = false;
		inccommand = "split";
		scrolloff = 10;
		hlsearch = true;
		statusline = " %{expand('%:~:.')} %m";
		tabstop = 4;
		softtabstop = 4;
		shiftwidth = 4;
		expandtab = true;
		wrap = false;
		pumheight = 15;
	};
	plugins = {
		comment = {
			enable = true;
			settings = {
				padding = false;
				ignore = "^$";
			};
		};
		oil = {
			enable = true;
			settings = {
				delete_to_trash = true;
				view_options.show_hidden = true;
				win_options.signcolumn = "yes";
				use_default_keymaps = false;
				keymaps = {
  					"<Esc>" = "actions.parent";
  					"q" = "actions.close";
  					"<C-x>" = "actions.select_split";
  					"<C-r>" = "actions.refresh";
  					"<C-p>" = "actions.preview";
  					"<C-v>" = "actions.select_vsplit";
  					"<CR>" = "actions.select";
  					"<C-h>" = "actions.open_cwd";
  					"<C-t>" = "actions.toggle_trash";
  					"gx" = "actions.open_external";
				};
			};
		};
		smart-splits.enable = true;
		telescope = {
			enable = true;
			settings.defaults = {
				file_ignore_patterns = [ "public_html" "node_modules" "assets" "android" "ios" ];
			};
            extensions.undo.enable = true;
		};
		treesitter = {
            enable = true;
	        settings = {
                ensure_installed = [ "lua" "vim" "vimdoc" "markdown" "markdown_inline" "nix" ];
                highlight.enable = true;
            };
        };
		web-devicons.enable = true;
		lsp = {
		   enable = true;
		   servers = {
		       lua_ls.enable = true;
		       nil_ls.enable = true;
		   };
	    };

        blink-cmp = {
            enable = true;
            settings = {
                keymap = {
                  "<C-j>" = [
                    "select_next"
                    "fallback"
                  ];
                  "<C-k>" = [
                    "select_prev"
                    "fallback"
                  ];
                  "<Tab>" = [
                    "select_and_accept"
                    "fallback"
                  ];
                };
            };
        };
        luasnip = {
            enable = true;
            
            fromLua = [
              {
                lazyLoad = false;
                paths = ./nix.lua;
              }
            ];
        };
	};

	extraPlugins = with pkgs; [
		vimPlugins."windows-nvim"
  		vimPlugins."middleclass"
		vimPlugins."tabby-nvim"
	];

    extraConfigLua = "
        require('windows').setup({
            autowidth = {
              enable = false,
           },
           animation = {
              enable = false,
           }
        })

        local theme = {
          sep = { bg='#0B0B0B' },
          current_tab = { fg = '#83a598', bg='#0B0B0B' },
          inactive_tab = { fg = '#4F4F4F', bg='#0B0B0B' },
        }

        require('tabby').setup({
         line = function(line)
            return {
              line.tabs().foreach(function(tab)
                local hl = tab.is_current() and theme.current_tab or theme.inactive_tab
                return {
                  line.sep(' ', hl, theme.sep),
                  tab.number(),
                  tab.name(),
                  hl = hl,
                  margin = ' ',
                }
              end),
              hl = theme.fill,
            }
          end,
        })

        local capabilities = require('blink.cmp').get_lsp_capabilities()
        local lspconfig = require('lspconfig')

        lspconfig['lua-ls'].setup({ capabilities = capabilities })
        lspconfig['nil_ls'].setup({ capabilities = capabilities })

        local ls = require('luasnip')

        local s = ls.snippet
        local t = ls.text_node
        local i = ls.insert_node

        ls.add_snippets('nix', {
            s('test', {
                t('lol')
            }),
        })
    ";

	keymaps = [
	  { mode = [ "v" ]; key = "<C-c>"; action = "\"+y"; options = { }; }
	  { mode = [ "n" "v" ]; key = "<C-v>"; action = "\"+p"; options = { }; }
	  { mode = [ "i" ]; key = "<C-v>"; action = "<Esc>\"+p"; options = { }; }

	  { mode = [ "v" ]; key = "<A-h>"; action = "<gv"; options = { }; }
	  { mode = [ "v" ]; key = "<A-l>"; action = ">gv"; options = { }; }

      { mode = [ "v" ]; key = "<A-j>"; action = ":m '>+1<CR>gv=gv"; options = { }; }
      { mode = [ "v" ]; key = "<A-k>"; action = ":m '<-2<CR>gv=gv"; options = { }; }

	  { mode = [ "n" ]; key = "<C-n>"; action = "<cmd>Oil<cr>"; options = { silent = true; }; }

	{mode = [ "n" ]; key = "<A-h>"; action = "<cmd>lua require('smart-splits').move_cursor_left()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-j>"; action = "<cmd>lua require('smart-splits').move_cursor_down()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-k>"; action = "<cmd>lua require('smart-splits').move_cursor_up()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-l>"; action = "<cmd>lua require('smart-splits').move_cursor_right()<cr>"; options = { remap = true; }; }

	{mode = [ "n" ]; key = "<A-H>"; action = "<cmd>lua require('smart-splits').resize_left()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-J>"; action = "<cmd>lua require('smart-splits').resize_down()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-K>"; action = "<cmd>lua require('smart-splits').resize_up()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-L>"; action = "<cmd>lua require('smart-splits').resize_right()<cr>"; options = { remap = true; }; }

	{mode = [ "n" ]; key = "<A-C-h>"; action = "<cmd>lua require('smart-splits').swap_buf_left()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-C-j>"; action = "<cmd>lua require('smart-splits').swap_buf_down()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-C-k>"; action = "<cmd>lua require('smart-splits').swap_buf_up()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<A-C-l>"; action = "<cmd>lua require('smart-splits').swap_buf_right()<cr>"; options = { remap = true; }; }

	{mode = [ "n" ]; key = "<C-f>"; action = "<cmd>lua require('telescope.builtin').find_files()<cr>"; options = { remap = true; }; }
	#{mode = [ "n" ]; key = "<C-v>"; action = "<cmd>lua require('telescope.builtin').live_grep()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader><Leadear>"; action = "<cmd>lua require('telescope.builtin').resume()<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>u"; action = "<cmd>Telescope undo<cr>"; options = { remap = true; }; }

	{mode = [ "n" ]; key = "<C-m>"; action = "<cmd>WindowsMaximize<cr>"; options = { remap = true; }; }

	{mode = [ "n" ]; key = "<Leader>t"; action = "<cmd>$tabnew<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>c"; action = "<cmd>tabclose<cr>"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>1"; action = "1gt"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>2"; action = "2gt"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>3"; action = "3gt"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>4"; action = "4gt"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>5"; action = "5gt"; options = { remap = true; }; }
	{mode = [ "n" ]; key = "<Leader>6"; action = "6gt"; options = { remap = true; }; }

	{mode = [ "i" ]; key = "<C-Space>"; action = "<cmd>lua require('luasnip').expand()<cr>"; options = { silent = true; }; }
	#{mode = [ "i" "s" ]; key = "<A-Tab>"; action = "<cmd>lua require('luasnip').expand()"; options = { silent = true; }; }
	#{mode = [ "i" "s" ]; key = "<A-Tab>"; action = "<cmd>lua require('luasnip').expand()"; options = { silent = true; }; }



    #vim.keymap.set({"i"}, "<C-K>", function() ls.expand() end, {silent = true})
    #vim.keymap.set({"i", "s"}, "<C-L>", function() ls.jump( 1) end, {silent = true})
    #vim.keymap.set({"i", "s"}, "<C-J>", function() ls.jump(-1) end, {silent = true})
	];

        autoCmd = [
            {
              event = [ "FileType" ];
              pattern = [ "oil" ];
              callback = { __raw = "function() vim.opt_local.number = false vim.opt_local.relativenumber = false end"; };
            }
        ];

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
  };

  stylix = {
    enable = true;
    image = ./../../wallpapers/15.jpg;
    base16Scheme = "${pkgs.base16-schemes}/share/themes/gruvbox-dark-hard.yaml";
    polarity = "dark";

    override = {
        base00 = "0B0B0B";
    };
  };

  home.activation = {
    cloneDotfiles = lib.hm.dag.entryAfter ["writeBoundary"] ''
      if [ ! -d "/home/jofre/.dotfiles" ]; then
      	${pkgs.git}/bin/git clone https://github.com/Jofr3/.dotfiles /home/jofre/.dotfiles
      fi

      if [ -d "/home/jofre/.config/hypr" ]; then
        rm -rf /home/jofre/.config/hypr
      fi

      if [ ! -L "/home/jofre/.config/hypr" ]; then
        ln -s /home/jofre/.dotfiles/config/hypr /home/jofre/.config/hypr
      fi

      if [ ! -L "/home/jofre/.config/kitty" ]; then
        ln -s /home/jofre/.dotfiles/config/kitty /home/jofre/.config/kitty
      fi

      if [ ! -L "/home/jofre/.config/fish" ]; then
        ln -s /home/jofre/.dotfiles/config/fish /home/jofre/.config/fish
      fi

      if [ ! -L "/home/jofre/.config/nvim" ]; then
        ln -s /home/jofre/.dotfiles/config/nvim /home/jofre/.config/nvim
      fi

      if [ ! -L "/home/jofre/.config/qutebrowser" ]; then
        ln -s /home/jofre/.dotfiles/config/qutebrowser /home/jofre/.config/qutebrowser
      fi

      if [ ! -L "/home/jofre/.config/rbw" ]; then
        ln -s /home/jofre/.dotfiles/config/rbw /home/jofre/.config/rbw
      fi

      export NIX_LD=$(nix eval --impure --raw --expr 'let pkgs = import <nixpkgs> {}; NIX_LD = pkgs.lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker"; in NIX_LD')
    '';
  };

  systemd.user.startServices = "sd-switch";
  home.stateVersion = "24.05";
}
