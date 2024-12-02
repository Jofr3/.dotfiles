return {
  'nanozuki/tabby.nvim',
  enable = true,
  config = function()
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
  end,
  keys = {
	{ "<Leader>t", "<cmd>:$tabnew<cr>", remap = true, desc = "New tab" },
	{ "<Leader>c", "<cmd>:tabclose<cr>", remap = true, desc = "Close tab" },

	{ "<Leader>1", "1gt", remap = true, desc = "Goto tap 1" },
	{ "<Leader>2", "2gt", remap = true, desc = "Goto tap 2" },
	{ "<Leader>3", "3gt", remap = true, desc = "Goto tap 3" },
	{ "<Leader>4", "4gt", remap = true, desc = "Goto tap 4" },
	{ "<Leader>5", "5gt", remap = true, desc = "Goto tap 5" },
  }
}
