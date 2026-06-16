require('dotenv').config();

const { UnrecoverableError, Worker } = require('bullmq');
const { registerTaskOnChain } = require('../../stellar');
const { logger } = require('../logger');
const { EVENT_TYPES } = require('../queue/types');
const {
  getBullMqQueueSettings,
  getEventQueueConcurrency,
  getEventQueueName,
  getRedisConnectionOptions
} = require('../queue/redis');
const { validateFeeConfig } = require('../services/fee-engine');

function getJobEventType(job) {
  return (job && job.data && job.data.eventType) || 'unknown';
}

function getJobAttempt(job) {
  const attempts = (job && job.opts && job.opts.attempts) || 1;
  return `${((job && job.attemptsMade) || 0) + 1}/${attempts}`;
}

function getPullRequestNumber(data) {
  return data && data.payload && data.payload.pull_request && data.payload.pull_request.number;
}

async function processEventJob(job, dependencies = {}) {
  const eventType = getJobEventType(job);
  const broadcaster = dependencies.registerTaskOnChain || registerTaskOnChain;
  const jobLogger = (dependencies.logger || logger).child({
    jobId: job.id,
    eventType,
    requestId: job.data && job.data.requestId
  });

  jobLogger.info({ attempt: getJobAttempt(job) }, 'event job started');

  if (eventType !== EVENT_TYPES.GITHUB_PULL_REQUEST_MERGED) {
    throw new UnrecoverableError(`Unsupported event type: ${eventType}`);
  }

  const pullRequestNumber = getPullRequestNumber(job.data);

  if (!Number.isInteger(pullRequestNumber)) {
    throw new UnrecoverableError('Invalid event payload: missing pull request number');
  }

  await broadcaster(pullRequestNumber, { logger: jobLogger });

  return {
    pr: pullRequestNumber
  };
}

function createEventWorker(options = {}) {
  const logicalQueueName = options.queueName || getEventQueueName(options.env);
  const settings = getBullMqQueueSettings(logicalQueueName);
  const concurrency = options.concurrency || getEventQueueConcurrency(options.env);
  const connection = options.connection || getRedisConnectionOptions(options.env);

  const worker = new Worker(settings.name, job => processEventJob(job, options.dependencies), {
    concurrency,
    connection,
    prefix: settings.prefix
  });

  worker.on('completed', job => {
    logger.info({
      jobId: job.id,
      eventType: getJobEventType(job),
      attempt: job.attemptsMade + 1,
      requestId: job.data && job.data.requestId
    }, 'event job completed');
  });

  worker.on('failed', (job, error) => {
    const jobId = job ? job.id : 'unknown';
    const eventType = job ? getJobEventType(job) : 'unknown';
    const attempt = job ? `${job.attemptsMade}/${(job.opts && job.opts.attempts) || 1}` : 'unknown';
    logger.error({
      err: error,
      jobId,
      eventType,
      attempt,
      requestId: job && job.data && job.data.requestId
    }, 'event job failed');
  });

  worker.on('error', error => {
    logger.error({ err: error }, 'event worker error');
  });

  return worker;
}

async function startEventWorker() {
  validateFeeConfig();

  const queueName = getEventQueueName();
  const concurrency = getEventQueueConcurrency();
  const worker = createEventWorker({ queueName, concurrency });
  let closing = false;

  logger.info({ queueName, concurrency }, 'event worker started');

  async function shutdown(signal) {
    if (closing) {
      return;
    }

    closing = true;
    logger.info({ signal }, 'event worker shutting down');
    await worker.close();
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(error => {
      logger.error({ err: error }, 'event worker shutdown failed');
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(error => {
      logger.error({ err: error }, 'event worker shutdown failed');
      process.exit(1);
    });
  });

  return worker;
}

if (require.main === module) {
  startEventWorker().catch(error => {
    logger.error({ err: error }, 'event worker startup failed');
    process.exit(1);
  });
}

module.exports = {
  createEventWorker,
  processEventJob,
  startEventWorker
};
