return {
  "nvim-telescope/telescope.nvim",
  enabled = true,
  lazy = true,
  tag = "0.1.8",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "debugloop/telescope-undo.nvim",
  },
  opts = function()
    local actions = require("telescope.actions")
    return {
      defaults = {
        hidden = true,
        file_ignore_patterns = {
          "%.git/",
          "^storage/",
          "^public/",
          "^public_html/",
          "^node_modules/",
          "^assets/",
          "^database/migrations/",
          "^bootstrap/",
          "^vendor/",
          "^android/",
          "^ios/",
          "^neo4j/",
          "^test/",
        },
        mappings = {
          n = {
            ["q"] = actions.close,
          },
          i = {
            ["<A-c>"] = actions.delete_buffer,
            ["<A-v>"] = actions.select_vertical,
            ["<A-x>"] = actions.select_horizontal,
            ["<A-q>"] = actions.smart_send_to_qflist,
            ["<A-o>"] = actions.cycle_history_prev,
            ["<A-i>"] = actions.cycle_history_next,
          },
        },
        layout_config = { width = 190, height = 45 },
      },
      pickers = {
        find_files = {
          hidden = true,
          no_ignore = true,
          no_ignore_parent = true,
        },
      },
    }
  end,
  keys = function()
    local builtin = require("telescope.builtin")
    return {
      { mode = "n", "<A-o>",          builtin.find_files },
      { mode = "n", "<A-g>",          builtin.live_grep },
      { mode = "n", "<A-c>",          builtin.git_status },
      { mode = "n", "<space><space>", builtin.resume },
    }
  end
}
