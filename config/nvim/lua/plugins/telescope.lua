return {
    "nvim-telescope/telescope.nvim",
    enabled = true,
    branch = "0.1.x",
    lazy = false,
    dependencies = {
        "nvim-lua/plenary.nvim",
        { "nvim-telescope/telescope-ui-select.nvim" },
        { "nvim-tree/nvim-web-devicons" },
    },
    config = function()
        require("telescope").setup({
            defaults = {
                file_ignore_patterns = { "public_html", "node_modules" },
                mappings = {
                    i = {
                        ["<C-j>"] = "move_selection_next",
                        ["<C-k>"] = "move_selection_previous",
                    },
                },
            },
            pickers = {},
        })

        local builtin = require("telescope.builtin")
        vim.keymap.set("n", "<C-x>", builtin.builtin, { desc = "[S]earch [F]iles" })
        vim.keymap.set("n", "<C-f>", builtin.find_files, { desc = "[S]earch [F]iles" })
        vim.keymap.set("n", "<C-a>", builtin.current_buffer_fuzzy_find, { desc = "[S]earch [B]uffer fuzzy find" })
        vim.keymap.set("n", "<C-g>", builtin.grep_string, { desc = "[S]earch [G]rep string" })
        vim.keymap.set("n", "<C-v>", builtin.live_grep, { desc = "[S]earch [G]rep string" })
        vim.keymap.set("n", "<leader>sd", builtin.diagnostics, { desc = "[S]earch [D]iagnostics" })
        vim.keymap.set("n", "<Leader>gb", builtin.git_branches, { desc = "Search [G]it [B]anches" })
        vim.keymap.set("n", "<Leader>gf", builtin.git_files, { desc = "Search [G]it [F]iles" })
        vim.keymap.set("n", "<Leader>gs", builtin.git_status, { desc = "Search [G]it [S]atus" })
        vim.keymap.set("n", "<Leader>sh", builtin.help_tags, { desc = "[S]earch [H]elp" })
        vim.keymap.set("n", "<Leader>sk", builtin.keymaps, { desc = "[S]earch [K]eymaps" })
        vim.keymap.set("n", "<Leader><Leader>", builtin.resume, { desc = "Resume search" })
        vim.keymap.set("n", "<Leader>sm", builtin.reloader, { desc = "[S]earch lua [M]odules and reload them" })
        vim.keymap.set("n", "<Leader>sr", builtin.registers, { desc = "[S]earch [R]egisters" })
        vim.keymap.set("n", "<Leader>sl", builtin.quickfixhistory, { desc = "[S]earch quickfix history [L]ist" })
        vim.keymap.set("n", "<Leader>sc", builtin.spell_suggest, { desc = "[S]earch [C]heck" })

        -- Custom pickers

        local actions = require('telescope.actions')
        local action_state = require('telescope.actions.state')
        local finders = require('telescope.finders')
        local pickers = require('telescope.pickers')
        local sorters = require('telescope.sorters')
        local scan = require('plenary.scandir')

        local function select_folder(opts)
          opts = opts or {}

          local results = scan.scan_dir(vim.loop.cwd(), {
            hidden = opts.hidden or false,
            only_dirs = true,
            respect_gitignore = true,
          })

          pickers.new(opts, {
            prompt_title = 'Select Folder',
            finder = finders.new_table {
              results = results,
            },
            sorter = sorters.get_generic_fuzzy_sorter(),
            attach_mappings = function(prompt_bufnr)
              actions.select_default:replace(function()
                actions.close(prompt_bufnr)
                local selection = action_state.get_selected_entry()
                require("oil").open(selection[1])
              end)
              return true
            end,
          }):find()
        end

        vim.keymap.set('n', '<C-c>', select_folder, { noremap = true, silent = true })
    end,
}
