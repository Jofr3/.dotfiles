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
    keys = {
        { "<C-t>", "<cmd>:NvimTreeToggle<cr>", remap = true, desc = "Toggle tree file explorer" },
    }
}
