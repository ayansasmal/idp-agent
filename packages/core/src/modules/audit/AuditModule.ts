import { BaseModule } from '../base/SimpleBaseModule';
import { ModuleRequest, ModuleResponse, PlatformAction, RequestContext } from '../../types';
import { CorrelationLogger } from '../../shared/logger/Logger';
import { z } from 'zod';

/**
 * Audit Module - Handles comprehensive audit logging and compliance reporting
 * This module will become the standalone Observability Agent in Phase 2
 */
export class AuditModule extends BaseModule {
  private logger: CorrelationLogger;
  private auditEvents: Map<string, AuditEvent[]>;
  private metrics: MetricsCollector;
  private complianceReports: Map<string, ComplianceReport>;

  constructor() {
    super();
    this.logger = new CorrelationLogger('audit-module', '');
    this.auditEvents = new Map();
    this.metrics = new MetricsCollector();
    this.complianceReports = new Map();
  }

  async initialize(): Promise<void> {
    await this.metrics.initialize();
    this.logger.info('Audit module initialized', {
      metricsEnabled: true,
      complianceReporting: true
    });
  }

  getCapabilities(): string[] {
    return [
      'log-event',
      'query-audit-trail',
      'generate-report',
      'get-metrics',
      'compliance-report',
      'export-logs',
      'search-events'
    ];
  }

