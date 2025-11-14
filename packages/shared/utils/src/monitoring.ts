/**
 * Monitoring and Metrics Collection for Communication Architecture Migration
 * 
 * This module provides comprehensive monitoring for both WebSocket and SSE+HTTP
 * communication patterns during the migration period.
 */

export interface CommunicationMetrics {
  connectionCount: number;
  messagesSent: number;
  messagesReceived: number;
  connectionLatency: number;
  errorRate: number;
  reconnectionCount: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  method: 'websocket' | 'sse-http';
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
  reliability: {
    successRate: number;
    errorRate: number;
    timeoutRate: number;
  };
  scalability: {
    concurrentConnections: number;
    maxConnections: number;
    connectionSetupTime: number;
  };
}

export interface MigrationMetrics {
  phase: 'current' | 'testing' | 'production';
  websocketMetrics: CommunicationMetrics;
  sseHttpMetrics: CommunicationMetrics;
  comparison: {
    latencyImprovement: number;
    throughputImprovement: number;
    scalabilityImprovement: number;
    reliabilityImprovement: number;
  };
  timestamp: number;
}

/**
 * Communication metrics collector
 */
export class CommunicationMetricsCollector {
  private metrics: Map<string, CommunicationMetrics> = new Map();
  private startTime: number = Date.now();

  constructor(private method: 'websocket' | 'sse-http') {}

  /**
   * Record a new connection
   */
  recordConnection(latency: number): void {
    const current = this.getCurrentMetrics();
    current.connectionCount++;
    current.connectionLatency = this.updateAverage(
      current.connectionLatency, 
      latency, 
      current.connectionCount
    );
    current.timestamp = Date.now();
  }

  /**
   * Record connection closed
   */
  recordDisconnection(): void {
    const current = this.getCurrentMetrics();
    current.connectionCount = Math.max(0, current.connectionCount - 1);
    current.timestamp = Date.now();
  }

  /**
   * Record message sent
   */
  recordMessageSent(): void {
    const current = this.getCurrentMetrics();
    current.messagesSent++;
    current.timestamp = Date.now();
  }

  /**
   * Record message received
   */
  recordMessageReceived(): void {
    const current = this.getCurrentMetrics();
    current.messagesReceived++;
    current.timestamp = Date.now();
  }

  /**
   * Record an error
   */
  recordError(): void {
    const current = this.getCurrentMetrics();
    const totalMessages = current.messagesSent + current.messagesReceived;
    current.errorRate = totalMessages > 0 ? 
      (current.errorRate * totalMessages + 1) / (totalMessages + 1) : 1;
    current.timestamp = Date.now();
  }

  /**
   * Record a reconnection
   */
  recordReconnection(): void {
    const current = this.getCurrentMetrics();
    current.reconnectionCount++;
    current.timestamp = Date.now();
  }

  /**
   * Update resource usage
   */
  updateResourceUsage(memoryUsage: number, cpuUsage: number): void {
    const current = this.getCurrentMetrics();
    current.memoryUsage = memoryUsage;
    current.cpuUsage = cpuUsage;
    current.timestamp = Date.now();
  }

  /**
   * Get current metrics
   */
  getMetrics(): CommunicationMetrics {
    return { ...this.getCurrentMetrics() };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
  }

