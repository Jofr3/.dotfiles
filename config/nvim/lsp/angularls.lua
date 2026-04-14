return {
  cmd = { "ngserver", "--stdio", "--tsProbeLocations", "", "--ngProbeLocations", "" },
  filetypes = { "typescript", "html", "typescriptreact", "typescript.tsx" },
  root_markers = { "angular.json", "project.json", "nx.json" },
  before_init = function(_, config)
    local root = config.root_dir or vim.fn.getcwd()
    local node_modules = vim.fs.find("node_modules", { path = root, upward = true })[1] or ""
    config.cmd = {
      "ngserver",
      "--stdio",
      "--tsProbeLocations",
      node_modules,
      "--ngProbeLocations",
      node_modules,
    }
  end,
}