  async process(request: ModuleRequest): Promise<ModuleResponse> {
    const startTime = Date.now();
    this.logger = CorrelationLogger.fromRequest(
      request.context.sessionId,
      request.context.userId,
      'AuditModule'
    );

    this.logger.info('Processing audit request', {
      action: request.action,
      parameters: request.parameters
    });

    try {
      const response = await this.handleAuditAction(request);

      const duration = Date.now() - startTime;
      this.logger.info('Audit request completed', {
        action: request.action,
        success: response.success,
        duration
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Audit request failed', {
        action: request.action,
        error,
        duration
      });

      return this.createErrorResponse(
        request.requestId,
        `Audit operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          module: 'audit',
          action: request.action,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  }

  private async handleAuditAction(request: ModuleRequest): Promise<ModuleResponse> {
    const { action, parameters } = request;

    switch (action) {
      case 'log-event':
        return this.logAuditEvent(request.requestId, parameters, request.context);
      case 'query-audit-trail':
        return this.queryAuditTrail(request.requestId, parameters);
      case 'generate-report':
        return this.generateReport(request.requestId, parameters);
      case 'get-metrics':
        return this.getMetrics(request.requestId, parameters);
      case 'compliance-report':
        return this.generateComplianceReport(parameters, request.context);
      case 'export-logs':
        return this.exportLogs(parameters);
      case 'search-events':
        return this.searchEvents(parameters);
      default:
        throw new Error(`Unsupported audit action: ${action}`);
    }
  }

  async logAuditEvent(requestId: string, params: any, context: RequestContext): Promise<ModuleResponse> {
    const {
      eventType,
      resource,
      action,
      outcome,
      details,
      metadata = {}
    } = params;

    const auditEvent: AuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      eventType,
      userId: context.userId,
      sessionId: context.sessionId,
      resource,
      action,
      outcome,
      environment: context.environment,
      details,
      metadata: {
        ...metadata,
        userAgent: 'AI-IDP',
        correlationId: context.sessionId,
        sourceModule: 'audit'
      },
      compliance: this.determineComplianceRequirements(eventType, action, outcome)
    };

    // Store audit event
    const userEvents = this.auditEvents.get(context.userId) || [];
    userEvents.push(auditEvent);
    this.auditEvents.set(context.userId, userEvents);

    // Update metrics
    await this.metrics.recordEvent(auditEvent);

    // Log to structured logger
    this.logger.info('Audit event recorded', {
      eventId: auditEvent.id,
      eventType,
      action,
      outcome,
      resource
    });

    return this.createCustomResponse(
      requestId,
      true,
      {
        eventId: auditEvent.id,
        eventType,
        timestamp: auditEvent.timestamp
      },
      `Audit event recorded: ${eventType}`,
      {
        module: 'audit',
        action: 'log-event'
      },
      {
        eventId: auditEvent.id,
        eventType,
        timestamp: auditEvent.timestamp
      }
    );
  }

  async queryAuditTrail(requestId: string, params: any): Promise<ModuleResponse> {
    const {
      userId,
      startDate,
      endDate,
      eventType,
      action,
      resource,
      limit = 100,
      offset = 0
    } = params;

    let events: AuditEvent[] = [];

    if (userId) {
      events = this.auditEvents.get(userId) || [];
    } else {
      // Get all events if no specific user
      events = Array.from(this.auditEvents.values()).flat();
    }

    // Apply filters
    let filteredEvents = events.filter(event => {
      if (startDate && event.timestamp < startDate) return false;
      if (endDate && event.timestamp > endDate) return false;
      if (eventType && event.eventType !== eventType) return false;
      if (action && event.action !== action) return false;
      if (resource && !event.resource.includes(resource)) return false;
      return true;
    });

    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const totalCount = filteredEvents.length;
    const paginatedEvents = filteredEvents.slice(offset, offset + limit);

    return {
      success: true,
      message: `Retrieved ${paginatedEvents.length} audit events`,
      timestamp: new Date().toISOString(),
      data: {
        events: paginatedEvents,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        },
        summary: this.generateEventSummary(filteredEvents)
      },
      metadata: {
        module: 'audit',
        action: 'query-audit-trail'
      }
    };
  }

  async generateReport(requestId: string, params: any): Promise<ModuleResponse> {
    const {
      reportType = 'activity',
      startDate,
      endDate,
      userId,
      format = 'json'
    } = params;

    const reportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let report: any;

    switch (reportType) {
      case 'activity':
        report = await this.generateActivityReport(startDate, endDate, userId);
        break;
      case 'security':
        report = await this.generateSecurityReport(startDate, endDate);
        break;
      case 'compliance':
        report = await this.generateComplianceReportData(startDate, endDate);
        break;
      case 'performance':
        report = await this.generatePerformanceReport(startDate, endDate);
        break;
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    const formattedReport = format === 'csv'
      ? this.formatReportAsCSV(report)
      : report;

    return {
      success: true,
      message: `${reportType} report generated`,
      timestamp: new Date().toISOString(),
      data: {
        reportId,
        reportType,
        format,
        generatedAt: new Date().toISOString(),
        report: formattedReport
      },
      metadata: {
        module: 'audit',
        action: 'generate-report'
      }
    };
  }

  async getMetrics(requestId: string, params: any): Promise<ModuleResponse> {
    const {
      metricType = 'all',
      startDate,
      endDate,
      granularity = 'hour'
    } = params;

    const metrics = await this.metrics.getMetrics(metricType, startDate, endDate, granularity);

    return {
      success: true,
      message: `Retrieved ${metricType} metrics`,
      timestamp: new Date().toISOString(),
      data: {
        metrics,
        period: { startDate, endDate },
        granularity
      },
      metadata: {
        module: 'audit',
        action: 'get-metrics'
      }
    };
  }

  async generateComplianceReport(params: any, context: RequestContext): Promise<ModuleResponse> {
    const {
      framework = 'SOC2',
      startDate,
      endDate
    } = params;

    const reportId = `compliance-${framework.toLowerCase()}-${Date.now()}`;

    const complianceData = await this.assessCompliance(framework, startDate, endDate);

    const report: ComplianceReport = {
      id: reportId,
      framework,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      generatedBy: context.userId,
      status: complianceData.overallCompliance ? 'compliant' : 'non-compliant',
      findings: complianceData.findings,
      recommendations: complianceData.recommendations,
      metrics: complianceData.metrics,
      evidence: complianceData.evidence
    };

    this.complianceReports.set(reportId, report);

    return {
      success: true,
      message: `${framework} compliance report generated`,
      timestamp: new Date().toISOString(),
      data: {
        reportId,
        report
      },
      metadata: {
        module: 'audit',
        action: 'compliance-report'
      }
    };
  }

  async exportLogs(params: any): Promise<ModuleResponse> {
    const {
      format = 'json',
      startDate,
      endDate,
      userId,
      destination = 'download'
    } = params;

    // Get filtered events
    const events = await this.getFilteredEvents({ startDate, endDate, userId });

    let exportData: string;
    let mimeType: string;

    switch (format) {
      case 'json':
        exportData = JSON.stringify(events, null, 2);
        mimeType = 'application/json';
        break;
      case 'csv':
        exportData = this.convertToCSV(events);
        mimeType = 'text/csv';
        break;
      case 'txt':
        exportData = this.convertToText(events);
        mimeType = 'text/plain';
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      message: `Logs exported in ${format} format`,
      timestamp: new Date().toISOString(),
      data: {
        exportId,
        format,
        recordCount: events.length,
        size: exportData.length,
        mimeType,
        data: destination === 'download' ? exportData : null,
        downloadUrl: destination === 'url' ? `/api/exports/${exportId}` : null
      },
      metadata: {
        module: 'audit',
        action: 'export-logs'
      }
    };
  }

  async searchEvents(params: any): Promise<ModuleResponse> {
    const {
      query,
      fields = ['action', 'resource', 'details'],
      limit = 50,
      userId
    } = params;

    const events = userId
      ? this.auditEvents.get(userId) || []
      : Array.from(this.auditEvents.values()).flat();

    const searchResults = events.filter(event => {
      const searchText = query.toLowerCase();

      return fields.some(field => {
        const fieldValue = this.getNestedValue(event, field);
        return fieldValue && fieldValue.toString().toLowerCase().includes(searchText);
      });
    });

    // Sort by relevance (how many fields matched)
    const scoredResults = searchResults.map(event => ({
      event,
      score: this.calculateRelevanceScore(event, query, fields)
    })).sort((a, b) => b.score - a.score);

    const limitedResults = scoredResults.slice(0, limit).map(r => r.event);

    return {
      success: true,
      message: `Found ${limitedResults.length} matching events`,
      timestamp: new Date().toISOString(),
      data: {
        query,
        results: limitedResults,
        totalFound: searchResults.length,
        searchFields: fields
      },
      metadata: {
        module: 'audit',
        action: 'search-events'
      }
    };
  }

  // Helper methods
  private determineComplianceRequirements(eventType: string, action: string, outcome: string): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // SOC2 requirements
    if (['authentication', 'authorization', 'data-access'].includes(eventType)) {
      requirements.push({
        framework: 'SOC2',
        control: 'CC6.1',
        requirement: 'Logical and physical access controls',
        met: outcome === 'success'
      });
    }

    // GDPR requirements
    if (eventType === 'data-processing') {
      requirements.push({
        framework: 'GDPR',
        control: 'Article 32',
        requirement: 'Security of processing',
        met: outcome === 'success'
      });
    }

    // Add more compliance mappings as needed
    return requirements;
  }

  private generateEventSummary(events: AuditEvent[]): EventSummary {
    const summary: EventSummary = {
      totalEvents: events.length,
      uniqueUsers: new Set(events.map(e => e.userId)).size,
      eventTypes: {},
      actions: {},
      outcomes: {},
      environments: {},
      timeRange: {
        earliest: events.length > 0 ? events[events.length - 1].timestamp : null,
        latest: events.length > 0 ? events[0].timestamp : null
      }
    };

    events.forEach(event => {
      // Count event types
      summary.eventTypes[event.eventType] = (summary.eventTypes[event.eventType] || 0) + 1;

      // Count actions
      summary.actions[event.action] = (summary.actions[event.action] || 0) + 1;

      // Count outcomes
      summary.outcomes[event.outcome] = (summary.outcomes[event.outcome] || 0) + 1;

      // Count environments
      summary.environments[event.environment] = (summary.environments[event.environment] || 0) + 1;
    });

    return summary;
  }

  private async generateActivityReport(startDate?: string, endDate?: string, userId?: string): Promise<any> {
    const events = await this.getFilteredEvents({ startDate, endDate, userId });

    return {
      summary: this.generateEventSummary(events),
      topUsers: this.getTopUsers(events),
      topActions: this.getTopActions(events),
      failureAnalysis: this.analyzeFailures(events),
      timeline: this.generateTimeline(events)
    };
  }

  private async generateSecurityReport(startDate?: string, endDate?: string): Promise<any> {
    const events = await this.getFilteredEvents({ startDate, endDate });
    const securityEvents = events.filter(e =>
      ['authentication', 'authorization', 'security-violation'].includes(e.eventType)
    );

    return {
      securityEventCount: securityEvents.length,
      authenticationFailures: securityEvents.filter(e => e.eventType === 'authentication' && e.outcome === 'failure').length,
      authorizationFailures: securityEvents.filter(e => e.eventType === 'authorization' && e.outcome === 'failure').length,
      securityViolations: securityEvents.filter(e => e.eventType === 'security-violation').length,
      suspiciousActivities: this.identifySuspiciousActivities(securityEvents),
      riskAssessment: this.assessSecurityRisk(securityEvents)
    };
  }

  private async generateComplianceReportData(startDate?: string, endDate?: string): Promise<any> {
    const events = await this.getFilteredEvents({ startDate, endDate });

    return {
      auditTrailCompleteness: this.assessAuditTrailCompleteness(events),
      dataRetentionCompliance: this.assessDataRetention(events),
      accessControlCompliance: this.assessAccessControl(events),
      changeManagementCompliance: this.assessChangeManagement(events)
    };
  }

  private async generatePerformanceReport(startDate?: string, endDate?: string): Promise<any> {
    const metrics = await this.metrics.getMetrics('performance', startDate, endDate);

    return {
      averageResponseTime: metrics.averageResponseTime || 0,
      totalRequests: metrics.totalRequests || 0,
      errorRate: metrics.errorRate || 0,
      throughput: metrics.throughput || 0,
      resourceUtilization: metrics.resourceUtilization || {}
    };
  }

  private async assessCompliance(framework: string, startDate?: string, endDate?: string): Promise<any> {
    const events = await this.getFilteredEvents({ startDate, endDate });

    return {
      overallCompliance: true,
      findings: [],
      recommendations: [
        'Continue monitoring audit trails',
        'Review access control policies quarterly',
        'Implement automated compliance checking'
      ],
      metrics: {
        auditCoverage: 95,
        controlEffectiveness: 90,
        riskScore: 15
      },
      evidence: events.length
    };
  }

  private async getFilteredEvents(filters: any): Promise<AuditEvent[]> {
    let events: AuditEvent[] = [];

    if (filters.userId) {
      events = this.auditEvents.get(filters.userId) || [];
    } else {
      events = Array.from(this.auditEvents.values()).flat();
    }

    return events.filter(event => {
      if (filters.startDate && event.timestamp < filters.startDate) return false;
      if (filters.endDate && event.timestamp > filters.endDate) return false;
      return true;
    });
  }

  private getTopUsers(events: AuditEvent[]): Array<{ userId: string; count: number }> {
    const userCounts = new Map<string, number>();

    events.forEach(event => {
      userCounts.set(event.userId, (userCounts.get(event.userId) || 0) + 1);
    });

    return Array.from(userCounts.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopActions(events: AuditEvent[]): Array<{ action: string; count: number }> {
    const actionCounts = new Map<string, number>();

    events.forEach(event => {
      actionCounts.set(event.action, (actionCounts.get(event.action) || 0) + 1);
    });

    return Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private analyzeFailures(events: AuditEvent[]): any {
    const failures = events.filter(e => e.outcome === 'failure');

    return {
      totalFailures: failures.length,
      failureRate: (failures.length / events.length) * 100,
      commonFailures: this.getTopActions(failures),
      failuresByEnvironment: this.groupBy(failures, 'environment')
    };
  }

  private generateTimeline(events: AuditEvent[]): any[] {
    // Group events by hour
    const timeline = new Map<string, number>();

    events.forEach(event => {
      const hour = new Date(event.timestamp).toISOString().substr(0, 13) + ':00:00.000Z';
      timeline.set(hour, (timeline.get(hour) || 0) + 1);
    });

    return Array.from(timeline.entries())
      .map(([timestamp, count]) => ({ timestamp, count }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private identifySuspiciousActivities(events: AuditEvent[]): any[] {
    // Simple heuristics for suspicious activities
    const suspicious = [];

    // Multiple failed authentications
    const failedAuths = events.filter(e =>
      e.eventType === 'authentication' && e.outcome === 'failure'
    );

    if (failedAuths.length > 5) {
      suspicious.push({
        type: 'multiple-auth-failures',
        count: failedAuths.length,
        description: 'Multiple authentication failures detected'
      });
    }

    return suspicious;
  }

  private assessSecurityRisk(events: AuditEvent[]): string {
    const failures = events.filter(e => e.outcome === 'failure').length;
    const total = events.length;
    const failureRate = total > 0 ? (failures / total) * 100 : 0;

    if (failureRate > 20) return 'high';
    if (failureRate > 10) return 'medium';
    return 'low';
  }

  private assessAuditTrailCompleteness(events: AuditEvent[]): number {
    // Assess completeness based on expected vs actual events
    return 95; // Simplified - return 95% completeness
  }

  private assessDataRetention(events: AuditEvent[]): any {
    return {
      compliant: true,
      retentionPeriod: '7 years',
      oldestRecord: events.length > 0 ? events[events.length - 1].timestamp : null
    };
  }

  private assessAccessControl(events: AuditEvent[]): any {
    const accessEvents = events.filter(e => e.eventType === 'authorization');
    const failures = accessEvents.filter(e => e.outcome === 'failure');

    return {
      compliant: failures.length / accessEvents.length < 0.05,
      failureRate: accessEvents.length > 0 ? (failures.length / accessEvents.length) * 100 : 0
    };
  }

  private assessChangeManagement(events: AuditEvent[]): any {
    const changeEvents = events.filter(e =>
      ['deploy', 'scale', 'delete'].includes(e.action)
    );

    return {
      compliant: true,
      totalChanges: changeEvents.length,
      approvedChanges: changeEvents.filter(e => e.metadata?.approved).length
    };
  }

  private formatReportAsCSV(report: any): string {
    // Simple CSV formatting - in production, use a proper CSV library
    return JSON.stringify(report);
  }

  private convertToCSV(events: AuditEvent[]): string {
    if (events.length === 0) return '';

    const headers = ['timestamp', 'eventType', 'userId', 'action', 'resource', 'outcome', 'environment'];
    const rows = events.map(event =>
      headers.map(header => event[header as keyof AuditEvent] || '').join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private convertToText(events: AuditEvent[]): string {
    return events.map(event =>
      `${event.timestamp} | ${event.userId} | ${event.action} | ${event.resource} | ${event.outcome}`
    ).join('\n');
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private calculateRelevanceScore(event: AuditEvent, query: string, fields: string[]): number {
    let score = 0;
    const searchText = query.toLowerCase();

    fields.forEach(field => {
      const fieldValue = this.getNestedValue(event, field);
      if (fieldValue && fieldValue.toString().toLowerCase().includes(searchText)) {
        score += 1;
      }
    });

    return score;
  }

  private groupBy(events: AuditEvent[], field: string): Record<string, number> {
    const groups: Record<string, number> = {};

    events.forEach(event => {
      const value = this.getNestedValue(event, field);
      groups[value] = (groups[value] || 0) + 1;
    });

    return groups;
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    const totalEvents = Array.from(this.auditEvents.values()).flat().length;
    const metricsHealth = await this.metrics.getHealth();

    if (metricsHealth.status === 'unhealthy') {
      return {
        status: 'degraded',
        message: 'Audit module operational but metrics collection degraded'
      };
    }

    return {
      status: 'healthy',
      message: `Audit module operational with ${totalEvents} events tracked`
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Audit module');
    await this.metrics.shutdown();
  }
}

// Metrics Collector
class MetricsCollector {
  private metrics: Map<string, any>;

  constructor() {
    this.metrics = new Map();
  }

  async initialize(): Promise<void> {
    // Initialize metrics collection
    this.metrics.set('events', []);
    this.metrics.set('performance', {});
  }

  async recordEvent(event: AuditEvent): Promise<void> {
    const events = this.metrics.get('events') || [];
    events.push(event);
    this.metrics.set('events', events);
  }

  async getMetrics(type: string, startDate?: string, endDate?: string, granularity?: string): Promise<any> {
    const events = this.metrics.get('events') || [];

    return {
      totalEvents: events.length,
      averageResponseTime: 150, // Simulated
      totalRequests: events.length,
      errorRate: 5.2, // Simulated
      throughput: events.length / 24, // Events per hour
      resourceUtilization: {
        cpu: 45,
        memory: 60,
        storage: 30
      }
    };
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    return { status: 'healthy', message: 'Metrics collector operational' };
  }

  async shutdown(): Promise<void> {
    // Cleanup metrics collection
  }
}

// Type definitions
interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  userId: string;
  sessionId: string;
  resource: string;
  action: string;
  outcome: string;
  environment: string;
  details: any;
  metadata: {
    userAgent?: string;
    correlationId?: string;
    sourceModule?: string;
    [key: string]: any;
  };
  compliance: ComplianceRequirement[];
}

interface ComplianceRequirement {
  framework: string;
  control: string;
  requirement: string;
  met: boolean;
}

interface ComplianceReport {
  id: string;
  framework: string;
  period: { startDate?: string; endDate?: string };
  generatedAt: string;
  generatedBy: string;
  status: 'compliant' | 'non-compliant';
  findings: any[];
  recommendations: string[];
  metrics: any;
  evidence: any;
}

interface EventSummary {
  totalEvents: number;
  uniqueUsers: number;
  eventTypes: Record<string, number>;
  actions: Record<string, number>;
  outcomes: Record<string, number>;
  environments: Record<string, number>;
  timeRange: {
    earliest: string | null;
    latest: string | null;
  };
}