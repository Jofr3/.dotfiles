return {
	"saghen/blink.cmp",
	enabled = true,
	lazy = false,
  version = "1.*",
	opts = {
    completion = {
      menu = {
        draw = {
          columns = { 
            { "label", gap = 1 }, { "kind_icon" } 
          }
        },
      },
    },
		sources = {
			default = { "lsp", "path", "buffer",   "dadbod"},
			per_filetype = {
				sql = { "dadbod", "buffer" },
			},
			providers = {
				dadbod = { name = "Dadbod", module = "vim_dadbod_completion.blink" },
			},
			min_keyword_length = 1,
		},
		fuzzy = {
			implementation = "rust",
		},
		keymap = {
			preset = "none",
			["<A-j>"] = {
				function(cmp)
					return cmp.select_next({ auto_insert = true })
				end,
				"select_and_accept",
			},
			["<A-k>"] = {
				function(cmp)
					return cmp.select_prev({ auto_insert = true })
				end,
				"select_and_accept",
			},
			["<Tab>"] = { "select_and_accept", "fallback" },
		},
		cmdline = {
			completion = {
				menu = {
					auto_show = true,
				},
			},
			keymap = {
				preset = "none",
				["<A-j>"] = {
					function(cmp)
						return cmp.select_next({ auto_insert = true })
					end,
					"select_and_accept",
				},
				["<A-k>"] = {
					function(cmp)
						return cmp.select_prev({ auto_insert = true })
					end,
					"select_and_accept",
				},
				["<Tab>"] = { "select_and_accept", "fallback" },
			},
		},
	},
}
