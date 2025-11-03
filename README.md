# ANAL - Automated Network Analysis of Latency

Monitor website latency across multiple load-balanced servers with real-time statistics.

## Features

- Flexible server configuration (single server, auto-generated, or custom list)
- Custom header injection for load balancer routing
- Staggered requests with randomized intervals
- Slow request tracking (>1500ms threshold)
- Color-coded terminal output
- Automatic export to `stats.json` and `slow.log`

## Installation

### With npm
```bash
npm install
```

### With Docker
No installation needed - just build the image.

## Usage

### With Docker (Recommended for servers)

**One command - edit docker-compose.yml first, then run:**
```bash
docker compose up --build
```

**Or pass parameters directly:**
```bash
docker compose run --rm anal --page https://example.com --duration 60 --repeatEvery 5
```

**With 4 servers:**
```bash
docker compose run --rm anal --page https://example.com --duration 360 --repeatEvery 5 --serverCount 4 --header x-server
```

**Direct docker (without compose):**
```bash
docker build -t anal . && docker run --rm -v $(pwd)/stats.json:/app/stats.json -v $(pwd)/slow.log:/app/slow.log anal --page https://example.com --duration 60 --repeatEvery 5
```

Output files (`stats.json`, `slow.log`) are automatically saved to your current directory.

### With npm

```bash
node index.js --page <URL> --duration <seconds> --repeatEvery <seconds> [OPTIONS]
```

### Parameters

**Required:**
- `--page`, `-p`: URL to monitor
- `--duration`, `-d`: Duration in seconds
- `--repeatEvery`, `-r`: Interval between requests in seconds (randomized ±50%)

**Optional:**
- `--header`, `-H`: Custom header name (default: `x-server`)
- `--servers`, `-s`: Comma-separated server list (e.g., "WWW1,WWW2,APP1")
- `--serverCount`, `-c`: Auto-generate N servers
- `--serverPrefix`, `-P`: Prefix for auto-generated servers (default: "WWW")

## Output

### Terminal Display
- Per-server statistics (requests, errors, latency, success rate)
- Slow request tracking (>1500ms)
- Color coding: Green (good), Yellow (warning), Red (issues)

### Files
- **stats.json** - Complete statistics with timestamps and latency data
- **slow.log** - Timestamped log of all requests exceeding 1500ms

## How It Works

**Single Server Mode:** Monitors a URL without custom headers.

**Multi-Server Mode:** Sends staggered requests with custom headers (e.g., `x-server: WWW1`) to route traffic to specific backend servers via load balancer. Requests are randomized (100-800ms delay between servers, ±50% interval variance) to simulate realistic traffic.

## Important Notes

**Latency measurements include complete round-trip time:** WiFi/network delay + internet transit + server processing + return path. This reflects end-user experience.

For server-only latency, run the script from a server in the same datacenter or check server-side logs.

WiFi instability can cause latency variance. Use wired connection for consistent measurements.

Press `Ctrl+C` to stop and display final statistics.
