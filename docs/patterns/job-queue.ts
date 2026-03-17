/**
 * Pattern: Background Job / Queue Worker
 *
 * Key principles:
 * - Jobs are idempotent — running the same job twice produces the same result
 * - Idempotency keys prevent duplicate processing
 * - Retry with exponential backoff for transient failures
 * - Dead letter queue for permanently failed jobs
 * - Minimal payloads — pass IDs, fetch fresh data in the handler
 * - Graceful shutdown — finish current job before stopping
 *
 * Agents: Thor (queue engineer), Barton (error handling), L (monitoring)
 *
 * Framework adaptations:
 *   Next.js/Node: BullMQ + Redis, or Inngest for serverless
 *   Django: Celery + Redis/RabbitMQ
 *   Rails: Sidekiq + Redis, or ActiveJob
 *   Express: BullMQ + Redis, or Agenda + MongoDB
 *
 * === Django + Celery Deep Dive ===
 *
 *   # app/tasks.py
 *   from celery import shared_task
 *   from .services import EmailService
 *
 *   @shared_task(bind=True, max_retries=3, default_retry_delay=60)
 *   def send_welcome_email(self, user_id: int):
 *       try:
 *           EmailService.send_welcome(user_id)
 *       except Exception as exc:
 *           self.retry(exc=exc)
 *
 *   # Idempotency: use task_id or a dedupe key in the DB to prevent re-processing
 *   # Dead letter: configure task_reject_on_worker_lost=True + dlx in broker
 *   # Monitoring: Flower (celery monitor) or Sentry integration
 *   # Beat scheduler: periodic tasks via django-celery-beat
 *
 * === FastAPI + ARQ Deep Dive ===
 *
 *   # app/tasks.py
 *   from arq import create_pool
 *   from arq.connections import RedisSettings
 *
 *   async def send_welcome_email(ctx, user_id: int):
 *       await EmailService.send_welcome(user_id)
 *
 *   class WorkerSettings:
 *       functions = [send_welcome_email]
 *       redis_settings = RedisSettings()
 *       max_tries = 3
 *       retry_delay = 60
 *
 *   # ARQ is async-native (matches FastAPI). Alternative: Celery still works with FastAPI.
 *   # Same principles: idempotency, retry with backoff, dead letter, monitoring.
 */

// --- Job definition (enqueue side) ---

import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

// One queue per job domain (not one per job type)
const emailQueue = new Queue('email', { connection: redis })

// Enqueue with idempotency key to prevent duplicates
export async function enqueueWelcomeEmail(userId: string) {
  await emailQueue.add(
    'welcome-email',
    { userId },  // Minimal payload — just the ID
    {
      jobId: `welcome-email:${userId}`,  // Idempotency key
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,  // 1s, 2s, 4s
      },
      removeOnComplete: { age: 86400 },  // Clean up after 24h
      removeOnFail: { age: 604800 },     // Keep failures for 7 days
    }
  )
}

// --- Job handler (worker side) ---

import { Worker } from 'bullmq'
import { db } from '@/lib/db'
import { emailService } from '@/lib/services/email'

const emailWorker = new Worker(
  'email',
  async (job) => {
    const { userId } = job.data

    // Fetch fresh data — don't trust stale payload
    const user = await db.user.findUnique({ where: { id: userId } })

    if (!user) {
      // User was deleted between enqueue and processing — skip, don't retry
      console.log(JSON.stringify({
        event: 'job.skipped',
        queue: 'email',
        job: job.name,
        jobId: job.id,
        reason: 'user_not_found',
        userId,
      }))
      return
    }

    // Idempotency check — has this already been sent?
    const alreadySent = await db.emailLog.findFirst({
      where: { userId, type: 'welcome', sentAt: { not: null } },
    })

    if (alreadySent) {
      console.log(JSON.stringify({
        event: 'job.skipped',
        queue: 'email',
        job: job.name,
        jobId: job.id,
        reason: 'already_sent',
        userId,
      }))
      return
    }

    // Do the work
    await emailService.sendWelcome(user)

    // Record that it was sent (for idempotency on retry)
    await db.emailLog.create({
      data: { userId, type: 'welcome', sentAt: new Date() },
    })

    // Structured log for monitoring (L — observability)
    console.log(JSON.stringify({
      event: 'job.completed',
      queue: 'email',
      job: job.name,
      jobId: job.id,
      userId,
      duration: Date.now() - job.timestamp,
    }))
  },
  {
    connection: redis,
    concurrency: 5,           // Max parallel jobs
    limiter: {
      max: 10,
      duration: 1000,         // Rate limit: 10 jobs/sec
    },
  }
)

// --- Error handling ---

emailWorker.on('failed', (job, error) => {
  console.error(JSON.stringify({
    event: 'job.failed',
    queue: 'email',
    job: job?.name,
    jobId: job?.id,
    attempt: job?.attemptsMade,
    maxAttempts: job?.opts.attempts,
    error: error.message,
    // If max attempts reached, this goes to the dead letter queue
    deadLettered: job?.attemptsMade === job?.opts.attempts,
  }))
})

// --- Graceful shutdown ---

async function shutdown() {
  console.log('Shutting down email worker...')
  await emailWorker.close()  // Finish current job, stop accepting new ones
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// --- Django equivalent (Celery) ---
/*
# tasks/email.py
from celery import shared_task
from django.core.mail import send_mail
from users.models import User, EmailLog

@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,  # Acknowledge after completion, not before
)
def send_welcome_email(self, user_id: str):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return  # User deleted — skip

    if EmailLog.objects.filter(user=user, type='welcome').exists():
        return  # Already sent — idempotent

    send_mail(subject='Welcome', message='...', recipient_list=[user.email])
    EmailLog.objects.create(user=user, type='welcome')
*/

// --- Rails equivalent (Sidekiq) ---
/*
# app/jobs/welcome_email_job.rb
class WelcomeEmailJob
  include Sidekiq::Job
  sidekiq_options retry: 3, queue: 'email', unique: :until_executed

  def perform(user_id)
    user = User.find_by(id: user_id)
    return unless user  # Deleted — skip

    return if EmailLog.exists?(user: user, email_type: 'welcome')  # Idempotent

    UserMailer.welcome(user).deliver_now
    EmailLog.create!(user: user, email_type: 'welcome', sent_at: Time.current)
  end
end
*/
