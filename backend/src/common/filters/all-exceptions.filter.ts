import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const req = http.getRequest<{ method: string; url: string }>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) {
          message = 'Validation failed'; // class-validator sends a list of messages
          errors = b.message;
        } else {
          message = b.message ?? exception.message;
        }
      }
    } else {
      // Unexpected bug: log the details, never send them to the client
      this.logger.error(
        `${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      ...(errors && { errors }),
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}