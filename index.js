#!/usr/bin/env node

const axios = require('axios');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// Set output directory (Docker uses /app/output, local uses current dir)
const OUTPUT_DIR = process.env.OUTPUT_DIR || '.';

const argv = yargs(hideBin(process.argv))
  .option('page', {
    alias: 'p',
    type: 'string',
    description: 'URL of the page to monitor',
    demandOption: true
  })
  .option('duration', {
    alias: 'd',
    type: 'number',
    description: 'Duration in seconds',
    demandOption: true
  })
  .option('repeatEvery', {
    alias: 'r',
    type: 'number',
    description: 'Repeat every N seconds',
    demandOption: true
  })
  .option('header', {
    alias: 'H',
    type: 'string',
    description: 'Custom header name for load balancer routing'
  })
  .option('servers', {
    alias: 's',
    type: 'string',
    description: 'Comma-separated list of server values (e.g., "WWW1,WWW2,APP1")'
  })
  .option('serverCount', {
    alias: 'c',
    type: 'number',
    description: 'Auto-generate N servers with prefix'
  })
  .option('serverPrefix', {
    alias: 'P',
    type: 'string',
    description: 'Prefix for auto-generated servers (default: "WWW")',
    default: 'WWW'
  })
  .help()
  .alias('help', 'h')
  .argv;

// Configure servers based on parameters
let SERVERS;
let HEADER_NAME;

if (argv.servers) {
  // Use explicit server list
  SERVERS = argv.servers.split(',').map(s => s.trim());
} else if (argv.serverCount) {
  // Auto-generate servers with prefix
  SERVERS = Array.from({ length: argv.serverCount }, (_, i) => `${argv.serverPrefix}${i + 1}`);
} else {
  // Single server mode (no special headers)
  SERVERS = ['default'];
}

// Set header name if servers are configured
if (argv.servers || argv.serverCount) {
  HEADER_NAME = argv.header || 'x-server';
} else {
  HEADER_NAME = null;
}

const SLOW_THRESHOLD = 1500;

// Initialize stats dynamically based on server list
const stats = {};
SERVERS.forEach(server => {
  stats[server] = {
    requests: 0,
    totalLatency: 0,
    errors: 0,
    latencies: [],
    slowRequests: 0,
    slowLatencies: [],
    normalLatencies: []
  };
});

function logSlowRequest(url, server, latency, timestamp, error = false) {
  const logEntry = {
    timestamp: timestamp.toISOString(),
    server,
    url,
    latency: `${latency}ms`,
    status: error ? 'ERROR' : 'SUCCESS',
    header: HEADER_NAME ? `${HEADER_NAME}: ${server}` : 'No custom header'
  };

  const logLine = `[${logEntry.timestamp}] ${logEntry.server} | ${logEntry.url} | ${logEntry.header} | Latency: ${logEntry.latency} | Status: ${logEntry.status}\n`;

  try {
    fs.appendFileSync(path.join(OUTPUT_DIR, 'slow.log'), logLine);
  } catch (err) {
    console.error(chalk.red('Failed to write to slow.log:'), err.message);
  }
}

