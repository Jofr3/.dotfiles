return {
  "saghen/blink.cmp",
  enabled = true,
  lazy = false,
  version = '1.*',
  opts = {
    sources = {
      default = { "lsp", "path", "buffer", "dadbod" },
      -- default = { 'snippets', 'lsp', 'path', 'buffer', "dadbod" },
      per_filetype = { sql = { 'dadbod' } },
      providers = {
        dadbod = { module = "vim_dadbod_completion.blink" },
      }
    },
    keymap = {
      preset = 'none',
      ['<A-j>'] = {
        function(cmp)
          return cmp.select_next({ auto_insert = true })
        end,
        'select_and_accept'
      },
      ['<A-k>'] = {
        function(cmp)
          return cmp.select_prev({ auto_insert = true })
        end,
        'select_and_accept'
      },
      ['<Tab>'] = { 'select_and_accept', 'fallback' },
      ['<A-l>'] = { 'snippet_forward', 'fallback' },
      ['<A-h>'] = { 'snippet_backward', 'fallback' },
    },
  },
}
