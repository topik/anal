# ANAL - Automated Network Analysis of Latency

A console utility to monitor website latency across multiple load-balanced servers with real-time statistics and intelligent tracking.

## Features

- **Flexible server configuration**: Single server mode, auto-generated servers, or custom server list
- **Custom header injection** for load balancer routing
- Staggered requests with random delays to avoid simultaneous server loads
- Randomized request intervals (averages to your specified interval)
- Slow request tracking (>1500ms threshold)
- Color-coded terminal output for easy reading
- Real-time statistics display during monitoring
- Final analytics summary at the end
- Automatic export of statistics to `stats.json`
- Fully configurable via command-line parameters

## Installation

```bash
npm install
```

## Usage

```bash
node index.js --page <URL> --duration <seconds> --repeatEvery <seconds> [OPTIONS]
```

### Required Parameters

- `--page`, `-p`: URL of the website to monitor
- `--duration`, `-d`: Total duration of monitoring in seconds
- `--repeatEvery`, `-r`: Average interval between requests in seconds (actual timing is randomized ±50%)

### Optional Parameters (Server Configuration)

- `--header`, `-H`: Custom header name for load balancer routing (default: `x-server` when servers configured)
- `--servers`, `-s`: Comma-separated list of server values (e.g., "WWW1,WWW2,WWW3,WWW4")
- `--serverCount`, `-c`: Auto-generate N servers with a prefix (e.g., 4 generates WWW1-WWW4)
- `--serverPrefix`, `-P`: Prefix for auto-generated servers (default: "WWW")

### Examples

#### Single Server Mode (Default)
```bash
node index.js --page https://example.com --duration 60 --repeatEvery 5
```
Monitors a single URL without custom headers.

#### Auto-Generate 4 Servers
```bash
node index.js --page https://example.com --duration 360 --repeatEvery 5 --serverCount 4 --header x-server
```
Monitors with headers: `x-server: WWW1`, `x-server: WWW2`, `x-server: WWW3`, `x-server: WWW4`

#### Custom Server List
```bash
node index.js --page https://api.example.com --duration 300 --repeatEvery 10 --servers "APP1,APP2,DB1" --header x-backend
```
Monitors with headers: `x-backend: APP1`, `x-backend: APP2`, `x-backend: DB1`

#### Auto-Generate with Custom Prefix
```bash
node index.js --page https://example.com --duration 120 --repeatEvery 5 --serverCount 6 --serverPrefix NODE --header x-node
```
Monitors with headers: `x-node: NODE1`, `x-node: NODE2`, ..., `x-node: NODE6`

## Statistics Displayed

### During Monitoring (Live)
- Total requests per server
- Error count per server
- Average latency (all requests) per server
- Average latency (excluding slow requests >1500ms) per server
- Minimum and maximum latency per server
- Success rate per server
- Slow request count and percentage (>1500ms)
- Average and maximum slow request latency

### Final Summary
- Total requests across all servers
- Successful vs failed requests per server
- Detailed latency statistics per server
- Overall success rate
- Total slow requests across all servers
- Statistics exported to `stats.json`

### Color Coding
- **Green**: Good performance (success rate ≥95%, latency <1000ms)
- **Yellow**: Warning (success rate 80-95%, latency 1000-1500ms)
- **Red**: Issues (success rate <80%, latency >1500ms)

## How It Works

### Single Server Mode
When no server configuration is provided, the script monitors a single URL without any custom headers. This is useful for basic latency monitoring.

### Multi-Server Mode
When servers are configured (via `--servers` or `--serverCount`), the script sends staggered HTTP requests to the specified URL with custom headers. For example, with 4 servers and header name `x-server`:
- `x-server: WWW1`
- `x-server: WWW2`
- `x-server: WWW3`
- `x-server: WWW4`

Each request is sent with a random delay (100-800ms) between servers to avoid hitting all servers simultaneously. The interval between monitoring cycles is also randomized (±50% of your specified interval) to simulate more realistic traffic patterns.

These headers tell the load balancer which specific server instance to route the request to, allowing you to monitor latency for each server independently.

## Understanding Latency Measurements

**Important**: The latency measurements include the **complete round-trip time** from your machine, which consists of:

1. **WiFi/Network delay** (your device → router → ISP)
2. **Internet transit time** (ISP → server's network)
3. **Server processing time**
4. **Return path** (all the way back to your device)

This means the measurements reflect the **end-user experience** - what a real user would experience accessing the site from your location.

### For Server-Only Latency
If you want to measure pure server performance without network overhead:
- Run the script on a server in the same datacenter/network as your target servers
- Use SSH to execute it from a VPS/cloud instance close to your infrastructure
- Check server-side application logs for processing time only

### WiFi Considerations
If running on WiFi:
- Unstable WiFi signals can increase latency variance
- Consider using a wired connection for more consistent measurements
- Large fluctuations may indicate WiFi issues rather than server problems

## Output Files

### stats.json
The script automatically creates/overwrites `stats.json` with detailed statistics including:
- Timestamp of the test run
- Per-server statistics (requests, latency, success rate, slow requests)
- Average latency with and without slow requests
- Overall aggregated statistics
- Complete latency data for all requests

### slow.log
The script appends to `slow.log` whenever a request exceeds the 1500ms threshold. Each entry includes:
- Timestamp (ISO format)
- Server name (e.g., WWW1, APP1, or "default" for single server mode)
- URL being monitored
- Request header (e.g., `x-server: WWW1` or "No custom header" for single server mode)
- Latency in milliseconds
- Status (SUCCESS or ERROR)

This log file helps you correlate slow requests with server-side events by checking timestamps on your infrastructure.

## Stopping the Script

Press `Ctrl+C` to stop monitoring early. The script will display final statistics before exiting.

---

## About the Name

**ANAL** stands for **Automated Network Analysis of Latency**. Yes, we're aware of the name. Yes, it's intentional. Yes, it's memorable. 😎

When your infrastructure needs deep analysis, ANAL delivers the insights.