async function checkLatency(url, server) {
  const startTime = Date.now();
  const requestTime = new Date();

  try {
    const requestConfig = { timeout: 30000 };

    // Only add custom header if configured
    if (HEADER_NAME) {
      requestConfig.headers = {
        [HEADER_NAME]: server
      };
    }

    await axios.get(url, requestConfig);
    const latency = Date.now() - startTime;
    stats[server].requests++;
    stats[server].totalLatency += latency;
    stats[server].latencies.push(latency);

    if (latency > SLOW_THRESHOLD) {
      stats[server].slowRequests++;
      stats[server].slowLatencies.push(latency);
      logSlowRequest(url, server, latency, requestTime, false);
    } else {
      stats[server].normalLatencies.push(latency);
    }

    return { server, latency, error: false };
  } catch (error) {
    const latency = Date.now() - startTime;
    stats[server].requests++;
    stats[server].errors++;
    stats[server].latencies.push(latency);

    if (latency > SLOW_THRESHOLD) {
      stats[server].slowRequests++;
      stats[server].slowLatencies.push(latency);
      logSlowRequest(url, server, latency, requestTime, true);
    } else {
      stats[server].normalLatencies.push(latency);
    }

    return { server, latency, error: true, errorMessage: error.message };
  }
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function runStaggeredChecks(url) {
  const results = [];

  for (const server of SERVERS) {
    const delayMs = getRandomDelay(100, 800);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const promise = checkLatency(url, server);
    results.push(promise);
  }

  return await Promise.all(results);
}

function calculateStats(serverStats) {
  if (serverStats.requests === 0) {
    return {
      avgLatency: 0,
      avgLatencyWithoutSlow: 0,
      minLatency: 0,
      maxLatency: 0,
      successRate: 0,
      slowRequestPercentage: 0,
      avgSlowLatency: 0,
      maxSlowLatency: 0
    };
  }

  const latencies = serverStats.latencies;
  const slowLatencies = serverStats.slowLatencies;
  const normalLatencies = serverStats.normalLatencies;

  return {
    avgLatency: (serverStats.totalLatency / serverStats.requests).toFixed(2),
    avgLatencyWithoutSlow: normalLatencies.length > 0 ? (normalLatencies.reduce((a, b) => a + b, 0) / normalLatencies.length).toFixed(2) : 0,
    minLatency: Math.min(...latencies),
    maxLatency: Math.max(...latencies),
    successRate: (((serverStats.requests - serverStats.errors) / serverStats.requests) * 100).toFixed(2),
    slowRequestPercentage: ((serverStats.slowRequests / serverStats.requests) * 100).toFixed(2),
    avgSlowLatency: slowLatencies.length > 0 ? (slowLatencies.reduce((a, b) => a + b, 0) / slowLatencies.length).toFixed(2) : 0,
    maxSlowLatency: slowLatencies.length > 0 ? Math.max(...slowLatencies) : 0
  };
}

function displayStats() {
  // Only clear in interactive terminals (not in Docker logs)
  if (process.stdout.isTTY) {
    console.clear();
  } else {
    console.log('\n' + '='.repeat(80));
  }

  console.log(chalk.cyan('='.repeat(80)));
  console.log(chalk.cyan.bold('LATENCY MONITORING - LIVE STATISTICS'));
  console.log(chalk.cyan('='.repeat(80)));
  console.log();

  SERVERS.forEach(server => {
    const serverStats = stats[server];
    const calculated = calculateStats(serverStats);

    console.log(chalk.yellow.bold(`${server}:`));
    console.log(`  Requests: ${chalk.white(serverStats.requests)} | Errors: ${serverStats.errors > 0 ? chalk.red(serverStats.errors) : chalk.green(serverStats.errors)}`);

    const avgLatency = parseFloat(calculated.avgLatency);
    const avgColor = avgLatency > SLOW_THRESHOLD ? chalk.red : avgLatency > 1000 ? chalk.yellow : chalk.green;
    console.log(`  Avg Latency (all): ${avgColor(calculated.avgLatency + 'ms')} | Min: ${chalk.green(calculated.minLatency + 'ms')} | Max: ${calculated.maxLatency > SLOW_THRESHOLD ? chalk.red(calculated.maxLatency + 'ms') : chalk.yellow(calculated.maxLatency + 'ms')}`);

    const avgLatencyWithoutSlow = parseFloat(calculated.avgLatencyWithoutSlow);
    const avgWithoutSlowColor = avgLatencyWithoutSlow > 1000 ? chalk.yellow : avgLatencyWithoutSlow > 0 ? chalk.green : chalk.gray;
    console.log(`  Avg Latency (without slow): ${avgWithoutSlowColor(calculated.avgLatencyWithoutSlow + 'ms')}`);

    const successRate = parseFloat(calculated.successRate);
    const successColor = successRate >= 95 ? chalk.green : successRate >= 80 ? chalk.yellow : chalk.red;
    console.log(`  Success Rate: ${successColor(calculated.successRate + '%')}`);

    const slowColor = serverStats.slowRequests > 0 ? chalk.red : chalk.green;
    console.log(slowColor(`  Slow Requests (>${SLOW_THRESHOLD}ms): ${serverStats.slowRequests} (${calculated.slowRequestPercentage}%)`));
    console.log(slowColor(`  Avg Slow Latency: ${calculated.avgSlowLatency}ms | Max Slow: ${calculated.maxSlowLatency}ms`));

    console.log();
  });

  console.log(chalk.gray('Press Ctrl+C to stop monitoring'));
  console.log(chalk.cyan('='.repeat(80)));
}

function displayFinalStats() {
  console.log('\n');
  console.log(chalk.green('='.repeat(80)));
  console.log(chalk.green.bold('FINAL STATISTICS'));
  console.log(chalk.green('='.repeat(80)));
  console.log();

  let totalRequests = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  let totalSlowRequests = 0;

  SERVERS.forEach(server => {
    const serverStats = stats[server];
    const calculated = calculateStats(serverStats);

    totalRequests += serverStats.requests;
    totalErrors += serverStats.errors;
    totalLatency += serverStats.totalLatency;
    totalSlowRequests += serverStats.slowRequests;

    console.log(chalk.yellow.bold(`${server}:`));
    console.log(`  Total Requests: ${chalk.white(serverStats.requests)}`);
    console.log(`  Successful: ${chalk.green(serverStats.requests - serverStats.errors)} | Failed: ${serverStats.errors > 0 ? chalk.red(serverStats.errors) : chalk.green(serverStats.errors)}`);

    const avgLatency = parseFloat(calculated.avgLatency);
    const avgColor = avgLatency > SLOW_THRESHOLD ? chalk.red : avgLatency > 1000 ? chalk.yellow : chalk.green;
    console.log(`  Average Latency (all): ${avgColor(calculated.avgLatency + 'ms')}`);

    const avgLatencyWithoutSlow = parseFloat(calculated.avgLatencyWithoutSlow);
    const avgWithoutSlowColor = avgLatencyWithoutSlow > 1000 ? chalk.yellow : avgLatencyWithoutSlow > 0 ? chalk.green : chalk.gray;
    console.log(`  Average Latency (without slow): ${avgWithoutSlowColor(calculated.avgLatencyWithoutSlow + 'ms')}`);

    console.log(`  Min Latency: ${chalk.green(calculated.minLatency + 'ms')}`);
    console.log(`  Max Latency: ${calculated.maxLatency > SLOW_THRESHOLD ? chalk.red(calculated.maxLatency + 'ms') : chalk.yellow(calculated.maxLatency + 'ms')}`);

    const successRate = parseFloat(calculated.successRate);
    const successColor = successRate >= 95 ? chalk.green : successRate >= 80 ? chalk.yellow : chalk.red;
    console.log(`  Success Rate: ${successColor(calculated.successRate + '%')}`);

    const slowColor = serverStats.slowRequests > 0 ? chalk.red : chalk.green;
    console.log(slowColor(`  Slow Requests (>${SLOW_THRESHOLD}ms): ${serverStats.slowRequests} (${calculated.slowRequestPercentage}%)`));
    console.log(slowColor(`  Avg Slow Latency: ${calculated.avgSlowLatency}ms | Max Slow: ${calculated.maxSlowLatency}ms`));

    console.log();
  });

  console.log(chalk.magenta.bold('OVERALL:'));
  console.log(`  Total Requests: ${chalk.white(totalRequests)}`);
  console.log(`  Total Successful: ${chalk.green(totalRequests - totalErrors)}`);
  console.log(`  Total Failed: ${totalErrors > 0 ? chalk.red(totalErrors) : chalk.green(totalErrors)}`);

  const overallAvgLatency = totalRequests > 0 ? (totalLatency / totalRequests).toFixed(2) : 0;
  const overallAvgColor = overallAvgLatency > SLOW_THRESHOLD ? chalk.red : overallAvgLatency > 1000 ? chalk.yellow : chalk.green;
  console.log(`  Average Latency: ${overallAvgColor(overallAvgLatency + 'ms')}`);

  const overallSuccessRate = totalRequests > 0 ? (((totalRequests - totalErrors) / totalRequests) * 100).toFixed(2) : 0;
  const overallSuccessColor = overallSuccessRate >= 95 ? chalk.green : overallSuccessRate >= 80 ? chalk.yellow : chalk.red;
  console.log(`  Overall Success Rate: ${overallSuccessColor(overallSuccessRate + '%')}`);

  const slowPercentage = totalRequests > 0 ? ((totalSlowRequests / totalRequests) * 100).toFixed(2) : 0;
  console.log(`  Total Slow Requests: ${totalSlowRequests > 0 ? chalk.red(totalSlowRequests) : chalk.green(totalSlowRequests)} (${slowPercentage}%)`);
  console.log(chalk.green('='.repeat(80)));
}

function exportStatsToJson() {
  const exportData = {
    timestamp: new Date().toISOString(),
    threshold: SLOW_THRESHOLD,
    servers: {}
  };

  let totalRequests = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  let totalSlowRequests = 0;

  SERVERS.forEach(server => {
    const serverStats = stats[server];
    const calculated = calculateStats(serverStats);

    totalRequests += serverStats.requests;
    totalErrors += serverStats.errors;
    totalLatency += serverStats.totalLatency;
    totalSlowRequests += serverStats.slowRequests;

    exportData.servers[server] = {
      requests: serverStats.requests,
      successful: serverStats.requests - serverStats.errors,
      failed: serverStats.errors,
      avgLatency: parseFloat(calculated.avgLatency),
      avgLatencyWithoutSlow: parseFloat(calculated.avgLatencyWithoutSlow),
      minLatency: calculated.minLatency,
      maxLatency: calculated.maxLatency,
      successRate: parseFloat(calculated.successRate),
      slowRequests: serverStats.slowRequests,
      slowRequestPercentage: parseFloat(calculated.slowRequestPercentage),
      avgSlowLatency: parseFloat(calculated.avgSlowLatency),
      maxSlowLatency: calculated.maxSlowLatency,
      allLatencies: serverStats.latencies
    };
  });

  exportData.overall = {
    totalRequests,
    totalSuccessful: totalRequests - totalErrors,
    totalFailed: totalErrors,
    avgLatency: totalRequests > 0 ? parseFloat((totalLatency / totalRequests).toFixed(2)) : 0,
    successRate: totalRequests > 0 ? parseFloat((((totalRequests - totalErrors) / totalRequests) * 100).toFixed(2)) : 0,
    totalSlowRequests,
    slowRequestPercentage: totalRequests > 0 ? parseFloat(((totalSlowRequests / totalRequests) * 100).toFixed(2)) : 0
  };

  try {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'stats.json'), JSON.stringify(exportData, null, 2));
    console.log(chalk.green('\n✓ Statistics exported to stats.json'));
  } catch (error) {
    console.log(chalk.red('\n✗ Failed to export statistics:'), error.message);
  }
}

