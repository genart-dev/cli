# @genart-dev/cli

Command-line interface for [genart.dev](https://genart.dev) — render, batch, montage, import, validate, export, and scaffold generative art sketches. Includes a built-in MCP server for AI agent integration.

Part of [genart.dev](https://genart.dev) — a generative art platform with an [MCP server](https://github.com/genart-dev/mcp-server), desktop app, and IDE extensions.

## Install

```bash
npm install -g @genart-dev/cli
```

## Quick Start

```bash
# Create a new sketch
genart init "spiral grid" --renderer p5

# Render to PNG
genart render spiral-grid.genart -o spiral-grid.png

# Batch render with seed sweep
genart batch spiral-grid.genart --seeds 1-20 --concurrency 8

# Export standalone HTML
genart export spiral-grid.genart --format html

# Import existing source code
genart import sketch.js

# Record a video
genart video spiral-grid.genart --duration 10 --fps 30

# Connect your AI agent
genart agent install claude
```

## Commands

### `genart render <file>`

Render a `.genart` sketch to an image.

```bash
genart render sketch.genart
genart render sketch.genart -o output.png --wait 1s --scale 2
genart render sketch.genart --seed 42 --preset landscape-1000
genart render sketch.genart --params '{"amplitude": 0.8}' --colors '["#ff0000", "#00ff00"]'
```

| Option | Default | Description |
|--------|---------|-------------|
| `--wait <duration>` | `500ms` | Wait time before capture |
| `--seed <n>` | | Override seed |
| `--params <json>` | | Override parameters (JSON object) |
| `--colors <json>` | | Override color palette (JSON array) |
| `--width <n>` | | Override canvas width |
| `--height <n>` | | Override canvas height |
| `--preset <name>` | | Canvas preset (e.g. `square-600`, `landscape-1000`) |
| `--format <fmt>` | `png` | Output format: `png`, `jpeg`, `webp` |
| `--quality <n>` | `80` | Lossy compression quality (0–100) |
| `--scale <n>` | `1` | Pixel density multiplier |
| `-o, --output <path>` | | Output file path |

### `genart info <files...>`

Inspect `.genart` sketch metadata — title, renderer, canvas, parameters, colors, skills, dates.

```bash
genart info sketch.genart
genart info *.genart --json
genart info sketches/ --table
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `--table` | Tabular output for multiple files |

### `genart validate <paths...>`

Validate `.genart` files. Accepts files and directories (scans recursively).

```bash
genart validate sketch.genart
genart validate ./sketches/ --strict
```

| Option | Description |
|--------|-------------|
| `--strict` | Also run renderer-specific `validate()` on algorithm source |

### `genart init [name]`

Scaffold a new `.genart` sketch file with interactive prompts.

```bash
genart init
genart init "wave field" --renderer three --preset portrait-800
```

| Option | Default | Description |
|--------|---------|-------------|
| `--renderer <type>` | *(interactive)* | `p5`, `canvas2d`, `three`, `glsl`, `svg` |
| `--preset <name>` | `square-600` | Canvas preset |
| `--title <string>` | *(interactive)* | Sketch title |

### `genart export <file>`

Export sketch as HTML, image, or algorithm source.

```bash
genart export sketch.genart --format html -o sketch.html
genart export sketch.genart --format png --scale 2
genart export sketch.genart --format algorithm   # extracts .js or .glsl
```

| Option | Default | Description |
|--------|---------|-------------|
| `--format <fmt>` | `html` | `html`, `png`, `jpeg`, `webp`, `algorithm` |
| `--wait <duration>` | `500ms` | Render wait time (image formats) |
| `--seed <n>` | | Override seed |
| `--params <json>` | | Override parameters |
| `--colors <json>` | | Override color palette |
| `--width <n>` | | Override canvas width |
| `--height <n>` | | Override canvas height |
| `--preset <name>` | | Canvas preset |
| `--quality <n>` | `80` | Lossy compression quality (0–100) |
| `--scale <n>` | `1` | Pixel density multiplier |
| `-o, --output <path>` | | Output file path |

### `genart batch <files...>`

Generate many renders from one sketch — seed ranges, parameter sweeps, random combinations.

```bash
genart batch sketch.genart --seeds 1-100 --concurrency 8 -o renders/
genart batch sketch.genart --sweep amplitude=0:1:0.1 --manifest
genart batch sketch.genart --random 50 --naming "{id}-{seed}-{params}"
genart batch sketch.genart --seeds 1-5 --sweep size=10:50:10 --matrix
```

| Option | Default | Description |
|--------|---------|-------------|
| `--seeds <range>` | | Seed range or list (e.g. `1-100`, `1,5,42`) |
| `--sweep <spec>` | | Parameter sweep: `key=min:max:step` (repeatable) |
| `--random <n>` | | Generate N random seed + param combinations |
| `--matrix` | | Cartesian product of seeds × sweeps |
| `--concurrency <n>` | `4` | Parallel captures |
| `--naming <pattern>` | `{id}-{seed}` | Output naming (tokens: `{id}`, `{seed}`, `{index}`, `{params}`) |
| `--manifest` | | Write `manifest.json` with per-render metadata |
| `--wait <duration>` | `500ms` | Render wait time |
| `--format <fmt>` | `png` | `png`, `jpeg`, `webp` |
| `--quality <n>` | `80` | Lossy compression quality (0–100) |
| `--scale <n>` | `1` | Pixel density multiplier |
| `--width <n>` | | Override canvas width |
| `--height <n>` | | Override canvas height |
| `--preset <name>` | | Canvas preset |
| `--colors <json>` | | Override color palette |
| `-o, --output-dir <dir>` | `.` | Output directory |

### `genart montage <source>`

Compose a grid of images into a single montage. Reads from a directory or manifest JSON on stdin.

```bash
genart montage renders/ -o grid.png --columns 10 --gap 4
genart batch sketch.genart --seeds 1-25 --manifest | genart montage - --label seed
```

| Option | Default | Description |
|--------|---------|-------------|
| `--columns <n>` | *(auto)* | Grid columns |
| `--rows <n>` | *(auto)* | Grid rows |
| `--tile-size <WxH>` | | Force tile dimensions (e.g. `200x200`) |
| `--gap <px>` | `2` | Gap between tiles |
| `--padding <px>` | `0` | Outer padding |
| `--background <hex>` | `#0A0A0A` | Background color |
| `--label <mode>` | `none` | Label tiles: `seed`, `params`, `filename`, `index`, `none` |
| `--label-color <hex>` | `#999999` | Label text color |
| `--label-font-size <px>` | `11` | Label font size |
| `--sort <key>` | | Sort: `seed`, `name`, `param:<key>` |
| `-o, --output <path>` | `montage.png` | Output file |

Requires [`sharp`](https://sharp.pixelplumbing.com/) — install with `npm install sharp`.

### `genart import <files...>`

Convert source files (`.js`, `.glsl`) into `.genart` sketches. Auto-detects renderer, parameters, colors, and canvas size from source code.

```bash
genart import sketch.js
genart import *.js --batch --renderer p5 --title "My Series"
genart import shader.glsl --preset landscape-1000 --seed 42
genart import sketch.js --dry-run
```

| Option | Default | Description |
|--------|---------|-------------|
| `--renderer <type>` | *(auto-detect)* | Force renderer type |
| `--preset <name>` | `square-600` | Canvas preset |
| `--title <string>` | *(interactive)* | Sketch title |
| `--seed <n>` | | Initial seed |
| `-y, --non-interactive` | | Accept all defaults |
| `--batch` | | Process multiple files non-interactively |
| `--dry-run` | | Preview without writing |
| `-o, --output <path>` | | Output path (single file only) |

**Renderer auto-detection** analyzes source code for framework-specific patterns (p5 instance methods, Canvas2D API, THREE constructors, GLSL builtins, SVG namespaces) and reports confidence level (high, medium, low).

### `genart video <file>`

Render a video from an animated sketch. Captures frames via headless Chrome and encodes with ffmpeg.

```bash
genart video sketch.genart --duration 10
genart video sketch.genart --duration 5 --fps 60 --format webm --codec vp9
genart video sketch.genart --duration 3 --animate amplitude=0:1 --easing ease-in-out
genart video sketch.genart --duration 2 --format gif --loop 0
```

| Option | Default | Description |
|--------|---------|-------------|
| `--duration <seconds>` | *(required)* | Video duration in seconds |
| `--fps <n>` | `30` | Frames per second |
| `--format <fmt>` | `mp4` | `mp4`, `webm`, `gif` |
| `--codec <name>` | `h264` | `h264`, `h265`, `vp9` |
| `--quality <n>` | `75` | Encoding quality (0–100) |
| `--animate <spec>` | | Interpolate parameter: `param=start:end` (repeatable) |
| `--easing <fn>` | `linear` | `linear`, `ease-in`, `ease-out`, `ease-in-out` |
| `--loop <n>` | `0` | GIF loop count (0 = infinite) |
| `--concurrency <n>` | `4` | Parallel frame captures |
| `--wait <duration>` | `200ms` | Init wait before time injection |
| `--seed <n>` | | Override seed |
| `--params <json>` | | Override parameters |
| `--colors <json>` | | Override color palette |
| `--width <n>` | | Override canvas width |
| `--height <n>` | | Override canvas height |
| `--preset <name>` | | Canvas preset |
| `-o, --output <path>` | | Output file path |

Requires [ffmpeg](https://ffmpeg.org/) in `PATH`.

### `genart agent <subcommand>`

MCP server and AI agent configuration. See [Agent Integration](#agent-integration) below.

## Agent Integration

The CLI includes a built-in [MCP server](https://modelcontextprotocol.io) with 33 tools for creating and manipulating generative art. Connect it to any AI coding agent.

### `genart agent install [client]`

Configure MCP for an AI client with one command.

```bash
genart agent install claude
genart agent install cursor
genart agent install --all          # configure all detected clients
genart agent install claude --npx   # use npx instead of global binary
genart agent install --remove       # remove genart from all clients
genart agent install vscode --dry-run
```

| Option | Description |
|--------|-------------|
| `--all` | Configure all clients whose binary is detected in PATH |
| `--remove` | Remove genart MCP configuration |
| `--dry-run` | Preview changes without writing |
| `--npx` | Force npx invocation (`npx -y @genart-dev/cli agent stdio`) |

### Supported AI Clients

| Client | ID | Config Path (macOS) | Binary |
|--------|----|-------------------|--------|
| Claude Code | `claude` | `~/.claude.json` | `claude` |
| Codex CLI | `codex` | `~/.codex/config.toml` | `codex` |
| Cursor | `cursor` | `~/.cursor/mcp.json` | `cursor` |
| VS Code | `vscode` | `~/Library/Application Support/Code/User/settings.json` | `code` |
| Gemini CLI | `gemini` | `~/.gemini/settings.json` | `gemini` |
| OpenCode | `opencode` | `~/.config/opencode/opencode.json` | `opencode` |
| Kiro | `kiro` | `~/.kiro/settings/mcp.json` | `kiro` |
| Windsurf | `windsurf` | `~/.codeium/windsurf/mcp_config.json` | `windsurf` |

### `genart agent stdio`

Start MCP server over stdio transport. This is what AI clients connect to.

```bash
genart agent stdio
genart agent stdio --base-path ~/sketches
```

| Option | Default | Description |
|--------|---------|-------------|
| `--base-path <dir>` | cwd | Base directory for file operations |

### `genart agent http`

Start MCP server over HTTP (Streamable HTTP transport) for browser or network access.

```bash
genart agent http
genart agent http --port 8080 --cors
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port <n>` | `3333` | Port to listen on |
| `--host <addr>` | `127.0.0.1` | Host to bind to |
| `--base-path <dir>` | cwd | Base directory for file operations |
| `--cors` | | Enable CORS headers |

### `genart agent sidecar`

Start MCP server in sidecar mode (stdio + IPC mutations). Used by the Electron desktop app for real-time UI updates.

```bash
genart agent sidecar --base-path ~/project
```

| Option | Default | Description |
|--------|---------|-------------|
| `--base-path <dir>` | cwd | Base directory for file operations |

### `genart agent doctor`

Diagnose your genart MCP setup — checks CLI version, Chrome, ffmpeg, sharp, and per-client configuration.

```bash
genart agent doctor
```

## Hybrid Workflow

The CLI and MCP server are designed to work together. Your AI agent creates and edits sketches through the MCP tools, then you use the CLI to render, batch, export, and compose:

```bash
# 1. Connect your agent
genart agent install claude

# 2. Ask the agent to create sketches
#    "Create a workspace with three p5.js sketches exploring Perlin noise"

# 3. Render the results
genart render noise-field.genart -o noise-field.png

# 4. Explore the parameter space
genart batch noise-field.genart --seeds 1-100 --sweep scale=0.01:0.1:0.01 --matrix

# 5. Compose a montage
genart montage renders/ --columns 10 --label seed -o exploration.png

# 6. Record a video
genart video noise-field.genart --duration 10 --animate scale=0.01:0.1 --easing ease-in-out
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GENART_CHROME_PATH` | Override Chrome/Chromium path for headless rendering. Auto-detected by default. |

## Optional Dependencies

| Package | Required For | Install |
|---------|-------------|---------|
| [sharp](https://sharp.pixelplumbing.com/) | `montage` command | `npm install sharp` |
| [ffmpeg](https://ffmpeg.org/) | `video` command | `brew install ffmpeg` / [download](https://ffmpeg.org/download.html) |
| Chrome/Chromium | `render`, `export`, `batch`, `video` | Auto-detected or set `GENART_CHROME_PATH` |

## Related Packages

| Package | Purpose |
|---------|---------|
| [`@genart-dev/format`](https://github.com/genart-dev/format) | File format types, parsers, presets |
| [`@genart-dev/core`](https://github.com/genart-dev/core) | Renderer adapters, skill registry |
| [`@genart-dev/mcp-server`](https://github.com/genart-dev/mcp-server) | MCP server + CLI (33 tools) |

## Support

Questions, bugs, or feedback — [support@genart.dev](mailto:support@genart.dev) or [open an issue](https://github.com/genart-dev/cli/issues).

## License

MIT
