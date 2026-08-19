{ ... }: {
  xdg.mimeApps = {
    enable = true;
    defaultApplications = {
      "text/html" = "google-chrome.desktop";
      "x-scheme-handler/http" = "google-chrome.desktop";
      "x-scheme-handler/https" = "google-chrome.desktop";
      "x-scheme-handler/about" = "google-chrome.desktop";
      "x-scheme-handler/unknown" = "google-chrome.desktop";
      "inode/directory" = "org.gnome.Nautilus.desktop";
      "application/pdf" = "org.pwmt.zathura.desktop";
      "image/jpeg" = "swayimg.desktop";
      "image/png" = "swayimg.desktop";
      "image/gif" = "swayimg.desktop";
      "image/webp" = "swayimg.desktop";
      "image/svg+xml" = "swayimg.desktop";
      "image/bmp" = "swayimg.desktop";
      "image/tiff" = "swayimg.desktop";
      "text/plain" = "org.gnome.TextEditor.desktop";
      "text/x-csrc" = "org.gnome.TextEditor.desktop";
      "text/x-chdr" = "org.gnome.TextEditor.desktop";
      "text/x-c++src" = "org.gnome.TextEditor.desktop";
      "text/x-c++hdr" = "org.gnome.TextEditor.desktop";
      "text/x-python" = "org.gnome.TextEditor.desktop";
      "text/x-java" = "org.gnome.TextEditor.desktop";
      "text/x-shellscript" = "org.gnome.TextEditor.desktop";
      "text/x-script.python" = "org.gnome.TextEditor.desktop";
      "text/markdown" = "org.gnome.TextEditor.desktop";
      "text/x-markdown" = "org.gnome.TextEditor.desktop";
      "text/xml" = "org.gnome.TextEditor.desktop";
      "text/css" = "org.gnome.TextEditor.desktop";
      "text/x-log" = "org.gnome.TextEditor.desktop";
      "application/json" = "org.gnome.TextEditor.desktop";
      "application/xml" = "org.gnome.TextEditor.desktop";
      "application/javascript" = "org.gnome.TextEditor.desktop";
      "application/x-shellscript" = "org.gnome.TextEditor.desktop";
    };
  };
}
