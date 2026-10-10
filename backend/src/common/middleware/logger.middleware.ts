/**
 * Express/Nest middleware that logs one access record when each HTTP response
 * finishes, including method, URL, status, elapsed time, client IP, user agent,
 * and the first URL path segment.
 */
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  /**
   * Starts timing the request, registers a response-finished log callback, and
   * passes control to the next middleware/route handler.
   * @param req Express request containing method, URL, IP, and user-agent header.
   * @param res Express response used to read status and detect completion.
   * @param next Express callback that continues request processing.
   * @returns No value; the final log is emitted asynchronously on response finish.
   */
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? '';
    const start = Date.now();

    /** Logs the completed response using the captured request start time. */
    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      // Derive "module" from first URL segment, e.g. /bookings/123 -> bookings
      const segment = originalUrl.split('/').filter(Boolean)[0] ?? 'root';
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip} "${userAgent}" [module=${segment}]`,
      );
    });

    next();
  }
}
