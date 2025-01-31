return {
  'mrjones2014/smart-splits.nvim',
  enabled = false,
  lazy = false,
  opts = {
    default_amount = 7,
  },
  keys = {
    { mode = "n", "<A-h>",   "<cmd>lua require('smart-splits').move_cursor_left()<cr>" },
    { mode = "n", "<A-j>",   "<cmd>lua require('smart-splits').move_cursor_down()<cr>" },
    { mode = "n", "<A-k>",   "<cmd>lua require('smart-splits').move_cursor_up()<cr>" },
    { mode = "n", "<A-l>",   "<cmd>lua require('smart-splits').move_cursor_right()<cr>" },

    { mode = "n", "<A-H>",   "<cmd>lua require('smart-splits').resize_left()<cr>" },
    { mode = "n", "<A-J>",   "<cmd>lua require('smart-splits').resize_down()<cr>" },
    { mode = "n", "<A-K>",   "<cmd>lua require('smart-splits').resize_up()<cr>" },
    { mode = "n", "<A-L>",   "<cmd>lua require('smart-splits').resize_right()<cr>" },

    { mode = "n", "<A-C-h>", "<cmd>lua require('smart-splits').swap_buf_left()<cr>" },
    { mode = "n", "<A-C-j>", "<cmd>lua require('smart-splits').swap_buf_down()<cr>" },
    { mode = "n", "<A-C-k>", "<cmd>lua require('smart-splits').swap_buf_up()<cr>" },
    { mode = "n", "<A-C-l>", "<cmd>lua require('smart-splits').swap_buf_right()<cr>" },
  },
}
