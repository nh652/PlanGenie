
import fetch from 'node-fetch';
import { CONFIG } from '../config/constants.js';
import { logError, logInfo } from '../utils/logger.js';

class HealthService {
  constructor() {
    this.healthMetrics = {
      uptime: 0,
      requestCount: 0,
      errorCount: 0,
      lastCheck: null
    };
  }

  // Increment request counter
  incrementRequestCount() {
    this.healthMetrics.requestCount++;
  }

  // Increment error counter
  incrementErrorCount() {
    this.healthMetrics.errorCount++;
  }

  // Check external API availability
  async checkExternalAPI() {
    const startTime = Date.now();
    try {
      const response = await fetch(CONFIG.JSON_URL, {
        method: 'HEAD',
        timeout: 10000 // 10 second timeout
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        logInfo('External API health check passed', {
          url: CONFIG.JSON_URL,
          responseTime,
          status: response.status
        });
        
        return {
          status: 'healthy',
          responseTime,
          statusCode: response.status,
          lastModified: response.headers.get('last-modified')
        };
      } else {
        logError('External API health check failed', null, {
          url: CONFIG.JSON_URL,
          responseTime,
          status: response.status,
          statusText: response.statusText
        });
        
        return {
          status: 'unhealthy',
          responseTime,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logError('External API health check error', error, {
        url: CONFIG.JSON_URL,
        responseTime
      });
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }
  }

  // Check memory usage
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      heapUsedPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    };
  }

  // Get CPU usage (simple approximation)
  getCPUUsage() {
    const cpus = process.cpuUsage();
    return {
      user: cpus.user,
      system: cpus.system,
      total: cpus.user + cpus.system
    };
  }

  // Comprehensive health check
  async getHealthStatus() {
    const startTime = Date.now();
    this.healthMetrics.uptime = process.uptime();
    this.healthMetrics.lastCheck = new Date().toISOString();

    try {
      // Check external API
      const externalAPIStatus = await this.checkExternalAPI();
      
      // Get system metrics
      const memory = this.getMemoryUsage();
      const cpu = this.getCPUUsage();
      
      // Calculate error rate
      const errorRate = this.healthMetrics.requestCount > 0 
        ? (this.healthMetrics.errorCount / this.healthMetrics.requestCount) * 100 
        : 0;

      // Determine overall health status
      const isHealthy = externalAPIStatus.status === 'healthy' && 
                       memory.heapUsedPercentage < 90 && 
                       errorRate < 10;

      const healthData = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: this.healthMetrics.lastCheck,
        uptime: this.healthMetrics.uptime,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        node_version: process.version,
        checks: {
          externalAPI: externalAPIStatus,
          memory,
          cpu,
          metrics: {
            requestCount: this.healthMetrics.requestCount,
            errorCount: this.healthMetrics.errorCount,
            errorRate: Math.round(errorRate * 100) / 100
          }
        },
        responseTime: Date.now() - startTime
      };

      logInfo('Health check completed', {
        status: healthData.status,
        responseTime: healthData.responseTime,
        externalAPIStatus: externalAPIStatus.status
      });

      return healthData;
    } catch (error) {
      logError('Health check failed', error);
      
      return {
        status: 'unhealthy',
        timestamp: this.healthMetrics.lastCheck,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  // Simple liveness check
  getLivenessStatus() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  // Readiness check
  async getReadinessStatus() {
    try {
      const externalAPIStatus = await this.checkExternalAPI();
      const memory = this.getMemoryUsage();
      
      const isReady = externalAPIStatus.status === 'healthy' && 
                     memory.heapUsedPercentage < 95;
      
      return {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          externalAPI: externalAPIStatus.status,
          memory: memory.heapUsedPercentage < 95 ? 'ok' : 'high'
        }
      };
    } catch (error) {
      logError('Readiness check failed', error);
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

export const healthService = new HealthService();
import { CONFIG } from '../config/constants.js';
import { logInfo, logError } from '../utils/logger.js';

class HealthService {
  constructor() {
    this.healthMetrics = {
      requestCount: 0,
      errorCount: 0,
      uptime: 0,
      lastCheck: new Date().toISOString()
    };
    
    // Update uptime every minute
    setInterval(() => {
      this.healthMetrics.uptime = process.uptime();
    }, 60000);
  }

  // Increment request counter
  incrementRequestCount() {
    this.healthMetrics.requestCount++;
  }

  // Increment error counter
  incrementErrorCount() {
    this.healthMetrics.errorCount++;
  }

  // Get memory usage
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
    };
  }

  // Get CPU usage (simplified)
  getCPUUsage() {
    const usage = process.cpuUsage();
    return {
      user: usage.user,
      system: usage.system,
      percentage: Math.round(((usage.user + usage.system) / 1000000) * 100) / 100
    };
  }

  // Check external API availability
  async checkExternalAPI() {
    const startTime = Date.now();
    try {
      const response = await fetch(CONFIG.JSON_URL, {
        method: 'HEAD',
        timeout: 10000 // 10 second timeout
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        logInfo('External API health check passed', {
          url: CONFIG.JSON_URL,
          responseTime,
          status: response.status
        });
        
        return {
          status: 'healthy',
          responseTime,
          statusCode: response.status,
          lastModified: response.headers.get('last-modified')
        };
      } else {
        logError('External API health check failed', null, {
          url: CONFIG.JSON_URL,
          responseTime,
          status: response.status,
          statusText: response.statusText
        });
        
        return {
          status: 'unhealthy',
          responseTime,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logError('External API health check error', error, {
        url: CONFIG.JSON_URL,
        responseTime
      });
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }
  }

  // Comprehensive health check
  async getHealthStatus() {
    const startTime = Date.now();
    this.healthMetrics.lastCheck = new Date().toISOString();
    
    try {
      // Check external API
      const externalAPIStatus = await this.checkExternalAPI();
      
      // Get system metrics
      const memory = this.getMemoryUsage();
      const cpu = this.getCPUUsage();
      
      // Calculate error rate
      const errorRate = this.healthMetrics.requestCount > 0 
        ? (this.healthMetrics.errorCount / this.healthMetrics.requestCount) * 100 
        : 0;
      
      // Determine overall health
      const isMemoryHealthy = memory.heapUsed < 500; // Less than 500MB
      const isExternalAPIHealthy = externalAPIStatus.status === 'healthy';
      const isErrorRateHealthy = errorRate < 10; // Less than 10% error rate
      
      const isHealthy = isMemoryHealthy && isExternalAPIHealthy && isErrorRateHealthy;
      
      const healthData = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: this.healthMetrics.lastCheck,
        uptime: this.healthMetrics.uptime,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        node_version: process.version,
        checks: {
          externalAPI: externalAPIStatus,
          memory,
          cpu,
          metrics: {
            requestCount: this.healthMetrics.requestCount,
            errorCount: this.healthMetrics.errorCount,
            errorRate: Math.round(errorRate * 100) / 100
          }
        },
        responseTime: Date.now() - startTime
      };

      logInfo('Health check completed', {
        status: healthData.status,
        responseTime: healthData.responseTime,
        externalAPIStatus: externalAPIStatus.status
      });

      return healthData;
    } catch (error) {
      logError('Health check failed', error);
      
      return {
        status: 'unhealthy',
        timestamp: this.healthMetrics.lastCheck,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  // Simple liveness check
  getLivenessStatus() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}

export const healthService = new HealthService();
