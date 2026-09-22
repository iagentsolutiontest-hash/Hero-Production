import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Never let a raw error/stack trace reach the client. Nest HttpExceptions
 * (BadRequest, Unauthorized, Forbidden, NotFound, Conflict...) map to a
 * consistent { success:false, error:{code,message} } shape; anything else
 * (a genuine bug) becomes a generic 500 with full details only in the
 * server log, per the brief's error-handling section.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : (body as any).message || exception.message;
      response.status(status).json({
        success: false,
        error: {
          code: HttpStatus[status] || 'ERROR',
          message: Array.isArray(message) ? message.join('; ') : message,
        },
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
  }
}
