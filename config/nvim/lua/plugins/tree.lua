return {
    "nvim-tree/nvim-tree.lua",
    version = "*",
    lazy = false,
    dependencies = {
        "nvim-tree/nvim-web-devicons",
    },
    config = function()
        require("nvim-tree").setup {
            sync_root_with_cwd = true,
            hijack_cursor = false,
            view = {
                cursorline = true,
                side = "right",
                preserve_window_proportions = true,
            },
            renderer = {
                indent_width = 2,
                icons = {
                    web_devicons = {
                        file = {
                            enable = true,
                            color = true,
                        },
                        folder = {
                            enable = false,
                            color = true,
                        },
                    },
                    git_placement = "after",
                    show = {
                        file = true,
                        folder = true,
                        folder_arrow = false,
                        git = true,
                        modified = false,
                        diagnostics = false,
                        bookmarks = false,
                    },
                },
            },
            hijack_directories = {
                enable = true,
                auto_open = true,
            },
            update_focused_file = {
                enable = true
            },
        }
    end,
    init = function()
        -- vim.api.nvim_create_autocmd("VimEnter", {
        --     callback = function()
        --         require("nvim-tree.api").tree.toggle({ focus = false })
        --     end,
        -- })

        vim.api.nvim_create_autocmd("BufEnter", {
            nested = true,
            callback = function()
            if #vim.api.nvim_list_wins() == 1 and require("nvim-tree.utils").is_nvim_tree_buf() then
              vim.cmd "quit"
            end
          end
        })
    end,
    keys = {
        { "<C-t>", "<cmd>:NvimTreeToggle<cr>", remap = true, desc = "Toggle tree file explorer" },
    }
}
