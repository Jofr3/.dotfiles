return {
  "nvim-telescope/telescope.nvim",
  enabled = true,
  lazy = false,
  tag = "0.1.8",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "debugloop/telescope-undo.nvim",
    "albenisolmos/telescope-oil.nvim"
  },
  opts = {
    defaults = {
      file_ignore_patterns = { "^public_html/", "^node_modules/", "^assets/", "^database/migrations/", "^bootstrap/", "^vendor/", "^android/", "^ios/", "^neo4j/" },
      mappings = {
        n = {
          ['<c-d>'] = require('telescope.actions').delete_buffer,
        },
      },
    },
  },
  keys = {
    { mode = "n", "<A-f>", "<cmd>lua require('telescope.builtin').find_files()<cr>" },
    { mode = "n", "<A-b>", "<cmd>lua require('telescope.builtin').buffers()<cr>" },
    { mode = "n", "<A-v>", "<cmd>lua require('telescope.builtin').live_grep()<cr>" },
    { mode = "n", "<A-/>", "<cmd>lua require('telescope.builtin').current_buffer_fuzzy_find()<cr>" },
    { mode = "n", "<space><space>", "<cmd>lua require('telescope.builtin').resume()<cr>" },
    { mode = "n", "<A-u>", "<cmd>Telescope undo<cr>" },
    { mode = "n", "<A-c>", "<cmd>Telescope oil<cr>" },
  },
}
