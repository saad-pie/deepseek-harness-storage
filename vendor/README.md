# Vendored plugin source

`dsh-plugin-apex-browser/` here is a copy of `/tmp/home/dsh-plugin-apex-browser`
kept inside the tracked `.dsh` tree, so the source survives a container restart
that wipes `/tmp` contents.

Restore after a restart:

```bash
mkdir -p /tmp/home/dsh-plugin-apex-browser
cp -r /tmp/home/.dsh/vendor/dsh-plugin-apex-browser/* /tmp/home/dsh-plugin-apex-browser/
cd /tmp/home/dsh-plugin-apex-browser && npm install
/tmp/home/.dsh-cli/bin/dsh plugin --profile web add file:///tmp/home/dsh-plugin-apex-browser
```

The plugin also self-heals its browser: if the Playwright Chromium cache is
missing it downloads it on first use.