async function main() {
  const { page, duration, repeatEvery } = argv;

  console.log(chalk.cyan.bold('\nANAL - Automated Network Analysis of Latency'));
  console.log(chalk.cyan.bold('Starting latency monitoring...\n'));
  console.log(chalk.white(`URL: ${chalk.yellow(page)}`));
  console.log(chalk.white(`Duration: ${chalk.yellow(duration + 's')}`));
  console.log(chalk.white(`Repeat every: ${chalk.yellow(repeatEvery + 's (average, randomized)')}`));
  console.log(chalk.white(`Slow threshold: ${chalk.red('>' + SLOW_THRESHOLD + 'ms')}`));

  if (HEADER_NAME) {
    console.log(chalk.white(`Header: ${chalk.yellow(HEADER_NAME)}`));
    console.log(chalk.white(`Servers: ${chalk.yellow(SERVERS.join(', '))}`));
  } else {
    console.log(chalk.gray('Mode: Single server (no custom headers)'));
  }

  console.log();

  const startTime = Date.now();
  const endTime = startTime + (duration * 1000);
  const intervalMs = repeatEvery * 1000;

  let running = true;

  process.on('SIGINT', () => {
    running = false;
    displayFinalStats();
    exportStatsToJson();
    process.exit(0);
  });

  async function runMonitoring() {
    while (running && Date.now() < endTime) {
      const cycleStart = Date.now();

      await runStaggeredChecks(page);
      displayStats();

      const elapsed = Date.now() - cycleStart;

      const minInterval = intervalMs * 0.5;
      const maxInterval = intervalMs * 1.5;
      const randomInterval = getRandomDelay(minInterval, maxInterval);

      const waitTime = randomInterval - elapsed;

      if (waitTime > 0 && running && Date.now() + waitTime < endTime) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else if (Date.now() >= endTime) {
        break;
      }
    }
  }

  await runMonitoring();

  if (running) {
    displayFinalStats();
    exportStatsToJson();
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