  private getCurrentMetrics(): CommunicationMetrics {
    const key = `${this.method}-${Date.now()}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        connectionCount: 0,
        messagesSent: 0,
        messagesReceived: 0,
        connectionLatency: 0,
        errorRate: 0,
        reconnectionCount: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        timestamp: Date.now()
      });
    }
    return this.metrics.get(key)!;
  }

  private updateAverage(current: number, newValue: number, count: number): number {
    return ((current * (count - 1)) + newValue) / count;
  }
}

/**
 * Performance benchmarking utility
 */
export class PerformanceBenchmark {
  private latencyMeasurements: number[] = [];
  private throughputMeasurements: number[] = [];
  private errorCount: number = 0;
  private successCount: number = 0;
  private timeoutCount: number = 0;
  private connections: number = 0;
  private maxConnections: number = 0;
  private connectionSetupTimes: number[] = [];

  constructor(private method: 'websocket' | 'sse-http') {}

  /**
   * Measure operation latency
   */
  async measureLatency<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      this.latencyMeasurements.push(latency);
      this.successCount++;
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.latencyMeasurements.push(latency);
      this.errorCount++;
      throw error;
    }
  }

  /**
   * Record throughput measurement
   */
  recordThroughput(messagesPerSecond: number, bytesPerSecond: number): void {
    this.throughputMeasurements.push(messagesPerSecond);
  }

  /**
   * Record timeout
   */
  recordTimeout(): void {
    this.timeoutCount++;
  }

  /**
   * Record connection setup
   */
  recordConnectionSetup(setupTime: number): void {
    this.connections++;
    this.maxConnections = Math.max(this.maxConnections, this.connections);
    this.connectionSetupTimes.push(setupTime);
  }

  /**
   * Record connection close
   */
  recordConnectionClose(): void {
    this.connections = Math.max(0, this.connections - 1);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const totalOperations = this.successCount + this.errorCount + this.timeoutCount;
    
    return {
      method: this.method,
      latency: {
        p50: this.percentile(this.latencyMeasurements, 0.5),
        p95: this.percentile(this.latencyMeasurements, 0.95),
        p99: this.percentile(this.latencyMeasurements, 0.99),
        avg: this.average(this.latencyMeasurements)
      },
      throughput: {
        messagesPerSecond: this.average(this.throughputMeasurements),
        bytesPerSecond: 0 // Would need actual byte measurements
      },
      reliability: {
        successRate: totalOperations > 0 ? this.successCount / totalOperations : 0,
        errorRate: totalOperations > 0 ? this.errorCount / totalOperations : 0,
        timeoutRate: totalOperations > 0 ? this.timeoutCount / totalOperations : 0
      },
      scalability: {
        concurrentConnections: this.connections,
        maxConnections: this.maxConnections,
        connectionSetupTime: this.average(this.connectionSetupTimes)
      }
    };
  }

  /**
   * Reset benchmark data
   */
  reset(): void {
    this.latencyMeasurements = [];
    this.throughputMeasurements = [];
    this.errorCount = 0;
    this.successCount = 0;
    this.timeoutCount = 0;
    this.connections = 0;
    this.maxConnections = 0;
    this.connectionSetupTimes = [];
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
}

/**
 * Migration metrics aggregator
 */
export class MigrationMetricsCollector {
  private websocketCollector = new CommunicationMetricsCollector('websocket');
  private sseHttpCollector = new CommunicationMetricsCollector('sse-http');
  private websocketBenchmark = new PerformanceBenchmark('websocket');
  private sseHttpBenchmark = new PerformanceBenchmark('sse-http');

  /**
   * Get WebSocket metrics collector
   */
  getWebSocketCollector(): CommunicationMetricsCollector {
    return this.websocketCollector;
  }

  /**
   * Get SSE+HTTP metrics collector
   */
  getSseHttpCollector(): CommunicationMetricsCollector {
    return this.sseHttpCollector;
  }

  /**
   * Get WebSocket benchmark
   */
  getWebSocketBenchmark(): PerformanceBenchmark {
    return this.websocketBenchmark;
  }

  /**
   * Get SSE+HTTP benchmark
   */
  getSseHttpBenchmark(): PerformanceBenchmark {
    return this.sseHttpBenchmark;
  }

  /**
   * Generate migration comparison metrics
   */
  getMigrationMetrics(): MigrationMetrics {
    const websocketMetrics = this.websocketCollector.getMetrics();
    const sseHttpMetrics = this.sseHttpCollector.getMetrics();
    const websocketPerf = this.websocketBenchmark.getMetrics();
    const sseHttpPerf = this.sseHttpBenchmark.getMetrics();

    return {
      phase: this.getCurrentPhase(),
      websocketMetrics,
      sseHttpMetrics,
      comparison: {
        latencyImprovement: this.calculateImprovement(
          websocketPerf.latency.avg, 
          sseHttpPerf.latency.avg
        ),
        throughputImprovement: this.calculateImprovement(
          websocketPerf.throughput.messagesPerSecond,
          sseHttpPerf.throughput.messagesPerSecond
        ),
        scalabilityImprovement: this.calculateImprovement(
          websocketPerf.scalability.maxConnections,
          sseHttpPerf.scalability.maxConnections
        ),
        reliabilityImprovement: this.calculateImprovement(
          websocketPerf.reliability.successRate,
          sseHttpPerf.reliability.successRate
        )
      },
      timestamp: Date.now()
    };
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify(this.getMigrationMetrics(), null, 2);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.websocketCollector.reset();
    this.sseHttpCollector.reset();
    this.websocketBenchmark.reset();
    this.sseHttpBenchmark.reset();
  }

  private getCurrentPhase(): 'current' | 'testing' | 'production' {
    const phase = process.env.MIGRATION_PHASE as 'current' | 'testing' | 'production';
    return phase || 'current';
  }

  private calculateImprovement(baseline: number, current: number): number {
    if (baseline === 0) return current > 0 ? 100 : 0;
    return ((current - baseline) / baseline) * 100;
  }
}

/**
 * Monitoring middleware for HTTP requests
 */
export function createHttpMonitoringMiddleware(collector: CommunicationMetricsCollector) {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    // Record request
    collector.recordMessageReceived();
    
    // Monitor response
    res.on('finish', () => {
      const latency = Date.now() - startTime;
      collector.recordMessageSent();
      
      if (res.statusCode >= 400) {
        collector.recordError();
      }
    });
    
    next();
  };
}

/**
 * Create monitoring logger
 */
export function createMetricsLogger(logger: any, collector: MigrationMetricsCollector) {
  return {
    logMetrics: () => {
      const metrics = collector.getMigrationMetrics();
      logger.info({
        migrationMetrics: metrics,
        timestamp: new Date(metrics.timestamp).toISOString()
      }, 'Communication architecture migration metrics');
    },
    
    logComparison: () => {
      const metrics = collector.getMigrationMetrics();
      logger.info({
        phase: metrics.phase,
        improvements: metrics.comparison,
        websocketConnections: metrics.websocketMetrics.connectionCount,
        sseHttpConnections: metrics.sseHttpMetrics.connectionCount
      }, 'Migration performance comparison');
    }
  };
}

// Global metrics collector instance
export const globalMetricsCollector = new MigrationMetricsCollector();